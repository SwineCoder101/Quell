"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { TOKENS } from "@/lib/contracts";
import { checkApproval, getQuote, getSwap, getOutputAmount } from "@/lib/uniswap-api";

const BASE_CHAIN_ID = "8453";

// ETH represented as a special address for the API
const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

interface TokenOption {
  symbol: string;
  address: string;
  decimals: number;
  isNative?: boolean;
}

const TOKEN_OPTIONS: TokenOption[] = [
  { symbol: "ETH", address: NATIVE_ETH, decimals: 18, isNative: true },
  { symbol: "WETH", address: TOKENS.WETH.address, decimals: 18 },
  { symbol: "USDC", address: TOKENS.USDC.address, decimals: 6 },
];

type Step = "idle" | "quoting" | "quoted" | "approving" | "signing" | "swapping" | "done" | "error";

export default function SwapPanel() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [tokenIn, setTokenIn] = useState<TokenOption>(TOKEN_OPTIONS[0]);
  const [tokenOut, setTokenOut] = useState<TokenOption>(TOKEN_OPTIONS[2]);
  const [amountIn, setAmountIn] = useState("");
  const [quoteResponse, setQuoteResponse] = useState<Record<string, unknown> | null>(null);
  const [outputAmount, setOutputAmount] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const resetState = useCallback(() => {
    setQuoteResponse(null);
    setOutputAmount("");
    setStep("idle");
    setError("");
    setTxHash("");
  }, []);

  const handleQuote = useCallback(async () => {
    if (!address || !amountIn) return;
    resetState();
    setStep("quoting");
    setError("");

    try {
      const decimals = tokenIn.decimals;
      const rawAmount = parseUnits(amountIn, decimals).toString();

      const quote = await getQuote({
        swapper: address,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        tokenInChainId: BASE_CHAIN_ID,
        tokenOutChainId: BASE_CHAIN_ID,
        amount: rawAmount,
        type: "EXACT_INPUT",
        slippageTolerance: 0.5,
      });

      setQuoteResponse(quote);
      const outAmt = getOutputAmount(quote);
      setOutputAmount(formatUnits(BigInt(outAmt), tokenOut.decimals));
      setStep("quoted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote failed");
      setStep("error");
    }
  }, [address, amountIn, tokenIn, tokenOut, resetState]);

  const handleSwap = useCallback(async () => {
    if (!address || !walletClient || !publicClient || !quoteResponse) return;
    setError("");

    try {
      // Step 1: Check approval (skip for native ETH)
      if (!tokenIn.isNative) {
        setStep("approving");
        const approvalRes = await checkApproval({
          walletAddress: address,
          token: tokenIn.address,
          amount: parseUnits(amountIn, tokenIn.decimals).toString(),
          chainId: 8453,
        });

        if (approvalRes.approval) {
          const approveTx = await walletClient.sendTransaction({
            to: approvalRes.approval.to as `0x${string}`,
            data: approvalRes.approval.data as `0x${string}`,
            value: BigInt(approvalRes.approval.value || "0"),
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }
      }

      // Step 2: Sign permit if needed
      let signature: string | undefined;
      const permitData = quoteResponse.permitData as Record<string, unknown> | null;

      if (permitData) {
        setStep("signing");
        signature = await walletClient.signTypedData({
          domain: permitData.domain as Record<string, unknown>,
          types: permitData.types as Record<string, Array<{ name: string; type: string }>>,
          primaryType: Object.keys(permitData.types as Record<string, unknown>).find(
            (k) => k !== "EIP712Domain"
          ) as string,
          message: permitData.values as Record<string, unknown>,
        });
      }

      // Step 3: Get swap calldata
      setStep("swapping");
      const swapRes = await getSwap(quoteResponse, signature);

      if (!swapRes.swap?.data || swapRes.swap.data === "0x") {
        throw new Error("Swap data is empty — quote may have expired. Please re-quote.");
      }

      // Step 4: Execute the swap transaction
      const tx = await walletClient.sendTransaction({
        to: swapRes.swap.to as `0x${string}`,
        data: swapRes.swap.data as `0x${string}`,
        value: BigInt(swapRes.swap.value || "0"),
        gas: swapRes.swap.gasLimit ? BigInt(swapRes.swap.gasLimit) : undefined,
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
      setStep("error");
    }
  }, [address, walletClient, publicClient, quoteResponse, tokenIn, amountIn]);

  const swapTokens = () => {
    const prevIn = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(prevIn);
    resetState();
  };

  if (!isConnected) {
    return (
      <div className="text-center text-zinc-400 py-12">
        Connect your wallet to start swapping
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Token In */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-zinc-400">You pay</span>
          <select
            className="bg-zinc-700 text-white rounded-lg px-3 py-1 text-sm border border-zinc-600"
            value={tokenIn.symbol}
            onChange={(e) => {
              const t = TOKEN_OPTIONS.find((t) => t.symbol === e.target.value)!;
              setTokenIn(t);
              resetState();
            }}
          >
            {TOKEN_OPTIONS.filter((t) => t.symbol !== tokenOut.symbol).map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="0.0"
          className="w-full bg-transparent text-2xl text-white outline-none"
          value={amountIn}
          onChange={(e) => {
            setAmountIn(e.target.value);
            resetState();
          }}
        />
      </div>

      {/* Swap direction button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={swapTokens}
          className="bg-zinc-700 hover:bg-zinc-600 border-4 border-zinc-900 rounded-xl p-2 transition"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* Token Out */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-zinc-400">You receive</span>
          <select
            className="bg-zinc-700 text-white rounded-lg px-3 py-1 text-sm border border-zinc-600"
            value={tokenOut.symbol}
            onChange={(e) => {
              const t = TOKEN_OPTIONS.find((t) => t.symbol === e.target.value)!;
              setTokenOut(t);
              resetState();
            }}
          >
            {TOKEN_OPTIONS.filter((t) => t.symbol !== tokenIn.symbol).map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
        <div className="text-2xl text-white">
          {step === "quoting" ? (
            <span className="text-zinc-500 animate-pulse">Getting quote...</span>
          ) : outputAmount ? (
            outputAmount
          ) : (
            <span className="text-zinc-600">0.0</span>
          )}
        </div>
      </div>

      {/* Quote details */}
      {quoteResponse && step === "quoted" && (
        <div className="bg-zinc-800/50 rounded-xl p-3 text-sm text-zinc-400 space-y-1">
          <div className="flex justify-between">
            <span>Routing</span>
            <span className="text-white">{quoteResponse.routing as string}</span>
          </div>
          {quoteResponse.routing === "CLASSIC" && (
            <>
              <div className="flex justify-between">
                <span>Gas estimate</span>
                <span className="text-white">
                  {(quoteResponse.quote as Record<string, unknown>).gasFeeUSD
                    ? `$${(quoteResponse.quote as Record<string, unknown>).gasFeeUSD}`
                    : "N/A"}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <span>Slippage</span>
            <span className="text-white">0.5%</span>
          </div>
        </div>
      )}

      {/* Action button */}
      {step === "idle" || step === "error" ? (
        <button
          onClick={handleQuote}
          disabled={!amountIn || parseFloat(amountIn) <= 0}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-4 rounded-xl transition text-lg"
        >
          Get Quote
        </button>
      ) : step === "quoted" ? (
        <button
          onClick={handleSwap}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-4 rounded-xl transition text-lg"
        >
          Swap
        </button>
      ) : step === "done" ? (
        <div className="text-center space-y-2">
          <div className="text-green-400 font-semibold">Swap successful!</div>
          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:underline text-sm"
            >
              View on BaseScan
            </a>
          )}
          <button
            onClick={resetState}
            className="block mx-auto mt-2 text-sm text-zinc-400 hover:text-white"
          >
            New swap
          </button>
        </div>
      ) : (
        <button disabled className="w-full bg-zinc-700 text-zinc-400 font-semibold py-4 rounded-xl text-lg">
          {step === "quoting" && "Getting quote..."}
          {step === "approving" && "Approving token..."}
          {step === "signing" && "Sign permit in wallet..."}
          {step === "swapping" && "Confirm swap in wallet..."}
        </button>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
