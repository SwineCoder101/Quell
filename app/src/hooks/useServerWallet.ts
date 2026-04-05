"use client";

import { useState, useEffect, useCallback } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

export function useServerWallet() {
  const { user } = useDynamicContext();
  const userId = user?.userId;

  const [serverWalletAddress, setServerWalletAddress] = useState<`0x${string}` | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchWallet = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/wallet/get?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        setServerWalletAddress(data.walletAddress as `0x${string}`);
      } else if (res.status === 404) {
        // No wallet yet — auto-create
        const createRes = await fetch("/api/wallet/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const createData = await createRes.json();
        if (createRes.ok) {
          setServerWalletAddress(createData.walletAddress as `0x${string}`);
        } else {
          setError(createData.error || "Failed to create server wallet");
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to fetch wallet");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch wallet");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  return { serverWalletAddress, loading, error, refetch: fetchWallet };
}
