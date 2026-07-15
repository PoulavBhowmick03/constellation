import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOCK_PAYMENT_HEADER,
  MockPaymentAdapter,
  decodePaymentRequired,
} from "@constellation/payment-adapter";
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

  beforeAll(async () => {
    const app = createApp({
      ledger: new MemoryLedger(),
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

  it("answers an unpaid paid-tool call with HTTP 402 + a decodable PAYMENT-REQUIRED header", async () => {
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_revenue_report") });
    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    // The transport never ran: this is a JSON-RPC error envelope, not SSE.
    const challenge = decodePaymentRequired(header!) as Record<string, unknown>;
    expect(challenge).toHaveProperty("accepts");
  });

  it("lets a paid-and-satisfied call through to the transport (not 402)", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...MCP_HEADERS, [MOCK_PAYMENT_HEADER]: "any" },
      body: body("get_revenue_report"),
    });
    expect(res.status).toBe(200);
  });

  it("never gates a free tool at the HTTP layer", async () => {
    const res = await fetch(url, { method: "POST", headers: MCP_HEADERS, body: body("get_runway", { wallet_id: "w_probe" }) });
    expect(res.status).toBe(200);
  });
});
