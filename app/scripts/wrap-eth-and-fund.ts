import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const OFFICIAL_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const SHIB = "0xee36d6eba0b04ce5fb4c5e7821d80df0bec620b0";
const V3_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";

const WETH_ABI = parseAbi([
  "function deposit() external payable",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

const V3_NPM_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

function sortTokens(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http("https://ethereum-sepolia-rpc.publicnode.com", { retryCount: 5, retryDelay: 3000 });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  let nonce = await publicClient.getTransactionCount({ address: account.address });
  const ethBal = await publicClient.getBalance({ address: account.address });
  console.log(`ETH balance: ${Number(ethBal) / 1e18}`);

  // Wrap 0.1 ETH → WETH
  const wrapAmount = parseUnits("0.1", 18);
  console.log("Wrapping 0.1 ETH → WETH...");
  const wrapHash = await walletClient.writeContract({
    address: OFFICIAL_WETH as `0x${string}`,
    abi: WETH_ABI,
    functionName: "deposit",
    value: wrapAmount,
    nonce: nonce++,
  });
  await publicClient.waitForTransactionReceipt({ hash: wrapHash });
  console.log("✓ Wrapped");
  await sleep(2000);

  // Approve WETH to NPM
  console.log("Approving WETH...");
  const approveHash = await walletClient.writeContract({
    address: OFFICIAL_WETH as `0x${string}`,
    abi: WETH_ABI,
    functionName: "approve",
    args: [V3_POSITION_MANAGER as `0x${string}`, parseUnits("1000", 18)],
    nonce: nonce++,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  await sleep(2000);

  // Add liquidity to SHIB/WETH pool
  const [c0, c1] = sortTokens(SHIB, OFFICIAL_WETH);
  const shibIsToken0 = c0.toLowerCase() === SHIB.toLowerCase();

  const shibAmount = parseUnits("500000000", 18); // 500M SHIB
  const wethAmount = parseUnits("0.05", 18); // 0.05 WETH

  const amount0 = shibIsToken0 ? shibAmount : wethAmount;
  const amount1 = shibIsToken0 ? wethAmount : shibAmount;

  const tickSpacing = 200;
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  console.log(`Adding liquidity to SHIB/WETH...`);
  try {
    const hash = await walletClient.writeContract({
      address: V3_POSITION_MANAGER as `0x${string}`,
      abi: V3_NPM_ABI,
      functionName: "mint",
      args: [{
        token0: c0 as `0x${string}`,
        token1: c1 as `0x${string}`,
        fee: 10000,
        tickLower: -maxTick,
        tickUpper: maxTick,
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
    console.log(`✓ Liquidity added (block ${receipt.blockNumber})`);
  } catch (err: any) {
    console.error(`✗ ${err.message?.slice(0, 150)}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
