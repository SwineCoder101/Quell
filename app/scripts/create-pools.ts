import { createPublicClient, createWalletClient, http, parseAbi, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// V4
const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";
const POSITION_MANAGER = "0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// V3
const V3_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const V3_POSITION_MANAGER = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
const V3_SWAP_ROUTER = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
const V3_QUOTER = "0xC5290058841028F1614F3A6F0F5816cAd0df5E27";

const V4_POOL_MANAGER_ABI = parseAbi([
  "function initialize((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) external returns (int24 tick)",
]);

const V3_FACTORY_ABI = parseAbi([
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
]);

const V3_POOL_ABI = parseAbi([
  "function initialize(uint160 sqrtPriceX96) external",
]);

// 1:1 price = sqrt(1) * 2^96
const SQRT_PRICE_1_1 = 79228162514264337593543950336n;

const PRICES = {
  "1:1":      SQRT_PRICE_1_1,
  "1:1000":   SQRT_PRICE_1_1 * 31n,
  "1:0.001":  SQRT_PRICE_1_1 / 31n,
  "1:100":    SQRT_PRICE_1_1 * 10n,
  "1:10":     SQRT_PRICE_1_1 * 3n,
};

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

function sortTokens(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PoolDef = [string, string, number, number, keyof typeof PRICES];

// V3 pools (15 pools) — fee tiers: 500, 3000, 10000. tickSpacing is determined by factory.
const V3_POOL_DEFS: PoolDef[] = [
  ["USDC", "WETH",  3000,  60,  "1:1000"],
  ["USDC", "DAI",   500,   10,  "1:1"],
  ["USDC", "USDT",  500,   10,  "1:1"],
  ["USDC", "WBTC",  3000,  60,  "1:1000"],
  ["USDC", "LINK",  3000,  60,  "1:10"],
  ["WETH", "DAI",   3000,  60,  "1:1000"],
  ["WETH", "WBTC",  3000,  60,  "1:10"],
  ["WETH", "LINK",  3000,  60,  "1:100"],
  ["WETH", "UNI",   3000,  60,  "1:100"],
  ["WETH", "AAVE",  3000,  60,  "1:10"],
  ["WETH", "ARB",   3000,  60,  "1:1000"],
  ["WETH", "OP",    3000,  60,  "1:1000"],
  ["WETH", "MKR",   3000,  60,  "1:1"],
  ["WETH", "DOGE",  10000, 200, "1:1000"],
  ["USDC", "UNI",   3000,  60,  "1:10"],
];

// V4 pools (30 pools)
const V4_POOL_DEFS: PoolDef[] = [
  ["USDC", "WETH",  3000,  60,  "1:1000"],
  ["USDC", "DAI",   100,   1,   "1:1"],
  ["USDC", "USDT",  100,   1,   "1:1"],
  ["USDC", "WBTC",  3000,  60,  "1:1000"],
  ["USDC", "LINK",  3000,  60,  "1:10"],
  ["USDC", "UNI",   3000,  60,  "1:10"],
  ["USDC", "AAVE",  3000,  60,  "1:100"],
  ["USDC", "ARB",   3000,  60,  "1:1"],
  ["USDC", "OP",    3000,  60,  "1:1"],
  ["USDC", "SNX",   3000,  60,  "1:1"],
  ["WETH", "DAI",   3000,  60,  "1:1000"],
  ["WETH", "USDT",  3000,  60,  "1:1000"],
  ["WETH", "WBTC",  3000,  60,  "1:10"],
  ["WETH", "LINK",  3000,  60,  "1:100"],
  ["WETH", "UNI",   3000,  60,  "1:100"],
  ["WETH", "AAVE",  3000,  60,  "1:10"],
  ["WETH", "ARB",   500,   10,  "1:1000"],
  ["WETH", "OP",    500,   10,  "1:1000"],
  ["WETH", "MKR",   3000,  60,  "1:1"],
  ["WETH", "COMP",  3000,  60,  "1:10"],
  ["WETH", "CRV",   3000,  60,  "1:1000"],
  ["WETH", "GRT",   3000,  60,  "1:1000"],
  ["WETH", "LDO",   3000,  60,  "1:1000"],
  ["WETH", "PEPE",  10000, 200, "1:0.001"],
  ["WETH", "SHIB",  10000, 200, "1:0.001"],
  ["WETH", "MATIC", 3000,  60,  "1:1000"],
  ["WETH", "DOGE",  3000,  60,  "1:1000"],
  ["USDC", "MKR",   3000,  60,  "1:1000"],
  ["USDC", "COMP",  3000,  60,  "1:100"],
  ["USDC", "PEPE",  10000, 200, "1:0.001"],
];

interface PoolResult {
  version: "v3" | "v4";
  pair: string;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
  tickSpacing: number;
  hooks: string;
  poolAddress?: string; // V3 has an address, V4 is managed by PoolManager
  tx: string;
}

function getPrice(priceKey: keyof typeof PRICES, isSwapped: boolean): bigint {
  let sqrtPrice = PRICES[priceKey];
  if (isSwapped && priceKey !== "1:1") {
    sqrtPrice = (2n ** 192n) / sqrtPrice;
  }
  return sqrtPrice;
}

function resolveTokenPair(
  symA: string,
  symB: string,
  tokens: Record<string, TokenInfo>,
) {
  const tokenA = tokens[symA];
  const tokenB = tokens[symB];
  const [currency0, currency1] = sortTokens(tokenA.address, tokenB.address);
  const isSwapped = currency0.toLowerCase() !== tokenA.address.toLowerCase();
  const t0sym = isSwapped ? symB : symA;
  const t1sym = isSwapped ? symA : symB;
  return { tokenA, tokenB, currency0, currency1, isSwapped, t0sym, t1sym };
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Missing PRIVATE_KEY");
    process.exit(1);
  }

  const tokensPath = path.join(__dirname, "..", "artifacts", "deployed-tokens.json");
  if (!fs.existsSync(tokensPath)) {
    console.error("Run deploy-tokens.ts first!");
    process.exit(1);
  }

  const tokens: Record<string, TokenInfo> = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://sepolia.base.org", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });

  // Track nonce explicitly to avoid desync with flaky RPC
  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Deployer: ${account.address} (nonce: ${nonce})\n`);

  // Load existing results for resume
  const outPath = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  let results: PoolResult[] = [];
  const created = new Set<string>();
  if (fs.existsSync(outPath)) {
    results = JSON.parse(fs.readFileSync(outPath, "utf8"));
    for (const r of results) created.add(`${r.version}:${r.pair}:${r.fee}`);
    if (results.length > 0) console.log(`Resuming — ${results.length} pools already created\n`);
  }

  // ── V3 POOLS ──────────────────────────────────────────────────
  console.log(`=== Creating ${V3_POOL_DEFS.length} V3 pools on Factory ${V3_FACTORY} ===\n`);

  for (let i = 0; i < V3_POOL_DEFS.length; i++) {
    const [symA, symB, fee, , priceKey] = V3_POOL_DEFS[i];
    if (!tokens[symA] || !tokens[symB]) { console.error(`Token not found: ${symA}/${symB}`); continue; }

    const { currency0, currency1, isSwapped, t0sym, t1sym } = resolveTokenPair(symA, symB, tokens);
    const pairLabel = `${symA}/${symB}`;
    const key = `v3:${pairLabel}:${fee}`;
    if (created.has(key)) { console.log(`[V3 ${i + 1}/${V3_POOL_DEFS.length}] ${pairLabel} — skipped (exists)`); continue; }
    console.log(`[V3 ${i + 1}/${V3_POOL_DEFS.length}] ${pairLabel} (fee=${fee})...`);

    try {
      // Create pool via factory
      const createHash = await walletClient.writeContract({
        address: V3_FACTORY as `0x${string}`,
        abi: V3_FACTORY_ABI,
        functionName: "createPool",
        args: [currency0 as `0x${string}`, currency1 as `0x${string}`, fee],
        nonce: nonce++,
      });
      await publicClient.waitForTransactionReceipt({ hash: createHash });
      await sleep(2000);

      // Get the pool address
      const poolAddress = await publicClient.readContract({
        address: V3_FACTORY as `0x${string}`,
        abi: V3_FACTORY_ABI,
        functionName: "getPool",
        args: [currency0 as `0x${string}`, currency1 as `0x${string}`, fee],
      });

      // Initialize the pool with a starting price
      const sqrtPrice = getPrice(priceKey, isSwapped);
      const initHash = await walletClient.writeContract({
        address: poolAddress as `0x${string}`,
        abi: V3_POOL_ABI,
        functionName: "initialize",
        args: [sqrtPrice],
        nonce: nonce++,
      });
      await publicClient.waitForTransactionReceipt({ hash: initHash });

      console.log(`  ✓ pool: ${poolAddress} (tx: ${createHash})`);
      results.push({
        version: "v3",
        pair: pairLabel,
        token0: { address: currency0, symbol: tokens[t0sym].symbol, decimals: tokens[t0sym].decimals },
        token1: { address: currency1, symbol: tokens[t1sym].symbol, decimals: tokens[t1sym].decimals },
        fee,
        tickSpacing: fee === 500 ? 10 : fee === 3000 ? 60 : fee === 10000 ? 200 : 1,
        hooks: zeroAddress,
        poolAddress: poolAddress as string,
        tx: createHash,
      });
      // Save after each success for resume
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    } catch (err: any) {
      console.error(`  ✗ Failed: ${err.message?.slice(0, 150)}`);
      // Re-sync nonce after failure
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(3000);
  }

  // ── V4 POOLS ──────────────────────────────────────────────────
  console.log(`\n=== Creating ${V4_POOL_DEFS.length} V4 pools on PoolManager ${POOL_MANAGER} ===\n`);

  for (let i = 0; i < V4_POOL_DEFS.length; i++) {
    const [symA, symB, fee, tickSpacing, priceKey] = V4_POOL_DEFS[i];
    if (!tokens[symA] || !tokens[symB]) { console.error(`Token not found: ${symA}/${symB}`); continue; }

    const { currency0, currency1, isSwapped, t0sym, t1sym } = resolveTokenPair(symA, symB, tokens);
    const sqrtPrice = getPrice(priceKey, isSwapped);
    const pairLabel = `${symA}/${symB}`;
    const key = `v4:${pairLabel}:${fee}`;
    if (created.has(key)) { console.log(`[V4 ${i + 1}/${V4_POOL_DEFS.length}] ${pairLabel} — skipped (exists)`); continue; }
    console.log(`[V4 ${i + 1}/${V4_POOL_DEFS.length}] ${pairLabel} (fee=${fee}, tick=${tickSpacing})...`);

    try {
      const hash = await walletClient.writeContract({
        address: POOL_MANAGER as `0x${string}`,
        abi: V4_POOL_MANAGER_ABI,
        functionName: "initialize",
        args: [
          {
            currency0: currency0 as `0x${string}`,
            currency1: currency1 as `0x${string}`,
            fee,
            tickSpacing,
            hooks: zeroAddress,
          },
          sqrtPrice,
        ],
        nonce: nonce++,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ tx: ${hash} (block ${receipt.blockNumber})`);

      results.push({
        version: "v4",
        pair: pairLabel,
        token0: { address: currency0, symbol: tokens[t0sym].symbol, decimals: tokens[t0sym].decimals },
        token1: { address: currency1, symbol: tokens[t1sym].symbol, decimals: tokens[t1sym].decimals },
        fee,
        tickSpacing,
        hooks: zeroAddress,
        tx: hash,
      });
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    } catch (err: any) {
      console.error(`  ✗ Failed: ${err.message?.slice(0, 150)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(3000);
  }

  // ── WRITE OUTPUTS ──────────────────────────────────────────────
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  const v3Pools = results.filter((r) => r.version === "v3");
  const v4Pools = results.filter((r) => r.version === "v4");

  const configPath = path.join(__dirname, "..", "src", "lib", "pool-config.ts");
  const tsContent = `// Auto-generated by scripts/create-pools.ts — do not edit manually

// V3 contracts
export const V3_FACTORY_ADDRESS = "${V3_FACTORY}" as \`0x\${string}\`;
export const V3_SWAP_ROUTER_ADDRESS = "${V3_SWAP_ROUTER}" as \`0x\${string}\`;
export const V3_POSITION_MANAGER_ADDRESS = "${V3_POSITION_MANAGER}" as \`0x\${string}\`;
export const V3_QUOTER_ADDRESS = "${V3_QUOTER}" as \`0x\${string}\`;

// V4 contracts
export const V4_POOL_MANAGER_ADDRESS = "${POOL_MANAGER}" as \`0x\${string}\`;
export const V4_POSITION_MANAGER_ADDRESS = "${POSITION_MANAGER}" as \`0x\${string}\`;
export const PERMIT2_ADDRESS = "${PERMIT2}" as \`0x\${string}\`;

export interface PoolConfig {
  version: "v3" | "v4";
  pair: string;
  token0: { address: \`0x\${string}\`; symbol: string; decimals: number };
  token1: { address: \`0x\${string}\`; symbol: string; decimals: number };
  fee: number;
  tickSpacing: number;
  hooks: \`0x\${string}\`;
  poolAddress?: \`0x\${string}\`;
}

export const V3_POOLS: PoolConfig[] = [
${v3Pools.map((r) => `  {
    version: "v3",
    pair: "${r.pair}",
    token0: { address: "${r.token0.address}" as \`0x\${string}\`, symbol: "${r.token0.symbol}", decimals: ${r.token0.decimals} },
    token1: { address: "${r.token1.address}" as \`0x\${string}\`, symbol: "${r.token1.symbol}", decimals: ${r.token1.decimals} },
    fee: ${r.fee},
    tickSpacing: ${r.tickSpacing},
    hooks: "${r.hooks}" as \`0x\${string}\`,
    poolAddress: "${r.poolAddress}" as \`0x\${string}\`,
  },`).join("\n")}
];

export const V4_POOLS: PoolConfig[] = [
${v4Pools.map((r) => `  {
    version: "v4",
    pair: "${r.pair}",
    token0: { address: "${r.token0.address}" as \`0x\${string}\`, symbol: "${r.token0.symbol}", decimals: ${r.token0.decimals} },
    token1: { address: "${r.token1.address}" as \`0x\${string}\`, symbol: "${r.token1.symbol}", decimals: ${r.token1.decimals} },
    fee: ${r.fee},
    tickSpacing: ${r.tickSpacing},
    hooks: "${r.hooks}" as \`0x\${string}\`,
  },`).join("\n")}
];

export const ALL_POOLS: PoolConfig[] = [...V3_POOLS, ...V4_POOLS];

/** Look up pools by token symbol */
export function getPoolsForToken(symbol: string): PoolConfig[] {
  return ALL_POOLS.filter(
    (p) => p.token0.symbol === symbol || p.token1.symbol === symbol
  );
}

/** Get unique token list from all pools */
export function getPoolTokens(): Array<{ address: \`0x\${string}\`; symbol: string; decimals: number }> {
  const seen = new Set<string>();
  const tokens: Array<{ address: \`0x\${string}\`; symbol: string; decimals: number }> = [];
  for (const pool of ALL_POOLS) {
    for (const t of [pool.token0, pool.token1]) {
      if (!seen.has(t.address)) {
        seen.add(t.address);
        tokens.push(t);
      }
    }
  }
  return tokens;
}
`;
  fs.writeFileSync(configPath, tsContent);

  console.log(`\nDone! ${v3Pools.length} V3 + ${v4Pools.length} V4 = ${results.length} pools created.`);
  console.log(`  Artifact: artifacts/deployed-pools.json`);
  console.log(`  Frontend: src/lib/pool-config.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
