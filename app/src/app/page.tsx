"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import SwapPanel from "@/components/SwapPanel";
import BatchSwapPanel from "@/components/BatchSwapPanel";
import PortfolioPanel from "@/components/PortfolioPanel";

type Tab = "portfolio" | "swap" | "batch";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");

  const maxWidth =
    activeTab === "batch"
      ? "w-full max-w-3xl"
      : activeTab === "portfolio"
        ? "w-full max-w-lg"
        : "w-full max-w-md";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight">Quell</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full">
            Base
          </span>
          <ConnectButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center pt-16 px-4">
        <div className={maxWidth}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
            {/* Tab switcher */}
            <div className="flex gap-1 mb-4 bg-zinc-800 rounded-xl p-1">
              <button
                onClick={() => setActiveTab("portfolio")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                  activeTab === "portfolio"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Portfolio
              </button>
              <button
                onClick={() => setActiveTab("swap")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                  activeTab === "swap"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Swap
              </button>
              <button
                onClick={() => setActiveTab("batch")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                  activeTab === "batch"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Batch Swap
              </button>
            </div>

            {activeTab === "portfolio" && <PortfolioPanel />}
            {activeTab === "swap" && <SwapPanel />}
            {activeTab === "batch" && <BatchSwapPanel />}
          </div>
          <p className="text-center text-xs text-zinc-600 mt-4">
            Powered by Uniswap Trading API on Base
          </p>
        </div>
      </main>
    </div>
  );
}
