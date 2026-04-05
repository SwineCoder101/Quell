"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { sepolia } from "wagmi/chains";
import { TOKEN_LIST } from "@/lib/token-config";

// Pinned to Sepolia so balances work even when wallet is on Arc
const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

export interface TokenBalance {
  symbol: string;
  name: string;
  address: `0x${string}` | "native";
  decimals: number;
  balance: bigint;
  formatted: string;
}

export function useTokenBalances() {
  const { address, isConnected } = useAccount();

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!address) return;
    setLoading(true);

    try {
      const [ethBalance, ...tokenResults] = await Promise.all([
        sepoliaClient.getBalance({ address }),
        ...TOKEN_LIST.map((token) =>
          sepoliaClient.readContract({
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
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, lastUpdated, refetch: fetchBalances, isConnected };
}
