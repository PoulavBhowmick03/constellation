import type { Address } from "viem";

export const MANTLE_MAINNET_CHAIN_ID = 5000;
export const MANTLE_MAINNET_RPC = "https://rpc.mantle.xyz";

export const DEFAULTS = {
  bazaarUrl: "https://ledgerforge-indexer.fly.dev",
  facilitatorUrl: "https://ledgerforge-facilitator.fly.dev",
  rpcUrl: MANTLE_MAINNET_RPC,
  chainId: MANTLE_MAINNET_CHAIN_ID,
  skillRegistry: "0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992" as Address,
  bazaarListings: "0xaB5a52C30D769A7Eae1474857A6180E71765CBAF" as Address,
  x402Escrow: "0x1d550b555B3a2e124ef611b55965848d6be233a2" as Address,
  operatorAddress: "0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0" as Address,
  tokens: {
    USDC: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9" as Address,
    USDe: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34" as Address,
  },
} as const;

export const PAYMENT_DOMAIN_NAME = "LedgerForge";
export const PAYMENT_DOMAIN_VERSION = "1";

export const PAYMENT_TYPES = {
  Payment: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "token", type: "address" },
    { name: "skillId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
} as const;
