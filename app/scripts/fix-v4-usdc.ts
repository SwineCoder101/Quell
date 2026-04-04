import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const V4_POOL_MODIFY_TEST = "0x0c478023803a644c94c4ce1c1e7b9a087e411b0a";

const V4_MODIFY_ABI = parseAbi([
  "function modifyLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData) external payable returns (int256 delta0, int256 delta1)",
]);

interface PoolInfo {
  version: "v3" | "v4";
  pair: string;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
  tickSpacing: number;
  hooks: string;
}

function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const MAX_TICK = 887272;
  const aligned = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return { tickLower: -aligned, tickUpper: aligned };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }

  const poolsFile = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  const pools: PoolInfo[] = JSON.parse(fs.readFileSync(poolsFile, "utf8"));

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://sepolia.base.org", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Deployer: ${account.address} (nonce: ${nonce})\n`);

  // Failed V4 pools are the ones with USDC/USDT/WBTC as currency0 (low-decimal or skewed price tokens)
  // The issue: high liquidity value + 6-decimal token + extreme price ratio = needs enormous token amounts
  // Solution: use MUCH smaller liquidity values for these pools

  const failedV4 = pools.filter((p) => {
    if (p.version !== "v4") return false;
    // Only retry pools that had USDC as a token (these all failed)
    return p.token0.symbol === "USDC" || p.token1.symbol === "USDC" ||
           p.token0.symbol === "USDT" || p.token1.symbol === "USDT" ||
           p.token0.symbol === "WBTC" || p.token1.symbol === "WBTC";
  });

  console.log(`Retrying ${failedV4.length} failed V4 pools with lower liquidity...\n`);

  // Try progressively smaller liquidity amounts until one works
  const liquidityLevels = [
    100000000n,    // 1e8
    10000000n,     // 1e7
    1000000n,      // 1e6
    100000n,       // 1e5
  ];

  const pairCount: Record<string, number> = {};

  for (let i = 0; i < failedV4.length; i++) {
    const pool = failedV4[i];
    const pairKey = [pool.token0.symbol, pool.token1.symbol].sort().join("/");
    pairCount[pairKey] = (pairCount[pairKey] || 0);
    const idx = pairCount[pairKey]++;

    const { tickLower, tickUpper } = getFullRangeTicks(pool.tickSpacing);

    // Vary salt for duplicate pairs
    const saltHex = `0x${idx.toString(16).padStart(64, "0")}` as `0x${string}`;

    console.log(`[${i + 1}/${failedV4.length}] ${pool.pair} (idx=${idx})...`);

    let succeeded = false;
    for (const liq of liquidityLevels) {
      // Vary liquidity for duplicates
      const multipliers = [1n, 2n, 3n];
      const liquidityDelta = liq * multipliers[idx % multipliers.length];

      try {
        const hash = await walletClient.writeContract({
          address: V4_POOL_MODIFY_TEST as `0x${string}`,
          abi: V4_MODIFY_ABI,
          functionName: "modifyLiquidity",
          args: [
            {
              currency0: pool.token0.address as `0x${string}`,
              currency1: pool.token1.address as `0x${string}`,
              fee: pool.fee,
              tickSpacing: pool.tickSpacing,
              hooks: (pool.hooks || zeroAddress) as `0x${string}`,
            },
            {
              tickLower,
              tickUpper,
              liquidityDelta,
              salt: saltHex,
            },
            "0x" as `0x${string}`,
          ],
          nonce: nonce++,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  ✓ liq=${liquidityDelta} tx: ${hash} (block ${receipt.blockNumber})`);
        succeeded = true;
        break;
      } catch (err: any) {
        nonce = await publicClient.getTransactionCount({ address: account.address });
        // Try smaller liquidity
      }
      await sleep(1000);
    }

    if (!succeeded) {
      console.error(`  ✗ All liquidity levels failed`);
    }
    await sleep(2000);
  }

  console.log("\n=== Done! ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
