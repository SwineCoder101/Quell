"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits, erc20Abi } from "viem";
import { TOKEN_LIST } from "@/lib/token-config";

export interface TokenBalance {
  symbol: string;
  name: string;
  address: `0x${string}` | "native";
  decimals: number;
  balance: bigint;
  formatted: string;
}

export function useTokenBalances(opts?: { addressOverride?: `0x${string}` }) {
  const { address: wagmiAddress, isConnected } = useAccount();
  const address = opts?.addressOverride || wagmiAddress;
  const publicClient = usePublicClient();

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!address || !publicClient) return;
    setLoading(true);

    try {
      const [ethBalance, ...tokenResults] = await Promise.all([
        publicClient.getBalance({ address }),
        ...TOKEN_LIST.map((token) =>
          publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          })
        ),
      ]);

      const allBalances: TokenBalance[] = [
        {
          symbol: "ETH",
          name: "Ether",
          address: "native",
          decimals: 18,
          balance: ethBalance,
          formatted: formatUnits(ethBalance, 18),
        },
        ...TOKEN_LIST.map((token, i) => ({
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          decimals: token.decimals,
          balance: tokenResults[i] as bigint,
          formatted: formatUnits(tokenResults[i] as bigint, token.decimals),
        })),
      ];

      setBalances(allBalances);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, lastUpdated, refetch: fetchBalances, isConnected };
}
