import { describe, expect, it } from "vitest";
import { expenseInsights, revenueInsights, runwayInsights } from "../src/insights.js";
import type { ExpenseReport, RevenueReport, RunwayReport } from "../src/types.js";

const OKB = (amount: string) => ({ token: "OKB", amount, decimals: 18 });
const USDT = (amount: string) => ({ token: "USDT", amount, decimals: 6 });

function runway(over: Partial<RunwayReport>): RunwayReport {
  return {
    okb_balance: OKB("7000000000000000000"),
    avg_daily_gas_7d: OKB("100000000000000000"),
    runway_days: 70,
    as_of: "2026-07-16T00:00:00.000Z",
    insights: [],
    ...over,
  };
}

function cp(address: string, amount: string, label: string | null = null) {
  return { address, label, tx_count: 1, total: USDT(amount), tx_refs: [`0x${address.slice(2, 8)}`] };
}

describe("runwayInsights", () => {
  it("flags idle wallets when there is no gas", () => {
    const [i] = runwayInsights(runway({ runway_days: null, avg_daily_gas_7d: OKB("0") }));
    expect(i.code).toBe("RUNWAY_IDLE");
    expect(i.severity).toBe("info");
  });

  it("raises an ALERT under 14 days", () => {
    const [i] = runwayInsights(runway({ runway_days: 9 }));
    expect(i.code).toBe("RUNWAY_LOW");
    expect(i.severity).toBe("alert");
    expect(i.detail).toMatch(/top up/i);
  });

  it("raises a WATCH between 14 and 45 days", () => {
    const [i] = runwayInsights(runway({ runway_days: 30 }));
    expect(i.code).toBe("RUNWAY_TIGHT");
    expect(i.severity).toBe("watch");
  });

  it("reports healthy runway above 45 days", () => {
    const [i] = runwayInsights(runway({ runway_days: 120 }));
    expect(i.code).toBe("RUNWAY_HEALTHY");
    expect(i.severity).toBe("info");
  });
});

describe("revenueInsights", () => {
  const base = (over: Partial<RevenueReport>): RevenueReport => ({
    totals: [USDT("10000000")],
    by_counterparty: [],
    tx_count: 0,
    insights: [],
    ...over,
  });

  it("handles an empty period", () => {
    const insights = revenueInsights(base({ totals: [], tx_count: 0 }));
    expect(insights).toHaveLength(1);
    expect(insights[0].code).toBe("REVENUE_NONE");
  });

  it("ALERTs when one payer is ≥ 60% of revenue", () => {
    // total 10 USDT; top payer 7 USDT = 70%.
    const report = base({
      tx_count: 3,
      by_counterparty: [cp("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "7000000", "Acme"), cp("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "3000000")],
    });
    const conc = revenueInsights(report).find((i) => i.code === "REVENUE_CONCENTRATION");
    expect(conc?.severity).toBe("alert");
    expect(conc?.title).toMatch(/70%/);
    expect(conc?.detail).toMatch(/Acme/);
  });

  it("WATCHes moderate concentration (40–60%)", () => {
    const report = base({
      tx_count: 2,
      by_counterparty: [cp("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "5000000"), cp("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "5000000")],
    });
    const conc = revenueInsights(report).find((i) => i.code === "REVENUE_CONCENTRATION");
    expect(conc?.severity).toBe("watch");
  });

  it("calls revenue diversified when no payer exceeds 40%", () => {
    const report = base({
      tx_count: 4,
      by_counterparty: [
        cp("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "3000000"),
        cp("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "3000000"),
        cp("0xcccccccccccccccccccccccccccccccccccccccc", "2000000"),
        cp("0xdddddddddddddddddddddddddddddddddddddddd", "2000000"),
      ],
    });
    expect(revenueInsights(report).some((i) => i.code === "REVENUE_DIVERSIFIED")).toBe(true);
  });
});

describe("expenseInsights", () => {
  it("reports gas spend and flags no outflows", () => {
    const report: ExpenseReport = {
      totals: [],
      by_counterparty: [],
      tx_count: 0,
      gas: { token: "OKB", amount: "40000000000000000", decimals: 18, tx_count: 2 },
      insights: [],
    };
    const codes = expenseInsights(report).map((i) => i.code);
    expect(codes).toContain("GAS_SPEND");
    expect(codes).toContain("EXPENSE_NONE");
  });
});
