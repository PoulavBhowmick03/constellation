import type { PriceTable } from "@constellation/payment-adapter";

// Placeholder prices, exactly per docs/INTERFACES.md §1. USDT base units,
// 6 decimals. `null` = free tool. Repricing is a human decision at listing time.
export const PRICES: PriceTable = {
  register_wallet: null,
  get_runway: null,
  get_revenue_report: { token: "USDT", amount: "100000", decimals: 6 }, // 0.10
  get_expense_report: { token: "USDT", amount: "100000", decimals: 6 }, // 0.10
  export_statement: { token: "USDT", amount: "200000", decimals: 6 }, // 0.20
  // Priced below the report tier on purpose: an agent is meant to call this
  // before every spend, so it must be cheap enough not to distort the decision.
  spend_preflight: { token: "USDT", amount: "50000", decimals: 6 }, // 0.05
};
