import type { GasRow, NonceCheck, TransferRow, WalletRow } from "@constellation/indexer";
import type { MiddlewareHandler, PaymentAdapter } from "@constellation/payment-adapter";
import type { RateLimiter } from "./ratelimit.js";

/** Express-compatible handler produced by payment-adapter's middleware factory. */
export type PaidRouteMiddleware = MiddlewareHandler;

/**
 * Everything the tool handlers need from the outside world, injectable so the
 * whole tool surface is unit-testable without Postgres or a chain. The shape
 * deliberately mirrors @constellation/indexer's repo exports one-to-one; the
 * production wiring (see index.ts) passes those functions straight through.
 */
export interface Ledger {
  registerWallet(address: string, chainId: number, fromBlock: number): Promise<WalletRow>;
  getWalletById(id: string): Promise<WalletRow | null>;
  getTransfers(walletId: string): Promise<TransferRow[]>;
  getGas(walletId: string): Promise<GasRow[]>;
  getLatestOkbBalance(walletId: string): Promise<string | null>;
  getLabels(): Promise<Map<string, string>>;
  issueNonce(address: string, ttlSeconds: number): Promise<string>;
  consumeNonce(nonce: string, address: string): Promise<NonceCheck>;
}

export interface TreasuryDeps {
  ledger: Ledger;
  payments: PaymentAdapter;
  /**
   * Official OKX Express payment middleware for the paid `/services/*` routes.
   *
   * Present in production (PAYMENT_MODE=sdk), where OKX's listing review
   * requires the paid surface to be served by their SDK rather than an
   * equivalent hand-rolled implementation. Absent in mock mode and in tests,
   * which fall back to the legacy in-route payment flow.
   */
  paidRouteMiddleware?: PaidRouteMiddleware;
  chainId: number;
  /** Block a newly registered wallet is indexed from. */
  startBlock: number;
  nonceTtlSeconds: number;
  /**
   * Rate limiter for the free tools. Injectable so tests can drive an exact
   * budget and a fake clock instead of sleeping; production builds one from env.
   */
  freeRateLimiter?: RateLimiter;
  /** Injectable clock for tests. */
  now?: () => Date;
}
