import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

const testContract = "0x37429cd17cb1454c34e7f50b09725202fd533039";
const poolManager = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";

const tokens: Record<string, string> = {
  USDC: "0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9",
  USDT: "0x008607499b9c7dff6c539ff9629450cc5ce8d0a0",
  WBTC: "0xa1f7e52301dc0201ff935e133ea7cddcee388b38",
  WETH: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f",
};

async function main() {
  const pc = createPublicClient({ chain: baseSepolia, transport: http() });

  for (const [sym, addr] of Object.entries(tokens)) {
    const bal = await pc.readContract({
      address: addr as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [testContract as `0x${string}`],
    });
    const allow = await pc.readContract({
      address: addr as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [testContract as `0x${string}`, poolManager as `0x${string}`],
    });
    console.log(`${sym}: balance=${bal}, allowance_to_PM=${allow}`);
  }

  // Also check bytecode of test contract to see what it is
  const code = await pc.getCode({ address: testContract as `0x${string}` });
  console.log(`\nTest contract code length: ${code?.length || 0} bytes`);
}
main();
