import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const V3_SWAP_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

const V3_POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)",
]);

interface PoolInfo {
  version: "v3" | "v4";
  pair: string;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
  poolAddress?: string;
}

// Realistic USD prices
const USD_PRICES: Record<string, number> = {
  USDC: 1,
  USDT: 1,
  DAI: 1,
  WETH: 2500,
  WBTC: 65000,
  LINK: 15,
  UNI: 8,
  AAVE: 200,
  ARB: 1,
  OP: 2,
  MKR: 1500,
  DOGE: 0.15,
  SNX: 2,
  COMP: 50,
  CRV: 0.50,
  GRT: 0.25,
  LDO: 2,
  PEPE: 0.00001,
  SHIB: 0.00002,
  MATIC: 0.50,
};

/**
 * Calculate the correct sqrtPriceX96 for a pair.
 * sqrtPriceX96 = sqrt(price_raw) * 2^96
 * price_raw = P * 10^(d1 - d0)
 * where P = usd_price_token0 / usd_price_token1
 *       (i.e. how many human token1 per 1 human token0)
 */
function targetSqrtPriceX96(
  sym0: string, dec0: number,
  sym1: string, dec1: number,
): bigint {
  const p0 = USD_PRICES[sym0] || 1;
  const p1 = USD_PRICES[sym1] || 1;

  // P = how many token1 per 1 token0 (human units)
  const P = p0 / p1;

  // price_raw = P * 10^(d1-d0)
  const decDiff = dec1 - dec0;
  const priceRaw = P * Math.pow(10, decDiff);

  // sqrtPriceX96 = sqrt(priceRaw) * 2^96
  const sqrtPrice = Math.sqrt(priceRaw);
  const TWO_96 = 2n ** 96n;

  // Convert to bigint carefully to avoid precision loss
  // Split into integer and fractional parts
  if (sqrtPrice >= 1) {
    // For large values, multiply then convert
    const scaled = BigInt(Math.floor(sqrtPrice * 1e18));
    return (scaled * TWO_96) / BigInt(1e18);
  } else {
    // For small values
    const scaled = BigInt(Math.floor(sqrtPrice * 1e30));
    return (scaled * TWO_96) / BigInt(1e30);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Min/max sqrtPriceX96 for Uniswap V3
const MIN_SQRT_RATIO = 4295128739n + 1n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n - 1n;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }

  const poolsFile = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  const pools: PoolInfo[] = JSON.parse(fs.readFileSync(poolsFile, "utf8"));
  const v3Pools = pools.filter(p => p.version === "v3" && p.poolAddress);

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://ethereum-sepolia-rpc.publicnode.com", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Deployer: ${account.address} (nonce: ${nonce})\n`);

  // Ensure all tokens approved to SwapRouter
  console.log("=== Ensuring approvals to SwapRouter ===\n");
  const uniqueTokens = new Set<string>();
  for (const p of v3Pools) {
    uniqueTokens.add(p.token0.address.toLowerCase());
    uniqueTokens.add(p.token1.address.toLowerCase());
  }
  for (const addr of uniqueTokens) {
    const allowance = await publicClient.readContract({
      address: addr as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, V3_SWAP_ROUTER as `0x${string}`],
    });
    if ((allowance as bigint) < parseUnits("1000000", 18)) {
      const hash = await walletClient.writeContract({
        address: addr as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [V3_SWAP_ROUTER as `0x${string}`, maxUint256],
        nonce: nonce++,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await sleep(500);
    }
  }
  console.log("Approvals done.\n");

  // Rebalance each V3 pool
  console.log(`=== Rebalancing ${v3Pools.length} V3 pools ===\n`);

  for (let i = 0; i < v3Pools.length; i++) {
    const pool = v3Pools[i];
    const { token0, token1 } = pool;

    // Get current price
    const slot0 = await publicClient.readContract({
      address: pool.poolAddress as `0x${string}`,
      abi: V3_POOL_ABI,
      functionName: "slot0",
    });
    const currentSqrtPrice = (slot0 as any)[0] as bigint;

    // Calculate target price
    const target = targetSqrtPriceX96(token0.symbol, token0.decimals, token1.symbol, token1.decimals);

    const priceDiffPct = Number((currentSqrtPrice * 10000n / target) - 10000n) / 100;

    console.log(`[${i + 1}/${v3Pools.length}] ${pool.pair}`);
    console.log(`  Current: ${currentSqrtPrice}`);
    console.log(`  Target:  ${target}`);
    console.log(`  Diff:    ${priceDiffPct > 0 ? "+" : ""}${priceDiffPct.toFixed(1)}%`);

    if (Math.abs(priceDiffPct) < 1) {
      console.log(`  - Already balanced, skip\n`);
      continue;
    }

    // Determine swap direction:
    // If current price too high (too much token1 per token0), we need to swap token1→token0 to lower it
    // If current price too low, swap token0→token1 to raise it
    let tokenIn: string;
    let tokenOut: string;
    let sqrtPriceLimit: bigint;

    if (currentSqrtPrice > target) {
      // Price too high → swap token1 for token0 (sell token1)
      tokenIn = token1.address;
      tokenOut = token0.address;
      sqrtPriceLimit = target < MIN_SQRT_RATIO ? MIN_SQRT_RATIO : target;
    } else {
      // Price too low → swap token0 for token1 (sell token0)
      tokenIn = token0.address;
      tokenOut = token1.address;
      sqrtPriceLimit = target > MAX_SQRT_RATIO ? MAX_SQRT_RATIO : target;
    }

    // Use a large swap amount — the sqrtPriceLimitX96 will stop us at the target
    const swapToken = currentSqrtPrice > target ? token1 : token0;
    const swapAmount = parseUnits("500000", swapToken.decimals);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log(`  Swapping ${swapToken.symbol} → ${currentSqrtPrice > target ? token0.symbol : token1.symbol}...`);

    try {
      const hash = await walletClient.writeContract({
        address: V3_SWAP_ROUTER as `0x${string}`,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [{
          tokenIn: tokenIn as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
          fee: pool.fee,
          recipient: account.address,
          amountIn: swapAmount,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: sqrtPriceLimit,
        }],
        nonce: nonce++,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Verify new price
      const newSlot0 = await publicClient.readContract({
        address: pool.poolAddress as `0x${string}`,
        abi: V3_POOL_ABI,
        functionName: "slot0",
      });
      const newPrice = (newSlot0 as any)[0] as bigint;
      const newDiffPct = Number((newPrice * 10000n / target) - 10000n) / 100;
      console.log(`  ✓ New price: ${newPrice} (${newDiffPct > 0 ? "+" : ""}${newDiffPct.toFixed(1)}% from target)`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 120)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    console.log();
    await sleep(2000);
  }

  console.log("=== Done! ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
