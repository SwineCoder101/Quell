import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

async function main() {
  const pc = createPublicClient({ chain: sepolia, transport: http() });
  const addr = "0x34b71d84DB2767342f9D03854C1df99C307a0f65" as `0x${string}`;
  const bal = await pc.getBalance({ address: addr });
  const nonce = await pc.getTransactionCount({ address: addr });
  console.log("Sepolia ETH balance:", Number(bal) / 1e18);
  console.log("Nonce:", nonce);
}
main();
