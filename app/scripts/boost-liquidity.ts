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
import { sepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Sepolia addresses
const V3_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
const V4_POOL_MODIFY_TEST = "0x0c478023803a644c94c4ce1c1e7b9a087e411b0a";

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

const V3_NPM_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
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
  poolAddress?: string;
}

function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const MAX_TICK = 887272;
  const aligned = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return { tickLower: -aligned, tickUpper: aligned };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// We want each pool to support swapping at least 100 of either token.
// For full-range positions, we need to deposit significantly more than 100 tokens
// because liquidity is spread across the entire range.
// Deposit ~500 of each token to comfortably support 100-unit swaps.
function getDesiredAmounts(pool: PoolInfo): { amount0: bigint; amount1: bigint } {
  const base: Record<string, number> = {
    USDC: 50000,
    USDT: 50000,
    DAI: 50000,
    WETH: 500,
    WBTC: 5,
    LINK: 5000,
    UNI: 5000,
    AAVE: 500,
    ARB: 50000,
    OP: 50000,
    SNX: 5000,
    MKR: 50,
    COMP: 500,
    CRV: 50000,
    GRT: 50000,
    LDO: 50000,
    PEPE: 500000000,
    SHIB: 500000000,
    MATIC: 50000,
    DOGE: 500000,
  };

  const amt0 = base[pool.token0.symbol] || 5000;
  const amt1 = base[pool.token1.symbol] || 5000;

  return {
    amount0: parseUnits(amt0.toString(), pool.token0.decimals),
    amount1: parseUnits(amt1.toString(), pool.token1.decimals),
  };
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }

  const poolsFile = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  const pools: PoolInfo[] = JSON.parse(fs.readFileSync(poolsFile, "utf8"));

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://ethereum-sepolia-rpc.publicnode.com", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Deployer: ${account.address} (nonce: ${nonce})\n`);

  // ── Phase 1: Approve all tokens to V3 NPM and V4 test contract ──
  console.log("=== Approving tokens ===\n");
  const uniqueTokens = new Map<string, string>();
  for (const p of pools) {
    uniqueTokens.set(p.token0.address.toLowerCase(), p.token0.symbol);
    uniqueTokens.set(p.token1.address.toLowerCase(), p.token1.symbol);
  }

  for (const [addr, sym] of uniqueTokens) {
    for (const spender of [V3_POSITION_MANAGER, V4_POOL_MODIFY_TEST]) {
      const allowance = await publicClient.readContract({
        address: addr as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account.address, spender as `0x${string}`],
      });
      if ((allowance as bigint) < parseUnits("1000000", 18)) {
        const hash = await walletClient.writeContract({
          address: addr as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender as `0x${string}`, maxUint256],
          nonce: nonce++,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        await sleep(500);
      }
    }
  }
  console.log(`Approvals done (nonce: ${nonce})\n`);

  // ── Phase 2: Fund V4 test contract with tokens ──
  console.log("=== Funding V4 PoolModifyLiquidityTest ===\n");

  const v4FundAmounts: Record<string, string> = {
    USDC: "2000000", USDT: "2000000", WBTC: "20", WETH: "2000", DAI: "2000000",
    LINK: "200000", UNI: "200000", AAVE: "20000", ARB: "2000000", OP: "2000000",
    SNX: "200000", MKR: "2000", COMP: "20000", CRV: "2000000", GRT: "2000000",
    LDO: "2000000", PEPE: "2000000000", SHIB: "2000000000", MATIC: "2000000", DOGE: "20000000",
  };

  for (const [addr, sym] of uniqueTokens) {
    const tokInfo = [...pools.flatMap(p => [p.token0, p.token1])].find(t => t.address.toLowerCase() === addr);
    if (!tokInfo) continue;

    const targetAmount = parseUnits(v4FundAmounts[sym] || "100000", tokInfo.decimals);
    const currentBal = await publicClient.readContract({
      address: addr as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [V4_POOL_MODIFY_TEST as `0x${string}`],
    });

    if ((currentBal as bigint) < targetAmount) {
      const toSend = targetAmount - (currentBal as bigint);
      console.log(`${sym}: sending ${v4FundAmounts[sym] || "100000"} to test contract...`);
      try {
        const hash = await walletClient.writeContract({
          address: addr as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [V4_POOL_MODIFY_TEST as `0x${string}`, toSend],
          nonce: nonce++,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      } catch (err: any) {
        console.error(`  ✗ ${err.message?.slice(0, 100)}`);
        nonce = await publicClient.getTransactionCount({ address: account.address });
      }
      await sleep(1000);
    } else {
      console.log(`${sym}: already funded`);
    }
  }

  // ── Phase 3: Add V3 liquidity ──
  const v3Pools = pools.filter(p => p.version === "v3" && p.poolAddress);
  console.log(`\n=== Adding liquidity to ${v3Pools.length} V3 pools ===\n`);

  for (let i = 0; i < v3Pools.length; i++) {
    const pool = v3Pools[i];
    const { amount0, amount1 } = getDesiredAmounts(pool);
    const { tickLower, tickUpper } = getFullRangeTicks(pool.tickSpacing);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log(`[V3 ${i + 1}/${v3Pools.length}] ${pool.pair}...`);

    try {
      const hash = await walletClient.writeContract({
        address: V3_POSITION_MANAGER as `0x${string}`,
        abi: V3_NPM_ABI,
        functionName: "mint",
        args: [{
          token0: pool.token0.address as `0x${string}`,
          token1: pool.token1.address as `0x${string}`,
          fee: pool.fee,
          tickLower,
          tickUpper,
          amount0Desired: amount0,
          amount1Desired: amount1,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: account.address,
          deadline,
        }],
        nonce: nonce++,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ (block ${receipt.blockNumber})`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 120)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  }

  // ── Phase 4: Add V4 liquidity ──
  const v4Pools = pools.filter(p => p.version === "v4");
  console.log(`\n=== Adding liquidity to ${v4Pools.length} V4 pools ===\n`);

  // For V4 with lower-decimal tokens (USDC 6 dec, WBTC 8 dec), use smaller liquidity to avoid overflow
  function getV4Liquidity(pool: PoolInfo): bigint {
    const hasLowDecimal = pool.token0.decimals <= 8 || pool.token1.decimals <= 8;
    if (hasLowDecimal) return 10000000000n; // 1e10 for USDC/USDT/WBTC pairs
    return 100000000000000000n; // 1e17 for 18-decimal pairs
  }

  const pairCount: Record<string, number> = {};
  for (let i = 0; i < v4Pools.length; i++) {
    const pool = v4Pools[i];
    const pairKey = [pool.token0.symbol, pool.token1.symbol].sort().join("/");
    pairCount[pairKey] = (pairCount[pairKey] || 0);
    const idx = pairCount[pairKey]++;

    const { tickLower, tickUpper } = getFullRangeTicks(pool.tickSpacing);
    const baseLiq = getV4Liquidity(pool);
    const multipliers = [1n, 2n, 3n];
    const liquidityDelta = baseLiq * multipliers[idx % multipliers.length];

    // Unique salt per position
    const salt = `0x${(i + 100).toString(16).padStart(64, "0")}` as `0x${string}`;

    console.log(`[V4 ${i + 1}/${v4Pools.length}] ${pool.pair} (liq=${liquidityDelta})...`);

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
          { tickLower, tickUpper, liquidityDelta, salt },
          "0x" as `0x${string}`,
        ],
        nonce: nonce++,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ (block ${receipt.blockNumber})`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 120)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  }

  console.log("\n=== Done! Run check-pool-liquidity.ts to verify ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
