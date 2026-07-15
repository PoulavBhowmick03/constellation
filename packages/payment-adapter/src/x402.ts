import type { PaymentPayload, PaymentRequirements, ResourceInfo } from "@okxweb3/x402-core/types";
import type { Money } from "./types.js";

/** The single, fixed x402 option Treasury accepts. */
export interface X402Accept extends PaymentRequirements {
  scheme: "exact";
  network: `eip155:${number}`;
  extra: {
    name: string;
    version: string;
    assetTransferMethod: "eip3009";
    decimals: number;
  };
}

export interface X402Challenge {
  x402Version: 2;
  resource: ResourceInfo;
  accepts: [X402Accept];
}

export interface BuildChallengeInput {
  tool: string;
  price: Money;
  payTo: string;
  asset: string;
  /** Numeric EVM chain id (196 for X Layer). */
  chainId: number;
  /** EIP-712 domain metadata for USDT0 transferWithAuthorization. */
  assetDomainName?: string;
  assetDomainVersion?: string;
  maxTimeoutSeconds?: number;
}

/** CAIP-2 network id for an EVM chain. */
export function caip2(chainId: number): `eip155:${number}` {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("chainId must be a positive safe integer");
  }
  return `eip155:${chainId}`;
}

/**
 * Builds the payer-detectable x402 v2 challenge for one paid MCP tool.
 * Amounts stay as base-unit strings and are never coerced through JS numbers.
 */
export function buildExactChallenge(input: BuildChallengeInput): X402Challenge {
  if (!/^\d+$/.test(input.price.amount)) {
    throw new Error("price amount must be an unsigned base-unit integer string");
  }
  if (!Number.isSafeInteger(input.price.decimals) || input.price.decimals < 0) {
    throw new Error("price decimals must be a non-negative safe integer");
  }

  const entry: X402Accept = {
    scheme: "exact",
    network: caip2(input.chainId),
    asset: input.asset,
    payTo: input.payTo,
    amount: input.price.amount,
    maxTimeoutSeconds: input.maxTimeoutSeconds ?? 300,
    extra: {
      name: input.assetDomainName ?? input.price.token,
      version: input.assetDomainVersion ?? "1",
      assetTransferMethod: "eip3009",
      decimals: input.price.decimals,
    },
  };

  return {
    x402Version: 2,
    resource: {
      url: `mcp://tool/${encodeURIComponent(input.tool)}`,
      description: `Paid MCP tool: ${input.tool}`,
      mimeType: "application/json",
    },
    accepts: [entry],
  };
}

/** Base64 of the challenge JSON (the x402 v2 PAYMENT-REQUIRED value). */
export function encodePaymentRequired(challenge: X402Challenge): string {
  return Buffer.from(JSON.stringify(challenge), "utf-8").toString("base64");
}

/** Inverse of encodePaymentRequired (accepts canonical base64 or base64url). */
export function decodePaymentRequired(headerValue: string): X402Challenge {
  return JSON.parse(decodeBase64Json(headerValue)) as X402Challenge;
}

/** Decode the PAYMENT-SIGNATURE / X-PAYMENT carrier without accepting raw JSON. */
export function decodePaymentPayload(headerValue: string): PaymentPayload {
  return JSON.parse(decodeBase64Json(headerValue)) as PaymentPayload;
}

export function encodePaymentResponse(response: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(response), "utf-8").toString("base64");
}

function decodeBase64Json(value: string): string {
  if (value.length === 0 || /[^A-Za-z0-9+/_=-]/.test(value)) {
    throw new Error("payment header must be base64-encoded JSON");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64").toString("utf-8");
  if (decoded.length === 0 || !decoded.trimStart().startsWith("{")) {
    throw new Error("payment header is not encoded JSON");
  }
  return decoded;
}

/** Convert our single exact challenge option into the SDK's strict requirements type. */
export function paymentRequirements(challenge: X402Challenge): PaymentRequirements {
  const option = challenge.accepts[0];
  return {
    scheme: option.scheme,
    network: option.network,
    asset: option.asset,
    amount: option.amount,
    payTo: option.payTo,
    maxTimeoutSeconds: option.maxTimeoutSeconds,
    extra: option.extra,
  };
}

/** Wire header names are externally defined and must stay byte-exact. */
export const X402_HEADERS = {
  paymentRequired: "PAYMENT-REQUIRED",
  paymentSignature: "PAYMENT-SIGNATURE",
  xPayment: "X-PAYMENT",
  paymentResponse: "PAYMENT-RESPONSE",
} as const;
