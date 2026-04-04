// Uniswap V3 contract addresses on Sepolia (Chain ID: 11155111)
export const CONTRACTS = {
  UNISWAP_V3_FACTORY: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as const,
  SWAP_ROUTER_02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as const,
  QUOTER_V2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as const,
  NONFUNGIBLE_POSITION_MANAGER:
    "0x1238536071E1c677A632429e3655c799b22cDA52" as const,
} as const;

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
