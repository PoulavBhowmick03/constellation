import { describe, expect, it } from "vitest";
import {
  buildExactChallenge,
  caip2,
  decodePaymentPayload,
  decodePaymentRequired,
  encodePaymentRequired,
  readClaimedPayer,
  X402_HEADERS,
} from "../src/x402.js";
import type { Money } from "../src/types.js";

const USDT0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const OWNER = "0x212e82dc1d13b991d5318d970963f5ddfd81a178";
const price = (amount: string): Money => ({ token: "USDT", amount, decimals: 6 });

describe("buildExactChallenge", () => {
  const ch = buildExactChallenge({
    tool: "get_revenue_report",
    price: price("100000"),
    payTo: OWNER,
    asset: USDT0,
    chainId: 196,
    assetDomainName: "USD₮0",
  });

  it("emits an x402 v2 exact challenge on X Layer", () => {
    expect(ch.x402Version).toBe(2);
    expect(ch.resource.url).toBe("mcp://tool/get_revenue_report");
    expect(ch.accepts).toHaveLength(1);
    expect(ch.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "eip155:196",
      asset: USDT0,
      payTo: OWNER,
      amount: "100000",
      maxTimeoutSeconds: 300,
      extra: {
        name: "USD₮0",
        version: "1",
      },
    });
    expect(ch.accepts[0].extra).not.toHaveProperty("assetTransferMethod");
    expect(ch.accepts[0].extra).not.toHaveProperty("decimals");
  });

  it("rejects number-coercing or invalid challenge inputs", () => {
    expect(() =>
      buildExactChallenge({
        tool: "t",
        price: { token: "USDT", amount: "0.1", decimals: 6 },
        payTo: OWNER,
        asset: USDT0,
        chainId: 196,
      }),
    ).toThrow(/base-unit integer/);
    expect(() => caip2(0)).toThrow(/chainId/);
  });
});

describe("x402 base64 carriers", () => {
  it("round-trips a PAYMENT-REQUIRED challenge", () => {
    const ch = buildExactChallenge({
      tool: "export_statement",
      price: price("200000"),
      payTo: OWNER,
      asset: USDT0,
      chainId: 196,
    });
    const encoded = encodePaymentRequired(ch);
    expect(encoded).not.toContain("{");
    expect(decodePaymentRequired(encoded)).toEqual(ch);
  });

  it("accepts base64url but rejects arbitrary raw proof strings", () => {
    const payload = { x402Version: 2, accepted: {}, payload: {} };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const base64url = encoded.replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodePaymentPayload(base64url)).toEqual(payload);
    expect(() => decodePaymentPayload("0xdeadbeef")).toThrow(/encoded JSON/);
  });
});

describe("constants", () => {
  it("uses byte-exact x402 header names", () => {
    expect(X402_HEADERS.paymentRequired).toBe("PAYMENT-REQUIRED");
    expect(X402_HEADERS.paymentSignature).toBe("PAYMENT-SIGNATURE");
    expect(X402_HEADERS.xPayment).toBe("X-PAYMENT");
    expect(X402_HEADERS.paymentResponse).toBe("PAYMENT-RESPONSE");
    expect(caip2(196)).toBe("eip155:196");
  });
});

describe("advertised tool descriptors", () => {
  const descriptor = {
    description: "Incoming totals. wallet_id defaults to the paying wallet.",
    input: {
      type: "http" as const,
      method: "POST",
      bodyType: "json" as const,
      body: {
        type: "object" as const,
        properties: { wallet_id: { type: "string", description: "Registered wallet id" } },
        required: [] as string[],
      },
    },
  };

  const ch = buildExactChallenge({
    tool: "get_revenue_report",
    price: price("100000"),
    payTo: OWNER,
    asset: USDT0,
    chainId: 196,
    assetDomainName: "USD₮0",
    resourceUrl: "https://example.test/services/revenue-report",
    descriptor,
  });

  it("advertises the input schema under the top-level extensions.bazaar key", () => {
    // Deliberate: the SDK's PaymentRequirementsSchema STRIPS an `outputSchema`
    // placed on an accepts entry, and `extra` is the signed EIP-712 domain.
    // `extensions` is the only slot that survives the SDK's own validation.
    expect((ch as Record<string, unknown>).extensions).toEqual({
      bazaar: { outputSchema: { input: descriptor.input } },
    });
    expect(ch.accepts[0]).not.toHaveProperty("outputSchema");
  });

  it("uses the descriptor prose as the advertised resource description", () => {
    expect(ch.resource.description).toBe(descriptor.description);
  });

  it("omits extensions entirely when no input schema is declared", () => {
    const bare = buildExactChallenge({
      tool: "get_runway",
      price: price("100000"),
      payTo: OWNER,
      asset: USDT0,
      chainId: 196,
    });
    expect(bare).not.toHaveProperty("extensions");
    expect(bare.resource.description).toBe("Paid MCP tool: get_runway");
  });

  it("survives the OKX SDK's own PaymentRequired validation intact", async () => {
    // The local builder is the fallback used when the facilitator is
    // unreachable. It must not be a degraded shape.
    const { validatePaymentRequired } = await import("@okxweb3/x402-core/schemas");
    const parsed = validatePaymentRequired(ch) as Record<string, unknown>;
    const out = (parsed.data ?? parsed) as Record<string, unknown>;
    expect(out.x402Version).toBe(2);
    expect(out.extensions).toEqual({ bazaar: { outputSchema: { input: descriptor.input } } });
    expect((out.accepts as unknown[])[0]).toMatchObject({ scheme: "exact", amount: "100000" });
  });
});

describe("readClaimedPayer", () => {
  const payload = (from: unknown) =>
    Buffer.from(
      JSON.stringify({ x402Version: 2, payload: { authorization: { from } } }),
      "utf-8",
    ).toString("base64");

  it("reads the claimed payer from the v2 payment header", () => {
    const headers = { [X402_HEADERS.paymentSignature.toLowerCase()]: payload(OWNER) };
    expect(readClaimedPayer(headers)).toBe(OWNER);
  });

  it("reads the claimed payer from the legacy X-PAYMENT header", () => {
    const headers = { [X402_HEADERS.xPayment.toLowerCase()]: payload(OWNER) };
    expect(readClaimedPayer(headers)).toBe(OWNER);
  });

  it("returns null for a missing, malformed, or non-address payer", () => {
    expect(readClaimedPayer(undefined)).toBeNull();
    expect(readClaimedPayer({})).toBeNull();
    expect(readClaimedPayer({ [X402_HEADERS.paymentSignature.toLowerCase()]: "!!not-base64!!" })).toBeNull();
    expect(readClaimedPayer({ [X402_HEADERS.paymentSignature.toLowerCase()]: payload("nope") })).toBeNull();
    expect(readClaimedPayer({ [X402_HEADERS.paymentSignature.toLowerCase()]: payload(42) })).toBeNull();
  });
});
