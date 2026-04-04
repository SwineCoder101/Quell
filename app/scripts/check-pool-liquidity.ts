import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const V3_POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

// V4 PoolManager holds tokens for all V4 pools
const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";

interface PoolResult {
  version: "v3" | "v4";
  pair: string;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
  poolAddress?: string;
}

async function main() {
  const poolsFile = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  const pools: PoolResult[] = JSON.parse(fs.readFileSync(poolsFile, "utf8"));

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org", { retryCount: 3, retryDelay: 2000 }),
  });

  // ── V3 POOLS ──
  const v3Pools = pools.filter((p) => p.version === "v3" && p.poolAddress);
  console.log(`=== V3 Pools (${v3Pools.length}) ===\n`);
  console.log(
    "Pair".padEnd(16) +
    "Liquidity".padEnd(14) +
    "Token0 Bal".padEnd(22) +
    "Token1 Bal".padEnd(22) +
    "Pool Address"
  );
  console.log("-".repeat(100));

  for (const pool of v3Pools) {
    try {
      const [liquidity, bal0, bal1] = await Promise.all([
        publicClient.readContract({
          address: pool.poolAddress as `0x${string}`,
          abi: V3_POOL_ABI,
          functionName: "liquidity",
        }),
        publicClient.readContract({
          address: pool.token0.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [pool.poolAddress as `0x${string}`],
        }),
        publicClient.readContract({
          address: pool.token1.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [pool.poolAddress as `0x${string}`],
        }),
      ]);

      const fmt0 = formatUnits(bal0, pool.token0.decimals);
      const fmt1 = formatUnits(bal1, pool.token1.decimals);

      console.log(
        pool.pair.padEnd(16) +
        String(liquidity).padEnd(14) +
        `${fmt0} ${pool.token0.symbol}`.padEnd(22) +
        `${fmt1} ${pool.token1.symbol}`.padEnd(22) +
        pool.poolAddress
      );
    } catch (err: any) {
      console.log(pool.pair.padEnd(16) + `Error: ${err.message?.slice(0, 60)}`);
    }
  }

  // ── V4 POOLS ──
  const v4Pools = pools.filter((p) => p.version === "v4");
  console.log(`\n=== V4 Pools (${v4Pools.length}) ===`);
  console.log(`V4 tokens are held by PoolManager: ${POOL_MANAGER}\n`);

  // Gather all unique tokens from V4 pools
  const v4Tokens = new Map<string, { symbol: string; decimals: number }>();
  for (const pool of v4Pools) {
    v4Tokens.set(pool.token0.address.toLowerCase(), { symbol: pool.token0.symbol, decimals: pool.token0.decimals });
    v4Tokens.set(pool.token1.address.toLowerCase(), { symbol: pool.token1.symbol, decimals: pool.token1.decimals });
  }

  console.log("Token".padEnd(8) + "PoolManager Balance".padEnd(30) + "Address");
  console.log("-".repeat(70));

  for (const [addr, info] of v4Tokens) {
    try {
      const bal = await publicClient.readContract({
        address: addr as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [POOL_MANAGER as `0x${string}`],
      });
      const fmt = formatUnits(bal, info.decimals);
      console.log(info.symbol.padEnd(8) + `${fmt}`.padEnd(30) + addr);
    } catch (err: any) {
      console.log(info.symbol.padEnd(8) + `Error: ${err.message?.slice(0, 50)}`);
    }
  }

  // V4 per-pool info
  console.log(`\nV4 Pool List:`);
  console.log("Pair".padEnd(16) + "Fee".padEnd(8) + "Tick".padEnd(6) + "Tokens");
  console.log("-".repeat(60));
  for (const pool of v4Pools) {
    console.log(
      pool.pair.padEnd(16) +
      String(pool.fee).padEnd(8) +
      String((pool as any).tickSpacing).padEnd(6) +
      `${pool.token0.symbol} / ${pool.token1.symbol}`
    );
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
