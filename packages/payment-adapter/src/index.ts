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
export {
  buildExactChallenge,
  encodePaymentRequired,
  decodePaymentRequired,
  decodePaymentPayload,
  encodePaymentResponse,
  paymentRequirements,
  caip2,
  X402_HEADERS,
} from "./x402.js";
export type { X402Accept, X402Challenge, BuildChallengeInput } from "./x402.js";
export {
  createOkxExactProcessor,
  SdkPaymentAdapter,
  TREASURY_X402,
} from "./sdk.js";
export type {
  ExactPaymentProcessor,
  OkxCredentials,
  SdkAdapterConfig,
} from "./sdk.js";

import { MockPaymentAdapter } from "./mock.js";
import { SdkPaymentAdapter, createOkxExactProcessor, type OkxCredentials } from "./sdk.js";
import type { PaymentAdapter, PriceTable } from "./types.js";

export { loadOkxCredentialsFromEnv };

export interface CreateAdapterOptions {
  /** Defaults to process.env.PAYMENT_MODE. */
  mode?: string;
  prices: PriceTable;
  /**
   * OKX facilitator credentials for sdk mode. Defaults to reading the
   * environment (loadOkxCredentialsFromEnv); tests inject them directly so they
   * never touch a real key.
   */
  okxCredentials?: OkxCredentials;
}

/**
 * Read the OKX facilitator credentials from the environment. Fail-closed: sdk
 * mode must NEVER silently no-op charging, so a missing credential throws with
 * the exact env var names to set rather than falling back to a no-charge path.
 */
function loadOkxCredentialsFromEnv(
  // Structural env type (not NodeJS.ProcessEnv) so this exported signature does
  // not leak the NodeJS global namespace into consumers' .d.ts resolution.
  env: Record<string, string | undefined> = process.env,
): OkxCredentials {
  const apiKey = env.OKX_API_KEY;
  const secretKey = env.OKX_SECRET_KEY;
  const passphrase = env.OKX_PASSPHRASE;
  const missing = (
    [
      ["OKX_API_KEY", apiKey],
      ["OKX_SECRET_KEY", secretKey],
      ["OKX_PASSPHRASE", passphrase],
    ] as const
  )
    .filter(([, v]) => v === undefined || v.length === 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`PAYMENT_MODE=sdk requires ${missing.join(", ")} to be set in the environment`);
  }
  return {
    apiKey: apiKey as string,
    secretKey: secretKey as string,
    passphrase: passphrase as string,
    ...(env.OKX_FACILITATOR_BASE_URL ? { baseUrl: env.OKX_FACILITATOR_BASE_URL } : {}),
  };
}

/**
 * Production selector. `mock` is the default and the only mode a fresh deploy
 * runs. `sdk` constructs the real OKX-facilitator adapter (non-custodial:
 * OKX verifies + settles, we never hold a key). It is still operationally gated
 * — production stays on `mock` until one real buyer replay has returned a
 * PAYMENT-RESPONSE and a confirmed X Layer tx — but that gate is now the
 * PAYMENT_MODE env var, not a hard throw, so the controlled probe can run.
 */
export function createPaymentAdapter(opts: CreateAdapterOptions): PaymentAdapter {
  const mode = (opts.mode ?? process.env.PAYMENT_MODE ?? "mock").toLowerCase();
  if (mode === "sdk") {
    const credentials = opts.okxCredentials ?? loadOkxCredentialsFromEnv();
    return new SdkPaymentAdapter({
      prices: opts.prices,
      processor: createOkxExactProcessor(credentials),
    });
  }
  return new MockPaymentAdapter({ prices: opts.prices });
}
