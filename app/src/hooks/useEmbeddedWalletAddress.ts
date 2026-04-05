"use client";

import { useUserWallets } from "@dynamic-labs/sdk-react-core";

export function useEmbeddedWalletAddress(): `0x${string}` | undefined {
  const userWallets = useUserWallets();
  const embeddedWallet = userWallets.find(
    (w) =>
      w.connector?.isEmbeddedWallet ||
      (w.connector as any)?.key?.startsWith("turnkey") ||
      (w.connector as any)?.key?.includes("embedded")
  );
  return embeddedWallet?.address as `0x${string}` | undefined;
}
