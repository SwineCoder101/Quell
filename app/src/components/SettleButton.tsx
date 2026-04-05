"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSwitchChain, usePublicClient } from "wagmi";
import { formatUnits, erc20Abi } from "viem";
import { useFundWallet } from "@/hooks/useFundWallet";
import { useGatewayTransfer } from "@/hooks/useGatewayTransfer";
import { ethereumSepoliaConfig } from "@/lib/gateway";
import { OFFICIAL_USDC_ADDRESS } from "@/lib/token-config";

type Method = "cctp" | "gateway";

const METHODS: { key: Method; label: string; speed: string; fee: string; description: string }[] = [
  {
    key: "cctp",
    label: "CCTP V2",
    speed: "~15-20 min",
    fee: "No fee",
    description: "Burns USDC on Ethereum Sepolia, then auto-mints on Arc.",
  },
  {
    key: "gateway",
    label: "Gateway",
    speed: "~Instant",
    fee: "~2% fee",
    description: "Deposits into Circle Gateway for instant mint on Arc. Min 2.01 USDC.",
  },
];

const PERCENTAGES = [25, 50, 75, 100] as const;

export default function SettleButton() {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  const {
    fundWallet,
    step: cctpStep,
    txHash: cctpTxHash,
    error: cctpError,
    reset: cctpReset,
  } = useFundWallet();

  const {
    transfer,
    step: gwStep,
    txHash: gwTxHash,
    transferId,
    error: gwError,
    reset: gwReset,
  } = useGatewayTransfer();

  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("cctp");
  const [amount, setAmount] = useState("");
  const [usdcBalance, setUsdcBalance] = useState<{ formatted: string; display: string } | null>(null);

  const fetchUsdcBalance = useCallback(async () => {
    if (!address || !publicClient) return;
    try {
      const bal = await publicClient.readContract({
        address: OFFICIAL_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      const formatted = formatUnits(bal, 6);
      setUsdcBalance({ formatted, display: parseFloat(formatted).toFixed(2) });
    } catch {
      setUsdcBalance(null);
    }
  }, [address, publicClient]);

  useEffect(() => {
    fetchUsdcBalance();
  }, [fetchUsdcBalance]);

  if (!isConnected || !address) return null;

  const step = method === "cctp" ? cctpStep : gwStep;
  const txHash = method === "cctp" ? cctpTxHash : gwTxHash;
  const error = method === "cctp" ? cctpError : gwError;
  const isProcessing =
    step !== "idle" && step !== "done" && step !== "error";

  const handleSettle = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    if (chain?.id !== 11155111) {
      try {
        await switchChainAsync({ chainId: 11155111 });
      } catch {
        return;
      }
    }

    if (method === "cctp") {
      cctpReset();
      await fundWallet({
        sourceChainId: 11155111,
        amount,
        recipientAddress: address,
      });
    } else {
      gwReset();
      await transfer({
        sourceChain: ethereumSepoliaConfig,
        amount,
        recipientAddress: address,
      });
    }
  };

  const handleReset = () => {
    cctpReset();
    gwReset();
    setAmount("");
  };

  const setPercentage = (pct: number) => {
    if (!usdcBalance) return;
    const val = (parseFloat(usdcBalance.formatted) * pct) / 100;
    setAmount(val > 0 ? val.toFixed(usdcBalance.formatted.includes(".") ? Math.min(6, usdcBalance.formatted.split(".")[1]?.length || 2) : 2) : "");
  };

  const stepLabel: Record<string, string> = {
    approving: "Approving USDC...",
    depositing: method === "cctp" ? "Depositing for burn..." : "Depositing to Gateway...",
    waiting: "Waiting for Gateway to confirm deposit...",
    signing: "Sign burn intent in wallet...",
    submitting: "Submitting to Circle Gateway...",
    switching: "Switching to Arc testnet...",
    minting: "Minting USDC on Arc...",
  };

  const selectedMethod = METHODS.find((m) => m.key === method)!;

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 border border-cex-border hover:border-cex-secondary bg-cex-surface hover:bg-cex-surface-hover text-cex-secondary font-medium py-2.5 rounded transition text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        Settle USDC to Arc
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 bg-cex-surface border border-cex-border rounded p-4 space-y-4">
          {/* Method cards */}
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.key}
                onClick={() => { setMethod(m.key); handleReset(); }}
                className={`text-left p-3 rounded border transition ${
                  method === m.key
                    ? "border-cex-gold bg-cex-gold/5"
                    : "border-cex-border bg-cex-surface-hover hover:border-cex-secondary"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold ${method === m.key ? "text-cex-gold" : "text-foreground"}`}>
                    {m.label}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    m.key === "gateway"
                      ? "bg-cex-green/10 text-cex-green"
                      : "bg-blue-500/10 text-blue-400"
                  }`}>
                    {m.speed}
                  </span>
                </div>
                <div className="text-[11px] text-cex-tertiary">{m.fee}</div>
              </button>
            ))}
          </div>

          {/* Description */}
          <div className="text-xs text-cex-tertiary bg-cex-surface-hover rounded p-2.5">
            {selectedMethod.description}
          </div>

          {/* USDC Balance */}
          {usdcBalance && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-cex-tertiary">Available USDC</span>
              <span className="text-foreground font-mono">{usdcBalance.display} USDC</span>
            </div>
          )}

          {/* Amount input + percentage tabs */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0.00"
                className="flex-1 bg-cex-surface-hover text-foreground rounded px-3 py-2.5 text-sm border border-cex-border outline-none focus:border-cex-gold transition font-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isProcessing}
              />
              <button
                onClick={handleSettle}
                disabled={!amount || parseFloat(amount) <= 0 || isProcessing}
                className="bg-cex-gold hover:bg-cex-gold/90 disabled:bg-cex-surface disabled:border disabled:border-cex-border disabled:text-cex-tertiary text-[#0b0e11] font-semibold px-5 py-2.5 rounded text-sm transition"
              >
                Settle
              </button>
            </div>

            {/* Percentage tabs */}
            {usdcBalance && parseFloat(usdcBalance.formatted) > 0 && (
              <div className="flex gap-1">
                {PERCENTAGES.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setPercentage(pct)}
                    disabled={isProcessing}
                    className="flex-1 py-1 text-[11px] font-medium rounded border border-cex-border bg-cex-surface-hover text-cex-secondary hover:text-cex-gold hover:border-cex-gold/50 transition disabled:opacity-50"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          {isProcessing && (
            <div className="text-sm text-cex-gold animate-pulse">
              {stepLabel[step] || "Processing..."}
            </div>
          )}

          {step === "done" && (
            <div className="space-y-1">
              <div className="text-sm text-cex-green font-medium">
                {method === "cctp"
                  ? "USDC burn submitted! It will mint on Arc in ~15-20 minutes."
                  : "USDC minted on Arc!"}
              </div>
              {txHash && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cex-gold hover:underline text-xs"
                >
                  View on Etherscan
                </a>
              )}
              {transferId && (
                <p className="text-xs text-cex-tertiary font-mono">
                  Transfer ID: {transferId}
                </p>
              )}
              <button
                onClick={handleReset}
                className="text-xs text-cex-secondary hover:text-foreground"
              >
                New settlement
              </button>
            </div>
          )}

          {error && (
            <div className="text-sm text-cex-red">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
