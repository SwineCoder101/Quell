"use client";

import { useState, useCallback, forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { useSendCalls, useCallsStatus } from "wagmi";
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
import { toast } from "sonner";
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

type BatchStep = "idle" | "quoting" | "quoted" | "executing" | "pending" | "done" | "error";

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
  const toastShownRef = useRef(false);
  const pendingQuote = useRef(false);

  const { data: callsStatus } = useCallsStatus({
    id: txId || undefined as unknown as string,
    query: { enabled: !!txId, refetchInterval: 1000 },
  });

  useEffect(() => {
    if (!callsStatus || toastShownRef.current) return;

    if (
      callsStatus.status === "success" &&
      callsStatus.receipts?.length
    ) {
      toastShownRef.current = true;
      setBatchStep("done");
      const txHash = callsStatus.receipts[0].transactionHash;
      toast.success("Batch confirmed!", {
        description: "View transaction on Etherscan",
        action: {
          label: "Open",
          onClick: () => window.open(`https://sepolia.etherscan.io/tx/${txHash}`, "_blank"),
        },
        duration: 10000,
      });
    } else if (callsStatus.status === "failure") {
      setBatchStep("error");
      setBatchError("Transaction failed on-chain");
    }
  }, [callsStatus]);

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

    for (const t of validTrades) {
      updateTrade(t.id, { status: "quoting", quote: null, outputAmount: "", error: "" });
    }

    let allQuoted = true;

    // Quote sequentially with a small delay to avoid rate limits
    for (const trade of validTrades) {
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

        // Small delay between quotes to avoid 429 rate limits
        if (validTrades.indexOf(trade) < validTrades.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (err) {
        allQuoted = false;
        updateTrade(trade.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Quote failed",
        });
      }
    }

    setBatchStep(allQuoted ? "quoted" : "error");
    if (!allQuoted) setBatchError("Some quotes failed — check errors below");
  }, [address, trades, updateTrade]);

  const handleExecuteBatch = useCallback(async () => {
    if (!address || !walletClient || !publicClient) return;

    const quotedTrades = trades.filter((t) => t.status === "quoted" && t.quote);
    if (quotedTrades.length === 0) return;

    setBatchStep("executing");
    setBatchError("");

    try {
      const allCalls: BatchSwapCall[] = [];

      // For each trade, call swap_5792 with { quote, permitData }.
      // No signature needed — EIP-5792 batches approval + swap into calls the wallet executes together.
      for (const trade of quotedTrades) {
        const quoteResponse = trade.quote!;
        const quote = quoteResponse.quote as Record<string, unknown>;
        const permitData = quoteResponse.permitData as Record<string, unknown> | null;

        const result = await getBatchSwap(quote, permitData, "urgent");
        allCalls.push(...result.calls);
      }

      const result = await sendCallsAsync({
        calls: allCalls.map((call) => ({
          to: call.to as `0x${string}`,
          data: call.data as `0x${string}`,
          value: BigInt(call.value || "0"),
        })),
      });

      toastShownRef.current = false;
      setTxId(result.id);
      setBatchStep("pending");
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch execution failed");
      setBatchStep("error");
    }
  }, [address, walletClient, publicClient, trades, sendCallsAsync]);

  if (!isConnected) {
    return (
      <div className="text-center text-cex-secondary py-12">
        Connect your wallet to start batch swapping
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[60px_1fr_1fr_1fr_1fr_36px] gap-2 px-3 py-2 text-[10px] text-cex-tertiary uppercase tracking-wider bg-cex-surface border border-cex-border rounded-t">
        <span>Trade</span>
        <span>Sell Token</span>
        <span>Sell Amount</span>
        <span>Buy Token</span>
        <span>You Receive</span>
        <span />
      </div>

      {/* Trade rows */}
      {trades.map((trade, idx) => (
        <div
          key={trade.id}
          className={`grid grid-cols-[60px_1fr_1fr_1fr_1fr_36px] gap-2 items-center bg-cex-surface border border-cex-border px-3 py-2.5 ${
            idx === 0 ? "-mt-3 rounded-b" : "rounded"
          }`}
        >
          {/* Trade ID */}
          <span className="text-xs font-mono text-cex-gold bg-cex-gold/10 rounded px-2 py-1 text-center">
            {trade.id}
          </span>

          {/* Sell Token */}
          <div className="flex items-center gap-1.5">
            <TokenIcon symbol={trade.sellToken.symbol} size="sm" />
            <select
              className="bg-cex-surface-hover text-foreground rounded px-2 py-1.5 text-sm border border-cex-border flex-1 min-w-0 outline-none focus:border-cex-gold transition"
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
            className="bg-cex-surface-hover text-foreground rounded px-3 py-1.5 text-sm border border-cex-border w-full outline-none focus:border-cex-gold transition font-mono"
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
              className="bg-cex-surface-hover text-foreground rounded px-2 py-1.5 text-sm border border-cex-border flex-1 min-w-0 outline-none focus:border-cex-gold transition"
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
          <div className="text-sm text-foreground px-2 truncate font-mono">
            {!isPairQuotable(trade.sellToken.symbol, trade.buyToken.symbol) ? (
              <span className="text-cex-red text-xs">No RFQ</span>
            ) : trade.status === "quoting" ? (
              <span className="text-cex-tertiary animate-pulse">quoting...</span>
            ) : trade.outputAmount ? (
              <span className="text-cex-green">
                +{trade.outputAmount} {trade.buyToken.symbol}
              </span>
            ) : trade.error ? (
              <span className="text-cex-red text-xs" title={trade.error}>
                {trade.error.length > 40 ? trade.error.slice(0, 40) + "..." : trade.error}
              </span>
            ) : (
              <span className="text-cex-tertiary">—</span>
            )}
          </div>

          {/* Remove */}
          <button
            onClick={() => removeTrade(trade.id)}
            disabled={trades.length <= 1 || batchStep === "executing"}
            className="text-cex-tertiary hover:text-cex-red disabled:opacity-20 transition text-lg"
            title="Remove trade"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add trade */}
      <button
        onClick={addTrade}
        disabled={batchStep === "executing"}
        className="w-full border border-dashed border-cex-border hover:border-cex-secondary text-cex-tertiary hover:text-cex-secondary rounded py-2 text-sm transition disabled:opacity-30"
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
            className="flex-1 bg-cex-surface border border-cex-border hover:bg-cex-surface-hover disabled:opacity-40 text-foreground font-semibold py-3 rounded transition text-sm"
          >
            Request Quotes (RFQ)
          </button>
        ) : batchStep === "quoting" ? (
          <button
            disabled
            className="flex-1 bg-cex-surface border border-cex-border text-cex-secondary font-semibold py-3 rounded text-sm"
          >
            Requesting quotes...
          </button>
        ) : null}

        {batchStep === "quoted" ? (
          <>
            <button
              onClick={resetAll}
              className="px-6 bg-cex-surface border border-cex-border hover:bg-cex-surface-hover text-cex-secondary font-semibold py-3 rounded transition text-sm"
            >
              Reset
            </button>
            <button
              onClick={handleExecuteBatch}
              className="flex-1 bg-cex-gold hover:bg-cex-gold/90 text-[#0b0e11] font-semibold py-3 rounded transition text-sm"
            >
              Submit Batch ({trades.filter((t) => t.status === "quoted").length}{" "}
              {trades.filter((t) => t.status === "quoted").length === 1 ? "swap" : "swaps"})
            </button>
          </>
        ) : null}

        {batchStep === "executing" ? (
          <button
            disabled
            className="flex-1 bg-cex-surface border border-cex-border text-cex-secondary font-semibold py-3 rounded text-sm animate-pulse"
          >
            Confirm batch in wallet...
          </button>
        ) : null}
      </div>

      {/* Pending — waiting for on-chain confirmation */}
      {batchStep === "pending" && (
        <div className="text-center space-y-2 bg-cex-gold/5 border border-cex-gold/20 rounded p-4">
          <div className="text-cex-gold font-semibold animate-pulse">
            Waiting for on-chain confirmation...
          </div>
          {txId && (
            <p className="text-xs text-cex-tertiary font-mono break-all">
              Batch ID: {txId}
            </p>
          )}
        </div>
      )}

      {/* Done — confirmed on-chain */}
      {batchStep === "done" && (
        <div className="text-center space-y-2 bg-cex-green/5 border border-cex-green/20 rounded p-4">
          <div className="text-cex-green font-semibold">
            Batch swap confirmed!
          </div>
          {txId && (
            <p className="text-xs text-cex-tertiary font-mono break-all">
              Batch ID: {txId}
            </p>
          )}
          <button
            onClick={resetAll}
            className="mt-2 px-6 py-2 bg-cex-surface border border-cex-border hover:bg-cex-surface-hover text-foreground rounded text-sm transition"
          >
            New Batch
          </button>
        </div>
      )}

      {/* Error */}
      {batchError && (
        <div className="bg-cex-red/10 border border-cex-red/30 rounded p-3 text-cex-red text-sm">
          {batchError}
        </div>
      )}

      {/* Settle */}
      <SettleButton />
    </div>
  );
});

export default BatchSwapPanel;

// ── PnL Summary ──
function BatchPnL({ trades }: { trades: TradeRow[] }) {
  const quotedTrades = trades.filter((t) => t.status === "quoted" && t.outputAmount);
  const failedTrades = trades.filter((t) => t.status === "error");
  const pendingTrades = trades.filter((t) => t.sellAmount && parseFloat(t.sellAmount) > 0 && t.status === "idle");

  if (quotedTrades.length === 0 && failedTrades.length === 0) return null;

  // Build per-trade flow data for the receipt
  const tradeFlows = quotedTrades.map((t) => ({
    sellSymbol: t.sellToken.symbol,
    sellAmount: parseFloat(t.sellAmount) || 0,
    buySymbol: t.buyToken.symbol,
    buyAmount: parseFloat(t.outputAmount) || 0,
  }));

  // Aggregate totals
  const sellTotals = new Map<string, number>();
  const buyTotals = new Map<string, number>();
  for (const f of tradeFlows) {
    sellTotals.set(f.sellSymbol, (sellTotals.get(f.sellSymbol) || 0) + f.sellAmount);
    buyTotals.set(f.buySymbol, (buyTotals.get(f.buySymbol) || 0) + f.buyAmount);
  }

  const netPositions = new Map<string, number>();
  for (const [sym, amt] of sellTotals) netPositions.set(sym, (netPositions.get(sym) || 0) - amt);
  for (const [sym, amt] of buyTotals) netPositions.set(sym, (netPositions.get(sym) || 0) + amt);

  const gains = [...netPositions.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const losses = [...netPositions.entries()].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);

  const totalSwaps = quotedTrades.length;

  return (
    <div className="relative overflow-hidden rounded border border-cex-border">
      {/* Subtle gradient top accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cex-gold/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-cex-surface">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-cex-gold/10 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-cex-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Settlement Preview</h3>
            <p className="text-[10px] text-cex-tertiary">
              {totalSwaps} {totalSwaps === 1 ? "swap" : "swaps"} via Uniswap V3
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {failedTrades.length > 0 && (
            <span className="text-[10px] bg-cex-red/10 text-cex-red px-2 py-0.5 rounded font-medium">
              {failedTrades.length} failed
            </span>
          )}
          {pendingTrades.length > 0 && (
            <span className="text-[10px] bg-cex-surface-hover text-cex-tertiary px-2 py-0.5 rounded font-medium">
              {pendingTrades.length} pending
            </span>
          )}
        </div>
      </div>

      {/* Trade flow rows — each trade as a mini receipt line */}
      <div className="border-t border-cex-border">
        {tradeFlows.map((flow, i) => (
          <div
            key={i}
            className={`grid grid-cols-[1fr_32px_1fr] items-center px-5 py-3 ${
              i > 0 ? "border-t border-cex-border/40" : ""
            } bg-background`}
          >
            {/* Sell side */}
            <div className="flex items-center gap-2.5">
              <TokenIcon symbol={flow.sellSymbol} size="sm" />
              <span className="text-[13px] font-mono text-cex-red font-medium">
                -{formatPnL(flow.sellAmount)}
              </span>
              <span className="text-[11px] text-cex-tertiary">{flow.sellSymbol}</span>
            </div>

            {/* Flow arrow */}
            <div className="flex justify-center">
              <svg className="w-4 h-4 text-cex-tertiary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>

            {/* Buy side */}
            <div className="flex items-center gap-2.5 justify-end">
              <span className="text-[11px] text-cex-tertiary">{flow.buySymbol}</span>
              <span className="text-[13px] font-mono text-cex-green font-medium">
                +{formatPnL(flow.buyAmount)}
              </span>
              <TokenIcon symbol={flow.buySymbol} size="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* Net position — the bottom line */}
      {(gains.length > 0 || losses.length > 0) && (
        <div className="border-t border-cex-border bg-cex-surface px-5 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cex-tertiary uppercase tracking-wider font-medium">Net Change</span>
            <div className="flex items-center gap-3">
              {gains.map(([sym, net]) => (
                <div key={`g-${sym}`} className="flex items-center gap-1.5">
                  <TokenIcon symbol={sym} size="sm" />
                  <span className="text-[13px] font-mono font-semibold text-cex-green">
                    +{formatPnL(net)}
                  </span>
                  <span className="text-[10px] text-cex-tertiary">{sym}</span>
                </div>
              ))}
              {gains.length > 0 && losses.length > 0 && (
                <span className="text-cex-border mx-0.5">/</span>
              )}
              {losses.map(([sym, net]) => (
                <div key={`l-${sym}`} className="flex items-center gap-1.5">
                  <TokenIcon symbol={sym} size="sm" />
                  <span className="text-[13px] font-mono font-semibold text-cex-red">
                    {formatPnL(net)}
                  </span>
                  <span className="text-[10px] text-cex-tertiary">{sym}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPnL(num: number): string {
  const abs = Math.abs(num);
  if (abs === 0) return "0";
  if (abs < 0.000001) return abs.toExponential(2);
  if (abs < 0.01) return abs.toPrecision(3);
  if (abs < 1) return abs.toFixed(4);
  if (abs < 10000) return abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs < 1_000_000) return abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${(abs / 1_000_000).toFixed(2)}M`;
}
