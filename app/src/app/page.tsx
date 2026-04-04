import { ConnectButton } from "@rainbow-me/rainbowkit";
import SwapPanel from "@/components/SwapPanel";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight">Quell</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded-full">
            Base Sepolia
          </span>
          <ConnectButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Swap</h2>
            <SwapPanel />
          </div>
          <p className="text-center text-xs text-zinc-600 mt-4">
            Powered by Uniswap Trading API on Base Sepolia testnet
          </p>
        </div>
      </main>
    </div>
  );
}
