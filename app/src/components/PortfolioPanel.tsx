"use client";

import { useEffect, useState, useCallback } from "react";
import { useDynamicContext, useUserWallets, useEmbeddedWallet } from "@dynamic-labs/sdk-react-core";
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { sepolia } from "viem/chains";
import { TOKEN_LIST, isTokenQuotable } from "@/lib/token-config";
import TokenIcon from "@/components/TokenIcon";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

interface TokenBalance {
  symbol: string;
  name: string;
  address: `0x${string}` | "native";
  decimals: number;
  balance: bigint;
  formatted: string;
}

export default function PortfolioPanel() {
  const { user } = useDynamicContext();
  const userWallets = useUserWallets();
  const { userHasEmbeddedWallet } = useEmbeddedWallet();

  // Always use the embedded wallet — this is the session wallet for all txs
  const embeddedWallet = userWallets.find(
    (w) => w.connector?.isEmbeddedWallet
      || (w.connector as any)?.key?.startsWith("turnkey")
      || (w.connector as any)?.key?.includes("embedded")
  );
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [funding, setFunding] = useState(false);
  const [fundResult, setFundResult] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);

    try {
      const [ethBalance, ...tokenResults] = await Promise.all([
        publicClient.getBalance({ address: walletAddress }),
        ...TOKEN_LIST.map((token) =>
          publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress],
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
  }, [walletAddress]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

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
        setTimeout(fetchBalances, 8000); // Wait for Sepolia block
      } else {
        setFundResult(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setFundResult(`Error: ${err.message}`);
    } finally {
      setFunding(false);
    }
  }, [walletAddress, fetchBalances]);

  if (!user) {
    return (
      <div className="text-center text-zinc-400 py-12 space-y-2">
        <p>Connect your wallet to view your portfolio.</p>
      </div>
    );
  }

  if (!embeddedWallet) {
    return (
      <div className="text-center text-zinc-400 py-12 space-y-4">
        <p>No embedded wallet found.</p>
        <p className="text-xs text-zinc-600">Create an embedded wallet from the Wallet tab to view your portfolio and start trading.</p>
      </div>
    );
  }

  const nonZeroBalances = balances.filter((b) => b.balance > BigInt(0));
  const zeroBalances = balances.filter((b) => b.balance === BigInt(0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Embedded Wallet</p>
          <p className="text-sm font-mono text-zinc-300">
            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleFund}
            disabled={funding}
            className="text-xs text-violet-400 hover:text-violet-300 border border-violet-600/50 hover:border-violet-500 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
          >
            {funding ? "Funding..." : "Fund Wallet"}
          </button>
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Fund result */}
      {fundResult && (
        <div className={`rounded-xl p-3 text-sm ${
          fundResult.startsWith("Error")
            ? "bg-red-900/30 border border-red-800 text-red-400"
            : "bg-green-900/20 border border-green-800/30 text-green-400"
        }`}>
          {fundResult}
        </div>
      )}

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

function TokenRow({ token, dimmed }: { token: TokenBalance; dimmed?: boolean }) {
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
            {(token.address as string).slice(0, 6)}...{(token.address as string).slice(-4)} ↗
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
  if (num < 1_000_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num < 1_000_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  return `${(num / 1_000_000_000).toFixed(2)}B`;
}
