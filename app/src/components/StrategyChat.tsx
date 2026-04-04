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

  // Auto-scroll to bottom on new messages
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
    <div className="flex flex-col h-[600px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
        <span className="text-sm font-medium text-white">Strategy Agent</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-xs py-8 space-y-2">
            <p className="text-sm">Describe a strategy</p>
            <p className="text-zinc-600">
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
                  ? "bg-zinc-800 rounded-xl rounded-br-sm px-3 py-2"
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
                          ? "text-white"
                          : "text-zinc-300 bg-zinc-800/50 rounded-xl rounded-bl-sm px-3 py-2"
                      }`}
                    >
                      {part.text}
                    </p>
                  );
                }

                // Tool invocation parts have type "tool-<toolName>"
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
              <div className="bg-zinc-800/50 rounded-xl px-3 py-2">
                <span className="text-sm text-zinc-500 animate-pulse">
                  Thinking...
                </span>
              </div>
            </div>
          )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-400 bg-red-900/20 border-t border-red-800/30">
          {error.message}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a strategy..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500 transition"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition"
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
