"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { config } from "@/lib/wagmi";
import { sepolia } from "wagmi/chains";
import { useState } from "react";
import { Toaster } from "sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={sepolia}
          theme={darkTheme({
            accentColor: "#f0b90b",
            accentColorForeground: "#0b0e11",
            borderRadius: "small",
          })}
        >
          {children}
          <Toaster theme="dark" position="bottom-right" richColors />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
