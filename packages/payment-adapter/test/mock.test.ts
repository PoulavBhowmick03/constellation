import { describe, expect, it } from "vitest";
import {
  MOCK_PAYMENT_HEADER,
  MockPaymentAdapter,
  SdkPaymentAdapter,
  createPaymentAdapter,
  type Money,
  type PriceTable,
} from "../src/index.js";

const USDT = (amount: string): Money => ({ token: "USDT", amount, decimals: 6 });

const prices: PriceTable = {
  register_wallet: null,
  get_runway: null,
  get_revenue_report: USDT("100000"), // 0.10 USDT
  get_expense_report: USDT("100000"),
  export_statement: USDT("200000"), // 0.20 USDT
};

describe("requirePayment (inbound)", () => {
  it("passes free tools without any proof", async () => {
    const a = new MockPaymentAdapter({ prices });
    const r = await a.requirePayment("get_runway", {});
    expect(r.status).toBe("paid");
    expect(r.price).toBeNull();
  });

  it("challenges a paid tool with no proof (402-style)", async () => {
    const a = new MockPaymentAdapter({ prices });
    const r = await a.requirePayment("get_revenue_report", {});
    expect(r.status).toBe("payment_required");
    expect(r.price).toEqual(USDT("100000"));
    expect(r.challenge?.reason).toContain("payment required");
  });

  it("accepts a paid tool when the mock payment header matches", async () => {
    const a = new MockPaymentAdapter({ prices });
    const r = await a.requirePayment("get_revenue_report", {
      headers: { [MOCK_PAYMENT_HEADER]: "get_revenue_report" },
    });
    expect(r.status).toBe("paid");
    expect(r.receiptId).toBeTruthy();
  });

  it("accepts the wildcard header and a raw paymentProof", async () => {
    const a = new MockPaymentAdapter({ prices });
    expect(
      (await a.requirePayment("export_statement", { headers: { [MOCK_PAYMENT_HEADER]: "any" } }))
        .status,
    ).toBe("paid");
    expect(
      (await a.requirePayment("export_statement", { paymentProof: "0xdeadbeef" })).status,
    ).toBe("paid");
  });

  it("refuses a tool with no configured price", async () => {
    const a = new MockPaymentAdapter({ prices });
    const r = await a.requirePayment("unknown_tool", { paymentProof: "x" });
    expect(r.status).toBe("payment_required");
    expect(r.challenge?.accepts).toContain("misconfiguration");
  });
});

describe("payAndCall (outbound)", () => {
  it("succeeds within budget and returns a receipt", async () => {
    const a = new MockPaymentAdapter({ prices, outboundMockCost: USDT("50000") });
    const r = await a.payAndCall("https://x/mcp", "check_agent", { id: 1 }, USDT("250000"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.receipt.cost).toEqual(USDT("50000"));
      expect(r.receipt.status).toBe("paid");
    }
  });

  it("blocks a call whose cost exceeds the budget cap", async () => {
    const a = new MockPaymentAdapter({ prices, outboundMockCost: USDT("300000") });
    const r = await a.payAndCall("https://x/mcp", "check_agent", {}, USDT("250000"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BUDGET_EXCEEDED");
  });

  it("treats a mismatched budget token as a budget failure", async () => {
    const a = new MockPaymentAdapter({
      prices,
      outboundMockCost: { token: "USDG", amount: "1", decimals: 6 },
    });
    const r = await a.payAndCall("https://x/mcp", "t", {}, USDT("250000"));
    expect(r.ok).toBe(false);
  });
});

describe("createPaymentAdapter", () => {
  it("returns a mock adapter by default", () => {
    expect(createPaymentAdapter({ prices, mode: "mock" })).toBeInstanceOf(MockPaymentAdapter);
  });

  it("refuses sdk mode when OKX credentials are absent (fail-closed)", () => {
    // sdk mode must never silently no-op charging: with no facilitator creds it
    // throws, naming the exact env vars, rather than falling back to no-charge.
    const saved = {
      OKX_API_KEY: process.env.OKX_API_KEY,
      OKX_SECRET_KEY: process.env.OKX_SECRET_KEY,
      OKX_PASSPHRASE: process.env.OKX_PASSPHRASE,
    };
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_PASSPHRASE;
    try {
      expect(() => createPaymentAdapter({ prices, mode: "sdk" })).toThrow(/OKX_API_KEY/);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("constructs the real SDK adapter when credentials are supplied", () => {
    // Fake creds: OKXFacilitatorClient only stores config at construction, so no
    // network call happens here — the real facilitator is contacted lazily on the
    // first settle. This proves the selector wires SdkPaymentAdapter, not mock.
    const adapter = createPaymentAdapter({
      prices,
      mode: "sdk",
      okxCredentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
    });
    expect(adapter).toBeInstanceOf(SdkPaymentAdapter);
  });
});
