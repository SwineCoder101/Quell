import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, type Chain } from "wagmi/chains";

export const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
};

export const config = getDefaultConfig({
  appName: "Quell",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [sepolia, arcTestnet],
  ssr: true,
});
