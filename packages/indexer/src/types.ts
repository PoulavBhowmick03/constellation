// Ledger row + report types. Money amounts are ALWAYS base-unit decimal
// strings, matching docs/INTERFACES.md conventions.

export interface Money {
  token: string;
  amount: string; // base units
  decimals: number;
}

export type Direction = "in" | "out";

/** A single ERC-20 transfer touching a registered wallet, relative to it. */
export interface TransferRow {
  walletId: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: string; // ISO-8601 UTC
  token: string; // USDT | USDG
  tokenAddress: string;
  decimals: number;
  from: string;
  to: string;
  amount: string; // base units
  direction: Direction;
  counterparty: string; // the non-wallet side
}

/** Native OKB gas paid on a tx the wallet originated. */
export interface GasRow {
  walletId: string;
  txHash: string;
  blockNumber: number;
  blockTime: string; // ISO-8601 UTC
  gasUsed: string;
  gasPrice: string;
  gasCost: string; // gasUsed * gasPrice, wei OKB
}

export interface Period {
  from?: string; // ISO-8601 UTC, inclusive
  to?: string; // ISO-8601 UTC, inclusive
}

export interface CounterpartyTotal {
  address: string;
  label: string | null;
  tx_count: number;
  total: Money;
  tx_refs: string[];
}

/** Additive Copilot advice attached to every report (see insights.ts). */
export interface Insight {
  severity: "info" | "watch" | "alert";
  code: string;
  title: string;
  detail: string;
}

export interface RevenueReport {
  totals: Money[];
  by_counterparty: CounterpartyTotal[];
  tx_count: number;
  insights: Insight[];
}

export interface ExpenseReport extends RevenueReport {
  gas: Money & { tx_count: number };
}

export interface RunwayReport {
  okb_balance: Money;
  avg_daily_gas_7d: Money;
  /** null when there is no gas history to extrapolate from. */
  runway_days: number | null;
  as_of: string;
  insights: Insight[];
}

export const OKB: { token: "OKB"; decimals: 18 } = { token: "OKB", decimals: 18 };

// ---- Spend preflight -------------------------------------------------------

/**
 * Caps an agent applies to a single spend. All optional: an omitted cap is not
 * enforced. Percentages are 0-100.
 */
export interface SpendPolicy {
  /** Deny if the spend exceeds this share of the current token balance. */
  max_pct_balance?: number;
  /** Deny if projected runway after the spend falls below this many days. */
  min_runway_days_after?: number;
  /** Deny if the spend exceeds this absolute amount, in base units. */
  max_single_spend?: string;
}

export interface PolicyBreach {
  code: string;
  detail: string;
}

export interface SpendPreflight {
  decision: "allow" | "warn" | "deny";
  amount: Money;
  balance_before: Money;
  balance_after: Money;
  /** Share of the current balance this spend consumes, 0-100. Null if balance is 0. */
  pct_of_balance: number | null;
  /** Mean daily outflow over the trailing 7 days, in base units. */
  avg_daily_outflow_7d: Money;
  runway_days_before: number | null;
  runway_after_days: number | null;
  /**
   * Share of remaining runway this spend consumes, 0-100. Under a constant
   * burn-rate model this equals `pct_of_balance`; both are reported because a
   * caller reasoning about time wants the runway framing.
   */
  pct_of_runway: number | null;
  breaches: PolicyBreach[];
  reasons: string[];
  as_of: string;
}
