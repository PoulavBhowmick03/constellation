import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createPaidRouteMiddleware } from "../src/express.js";
import type { SettlementRecord, SettlementStore } from "../src/sdk.js";
import { TREASURY_X402 } from "../src/sdk.js";

/**
 * End-to-end proof that `createPaidRouteMiddleware` persists a receipt from a
 * REAL settle, through the REAL `x402ResourceServer` / `x402HTTPResourceServer`
 * / `paymentMiddlewareFromHTTPServer` chain — not a hand-rolled stub of
 * `withReceiptStore`.
 *
 * This is the layer that hid the actual production bug: two live payments
 * settled correctly on-chain but wrote zero receipt rows, because reading the
 * PAYMENT-RESPONSE header inside the `next` callback raced the real SDK's
 * verify-then-optimistically-deliver flow — `next()` fires once the payment is
 * VERIFIED, before settlement (and `onAfterSettle`) completes. Every prior test
 * in this package used a stub `inner` that called its `next` synchronously
 * on success, which cannot reproduce that ordering — hence it never caught
 * this. This file drives the real middleware factory with a facilitator stub
 * whose `settle()` resolves asynchronously and reports `status: "timeout"`
 * (the shape observed live), to pin the fix against the actual failure mode.
 */
const PAYER = "0x1b3F5eCf3694Ef7E52874e14598FC8f6E1EAdb42";
const NONCE = `0x${"5a".repeat(32)}`;
const TX = `0x${"f1".repeat(32)}`;
const TOOL = "spend_preflight";
const PATH = "/services/spend-preflight";
const RESOURCE = `https://treasury.test${PATH}`;

class MemoryStore implements SettlementStore {
  records = new Map<string, SettlementRecord>();
  reserve = vi.fn(async (k: string) => this.records.get(k) ?? null);
  update = vi.fn(async (k: string, r: SettlementRecord) => {
    const prior = this.records.get(k);
    this.records.set(k, { ...prior, ...r });
  });
  get = vi.fn(async (k: string) => this.records.get(k) ?? null);
  /** Mirrors the real UPSERT: creates a `pending` row if the receipt hasn't landed yet. */
  putResult = vi.fn(async (k: string, result: unknown) => {
    const row = this.records.get(k);
    if (!row) {
      this.records.set(k, { status: "pending", result });
      return;
    }
    if (row.result === undefined) this.records.set(k, { ...row, result });
  });
}

/** A well-formed exact/EIP-3009 PaymentPayload, matching what a real client sends. */
function paymentHeader(): string {
  const payload = {
    x402Version: 2,
    resource: { url: RESOURCE },
    accepted: {
      scheme: "exact",
      network: TREASURY_X402.network,
      asset: TREASURY_X402.asset,
      amount: "50000",
      payTo: TREASURY_X402.payTo,
      maxTimeoutSeconds: 300,
      extra: { name: TREASURY_X402.assetDomainName, version: TREASURY_X402.assetDomainVersion },
    },
    payload: {
      signature: "0xsig",
      authorization: {
        from: PAYER,
        to: TREASURY_X402.payTo,
        value: "50000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: NONCE,
      },
    },
  };
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

/**
 * Simulates the real facilitator: `settle()` resolves ASYNCHRONOUSLY (a real
 * network round trip) and reports `status: "timeout"` with a transaction hash
 * already present — the exact shape observed against the live OKX facilitator
 * on X Layer, where `next()` was seen firing before this had resolved.
 */
function stubFacilitator(settleDelayMs: number) {
  return {
    getSupported: async () => ({
      kinds: [{ x402Version: 2, network: TREASURY_X402.network, scheme: "exact" }],
      extensions: [],
      signers: {},
    }),
    getSigners: () => [],
    verify: async () => ({ isValid: true, payer: PAYER }),
    settle: async () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              success: true,
              status: "timeout",
              transaction: TX,
              network: TREASURY_X402.network,
              payer: PAYER,
            }),
          settleDelayMs,
        ),
      ),
    // The SDK's NATIVE timeout recovery (undocumented in types beyond this
    // optional method) polls this to decide whether to deliver. Matches
    // production: the client there received status:"success" after the SDK's
    // internal poll confirmed, even though settle() itself first said "timeout".
    getSettleStatus: async () => ({
      success: true,
      status: "success",
      transaction: TX,
      network: TREASURY_X402.network,
      payer: PAYER,
    }),
  };
}

describe("createPaidRouteMiddleware — receipt persisted from a real (delayed) settle", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function serve(store: MemoryStore, settleDelayMs: number) {
    const app = express();
    app.use(express.json());
    app.use(
      createPaidRouteMiddleware({
        credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
        facilitatorClient: stubFacilitator(settleDelayMs),
        settlementStore: store,
        routes: [
          {
            pattern: PATH,
            tool: TOOL,
            price: { amount: "50000" },
            resource: RESOURCE,
          },
        ],
      }) as unknown as express.RequestHandler,
    );
    app.all(PATH, async (req, res) => {
      const result = { decision: "allow", computed: true };
      res.json(result);
      // Mirrors apps/treasury/src/server.ts's delivery handler: cache the
      // result AFTER responding, via the state withReceiptStore attached.
      await (req as unknown as { x402?: { saveResult(r: unknown): Promise<void> } }).x402?.saveResult(
        result,
      );
    });
    const s = await new Promise<Server>((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    server = s;
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  }

  const key = `${PAYER.toLowerCase()}:${NONCE.toLowerCase()}:${TOOL}`;

  it("delivers correctly AND persists the receipt through a real timeout-then-confirmed settle", async () => {
    const store = new MemoryStore();
    // Mirrors production: settle() first reports "timeout"; the SDK's native
    // polling then confirms via getSettleStatus before delivering.
    const base = await serve(store, 40);

    const res = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": paymentHeader() },
      body: JSON.stringify({ amount: "50000" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decision: "allow", computed: true });

    // The receipt write is decoupled from response delivery (see the note on
    // `createPaidRouteMiddleware`'s hook) — assert it lands, not exactly when.
    await vi.waitFor(() => expect(store.records.get(key)?.status).toBe("settled"), { timeout: 2000 });
    expect(store.records.get(key)).toMatchObject({ status: "settled", transaction: TX, payer: PAYER });
  });

  it("merges the result and the receipt correctly regardless of which lands first", async () => {
    // A second real bug found live: putResult was UPDATE-only, so a
    // result-cache write that landed before onAfterSettle had created the row
    // matched nothing and silently no-opped — the receipt landed, but the
    // cached result never did. Which side actually lands first is a genuine
    // race (not deterministic even with a settle delay), so this asserts the
    // invariant that has to hold either way: both end up on the SAME row.
    const store = new MemoryStore();
    const base = await serve(store, 150);

    const res = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": paymentHeader() },
      body: JSON.stringify({ amount: "50000" }),
    });
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(store.records.get(key)?.status).toBe("settled"), { timeout: 2000 });
    expect(store.records.size).toBe(1); // one row, not two independent writes
    expect(store.records.get(key)).toMatchObject({
      status: "settled",
      transaction: TX,
      payer: PAYER,
      result: { decision: "allow", computed: true },
    });
  });

  it("creates the row from the result write when it genuinely arrives first", async () => {
    // Directly exercises putResult's create-if-absent path against an empty
    // store, independent of the real middleware's timing.
    const store = new MemoryStore();
    await store.putResult(key, { decision: "allow", computed: true });

    expect(store.records.get(key)).toEqual({ status: "pending", result: { decision: "allow", computed: true } });

    await store.update(key, { status: "settled", transaction: TX, payer: PAYER });
    expect(store.records.get(key)).toEqual({
      status: "settled",
      transaction: TX,
      payer: PAYER,
      result: { decision: "allow", computed: true },
    });
  });

  it("makes a subsequent replay short-circuit once the late receipt has landed", async () => {
    const store = new MemoryStore();
    const base = await serve(store, 30);

    await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": paymentHeader() },
      body: JSON.stringify({ amount: "50000" }),
    });
    await vi.waitFor(() => expect(store.records.get(key)?.status).toBe("settled"));

    const replay = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": paymentHeader() },
      body: JSON.stringify({ amount: "50000" }),
    });
    expect(replay.status).toBe(200);
    const encoded = replay.headers.get("payment-response");
    expect(encoded).toBeTruthy();
    expect(JSON.parse(Buffer.from(encoded!, "base64").toString("utf-8"))).toMatchObject({
      transaction: TX,
      payer: PAYER,
    });
  });
});
