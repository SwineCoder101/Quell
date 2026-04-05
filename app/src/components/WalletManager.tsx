"use client";

import { useState, useCallback, useEffect } from "react";
import {
  useDynamicContext,
  useUserWallets,
  useEmbeddedWallet,
} from "@dynamic-labs/sdk-react-core";
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { sepolia } from "viem/chains";
import { TOKEN_LIST, type TokenConfig } from "@/lib/token-config";
import TokenIcon from "@/components/TokenIcon";
import { useServerWallet } from "@/hooks/useServerWallet";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

type ManagerStep = "overview" | "deposit" | "withdraw";

export default function WalletManager() {
  const { primaryWallet, user, handleLogOut, setShowAuthFlow } = useDynamicContext();
  const userWallets = useUserWallets();
  const {
    createEmbeddedWallet,
    userHasEmbeddedWallet,
    isLoadingEmbeddedWallet,
  } = useEmbeddedWallet();

  const [step, setStep] = useState<ManagerStep>("overview");
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [error, setError] = useState("");

  // Balances
  const [ethBalance, setEthBalance] = useState<string>("0");
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Deposit/Withdraw form
  const [selectedToken, setSelectedToken] = useState<TokenConfig | null>(null);
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState("");
  const [fundResult, setFundResult] = useState<string | null>(null);

  // Find embedded wallet from the wallets list
  const embeddedWallet = userWallets.find(
    (w) => w.connector?.isEmbeddedWallet
      || (w.connector as any)?.key?.startsWith("turnkey")
      || (w.connector as any)?.key?.includes("embedded")
  );

  const hasEmbedded = userHasEmbeddedWallet() || !!embeddedWallet;

  // Server wallet
  const { serverWalletAddress, loading: serverWalletLoading } = useServerWallet();

  const fetchBalances = useCallback(async () => {
    if (!serverWalletAddress) return;
    setLoadingBalances(true);
    try {
      const addr = serverWalletAddress;
      const eth = await publicClient.getBalance({ address: addr });
      setEthBalance(formatUnits(eth, 18));

      const bals: Record<string, string> = {};
      await Promise.all(
        TOKEN_LIST.map(async (token) => {
          try {
            const bal = await publicClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [addr],
            });
            bals[token.symbol] = formatUnits(bal, token.decimals);
          } catch {
            bals[token.symbol] = "0";
          }
        })
      );
      setTokenBalances(bals);
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    } finally {
      setLoadingBalances(false);
    }
  }, [serverWalletAddress]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleCreateEmbedded = useCallback(async () => {
    setCreatingWallet(true);
    setError("");
    try {
      await createEmbeddedWallet();
    } catch (err: any) {
      setError(err.message || "Failed to create embedded wallet");
    } finally {
      setCreatingWallet(false);
    }
  }, [createEmbeddedWallet]);

  const handleFund = useCallback(async () => {
    if (!serverWalletAddress) return;
    setFundResult(null);
    setError("");

    try {
      const res = await fetch("/api/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: serverWalletAddress }),
      });
      const data = await res.json();
      if (res.ok) {
        setFundResult(`Funded! ${data.tokensTransferred} tokens sent.`);
        setTimeout(fetchBalances, 8000);
      } else {
        setError(data.error || "Funding failed");
      }
    } catch (err: any) {
      setError(err.message || "Funding failed");
    }
  }, [serverWalletAddress, fetchBalances]);

  // ── Not logged in ──
  if (!user) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-zinc-400">Connect your wallet to manage accounts</p>
        <button
          onClick={() => setShowAuthFlow?.(true)}
          className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl transition"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  // ── Overview ──
  if (step === "overview") {
    return (
      <div className="space-y-6">
        {/* User info */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Account</p>
            <p className="text-sm text-white">{user.email || "Connected"}</p>
          </div>
          <button
            onClick={handleLogOut}
            className="text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 rounded-lg px-3 py-1.5 transition"
          >
            Logout
          </button>
        </div>

        {/* All wallets */}
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Wallets</p>

          {userWallets.map((wallet) => {
            const isEmbedded = wallet.connector?.isEmbeddedWallet
              || (wallet.connector as any)?.key?.startsWith("turnkey")
              || (wallet.connector as any)?.key?.includes("embedded");

            return (
              <div key={wallet.id} className="bg-zinc-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isEmbedded
                          ? "bg-violet-500/15 text-violet-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {isEmbedded ? "Embedded" : "External"}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {(wallet.connector as any)?.name || (wallet.connector as any)?.key || "Wallet"}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-mono text-zinc-300">{wallet.address}</p>
                <a
                  href={`https://sepolia.etherscan.io/address/${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-zinc-600 hover:text-violet-400 transition"
                >
                  View on Etherscan ↗
                </a>
              </div>
            );
          })}

          {/* Create embedded wallet */}
          {!hasEmbedded && !isLoadingEmbeddedWallet && (
            <button
              onClick={handleCreateEmbedded}
              disabled={creatingWallet}
              className="w-full border border-dashed border-violet-600/50 hover:border-violet-500 text-violet-400 hover:text-violet-300 rounded-xl py-4 text-sm transition disabled:opacity-50"
            >
              {creatingWallet ? "Creating embedded wallet..." : "+ Create Embedded Wallet"}
            </button>
          )}

          {isLoadingEmbeddedWallet && (
            <div className="text-center text-zinc-500 text-sm py-4 animate-pulse">
              Loading embedded wallet...
            </div>
          )}
        </div>

        {/* Server wallet */}
        {serverWalletLoading && (
          <div className="text-center text-zinc-500 text-sm py-4 animate-pulse">
            Creating server wallet...
          </div>
        )}

        {/* Server wallet balances & actions */}
        {serverWalletAddress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Server Wallet
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleFund}
                  className="text-[10px] text-violet-400 hover:text-violet-300 border border-violet-600/50 rounded px-2 py-1 transition"
                >
                  Fund
                </button>
                <button
                  onClick={fetchBalances}
                  disabled={loadingBalances}
                  className="text-[10px] text-zinc-500 hover:text-white border border-zinc-700 rounded px-2 py-1 transition"
                >
                  {loadingBalances ? "..." : "Refresh"}
                </button>
              </div>
            </div>

            <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
              <p className="text-xs font-mono text-zinc-400 pb-1 border-b border-zinc-700">
                {serverWalletAddress}
              </p>
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <TokenIcon symbol="ETH" size="sm" />
                  <span className="text-sm text-white">ETH</span>
                </div>
                <span className="text-sm font-mono text-white">
                  {parseFloat(ethBalance).toFixed(6)}
                </span>
              </div>

              {TOKEN_LIST.filter((t) => parseFloat(tokenBalances[t.symbol] || "0") > 0).map((token) => (
                <div key={token.symbol} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <TokenIcon symbol={token.symbol} size="sm" />
                    <span className="text-sm text-white">{token.symbol}</span>
                  </div>
                  <span className="text-sm font-mono text-white">
                    {formatDisplay(tokenBalances[token.symbol] || "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fund result */}
        {fundResult && (
          <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-3 text-green-400 text-sm">
            {fundResult}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function formatDisplay(formatted: string): string {
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.0001) return "< 0.0001";
  if (num < 1) return num.toPrecision(4);
  if (num < 1000) return num.toFixed(4);
  if (num < 1_000_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${(num / 1_000_000).toFixed(2)}M`;
}
