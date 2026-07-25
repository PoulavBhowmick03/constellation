import {
  decodePaymentRequiredHeader,
  encodePaymentRequiredHeader,
} from "@okxweb3/x402-core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  ResourceInfo,
} from "@okxweb3/x402-core/types";
import type { Money } from "./types.js";

/** The single, fixed x402 option Treasury accepts. */
export interface X402Accept extends PaymentRequirements {
  scheme: "exact";
  network: `eip155:${number}`;
  extra: {
    name: string;
    version: string;
  };
}

export interface X402Challenge extends PaymentRequired {
  x402Version: 2;
  resource: ResourceInfo;
  accepts: [X402Accept];
}

/**
 * Declares the business arguments a paid call must carry (x402 Bazaar shape).
 *
 * This is advertised under the TOP-LEVEL `extensions.bazaar` key, which is
 * deliberate and verified: the OKX SDK's `PaymentRequirementsSchema` strips an
 * `outputSchema` placed on an accepts entry, and `extra` is reserved for the
 * EIP-712 domain a payer signs over — polluting it risks breaking signatures.
 * `extensions` is the only slot that survives the SDK's own validation intact.
 */
export interface X402InputSchema {
  type: "http";
  method: string;
  bodyType: "json";
  body: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

/** Human/LLM-readable + machine-readable description of one paid tool. */
export interface ToolDescriptor {
  /** Prose shown in `resource.description`; the OKX marketplace is LLM-driven. */
  description?: string;
  /** Machine-readable argument declaration. */
  input?: X402InputSchema;
}

/** Wrap a descriptor's input schema in the advertised extensions envelope. */
export function bazaarExtensions(
  descriptor: ToolDescriptor | undefined,
): Record<string, unknown> | undefined {
  if (!descriptor?.input) return undefined;
  return { bazaar: { outputSchema: { input: descriptor.input } } };
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
  /**
   * Resource URL advertised in the challenge and enforced at settle time.
   * Defaults to the MCP-internal mcp://tool/<tool>; plain-HTTP service routes
   * pass their public https URL (the shape OKX's listing validator checks).
   */
  resourceUrl?: string;
  /** Advertised prose + argument declaration for this tool. */
  descriptor?: ToolDescriptor;
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
    },
  };

  const extensions = bazaarExtensions(input.descriptor);
  return {
    x402Version: 2,
    resource: {
      url: input.resourceUrl ?? `mcp://tool/${encodeURIComponent(input.tool)}`,
      description: input.descriptor?.description ?? `Paid MCP tool: ${input.tool}`,
      mimeType: "application/json",
    },
    accepts: [entry],
    ...(extensions ? { extensions } : {}),
  };
}

/** Official OKX x402 encoder for the PAYMENT-REQUIRED header value. */
export function encodePaymentRequired(challenge: X402Challenge): string {
  return encodePaymentRequiredHeader(challenge);
}

/** Inverse of encodePaymentRequired, using the official OKX x402 decoder. */
export function decodePaymentRequired(headerValue: string): X402Challenge {
  return decodePaymentRequiredHeader(headerValue) as X402Challenge;
}

/** Decode the PAYMENT-SIGNATURE / X-PAYMENT carrier without accepting raw JSON. */
export function decodePaymentPayload(headerValue: string): PaymentPayload {
  return JSON.parse(decodeBase64Json(headerValue)) as PaymentPayload;
}

export function encodePaymentResponse(response: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(response), "utf-8").toString("base64");
}

/**
 * The payer address a payment header CLAIMS, WITHOUT verifying its signature.
 *
 * Safe only for defaulting an argument the caller could have supplied itself
 * anyway (it grants no access it did not already have). Authorization still
 * comes from the facilitator's recovered payer at settle time — never gate
 * access on this value.
 */
export function readClaimedPayer(
  headers: Record<string, string | undefined> | undefined,
): string | null {
  let raw: string | undefined;
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lower = name.toLowerCase();
    if (lower === X402_HEADERS.paymentSignature.toLowerCase() && value) raw = value;
    if (lower === X402_HEADERS.xPayment.toLowerCase() && value && !raw) raw = value;
  }
  if (!raw) return null;
  try {
    const payload = decodePaymentPayload(raw) as unknown as {
      payload?: { authorization?: { from?: unknown } };
    };
    const from = payload.payload?.authorization?.from;
    return typeof from === "string" && /^0x[0-9a-fA-F]{40}$/.test(from) ? from : null;
  } catch {
    return null;
  }
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
