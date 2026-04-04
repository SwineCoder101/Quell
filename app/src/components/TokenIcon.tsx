"use client";

import { useState } from "react";
import { getTokenLogoURI } from "@/lib/token-config";

const FALLBACK_COLORS: Record<string, string> = {
  ETH: "from-blue-500 to-blue-700",
  WETH: "from-blue-400 to-blue-600",
  USDC: "from-blue-400 to-cyan-500",
  USDT: "from-emerald-400 to-emerald-600",
  DAI: "from-amber-400 to-amber-600",
  WBTC: "from-orange-400 to-orange-600",
  LINK: "from-blue-500 to-blue-800",
  UNI: "from-pink-400 to-pink-600",
  AAVE: "from-purple-400 to-purple-700",
  ARB: "from-blue-400 to-blue-700",
  OP: "from-red-400 to-red-600",
  SNX: "from-cyan-400 to-blue-600",
  MKR: "from-teal-400 to-teal-700",
  COMP: "from-green-400 to-green-600",
  CRV: "from-yellow-500 to-red-500",
  GRT: "from-purple-500 to-indigo-600",
  LDO: "from-sky-400 to-sky-600",
  PEPE: "from-green-400 to-green-700",
  SHIB: "from-orange-400 to-red-500",
  MATIC: "from-purple-500 to-purple-700",
  DOGE: "from-yellow-400 to-yellow-600",
};

interface TokenIconProps {
  symbol: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "w-6 h-6 text-[9px]",
  md: "w-8 h-8 text-[10px]",
  lg: "w-10 h-10 text-xs",
};

export default function TokenIcon({ symbol, size = "lg", className = "" }: TokenIconProps) {
  const [imgError, setImgError] = useState(false);
  const logoURI = getTokenLogoURI(symbol);
  const sizeClass = SIZES[size];

  if (logoURI && !imgError) {
    return (
      <img
        src={logoURI}
        alt={symbol}
        className={`${sizeClass} rounded-full object-cover ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  const gradient = FALLBACK_COLORS[symbol] || "from-zinc-500 to-zinc-700";
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white shadow-lg ${className}`}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}
