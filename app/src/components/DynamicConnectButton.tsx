"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

export default function DynamicConnectButton() {
  const { primaryWallet, user, handleLogOut, setShowAuthFlow } = useDynamicContext();

  if (!user) {
    return (
      <button
        onClick={() => setShowAuthFlow?.(true)}
        className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        Connect
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm">
        <span className="text-zinc-400 text-xs">{user.email || ""}</span>
        {primaryWallet && (
          <span className="text-white font-mono text-xs ml-2">
            {primaryWallet.address.slice(0, 6)}...{primaryWallet.address.slice(-4)}
          </span>
        )}
      </div>
      <button
        onClick={handleLogOut}
        className="text-xs text-zinc-500 hover:text-red-400 transition"
      >
        ×
      </button>
    </div>
  );
}
