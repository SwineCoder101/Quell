import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function main() {
  const addr = "0x34b71d84DB2767342f9D03854C1df99C307a0f65" as `0x${string}`;
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

  const tokensFile = path.join(__dirname, "..", "artifacts", "deployed-tokens.json");
  const tokens = JSON.parse(fs.readFileSync(tokensFile, "utf8"));

  const ethBal = await publicClient.getBalance({ address: addr });
  console.log(`ETH: ${Number(ethBal) / 1e18}`);

  for (const [sym, info] of Object.entries(tokens) as [string, any][]) {
    const bal = await publicClient.readContract({
      address: info.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [addr],
    });
    console.log(`${sym.padEnd(6)}: ${formatUnits(bal, info.decimals)}`);
  }
}
main();
