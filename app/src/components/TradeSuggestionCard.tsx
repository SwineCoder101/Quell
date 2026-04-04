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
    <div className="bg-violet-900/20 border border-violet-800/30 rounded-xl p-3 space-y-2">
      <p className="text-xs text-violet-300">{summary}</p>

      <div className="space-y-1.5">
        {trades.map((trade, i) => {
          if (!trade.sellToken || !trade.buyToken) return null;
          return (
            <div
              key={i}
              className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-2.5 py-1.5"
            >
            <TokenIcon symbol={trade.sellToken} size="sm" />
            <span className="text-xs font-mono text-red-400">
              -{trade.sellAmount}
            </span>
            <span className="text-[10px] text-zinc-500">{trade.sellToken}</span>
            <svg
              className="w-3 h-3 text-zinc-600 flex-shrink-0"
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
            <span className="text-[10px] text-zinc-500">{trade.buyToken}</span>
            {trade.reasoning && (
              <span className="text-[9px] text-zinc-600 ml-auto truncate max-w-[100px]" title={trade.reasoning}>
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
        className={`w-full text-xs font-medium py-1.5 rounded-lg transition ${
          applied
            ? "bg-green-900/30 text-green-400 border border-green-800/30"
            : "bg-violet-600 hover:bg-violet-500 text-white"
        }`}
      >
        {applied ? "Applied" : "Apply to Batch"}
      </button>
    </div>
  );
}
