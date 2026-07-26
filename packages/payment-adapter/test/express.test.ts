import { AsyncLocalStorage } from "node:async_hooks";
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
  /** Write-once, mirroring the SQL `WHERE result IS NULL` guard. */
  putResult = vi.fn(async (k: string, result: unknown) => {
    const row = this.records.get(k);
    if (row && row.result === undefined) this.records.set(k, { ...row, result });
  });
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

/**
 * Exactly-once DELIVERY.
 *
 * The charge was already exactly-once; the delivered RESULT was not. A replay
 * re-ran the tool, so the same receipt could vouch for two different answers
 * (spend_preflight is balance- and time-sensitive), and a spent authorization
 * bought unbounded recomputation. These tests pin the cache that closes both.
 */
describe("withReceiptStore — exactly-once delivery", () => {
  let store: MemoryStore;
  const RESULT = { revenue: { amount: "1230000", token: "USDT" }, ranked: ["0xc"] };

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("hands the handler a saver on a first paid call, and no cached result", async () => {
    const mw = withReceiptStore(grantingInner(), store, toolByPath);
    const req = makeReq();
    const next = vi.fn();

    await mw(req, makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(req.x402?.cachedResult).toBeUndefined();
    await req.x402!.saveResult(RESULT);
    expect(store.records.get(KEY)?.result).toEqual(RESULT);
  });

  it("returns the ORIGINAL result on replay, not a recomputation", async () => {
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER, result: RESULT });
    const inner = grantingInner();
    const mw = withReceiptStore(inner, store, toolByPath);
    const req = makeReq();
    const next = vi.fn();

    await mw(req, makeRes(), next);

    expect(inner).not.toHaveBeenCalled();
    expect(req.x402?.cachedResult).toEqual(RESULT);
  });

  it("never rewrites a cached result, so the first delivery is canonical", async () => {
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER, result: RESULT });
    const mw = withReceiptStore(grantingInner(), store, toolByPath);
    const req = makeReq();

    await mw(req, makeRes(), vi.fn());
    await req.x402!.saveResult({ revenue: { amount: "9999999", token: "USDT" } });

    expect(store.records.get(KEY)?.result).toEqual(RESULT);
  });

  it("recomputes when a settled receipt has no cached result, then caches it", async () => {
    // Crash between settle and delivery, or an upgrade from a pre-cache receipt:
    // the buyer already paid, so we must still deliver — and cache it this time.
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER });
    const mw = withReceiptStore(grantingInner(), store, toolByPath);
    const req = makeReq();
    const next = vi.fn();

    await mw(req, makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.x402?.cachedResult).toBeUndefined();
    await req.x402!.saveResult(RESULT);
    expect(store.records.get(KEY)?.result).toEqual(RESULT);
  });

  it("delivers normally when the cache write fails", async () => {
    store.putResult.mockRejectedValueOnce(new Error("db down"));
    const mw = withReceiptStore(grantingInner(), store, toolByPath);
    const req = makeReq();
    const next = vi.fn();

    await mw(req, makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // The buyer is already charged and served: a cache miss costs a future
    // recomputation, never an error on this call.
    await expect(req.x402!.saveResult(RESULT)).resolves.toBeUndefined();
  });

  it("degrades safely against a store with no putResult", async () => {
    const legacy: SettlementStore = { reserve: store.reserve, update: store.update, get: store.get };
    const mw = withReceiptStore(grantingInner(), legacy, toolByPath);
    const req = makeReq();
    const next = vi.fn();

    await mw(req, makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    await expect(req.x402!.saveResult(RESULT)).resolves.toBeUndefined();
  });

  it("does not leak a cached result across tools", async () => {
    store.records.set(KEY, { status: "settled", transaction: TX, payer: PAYER, result: RESULT });
    const mw = withReceiptStore(
      grantingInner(),
      store,
      new Map([["/services/expense-report", "get_expense_report"]]),
    );
    const req = makeReq({ path: "/services/expense-report" });
    const next = vi.fn();

    await mw(req, makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(req.x402?.cachedResult).toBeUndefined();
  });
});

/**
 * Regression coverage for a real production bug: two live payments against the
 * deployed SDK settled correctly on-chain but wrote ZERO receipt rows, because
 * `persistReceipt` read the PAYMENT-RESPONSE header off `res` synchronously
 * inside the `next` callback — before the SDK had actually set it. The header
 * only appears on the response the client eventually receives, attached later
 * downstream. `createPaidRouteMiddleware` now captures the settlement result
 * via the SDK's `onAfterSettle` hook into an AsyncLocalStorage store instead.
 *
 * These tests simulate that shape directly: `inner` writes into the ALS store
 * (mirroring the hook) and sets NO header at all, proving the header is no
 * longer load-bearing for the receipt to be written.
 */
describe("withReceiptStore — settlement captured via AsyncLocalStorage, not headers", () => {
  let store: MemoryStore;
  const als = new AsyncLocalStorage<{ transaction?: string; payer?: string }>();

  beforeEach(() => {
    store = new MemoryStore();
  });

  /** Simulates the SDK: grants access, writes into ALS, sets NO header. */
  const grantingViaHook: (tx?: string) => (
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: (e?: unknown) => void,
  ) => void = (tx = TX) =>
    vi.fn((_req, _res, next) => {
      const captured = als.getStore();
      if (captured) {
        captured.transaction = tx;
        captured.payer = PAYER;
      }
      next();
    });

  it("persists the receipt from the captured settlement, with no header present", async () => {
    const inner = grantingViaHook();
    const mw = withReceiptStore(inner, store, toolByPath, als);
    const res = makeRes();
    const next = vi.fn();

    await mw(makeReq(), res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    // The bug this regresses: no header was ever set on `res`.
    expect(res.headers.get("payment-response")).toBeUndefined();
    expect(store.update).toHaveBeenCalledWith(KEY, {
      status: "settled",
      transaction: TX,
      payer: PAYER,
    });
  });

  it("makes the cached result write succeed end to end (the original silent-failure chain)", async () => {
    const inner = grantingViaHook();
    const mw = withReceiptStore(inner, store, toolByPath, als);
    const req = makeReq();

    await mw(req, makeRes(), vi.fn());
    await vi.waitFor(() => expect(store.records.get(KEY)?.status).toBe("settled"));

    // Before the fix: no row existed yet, so this UPDATE-only write matched
    // zero rows and silently did nothing. Now the row exists to write into.
    await req.x402!.saveResult({ ok: true });
    expect(store.records.get(KEY)?.result).toEqual({ ok: true });
  });

  it("isolates concurrent requests: each sees only its own captured settlement", async () => {
    const otherNonce = `0x${"99".repeat(32)}`;
    const otherKey = `${PAYER.toLowerCase()}:${otherNonce.toLowerCase()}:${TOOL}`;
    const otherTx = `0x${"cd".repeat(32)}`;

    const inner = vi.fn((req: ExpressLikeRequest, _res: ExpressLikeResponse, next: (e?: unknown) => void) => {
      const captured = als.getStore();
      if (captured) {
        // Distinguish which concurrent call this is by its nonce.
        captured.transaction = req.headers["payment-signature"] === paymentHeader(PAYER, otherNonce) ? otherTx : TX;
        captured.payer = PAYER;
      }
      next();
    });
    const mw = withReceiptStore(inner, store, toolByPath, als);

    await Promise.all([
      mw(makeReq(), makeRes(), vi.fn()),
      mw(makeReq({ headers: { "payment-signature": paymentHeader(PAYER, otherNonce) } }), makeRes(), vi.fn()),
    ]);

    expect(store.records.get(KEY)?.transaction).toBe(TX);
    expect(store.records.get(otherKey)?.transaction).toBe(otherTx);
  });

  it("falls back to the header when no ALS store is supplied (unchanged legacy path)", async () => {
    const inner = grantingInner(); // sets the header, as before
    const mw = withReceiptStore(inner, store, toolByPath); // no als arg
    const next = vi.fn();

    await mw(makeReq(), makeRes(), next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(store.update).toHaveBeenCalledWith(KEY, {
      status: "settled",
      transaction: TX,
      payer: PAYER,
    });
  });
});
