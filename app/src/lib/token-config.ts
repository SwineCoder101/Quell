// Auto-generated addresses from scripts/deploy-tokens.ts, enriched with logos
export interface TokenConfig {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// Trustwallet assets CDN — reliable, no hotlink blocking
const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets";
const LOGOS: Record<string, string> = {
  USDC: `${TW}/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`,
  WETH: `${TW}/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png`,
  DAI:  `${TW}/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png`,
  USDT: `${TW}/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png`,
  WBTC: `${TW}/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png`,
  LINK: `${TW}/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png`,
  UNI:  `${TW}/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png`,
  AAVE: `${TW}/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png`,
  ARB:  `${TW}/0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1/logo.png`,
  OP:   "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
  SNX:  `${TW}/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F/logo.png`,
  MKR:  `${TW}/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png`,
  COMP: `${TW}/0xc00e94Cb662C3520282E6f5717214004A7f26888/logo.png`,
  CRV:  `${TW}/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png`,
  GRT:  `${TW}/0xc944E90C64B2c07662A292be6244BDf05Cda44a7/logo.png`,
  LDO:  `${TW}/0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32/logo.png`,
  PEPE: `${TW}/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png`,
  SHIB: `${TW}/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png`,
  MATIC:`${TW}/0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0/logo.png`,
  DOGE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png",
  ETH:  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
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
