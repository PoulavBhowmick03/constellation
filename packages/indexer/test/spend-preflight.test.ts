import { describe, expect, it } from "vitest";
import { computeSpendPreflight } from "../src/ledger.js";
import type { TransferRow } from "../src/types.js";

const NOW = new Date("2026-07-26T00:00:00.000Z");
const DAY = 86_400_000;

function tx(
  direction: "in" | "out",
  amount: string,
  daysAgo = 1,
  token = "USDT",
): TransferRow {
  return {
    walletId: "w_test",
    txHash: `0x${amount}${daysAgo}${direction}`,
    logIndex: 0,
    blockNumber: 1,
    blockTime: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    token,
    tokenAddress: "0xtoken",
    decimals: 6,
    from: "0xa",
    to: "0xb",
    amount,
    direction,
    counterparty: "0xc",
  };
}

/** 100 USDT in, 0.7/day out over the window -> 7-day outflow of 4.9, ~136d runway. */
const healthy = [
  tx("in", "100000000", 30),
  ...Array.from({ length: 7 }, (_, i) => tx("out", "700000", i + 1)),
];

describe("computeSpendPreflight — balances and runway", () => {
  it("computes balance as inflows minus outflows for the token", () => {
    const r = computeSpendPreflight(healthy, { amount: "100000" }, NOW);
    // 100.000000 in, 7 x 0.700000 out = 4.900000 -> balance 95.100000
    expect(r.balance_before.amount).toBe("95100000");
    expect(r.balance_after.amount).toBe("95000000");
  });

  it("derives runway from mean daily outflow, not gas", () => {
    const r = computeSpendPreflight(healthy, { amount: "100000" }, NOW);
    // 4.9 out over 7d -> 0.7/day. 95.1 / 0.7 = 135.9d; after 0.1 spend, 135.7d
    expect(r.avg_daily_outflow_7d.amount).toBe("700000");
    expect(r.runway_days_before).toBeCloseTo(135.9, 1);
    expect(r.runway_after_days).toBeCloseTo(135.7, 1);
  });

  it("ignores transfers in other tokens", () => {
    const mixed = [...healthy, tx("in", "999000000", 2, "USDG")];
    const r = computeSpendPreflight(mixed, { amount: "100000" }, NOW);
    expect(r.balance_before.amount).toBe("95100000");
  });

  it("excludes outflows outside the trailing 7-day window", () => {
    const withOld = [...healthy, tx("out", "5000000", 40)];
    const r = computeSpendPreflight(withOld, { amount: "1" }, NOW);
    // The old outflow still reduces balance, but must not inflate the burn rate.
    expect(r.avg_daily_outflow_7d.amount).toBe("700000");
    expect(r.balance_before.amount).toBe("90100000");
  });

  it("reports null runway when nothing has been spent", () => {
    const r = computeSpendPreflight([tx("in", "10000000", 3)], { amount: "100000" }, NOW);
    expect(r.avg_daily_outflow_7d.amount).toBe("0");
    expect(r.runway_days_before).toBeNull();
    expect(r.runway_after_days).toBeNull();
  });

  it("keeps precision on amounts far beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = [tx("in", "9007199254740993000000", 3)];
    const r = computeSpendPreflight(huge, { amount: "1000000" }, NOW);
    expect(r.balance_before.amount).toBe("9007199254740993000000");
    expect(r.balance_after.amount).toBe("9007199254740992000000");
  });
});

describe("computeSpendPreflight — decisions", () => {
  it("allows a small spend against a healthy balance", () => {
    const r = computeSpendPreflight(healthy, { amount: "100000" }, NOW);
    expect(r.decision).toBe("allow");
    expect(r.breaches).toEqual([]);
  });

  it("denies a spend larger than the balance", () => {
    const r = computeSpendPreflight(healthy, { amount: "99000000" }, NOW);
    expect(r.decision).toBe("deny");
    expect(r.breaches.map((b) => b.code)).toContain("INSUFFICIENT_BALANCE");
    expect(BigInt(r.balance_after.amount)).toBeLessThan(0n);
  });

  it("denies a non-positive amount", () => {
    expect(computeSpendPreflight(healthy, { amount: "0" }, NOW).breaches.map((b) => b.code)).toContain(
      "INVALID_AMOUNT",
    );
  });

  it("denies a breach of max_pct_balance", () => {
    const r = computeSpendPreflight(
      healthy,
      { amount: "47550000", policy: { max_pct_balance: 20 } },
      NOW,
    );
    // 47.55 of 95.10 = exactly 50%
    expect(r.pct_of_balance).toBe(50);
    expect(r.decision).toBe("deny");
    expect(r.breaches.map((b) => b.code)).toContain("MAX_PCT_BALANCE");
  });

  it("denies a breach of max_single_spend", () => {
    const r = computeSpendPreflight(
      healthy,
      { amount: "2000000", policy: { max_single_spend: "1000000" } },
      NOW,
    );
    expect(r.decision).toBe("deny");
    expect(r.breaches.map((b) => b.code)).toContain("MAX_SINGLE_SPEND");
  });

  it("denies when projected runway falls under the floor", () => {
    const r = computeSpendPreflight(
      healthy,
      { amount: "91000000", policy: { min_runway_days_after: 6 } },
      NOW,
    );
    // 4.1 / 0.7 = 5.9d, under the 6d floor
    expect(r.runway_after_days).toBeCloseTo(5.9, 1);
    expect(r.decision).toBe("deny");
    expect(r.breaches.map((b) => b.code)).toContain("MIN_RUNWAY_AFTER");
  });

  it("does not breach a policy that is satisfied exactly at the cap", () => {
    const r = computeSpendPreflight(
      healthy,
      { amount: "47550000", policy: { max_pct_balance: 50 } },
      NOW,
    );
    // Cap is inclusive: 50% is allowed when the cap is 50.
    expect(r.breaches.map((b) => b.code)).not.toContain("MAX_PCT_BALANCE");
  });

  it("warns without denying when the spend is a large share of balance", () => {
    const r = computeSpendPreflight(healthy, { amount: "47550000" }, NOW);
    expect(r.decision).toBe("warn");
    expect(r.breaches).toEqual([]);
    expect(r.reasons.join(" ")).toMatch(/% of the USDT balance/);
  });

  it("denies against a wallet with no indexed balance yet", () => {
    const r = computeSpendPreflight([], { amount: "100000" }, NOW);
    // Balance 0 -> the spend also exceeds it, so this denies rather than warns.
    expect(r.decision).toBe("deny");
    expect(r.pct_of_balance).toBeNull();
  });

  it("reports every breach rather than stopping at the first", () => {
    const r = computeSpendPreflight(
      healthy,
      { amount: "99000000", policy: { max_single_spend: "1000000", max_pct_balance: 10 } },
      NOW,
    );
    const codes = r.breaches.map((b) => b.code);
    expect(codes).toContain("INSUFFICIENT_BALANCE");
    expect(codes).toContain("MAX_SINGLE_SPEND");
    expect(codes).toContain("MAX_PCT_BALANCE");
  });

  it("always explains itself", () => {
    for (const amount of ["100000", "47550000", "99000000"]) {
      expect(computeSpendPreflight(healthy, { amount }, NOW).reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("computeSpendPreflight — incomplete indexing", () => {
  // Outflows indexed but not the inflows that funded them: a real wallet cannot
  // be negative, so every balance-derived judgement here is untrustworthy.
  const partiallyIndexed = [tx("out", "1000000", 2), tx("out", "500000", 3)];

  it("does not claim INSUFFICIENT_BALANCE against a negative balance", () => {
    const r = computeSpendPreflight(partiallyIndexed, { amount: "100000" }, NOW);
    expect(BigInt(r.balance_before.amount)).toBeLessThan(0n);
    expect(r.breaches.map((b) => b.code)).not.toContain("INSUFFICIENT_BALANCE");
  });

  it("warns rather than denying, and says why", () => {
    const r = computeSpendPreflight(partiallyIndexed, { amount: "100000" }, NOW);
    expect(r.decision).toBe("warn");
    expect(r.reasons.join(" ")).toMatch(/not fully indexed/);
  });

  it("suppresses balance-derived policy caps it cannot evaluate", () => {
    const r = computeSpendPreflight(
      partiallyIndexed,
      { amount: "100000", policy: { max_pct_balance: 1, min_runway_days_after: 999 } },
      NOW,
    );
    const codes = r.breaches.map((b) => b.code);
    expect(codes).not.toContain("MAX_PCT_BALANCE");
    expect(codes).not.toContain("MIN_RUNWAY_AFTER");
  });

  it("still enforces amount-only caps, which do not depend on balance", () => {
    const r = computeSpendPreflight(
      partiallyIndexed,
      { amount: "100000", policy: { max_single_spend: "1" } },
      NOW,
    );
    expect(r.decision).toBe("deny");
    expect(r.breaches.map((b) => b.code)).toContain("MAX_SINGLE_SPEND");
  });
})
;
