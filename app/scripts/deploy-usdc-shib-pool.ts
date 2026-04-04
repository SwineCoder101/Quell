import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  parseAbi,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Official Sepolia USDC (Circle)
const OFFICIAL_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`;
// Mocked SHIB (deployed by us)
const SHIB_TOKEN = "0xea79f42fddd4f60b8690df944aacd2545a34f086" as `0x${string}`;

// V3 Sepolia contracts
const V3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as `0x${string}`;
const V3_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52" as `0x${string}`;

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

// USDC (0x1c...) < SHIB (0xea...) so USDC is token0, SHIB is token1
// Price: 1 SHIB = $0.00002, 1 USDC = $1
// token1 per token0 = SHIB per USDC = 50,000

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

  // ── Step 1: Check balances ──
  console.log("=== Checking token balances ===\n");
  const usdcBal = await publicClient.readContract({
    address: OFFICIAL_USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  const shibBal = await publicClient.readContract({
    address: SHIB_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`USDC balance: ${Number(usdcBal) / 1e6}`);
  console.log(`SHIB balance: ${Number(shibBal) / 1e18}`);

  if (usdcBal < parseUnits("30", 6)) {
    console.error("Insufficient USDC balance — need at least 30 USDC");
    process.exit(1);
  }
  if (shibBal < parseUnits("1000000", 18)) {
    console.error("Insufficient SHIB balance — need at least 1,000,000 SHIB");
    process.exit(1);
  }

  // ── Step 2: Approve tokens to V3 Position Manager ──
  console.log("\n=== Approving tokens ===\n");
  for (const addr of [OFFICIAL_USDC, SHIB_TOKEN]) {
    const allowance = await publicClient.readContract({
      address: addr,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, V3_POSITION_MANAGER],
    });
    if ((allowance as bigint) < parseUnits("1000000", 18)) {
      console.log(`Approving ${addr}...`);
      const hash = await walletClient.writeContract({
        address: addr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [V3_POSITION_MANAGER, maxUint256],
        nonce: nonce++,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await sleep(1000);
    }
  }

  // ── Step 3: Create and initialize pool ──
  // USDC is token0 (0x1c < 0xea), SHIB is token1
  const token0 = OFFICIAL_USDC;
  const token1 = SHIB_TOKEN;
  const fee = 10000; // 1% fee for meme tokens
  const tickSpacing = 200;

  console.log("\n=== Creating USDC/SHIB V3 pool ===\n");

  // Check if pool already exists
  const existingPool = await publicClient.readContract({
    address: V3_FACTORY,
    abi: V3_FACTORY_ABI,
    functionName: "getPool",
    args: [token0, token1, fee],
  });

  let poolAddress: string;

  if (existingPool !== "0x0000000000000000000000000000000000000000") {
    console.log(`Pool already exists: ${existingPool}`);
    poolAddress = existingPool as string;
  } else {
    const createHash = await walletClient.writeContract({
      address: V3_FACTORY,
      abi: V3_FACTORY_ABI,
      functionName: "createPool",
      args: [token0, token1, fee],
      nonce: nonce++,
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });
    await sleep(2000);

    poolAddress = (await publicClient.readContract({
      address: V3_FACTORY,
      abi: V3_FACTORY_ABI,
      functionName: "getPool",
      args: [token0, token1, fee],
    })) as string;
    console.log(`Pool created: ${poolAddress}`);

    // Initialize with price: SHIB per USDC = 50,000
    // USDC decimals = 6, SHIB decimals = 18
    const sqrtPrice = calcSqrtPriceX96(50000, 6, 18);
    console.log(`sqrtPriceX96: ${sqrtPrice}`);

    const initHash = await walletClient.writeContract({
      address: poolAddress as `0x${string}`,
      abi: V3_POOL_ABI,
      functionName: "initialize",
      args: [sqrtPrice],
      nonce: nonce++,
    });
    await publicClient.waitForTransactionReceipt({ hash: initHash });
    console.log("Pool initialized");
    await sleep(2000);
  }

  // ── Step 4: Add liquidity — 30 USDC + 1,000,000 SHIB ──
  console.log("\n=== Adding liquidity (30 USDC + 1,000,000 SHIB) ===\n");

  const { tickLower, tickUpper } = getFullRangeTicks(tickSpacing);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const amount0 = parseUnits("30", 6);       // 30 USDC
  const amount1 = parseUnits("1000000", 18);  // 1,000,000 SHIB

  try {
    const hash = await walletClient.writeContract({
      address: V3_POSITION_MANAGER,
      abi: V3_NPM_ABI,
      functionName: "mint",
      args: [{
        token0,
        token1,
        fee,
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
    console.log(`Liquidity added (block ${receipt.blockNumber})`);
  } catch (err: any) {
    console.error(`Failed to add liquidity: ${err.message?.slice(0, 200)}`);
    process.exit(1);
  }

  // ── Results ──
  console.log("\n=== Results ===\n");
  console.log(`Pool: USDC/SHIB`);
  console.log(`Pool address: ${poolAddress}`);
  console.log(`Token0 (USDC): ${OFFICIAL_USDC}`);
  console.log(`Token1 (SHIB): ${SHIB_TOKEN}`);
  console.log(`Fee: ${fee} (1%)`);
  console.log(`Liquidity: 30 USDC + 1,000,000 SHIB`);
  console.log(`\nAdd to pool-config.ts as a V3 pool with poolAddress: "${poolAddress}"`);
}

main().catch((err) => { console.error(err); process.exit(1); });
