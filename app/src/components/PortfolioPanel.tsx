"use client";

import { useTokenBalances } from "@/hooks/useTokenBalances";
import TokenIcon from "@/components/TokenIcon";

export default function PortfolioPanel() {
  const { balances, loading, lastUpdated, refetch, isConnected } =
    useTokenBalances();

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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            Wallet
          </p>
          <p className="text-sm font-mono text-zinc-300">Connected</p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

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

      {lastUpdated && (
        <p className="text-center text-xs text-zinc-600">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function TokenRow({
  token,
  dimmed,
}: {
  token: { symbol: string; name: string; address: string; formatted: string };
  dimmed?: boolean;
}) {
  const displayBalance = formatBalance(token.formatted);

  return (
    <div
      className={`flex items-center justify-between bg-zinc-800 rounded-xl p-4 transition ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <TokenIcon symbol={token.symbol} size="lg" />
        <div>
          {token.address !== "native" ? (
            <a
              href={`https://sepolia.etherscan.io/token/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white hover:text-violet-400 transition"
            >
              {token.symbol} ↗
            </a>
          ) : (
            <p className="text-sm font-semibold text-white">{token.symbol}</p>
          )}
          <p className="text-xs text-zinc-500">{token.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-mono text-white">{displayBalance}</p>
        {token.address !== "native" && (
          <a
            href={`https://sepolia.etherscan.io/token/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-zinc-600 hover:text-violet-400 transition"
          >
            {token.address.slice(0, 6)}...{token.address.slice(-4)} ↗
          </a>
        )}
      </div>
    </div>
  );
}

function formatBalance(formatted: string): string {
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  if (num < 1) return num.toPrecision(4);
  if (num < 1000) return num.toFixed(4);
  if (num < 1_000_000)
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num < 1_000_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  return `${(num / 1_000_000_000).toFixed(2)}B`;
}
