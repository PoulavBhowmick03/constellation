import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
