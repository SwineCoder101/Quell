import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  parseAbi,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const V3_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52";
const SHIB = "0xee36d6eba0b04ce5fb4c5e7821d80df0bec620b0";
const OFFICIAL_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const OFFICIAL_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
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

  // Check balances
  const usdcBal = await publicClient.readContract({ address: OFFICIAL_USDC as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  const wethBal = await publicClient.readContract({ address: OFFICIAL_WETH as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  const shibBal = await publicClient.readContract({ address: SHIB as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });

  console.log(`USDC: ${formatUnits(usdcBal, 6)}`);
  console.log(`WETH: ${formatUnits(wethBal, 18)}`);
  console.log(`SHIB: ${formatUnits(shibBal, 18)}`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const tickSpacing = 200; // for 1% fee
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing;

  // Pool 1: SHIB/USDC — use 10 USDC + proportional SHIB
  // token0=USDC (0x1c7D...), token1=SHIB (0xee36...)
  const [usdc_c0, shib_c1_usdc] = sortTokens(OFFICIAL_USDC, SHIB);
  const usdcIsToken0 = usdc_c0.toLowerCase() === OFFICIAL_USDC.toLowerCase();

  if (usdcBal > 0n) {
    const usdcAmount = usdcBal / 2n; // Use half our USDC
    // At price 1 USDC = 50,000 SHIB: for 10 USDC we need 500,000 SHIB
    const shibForUsdc = parseUnits("500000", 18);

    const amount0 = usdcIsToken0 ? usdcAmount : shibForUsdc;
    const amount1 = usdcIsToken0 ? shibForUsdc : usdcAmount;

    console.log(`\nAdding liquidity to SHIB/USDC...`);
    console.log(`  token0 (${usdcIsToken0 ? "USDC" : "SHIB"}): ${amount0}`);
    console.log(`  token1 (${usdcIsToken0 ? "SHIB" : "USDC"}): ${amount1}`);

    try {
      const hash = await walletClient.writeContract({
        address: V3_POSITION_MANAGER as `0x${string}`,
        abi: V3_NPM_ABI,
        functionName: "mint",
        args: [{
          token0: usdc_c0 as `0x${string}`,
          token1: shib_c1_usdc as `0x${string}`,
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
      console.log(`  ✓ block ${receipt.blockNumber}`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 150)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
    await sleep(2000);
  } else {
    console.log("\nSkipping SHIB/USDC — no official USDC balance");
  }

  // Pool 2: SHIB/WETH — use available WETH + proportional SHIB
  const [shib_c0_weth, weth_c1] = sortTokens(SHIB, OFFICIAL_WETH);
  const shibIsToken0_weth = shib_c0_weth.toLowerCase() === SHIB.toLowerCase();

  if (wethBal > 0n) {
    const wethAmount = wethBal / 2n;
    const shibForWeth = parseUnits("500000000", 18); // 500M SHIB

    const amount0 = shibIsToken0_weth ? shibForWeth : wethAmount;
    const amount1 = shibIsToken0_weth ? wethAmount : shibForWeth;

    console.log(`\nAdding liquidity to SHIB/WETH...`);
    try {
      const hash = await walletClient.writeContract({
        address: V3_POSITION_MANAGER as `0x${string}`,
        abi: V3_NPM_ABI,
        functionName: "mint",
        args: [{
          token0: shib_c0_weth as `0x${string}`,
          token1: weth_c1 as `0x${string}`,
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
      console.log(`  ✓ block ${receipt.blockNumber}`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message?.slice(0, 150)}`);
      nonce = await publicClient.getTransactionCount({ address: account.address });
    }
  } else {
    console.log("\nSkipping SHIB/WETH — no official WETH balance. Wrap some ETH first.");
  }

  console.log("\n=== Done ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
