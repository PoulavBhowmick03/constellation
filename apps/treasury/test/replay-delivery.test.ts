import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockPaymentAdapter,
  withReceiptStore,
  type ExpressLikeRequest,
  type ExpressLikeResponse,
  type MiddlewareHandler,
  type SettlementRecord,
  type SettlementStore,
} from "@constellation/payment-adapter";
import type { TransferRow } from "@constellation/indexer";
import { createApp } from "../src/server.js";
import { PRICES } from "../src/prices.js";
import { MemoryLedger } from "./memory.js";

/**
 * Exactly-once delivery, end to end through the real app.
 *
 * The unit tests in payment-adapter pin the middleware's half of the contract.
 * This pins the half that actually costs money: that the delivery handler
 * SERVES the cached result instead of recomputing, and that the recomputation
 * genuinely does not happen (asserted against the ledger, not just the bytes).
 *
 * `inner` stands in for the OKX middleware — it grants access and sets a
 * receipt, which is all the receipt-store wrapper observes.
 */
const PAYER = "0x1b3F5eCf3694Ef7E52874e14598FC8f6E1EAdb42";
const TX = `0x${"c3".repeat(32)}`;
const PATH = "/services/revenue-report";
const TOOL = "get_revenue_report";

function paymentHeader(nonce: string): string {
  return Buffer.from(
    JSON.stringify({ x402Version: 2, payload: { authorization: { from: PAYER, nonce } } }),
    "utf-8",
  ).toString("base64");
}

class MemoryStore implements SettlementStore {
  records = new Map<string, SettlementRecord>();
  async reserve(k: string) {
    return this.records.get(k) ?? null;
  }
  async update(k: string, r: SettlementRecord) {
    const prior = this.records.get(k);
    // Mirror the SQL: `settled` is terminal, and a cached result is never lost.
    this.records.set(k, { ...prior, ...r });
  }
  async get(k: string) {
    return this.records.get(k) ?? null;
  }
  async putResult(k: string, result: unknown) {
    // Mirrors the real UPSERT: creates a `pending` row if the receipt hasn't landed yet.
    const row = this.records.get(k);
    if (!row) {
      this.records.set(k, { status: "pending", result });
      return;
    }
    if (row.result === undefined) this.records.set(k, { ...row, result });
  }
}

/** Stub OKX middleware: grants and sets the settlement receipt header. */
const granting: MiddlewareHandler = (_req, res, next) => {
  res.header(
    "PAYMENT-RESPONSE",
    Buffer.from(
      JSON.stringify({ success: true, status: "success", transaction: TX, payer: PAYER }),
      "utf-8",
    ).toString("base64"),
  );
  next();
};

function transfer(amount: string, daysAgo: number): TransferRow {
  return {
    walletId: "w_1b3f5ecf3694",
    txHash: `0x${amount}${daysAgo}`,
    logIndex: 0,
    blockNumber: 1,
    blockTime: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    token: "USDT",
    tokenAddress: "0xtoken",
    decimals: 6,
    from: "0xcounterparty",
    to: PAYER,
    amount,
    direction: "in",
    counterparty: "0xcounterparty",
  };
}

async function harness() {
  const ledger = new MemoryLedger();
  await ledger.registerWallet(PAYER, 196, 0);
  ledger.transfers.push(transfer("5000000", 2));
  const getTransfers = vi.spyOn(ledger, "getTransfers");

  const store = new MemoryStore();
  const app = createApp({
    ledger,
    payments: new MockPaymentAdapter({ prices: PRICES }),
    chainId: 196,
    startBlock: 0,
    nonceTtlSeconds: 600,
    paidRouteMiddleware: withReceiptStore(
      granting as (r: ExpressLikeRequest, s: ExpressLikeResponse, n: (e?: unknown) => void) => void,
      store,
      new Map([[PATH, TOOL]]),
    ),
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = (nonce: string) =>
    fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": paymentHeader(nonce) },
      body: JSON.stringify({ wallet_id: "w_1b3f5ecf3694" }),
    });

  return { ledger, store, server, call, getTransfers };
}

describe("paid delivery is exactly-once, not just the charge", () => {
  let open: Server | undefined;
  afterEach(() => {
    open?.close();
    open = undefined;
  });

  // Equality here is semantic, not byte-for-byte: the production store is a
  // JSONB column, which may normalise key order on the round trip. Every value
  // that carries meaning (money as base-unit strings, ISO timestamps) survives
  // exactly; nothing in a result depends on key order.
  it("returns the ORIGINAL result on replay and does not touch the ledger again", async () => {
    const { server, call, getTransfers, ledger } = await harness();
    open = server;
    const nonce = `0x${"11".repeat(32)}`;

    const first = await call(nonce);
    expect(first.status).toBe(200);
    const original = await first.json();
    const callsAfterFirst = getTransfers.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Move the ledger underneath the replay. Without the cache the same receipt
    // would now vouch for a materially different number.
    ledger.transfers.push(transfer("9000000", 1));

    const second = await call(nonce);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(original);
    // The real assertion: no recomputation happened at all.
    expect(getTransfers.mock.calls.length).toBe(callsAfterFirst);
  });

  it("still carries the original settlement receipt on the replay", async () => {
    const { server, call } = await harness();
    open = server;
    const nonce = `0x${"22".repeat(32)}`;

    await (await call(nonce)).json();
    const replay = await call(nonce);
    await replay.json();

    const encoded = replay.headers.get("payment-response");
    expect(encoded).toBeTruthy();
    expect(JSON.parse(Buffer.from(encoded!, "base64").toString("utf-8"))).toMatchObject({
      transaction: TX,
      payer: PAYER,
    });
  });

  it("caches the delivered result under the settlement", async () => {
    const { server, call, store } = await harness();
    open = server;
    const nonce = `0x${"33".repeat(32)}`;

    const body = await (await call(nonce)).json();
    const key = `${PAYER.toLowerCase()}:${nonce}:${TOOL}`;
    await vi.waitFor(() => expect(store.records.get(key)?.result).toBeDefined());
    expect(store.records.get(key)!.result).toEqual(body);
  });

  it("computes fresh for a different nonce, so a new payment buys a new answer", async () => {
    const { server, call, getTransfers, ledger } = await harness();
    open = server;

    await (await call(`0x${"44".repeat(32)}`)).json();
    const after = getTransfers.mock.calls.length;
    ledger.transfers.push(transfer("9000000", 1));

    const fresh = await (await call(`0x${"55".repeat(32)}`)).json();
    expect(getTransfers.mock.calls.length).toBeGreaterThan(after);
    // The new payment sees the new inflow.
    expect(JSON.stringify(fresh)).toContain("9000000");
  });
});
