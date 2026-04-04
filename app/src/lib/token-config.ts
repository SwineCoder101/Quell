// Auto-generated addresses from scripts/deploy-tokens.ts, enriched with logos
export interface TokenConfig {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const CG = "https://assets.coingecko.com/coins/images";
const LOGOS: Record<string, string> = {
  USDC: `${CG}/6319/standard/usdc.png`,
  WETH: `${CG}/2518/standard/weth.png`,
  DAI: `${CG}/9956/standard/Badge_Dai.png`,
  USDT: `${CG}/325/standard/Tether.png`,
  WBTC: `${CG}/7598/standard/wrapped_bitcoin_wbtc.png`,
  LINK: `${CG}/877/standard/chainlink-new-logo.png`,
  UNI: `${CG}/12504/standard/uni.jpg`,
  AAVE: `${CG}/12645/standard/aave-token.png`,
  ARB: `${CG}/16547/standard/arb.jpg`,
  OP: `${CG}/25244/standard/Optimism_%28OP%29.png`,
  SNX: `${CG}/3406/standard/SNX.png`,
  MKR: `${CG}/1364/standard/Mark_Maker.png`,
  COMP: `${CG}/10775/standard/COMP.png`,
  CRV: `${CG}/12124/standard/Curve.png`,
  GRT: `${CG}/13397/standard/Graph_Token.png`,
  LDO: `${CG}/13573/standard/Lido_DAO.png`,
  PEPE: `${CG}/29850/standard/pepe-token.jpeg`,
  SHIB: `${CG}/11939/standard/shiba.png`,
  MATIC: `${CG}/4713/standard/polygon.png`,
  DOGE: `${CG}/5/standard/dogecoin.png`,
  ETH: `${CG}/279/standard/ethereum.png`,
};

export const DEPLOYED_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0x46ea40b1190ef2c06e7660b0fa07f28a76658336" as `0x${string}`,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  WETH: {
    address: "0xa1811a3d805b4e71e6787936480cb226681da5ae" as `0x${string}`,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
  },
  DAI: {
    address: "0xe918e5266d250c55fdb8ccf8e427bf23bb46b90f" as `0x${string}`,
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
  },
  USDT: {
    address: "0x01628afa8fe8f78d8aef0a22e2d7efc23483d5b9" as `0x${string}`,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  },
  WBTC: {
    address: "0x2d3f715022a81c39b102fafe5d3d119561e6e38f" as `0x${string}`,
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
  },
  LINK: {
    address: "0xf019feed5b9c23927e562db1b81a38c553041b87" as `0x${string}`,
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
  },
  UNI: {
    address: "0x008607499b9c7dff6c539ff9629450cc5ce8d0a0" as `0x${string}`,
    symbol: "UNI",
    name: "Uniswap",
    decimals: 18,
  },
  AAVE: {
    address: "0xa1f7e52301dc0201ff935e133ea7cddcee388b38" as `0x${string}`,
    symbol: "AAVE",
    name: "Aave",
    decimals: 18,
  },
  ARB: {
    address: "0xc7c55a318c5c05dc5060dc28d01e8237b5057951" as `0x${string}`,
    symbol: "ARB",
    name: "Arbitrum",
    decimals: 18,
  },
  OP: {
    address: "0xb90ace2f72be1f5a916c0b9937b70a9ee2849463" as `0x${string}`,
    symbol: "OP",
    name: "Optimism",
    decimals: 18,
  },
  SNX: {
    address: "0xa99e1994f37397a1c174d20acc9147869460ece6" as `0x${string}`,
    symbol: "SNX",
    name: "Synthetix",
    decimals: 18,
  },
  MKR: {
    address: "0xb0a82cfe03ec1a6b9c6b821cefc56b6ea8dc73fa" as `0x${string}`,
    symbol: "MKR",
    name: "Maker",
    decimals: 18,
  },
  COMP: {
    address: "0xb687b48ed8b3a367ca23b4f365b3568e2a8da0d9" as `0x${string}`,
    symbol: "COMP",
    name: "Compound",
    decimals: 18,
  },
  CRV: {
    address: "0x89596c433ea951750c9e165d827f77e1b9c225f9" as `0x${string}`,
    symbol: "CRV",
    name: "Curve DAO Token",
    decimals: 18,
  },
  GRT: {
    address: "0xe7e7fb85a33ce518c39df92ab6a7cebe55cd0b6c" as `0x${string}`,
    symbol: "GRT",
    name: "The Graph",
    decimals: 18,
  },
  LDO: {
    address: "0x9c462dbd59ff0675b31970d11bb3ae93e7283681" as `0x${string}`,
    symbol: "LDO",
    name: "Lido DAO",
    decimals: 18,
  },
  PEPE: {
    address: "0x12e2b23b99429c7738ec3dc4682ddc437a3a3fd5" as `0x${string}`,
    symbol: "PEPE",
    name: "Pepe",
    decimals: 18,
  },
  SHIB: {
    address: "0xee36d6eba0b04ce5fb4c5e7821d80df0bec620b0" as `0x${string}`,
    symbol: "SHIB",
    name: "Shiba Inu",
    decimals: 18,
  },
  MATIC: {
    address: "0x06d530d52c9949fb13c6a062e9b4941cbc25b60d" as `0x${string}`,
    symbol: "MATIC",
    name: "Polygon",
    decimals: 18,
  },
  DOGE: {
    address: "0xb2b9ebf602ef3f737283697921ac25788bdcf56a" as `0x${string}`,
    symbol: "DOGE",
    name: "Dogecoin",
    decimals: 18,
  },
} as const;

// Enrich with logos
for (const [sym, token] of Object.entries(DEPLOYED_TOKENS)) {
  (token as TokenConfig).logoURI = LOGOS[sym];
}

export const TOKEN_LIST: TokenConfig[] = Object.values(DEPLOYED_TOKENS);

export const NATIVE_ETH: TokenConfig = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  logoURI: LOGOS.ETH,
};

export function getToken(symbol: string): TokenConfig | undefined {
  if (symbol === "ETH") return NATIVE_ETH;
  return DEPLOYED_TOKENS[symbol];
}

export function getTokenLogoURI(symbol: string): string | undefined {
  return LOGOS[symbol];
}

// Official Sepolia USDC (Circle) — used for SHIB pairs only
export const OFFICIAL_USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`;

/**
 * Resolve the on-chain token address for a swap pair.
 * When SHIB is the counterpart, USDC maps to the official Circle address;
 * for all other pairs USDC uses the mocked testnet address.
 */
export function resolveTokenAddress(token: TokenConfig, counterpartSymbol: string): `0x${string}` {
  if (token.symbol === "USDC" && counterpartSymbol === "SHIB") {
    return OFFICIAL_USDC_ADDRESS;
  }
  return token.address;
}

// Direct V3 pool pairs that the Uniswap Trading API can quote on Sepolia.
// Derived from the actual V3 pools we deployed.
const V3_PAIR_SET = new Set([
  // USDC pairs
  "USDC/WETH", "USDC/DAI", "USDC/USDT", "USDC/WBTC", "USDC/LINK", "USDC/UNI",
  // WETH pairs
  "WETH/DAI", "WETH/WBTC", "WETH/LINK", "WETH/UNI", "WETH/AAVE",
  "WETH/ARB", "WETH/OP", "WETH/MKR", "WETH/DOGE",
  // SHIB pairs (against official USDC & WETH)
  "SHIB/USDC", "SHIB/WETH",
]);

// Build a full adjacency map (both directions) including ETH as alias for WETH
const PAIR_ADJACENCY = new Map<string, Set<string>>();

function addEdge(a: string, b: string) {
  if (!PAIR_ADJACENCY.has(a)) PAIR_ADJACENCY.set(a, new Set());
  if (!PAIR_ADJACENCY.has(b)) PAIR_ADJACENCY.set(b, new Set());
  PAIR_ADJACENCY.get(a)!.add(b);
  PAIR_ADJACENCY.get(b)!.add(a);
}

for (const pair of V3_PAIR_SET) {
  const [a, b] = pair.split("/");
  addEdge(a, b);
  // ETH can route through WETH
  if (a === "WETH") addEdge("ETH", b);
  if (b === "WETH") addEdge(a, "ETH");
}
addEdge("ETH", "WETH");

/** Check if a token pair can be quoted — must have a direct V3 pool */
export function isPairQuotable(symbolA: string, symbolB: string): boolean {
  if (symbolA === symbolB) return false;
  return PAIR_ADJACENCY.get(symbolA)?.has(symbolB) ?? false;
}

/** Check if a specific token has any quotable pairs */
export function isTokenQuotable(symbol: string): boolean {
  return PAIR_ADJACENCY.has(symbol) && PAIR_ADJACENCY.get(symbol)!.size > 0;
}

/** Get all quotable counterpart tokens for a given token */
export function getQuotableCounterparts(symbol: string): string[] {
  return [...(PAIR_ADJACENCY.get(symbol) || [])];
}
