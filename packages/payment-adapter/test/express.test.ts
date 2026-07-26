import { beforeEach, describe, expect, it, vi } from "vitest";
import { withReceiptStore, type ExpressLikeRequest, type ExpressLikeResponse } from "../src/express.js";
import type { SettlementRecord, SettlementStore } from "../src/sdk.js";

const PAYER = "0xAbC1111111111111111111111111111111111111";
const NONCE = `0x${"34".repeat(32)}`;
const TX = `0x${"ab".repeat(32)}`;
const TOOL = "get_revenue_report";
const PATH = "/services/revenue-report";
const KEY = `${PAYER.toLowerCase()}:${NONCE.toLowerCase()}:${TOOL}`;

class MemoryStore implements SettlementStore {
  records = new Map<string, SettlementRecord>();
  reserve = vi.fn(async (k: string) => this.records.get(k) ?? null);
  update = vi.fn(async (k: string, r: SettlementRecord) => {
    this.records.set(k, r);
  });
  get = vi.fn(async (k: string) => this.records.get(k) ?? null);
}

function paymentHeader(from = PAYER, nonce = NONCE): string {
  return Buffer.from(
    JSON.stringify({ x402Version: 2, payload: { authorization: { from, nonce } } }),
    "utf-8",
  ).toString("base64");
}

function makeReq(overrides: Partial<ExpressLikeRequest> = {}): ExpressLikeRequest {
  return {
    method: "POST",
    path: PATH,
    headers: { "payment-signature": paymentHeader() },
    ...overrides,
  };
}

function makeRes() {
  const headers = new Map<string, string>();
  const res: ExpressLikeResponse & { headers: Map<string, string> } = {
    headers,
    header(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return res;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
  };
  return res;
}

/** Stub middleware that grants access and sets a settlement receipt, like the SDK does. */
function grantingInner(tx = TX) {
  return vi.fn(async (_req: ExpressLikeRequest, res: ExpressLikeResponse, next: (e?: unknown) => void) => {
    res.header(
      "PAYMENT-RESPONSE",
      Buffer.from(
        JSON.stringify({ success: true, status: "success", transaction: tx, payer: PAYER }),
        "utf-8",
      ).toString("base64"),
    );
    next();
  });
}

const toolByPath = new Map([[PATH, TOOL]]);

describe("withReceiptStore — exactly-once charging", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("persists the receipt when the middleware grants access", async () => {
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const next = vi.fn();

    await mw(makeReq(), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(inner).toHaveBeenCalledOnce();
    expect(store.update).toHaveBeenCalledWith(KEY, {
      status: "settled",
      transaction: TX,
      payer: PAYER,
    });
  });

  it("re-delivers a settled nonce WITHOUT invoking payment processing", async () => {
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER });
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const res = makeRes();
    const next = vi.fn();

    await mw(makeReq(), res, next);

    // The whole point: no second charge, but the caller still gets its receipt.
    expect(inner).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    const encoded = res.headers.get("payment-response");
    expect(encoded).toBeDefined();
    expect(JSON.parse(Buffer.from(encoded!, "base64").toString("utf-8"))).toMatchObject({
      success: true,
      status: "success",
      transaction: TX,
      payer: PAYER,
    });
  });

  it("charges again only when the nonce differs", async () => {
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER });
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const other = `0x${"77".repeat(32)}`;
    const next = vi.fn();

    await mw(makeReq({ headers: { "payment-signature": paymentHeader(PAYER, other) } }), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(inner).toHaveBeenCalledOnce();
  });

  it("does not short-circuit a PENDING record (settlement not confirmed)", async () => {
    store.records.set(KEY, { status: "pending", transaction: TX, payer: PAYER });
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const next = vi.fn();

    await mw(makeReq(), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(inner).toHaveBeenCalledOnce();
  });

  it("keys the receipt per tool so a proof cannot cross tools", async () => {
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER });
    const inner = grantingInner();
    const mw = withReceiptStore(
      inner,
      store,
      new Map([["/services/expense-report", "get_expense_report"]]),
    );
    const next = vi.fn();

    await mw(makeReq({ path: "/services/expense-report" }), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // Same payer+nonce, different tool -> different key -> not treated as a replay.
    expect(inner).toHaveBeenCalledOnce();
  });

  it("falls through to payment processing when the store read fails", async () => {
    store.get.mockRejectedValueOnce(new Error("db down"));
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const next = vi.fn();

    await mw(makeReq(), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // A store outage must never block a payable request.
    expect(inner).toHaveBeenCalledOnce();
  });

  it("still delivers when the receipt write fails", async () => {
    store.update.mockRejectedValueOnce(new Error("db down"));
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const next = vi.fn();

    await mw(makeReq(), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next).toHaveBeenCalledOnce();
  });

  it("ignores requests with no payment header and unknown paths", async () => {
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);

    const n1 = vi.fn();
    await mw(makeReq({ headers: {} }), makeRes(), n1);
    await vi.waitFor(() => expect(n1).toHaveBeenCalled());
    expect(store.get).not.toHaveBeenCalled();

    const n2 = vi.fn();
    await mw(makeReq({ path: "/services/unknown" }), makeRes(), n2);
    await vi.waitFor(() => expect(n2).toHaveBeenCalled());
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("propagates a middleware error without persisting a receipt", async () => {
    const boom = new Error("verify failed");
    const inner = vi.fn(
      async (_q: ExpressLikeRequest, _s: ExpressLikeResponse, next: (e?: unknown) => void) =>
        next(boom),
    );
    const mw = withReceiptStore(inner, store, toolByPath);
    const next = vi.fn();

    await mw(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(store.update).not.toHaveBeenCalled();
  });
});
