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

    // Switch to Ethereum Sepolia if not already there
    if (chain?.id !== 11155111) {
      try {
        await switchChainAsync({ chainId: 11155111 });
      } catch {
        return; // user rejected chain switch
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
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 border border-cyan-700/50 hover:border-cyan-600 bg-cyan-950/30 hover:bg-cyan-950/50 text-cyan-400 font-medium py-3 rounded-xl transition text-sm"
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
        <div className="mt-3 bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
          {/* Method toggle */}
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => { setMethod("cctp"); handleReset(); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                method === "cctp"
                  ? "bg-cyan-900/50 text-cyan-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              CCTP V2 (~15 min)
            </button>
            <button
              onClick={() => { setMethod("gateway"); handleReset(); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                method === "gateway"
                  ? "bg-cyan-900/50 text-cyan-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Gateway (~instant, 2% fee)
            </button>
          </div>

          {/* Info */}
          <div className="text-xs text-zinc-500">
            {method === "cctp"
              ? "Burns USDC on Ethereum Sepolia → auto-mints on Arc. No fee, ~15-20 min."
              : "Deposits into Circle Gateway → instant mint on Arc. ~2% fee (min 2.01 USDC)."}
          </div>

          {/* Amount input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="USDC amount"
              className="flex-1 bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm border border-zinc-600 outline-none focus:border-cyan-500 transition"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isProcessing}
            />
            <button
              onClick={handleSettle}
              disabled={!amount || parseFloat(amount) <= 0 || isProcessing}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition"
            >
              Settle
            </button>
          </div>

          {/* Status */}
          {isProcessing && (
            <div className="text-sm text-cyan-400 animate-pulse">
              {stepLabel[step] || "Processing..."}
            </div>
          )}

          {step === "done" && (
            <div className="space-y-1">
              <div className="text-sm text-green-400 font-medium">
                {method === "cctp"
                  ? "USDC burn submitted! It will mint on Arc in ~15-20 minutes."
                  : "Gateway transfer complete!"}
              </div>
              {txHash && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline text-xs"
                >
                  View on Etherscan
                </a>
              )}
              {transferId && (
                <p className="text-xs text-zinc-500 font-mono">
                  Transfer ID: {transferId}
                </p>
              )}
              <button
                onClick={handleReset}
                className="text-xs text-zinc-400 hover:text-white"
              >
                New settlement
              </button>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
