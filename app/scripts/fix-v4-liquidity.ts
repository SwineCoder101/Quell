import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const V4_POOL_MODIFY_TEST = "0x37429cd17cb1454c34e7f50b09725202fd533039";

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
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });

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

  // First, send a generous amount of each token to the PoolModifyLiquidityTest contract
  const tokensToFund: Record<string, { address: string; decimals: number; amount: string }> = {
    USDC: { address: "0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9", decimals: 6, amount: "500000" },
    USDT: { address: "0x008607499b9c7dff6c539ff9629450cc5ce8d0a0", decimals: 6, amount: "500000" },
    WBTC: { address: "0xa1f7e52301dc0201ff935e133ea7cddcee388b38", decimals: 8, amount: "10" },
    WETH: { address: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f", decimals: 18, amount: "50" },
    DAI:  { address: "0xf019feed5b9c23927e562db1b81a38c553041b87", decimals: 18, amount: "500000" },
    LINK: { address: "0xc7c55a318c5c05dc5060dc28d01e8237b5057951", decimals: 18, amount: "50000" },
    UNI:  { address: "0xb90ace2f72be1f5a916c0b9937b70a9ee2849463", decimals: 18, amount: "50000" },
    AAVE: { address: "0xa99e1994f37397a1c174d20acc9147869460ece6", decimals: 18, amount: "5000" },
    ARB:  { address: "0xb0a82cfe03ec1a6b9c6b821cefc56b6ea8dc73fa", decimals: 18, amount: "500000" },
    OP:   { address: "0xb687b48ed8b3a367ca23b4f365b3568e2a8da0d9", decimals: 18, amount: "500000" },
    SNX:  { address: "0x89596c433ea951750c9e165d827f77e1b9c225f9", decimals: 18, amount: "50000" },
    MKR:  { address: "0xe7e7fb85a33ce518c39df92ab6a7cebe55cd0b6c", decimals: 18, amount: "500" },
    COMP: { address: "0x9c462dbd59ff0675b31970d11bb3ae93e7283681", decimals: 18, amount: "5000" },
    CRV:  { address: "0x12e2b23b99429c7738ec3dc4682ddc437a3a3fd5", decimals: 18, amount: "500000" },
    GRT:  { address: "0xea79f42fddd4f60b8690df944aacd2545a34f086", decimals: 18, amount: "500000" },
    LDO:  { address: "0x06d530d52c9949fb13c6a062e9b4941cbc25b60d", decimals: 18, amount: "500000" },
    PEPE: { address: "0xb2b9ebf602ef3f737283697921ac25788bdcf56a", decimals: 18, amount: "500000000" },
    SHIB: { address: "0x8c645f07a0727a28774bc7afd1ea5e1cd8083a1f", decimals: 18, amount: "500000000" },
    MATIC:{ address: "0x8637576850b339d41cda9559dc6c10992dc7acc5", decimals: 18, amount: "500000" },
    DOGE: { address: "0x7a7d8d490df543f093f296bb76beb56cdbb683cb", decimals: 18, amount: "5000000" },
  };

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
