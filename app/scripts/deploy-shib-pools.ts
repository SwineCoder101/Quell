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
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "MockERC20.json"), "utf8"));

// Official Sepolia tokens
const OFFICIAL_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const OFFICIAL_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
// No official USDT on Sepolia with liquidity, use our deployed one
// Actually let's check if Aave has one

// V3 Sepolia contracts
const V3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
const V3_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const V3_FACTORY_ABI = parseAbi([
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
]);

const V3_POOL_ABI = parseAbi([
  "function initialize(uint160 sqrtPriceX96) external",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

const V3_NPM_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Realistic prices in USD
// SHIB ≈ $0.00002, USDC = $1, WETH ≈ $2500
// SHIB/USDC: 1 USDC = 50,000 SHIB → price = 0.00002 USDC per SHIB
// SHIB/WETH: 1 WETH = 125,000,000 SHIB → price = 0.000000008 WETH per SHIB

function sortTokens(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function calcSqrtPriceX96(priceToken1PerToken0: number, dec0: number, dec1: number): bigint {
  const priceRaw = priceToken1PerToken0 * Math.pow(10, dec1 - dec0);
  const sqrtPrice = Math.sqrt(priceRaw);
  const TWO_96 = 2n ** 96n;
  if (sqrtPrice >= 1) {
    return (BigInt(Math.floor(sqrtPrice * 1e18)) * TWO_96) / BigInt(1e18);
  }
  return (BigInt(Math.floor(sqrtPrice * 1e30)) * TWO_96) / BigInt(1e30);
}

function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const MAX_TICK = 887272;
  const aligned = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return { tickLower: -aligned, tickUpper: aligned };
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://ethereum-sepolia-rpc.publicnode.com", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Deployer: ${account.address} (nonce: ${nonce})\n`);

  // ── Step 1: Deploy SHIB token ──
  console.log("=== Deploying Shiba Inu (SHIB) token ===\n");
  const shibSupply = parseUnits("1000000000000", 18); // 1 trillion
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: ["Shiba Inu", "SHIB", 18, shibSupply],
    nonce: nonce++,
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const SHIB_ADDRESS = deployReceipt.contractAddress!;
  console.log(`SHIB deployed: ${SHIB_ADDRESS}\n`);
  await sleep(2000);

  // ── Step 2: Check official token balances ──
  console.log("=== Checking official token balances ===\n");
  for (const [name, addr] of [["USDC", OFFICIAL_USDC], ["WETH", OFFICIAL_WETH]]) {
    const bal = await publicClient.readContract({
      address: addr as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    const dec = await publicClient.readContract({
      address: addr as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    console.log(`${name}: balance = ${Number(bal) / Math.pow(10, Number(dec))}`);
  }

  // ── Step 3: Approve tokens to V3 Position Manager ──
  console.log("\n=== Approving tokens ===\n");
  for (const addr of [SHIB_ADDRESS, OFFICIAL_USDC, OFFICIAL_WETH]) {
    const allowance = await publicClient.readContract({
      address: addr as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, V3_POSITION_MANAGER as `0x${string}`],
    });
    if ((allowance as bigint) < parseUnits("1000000", 18)) {
      console.log(`Approving ${addr}...`);
      const hash = await walletClient.writeContract({
        address: addr as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [V3_POSITION_MANAGER as `0x${string}`, maxUint256],
        nonce: nonce++,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await sleep(1000);
    }
  }

  // ── Step 4: Create and initialize pools ──
  const pools = [
    {
      name: "SHIB/USDC",
      tokenA: SHIB_ADDRESS,
      tokenB: OFFICIAL_USDC,
      decA: 18,
      decB: 6,
      fee: 10000, // 1% for meme tokens
      // Price: 1 SHIB = 0.00002 USDC
      // If SHIB is token0: price = USDC_per_SHIB = 0.00002
      // If USDC is token0: price = SHIB_per_USDC = 50000
    },
    {
      name: "SHIB/WETH",
      tokenA: SHIB_ADDRESS,
      tokenB: OFFICIAL_WETH,
      decA: 18,
      decB: 18,
      fee: 10000,
      // Price: 1 SHIB = 0.000000008 WETH (1 WETH = 125M SHIB)
      // If SHIB is token0: price = WETH_per_SHIB = 0.000000008
      // If WETH is token0: price = SHIB_per_WETH = 125000000
    },
  ];

  console.log("\n=== Creating V3 pools ===\n");

  const createdPools: Array<{
    name: string;
    poolAddress: string;
    token0: string;
    token1: string;
    fee: number;
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
  }> = [];

  for (const pool of pools) {
    const [c0, c1] = sortTokens(pool.tokenA, pool.tokenB);
    const shibIsToken0 = c0.toLowerCase() === SHIB_ADDRESS.toLowerCase();
    const sym0 = shibIsToken0 ? "SHIB" : (c0.toLowerCase() === OFFICIAL_USDC.toLowerCase() ? "USDC" : "WETH");
    const sym1 = shibIsToken0 ? (c1.toLowerCase() === OFFICIAL_USDC.toLowerCase() ? "USDC" : "WETH") : "SHIB";
    const dec0 = shibIsToken0 ? 18 : pool.decB;
    const dec1 = shibIsToken0 ? pool.decB : 18;

    console.log(`Creating ${pool.name} (token0=${sym0}, token1=${sym1})...`);

    // Create pool
    const createHash = await walletClient.writeContract({
      address: V3_FACTORY as `0x${string}`,
      abi: V3_FACTORY_ABI,
      functionName: "createPool",
      args: [c0 as `0x${string}`, c1 as `0x${string}`, pool.fee],
      nonce: nonce++,
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });
    await sleep(2000);

    // Get pool address
    const poolAddress = await publicClient.readContract({
      address: V3_FACTORY as `0x${string}`,
      abi: V3_FACTORY_ABI,
      functionName: "getPool",
      args: [c0 as `0x${string}`, c1 as `0x${string}`, pool.fee],
    });
    console.log(`  Pool: ${poolAddress}`);

    // Calculate sqrtPriceX96
    // price = token1_per_token0
    let priceToken1PerToken0: number;
    if (pool.name === "SHIB/USDC") {
      if (shibIsToken0) {
        priceToken1PerToken0 = 0.00002; // USDC per SHIB
      } else {
        priceToken1PerToken0 = 50000; // SHIB per USDC
      }
    } else {
      // SHIB/WETH
      if (shibIsToken0) {
        priceToken1PerToken0 = 0.000000008; // WETH per SHIB
      } else {
        priceToken1PerToken0 = 125000000; // SHIB per WETH
      }
    }

    const sqrtPrice = calcSqrtPriceX96(priceToken1PerToken0, dec0, dec1);
    console.log(`  sqrtPriceX96: ${sqrtPrice}`);

    // Initialize pool
    const initHash = await walletClient.writeContract({
      address: poolAddress as `0x${string}`,
      abi: V3_POOL_ABI,
      functionName: "initialize",
      args: [sqrtPrice],
      nonce: nonce++,
    });
    await publicClient.waitForTransactionReceipt({ hash: initHash });
    console.log(`  ✓ Initialized`);
    await sleep(2000);

    createdPools.push({
      name: pool.name,
      poolAddress: poolAddress as string,
      token0: c0,
      token1: c1,
      fee: pool.fee,
      token0Symbol: sym0,
      token1Symbol: sym1,
      token0Decimals: dec0,
      token1Decimals: dec1,
    });
  }

  // ── Step 5: Add liquidity ──
  console.log("\n=== Adding liquidity ===\n");

  for (const pool of createdPools) {
    const { tickLower, tickUpper } = getFullRangeTicks(200); // tickSpacing for 1% fee
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Determine amounts
    let amount0: bigint;
    let amount1: bigint;

    if (pool.token0Symbol === "SHIB") {
      // SHIB is token0
      amount0 = parseUnits("500000000", 18); // 500M SHIB
      if (pool.token1Symbol === "USDC") {
        amount1 = parseUnits("10000", 6); // 10K USDC
      } else {
        amount1 = parseUnits("4", 18); // 4 WETH
      }
    } else if (pool.token1Symbol === "SHIB") {
      // SHIB is token1
      amount1 = parseUnits("500000000", 18); // 500M SHIB
      if (pool.token0Symbol === "USDC") {
        amount0 = parseUnits("10000", 6); // 10K USDC
      } else {
        amount0 = parseUnits("4", 18); // 4 WETH
      }
    } else {
      continue;
    }

    console.log(`Adding liquidity to ${pool.name}...`);
    console.log(`  ${pool.token0Symbol}: ${amount0}, ${pool.token1Symbol}: ${amount1}`);

    try {
      const hash = await walletClient.writeContract({
        address: V3_POSITION_MANAGER as `0x${string}`,
        abi: V3_NPM_ABI,
        functionName: "mint",
        args: [{
          token0: pool.token0 as `0x${string}`,
          token1: pool.token1 as `0x${string}`,
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
      console.log(`  ✓ Liquidity added (block ${receipt.blockNumber})`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 150)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  }

  // ── Step 6: Output results ──
  console.log("\n=== Results ===\n");
  console.log(`SHIB token: ${SHIB_ADDRESS}`);
  console.log(`Official USDC: ${OFFICIAL_USDC}`);
  console.log(`Official WETH: ${OFFICIAL_WETH}`);
  for (const p of createdPools) {
    console.log(`Pool ${p.name}: ${p.poolAddress} (fee: ${p.fee})`);
  }

  console.log("\nAdd these to your token-config.ts and pool-config.ts:");
  console.log(`\nSHIB address: "${SHIB_ADDRESS}"`);
  console.log(`Official USDC: "${OFFICIAL_USDC}"`);
  console.log(`Official WETH: "${OFFICIAL_WETH}"`);
}

main().catch((err) => { console.error(err); process.exit(1); });
