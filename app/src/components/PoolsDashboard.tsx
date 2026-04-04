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
      // Fetch V3 pool data (liquidity + token balances)
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

      // Fetch V4 pool manager token balances (shared across all V4 pools)
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

  // Filter and sort
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
      {/* Stats */}
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
          className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 outline-none focus:border-violet-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
          {(["all", "v3", "v4"] as VersionFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setVersionFilter(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                versionFilter === v
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {v === "all" ? "All" : v.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={fetchPoolData}
          disabled={loading}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Sort headers */}
      <div className="hidden sm:grid grid-cols-[1fr_60px_70px_1fr_1fr] gap-2 px-3 text-[10px] text-zinc-500 uppercase tracking-wider">
        <SortHeader label="Pair" sortKey="pair" current={sortKey} onSort={setSortKey} />
        <SortHeader label="Version" sortKey="version" current={sortKey} onSort={setSortKey} />
        <SortHeader label="Fee" sortKey="fee" current={sortKey} onSort={setSortKey} />
        <span>Token 0 Balance</span>
        <span>Token 1 Balance</span>
      </div>

      {/* Pool list */}
      {loading && pools.length === 0 ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-zinc-800 rounded-xl p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((pool, i) => (
            <PoolRow key={`${pool.version}-${pool.pair}-${pool.fee}-${i}`} pool={pool} />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">No pools found</p>
          )}
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

function PoolRow({ pool }: { pool: PoolData }) {
  const hasFunds =
    (pool.balance0 && parseFloat(pool.balance0) > 0) ||
    (pool.balance1 && parseFloat(pool.balance1) > 0);

  const feePercent = (pool.fee / 10000).toFixed(2) + "%";

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[1fr_60px_70px_1fr_1fr] gap-2 items-center bg-zinc-800 rounded-xl p-3 transition hover:bg-zinc-750 ${
        !hasFunds ? "opacity-50" : ""
      }`}
    >
      {/* Pair with icons */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          <TokenIcon symbol={pool.token0.symbol} size="md" className="ring-2 ring-zinc-800" />
          <TokenIcon symbol={pool.token1.symbol} size="md" className="ring-2 ring-zinc-800" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{pool.pair}</p>
          {pool.poolAddress && (
            <a
              href={`https://sepolia.basescan.org/address/${pool.poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-zinc-600 hover:text-zinc-400"
            >
              {pool.poolAddress.slice(0, 8)}...
            </a>
          )}
        </div>
      </div>

      {/* Version badge */}
      <div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            pool.version === "v3"
              ? "bg-pink-500/15 text-pink-400"
              : "bg-violet-500/15 text-violet-400"
          }`}
        >
          {pool.version.toUpperCase()}
        </span>
      </div>

      {/* Fee */}
      <span className="text-xs text-zinc-400 font-mono">{feePercent}</span>

      {/* Token 0 balance */}
      <div className="flex items-center gap-1.5">
        <TokenIcon symbol={pool.token0.symbol} size="sm" />
        <div>
          <p className="text-xs text-white font-mono">
            {pool.balance0 ? formatBalance(pool.balance0) : "—"}
          </p>
          <p className="text-[10px] text-zinc-500">{pool.token0.symbol}</p>
        </div>
      </div>

      {/* Token 1 balance */}
      <div className="flex items-center gap-1.5">
        <TokenIcon symbol={pool.token1.symbol} size="sm" />
        <div>
          <p className="text-xs text-white font-mono">
            {pool.balance1 ? formatBalance(pool.balance1) : "—"}
          </p>
          <p className="text-[10px] text-zinc-500">{pool.token1.symbol}</p>
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
    <div className="bg-zinc-800 rounded-xl p-3 text-center">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p
        className={`text-lg font-bold ${accent ? "text-green-400" : "text-white"}`}
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
        current === sortKey ? "text-violet-400" : "hover:text-zinc-300"
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
