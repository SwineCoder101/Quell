import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { TOKEN_LIST } from "@/lib/token-config";

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
    let tokensTransferred = 0;
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const token of TOKEN_LIST) {
      try {
        const bal = await publicClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        });

        // Send 2% of paymaster's balance
        const amount = bal / BigInt(50);
        if (amount === BigInt(0)) {
          skipped.push(`${token.symbol} (paymaster balance: 0)`);
          continue;
        }

        const hash = await walletClient.writeContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipient as `0x${string}`, amount],
          nonce: nonce++,
        });
        results.push(`${token.symbol}: ${formatUnits(amount, token.decimals)} (tx: ${hash})`);
        tokensTransferred++;
      } catch (err: any) {
        failed.push(`${token.symbol}: ${err.message || "unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      tokensTransferred,
      transactions: results,
      skipped,
      failed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Funding failed" }, { status: 500 });
  }
}
