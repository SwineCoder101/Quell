import { createPublicClient, createWalletClient, http, parseAbi, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const V3_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

const V3_FACTORY_ABI = parseAbi([
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
]);

const V3_POOL_ABI = parseAbi([
  "function initialize(uint160 sqrtPriceX96) external",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

const SQRT_PRICE_1_1 = 79228162514264337593543950336n;
const PRICES: Record<string, bigint> = {
  "1:1":      SQRT_PRICE_1_1,
  "1:1000":   SQRT_PRICE_1_1 * 31n,
  "1:0.001":  SQRT_PRICE_1_1 / 31n,
  "1:100":    SQRT_PRICE_1_1 * 10n,
  "1:10":     SQRT_PRICE_1_1 * 3n,
};

interface TokenInfo { address: string; symbol: string; name: string; decimals: number; }

function sortTokens(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const V3_POOL_DEFS: [string, string, number, string][] = [
  ["USDC", "WETH",  3000,  "1:1000"],
  ["USDC", "DAI",   500,   "1:1"],
  ["USDC", "USDT",  500,   "1:1"],
  ["USDC", "WBTC",  3000,  "1:1000"],
  ["USDC", "LINK",  3000,  "1:10"],
  ["WETH", "DAI",   3000,  "1:1000"],
  ["WETH", "WBTC",  3000,  "1:10"],
  ["WETH", "LINK",  3000,  "1:100"],
  ["WETH", "UNI",   3000,  "1:100"],
  ["WETH", "AAVE",  3000,  "1:10"],
  ["WETH", "ARB",   3000,  "1:1000"],
  ["WETH", "OP",    3000,  "1:1000"],
  ["WETH", "MKR",   3000,  "1:1"],
  ["WETH", "DOGE",  10000, "1:1000"],
  ["USDC", "UNI",   3000,  "1:10"],
];

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }

  const tokensFile = path.join(__dirname, "..", "artifacts", "deployed-tokens.json");
  const tokens: Record<string, TokenInfo> = JSON.parse(fs.readFileSync(tokensFile, "utf8"));

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://sepolia.base.org", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });

  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Deployer: ${account.address} (nonce: ${nonce})\n`);

  // Load existing pools
  const poolsFile = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  const results = JSON.parse(fs.readFileSync(poolsFile, "utf8"));
  const existingV3 = new Set(results.filter((r: any) => r.version === "v3").map((r: any) => `${r.pair}:${r.fee}`));

  for (const [symA, symB, fee, priceKey] of V3_POOL_DEFS) {
    const pairLabel = `${symA}/${symB}`;
    if (existingV3.has(`${pairLabel}:${fee}`)) {
      console.log(`${pairLabel} — already recorded, skip`);
      continue;
    }

    const tA = tokens[symA], tB = tokens[symB];
    const [c0, c1] = sortTokens(tA.address, tB.address);
    const isSwapped = c0.toLowerCase() !== tA.address.toLowerCase();
    const t0sym = isSwapped ? symB : symA;
    const t1sym = isSwapped ? symA : symB;

    // Check if pool already exists
    let poolAddr: string;
    try {
      poolAddr = await publicClient.readContract({
        address: V3_FACTORY as `0x${string}`,
        abi: V3_FACTORY_ABI,
        functionName: "getPool",
        args: [c0 as `0x${string}`, c1 as `0x${string}`, fee],
      }) as string;
    } catch {
      poolAddr = zeroAddress;
    }

    if (poolAddr === zeroAddress) {
      // Need to create
      console.log(`${pairLabel} — creating...`);
      try {
        const hash = await walletClient.writeContract({
          address: V3_FACTORY as `0x${string}`,
          abi: V3_FACTORY_ABI,
          functionName: "createPool",
          args: [c0 as `0x${string}`, c1 as `0x${string}`, fee],
          nonce: nonce++,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        poolAddr = await publicClient.readContract({
          address: V3_FACTORY as `0x${string}`,
          abi: V3_FACTORY_ABI,
          functionName: "getPool",
          args: [c0 as `0x${string}`, c1 as `0x${string}`, fee],
        }) as string;
        console.log(`  Created: ${poolAddr}`);
        await sleep(2000);
      } catch (err: any) {
        console.error(`  ✗ Create failed: ${err.message?.slice(0, 120)}`);
        nonce = await publicClient.getTransactionCount({ address: account.address });
        continue;
      }
    } else {
      console.log(`${pairLabel} — pool exists at ${poolAddr}`);
    }

    // Check if initialized
    try {
      const slot0 = await publicClient.readContract({
        address: poolAddr as `0x${string}`,
        abi: V3_POOL_ABI,
        functionName: "slot0",
      });
      const currentPrice = (slot0 as any)[0] as bigint;
      if (currentPrice > 0n) {
        console.log(`  Already initialized (sqrtPriceX96=${currentPrice})`);
      } else {
        // Initialize
        let sqrtPrice = PRICES[priceKey];
        if (isSwapped && priceKey !== "1:1") sqrtPrice = (2n ** 192n) / sqrtPrice;
        console.log(`  Initializing...`);
        const hash = await walletClient.writeContract({
          address: poolAddr as `0x${string}`,
          abi: V3_POOL_ABI,
          functionName: "initialize",
          args: [sqrtPrice],
          nonce: nonce++,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  ✓ Initialized (tx: ${hash})`);
        await sleep(2000);
      }
    } catch (err: any) {
      console.error(`  ✗ Init failed: ${err.message?.slice(0, 120)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
      continue;
    }

    const tickSpacing = fee === 500 ? 10 : fee === 3000 ? 60 : fee === 10000 ? 200 : 1;
    results.push({
      version: "v3",
      pair: pairLabel,
      token0: { address: c0, symbol: tokens[t0sym].symbol, decimals: tokens[t0sym].decimals },
      token1: { address: c1, symbol: tokens[t1sym].symbol, decimals: tokens[t1sym].decimals },
      fee,
      tickSpacing,
      hooks: zeroAddress,
      poolAddress: poolAddr,
      tx: "",
    });
    fs.writeFileSync(poolsFile, JSON.stringify(results, null, 2));
    console.log(`  ✓ Recorded`);
    await sleep(2000);
  }

  console.log(`\nDone! Total pools: ${results.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
