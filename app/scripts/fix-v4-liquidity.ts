import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const V4_POOL_MODIFY_TEST = "0x0c478023803a644c94c4ce1c1e7b9a087e411b0a";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

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

  // Find V4 pools that failed (USDC-related ones)
  const failedPools = pools.filter((p) => {
    if (p.version !== "v4") return false;
    const s0 = p.token0.symbol;
    const s1 = p.token1.symbol;
    // These are the ones that failed — USDC as one of the tokens but not the WETH-paired ones that worked
    return (s0 === "USDC" || s1 === "USDC") ||
           (s0 === "USDT" && s1 === "WETH") || (s0 === "WETH" && s1 === "USDT") ||
           (s0 === "WBTC" || s1 === "WBTC");
  });

  // Actually, let's just check which V4 pools have zero liquidity by checking token balances
  // Simpler: re-attempt all failed V4 pools by pre-funding the test contract

  // Read token addresses from artifact and fund the test contract
  const tokensArtifact = path.join(__dirname, "..", "artifacts", "deployed-tokens.json");
  const allTokens: Record<string, { address: string; decimals: number }> = JSON.parse(fs.readFileSync(tokensArtifact, "utf8"));
  const fundAmounts: Record<string, string> = {
    USDC: "500000", USDT: "500000", WBTC: "10", WETH: "50", DAI: "500000",
    LINK: "50000", UNI: "50000", AAVE: "5000", ARB: "500000", OP: "500000",
    SNX: "50000", MKR: "500", COMP: "5000", CRV: "500000", GRT: "500000",
    LDO: "500000", PEPE: "500000000", SHIB: "500000000", MATIC: "500000", DOGE: "5000000",
  };
  const tokensToFund: Record<string, { address: string; decimals: number; amount: string }> = {};
  for (const [sym, info] of Object.entries(allTokens)) {
    tokensToFund[sym] = { address: info.address, decimals: info.decimals, amount: fundAmounts[sym] || "100000" };
  }

  console.log("=== Funding PoolModifyLiquidityTest contract ===\n");

  for (const [sym, info] of Object.entries(tokensToFund)) {
    // Check current balance of test contract
    const bal = await publicClient.readContract({
      address: info.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [V4_POOL_MODIFY_TEST as `0x${string}`],
    });

    if (bal > 0n) {
      console.log(`${sym}: already funded (${bal})`);
      continue;
    }

    const amount = parseUnits(info.amount, info.decimals);
    console.log(`${sym}: transferring ${info.amount}...`);
    try {
      const hash = await walletClient.writeContract({
        address: info.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [V4_POOL_MODIFY_TEST as `0x${string}`, amount],
        nonce: nonce++,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 100)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(1000);
  }

  // Now retry failed V4 pools
  const v4Pools = pools.filter((p) => p.version === "v4");
  console.log(`\n=== Retrying ${v4Pools.length} V4 pools ===\n`);

  // Track pair occurrence for varying liquidity
  const pairCount: Record<string, number> = {};

  for (let i = 0; i < v4Pools.length; i++) {
    const pool = v4Pools[i];
    const pairKey = [pool.token0.symbol, pool.token1.symbol].sort().join("/");
    pairCount[pairKey] = (pairCount[pairKey] || 0);
    const idx = pairCount[pairKey]++;

    const { tickLower, tickUpper } = getFullRangeTicks(pool.tickSpacing);

    // Vary liquidity for duplicate pairs
    const baseLiq = 1000000000000000n;
    const multipliers = [1n, 2n, 3n, 5n, 4n];
    const liquidityDelta = baseLiq * multipliers[idx % multipliers.length];

    console.log(`[${i + 1}/${v4Pools.length}] ${pool.pair} (idx=${idx})...`);

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
            salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
          },
          "0x" as `0x${string}`,
        ],
        nonce: nonce++,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ tx: ${hash} (block ${receipt.blockNumber})`);
    } catch (err: any) {
      const msg = err.message?.slice(0, 150) || "unknown";
      if (msg.includes("already")) {
        console.log(`  - Already has liquidity, skipping`);
      } else {
        console.error(`  ✗ Failed: ${msg}`);
      }
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  }

  console.log("\n=== Done! ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
