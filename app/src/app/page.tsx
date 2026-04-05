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
    key: "batch",
    label: "Batch Swap",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16V4m0 0l-4 4m4-4l4 4" />
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
      <aside className="w-52 flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-14" style={{ borderBottom: '1px solid rgba(42,37,32,0.06)' }}>
          {/* Beach umbrella icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C7 2 3 6.5 3 12h9V2z" fill="url(#umbrella-left)" opacity="0.9"/>
            <path d="M12 2c5 0 9 4.5 9 10h-9V2z" fill="url(#umbrella-right)" opacity="0.9"/>
            <line x1="12" y1="2" x2="12" y2="22" stroke="#c4a882" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M12 22c0-2 2-3 3-3" stroke="#c4a882" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <defs>
              <linearGradient id="umbrella-left" x1="3" y1="2" x2="12" y2="12">
                <stop offset="0%" stopColor="#e85d4a"/>
                <stop offset="100%" stopColor="#e89b30"/>
              </linearGradient>
              <linearGradient id="umbrella-right" x1="12" y1="2" x2="21" y2="12">
                <stop offset="0%" stopColor="#e89b30"/>
                <stop offset="100%" stopColor="#ffd4a8"/>
              </linearGradient>
            </defs>
          </svg>
          <span
            className="text-[17px] italic"
            style={{ fontFamily: 'var(--font-instrument-serif), Georgia, serif', color: '#2a2520' }}
          >
            Tranquille
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] transition-all duration-200 ${
                activeTab === item.key
                  ? "text-[#e85d4a] font-medium"
                  : "text-[#8a7e70] hover:text-[#5a5045]"
              }`}
              style={
                activeTab === item.key
                  ? {
                      background: 'rgba(232,93,74,0.06)',
                      borderRadius: '0 8px 8px 0',
                      boxShadow: 'inset 2px 0 0 #e85d4a',
                    }
                  : { borderRadius: '8px' }
              }
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(42,37,32,0.06)' }}>
          <div className="text-[9px] font-mono tracking-[0.15em] uppercase" style={{ color: '#b8ad9e' }}>
            Uniswap V3 + V4
          </div>
          <div className="text-[9px] font-mono tracking-[0.15em] uppercase mt-1" style={{ color: '#cec4b5' }}>
            Sepolia Testnet
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-6 h-12" style={{ borderBottom: '1px solid rgba(42,37,32,0.06)' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-[13px] font-medium text-foreground tracking-tight">
              {NAV_ITEMS.find((n) => n.key === activeTab)?.label}
            </h2>
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-mono tracking-[0.12em] uppercase"
              style={{
                background: 'rgba(232,155,48,0.08)',
                color: '#c07d20',
                border: '1px solid rgba(232,155,48,0.15)',
              }}
            >
              Sepolia
            </span>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === "batch" && (
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-all duration-200"
                style={
                  chatOpen
                    ? {
                        background: 'rgba(232,93,74,0.06)',
                        color: '#e85d4a',
                        border: '1px solid rgba(232,93,74,0.15)',
                      }
                    : {
                        color: '#8a7e70',
                        border: '1px solid rgba(42,37,32,0.08)',
                      }
                }
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: chatOpen ? '#e85d4a' : '#b8ad9e',
                    boxShadow: chatOpen ? '0 0 6px rgba(232,93,74,0.3)' : 'none',
                  }}
                />
                Agent
              </button>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                if (!connected) {
                  return (
                    <button
                      onClick={openConnectModal}
                      className="text-[12px] font-medium px-4 py-1.5 rounded-full transition-all duration-200"
                      style={{
                        background: '#e85d4a',
                        color: '#fff',
                      }}
                    >
                      Connect
                    </button>
                  );
                }
                return (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={openChainModal}
                      className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full transition-all duration-200"
                      style={{
                        color: '#5a5045',
                        border: '1px solid rgba(42,37,32,0.08)',
                        background: 'rgba(42,37,32,0.02)',
                      }}
                    >
                      {chain.hasIcon && chain.iconUrl && (
                        <img src={chain.iconUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                      )}
                      <span className="font-mono tracking-tight">{chain.name}</span>
                    </button>
                    <button
                      onClick={openAccountModal}
                      className="flex items-center gap-2 text-[11px] px-3 py-1 rounded-full transition-all duration-200"
                      style={{
                        color: '#2a2520',
                        border: '1px solid rgba(42,37,32,0.08)',
                        background: 'rgba(42,37,32,0.02)',
                      }}
                    >
                      {account.displayBalance && (
                        <span className="font-mono" style={{ color: '#5a5045' }}>
                          {account.displayBalance}
                        </span>
                      )}
                      <span
                        className="font-mono px-1.5 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(232,93,74,0.06)',
                          color: '#e85d4a',
                          fontSize: '10px',
                        }}
                      >
                        {account.displayName}
                      </span>
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto min-h-0">
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

