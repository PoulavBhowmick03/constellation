import type { Address } from "viem";

// Celo testnet. Mainnet (Celo, chainId 42220) values live in .env.
export const CELO_MAINNET_CHAIN_ID = 42220;
export const CELO_MAINNET_RPC = "https://forno.celo.org";

// Deployed Celo mainnet addresses below; override via env if redeployed.
// Safe in both Node (services/agents) and browser bundles (dashboard).
const env = (k: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[k] : undefined;

export const DEFAULTS = {
  bazaarUrl: "https://ledgerforge-indexer.fly.dev",
  facilitatorUrl: "https://ledgerforge-facilitator.fly.dev",
  rpcUrl: CELO_MAINNET_RPC,
  chainId: CELO_MAINNET_CHAIN_ID,
  // Deployed + verified on Celo mainnet (42220). Override via env if redeployed.
  skillRegistry: (env("SKILL_REGISTRY_ADDRESS") ?? "0x526DAe5c605E45c55141CddEA7b6751E149fB894") as Address,
  bazaarListings: (env("BAZAAR_LISTINGS_ADDRESS") ?? "0x7d0982b178D3Ca2B6A59fFdeBcb41d9A7168341b") as Address,
  x402Escrow: (env("X402_ESCROW_ADDRESS") ?? "0xA89492AD59A9bac099604d0745268B1714F8BD4F") as Address,
  operatorAddress: (env("OPERATOR_ADDRESS") ?? "0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0") as Address,
  tokens: {
    // cUSD (Celo-native stable) replaces Mantle's USDe as the primary token.
    cUSD: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address,
    USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address,
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
