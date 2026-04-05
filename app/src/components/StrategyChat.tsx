"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { TradeSuggestion } from "@/lib/strategy-types";
import TradeSuggestionCard from "@/components/TradeSuggestionCard";

interface StrategyChatProps {
  balances: { symbol: string; formatted: string }[];
  onApplyStrategy: (trades: TradeSuggestion[]) => void;
}

export default function StrategyChat({
  balances,
  onApplyStrategy,
}: StrategyChatProps) {
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { balances },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleApply = (toolCallId: string, trades: TradeSuggestion[]) => {
    onApplyStrategy(trades);
    setAppliedIds((prev) => new Set(prev).add(toolCallId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    sendMessage({ text });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-cex-border bg-cex-surface">
        <div className="w-1.5 h-1.5 rounded-full bg-cex-gold animate-pulse" />
        <span className="text-sm font-medium text-foreground">Strategy Agent</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-cex-tertiary text-xs py-8 space-y-2">
            <p className="text-sm text-cex-secondary">Describe a strategy</p>
            <p>
              e.g. &quot;Swap 50% of my WETH into stablecoins&quot;
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[90%] space-y-2 ${
                message.role === "user"
                  ? "bg-cex-surface border border-cex-border rounded rounded-br-sm px-3 py-2"
                  : ""
              }`}
            >
              {message.parts.map((part, i) => {
                if (part.type === "text" && part.text) {
                  return (
                    <p
                      key={i}
                      className={`text-sm whitespace-pre-wrap ${
                        message.role === "user"
                          ? "text-foreground"
                          : "text-cex-secondary bg-cex-surface/50 border border-cex-border/50 rounded rounded-bl-sm px-3 py-2"
                      }`}
                    >
                      {part.text}
                    </p>
                  );
                }

                if (
                  "toolCallId" in part &&
                  part.type === "tool-suggest_trades" &&
                  "input" in part &&
                  part.input
                ) {
                  const input = part.input as {
                    summary?: string;
                    trades?: TradeSuggestion[];
                  };
                  if (!input.trades) return null;
                  return (
                    <TradeSuggestionCard
                      key={part.toolCallId}
                      summary={input.summary || ""}
                      trades={input.trades}
                      onApply={() =>
                        handleApply(part.toolCallId, input.trades!)
                      }
                      applied={appliedIds.has(part.toolCallId)}
                    />
                  );
                }

                return null;
              })}
            </div>
          </div>
        ))}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="bg-cex-surface border border-cex-border rounded px-3 py-2">
                <span className="text-sm text-cex-tertiary animate-pulse">
                  Thinking...
                </span>
              </div>
            </div>
          )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-cex-red bg-cex-red/5 border-t border-cex-red/20">
          {error.message}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-cex-border p-3 bg-cex-surface">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a strategy..."
            className="flex-1 bg-cex-surface-hover border border-cex-border rounded px-3 py-2 text-sm text-foreground placeholder-cex-tertiary outline-none focus:border-cex-gold transition"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-cex-gold hover:bg-cex-gold/90 disabled:bg-cex-surface disabled:border disabled:border-cex-border disabled:text-cex-tertiary text-[#0b0e11] rounded px-3 py-2 text-sm font-medium transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
