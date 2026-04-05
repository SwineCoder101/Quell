"use client";

import { useEffect, useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits, erc20Abi, parseAbi } from "viem";
import {
  V3_POOLS,
  V4_POOLS,
  ALL_POOLS,
  V4_POOL_MANAGER_ADDRESS,
  type PoolConfig,
} from "@/lib/pool-config";
import { isPairQuotable } from "@/lib/token-config";
import TokenIcon from "@/components/TokenIcon";

const V3_POOL_ABI = parseAbi([
  "function liquidity() external view returns (uint128)",
]);

interface PoolData extends PoolConfig {
  liquidity?: string;
  balance0?: string;
  balance1?: string;
  loading?: boolean;
}

type VersionFilter = "all" | "v3" | "v4";
type SortKey = "pair" | "version" | "fee" | "liquidity";

export default function PoolsDashboard() {
  const publicClient = usePublicClient();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [versionFilter, setVersionFilter] = useState<VersionFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("pair");
  const [search, setSearch] = useState("");

  const fetchPoolData = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);

    try {
      const v3Data: PoolData[] = await Promise.all(
        V3_POOLS.map(async (pool) => {
          if (!pool.poolAddress) return { ...pool };
          try {
            const [liquidity, bal0, bal1] = await Promise.all([
              publicClient.readContract({
                address: pool.poolAddress,
                abi: V3_POOL_ABI,
                functionName: "liquidity",
              }),
              publicClient.readContract({
                address: pool.token0.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [pool.poolAddress],
              }),
              publicClient.readContract({
                address: pool.token1.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [pool.poolAddress],
              }),
            ]);
            return {
              ...pool,
              liquidity: liquidity.toString(),
              balance0: formatUnits(bal0, pool.token0.decimals),
              balance1: formatUnits(bal1, pool.token1.decimals),
            };
          } catch {
            return { ...pool };
          }
        })
      );

      const v4TokenAddrs = new Map<string, { symbol: string; decimals: number }>();
      for (const pool of V4_POOLS) {
        v4TokenAddrs.set(pool.token0.address.toLowerCase(), {
          symbol: pool.token0.symbol,
          decimals: pool.token0.decimals,
        });
        v4TokenAddrs.set(pool.token1.address.toLowerCase(), {
          symbol: pool.token1.symbol,
          decimals: pool.token1.decimals,
        });
      }

      const v4Balances = new Map<string, string>();
      await Promise.all(
        Array.from(v4TokenAddrs.entries()).map(async ([addr, info]) => {
          try {
            const bal = await publicClient.readContract({
              address: addr as `0x${string}`,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [V4_POOL_MANAGER_ADDRESS],
            });
            v4Balances.set(addr, formatUnits(bal, info.decimals));
          } catch {
            v4Balances.set(addr, "0");
          }
        })
      );

      const v4Data: PoolData[] = V4_POOLS.map((pool) => ({
        ...pool,
        balance0: v4Balances.get(pool.token0.address.toLowerCase()) || "0",
        balance1: v4Balances.get(pool.token1.address.toLowerCase()) || "0",
      }));

      setPools([...v3Data, ...v4Data]);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch pool data:", err);
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    fetchPoolData();
  }, [fetchPoolData]);

  const filtered = pools
    .filter((p) => versionFilter === "all" || p.version === versionFilter)
    .filter(
      (p) =>
        !search ||
        p.pair.toLowerCase().includes(search.toLowerCase()) ||
        p.token0.symbol.toLowerCase().includes(search.toLowerCase()) ||
        p.token1.symbol.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortKey) {
        case "pair":
          return a.pair.localeCompare(b.pair);
        case "version":
          return a.version.localeCompare(b.version);
        case "fee":
          return a.fee - b.fee;
        case "liquidity":
          return Number(b.liquidity || 0) - Number(a.liquidity || 0);
        default:
          return 0;
      }
    });

  const v3Count = pools.filter((p) => p.version === "v3").length;
  const v4Count = pools.filter((p) => p.version === "v4").length;
  const fundedCount = pools.filter(
    (p) => (p.balance0 && parseFloat(p.balance0) > 0) || (p.balance1 && parseFloat(p.balance1) > 0)
  ).length;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Pools" value={ALL_POOLS.length} />
        <StatCard label="V3 / V4" value={`${v3Count} / ${v4Count}`} />
        <StatCard label="Funded" value={fundedCount} accent />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Search pairs..."
          className="flex-1 bg-cex-surface text-foreground text-sm rounded px-3 py-2 border border-cex-border outline-none focus:border-cex-gold transition"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-px bg-cex-border rounded overflow-hidden">
          {(["all", "v3", "v4"] as VersionFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setVersionFilter(v)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                versionFilter === v
                  ? "bg-cex-gold/15 text-cex-gold"
                  : "bg-cex-surface text-cex-secondary hover:text-foreground"
              }`}
            >
              {v === "all" ? "All" : v.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={fetchPoolData}
          disabled={loading}
          className="text-xs text-cex-secondary hover:text-foreground border border-cex-border hover:border-cex-secondary rounded px-3 py-1.5 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Table */}
      <div className="border border-cex-border rounded overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[1fr_60px_70px_50px_1fr_1fr] gap-2 px-3 py-2 text-[10px] text-cex-tertiary uppercase tracking-wider bg-cex-surface border-b border-cex-border">
          <SortHeader label="Pair" sortKey="pair" current={sortKey} onSort={setSortKey} />
          <SortHeader label="Version" sortKey="version" current={sortKey} onSort={setSortKey} />
          <SortHeader label="Fee" sortKey="fee" current={sortKey} onSort={setSortKey} />
          <span>RFQ</span>
          <span>Token 0 Balance</span>
          <span>Token 1 Balance</span>
        </div>

        {/* Pool rows */}
        {loading && pools.length === 0 ? (
          <div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-cex-surface p-4 animate-pulse h-14 border-b border-cex-border/50" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-cex-border/50">
            {filtered.map((pool, i) => (
              <PoolRow key={`${pool.version}-${pool.pair}-${pool.fee}-${i}`} pool={pool} />
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-cex-secondary text-sm py-8">No pools found</p>
            )}
          </div>
        )}
      </div>

      {lastUpdated && (
        <p className="text-xs text-cex-tertiary">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function PoolRow({ pool }: { pool: PoolData }) {
  const hasFunds =
    (pool.balance0 && parseFloat(pool.balance0) > 0) ||
    (pool.balance1 && parseFloat(pool.balance1) > 0);

  const feePercent = (pool.fee / 10000).toFixed(2) + "%";

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[1fr_60px_70px_50px_1fr_1fr] gap-2 items-center px-3 py-2.5 transition hover:bg-cex-surface-hover ${
        !hasFunds ? "opacity-50" : ""
      }`}
    >
      {/* Pair */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <TokenIcon symbol={pool.token0.symbol} size="sm" className="ring-1 ring-background" />
          <TokenIcon symbol={pool.token1.symbol} size="sm" className="ring-1 ring-background" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{pool.pair}</p>
          {pool.poolAddress ? (
            <a
              href={`https://sepolia.etherscan.io/address/${pool.poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-cex-tertiary hover:text-cex-gold transition"
            >
              {pool.poolAddress.slice(0, 8)}...{pool.poolAddress.slice(-4)}
            </a>
          ) : pool.version === "v4" ? (
            <a
              href={`https://sepolia.etherscan.io/address/${V4_POOL_MANAGER_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-cex-tertiary hover:text-cex-gold transition"
            >
              PoolManager
            </a>
          ) : null}
        </div>
      </div>

      {/* Version */}
      <div>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            pool.version === "v3"
              ? "bg-cex-gold/10 text-cex-gold"
              : "bg-cyan-500/10 text-cyan-400"
          }`}
        >
          {pool.version.toUpperCase()}
        </span>
      </div>

      {/* Fee */}
      <span className="text-xs text-cex-secondary font-mono">{feePercent}</span>

      {/* RFQ */}
      <div>
        {isPairQuotable(pool.token0.symbol, pool.token1.symbol) ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cex-green/10 text-cex-green">
            Live
          </span>
        ) : (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cex-red/10 text-cex-red" title="V4-only pair — RFQ not available">
            N/A
          </span>
        )}
      </div>

      {/* Token 0 balance */}
      <div className="flex items-center gap-1.5">
        <TokenIcon symbol={pool.token0.symbol} size="sm" />
        <div>
          <p className="text-xs text-foreground font-mono">
            {pool.balance0 ? formatBalance(pool.balance0) : "—"}
          </p>
          <a
            href={`https://sepolia.etherscan.io/token/${pool.token0.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-cex-tertiary hover:text-cex-gold transition"
          >
            {pool.token0.symbol}
          </a>
        </div>
      </div>

      {/* Token 1 balance */}
      <div className="flex items-center gap-1.5">
        <TokenIcon symbol={pool.token1.symbol} size="sm" />
        <div>
          <p className="text-xs text-foreground font-mono">
            {pool.balance1 ? formatBalance(pool.balance1) : "—"}
          </p>
          <a
            href={`https://sepolia.etherscan.io/token/${pool.token1.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-cex-tertiary hover:text-cex-gold transition"
          >
            {pool.token1.symbol}
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="bg-cex-surface border border-cex-border rounded p-3">
      <p className="text-[10px] text-cex-tertiary uppercase tracking-wider">{label}</p>
      <p
        className={`text-lg font-bold ${accent ? "text-cex-green" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  onSort: (k: SortKey) => void;
}) {
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`text-left transition ${
        current === sortKey ? "text-cex-gold" : "hover:text-cex-secondary"
      }`}
    >
      {label} {current === sortKey && "↓"}
    </button>
  );
}

function formatBalance(formatted: string): string {
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  if (num < 0.01) return num.toPrecision(3);
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${(num / 1_000_000).toFixed(2)}M`;
}
