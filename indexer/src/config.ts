import "dotenv/config";
import { createPublicClient, http } from "viem";

export const mantleChain = {
  id: 5000,
  name: "Mantle",
  network: "mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz"] },
    public: { http: [process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz"] },
  },
} as const;

export const publicClient = createPublicClient({
  chain: mantleChain,
  transport: http(),
});

export const SKILL_REGISTRY_ADDRESS =
  process.env.SKILL_REGISTRY_ADDRESS as `0x${string}`;
export const BAZAAR_LISTINGS_ADDRESS =
  process.env.BAZAAR_LISTINGS_ADDRESS as `0x${string}`;
