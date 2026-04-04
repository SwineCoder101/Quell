import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: false,
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
  ssr: true,
});
