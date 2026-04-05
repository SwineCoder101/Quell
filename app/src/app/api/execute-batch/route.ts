import { NextRequest, NextResponse } from "next/server";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { sepolia } from "viem/chains";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

async function getEvmClient() {
  const client = new DynamicEvmWalletClient({
    environmentId: process.env.DYNAMIC_ENVIRONMENT_ID!,
    enableMPCAccelerator: false,
  });
  await client.authenticateApiToken(process.env.DYNAMIC_AUTH_TOKEN!);
  return client;
}

export async function POST(req: NextRequest) {
  if (!process.env.DYNAMIC_AUTH_TOKEN || !process.env.DYNAMIC_ENVIRONMENT_ID) {
    return NextResponse.json(
      { error: "Server not configured for Dynamic wallet operations" },
      { status: 500 }
    );
  }

  const { walletAddress, calls } = await req.json();

  if (!walletAddress || !Array.isArray(calls) || calls.length === 0) {
    return NextResponse.json(
      { error: "Missing walletAddress or calls" },
      { status: 400 }
    );
  }

  try {
    const evmClient = await getEvmClient();
    const transport = http(RPC_URL);
    const publicClient = createPublicClient({ chain: sepolia, transport });
    const broadcastClient = createWalletClient({ chain: sepolia, transport });

    let nonce = await publicClient.getTransactionCount({
      address: walletAddress as `0x${string}`,
    });

    const txHashes: string[] = [];

    for (const call of calls) {
      const preparedTx = await publicClient.prepareTransactionRequest({
        to: call.to as `0x${string}`,
        data: call.data as `0x${string}`,
        value: BigInt(call.value || "0"),
        account: walletAddress as `0x${string}`,
        chain: sepolia,
        nonce,
      });

      const signedTx = await evmClient.signTransaction({
        senderAddress: walletAddress,
        transaction: preparedTx,
        password: process.env.WALLET_PASSWORD,
      });

      const txHash = await broadcastClient.sendRawTransaction({
        serializedTransaction: signedTx as `0x${string}`,
      });

      txHashes.push(txHash);
      nonce++;
    }

    return NextResponse.json({ success: true, txHashes });
  } catch (err: any) {
    console.error("Batch execution error:", err);
    return NextResponse.json(
      { error: err.message || "Batch execution failed" },
      { status: 500 }
    );
  }
}
