import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

// Tokens to fund — symbol, address, decimals, amount to send
const FUND_TOKENS = [
  { symbol: "USDC", address: "0x46ea40b1190ef2c06e7660b0fa07f28a76658336", decimals: 6, amount: "1000" },
  { symbol: "WETH", address: "0xa1811a3d805b4e71e6787936480cb226681da5ae", decimals: 18, amount: "1" },
  { symbol: "DAI", address: "0xe918e5266d250c55fdb8ccf8e427bf23bb46b90f", decimals: 18, amount: "1000" },
  { symbol: "USDT", address: "0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9", decimals: 6, amount: "1000" },
  { symbol: "LINK", address: "0xf019feed5b9c23927e562db1b81a38c553041b87", decimals: 18, amount: "100" },
  { symbol: "UNI", address: "0x008607499b9c7dff6c539ff9629450cc5ce8d0a0", decimals: 18, amount: "100" },
  { symbol: "WBTC", address: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f", decimals: 8, amount: "0.01" },
  { symbol: "AAVE", address: "0xa1f7e52301dc0201ff935e133ea7cddcee388b38", decimals: 18, amount: "10" },
  { symbol: "ARB", address: "0xc7c55a318c5c05dc5060dc28d01e8237b5057951", decimals: 18, amount: "500" },
  { symbol: "OP", address: "0xb90ace2f72be1f5a916c0b9937b70a9ee2849463", decimals: 18, amount: "500" },
  { symbol: "MKR", address: "0xb0a82cfe03ec1a6b9c6b821cefc56b6ea8dc73fa", decimals: 18, amount: "1" },
  { symbol: "DOGE", address: "0xb2b9ebf602ef3f737283697921ac25788bdcf56a", decimals: 18, amount: "5000" },
  { symbol: "SHIB", address: "0xee36d6eba0b04ce5fb4c5e7821d80df0bec620b0", decimals: 18, amount: "1000000" },
  // Official Sepolia USDC (Circle)
  { symbol: "USDC (official)", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6, amount: "5" },
];

const ETH_AMOUNT = parseUnits("0.005", 18); // 0.005 ETH for gas

export async function POST(req: NextRequest) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: "Missing PRIVATE_KEY" }, { status: 500 });
  }

  const { recipient } = await req.json();
  if (!recipient || !recipient.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = http("https://ethereum-sepolia-rpc.publicnode.com");
    const walletClient = createWalletClient({ account, chain: sepolia, transport });
    const publicClient = createPublicClient({ chain: sepolia, transport });

    let nonce = await publicClient.getTransactionCount({ address: account.address });
    const results: string[] = [];

    // Send ETH for gas
    const ethHash = await walletClient.sendTransaction({
      to: recipient as `0x${string}`,
      value: ETH_AMOUNT,
      nonce: nonce++,
    });
    results.push(`ETH: ${ethHash}`);

    // Send each token
    let tokensTransferred = 0;
    for (const token of FUND_TOKENS) {
      try {
        // Check paymaster balance first
        const bal = await publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        });

        const amount = parseUnits(token.amount, token.decimals);
        if (bal < amount) continue; // Skip if paymaster doesn't have enough

        const hash = await walletClient.writeContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipient as `0x${string}`, amount],
          nonce: nonce++,
        });
        results.push(`${token.symbol}: ${hash}`);
        tokensTransferred++;
      } catch {
        // Skip failed tokens silently
      }
    }

    return NextResponse.json({
      success: true,
      ethAmount: "0.005",
      tokensTransferred,
      transactions: results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Funding failed" }, { status: 500 });
  }
}
