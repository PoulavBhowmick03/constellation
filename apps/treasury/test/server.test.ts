import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MOCK_PAYMENT_HEADER, MockPaymentAdapter } from "@constellation/payment-adapter";
import { createApp } from "../src/server.js";
import { PRICES } from "../src/prices.js";
import { MemoryLedger } from "./memory.js";

// Exercises the HTTP-layer x402 preflight added to server.ts: paid tools must
// answer an unpaid call with a real HTTP 402 + PAYMENT-REQUIRED header (so a
// standard x402 client auto-triggers), while free tools and paid-and-satisfied
// calls fall through to the MCP transport (200). Uses the mock adapter — the
// live sdk challenge shape is verified separately against the deployed endpoint.
const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
} as const;

function body(tool: string, args: Record<string, unknown> = { wallet_id: "w_probe", period: {} }) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });
}

describe("server x402 HTTP preflight", () => {
  let server: Server;
  let url: string;

  let walletId: string;

  beforeAll(async () => {
    const ledger = new MemoryLedger();
    // A registered wallet so precondition checks pass and we exercise the payment
    // path (not the WALLET_NOT_FOUND short-circuit).
    const wallet = await ledger.registerWallet(
      "0x1111111111111111111111111111111111111111",
      196,
      0,
    );
    walletId = wallet.id;
    const app = createApp({
      ledger,
      payments: new MockPaymentAdapter({ prices: PRICES }),
      chainId: 196,
      startBlock: 0,
      nonceTtlSeconds: 600,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });

  afterAll(() => {
    server?.close();
  });

  it("answers an unpaid paid-tool call with HTTP 402 and the challenge in the body", async () => {
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_revenue_report", { wallet_id: walletId, period: {} }) });
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error?: { data?: { payment?: unknown } } };
    expect(json.error?.data?.payment).toBeTruthy();
  });

  it("does NOT emit an x402 PAYMENT-REQUIRED header in mock mode (avoids a malformed header)", async () => {
    // Mock challenges carry a string `accepts` and no x402Version; encoding that
    // as x402 would be structurally invalid, so the header must be absent here.
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_revenue_report", { wallet_id: walletId, period: {} }) });
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeNull();
    await res.text();
  });

  it("returns WALLET_NOT_FOUND WITHOUT charging when the wallet is unknown", async () => {
    // Precondition check runs before settlement: an unknown wallet must never be
    // a 402/charge — it is a plain 200 tool error.
    const res = await fetch(url, { method: "POST", headers: { ...MCP_HEADERS, [MOCK_PAYMENT_HEADER]: "any" }, body: body("get_revenue_report", { wallet_id: "w_nope", period: {} }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result?: { content?: { text: string }[] } };
    expect(json.result?.content?.[0].text).toMatch(/WALLET_NOT_FOUND/);
  });

  it("lets a paid-and-satisfied call through to the transport (not 402)", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...MCP_HEADERS, [MOCK_PAYMENT_HEADER]: "any" },
      body: body("get_revenue_report", { wallet_id: walletId, period: {} }),
    });
    expect(res.status).toBe(200);
    await res.text();
  });

  it("never gates a free tool at the HTTP layer", async () => {
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_runway", { wallet_id: walletId }) });
    expect(res.status).toBe(200);
    await res.text();
  });

  // OKX listing-review regression: the platform's x402 validator has NO
  // registered wallet_id. An unpaid request must still see the 402 challenge —
  // argument validation must never mask it (this exact ordering caused the
  // "has not passed x402 standard validation" rejection).
  it("answers an unpaid call with an UNKNOWN wallet with 402, not WALLET_NOT_FOUND", async () => {
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_revenue_report", { wallet_id: "w_nope", period: {} }) });
    expect(res.status).toBe(402);
    await res.text();
  });

  it("answers an unpaid call with NO arguments at all with 402", async () => {
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_revenue_report", {}) });
    expect(res.status).toBe(402);
    await res.text();
  });
});

// Plain-HTTP per-service routes: the surface the OKX listing validator probes.
describe("plain-HTTP /services routes", () => {
  let server: Server;
  let base: string;
  let walletId: string;

  beforeAll(async () => {
    const ledger = new MemoryLedger();
    const wallet = await ledger.registerWallet(
      "0x2222222222222222222222222222222222222222",
      196,
      0,
    );
    walletId = wallet.id;
    const app = createApp({
      ledger,
      payments: new MockPaymentAdapter({ prices: PRICES }),
      chainId: 196,
      startBlock: 0,
      nonceTtlSeconds: 600,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("GET on a paid service returns 402 with the challenge (validator probe)", async () => {
    const res = await fetch(`${base}/services/revenue-report`);
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error?: { code?: string; payment?: unknown } };
    expect(json.error?.code).toBe("PAYMENT_REQUIRED");
    expect(json.error?.payment).toBeTruthy();
  });

  it("unpaid POST on a paid service returns 402 even with no/unknown args", async () => {
    const res = await fetch(`${base}/services/expense-report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
    await res.text();
  });

  it("paid POST with a registered wallet returns the report directly (200)", async () => {
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", [MOCK_PAYMENT_HEADER]: "any" },
      body: JSON.stringify({ wallet_id: walletId, period: {} }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total_in?: unknown; error?: unknown };
    expect(json.error).toBeUndefined();
  });

  it("paid POST with an unknown wallet is 404 and never settles", async () => {
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", [MOCK_PAYMENT_HEADER]: "any" },
      body: JSON.stringify({ wallet_id: "w_nope", period: {} }),
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("WALLET_NOT_FOUND");
  });

  it("paid POST with a bad export format is 400 and never settles", async () => {
    const res = await fetch(`${base}/services/export-statement`, {
      method: "POST",
      headers: { "content-type": "application/json", [MOCK_PAYMENT_HEADER]: "any" },
      body: JSON.stringify({ wallet_id: walletId, period: {}, format: "pdf" }),
    });
    expect(res.status).toBe(400);
    await res.text();
  });

  it("free service routes answer directly with 200 (register challenge + runway)", async () => {
    const reg = await fetch(`${base}/services/register-wallet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "0x3333333333333333333333333333333333333333" }),
    });
    expect(reg.status).toBe(200);
    const regJson = (await reg.json()) as { challenge?: { nonce?: string } };
    expect(regJson.challenge?.nonce).toBeTruthy();

    const run = await fetch(`${base}/services/runway`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet_id: walletId }),
    });
    expect(run.status).toBe(200);
    await run.text();
  });
});

// A paying caller has already proven control of its address by signing the
// EIP-3009 authorization, so omitting wallet_id should resolve to that wallet
// rather than failing a call it has already paid for.
describe("paid-call argument defaulting", () => {
  let server: Server;
  let base: string;
  let ledger: MemoryLedger;

  const PAYER = "0x4444444444444444444444444444444444444444";
  const PAYER_WALLET = "w_444444444444";

  /** A PAYMENT-SIGNATURE carrier the adapter can read a claimed payer from. */
  function payerHeader(from = PAYER): Record<string, string> {
    const payload = { x402Version: 2, payload: { authorization: { from } } };
    return {
      "payment-signature": Buffer.from(JSON.stringify(payload), "utf-8").toString("base64"),
    };
  }

  beforeAll(async () => {
    ledger = new MemoryLedger();
    const app = createApp({
      ledger,
      payments: new MockPaymentAdapter({ prices: PRICES }),
      chainId: 196,
      startBlock: 0,
      nonceTtlSeconds: 600,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("defaults wallet_id to the paying wallet and registers it on first use", async () => {
    expect(await ledger.getWalletById(PAYER_WALLET)).toBeNull();

    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MOCK_PAYMENT_HEADER]: "any",
        ...payerHeader(),
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { error?: unknown };
    expect(json.error).toBeUndefined();
    // Registration is a side effect of the paid call, keyed to the payer.
    const registered = await ledger.getWalletById(PAYER_WALLET);
    expect(registered?.address.toLowerCase()).toBe(PAYER.toLowerCase());
  });

  it("lets an explicit wallet_id win over the paying wallet", async () => {
    const other = await ledger.registerWallet(
      "0x5555555555555555555555555555555555555555",
      196,
      0,
    );
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MOCK_PAYMENT_HEADER]: "any",
        ...payerHeader(),
      },
      body: JSON.stringify({ wallet_id: other.id }),
    });
    expect(res.status).toBe(200);
    await res.text();
  });

  it("defaults an omitted export format to json", async () => {
    const res = await fetch(`${base}/services/export-statement`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MOCK_PAYMENT_HEADER]: "any",
        ...payerHeader(),
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    await res.text();
  });

  it("still rejects an invalid explicit format rather than overriding it", async () => {
    const res = await fetch(`${base}/services/export-statement`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MOCK_PAYMENT_HEADER]: "any",
        ...payerHeader(),
      },
      body: JSON.stringify({ format: "pdf" }),
    });
    expect(res.status).toBe(400);
    await res.text();
  });

  it("reports the missing argument when no payer can be derived", async () => {
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", [MOCK_PAYMENT_HEADER]: "any" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toContain("wallet_id is required");
  });

  it("does not register a wallet for an unpaid request", async () => {
    const before = ledger.wallets.size;
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", ...payerHeader("0x6666666666666666666666666666666666666666") },
      body: JSON.stringify({}),
    });
    // A PAYMENT-SIGNATURE alone is not payment in mock mode; it must 402.
    expect(res.status).toBe(402);
    await res.text();
    expect(ledger.wallets.size).toBe(before);
  });
});

// The production paid surface: precheck -> OKX middleware -> delivery.
// A stub stands in for the SDK middleware so the mount order is testable
// without real facilitator credentials.
describe("SDK paid-route mount (production shape)", () => {
  let server: Server;
  let base: string;
  let ledger: MemoryLedger;
  let middlewareCalls: number;
  let grant: boolean;

  const PAYER = "0x7777777777777777777777777777777777777777";
  const PAYER_WALLET = "w_777777777777";

  function payerHeader(from = PAYER): Record<string, string> {
    const payload = { x402Version: 2, payload: { authorization: { from, nonce: "0x01" } } };
    return {
      "payment-signature": Buffer.from(JSON.stringify(payload), "utf-8").toString("base64"),
    };
  }

  beforeAll(async () => {
    ledger = new MemoryLedger();
    const app = createApp({
      ledger,
      payments: new MockPaymentAdapter({ prices: PRICES }),
      chainId: 196,
      startBlock: 0,
      nonceTtlSeconds: 600,
      // Stub SDK middleware: 402 unless `grant`, mirroring the real one which
      // only calls next() on a confirmed settlement.
      paidRouteMiddleware: ((_req: unknown, res: never, next: (e?: unknown) => void) => {
        middlewareCalls += 1;
        if (grant) {
          (res as { header: (n: string, v: string) => unknown }).header(
            "PAYMENT-RESPONSE",
            "stub-receipt",
          );
          next();
          return;
        }
        (res as unknown as { status: (c: number) => { json: (b: unknown) => void } })
          .status(402)
          .json({ error: { code: "PAYMENT_REQUIRED" } });
      }) as never,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(() => {
    middlewareCalls = 0;
    grant = false;
  });

  it("routes an unpaid GET straight to the payment middleware", async () => {
    // Must reach the SDK so browsers get its paywall and validators get a 402.
    const res = await fetch(`${base}/services/revenue-report`);
    expect(res.status).toBe(402);
    expect(middlewareCalls).toBe(1);
    await res.text();
  });

  it("routes an unpaid POST to the middleware without running precheck", async () => {
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
    expect(middlewareCalls).toBe(1);
    await res.text();
  });

  it("rejects a paid call with an unknown wallet BEFORE reaching payment", async () => {
    grant = true;
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", ...payerHeader() },
      body: JSON.stringify({ wallet_id: "w_nope" }),
    });
    expect(res.status).toBe(404);
    // The whole point of precheck-before-charge: never settle what we can't fulfil.
    expect(middlewareCalls).toBe(0);
    await res.text();
  });

  it("rejects a bad export format before reaching payment", async () => {
    grant = true;
    const res = await fetch(`${base}/services/export-statement`, {
      method: "POST",
      headers: { "content-type": "application/json", ...payerHeader() },
      body: JSON.stringify({ format: "pdf" }),
    });
    expect(res.status).toBe(400);
    expect(middlewareCalls).toBe(0);
    await res.text();
  });

  it("delivers the report and registers the payer once payment is granted", async () => {
    grant = true;
    expect(await ledger.getWalletById(PAYER_WALLET)).toBeNull();

    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", ...payerHeader() },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(middlewareCalls).toBe(1);
    const json = (await res.json()) as { error?: unknown };
    expect(json.error).toBeUndefined();
    // Registration is a post-settlement side effect, so it only happens here.
    expect((await ledger.getWalletById(PAYER_WALLET))?.address.toLowerCase()).toBe(PAYER);
  });

  it("does not register the payer when the middleware withholds access", async () => {
    grant = false;
    const before = ledger.wallets.size;
    const res = await fetch(`${base}/services/expense-report`, {
      method: "POST",
      headers: { "content-type": "application/json", ...payerHeader("0x8888888888888888888888888888888888888888") },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
    await res.text();
    expect(ledger.wallets.size).toBe(before);
  });

  // Found live: a real external payment (0.2 USDT₮0, real X Layer tx) settled
  // against export_statement replayed as a paid GET — reusing the verb from
  // its own unpaid 402 probe — and only THEN failed with "format required",
  // after the buyer had already been charged. Routes are verb-less so the SDK
  // settles regardless of method; precheck must reject before it, not after.
  it("rejects a paid GET before reaching payment, not after", async () => {
    grant = true;
    const res = await fetch(`${base}/services/export-statement?format=csv`, {
      method: "GET",
      headers: { ...payerHeader() },
    });
    expect(res.status).toBe(400);
    expect(middlewareCalls).toBe(0);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toMatch(/POST/);
  });
});
