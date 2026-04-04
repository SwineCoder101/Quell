"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { config } from "@/lib/wagmi";
import { useState } from "react";

const DYNAMIC_ENV_ID = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "PLACEHOLDER";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV_ID,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
              chainId: 11155111,
              chainName: "Sepolia",
              iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
              name: "Sepolia",
              nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
              networkId: 11155111,
              rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
              vanityName: "Sepolia Testnet",
            },
          ],
        },
      }}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            {children}
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}
