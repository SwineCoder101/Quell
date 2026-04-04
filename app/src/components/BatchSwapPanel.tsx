"use client";

import { useState, useCallback, forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useSendCalls } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { TOKEN_LIST, isPairQuotable, isTokenQuotable, getQuotableCounterparts, resolveTokenAddress, type TokenConfig } from "@/lib/token-config";
import type { TradeSuggestion } from "@/lib/strategy-types";
import {
  getQuote,
  getBatchSwap,
  getOutputAmount,
  type BatchSwapCall,
} from "@/lib/uniswap-api";
import TokenIcon from "@/components/TokenIcon";
import SettleButton from "@/components/SettleButton";

const SEPOLIA_CHAIN_ID = "11155111";

interface TokenOption extends TokenConfig {
  isNative?: boolean;
}

const TOKEN_OPTIONS: TokenOption[] = [
  ...TOKEN_LIST.filter((t) => isTokenQuotable(t.symbol)),
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
    sellToken: TOKEN_OPTIONS.find((t) => t.symbol === "USDC")!,
    buyToken: TOKEN_OPTIONS.find((t) => t.symbol === "WETH")!,
    sellAmount: "",
    quote: null,
    outputAmount: "",
    status: "idle",
    error: "",
  };
}

type BatchStep = "idle" | "quoting" | "quoted" | "executing" | "done" | "error";

export interface BatchSwapPanelHandle {
  applyTrades: (suggestions: TradeSuggestion[]) => void;
}

const BatchSwapPanel = forwardRef<BatchSwapPanelHandle>(function BatchSwapPanel(_props, ref) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { sendCallsAsync } = useSendCalls();

  const [trades, setTrades] = useState<TradeRow[]>(() => [createTradeRow()]);
  const [batchStep, setBatchStep] = useState<BatchStep>("idle");
  const [batchError, setBatchError] = useState("");
  const [txId, setTxId] = useState("");
  const pendingQuote = useRef(false);

  useImperativeHandle(ref, () => ({
    applyTrades(suggestions: TradeSuggestion[]) {
      const newTrades = suggestions
        .map((s) => {
          const sell = TOKEN_OPTIONS.find((t) => t.symbol === s.sellToken || (s.sellToken === "ETH" && t.symbol === "WETH"));
          const buy = TOKEN_OPTIONS.find((t) => t.symbol === s.buyToken || (s.buyToken === "ETH" && t.symbol === "WETH"));
          if (!sell || !buy) return null;
          if (!isPairQuotable(sell.symbol, buy.symbol)) return null;
          const row = createTradeRow();
          row.sellToken = sell;
          row.buyToken = buy;
          row.sellAmount = s.sellAmount;
          return row;
        })
        .filter((t): t is TradeRow => t !== null);

      if (newTrades.length > 0) {
        setTrades(newTrades);
        setBatchStep("idle");
        setBatchError("");
        setTxId("");
        pendingQuote.current = true;
      }
    },
  }));

  // Auto-quote after applying AI strategy
  useEffect(() => {
    if (pendingQuote.current && batchStep === "idle" && trades.some((t) => t.sellAmount && parseFloat(t.sellAmount) > 0)) {
      pendingQuote.current = false;
      handleQuoteAll();
    }
  });

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
            tokenIn: resolveTokenAddress(trade.sellToken, trade.buyToken.symbol),
            tokenOut: resolveTokenAddress(trade.buyToken, trade.sellToken.symbol),
            tokenInChainId: SEPOLIA_CHAIN_ID,
            tokenOutChainId: SEPOLIA_CHAIN_ID,
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
              {TOKEN_OPTIONS.filter((o) => o.symbol !== trade.buyToken.symbol && isTokenQuotable(o.symbol)).map(
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
              {TOKEN_OPTIONS.filter((o) => {
                const counterparts = getQuotableCounterparts(trade.sellToken.symbol);
                return o.symbol !== trade.sellToken.symbol && counterparts.includes(o.symbol);
              }).map(
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
            {!isPairQuotable(trade.sellToken.symbol, trade.buyToken.symbol) ? (
              <span className="text-amber-400 text-xs" title="This pair only has V4 liquidity — RFQ unavailable">
                No RFQ
              </span>
            ) : trade.status === "quoting" ? (
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

      {/* PnL Summary */}
      <BatchPnL trades={trades} />

      {/* Action buttons */}
      <div className="flex gap-2">
        {batchStep === "idle" || batchStep === "error" ? (
          <button
            onClick={handleQuoteAll}
            disabled={!trades.some((t) => t.sellAmount && parseFloat(t.sellAmount) > 0 && isPairQuotable(t.sellToken.symbol, t.buyToken.symbol))}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold py-4 rounded-xl transition text-lg"
          >
            Request Quotes (RFQ)
          </button>
        ) : batchStep === "quoting" ? (
          <button
            disabled
            className="flex-1 bg-zinc-700 text-zinc-400 font-semibold py-4 rounded-xl text-lg"
          >
            Requesting quotes...
          </button>
        ) : null}

        {batchStep === "quoted" ? (
          <>
            <button
              onClick={resetAll}
              className="px-6 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-semibold py-4 rounded-xl transition text-sm"
            >
              Reset
            </button>
            <button
              onClick={handleExecuteBatch}
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-4 rounded-xl transition text-lg"
            >
              Submit Batch ({trades.filter((t) => t.status === "quoted").length}{" "}
              {trades.filter((t) => t.status === "quoted").length === 1 ? "swap" : "swaps"})
            </button>
          </>
        ) : null}

        {batchStep === "executing" ? (
          <button
            disabled
            className="flex-1 bg-zinc-700 text-zinc-400 font-semibold py-4 rounded-xl text-lg animate-pulse"
          >
            Confirm batch in wallet...
          </button>
        ) : null}
      </div>

      {/* Done state */}
      {batchStep === "done" && (
        <div className="text-center space-y-2 bg-green-900/10 border border-green-800/30 rounded-xl p-4">
          <div className="text-green-400 font-semibold text-lg">
            Batch swap submitted!
          </div>
          {txId && (
            <p className="text-xs text-zinc-500 font-mono break-all">
              Batch ID: {txId}
            </p>
          )}
          <button
            onClick={resetAll}
            className="mt-2 px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition"
          >
            New Batch
          </button>
        </div>
      )}

      {/* Error display */}
      {batchError && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">
          {batchError}
        </div>
      )}

      {/* Settle to Arc */}
      <SettleButton />
    </div>
  );
});

export default BatchSwapPanel;

// ── PnL Summary Component ──
function BatchPnL({ trades }: { trades: TradeRow[] }) {
  const quotedTrades = trades.filter((t) => t.status === "quoted" && t.outputAmount);
  const failedTrades = trades.filter((t) => t.status === "error");
  const pendingTrades = trades.filter((t) => t.sellAmount && parseFloat(t.sellAmount) > 0 && t.status === "idle");

  if (quotedTrades.length === 0 && failedTrades.length === 0) return null;

  // Aggregate sell/buy amounts by token
  const sellTotals = new Map<string, number>();
  const buyTotals = new Map<string, number>();

  for (const t of quotedTrades) {
    const sellAmt = parseFloat(t.sellAmount) || 0;
    const buyAmt = parseFloat(t.outputAmount) || 0;
    sellTotals.set(t.sellToken.symbol, (sellTotals.get(t.sellToken.symbol) || 0) + sellAmt);
    buyTotals.set(t.buyToken.symbol, (buyTotals.get(t.buyToken.symbol) || 0) + buyAmt);
  }

  // Net position per token (positive = receiving, negative = spending)
  const netPositions = new Map<string, number>();
  for (const [sym, amt] of sellTotals) {
    netPositions.set(sym, (netPositions.get(sym) || 0) - amt);
  }
  for (const [sym, amt] of buyTotals) {
    netPositions.set(sym, (netPositions.get(sym) || 0) + amt);
  }

  const sortedPositions = [...netPositions.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Batch Summary</h3>
        <div className="flex gap-2 text-xs">
          {quotedTrades.length > 0 && (
            <span className="text-green-400">{quotedTrades.length} quoted</span>
          )}
          {failedTrades.length > 0 && (
            <span className="text-red-400">{failedTrades.length} failed</span>
          )}
          {pendingTrades.length > 0 && (
            <span className="text-zinc-500">{pendingTrades.length} pending</span>
          )}
        </div>
      </div>

      {/* Sell side */}
      {sellTotals.size > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">You spend</p>
          <div className="flex flex-wrap gap-2">
            {[...sellTotals.entries()].map(([sym, amt]) => (
              <div key={`sell-${sym}`} className="flex items-center gap-1.5 bg-red-900/20 border border-red-800/30 rounded-lg px-2.5 py-1.5">
                <TokenIcon symbol={sym} size="sm" />
                <span className="text-sm font-mono text-red-400">-{formatPnL(amt)}</span>
                <span className="text-xs text-red-400/60">{sym}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buy side */}
      {buyTotals.size > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">You receive</p>
          <div className="flex flex-wrap gap-2">
            {[...buyTotals.entries()].map(([sym, amt]) => (
              <div key={`buy-${sym}`} className="flex items-center gap-1.5 bg-green-900/20 border border-green-800/30 rounded-lg px-2.5 py-1.5">
                <TokenIcon symbol={sym} size="sm" />
                <span className="text-sm font-mono text-green-400">+{formatPnL(amt)}</span>
                <span className="text-xs text-green-400/60">{sym}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net position */}
      {sortedPositions.length > 0 && (
        <div className="border-t border-zinc-700/50 pt-3 space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Net Position</p>
          <div className="flex flex-wrap gap-2">
            {sortedPositions.map(([sym, net]) => (
              <div
                key={`net-${sym}`}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${
                  net > 0
                    ? "bg-green-900/10 border border-green-800/20"
                    : "bg-red-900/10 border border-red-800/20"
                }`}
              >
                <TokenIcon symbol={sym} size="sm" />
                <span
                  className={`text-sm font-mono ${
                    net > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {net > 0 ? "+" : ""}{formatPnL(net)}
                </span>
                <span className="text-xs text-zinc-500">{sym}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPnL(num: number): string {
  const abs = Math.abs(num);
  if (abs === 0) return "0";
  if (abs < 0.0001) return abs.toExponential(2);
  if (abs < 1) return abs.toPrecision(4);
  if (abs < 1000) return abs.toFixed(2);
  if (abs < 1_000_000) return abs.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${(abs / 1_000_000).toFixed(2)}M`;
}
