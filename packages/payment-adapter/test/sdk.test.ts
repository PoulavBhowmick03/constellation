import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@okxweb3/x402-core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SdkPaymentAdapter,
  TREASURY_X402,
  type ExactPaymentProcessor,
} from "../src/sdk.js";
import { buildExactChallenge } from "../src/x402.js";
import type { PaymentContext, PriceTable } from "../src/types.js";

const NOW_MS = 1_800_000_000_000;
const PAYER = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}`;
const SIGNATURE = `0x${"12".repeat(65)}`;
const NONCE = `0x${"34".repeat(32)}`;
const prices: PriceTable = {
  get_runway: null,
  get_revenue_report: { token: "USDT", amount: "100000", decimals: 6 },
};

class RecordingProcessor implements ExactPaymentProcessor {
  initialize = vi.fn(async () => undefined);
  verifyPayment = vi.fn(
    async (_payload: PaymentPayload, _requirements: PaymentRequirements): Promise<VerifyResponse> => ({
      isValid: true,
      payer: PAYER,
    }),
  );
  settlePayment = vi.fn(
    async (_payload: PaymentPayload, _requirements: PaymentRequirements): Promise<SettleResponse> => ({
      success: true,
      status: "success",
      payer: PAYER,
      transaction: TX,
      network: TREASURY_X402.network,
    }),
  );
}

function signedPayload(overrides: {
  accepted?: Partial<PaymentRequirements>;
  authorization?: Partial<Record<string, string>>;
  nonce?: string;
} = {}): PaymentPayload {
  const challenge = buildExactChallenge({
    tool: "get_revenue_report",
    price: prices.get_revenue_report!,
    payTo: TREASURY_X402.payTo,
    asset: TREASURY_X402.asset,
    chainId: TREASURY_X402.chainId,
    assetDomainName: TREASURY_X402.assetDomainName,
    assetDomainVersion: TREASURY_X402.assetDomainVersion,
    maxTimeoutSeconds: TREASURY_X402.maxTimeoutSeconds,
  });
  return {
    x402Version: 2,
    resource: challenge.resource,
    accepted: { ...challenge.accepts[0], ...overrides.accepted },
    payload: {
      signature: SIGNATURE,
      authorization: {
        from: PAYER,
        to: TREASURY_X402.payTo,
        value: "100000",
        validAfter: String(NOW_MS / 1000 - 1),
        validBefore: String(NOW_MS / 1000 + 300),
        nonce: overrides.nonce ?? NONCE,
        ...overrides.authorization,
      },
    },
  };
}

function header(payload: PaymentPayload, name = "payment-signature"): PaymentContext {
  return {
    headers: {
      [name]: Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
  };
}

describe("SdkPaymentAdapter inbound exact flow", () => {
  let processor: RecordingProcessor;
  let adapter: SdkPaymentAdapter;

  beforeEach(() => {
    processor = new RecordingProcessor();
    adapter = new SdkPaymentAdapter({ prices, processor, now: () => NOW_MS });
  });

  it("returns a payer-detectable exact challenge when no proof is present", async () => {
    const result = await adapter.requirePayment("get_revenue_report", {});
    expect(result.status).toBe("payment_required");
    expect(result.challenge).toMatchObject({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:196",
          asset: TREASURY_X402.asset,
          payTo: TREASURY_X402.payTo,
          amount: "100000",
          extra: { decimals: 6 },
        },
      ],
    });
  });

  it("does not accept an arbitrary non-empty paymentProof in real mode", async () => {
    const result = await adapter.requirePayment("get_revenue_report", {
      paymentProof: "anything",
    });
    expect(result.status).toBe("payment_required");
    expect(processor.verifyPayment).not.toHaveBeenCalled();
  });

  it.each(["PAYMENT-SIGNATURE", "X-PAYMENT"])(
    "validates, verifies and synchronously settles %s",
    async (name) => {
      const nonceByte = name === "X-PAYMENT" ? "56" : "34";
      const result = await adapter.requirePayment(
        "get_revenue_report",
        header(signedPayload({ nonce: `0x${nonceByte.repeat(32)}` }), name),
      );
      expect(result.status).toBe("paid");
      expect(result.receiptId).toBe(TX);
      expect(result.paymentResponse).toBeDefined();
      expect(
        JSON.parse(Buffer.from(result.paymentResponse!, "base64").toString("utf8")),
      ).toEqual({
        success: true,
        status: "success",
        transaction: TX,
        network: TREASURY_X402.network,
        amount: "100000",
        payer: PAYER,
      });
      expect(processor.initialize).toHaveBeenCalledOnce();
      expect(processor.verifyPayment).toHaveBeenCalledOnce();
      expect(processor.settlePayment).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["network", { accepted: { network: "eip155:1" } }],
    ["asset", { accepted: { asset: "0x2222222222222222222222222222222222222222" } }],
    ["recipient", { accepted: { payTo: "0x3333333333333333333333333333333333333333" } }],
    ["amount", { accepted: { amount: "99999" } }],
    ["authorization recipient", { authorization: { to: PAYER } }],
    ["authorization amount", { authorization: { value: "99999" } }],
    ["expiry", { authorization: { validBefore: String(NOW_MS / 1000) } }],
    ["nonce", { nonce: "0x1234" }],
  ])("rejects a %s mismatch before calling OKX", async (_label, overrides) => {
    const result = await adapter.requirePayment(
      "get_revenue_report",
      header(signedPayload(overrides)),
    );
    expect(result.status).toBe("payment_required");
    expect(processor.verifyPayment).not.toHaveBeenCalled();
  });

  it("requires facilitator verification of signature and nonce state", async () => {
    processor.verifyPayment.mockResolvedValueOnce({
      isValid: false,
      invalidReason: "invalid_signature",
      invalidMessage: "signature or nonce rejected",
    });
    const result = await adapter.requirePayment("get_revenue_report", header(signedPayload()));
    expect(result.status).toBe("payment_required");
    expect(result.challenge?.reason).toMatch(/signature or nonce rejected/);
    expect(processor.settlePayment).not.toHaveBeenCalled();
  });

  it("does not release the tool for pending settlement", async () => {
    processor.settlePayment.mockResolvedValueOnce({
      success: true,
      status: "pending",
      payer: PAYER,
      transaction: TX,
      network: TREASURY_X402.network,
    });
    const result = await adapter.requirePayment("get_revenue_report", header(signedPayload()));
    expect(result.status).toBe("payment_required");
    expect(result.paymentResponse).toBeUndefined();
  });

  it("rejects replay of a successfully settled nonce", async () => {
    const payment = header(signedPayload());
    expect((await adapter.requirePayment("get_revenue_report", payment)).status).toBe("paid");
    const replay = await adapter.requirePayment("get_revenue_report", payment);
    expect(replay.status).toBe("payment_required");
    expect(replay.challenge?.reason).toMatch(/nonce was already submitted/);
    expect(processor.verifyPayment).toHaveBeenCalledOnce();
  });

  it("rejects conflicting v2 and legacy header carriers", async () => {
    const result = await adapter.requirePayment("get_revenue_report", {
      headers: { "payment-signature": "one", "x-payment": "two" },
    });
    expect(result.status).toBe("payment_required");
    expect(result.challenge?.reason).toMatch(/conflicting/);
  });

  it("keeps free tools free without contacting the facilitator", async () => {
    expect((await adapter.requirePayment("get_runway", {})).status).toBe("paid");
    expect(processor.initialize).not.toHaveBeenCalled();
  });
});
