import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const WALLETS_FILE = path.join(process.cwd(), "server-wallets.json");

function readWallets(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const wallets = readWallets();
  const walletAddress = wallets[userId];

  if (!walletAddress) {
    return NextResponse.json({ error: "No server wallet found" }, { status: 404 });
  }

  return NextResponse.json({ walletAddress });
}
