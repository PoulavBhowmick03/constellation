import { describe, expect, it } from "vitest";
import {
  buildExactChallenge,
  caip2,
  decodePaymentPayload,
  decodePaymentRequired,
  encodePaymentRequired,
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
        assetTransferMethod: "eip3009",
        decimals: 6,
      },
    });
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
