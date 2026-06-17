import "dotenv/config";
import { createPublicClient, http } from "viem";

const CELO_RPC = process.env.CELO_RPC ?? "https://forno.celo.org";

export const celoChain = {
  id: Number(process.env.CELO_CHAIN_ID ?? 42220),
  name: "Celo",
  network: "celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [CELO_RPC] },
    public: { http: [CELO_RPC] },
  },
} as const;

export const publicClient = createPublicClient({
  chain: celoChain,
  transport: http(),
});

export const SKILL_REGISTRY_ADDRESS =
  process.env.SKILL_REGISTRY_ADDRESS as `0x${string}`;
export const BAZAAR_LISTINGS_ADDRESS =
  process.env.BAZAAR_LISTINGS_ADDRESS as `0x${string}`;
