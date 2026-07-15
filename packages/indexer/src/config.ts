import "dotenv/config";
import { createPublicClient, http, isAddress, type Chain, type PublicClient } from "viem";

// X Layer — eip155:196. RPC + token addresses are UNVERIFIED until Day 1 and
// come only from env; we never hardcode a third-party RPC or invent a token
// address (a wrong one makes every report silently wrong). See docs/status/P1.md.

export const XLAYER_CHAIN_ID = Number(process.env.XLAYER_CHAIN_ID ?? 196);
const XLAYER_RPC = process.env.XLAYER_RPC ?? ""; // TODO(unverified)

export const xlayerChain: Chain = {
  id: XLAYER_CHAIN_ID,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: XLAYER_RPC ? [XLAYER_RPC] : [] },
  },
};

/**
 * Build the read-only client. Throws if XLAYER_RPC is unset rather than
 * silently defaulting to some chain — we must never read the wrong network and
 * report the numbers as real.
 */
export function getPublicClient(): PublicClient {
  if (!XLAYER_RPC) {
    throw new Error(
      "XLAYER_RPC is unset (TODO(unverified)). Set a verified X Layer RPC in .env before indexing.",
    );
  }
  return createPublicClient({ chain: xlayerChain, transport: http(XLAYER_RPC) });
}

export interface TrackedToken {
  symbol: "USDT" | "USDG";
  address: `0x${string}`;
  decimals: number;
}

/**
 * Tokens to index, read from env. A token with no configured address is skipped
 * (with a warning) rather than guessed. Returns [] if neither is set.
 */
export function trackedTokens(): TrackedToken[] {
  const out: TrackedToken[] = [];
  const specs: { symbol: "USDT" | "USDG"; addr?: string; dec?: string }[] = [
    { symbol: "USDT", addr: process.env.USDT_ADDRESS, dec: process.env.USDT_DECIMALS },
    { symbol: "USDG", addr: process.env.USDG_ADDRESS, dec: process.env.USDG_DECIMALS },
  ];
  for (const s of specs) {
    if (!s.addr) {
      console.warn(`[indexer] ${s.symbol}_ADDRESS unset (TODO(unverified)); skipping ${s.symbol}`);
      continue;
    }
    if (!isAddress(s.addr)) {
      console.warn(`[indexer] ${s.symbol}_ADDRESS is not a valid address; skipping ${s.symbol}`);
      continue;
    }
    out.push({ symbol: s.symbol, address: s.addr, decimals: Number(s.dec ?? 6) });
  }
  return out;
}

// X Layer's public RPC (rpc.xlayer.tech / xlayerrpc.okx.com) rejects any
// eth_getLogs span > 100 blocks ("block range greater than 100 max"). The
// default MUST stay <= that or every scan errors. Verified live 2026-07-15.
export const INDEXER_MAX_RANGE_PER_CALL = BigInt(process.env.INDEXER_MAX_RANGE_PER_CALL ?? "100");
export const INDEXER_START_BLOCK = BigInt(process.env.INDEXER_START_BLOCK ?? "0");
