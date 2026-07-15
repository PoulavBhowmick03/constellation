// Copilot insight layer. Pure functions that turn a report into plain-language
// advice — the "Copilot" in Treasury Copilot. No I/O, unit-tested directly.
//
// INTERFACES.md note: `insights` is an ADDITIVE field on the report outputs. It
// never changes existing fields or error shapes, so it does not break the frozen
// contract; it is flagged for sign-off in docs/status/P1.md alongside the other
// drift items.

import type {
  CounterpartyTotal,
  ExpenseReport,
  Money,
  RevenueReport,
  RunwayReport,
} from "./types.js";

export type InsightSeverity = "info" | "watch" | "alert";

export interface Insight {
  severity: InsightSeverity;
  /** Stable machine code, e.g. REVENUE_CONCENTRATION. */
  code: string;
  /** Short headline (≤ ~60 chars). */
  title: string;
  /** One sentence of context or advice. */
  detail: string;
}

// Thresholds are deliberately explicit so they are easy to tune and to test.
const RUNWAY_ALERT_DAYS = 14;
const RUNWAY_WATCH_DAYS = 45;
const CONCENTRATION_ALERT = 0.6; // top payer ≥ 60% of revenue
const CONCENTRATION_WATCH = 0.4;

/** Human amount from base units, trimmed, for prose. */
function human(m: Money): string {
  if (!/^\d+$/.test(m.amount)) return m.amount;
  const padded = m.amount.padStart(m.decimals + 1, "0");
  const cut = padded.length - m.decimals;
  const whole = padded.slice(0, cut).replace(/^0+(?=\d)/, "");
  const frac = m.decimals === 0 ? "" : padded.slice(cut).replace(/0+$/, "").slice(0, 4);
  return `${whole}${frac ? `.${frac}` : ""} ${m.token}`;
}

/** The token line with the largest base-unit total (the wallet's main asset). */
function dominant(totals: Money[]): Money | null {
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? b : a));
}

function share(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10_000n) / whole) / 10_000;
}

/** Runway health — drives the free get_runway hook, so keep it punchy. */
export function runwayInsights(report: RunwayReport): Insight[] {
  const out: Insight[] = [];
  const days = report.runway_days;
  const idle = BigInt(report.avg_daily_gas_7d.amount) === 0n;

  if (days === null || idle) {
    out.push({
      severity: "info",
      code: "RUNWAY_IDLE",
      title: "No recent gas spend",
      detail: "This wallet paid no gas in the last 7 days, so runway can't be extrapolated — it's idle or newly indexed.",
    });
    return out;
  }
  if (days < RUNWAY_ALERT_DAYS) {
    out.push({
      severity: "alert",
      code: "RUNWAY_LOW",
      title: `Runway under ${RUNWAY_ALERT_DAYS} days`,
      detail: `At the current burn (${human(report.avg_daily_gas_7d)}/day) this wallet has ~${days} days of OKB left — top up soon.`,
    });
  } else if (days < RUNWAY_WATCH_DAYS) {
    out.push({
      severity: "watch",
      code: "RUNWAY_TIGHT",
      title: `~${days} days of runway`,
      detail: `Burn is ${human(report.avg_daily_gas_7d)}/day. Comfortable for now, worth watching.`,
    });
  } else {
    out.push({
      severity: "info",
      code: "RUNWAY_HEALTHY",
      title: `Healthy runway (~${days} days)`,
      detail: `Burn is ${human(report.avg_daily_gas_7d)}/day against a ${human(report.okb_balance)} balance.`,
    });
  }
  return out;
}

/** Revenue quality — concentration risk and diversification. */
export function revenueInsights(report: RevenueReport): Insight[] {
  const out: Insight[] = [];
  if (report.tx_count === 0) {
    out.push({
      severity: "info",
      code: "REVENUE_NONE",
      title: "No revenue in this period",
      detail: "No incoming transfers were recorded for the selected period.",
    });
    return out;
  }

  const main = dominant(report.totals);
  if (main) {
    out.push({
      severity: "info",
      code: "REVENUE_TOTAL",
      title: `${human(main)} in across ${report.tx_count} payment${report.tx_count === 1 ? "" : "s"}`,
      detail: `Received from ${report.by_counterparty.length} counterpart${report.by_counterparty.length === 1 ? "y" : "ies"}.`,
    });

    const top: CounterpartyTotal | undefined = report.by_counterparty.find(
      (c) => c.total.token === main.token,
    );
    if (top) {
      const pct = share(BigInt(top.total.amount), BigInt(main.amount));
      const pctLabel = `${Math.round(pct * 100)}%`;
      const who = top.label ?? `${top.address.slice(0, 8)}…`;
      if (pct >= CONCENTRATION_ALERT) {
        out.push({
          severity: "alert",
          code: "REVENUE_CONCENTRATION",
          title: `${pctLabel} of revenue from one payer`,
          detail: `${who} accounts for ${pctLabel} of ${main.token} revenue — single-customer risk. Diversify to reduce exposure.`,
        });
      } else if (pct >= CONCENTRATION_WATCH) {
        out.push({
          severity: "watch",
          code: "REVENUE_CONCENTRATION",
          title: `Top payer is ${pctLabel} of revenue`,
          detail: `${who} is your largest source at ${pctLabel} of ${main.token} revenue — moderate concentration.`,
        });
      } else {
        out.push({
          severity: "info",
          code: "REVENUE_DIVERSIFIED",
          title: "Revenue is well diversified",
          detail: `No single payer exceeds ${CONCENTRATION_WATCH * 100}% of ${main.token} revenue.`,
        });
      }
    }
  }
  return out;
}

/** Expense quality — gas burn and outflow concentration. */
export function expenseInsights(report: ExpenseReport): Insight[] {
  const out: Insight[] = [];
  if (BigInt(report.gas.amount) > 0n) {
    out.push({
      severity: "info",
      code: "GAS_SPEND",
      title: `${human(report.gas)} spent on gas`,
      detail: `Across ${report.gas.tx_count} wallet-originated transaction${report.gas.tx_count === 1 ? "" : "s"} in this period.`,
    });
  }
  if (report.tx_count === 0) {
    out.push({
      severity: "info",
      code: "EXPENSE_NONE",
      title: "No token outflows this period",
      detail: "The wallet sent no USDT/USDG in the selected period.",
    });
    return out;
  }
  const main = dominant(report.totals);
  const top = main ? report.by_counterparty.find((c) => c.total.token === main.token) : undefined;
  if (main && top) {
    const pct = share(BigInt(top.total.amount), BigInt(main.amount));
    if (pct >= CONCENTRATION_ALERT) {
      const who = top.label ?? `${top.address.slice(0, 8)}…`;
      out.push({
        severity: "watch",
        code: "EXPENSE_CONCENTRATION",
        title: `${Math.round(pct * 100)}% of spend to one vendor`,
        detail: `${who} received ${Math.round(pct * 100)}% of ${main.token} outflows this period.`,
      });
    }
  }
  return out;
}
