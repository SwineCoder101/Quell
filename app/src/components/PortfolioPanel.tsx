"use client";

import { useMemo, useState, useCallback } from "react";
import { useDynamicContext, useUserWallets, useEmbeddedWallet } from "@dynamic-labs/sdk-react-core";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import TokenIcon from "@/components/TokenIcon";

const CHART_COLORS = [
  "#f0b90b", // gold
  "#3861fb", // blue
  "#0ecb81", // green
  "#f6465d", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#a855f7", // violet
  "#eab308", // yellow
  "#6366f1", // indigo
];

export default function PortfolioPanel() {
  const { user } = useDynamicContext();
  const userWallets = useUserWallets();
  const { userHasEmbeddedWallet } = useEmbeddedWallet();

  const embeddedWallet = userWallets.find(
    (w) => w.connector?.isEmbeddedWallet
      || (w.connector as any)?.key?.startsWith("turnkey")
      || (w.connector as any)?.key?.includes("embedded")
  );
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;

  const { balances, loading, lastUpdated, refetch } =
    useTokenBalances({ addressOverride: walletAddress });

  const [funding, setFunding] = useState(false);
  const [fundResult, setFundResult] = useState<string | null>(null);

  const handleFund = useCallback(async () => {
    if (!walletAddress) return;
    setFunding(true);
    setFundResult(null);

    try {
      const res = await fetch("/api/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: walletAddress }),
      });
      const data = await res.json();
      if (res.ok) {
        setFundResult(`Funded! ${data.tokensTransferred} tokens + ${data.ethAmount} ETH sent.`);
        setTimeout(refetch, 8000);
      } else {
        setFundResult(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setFundResult(`Error: ${err.message}`);
    } finally {
      setFunding(false);
    }
  }, [walletAddress, refetch]);

  if (!user) {
    return (
      <div className="text-center text-cex-secondary py-12">
        Connect your wallet to view your portfolio
      </div>
    );
  }

  if (!embeddedWallet && !userHasEmbeddedWallet()) {
    return (
      <div className="text-center text-cex-secondary py-12 space-y-4">
        <p>No embedded wallet found.</p>
        <p className="text-xs text-cex-tertiary">Create an embedded wallet from the Wallet tab to view your portfolio and start trading.</p>
      </div>
    );
  }

  const nonZeroBalances = balances.filter((b) => b.balance > BigInt(0));
  const zeroBalances = balances.filter((b) => b.balance === BigInt(0));

  return (
    <div className="space-y-4">
      {/* Top row: Wallet header + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-cex-tertiary uppercase tracking-wider">
            Embedded Wallet
          </p>
          <p className="text-sm font-mono text-cex-secondary">
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleFund}
            disabled={funding}
            className="text-xs text-violet-400 hover:text-violet-300 border border-violet-600/50 hover:border-violet-500 rounded px-3 py-1.5 transition disabled:opacity-50"
          >
            {funding ? "Funding..." : "Fund Wallet"}
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            className="text-xs text-cex-secondary hover:text-foreground border border-cex-border hover:border-cex-secondary rounded px-3 py-1.5 transition disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Fund result */}
      {fundResult && (
        <div className={`rounded p-3 text-sm ${
          fundResult.startsWith("Error")
            ? "bg-red-900/30 border border-red-800 text-red-400"
            : "bg-green-900/20 border border-green-800/30 text-green-400"
        }`}>
          {fundResult}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && balances.length === 0 && (
        <div className="space-y-px">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-cex-surface p-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cex-border" />
                <div className="space-y-1.5">
                  <div className="w-16 h-4 bg-cex-border rounded" />
                  <div className="w-24 h-3 bg-cex-border/50 rounded" />
                </div>
              </div>
              <div className="w-20 h-5 bg-cex-border rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Two-column layout: table left, donut right */}
      {nonZeroBalances.length > 0 && (
        <div className="flex gap-6 items-start">
          {/* Holdings table */}
          <div className="flex-1 min-w-0 bg-cex-surface border border-cex-border rounded overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 text-[10px] text-cex-tertiary uppercase tracking-wider border-b border-cex-border bg-cex-surface">
              <span className="flex-1">Coin</span>
              <span className="w-32 text-right">Balance</span>
              <span className="w-28 text-right">Contract</span>
            </div>
            <div className="divide-y divide-cex-border/50">
              {nonZeroBalances.map((token) => (
                <TokenRow key={token.symbol} token={token} />
              ))}
            </div>
          </div>

          {/* Asset Allocation donut */}
          <div className="w-[320px] flex-shrink-0 bg-cex-surface border border-cex-border rounded p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Asset Allocation</h3>
            <div className="flex flex-col items-center gap-5">
              <DonutChart balances={nonZeroBalances} />
              <DonutLegend balances={nonZeroBalances} />
            </div>
          </div>
        </div>
      )}

      {/* Zero balance tokens */}
      {zeroBalances.length > 0 && (
        <div className="bg-cex-surface border border-cex-border rounded overflow-hidden">
          <p className="text-xs text-cex-tertiary uppercase tracking-wider px-4 py-2.5 border-b border-cex-border">
            Other tokens
          </p>
          <div className="divide-y divide-cex-border/50">
            {zeroBalances.map((token) => (
              <TokenRow key={token.symbol} token={token} dimmed />
            ))}
          </div>
        </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-cex-tertiary">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

/* ── Donut Chart (pure SVG) ── */

interface BalanceEntry {
  symbol: string;
  formatted: string;
}

function useChartData(balances: BalanceEntry[]) {
  return useMemo(() => {
    const items = balances
      .map((b) => ({ symbol: b.symbol, value: parseFloat(b.formatted) }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = items.reduce((sum, b) => sum + b.value, 0);
    if (total === 0) return { slices: [], total: 0 };

    const MAX_SLICES = 8;
    const topItems = items.slice(0, MAX_SLICES);
    const otherValue = items.slice(MAX_SLICES).reduce((sum, b) => sum + b.value, 0);

    const slices = topItems.map((item, i) => ({
      symbol: item.symbol,
      value: item.value,
      percent: (item.value / total) * 100,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

    if (otherValue > 0) {
      slices.push({
        symbol: "Other",
        value: otherValue,
        percent: (otherValue / total) * 100,
        color: "#5e6673",
      });
    }

    return { slices, total };
  }, [balances]);
}

function DonutChart({ balances }: { balances: BalanceEntry[] }) {
  const { slices } = useChartData(balances);

  const size = 160;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let cumulativePercent = 0;

  return (
    <div className="relative flex-shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#2b3139"
          strokeWidth={strokeWidth}
        />
        {/* Slices */}
        {slices.map((slice) => {
          const offset = circumference * (1 - cumulativePercent / 100);
          const length = circumference * (slice.percent / 100);
          cumulativePercent += slice.percent;

          return (
            <circle
              key={slice.symbol}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] text-cex-tertiary uppercase tracking-wider">Assets</span>
        <span className="text-lg font-bold text-foreground">{slices.length}</span>
      </div>
    </div>
  );
}

function DonutLegend({ balances }: { balances: BalanceEntry[] }) {
  const { slices } = useChartData(balances);

  return (
    <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1.5">
      {slices.map((slice) => (
        <div key={slice.symbol} className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: slice.color }}
          />
          <span className="text-xs text-cex-secondary truncate">{slice.symbol}</span>
          <span className="text-xs text-foreground font-mono ml-auto">
            {slice.percent.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Token Row ── */

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
      className={`flex items-center gap-3 px-3 py-3 transition hover:bg-cex-surface-hover ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <TokenIcon symbol={token.symbol} size="md" />
        <div className="min-w-0">
          {token.address !== "native" ? (
            <a
              href={`https://sepolia.etherscan.io/token/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-foreground hover:text-cex-gold transition"
            >
              {token.symbol}
            </a>
          ) : (
            <p className="text-sm font-semibold text-foreground">{token.symbol}</p>
          )}
          <p className="text-xs text-cex-tertiary">{token.name}</p>
        </div>
      </div>
      <div className="w-32 text-right">
        <p className="text-sm font-mono text-foreground">{displayBalance}</p>
      </div>
      <div className="w-28 text-right">
        {token.address !== "native" && (
          <a
            href={`https://sepolia.etherscan.io/token/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-cex-tertiary hover:text-cex-gold transition font-mono"
          >
            {token.address.slice(0, 6)}...{token.address.slice(-4)}
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
