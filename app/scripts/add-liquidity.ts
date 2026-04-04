import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  parseAbi,
  maxUint256,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// ── Addresses ──
const V3_POSITION_MANAGER = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
const V4_POOL_MODIFY_TEST = "0x37429cd17cb1454c34e7f50b09725202fd533039"; // testnet helper
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// ── ABIs ──
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

const V3_NPM_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

const V4_MODIFY_ABI = parseAbi([
  "function modifyLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData) external payable returns (int256 delta0, int256 delta1)",
]);

// ── Pool data ──
interface PoolInfo {
  version: "v3" | "v4";
  pair: string;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
  tickSpacing: number;
  hooks: string;
  poolAddress?: string;
}

// ── Liquidity amounts per pair (token0 amount, token1 amount) ──
// V3 gets "base" amounts, V4 gets different amounts for variety
// Key: "TOKEN0/TOKEN1" sorted alphabetically by symbol
function getLiquidityAmounts(
  pool: PoolInfo,
  pairIndex: number, // how many times we've seen this pair
): { amount0: string; amount1: string } {
  const s0 = pool.token0.symbol;
  const s1 = pool.token1.symbol;

  // Multiplier to differentiate duplicate pairs (1x for first, 0.5x for second, 2x for third, etc)
  const multipliers = [1, 0.5, 2, 0.3, 1.5];
  const mult = multipliers[pairIndex % multipliers.length];

  // Base amounts depend on token types
  const baseAmounts: Record<string, Record<string, [number, number]>> = {
    // [token0 amount, token1 amount]
    // Stablecoin pairs
    "USDC": {
      "WETH": [5000, 2],
      "DAI": [10000, 10000],
      "USDT": [10000, 10000],
      "WBTC": [5000, 0.1],
      "LINK": [5000, 500],
      "UNI": [5000, 500],
      "AAVE": [5000, 50],
      "ARB": [5000, 5000],
      "OP": [5000, 5000],
      "SNX": [5000, 2000],
      "MKR": [5000, 3],
      "COMP": [5000, 100],
      "PEPE": [5000, 50000000],
    },
    "WETH": {
      "DAI": [2, 5000],
      "USDT": [2, 5000],
      "WBTC": [2, 0.1],
      "LINK": [2, 200],
      "UNI": [2, 200],
      "AAVE": [2, 20],
      "ARB": [2, 5000],
      "OP": [2, 5000],
      "MKR": [2, 1],
      "COMP": [2, 40],
      "CRV": [2, 5000],
      "GRT": [2, 20000],
      "LDO": [2, 3000],
      "PEPE": [2, 100000000],
      "SHIB": [2, 100000000],
      "MATIC": [2, 5000],
      "DOGE": [2, 30000],
    },
    "USDT": {
      "USDC": [10000, 10000],
    },
  };

  // Look up base amounts
  let base: [number, number] | undefined;
  if (baseAmounts[s0]?.[s1]) {
    base = baseAmounts[s0][s1];
  } else if (baseAmounts[s1]?.[s0]) {
    // Swap order
    const rev = baseAmounts[s1][s0];
    base = [rev[1], rev[0]];
  }

  if (!base) {
    // Fallback: generous defaults
    base = [1000, 1000];
  }

  const a0 = base[0] * mult;
  const a1 = base[1] * mult;

  return {
    amount0: parseUnits(a0.toString(), pool.token0.decimals).toString(),
    amount1: parseUnits(a1.toString(), pool.token1.decimals).toString(),
  };
}

// Full-range tick bounds aligned to tickSpacing
function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const MAX_TICK = 887272;
  const aligned = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return { tickLower: -aligned, tickUpper: aligned };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureApproval(
  walletClient: any,
  publicClient: any,
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
  nonce: number,
): Promise<number> {
  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [walletClient.account.address, spender],
  });

  if ((allowance as bigint) < amount) {
    const hash = await walletClient.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxUint256],
      nonce,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return nonce + 1;
  }
  return nonce;
}

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

  // Track pair occurrences for varying amounts
  const pairCount: Record<string, number> = {};

  // ── Phase 1: Approve all unique tokens to V3 NPM and V4 ModifyLiquidity ──
  console.log("=== Approving tokens ===\n");
  const uniqueTokens = new Set<string>();
  for (const p of pools) {
    uniqueTokens.add(p.token0.address.toLowerCase());
    uniqueTokens.add(p.token1.address.toLowerCase());
  }

  for (const tokenAddr of uniqueTokens) {
    const token = tokenAddr as `0x${string}`;
    // Approve to V3 Position Manager
    nonce = await ensureApproval(walletClient, publicClient, token, V3_POSITION_MANAGER as `0x${string}`, maxUint256, nonce);
    await sleep(500);
    // Approve to V4 PoolModifyLiquidityTest
    nonce = await ensureApproval(walletClient, publicClient, token, V4_POOL_MODIFY_TEST as `0x${string}`, maxUint256, nonce);
    await sleep(500);
  }
  console.log(`Approvals done (nonce: ${nonce})\n`);

  // ── Phase 2: Add V3 liquidity ──
  const v3Pools = pools.filter((p) => p.version === "v3" && p.poolAddress);
  console.log(`=== Adding liquidity to ${v3Pools.length} V3 pools ===\n`);

  for (let i = 0; i < v3Pools.length; i++) {
    const pool = v3Pools[i];
    const pairKey = [pool.token0.symbol, pool.token1.symbol].sort().join("/");
    pairCount[pairKey] = (pairCount[pairKey] || 0);
    const idx = pairCount[pairKey]++;

    const { amount0, amount1 } = getLiquidityAmounts(pool, idx);
    const { tickLower, tickUpper } = getFullRangeTicks(pool.tickSpacing);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log(`[V3 ${i + 1}/${v3Pools.length}] ${pool.pair} (idx=${idx})...`);

    try {
      const hash = await walletClient.writeContract({
        address: V3_POSITION_MANAGER as `0x${string}`,
        abi: V3_NPM_ABI,
        functionName: "mint",
        args: [
          {
            token0: pool.token0.address as `0x${string}`,
            token1: pool.token1.address as `0x${string}`,
            fee: pool.fee,
            tickLower,
            tickUpper,
            amount0Desired: BigInt(amount0),
            amount1Desired: BigInt(amount1),
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: account.address,
            deadline,
          },
        ],
        nonce: nonce++,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ tx: ${hash} (block ${receipt.blockNumber})`);
    } catch (err: any) {
      console.error(`  ✗ Failed: ${err.message?.slice(0, 150)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  }

  // ── Phase 3: Add V4 liquidity ──
  const v4Pools = pools.filter((p) => p.version === "v4");
  console.log(`\n=== Adding liquidity to ${v4Pools.length} V4 pools ===\n`);

  for (let i = 0; i < v4Pools.length; i++) {
    const pool = v4Pools[i];
    const pairKey = [pool.token0.symbol, pool.token1.symbol].sort().join("/");
    pairCount[pairKey] = (pairCount[pairKey] || 0);
    const idx = pairCount[pairKey]++;

    const { tickLower, tickUpper } = getFullRangeTicks(pool.tickSpacing);

    // For V4, we specify liquidity amount directly (not token amounts)
    // Use a reasonable liquidity value — scale based on pair type
    const baseLiquidity = 1000000000000000n; // 1e15
    const multipliers = [1n, 2n, 3n, 5n, 4n];
    const liqMultiplier = multipliers[idx % multipliers.length];
    const liquidityDelta = baseLiquidity * liqMultiplier;

    console.log(`[V4 ${i + 1}/${v4Pools.length}] ${pool.pair} (idx=${idx}, liq=${liquidityDelta})...`);

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
      console.error(`  ✗ Failed: ${err.message?.slice(0, 150)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  }

  console.log("\n=== Done! ===");
  console.log("Run `npx tsx scripts/check-pool-liquidity.ts` to verify.");
}

main().catch((err) => { console.error(err); process.exit(1); });
