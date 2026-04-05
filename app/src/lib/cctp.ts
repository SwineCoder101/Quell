// CCTP V2 configuration for cross-chain USDC transfers

export const CCTP_DOMAINS = {
  ETHEREUM_SEPOLIA: 0,
  ARC_TESTNET: 26,
} as const;

export const CCTP_CHAINS: Record<
  number,
  { name: string; domain: number; usdc: `0x${string}`; tokenMessengerV2: `0x${string}` }
> = {
  11155111: {
    name: "Ethereum Sepolia",
    domain: CCTP_DOMAINS.ETHEREUM_SEPOLIA,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
};

export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
export const ARC_DOMAIN = CCTP_DOMAINS.ARC_TESTNET;

export const TOKEN_MESSENGER_V2_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "mintDeadline", type: "uint32" },
    ],
    name: "depositForBurn",
    outputs: [{ name: "nonce", type: "uint64" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
