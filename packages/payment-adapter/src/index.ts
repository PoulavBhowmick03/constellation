export type {
  Money,
  PaymentAdapter,
  PaymentContext,
  PaymentErrorCode,
  PayAndCallResult,
  PriceTable,
  ProcurementReceipt,
  RequirePaymentResult,
  RequirePaymentStatus,
} from "./types.js";
export { lteMoney, toBaseUnits } from "./money.js";
export { MockPaymentAdapter, MOCK_PAYMENT_HEADER } from "./mock.js";
export type { MockAdapterConfig } from "./mock.js";

import { MockPaymentAdapter } from "./mock.js";
import type { PaymentAdapter, PriceTable } from "./types.js";

export interface CreateAdapterOptions {
  /** Defaults to process.env.PAYMENT_MODE. */
  mode?: string;
  prices: PriceTable;
}

/**
 * Selects the payment implementation. Today only "mock" exists; "sdk" throws
 * loudly rather than silently no-op'ing, so we never think we're charging when
 * we aren't. The real OKX SDK will be wired here, and ONLY here.
 */
export function createPaymentAdapter(opts: CreateAdapterOptions): PaymentAdapter {
  const mode = (opts.mode ?? process.env.PAYMENT_MODE ?? "mock").toLowerCase();
  if (mode === "sdk") {
    throw new Error(
      "PAYMENT_MODE=sdk but the OKX Payment SDK is not wired yet. " +
        "Implement it inside packages/payment-adapter (nowhere else) once docs land, " +
        "then flip this. See docs/status/P1.md.",
    );
  }
  return new MockPaymentAdapter({ prices: opts.prices });
}
