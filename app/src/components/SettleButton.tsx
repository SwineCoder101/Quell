"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useFundWallet } from "@/hooks/useFundWallet";
import { useGatewayTransfer } from "@/hooks/useGatewayTransfer";
import { ethereumSepoliaConfig } from "@/lib/gateway";

type Method = "cctp" | "gateway";

export default function SettleButton() {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

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

  const stepLabel: Record<string, string> = {
    approving: "Approving USDC...",
    depositing: method === "cctp" ? "Depositing for burn..." : "Depositing to Gateway...",
    signing: "Sign burn intent in wallet...",
    submitting: "Submitting to Circle Gateway...",
  };

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
        <div className="mt-2 bg-cex-surface border border-cex-border rounded p-4 space-y-3">
          {/* Method toggle */}
          <div className="flex gap-px bg-cex-border rounded overflow-hidden">
            <button
              onClick={() => { setMethod("cctp"); handleReset(); }}
              className={`flex-1 py-1.5 text-xs font-medium transition ${
                method === "cctp"
                  ? "bg-cex-gold/10 text-cex-gold"
                  : "bg-cex-surface text-cex-secondary hover:text-foreground"
              }`}
            >
              CCTP V2 (~15 min)
            </button>
            <button
              onClick={() => { setMethod("gateway"); handleReset(); }}
              className={`flex-1 py-1.5 text-xs font-medium transition ${
                method === "gateway"
                  ? "bg-cex-gold/10 text-cex-gold"
                  : "bg-cex-surface text-cex-secondary hover:text-foreground"
              }`}
            >
              Gateway (~instant, 2% fee)
            </button>
          </div>

          {/* Info */}
          <div className="text-xs text-cex-tertiary">
            {method === "cctp"
              ? "Burns USDC on Ethereum Sepolia → auto-mints on Arc. No fee, ~15-20 min."
              : "Deposits into Circle Gateway → instant mint on Arc. ~2% fee (min 2.01 USDC)."}
          </div>

          {/* Amount */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="USDC amount"
              className="flex-1 bg-cex-surface-hover text-foreground rounded px-3 py-2 text-sm border border-cex-border outline-none focus:border-cex-gold transition font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isProcessing}
            />
            <button
              onClick={handleSettle}
              disabled={!amount || parseFloat(amount) <= 0 || isProcessing}
              className="bg-cex-gold hover:bg-cex-gold/90 disabled:bg-cex-surface disabled:border disabled:border-cex-border disabled:text-cex-tertiary text-[#0b0e11] font-medium px-4 py-2 rounded text-sm transition"
            >
              Settle
            </button>
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
                  : "Gateway transfer complete!"}
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
