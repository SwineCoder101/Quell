// Uniswap V3 contract addresses on Base Sepolia (Chain ID: 84532)
export const CONTRACTS = {
  UNISWAP_V3_FACTORY: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as const,
  SWAP_ROUTER_02: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" as const,
  QUOTER_V2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27" as const,
  NONFUNGIBLE_POSITION_MANAGER:
    "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2" as const,
  UNIVERSAL_ROUTER: "0x492E6456D9528771018DeB9E87ef7750EF184104" as const,
} as const;

// Token addresses are managed in token-config.ts (deployed mock tokens)
export { DEPLOYED_TOKENS as TOKENS } from "./token-config";

// Fee tiers available on Uniswap V3
export const FEE_TIERS = {
  LOWEST: 100, // 0.01%
  LOW: 500, // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000, // 1%
} as const;

export const FEE_TIER_OPTIONS = [
  { value: FEE_TIERS.LOWEST, label: "0.01%" },
  { value: FEE_TIERS.LOW, label: "0.05%" },
  { value: FEE_TIERS.MEDIUM, label: "0.3%" },
  { value: FEE_TIERS.HIGH, label: "1%" },
];
