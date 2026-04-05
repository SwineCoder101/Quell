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

const NAV_ITEMS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: "portfolio",
    label: "Portfolio",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    key: "pools",
    label: "Pools",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    key: "swap",
    label: "Swap",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    key: "batch",
    label: "Batch Swap",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");
  const [chatOpen, setChatOpen] = useState(true);
  const batchRef = useRef<BatchSwapPanelHandle>(null);
  const { balances } = useTokenBalances();

  const chatBalances = balances.map((b) => ({
    symbol: b.symbol,
    formatted: b.formatted,
  }));

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-cex-border bg-cex-surface flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 h-14 border-b border-cex-border">
          <div className="w-6 h-6 rounded bg-cex-gold flex items-center justify-center">
            <span className="text-[#0b0e11] font-black text-xs">Q</span>
          </div>
          <span className="text-base font-bold text-foreground tracking-tight">Quell</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${
                activeTab === item.key
                  ? "bg-cex-gold/10 text-cex-gold font-medium"
                  : "text-cex-secondary hover:text-foreground hover:bg-cex-surface-hover"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t border-cex-border">
          <div className="text-[10px] text-cex-tertiary">
            Powered by Uniswap V3 + V4
          </div>
          <div className="text-[10px] text-cex-tertiary mt-0.5">Sepolia Testnet</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-cex-border bg-cex-surface">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-foreground">
              {NAV_ITEMS.find((n) => n.key === activeTab)?.label}
            </h2>
            <span className="text-[10px] bg-cex-gold/15 text-cex-gold px-2 py-0.5 rounded font-medium">
              Sepolia
            </span>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === "batch" && (
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded transition ${
                  chatOpen
                    ? "bg-cex-gold/10 text-cex-gold"
                    : "text-cex-secondary hover:text-foreground bg-cex-surface-hover"
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-cex-gold" />
                Agent
              </button>
            )}
            <ConnectButton />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {activeTab === "batch" ? (
            <div className="flex h-full">
              <div className="flex-1 min-w-0 p-6 overflow-auto">
                <BatchSwapPanel ref={batchRef} />
              </div>
              {chatOpen && (
                <div className="w-[360px] flex-shrink-0 border-l border-cex-border hidden lg:block">
                  <StrategyChat
                    balances={chatBalances}
                    onApplyStrategy={(trades) =>
                      batchRef.current?.applyTrades(trades)
                    }
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="p-6">
              {activeTab === "portfolio" && <PortfolioPanel />}
              {activeTab === "pools" && <PoolsDashboard />}
              {activeTab === "swap" && (
                <div className="flex items-start justify-center min-h-[calc(100vh-8rem)]">
                  <div className="w-full max-w-xl pt-8">
                    <SwapPanel />
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

