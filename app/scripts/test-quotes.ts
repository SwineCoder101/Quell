import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const UNISWAP_API = "https://trade-api.gateway.uniswap.org/v1";
const API_KEY = process.env.UNISWAP_API_KEY;
const SWAPPER = "0x34b71d84DB2767342f9D03854C1df99C307a0f65";

interface PoolInfo {
  version: "v3" | "v4";
  pair: string;
  token0: { address: string; symbol: string; decimals: number };
  token1: { address: string; symbol: string; decimals: number };
  fee: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function testQuote(pool: PoolInfo): Promise<{ pool: string; version: string; status: string; detail?: string }> {
  // Use a small amount relative to token0 decimals
  const amount = pool.token0.decimals === 6
    ? "1000000"       // 1 USDC/USDT
    : pool.token0.decimals === 8
      ? "100000"      // 0.001 WBTC
      : "1000000000000000"; // 0.001 ETH/token (18 dec)

  const body = {
    swapper: SWAPPER,
    tokenIn: pool.token0.address,
    tokenOut: pool.token1.address,
    tokenInChainId: 11155111,
    tokenOutChainId: 11155111,
    amount,
    type: "EXACT_INPUT",
    routingPreference: "BEST_PRICE",
    slippageTolerance: 0.5,
  };

  try {
    const res = await fetch(`${UNISWAP_API}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY!,
        "x-universal-router-version": "2.0",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      const routing = data.routing || "unknown";
      return { pool: pool.pair, version: pool.version, status: `OK (${routing})` };
    } else {
      return {
        pool: pool.pair,
        version: pool.version,
        status: `FAIL ${res.status}`,
        detail: data.detail || data.errorCode || JSON.stringify(data).slice(0, 80),
      };
    }
  } catch (err: any) {
    return { pool: pool.pair, version: pool.version, status: "ERROR", detail: err.message?.slice(0, 80) };
  }
}

async function main() {
  if (!API_KEY) {
    console.error("Missing UNISWAP_API_KEY");
    process.exit(1);
  }

  const poolsFile = path.join(__dirname, "..", "artifacts", "deployed-pools.json");
  const pools: PoolInfo[] = JSON.parse(fs.readFileSync(poolsFile, "utf8"));

  // Deduplicate by pair+version (skip duplicate fee tiers for readability)
  const seen = new Set<string>();
  const uniquePools: PoolInfo[] = [];
  for (const p of pools) {
    const key = `${p.version}:${p.token0.address}:${p.token1.address}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePools.push(p);
    }
  }

  console.log(`Testing ${uniquePools.length} unique pool quotes against Uniswap Trading API\n`);
  console.log(
    "Version".padEnd(8) +
    "Pair".padEnd(18) +
    "Status".padEnd(22) +
    "Detail"
  );
  console.log("-".repeat(90));

  let ok = 0;
  let fail = 0;

  for (const pool of uniquePools) {
    const result = await testQuote(pool);

    const statusColor = result.status.startsWith("OK") ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(
      result.version.toUpperCase().padEnd(8) +
      result.pool.padEnd(18) +
      `${statusColor}${result.status.padEnd(22)}${reset}` +
      (result.detail || "")
    );

    if (result.status.startsWith("OK")) ok++;
    else fail++;

    // Rate limit — Uniswap API has limits
    await sleep(300);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${ok} OK, ${fail} FAILED out of ${uniquePools.length} pools`);

  // Also test with well-known Base Sepolia tokens (not our custom ones)
  console.log(`\n--- Control test: known Base Sepolia tokens ---\n`);

  const knownTokens = [
    { name: "Native ETH/USDC (Sepolia)", tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", amount: "1000000000000000" },
    { name: "WETH/USDC (Sepolia known)", tokenIn: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", amount: "1000000000000000" },
  ];

  for (const t of knownTokens) {
    try {
      const res = await fetch(`${UNISWAP_API}/quote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "x-universal-router-version": "2.0",
        },
        body: JSON.stringify({
          swapper: SWAPPER,
          tokenIn: t.tokenIn,
          tokenOut: t.tokenOut,
          tokenInChainId: 11155111,
          tokenOutChainId: 11155111,
          amount: t.amount,
          type: "EXACT_INPUT",
          routingPreference: "BEST_PRICE",
          slippageTolerance: 0.5,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`${t.name}: \x1b[32mOK (${data.routing})\x1b[0m`);
      } else {
        console.log(`${t.name}: \x1b[31mFAIL - ${data.detail || data.errorCode}\x1b[0m`);
      }
    } catch (err: any) {
      console.log(`${t.name}: \x1b[31mERROR - ${err.message?.slice(0, 80)}\x1b[0m`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
