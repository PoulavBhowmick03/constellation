// Pure ledger aggregation. No DB, no chain, no I/O — so money math is unit
// tested directly. The DB layer (repo.ts) fetches rows; these functions turn
// rows into the exact report shapes in docs/INTERFACES.md.

import {
  OKB,
  type CounterpartyTotal,
  type ExpenseReport,
  type GasRow,
  type Money,
  type Period,
  type RevenueReport,
  type RunwayReport,
  type SpendPolicy,
  type SpendPreflight,
  type PolicyBreach,
  type TransferRow,
} from "./types.js";
import { expenseInsights, revenueInsights, runwayInsights } from "./insights.js";

const MS_PER_DAY = 86_400_000;

function inPeriod(iso: string, period: Period): boolean {
  const t = Date.parse(iso);
  if (period.from && t < Date.parse(period.from)) return false;
  if (period.to && t > Date.parse(period.to)) return false;
  return true;
}

/** Sum base-unit amounts (as bigint) grouped by token symbol. */
function sumByToken(rows: TransferRow[]): Map<string, { amount: bigint; decimals: number }> {
  const acc = new Map<string, { amount: bigint; decimals: number }>();
  for (const r of rows) {
    const cur = acc.get(r.token) ?? { amount: 0n, decimals: r.decimals };
    cur.amount += BigInt(r.amount);
    acc.set(r.token, cur);
  }
  return acc;
}

function tokenTotalsToMoney(
  acc: Map<string, { amount: bigint; decimals: number }>,
): Money[] {
  return [...acc.entries()]
    .map(([token, v]) => ({ token, amount: v.amount.toString(), decimals: v.decimals }))
    .sort((a, b) => a.token.localeCompare(b.token));
}

/**
 * Group transfers by (counterparty, token) so each entry's `total` is a single
 * Money, faithful to INTERFACES (which models one token per entry). `labels`
 * maps lowercased address → human label.
 */
function byCounterparty(
  rows: TransferRow[],
  labels: Map<string, string>,
): CounterpartyTotal[] {
  const groups = new Map<
    string,
    { address: string; token: string; decimals: number; amount: bigint; txs: Set<string> }
  >();
  for (const r of rows) {
    const key = `${r.counterparty.toLowerCase()}|${r.token}`;
    const g =
      groups.get(key) ??
      {
        address: r.counterparty,
        token: r.token,
        decimals: r.decimals,
        amount: 0n,
        txs: new Set<string>(),
      };
    g.amount += BigInt(r.amount);
    g.txs.add(r.txHash);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      address: g.address,
      label: labels.get(g.address.toLowerCase()) ?? null,
      tx_count: g.txs.size,
      total: { token: g.token, amount: g.amount.toString(), decimals: g.decimals },
      tx_refs: [...g.txs],
    }))
    // Largest counterparties first — that's what a treasury owner wants to see.
    .sort((a, b) => (BigInt(b.total.amount) > BigInt(a.total.amount) ? 1 : -1));
}

export function computeRevenueReport(
  transfers: TransferRow[],
  period: Period,
  labels: Map<string, string> = new Map(),
): RevenueReport {
  const inflows = transfers.filter((t) => t.direction === "in" && inPeriod(t.blockTime, period));
  const report: RevenueReport = {
    totals: tokenTotalsToMoney(sumByToken(inflows)),
    by_counterparty: byCounterparty(inflows, labels),
    tx_count: inflows.length,
    insights: [],
  };
  report.insights = revenueInsights(report);
  return report;
}

export function computeExpenseReport(
  transfers: TransferRow[],
  gas: GasRow[],
  period: Period,
  labels: Map<string, string> = new Map(),
): ExpenseReport {
  const outflows = transfers.filter((t) => t.direction === "out" && inPeriod(t.blockTime, period));
  const gasInPeriod = gas.filter((g) => inPeriod(g.blockTime, period));
  const gasTotal = gasInPeriod.reduce((sum, g) => sum + BigInt(g.gasCost), 0n);
  const report: ExpenseReport = {
    totals: tokenTotalsToMoney(sumByToken(outflows)),
    by_counterparty: byCounterparty(outflows, labels),
    tx_count: outflows.length,
    gas: {
      token: OKB.token,
      amount: gasTotal.toString(),
      decimals: OKB.decimals,
      tx_count: gasInPeriod.length,
    },
    insights: [],
  };
  report.insights = expenseInsights(report);
  return report;
}

/**
 * Runway = OKB balance / average daily gas over the trailing 7 days ending at
 * `asOf`. Returns null runway when there is no gas in the window (nothing to
 * extrapolate). The division uses Number only for the final ratio; balances and
 * gas stay bigint until then.
 */
export function computeRunway(
  okbBalanceWei: string,
  gas: GasRow[],
  asOf: Date = new Date(),
): RunwayReport {
  const windowStart = asOf.getTime() - 7 * MS_PER_DAY;
  const gas7d = gas.filter((g) => {
    const t = Date.parse(g.blockTime);
    return t >= windowStart && t <= asOf.getTime();
  });
  const totalGas = gas7d.reduce((sum, g) => sum + BigInt(g.gasCost), 0n);
  // Integer division floors; avg daily gas reported in wei.
  const avgDailyGas = totalGas / 7n;

  let runwayDays: number | null = null;
  if (avgDailyGas > 0n) {
    // Ratio of two wei quantities — same units cancel, Number is safe enough
    // for a days estimate. Keep one extra digit of precision via *10 / round.
    runwayDays =
      Math.round((Number(BigInt(okbBalanceWei) * 1000n) / Number(avgDailyGas)) / 100) / 10;
  }

  const report: RunwayReport = {
    okb_balance: { token: OKB.token, amount: okbBalanceWei, decimals: OKB.decimals },
    avg_daily_gas_7d: { token: OKB.token, amount: avgDailyGas.toString(), decimals: OKB.decimals },
    runway_days: runwayDays,
    as_of: asOf.toISOString(),
    insights: [],
  };
  report.insights = runwayInsights(report);
  return report;
}

// ---- Statement export ------------------------------------------------------

export type StatementFormat = "csv" | "json" | "md";

interface StatementRow {
  kind: "transfer" | "gas";
  time: string;
  tx: string;
  token: string;
  direction: string;
  amount: string;
  decimals: number;
  counterparty: string;
}

function buildRows(transfers: TransferRow[], gas: GasRow[], period: Period): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const t of transfers) {
    if (!inPeriod(t.blockTime, period)) continue;
    rows.push({
      kind: "transfer",
      time: t.blockTime,
      tx: t.txHash,
      token: t.token,
      direction: t.direction,
      amount: t.amount,
      decimals: t.decimals,
      counterparty: t.counterparty,
    });
  }
  for (const g of gas) {
    if (!inPeriod(g.blockTime, period)) continue;
    rows.push({
      kind: "gas",
      time: g.blockTime,
      tx: g.txHash,
      token: "OKB",
      direction: "out",
      amount: g.gasCost,
      decimals: 18,
      counterparty: "",
    });
  }
  rows.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return rows;
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface Statement {
  format: StatementFormat;
  content: string;
  row_count: number;
}

export function exportStatement(
  transfers: TransferRow[],
  gas: GasRow[],
  period: Period,
  format: StatementFormat,
): Statement {
  const rows = buildRows(transfers, gas, period);
  const header = ["kind", "time", "tx", "token", "direction", "amount", "decimals", "counterparty"];

  if (format === "json") {
    return { format, content: JSON.stringify(rows, null, 2), row_count: rows.length };
  }
  if (format === "csv") {
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [r.kind, r.time, r.tx, r.token, r.direction, r.amount, String(r.decimals), r.counterparty]
          .map(csvEscape)
          .join(","),
      );
    }
    return { format, content: lines.join("\n"), row_count: rows.length };
  }
  // md
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
  for (const r of rows) {
    lines.push(
      `| ${[r.kind, r.time, r.tx, r.token, r.direction, r.amount, String(r.decimals), r.counterparty].join(" | ")} |`,
    );
  }
  return { format, content: lines.join("\n"), row_count: rows.length };
}

// ---- Spend preflight -------------------------------------------------------

/** Percentage of `part` in `whole`, to 2dp. Null when `whole` is not positive. */
function pctOf(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  // Scale before dividing so integer division does not floor away precision.
  return Number((part * 10_000n) / whole) / 100;
}

/** Days of runway at a given daily burn. Null when there is no measurable burn. */
function runwayDays(balance: bigint, perDay: bigint): number | null {
  if (perDay <= 0n) return null;
  if (balance <= 0n) return 0;
  return Math.round(Number((balance * 1000n) / perDay) / 100) / 10;
}

/**
 * Advisory answer to "can this wallet afford this spend, and should it?".
 *
 * Read-only and non-custodial: it moves nothing and authorises nothing, it only
 * reports. `deny` is a recommendation the caller is free to ignore.
 *
 * Runway here is BURN-RATE runway in the token being spent — balance divided by
 * mean daily outflow — NOT the gas runway `computeRunway` reports. Spending a
 * stablecoin does not change how long OKB lasts, so reusing gas runway here
 * would answer a different question than the caller asked.
 */
export function computeSpendPreflight(
  transfers: TransferRow[],
  input: { amount: string; token?: string; counterparty?: string; policy?: SpendPolicy },
  asOf: Date = new Date(),
): SpendPreflight {
  const token = input.token ?? "USDT";
  const rows = transfers.filter((t) => t.token === token);
  const decimals = rows[0]?.decimals ?? 6;

  let balance = 0n;
  for (const r of rows) balance += r.direction === "in" ? BigInt(r.amount) : -BigInt(r.amount);

  const windowStart = asOf.getTime() - 7 * MS_PER_DAY;
  let outflow7d = 0n;
  for (const r of rows) {
    if (r.direction !== "out") continue;
    const t = Date.parse(r.blockTime);
    if (t >= windowStart && t <= asOf.getTime()) outflow7d += BigInt(r.amount);
  }
  const avgDailyOutflow = outflow7d / 7n;

  const amount = BigInt(input.amount);
  const balanceAfter = balance - amount;
  const before = runwayDays(balance, avgDailyOutflow);
  const after = runwayDays(balanceAfter, avgDailyOutflow);
  const pctBalance = pctOf(amount, balance);

  const breaches: PolicyBreach[] = [];
  const reasons: string[] = [];
  const policy = input.policy ?? {};

  if (amount <= 0n) {
    breaches.push({ code: "INVALID_AMOUNT", detail: "spend amount must be positive" });
  }
  if (balanceAfter < 0n) {
    breaches.push({
      code: "INSUFFICIENT_BALANCE",
      detail: `spend of ${input.amount} exceeds the ${token} balance of ${balance.toString()}`,
    });
  }
  if (policy.max_single_spend !== undefined && amount > BigInt(policy.max_single_spend)) {
    breaches.push({
      code: "MAX_SINGLE_SPEND",
      detail: `spend exceeds the per-transaction cap of ${policy.max_single_spend}`,
    });
  }
  if (policy.max_pct_balance !== undefined && pctBalance !== null && pctBalance > policy.max_pct_balance) {
    breaches.push({
      code: "MAX_PCT_BALANCE",
      detail: `spend is ${pctBalance}% of balance, over the ${policy.max_pct_balance}% cap`,
    });
  }
  if (
    policy.min_runway_days_after !== undefined &&
    after !== null &&
    after < policy.min_runway_days_after
  ) {
    breaches.push({
      code: "MIN_RUNWAY_AFTER",
      detail: `runway would fall to ${after}d, under the ${policy.min_runway_days_after}d floor`,
    });
  }

  // Soft signals: worth surfacing, not grounds for denial on their own.
  if (breaches.length === 0) {
    if (pctBalance !== null && pctBalance >= 50) {
      reasons.push(`spend is ${pctBalance}% of the ${token} balance`);
    }
    if (after !== null && after < 14) {
      reasons.push(`runway would fall to ${after} days`);
    }
    if (balance === 0n) {
      reasons.push(`no ${token} balance is indexed for this wallet yet`);
    }
  }

  const decision: SpendPreflight["decision"] =
    breaches.length > 0 ? "deny" : reasons.length > 0 ? "warn" : "allow";
  if (decision === "allow") {
    reasons.push(
      pctBalance === null
        ? "spend is within policy"
        : `spend is ${pctBalance}% of the ${token} balance and within policy`,
    );
  }
  for (const b of breaches) reasons.push(b.detail);

  return {
    decision,
    amount: { token, amount: amount.toString(), decimals },
    balance_before: { token, amount: balance.toString(), decimals },
    balance_after: { token, amount: balanceAfter.toString(), decimals },
    pct_of_balance: pctBalance,
    avg_daily_outflow_7d: { token, amount: avgDailyOutflow.toString(), decimals },
    runway_days_before: before,
    runway_after_days: after,
    pct_of_runway: pctBalance,
    breaches,
    reasons,
    as_of: asOf.toISOString(),
  };
}
