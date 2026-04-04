"use client";

import { useState } from "react";
import DynamicConnectButton from "@/components/DynamicConnectButton";
import SwapPanel from "@/components/SwapPanel";
import BatchSwapPanel from "@/components/BatchSwapPanel";
import PortfolioPanel from "@/components/PortfolioPanel";
import PoolsDashboard from "@/components/PoolsDashboard";
import WalletManager from "@/components/WalletManager";

type Tab = "wallet" | "portfolio" | "pools" | "swap" | "batch";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("wallet");

  const maxWidth =
    activeTab === "batch" || activeTab === "pools"
      ? "w-full max-w-4xl"
      : activeTab === "portfolio" || activeTab === "wallet"
        ? "w-full max-w-lg"
        : "w-full max-w-md";

  const tabs: { key: Tab; label: string }[] = [
    { key: "wallet", label: "Wallet" },
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
          <DynamicConnectButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center pt-16 px-4">
        <div className={maxWidth}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
            {/* Tab switcher */}
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

            {activeTab === "wallet" && <WalletManager />}
            {activeTab === "portfolio" && <PortfolioPanel />}
            {activeTab === "pools" && <PoolsDashboard />}
            {activeTab === "swap" && <SwapPanel />}
            {activeTab === "batch" && <BatchSwapPanel />}
          </div>
          <p className="text-center text-xs text-zinc-600 mt-4">
            Powered by Uniswap V3 + V4 on Sepolia
          </p>
        </div>
      </main>
    </div>
  );
}
