import { createPublicClient, http, parseAbi, encodeFunctionData, decodeFunctionResult } from "viem";
import { baseSepolia } from "viem/chains";

const testContract = "0x37429cd17cb1454c34e7f50b09725202fd533039";
const poolManager = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";

// Check: does PoolModifyLiquidityTest approve PoolManager in constructor?
// Or does it rely on unlock callback?
// Let's try a static call to see the exact revert

const pc = createPublicClient({ chain: baseSepolia, transport: http() });

const V4_MODIFY_ABI = parseAbi([
  "function modifyLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData) external payable returns (int256 delta0, int256 delta1)",
]);

// Try a working pool (WETH/LINK) and a failing pool (USDC/WETH) to compare
async function main() {
  // USDC = 0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9
  // WETH = 0x2d3f715022a81c39b102fafe5d3d119561e6e38f
  // In pool: USDC is currency0 (lower address), WETH is currency1

  // Try simulating the failing USDC/WETH pool
  try {
    await pc.simulateContract({
      address: testContract as `0x${string}`,
      abi: V4_MODIFY_ABI,
      functionName: "modifyLiquidity",
      args: [
        {
          currency0: "0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9", // USDC
          currency1: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f", // WETH
          fee: 3000,
          tickSpacing: 60,
          hooks: "0x0000000000000000000000000000000000000000",
        },
        {
          tickLower: -887220,
          tickUpper: 887220,
          liquidityDelta: 1000000000000000n,
          salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        },
        "0x" as `0x${string}`,
      ],
      account: "0x34b71d84DB2767342f9D03854C1df99C307a0f65",
    });
    console.log("USDC/WETH: simulation succeeded!");
  } catch (err: any) {
    console.log("USDC/WETH simulation failed:", err.message?.slice(0, 300));
  }

  // Now try WETH/LINK which works
  try {
    await pc.simulateContract({
      address: testContract as `0x${string}`,
      abi: V4_MODIFY_ABI,
      functionName: "modifyLiquidity",
      args: [
        {
          currency0: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f", // WETH
          currency1: "0xc7c55a318c5c05dc5060dc28d01e8237b5057951", // LINK
          fee: 3000,
          tickSpacing: 60,
          hooks: "0x0000000000000000000000000000000000000000",
        },
        {
          tickLower: -887220,
          tickUpper: 887220,
          liquidityDelta: 100000n, // tiny amount
          salt: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
        },
        "0x" as `0x${string}`,
      ],
      account: "0x34b71d84DB2767342f9D03854C1df99C307a0f65",
    });
    console.log("WETH/LINK: simulation succeeded!");
  } catch (err: any) {
    console.log("WETH/LINK simulation failed:", err.message?.slice(0, 300));
  }

  // Check: does USDC have 6 decimals causing the liquidity amount to require more tokens than available?
  // With 1e15 liquidity and full range, USDC (6 decimals) would need a LOT of tokens
  // Let's try with much smaller liquidity
  try {
    await pc.simulateContract({
      address: testContract as `0x${string}`,
      abi: V4_MODIFY_ABI,
      functionName: "modifyLiquidity",
      args: [
        {
          currency0: "0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9", // USDC
          currency1: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f", // WETH
          fee: 3000,
          tickSpacing: 60,
          hooks: "0x0000000000000000000000000000000000000000",
        },
        {
          tickLower: -887220,
          tickUpper: 887220,
          liquidityDelta: 1000n, // very tiny
          salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        },
        "0x" as `0x${string}`,
      ],
      account: "0x34b71d84DB2767342f9D03854C1df99C307a0f65",
    });
    console.log("USDC/WETH (tiny liq): simulation succeeded!");
  } catch (err: any) {
    console.log("USDC/WETH (tiny liq) failed:", err.message?.slice(0, 300));
  }
}

main();
