import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPaidRouteMiddleware } from "@constellation/payment-adapter";
import { createApp } from "../src/server.js";
import { PRICES } from "../src/prices.js";
import { TOOL_DESCRIPTORS } from "../src/descriptors.js";
import { MemoryLedger } from "./memory.js";
import { MockPaymentAdapter } from "@constellation/payment-adapter";

/**
 * The listing-rejection check.
 *
 * OKX rejected the hand-rolled implementation as "not integrated with the
 * official OKX Payment SDK". The most visible divergence was that a browser
 * hitting the endpoint got raw JSON, where every SDK-served endpoint returns a
 * paywall page. These tests pin the SDK-served behaviour on both surfaces.
 *
 * A stub facilitator stands in for OKX: the middleware syncs supported kinds
 * on first request and cannot emit a 402 without one.
 */
const BASE = "https://treasury.test";

const stubFacilitator = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, network: "eip155:196", scheme: "exact" }],
  }),
};

describe("SDK-served paid surface", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = createApp({
      ledger: new MemoryLedger(),
      payments: new MockPaymentAdapter({ prices: PRICES }),
      chainId: 196,
      startBlock: 0,
      nonceTtlSeconds: 600,
      paidRouteMiddleware: createPaidRouteMiddleware({
        credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
        facilitatorClient: stubFacilitator,
        unpaidBody: (tool: string) => ({
          error: { code: "PAYMENT_REQUIRED", message: `payment required for "${tool}"` },
        }),
        routes: (
          [
            ["revenue-report", "get_revenue_report"],
            ["expense-report", "get_expense_report"],
            ["export-statement", "export_statement"],
          ] as const
        ).map(([slug, tool]) => ({
          pattern: `/services/${slug}`,
          tool,
          price: PRICES[tool]!,
          resource: `${BASE}/services/${slug}`,
          descriptor: TOOL_DESCRIPTORS[tool],
        })),
      }),
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("serves an HTML paywall to a browser probe, not JSON", async () => {
    // THE regression this migration exists to fix.
    const res = await fetch(`${base}/services/revenue-report`, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126",
      },
    });

    expect(res.status).toBe(402);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toMatch(/<!DOCTYPE html>/i);
    expect(body).toMatch(/Payment Required/i);
  });

  it("still serves the JSON 402 contract to API clients", async () => {
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(402);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toMatchObject({
      error: { code: "PAYMENT_REQUIRED" },
    });
  });

  it("emits a standard PAYMENT-REQUIRED challenge carrying the bazaar schema", async () => {
    const res = await fetch(`${base}/services/revenue-report`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({}),
    });
    await res.text();

    const header = res.headers.get("payment-required");
    expect(header).toBeTruthy();
    const challenge = JSON.parse(Buffer.from(header!, "base64").toString("utf-8")) as Record<
      string,
      never
    >;

    expect(challenge).toMatchObject({
      x402Version: 2,
      resource: { url: `${BASE}/services/revenue-report` },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:196",
          amount: "100000",
          payTo: "0x212e82dc1d13b991d5318d970963f5ddfd81a178",
        },
      ],
    });
    // Argument discovery must survive the migration.
    expect(challenge.extensions).toMatchObject({
      bazaar: { outputSchema: { input: { type: "http", method: "POST" } } },
    });
  });

  it("protects every verb, so a GET validator probe is challenged too", async () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const res = await fetch(`${base}/services/expense-report`, { method });
      expect(res.status, `${method} should be challenged`).toBe(402);
      await res.text().catch(() => undefined);
    }
  });

  it("prices each route independently", async () => {
    const res = await fetch(`${base}/services/export-statement`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    await res.text();
    const challenge = JSON.parse(
      Buffer.from(res.headers.get("payment-required")!, "base64").toString("utf-8"),
    ) as { accepts: Array<{ amount: string }> };
    expect(challenge.accepts[0]!.amount).toBe("200000");
  });
});
