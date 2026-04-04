"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useSendCalls } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { TOKEN_LIST, NATIVE_ETH as NATIVE_ETH_CONFIG, type TokenConfig } from "@/lib/token-config";
import {
  getQuote,
  getBatchSwap,
  getOutputAmount,
  type BatchSwapCall,
} from "@/lib/uniswap-api";
import TokenIcon from "@/components/TokenIcon";

const BASE_SEPOLIA_CHAIN_ID = "84532";

interface TokenOption extends TokenConfig {
  isNative?: boolean;
}

const TOKEN_OPTIONS: TokenOption[] = [
  { ...NATIVE_ETH_CONFIG, isNative: true },
  ...TOKEN_LIST,
];

interface TradeRow {
  id: string;
  sellToken: TokenOption;
  buyToken: TokenOption;
  sellAmount: string;
  quote: Record<string, unknown> | null;
  outputAmount: string;
  status: "idle" | "quoting" | "quoted" | "error";
  error: string;
}

let nextTradeId = 1;
function createTradeRow(): TradeRow {
  const id = `TR${nextTradeId++}`;
  return {
    id,
    sellToken: TOKEN_OPTIONS[0],
    buyToken: TOKEN_OPTIONS[2],
    sellAmount: "",
    quote: null,
    outputAmount: "",
    status: "idle",
    error: "",
  };
}

type BatchStep = "idle" | "quoting" | "quoted" | "executing" | "done" | "error";

export default function BatchSwapPanel() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { sendCallsAsync } = useSendCalls();

  const [trades, setTrades] = useState<TradeRow[]>(() => [createTradeRow()]);
  const [batchStep, setBatchStep] = useState<BatchStep>("idle");
  const [batchError, setBatchError] = useState("");
  const [txId, setTxId] = useState("");

  const updateTrade = useCallback((id: string, updates: Partial<TradeRow>) => {
    setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const addTrade = () => {
    setTrades((prev) => [...prev, createTradeRow()]);
  };

  const removeTrade = (id: string) => {
    if (trades.length <= 1) return;
    setTrades((prev) => prev.filter((t) => t.id !== id));
  };

  const resetAll = useCallback(() => {
    setTrades((prev) =>
      prev.map((t) => ({
        ...t,
        quote: null,
        outputAmount: "",
        status: "idle" as const,
        error: "",
      }))
    );
    setBatchStep("idle");
    setBatchError("");
    setTxId("");
  }, []);

  const handleQuoteAll = useCallback(async () => {
    if (!address) return;
    setBatchStep("quoting");
    setBatchError("");

    const validTrades = trades.filter(
      (t) => t.sellAmount && parseFloat(t.sellAmount) > 0
    );
    if (validTrades.length === 0) {
      setBatchError("Enter amounts for at least one trade");
      setBatchStep("error");
      return;
    }

    // Mark all valid trades as quoting
    for (const t of validTrades) {
      updateTrade(t.id, { status: "quoting", quote: null, outputAmount: "", error: "" });
    }

    let allQuoted = true;

    // Fetch quotes in parallel
    await Promise.all(
      validTrades.map(async (trade) => {
        try {
          const rawAmount = parseUnits(
            trade.sellAmount,
            trade.sellToken.decimals
          ).toString();

          const quote = await getQuote({
            swapper: address,
            tokenIn: trade.sellToken.address,
            tokenOut: trade.buyToken.address,
            tokenInChainId: BASE_SEPOLIA_CHAIN_ID,
            tokenOutChainId: BASE_SEPOLIA_CHAIN_ID,
            amount: rawAmount,
            type: "EXACT_INPUT",
            slippageTolerance: 0.5,
          });

          const outAmt = getOutputAmount(quote);
          updateTrade(trade.id, {
            quote,
            outputAmount: formatUnits(BigInt(outAmt), trade.buyToken.decimals),
            status: "quoted",
          });
        } catch (err) {
          allQuoted = false;
          updateTrade(trade.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Quote failed",
          });
        }
      })
    );

    setBatchStep(allQuoted ? "quoted" : "error");
    if (!allQuoted) setBatchError("Some quotes failed — fix errors and retry");
  }, [address, trades, updateTrade]);

  const handleExecuteBatch = useCallback(async () => {
    if (!address || !walletClient || !publicClient) return;

    const quotedTrades = trades.filter((t) => t.status === "quoted" && t.quote);
    if (quotedTrades.length === 0) return;

    setBatchStep("executing");
    setBatchError("");

    try {
      // Get EIP-5792 calls for each quoted trade
      const allCalls: BatchSwapCall[] = [];

      const batchResults = await Promise.all(
        quotedTrades.map(async (trade) => {
          const quoteResponse = trade.quote!;
          // swap_5792 expects the inner quote object, not the full response
          const innerQuote = quoteResponse.quote as Record<string, unknown>;

          const params: Record<string, unknown> = {
            quote: innerQuote,
            urgency: "urgent",
          };

          // Sign and include permitData if present
          if (quoteResponse.permitData) {
            const permitData = quoteResponse.permitData as Record<string, unknown>;
            const signature = await walletClient.signTypedData({
              domain: permitData.domain as Record<string, unknown>,
              types: permitData.types as Record<
                string,
                Array<{ name: string; type: string }>
              >,
              primaryType: Object.keys(
                permitData.types as Record<string, unknown>
              ).find((k) => k !== "EIP712Domain") as string,
              message: permitData.values as Record<string, unknown>,
            });

            params.permitData = {
              ...(permitData.values as Record<string, unknown>),
              signature,
            };
          }

          return getBatchSwap({
            quote: params.quote as Record<string, unknown>,
            permitData: params.permitData as Record<string, unknown> | undefined,
            urgency: "urgent",
          });
        })
      );

      for (const result of batchResults) {
        allCalls.push(...result.calls);
      }

      // Execute all calls as a single EIP-5792 batch
      const result = await sendCallsAsync({
        calls: allCalls.map((call) => ({
          to: call.to as `0x${string}`,
          data: call.data as `0x${string}`,
          value: BigInt(call.value || "0"),
        })),
      });

      setTxId(result.id);
      setBatchStep("done");
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch execution failed");
      setBatchStep("error");
    }
  }, [address, walletClient, publicClient, trades, sendCallsAsync]);

  if (!isConnected) {
    return (
      <div className="text-center text-zinc-400 py-12">
        Connect your wallet to start batch swapping
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[60px_1fr_1fr_1fr_1fr_40px] gap-2 px-2 text-xs text-zinc-500 uppercase tracking-wider">
        <span>Trade</span>
        <span>Sell Token</span>
        <span>Sell Amount</span>
        <span>Buy Token</span>
        <span>You Receive</span>
        <span />
      </div>

      {/* Trade rows */}
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_40px] gap-2 items-center bg-zinc-800 rounded-xl p-3"
        >
          {/* Trade ID */}
          <span className="text-sm font-mono text-violet-400 bg-violet-400/10 rounded-lg px-2 py-1 text-center">
            {trade.id}
          </span>

          {/* Sell Token */}
          <div className="flex items-center gap-1.5">
            <TokenIcon symbol={trade.sellToken.symbol} size="sm" />
            <select
              className="bg-zinc-700 text-white rounded-lg px-2 py-2 text-sm border border-zinc-600 flex-1 min-w-0"
              value={trade.sellToken.symbol}
              onChange={(e) => {
                const t = TOKEN_OPTIONS.find((o) => o.symbol === e.target.value)!;
                updateTrade(trade.id, { sellToken: t, quote: null, outputAmount: "", status: "idle" });
              }}
              disabled={batchStep === "executing"}
            >
              {TOKEN_OPTIONS.filter((o) => o.symbol !== trade.buyToken.symbol).map(
                (o) => (
                  <option key={o.symbol} value={o.symbol}>
                    {o.symbol}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Sell Amount */}
          <input
            type="text"
            placeholder="0.0"
            className="bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm border border-zinc-600 w-full outline-none focus:border-violet-500 transition"
            value={trade.sellAmount}
            onChange={(e) => {
              updateTrade(trade.id, {
                sellAmount: e.target.value,
                quote: null,
                outputAmount: "",
                status: "idle",
              });
              if (batchStep !== "idle") resetAll();
            }}
            disabled={batchStep === "executing"}
          />

          {/* Buy Token */}
          <div className="flex items-center gap-1.5">
            <TokenIcon symbol={trade.buyToken.symbol} size="sm" />
            <select
              className="bg-zinc-700 text-white rounded-lg px-2 py-2 text-sm border border-zinc-600 flex-1 min-w-0"
              value={trade.buyToken.symbol}
              onChange={(e) => {
                const t = TOKEN_OPTIONS.find((o) => o.symbol === e.target.value)!;
                updateTrade(trade.id, { buyToken: t, quote: null, outputAmount: "", status: "idle" });
              }}
              disabled={batchStep === "executing"}
            >
              {TOKEN_OPTIONS.filter((o) => o.symbol !== trade.sellToken.symbol).map(
                (o) => (
                  <option key={o.symbol} value={o.symbol}>
                    {o.symbol}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Output */}
          <div className="text-sm text-white px-2 truncate">
            {trade.status === "quoting" ? (
              <span className="text-zinc-500 animate-pulse">quoting...</span>
            ) : trade.outputAmount ? (
              <span className="text-green-400">
                +{trade.outputAmount} {trade.buyToken.symbol}
              </span>
            ) : trade.error ? (
              <span className="text-red-400 text-xs" title={trade.error}>
                failed
              </span>
            ) : (
              <span className="text-zinc-600">—</span>
            )}
          </div>

          {/* Remove button */}
          <button
            onClick={() => removeTrade(trade.id)}
            disabled={trades.length <= 1 || batchStep === "executing"}
            className="text-zinc-500 hover:text-red-400 disabled:opacity-20 transition text-lg"
            title="Remove trade"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add trade button */}
      <button
        onClick={addTrade}
        disabled={batchStep === "executing"}
        className="w-full border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 rounded-xl py-2 text-sm transition disabled:opacity-30"
      >
        + Add Trade
      </button>

      {/* Action buttons */}
      {batchStep === "idle" || batchStep === "error" ? (
        <button
          onClick={handleQuoteAll}
          disabled={!trades.some((t) => t.sellAmount && parseFloat(t.sellAmount) > 0)}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-4 rounded-xl transition text-lg"
        >
          Get Quotes
        </button>
      ) : batchStep === "quoted" ? (
        <button
          onClick={handleExecuteBatch}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-4 rounded-xl transition text-lg"
        >
          Execute Batch ({trades.filter((t) => t.status === "quoted").length}{" "}
          {trades.filter((t) => t.status === "quoted").length === 1
            ? "swap"
            : "swaps"}
          )
        </button>
      ) : batchStep === "done" ? (
        <div className="text-center space-y-2">
          <div className="text-green-400 font-semibold">
            Batch swap submitted!
          </div>
          {txId && (
            <p className="text-xs text-zinc-500 font-mono break-all">
              Batch ID: {txId}
            </p>
          )}
          <button
            onClick={resetAll}
            className="block mx-auto mt-2 text-sm text-zinc-400 hover:text-white"
          >
            New batch
          </button>
        </div>
      ) : (
        <button
          disabled
          className="w-full bg-zinc-700 text-zinc-400 font-semibold py-4 rounded-xl text-lg"
        >
          {batchStep === "quoting" && "Getting quotes..."}
          {batchStep === "executing" && "Confirm batch in wallet..."}
        </button>
      )}

      {/* Error display */}
      {batchError && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
          {batchError}
        </div>
      )}
    </div>
  );
}
