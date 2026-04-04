"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits, erc20Abi } from "viem";
import { TOKENS } from "@/lib/contracts";

interface TokenBalance {
  symbol: string;
  name: string;
  address: `0x${string}` | "native";
  decimals: number;
  balance: bigint;
  formatted: string;
}

const TRACKED_TOKENS = Object.values(TOKENS);

export default function PortfolioPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!address || !publicClient) return;
    setLoading(true);

    try {
      // Fetch native ETH + all ERC-20 balances in parallel
      const [ethBalance, ...tokenResults] = await Promise.all([
        publicClient.getBalance({ address }),
        ...TRACKED_TOKENS.map((token) =>
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
        ...TRACKED_TOKENS.map((token, i) => ({
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

  if (!isConnected) {
    return (
      <div className="text-center text-zinc-400 py-12">
        Connect your wallet to view your portfolio
      </div>
    );
  }

  const nonZeroBalances = balances.filter((b) => b.balance > BigInt(0));
  const zeroBalances = balances.filter((b) => b.balance === BigInt(0));

  return (
    <div className="space-y-6">
      {/* Wallet address */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Wallet</p>
          <p className="text-sm font-mono text-zinc-300">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
        <button
          onClick={fetchBalances}
          disabled={loading}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Loading state */}
      {loading && balances.length === 0 && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-zinc-800 rounded-xl p-4 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-700" />
                <div className="space-y-1.5">
                  <div className="w-16 h-4 bg-zinc-700 rounded" />
                  <div className="w-24 h-3 bg-zinc-700/50 rounded" />
                </div>
              </div>
              <div className="w-20 h-5 bg-zinc-700 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Token balances */}
      {nonZeroBalances.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">
            Holdings
          </p>
          {nonZeroBalances.map((token) => (
            <TokenRow key={token.symbol} token={token} />
          ))}
        </div>
      )}

      {/* Zero balances */}
      {zeroBalances.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">
            Other tokens
          </p>
          {zeroBalances.map((token) => (
            <TokenRow key={token.symbol} token={token} dimmed />
          ))}
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-center text-xs text-zinc-600">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function TokenRow({ token, dimmed }: { token: TokenBalance; dimmed?: boolean }) {
  const displayBalance = formatBalance(token.formatted);

  return (
    <div
      className={`flex items-center justify-between bg-zinc-800 rounded-xl p-4 transition ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <TokenIcon symbol={token.symbol} />
        <div>
          <p className="text-sm font-semibold text-white">{token.symbol}</p>
          <p className="text-xs text-zinc-500">{token.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-mono text-white">{displayBalance}</p>
        {token.address !== "native" && (
          <a
            href={`https://basescan.org/token/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition"
          >
            {(token.address as string).slice(0, 6)}...{(token.address as string).slice(-4)}
          </a>
        )}
      </div>
    </div>
  );
}

function TokenIcon({ symbol }: { symbol: string }) {
  const colors: Record<string, string> = {
    ETH: "from-blue-500 to-blue-700",
    WETH: "from-blue-400 to-blue-600",
    USDC: "from-blue-400 to-cyan-500",
    DAI: "from-amber-400 to-amber-600",
    cbETH: "from-blue-500 to-indigo-600",
    USDbC: "from-blue-500 to-cyan-600",
  };

  return (
    <div
      className={`w-10 h-10 rounded-full bg-gradient-to-br ${
        colors[symbol] || "from-zinc-500 to-zinc-700"
      } flex items-center justify-center text-xs font-bold text-white shadow-lg`}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

function formatBalance(formatted: string): string {
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  if (num < 1) return num.toPrecision(4);
  if (num < 1000) return num.toFixed(4);
  if (num < 1_000_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${(num / 1_000_000).toFixed(2)}M`;
}
