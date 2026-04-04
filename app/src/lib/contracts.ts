// Uniswap V3 contract addresses on Base Mainnet (Chain ID: 8453)
export const CONTRACTS = {
  UNISWAP_V3_FACTORY: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as const,
  SWAP_ROUTER_02: "0x2626664c2603336E57B271c5C0b26F421741e481" as const,
  QUOTER_V2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const,
  NONFUNGIBLE_POSITION_MANAGER:
    "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as const,
  UNIVERSAL_ROUTER: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD" as const,
} as const;

// Known tokens on Base Mainnet
export const TOKENS = {
  WETH: {
    address: "0x4200000000000000000000000000000000000006" as `0x${string}`,
    decimals: 18,
    symbol: "WETH",
    name: "Wrapped Ether",
  },
  USDC: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  DAI: {
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as `0x${string}`,
    decimals: 18,
    symbol: "DAI",
    name: "Dai Stablecoin",
  },
  cbETH: {
    address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" as `0x${string}`,
    decimals: 18,
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH",
  },
  USDbC: {
    address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" as `0x${string}`,
    decimals: 6,
    symbol: "USDbC",
    name: "USD Base Coin",
  },
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
