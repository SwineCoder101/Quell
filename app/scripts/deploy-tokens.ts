import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "MockERC20.json"), "utf8"));

const TOKEN_DEFS = [
  { name: "USD Coin",                    symbol: "USDC",  decimals: 6,  supply: "10000000" },
  { name: "Wrapped Ether",               symbol: "WETH",  decimals: 18, supply: "10000" },
  { name: "Dai Stablecoin",              symbol: "DAI",   decimals: 18, supply: "10000000" },
  { name: "Tether USD",                  symbol: "USDT",  decimals: 6,  supply: "10000000" },
  { name: "Wrapped BTC",                 symbol: "WBTC",  decimals: 8,  supply: "500" },
  { name: "Chainlink",                   symbol: "LINK",  decimals: 18, supply: "1000000" },
  { name: "Uniswap",                     symbol: "UNI",   decimals: 18, supply: "1000000" },
  { name: "Aave",                        symbol: "AAVE",  decimals: 18, supply: "100000" },
  { name: "Arbitrum",                    symbol: "ARB",   decimals: 18, supply: "10000000" },
  { name: "Optimism",                    symbol: "OP",    decimals: 18, supply: "10000000" },
  { name: "Synthetix",                   symbol: "SNX",   decimals: 18, supply: "1000000" },
  { name: "Maker",                       symbol: "MKR",   decimals: 18, supply: "10000" },
  { name: "Compound",                    symbol: "COMP",  decimals: 18, supply: "100000" },
  { name: "Curve DAO Token",             symbol: "CRV",   decimals: 18, supply: "10000000" },
  { name: "The Graph",                   symbol: "GRT",   decimals: 18, supply: "10000000" },
  { name: "Lido DAO",                    symbol: "LDO",   decimals: 18, supply: "10000000" },
  { name: "Pepe",                        symbol: "PEPE",  decimals: 18, supply: "1000000000000" },
  { name: "Shiba Inu",                   symbol: "SHIB",  decimals: 18, supply: "1000000000000" },
  { name: "Polygon",                     symbol: "MATIC", decimals: 18, supply: "10000000" },
  { name: "Dogecoin",                    symbol: "DOGE",  decimals: 18, supply: "100000000" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deployWithRetry(
  walletClient: any,
  publicClient: any,
  args: any[],
  retries = 3,
): Promise<{ hash: string; address: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const hash = await walletClient.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode as `0x${string}`,
        args,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, address: receipt.contractAddress! };
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.log(`    Attempt ${attempt} failed, retrying in 3s...`);
      await sleep(3000);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Missing PRIVATE_KEY");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://sepolia.base.org", {
    batch: false,
    retryCount: 3,
    retryDelay: 2000,
  });

  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });

  console.log(`Deployer: ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH balance: ${Number(balance) / 1e18}`);

  if (balance === 0n) {
    console.error("No ETH for gas. Fund the deployer first.");
    process.exit(1);
  }

  // Load any previously deployed tokens (resume support)
  const outPath = path.join(__dirname, "..", "artifacts", "deployed-tokens.json");
  let deployed: Record<string, { address: string; symbol: string; name: string; decimals: number }> = {};
  if (fs.existsSync(outPath)) {
    deployed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const existing = Object.keys(deployed);
    if (existing.length > 0) {
      console.log(`Resuming — already deployed: ${existing.join(", ")}`);
    }
  }

  for (const token of TOKEN_DEFS) {
    if (deployed[token.symbol]) {
      console.log(`\nSkipping ${token.symbol} (already deployed at ${deployed[token.symbol].address})`);
      continue;
    }

    const supply = parseUnits(token.supply, token.decimals);

    console.log(`\nDeploying ${token.symbol}...`);
    const { hash, address } = await deployWithRetry(walletClient, publicClient, [
      token.name, token.symbol, token.decimals, supply,
    ]);
    console.log(`  ${token.symbol}: ${address} (tx: ${hash})`);

    deployed[token.symbol] = {
      address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
    };

    // Save after each deploy so we can resume
    fs.writeFileSync(outPath, JSON.stringify(deployed, null, 2));

    // Throttle to avoid RPC rate limits
    await sleep(1500);
  }

  // Generate frontend config
  const configPath = path.join(__dirname, "..", "src", "lib", "token-config.ts");
  const entries = Object.values(deployed);
  const tsContent = `// Auto-generated by scripts/deploy-tokens.ts — do not edit manually
export interface TokenConfig {
  address: \`0x\${string}\`;
  symbol: string;
  name: string;
  decimals: number;
}

export const DEPLOYED_TOKENS: Record<string, TokenConfig> = {
${entries.map((t) => `  ${t.symbol}: {
    address: "${t.address}" as \`0x\${string}\`,
    symbol: "${t.symbol}",
    name: "${t.name}",
    decimals: ${t.decimals},
  },`).join("\n")}
} as const;

export const TOKEN_LIST: TokenConfig[] = Object.values(DEPLOYED_TOKENS);
`;
  fs.writeFileSync(configPath, tsContent);
  console.log(`\nAll ${entries.length} tokens deployed!`);
  console.log(`  Artifact: artifacts/deployed-tokens.json`);
  console.log(`  Frontend: src/lib/token-config.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
