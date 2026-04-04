"use client";

import { useState, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import SwapPanel from "@/components/SwapPanel";
import BatchSwapPanel, { type BatchSwapPanelHandle } from "@/components/BatchSwapPanel";
import PortfolioPanel from "@/components/PortfolioPanel";
import PoolsDashboard from "@/components/PoolsDashboard";
import StrategyChat from "@/components/StrategyChat";
import { useTokenBalances } from "@/hooks/useTokenBalances";

type Tab = "portfolio" | "pools" | "swap" | "batch";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");
  const [chatOpen, setChatOpen] = useState(true);
  const batchRef = useRef<BatchSwapPanelHandle>(null);
  const { balances } = useTokenBalances();

  const chatBalances = balances.map((b) => ({
    symbol: b.symbol,
    formatted: b.formatted,
  }));

  const maxWidth =
    activeTab === "batch"
      ? "w-full max-w-7xl"
      : activeTab === "pools"
        ? "w-full max-w-4xl"
        : activeTab === "portfolio"
          ? "w-full max-w-lg"
          : "w-full max-w-md";

  const tabs: { key: Tab; label: string }[] = [
    { key: "portfolio", label: "Portfolio" },
    { key: "pools", label: "Pools" },
    { key: "swap", label: "Swap" },
    { key: "batch", label: "Batch Swap" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight">Quell</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full">
            Sepolia
          </span>
          <ConnectButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center pt-16 px-4">
        <div className={maxWidth}>
          {activeTab === "batch" ? (
            <div className="flex gap-4 items-start">
              {/* Batch panel */}
              <div className="flex-1 min-w-0">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
                  <div className="flex gap-1 mb-4 bg-zinc-800 rounded-xl p-1">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                          activeTab === tab.key
                            ? "bg-zinc-700 text-white"
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <BatchSwapPanel ref={batchRef} />
                </div>
              </div>

              {/* Strategy chat sidebar */}
              {chatOpen ? (
                <div className="w-[360px] flex-shrink-0 relative hidden lg:block">
                  <button
                    onClick={() => setChatOpen(false)}
                    className="absolute -left-3 top-3 z-10 bg-zinc-800 border border-zinc-700 rounded-full w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white transition text-xs"
                    title="Hide chat"
                  >
                    ×
                  </button>
                  <StrategyChat
                    balances={chatBalances}
                    onApplyStrategy={(trades) =>
                      batchRef.current?.applyTrades(trades)
                    }
                  />
                </div>
              ) : (
                <button
                  onClick={() => setChatOpen(true)}
                  className="flex-shrink-0 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-3 text-zinc-400 hover:text-white transition hidden lg:flex items-center gap-2"
                  title="Open strategy agent"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="text-xs font-medium">Agent</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
              <div className="flex gap-1 mb-4 bg-zinc-800 rounded-xl p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                      activeTab === tab.key
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-zinc-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "portfolio" && <PortfolioPanel />}
              {activeTab === "pools" && <PoolsDashboard />}
              {activeTab === "swap" && <SwapPanel />}
            </div>
          )}
          <p className="text-center text-xs text-zinc-600 mt-4">
            Powered by Uniswap V3 + V4 on Sepolia
          </p>
        </div>
      </main>
    </div>
  );
}
