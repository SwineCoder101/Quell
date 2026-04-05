"use client";

import type { TradeSuggestion } from "@/lib/strategy-types";
import TokenIcon from "@/components/TokenIcon";

interface TradeSuggestionCardProps {
  summary: string;
  trades: TradeSuggestion[];
  onApply: () => void;
  applied?: boolean;
}

export default function TradeSuggestionCard({
  summary,
  trades,
  onApply,
  applied,
}: TradeSuggestionCardProps) {
  return (
    <div className="bg-cex-gold/5 border border-cex-gold/15 rounded p-3 space-y-2">
      <p className="text-xs text-cex-gold">{summary}</p>

      <div className="space-y-1.5">
        {trades.map((trade, i) => {
          if (!trade.sellToken || !trade.buyToken) return null;
          return (
            <div
              key={i}
              className="flex items-center gap-2 bg-cex-surface rounded px-2.5 py-1.5"
            >
            <TokenIcon symbol={trade.sellToken} size="sm" />
            <span className="text-xs font-mono text-cex-red">
              -{trade.sellAmount}
            </span>
            <span className="text-[10px] text-cex-tertiary">{trade.sellToken}</span>
            <svg
              className="w-3 h-3 text-cex-tertiary flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
            <TokenIcon symbol={trade.buyToken} size="sm" />
            <span className="text-[10px] text-cex-tertiary">{trade.buyToken}</span>
            {trade.reasoning && (
              <span className="text-[9px] text-cex-tertiary ml-auto truncate max-w-[100px]" title={trade.reasoning}>
                {trade.reasoning}
              </span>
            )}
          </div>
          );
        })}
      </div>

      <button
        onClick={onApply}
        disabled={applied}
        className={`w-full text-xs font-medium py-1.5 rounded transition ${
          applied
            ? "bg-cex-green/10 text-cex-green border border-cex-green/20"
            : "bg-cex-gold hover:bg-cex-gold/90 text-[#0b0e11]"
        }`}
      >
        {applied ? "Applied" : "Apply to Batch"}
      </button>
    </div>
  );
}
