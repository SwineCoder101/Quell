import { NextRequest, NextResponse } from "next/server";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import { ThresholdSignatureScheme } from "@dynamic-labs-wallet/core";
import fs from "fs";
import path from "path";

const DYNAMIC_ENV_ID = process.env.DYNAMIC_ENVIRONMENT_ID || process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
const DYNAMIC_TOKEN = process.env.DYNAMIC_AUTH_TOKEN || process.env.NEXT_PUBLIC_DYNAMIC_AUTH_TOKEN;
const WALLET_PWD = process.env.WALLET_PASSWORD || process.env.NEXT_WALLET_PASSWORD;
const WALLETS_FILE = path.join(process.cwd(), "server-wallets.json");

function readWallets(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeWallets(wallets: Record<string, string>) {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
}

export async function POST(req: NextRequest) {
  if (!DYNAMIC_TOKEN || !DYNAMIC_ENV_ID) {
    return NextResponse.json(
      { error: "Server not configured for Dynamic wallet operations" },
      { status: 500 }
    );
  }

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Check if wallet already exists for this user
  const wallets = readWallets();
  if (wallets[userId]) {
    return NextResponse.json({ walletAddress: wallets[userId], existing: true });
  }

  try {
    const evmClient = new DynamicEvmWalletClient({
      environmentId: DYNAMIC_ENV_ID,
      enableMPCAccelerator: false,
    });
    await evmClient.authenticateApiToken(DYNAMIC_TOKEN);

    const wallet = await evmClient.createWalletAccount({
      thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
      password: WALLET_PWD,
      onError: (error: Error) => {
        console.error("Server wallet creation error:", error);
      },
      backUpToClientShareService: true,
    });

    console.log("Server wallet created:", wallet.accountAddress, "walletId:", wallet.walletId);

    // Store mapping
    wallets[userId] = wallet.accountAddress;
    writeWallets(wallets);

    return NextResponse.json({
      walletAddress: wallet.accountAddress,
      existing: false,
    });
  } catch (err: any) {
    console.error("Wallet creation failed:", err);
    return NextResponse.json(
      { error: err.message || "Wallet creation failed" },
      { status: 500 }
    );
  }
}
