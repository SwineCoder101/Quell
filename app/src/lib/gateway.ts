// Circle Gateway configuration for fast cross-chain USDC transfers (EIP-712 based)

export const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

export const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;
export const GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as const;

export interface GatewayChainConfig {
  name: string;
  chainId: number;
  domain: number;
  usdc: `0x${string}`;
  finalityTime: number; // seconds
}

export const ethereumSepoliaConfig: GatewayChainConfig = {
  name: "Ethereum Sepolia",
  chainId: 11155111,
  domain: 0,
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  finalityTime: 5,
};


export const ARC_DOMAIN = 26;
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

// EIP-712 types for BurnIntent
export const BURN_INTENT_TYPES = {
  BurnIntent: [
    { name: "sender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "burnToken", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export const GATEWAY_WALLET_ABI = [
  {
    inputs: [
      { name: "burnToken", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
    ],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const GATEWAY_MINTER_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "burnSource", type: "bytes32" },
      { name: "mintRecipient", type: "address" },
      { name: "attestation", type: "bytes" },
    ],
    name: "gatewayMint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
