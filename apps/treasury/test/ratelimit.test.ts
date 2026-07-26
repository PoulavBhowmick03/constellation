import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { MockPaymentAdapter } from "@constellation/payment-adapter";
import { clientKey, createRateLimiter } from "../src/ratelimit.js";
import { createApp } from "../src/server.js";
import { PRICES } from "../src/prices.js";
import { MemoryLedger } from "./memory.js";

describe("createRateLimiter", () => {
  it("allows a full burst then refuses", () => {
    const rl = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => 0 });
    expect([rl.take("a"), rl.take("a"), rl.take("a")]).toEqual([true, true, true]);
    expect(rl.take("a")).toBe(false);
  });

  it("refills over time at the configured rate", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => t });
    rl.take("a");
    rl.take("a");
    expect(rl.take("a")).toBe(false);

    t = 1_000; // one second -> exactly one token
    expect(rl.take("a")).toBe(true);
    expect(rl.take("a")).toBe(false);
  });

  it("never refills past capacity, so idling does not buy an unbounded burst", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => t });
    rl.take("a");
    t = 3_600_000; // an hour idle
    expect([rl.take("a"), rl.take("a")]).toEqual([true, true]);
    expect(rl.take("a")).toBe(false);
  });

  it("isolates keys, so one noisy caller cannot starve another", () => {
    const rl = createRateLimiter({ capacity: 1, refillPerSecond: 0, now: () => 0 });
    expect(rl.take("a")).toBe(true);
    expect(rl.take("a")).toBe(false);
    expect(rl.take("b")).toBe(true);
  });

  it("reports how long until the next token", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 1, refillPerSecond: 0.5, now: () => t });
    expect(rl.retryAfter("a")).toBe(0);
    rl.take("a");
    expect(rl.retryAfter("a")).toBe(2); // 1 token at 0.5/s
  });

  it("bounds tracked keys so the limiter is not itself a memory vector", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 1, refillPerSecond: 1, maxKeys: 5, now: () => t });
    for (let i = 0; i < 50; i++) {
      t += 1;
      rl.take(`key-${i}`);
    }
    expect(rl.size).toBeLessThanOrEqual(5);
  });

  it("keeps limiting the newest keys after eviction", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 1, refillPerSecond: 0, maxKeys: 2, now: () => t });
    rl.take("a");
    t += 1;
    rl.take("b");
    t += 1;
    rl.take("c"); // evicts "a", the least recently touched
    expect(rl.take("c")).toBe(false);
  });
});

describe("clientKey", () => {
  it("prefers Fly-Client-IP, which the proxy overwrites and a client cannot forge", () => {
    expect(clientKey({ headers: { "fly-client-ip": "1.2.3.4" }, ip: "10.0.0.1" })).toBe("1.2.3.4");
  });

  it("ignores the client-controlled X-Forwarded-For", () => {
    expect(clientKey({ headers: { "x-forwarded-for": "9.9.9.9" }, ip: "10.0.0.1" })).toBe("10.0.0.1");
  });

  it("falls back to req.ip, then to a constant", () => {
    expect(clientKey({ headers: {}, ip: "10.0.0.1" })).toBe("10.0.0.1");
    expect(clientKey({ headers: {} })).toBe("unknown");
  });
});

describe("free-tool rate limiting over HTTP", () => {
  let open: Server | undefined;
  afterEach(() => {
    open?.close();
    open = undefined;
  });

  async function serve(capacity: number) {
    const app = createApp({
      ledger: new MemoryLedger(),
      payments: new MockPaymentAdapter({ prices: PRICES }),
      chainId: 196,
      startBlock: 0,
      nonceTtlSeconds: 600,
      freeRateLimiter: createRateLimiter({ capacity, refillPerSecond: 0, now: () => 0 }),
    });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    open = server;
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const register = (base: string) =>
    fetch(`${base}/services/register-wallet`, {
      method: "POST",
      headers: { "content-type": "application/json", "fly-client-ip": "1.2.3.4" },
      body: JSON.stringify({ address: "0x1b3F5eCf3694Ef7E52874e14598FC8f6E1EAdb42" }),
    });

  it("429s the free register endpoint once the budget is spent", async () => {
    const base = await serve(2);
    expect((await register(base)).status).not.toBe(429);
    expect((await register(base)).status).not.toBe(429);

    const limited = await register(base);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(await limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("shares the budget across free tools but keys it per caller", async () => {
    const base = await serve(1);
    await register(base);

    const mine = await fetch(`${base}/services/runway`, {
      method: "POST",
      headers: { "content-type": "application/json", "fly-client-ip": "1.2.3.4" },
      body: JSON.stringify({ wallet_id: "w_missing" }),
    });
    expect(mine.status).toBe(429);

    const theirs = await fetch(`${base}/services/runway`, {
      method: "POST",
      headers: { "content-type": "application/json", "fly-client-ip": "5.6.7.8" },
      body: JSON.stringify({ wallet_id: "w_missing" }),
    });
    expect(theirs.status).not.toBe(429);
  });

  it("never rate limits a PAID route — a 429 on a settled call would be theft", async () => {
    const base = await serve(0); // no free budget at all
    for (const slug of ["revenue-report", "expense-report", "export-statement", "spend-preflight"]) {
      const res = await fetch(`${base}/services/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json", "fly-client-ip": "1.2.3.4" },
        body: JSON.stringify({}),
      });
      expect(res.status, `${slug} must not be rate limited`).not.toBe(429);
      await res.text();
    }
  });

  it("does not rate limit the health endpoint", async () => {
    const base = await serve(0);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  // The MCP surface reaches the same free tools; limiting only the plain-HTTP
  // routes would leave the expensive path (register_wallet -> backfill) wide open.
  describe("over MCP", () => {
    const mcp = (base: string, name: string, args: Record<string, unknown>) =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "fly-client-ip": "1.2.3.4",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });

    it("rate limits a free tool called over MCP", async () => {
      const base = await serve(1);
      const address = "0x1b3F5eCf3694Ef7E52874e14598FC8f6E1EAdb42";

      const first = await mcp(base, "register_wallet", { address });
      expect(await first.text()).not.toContain("RATE_LIMITED");

      const second = await mcp(base, "register_wallet", { address });
      expect(await second.text()).toContain("RATE_LIMITED");
    });

    it("leaves a paid tool over MCP unthrottled", async () => {
      const base = await serve(0);
      const res = await mcp(base, "get_revenue_report", { wallet_id: "w_missing" });
      // Reaches the paywall (or the handler), never the free-tool limiter.
      expect(await res.text()).not.toContain("RATE_LIMITED");
    });
  });
});
