import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { x402ResourceServer } from "@okxweb3/x402-core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@okxweb3/x402-core/types";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import type {
  Money,
  PaymentAdapter,
  PaymentContext,
  PayAndCallResult,
  PriceTable,
  RequirePaymentResult,
} from "./types.js";
import {
  buildExactChallenge,
  decodePaymentPayload,
  encodePaymentResponse,
  paymentRequirements,
  X402_HEADERS,
  type X402Challenge,
} from "./x402.js";

export const TREASURY_X402 = {
  chainId: 196,
  network: "eip155:196",
  asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
  payTo: "0x212e82dc1d13b991d5318d970963f5ddfd81a178",
  assetDomainName: "USD₮0",
  assetDomainVersion: "1",
  decimals: 6,
  maxTimeoutSeconds: 300,
} as const;

export interface ExactPaymentProcessor {
  initialize(): Promise<void>;
  verifyPayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settlePayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
  /**
   * OKX timeout recovery: when settle returns status="timeout" with a tx hash,
   * poll GET /settle/status until the chain reaches a terminal state. The x402
   * SDK's x402ResourceServer implements this; a syncSettle window can expire
   * before a slow block confirms, and this reclaims the result instead of
   * leaving the buyer charged-without-delivery.
   */
  pollSettleStatus?(
    txHash: string,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    pollDeadlineMs?: number,
  ): Promise<"success" | "failed" | "timeout">;
}

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  baseUrl?: string;
}

export interface SdkAdapterConfig {
  prices: PriceTable;
  /** Tests may inject a processor; production must use createOkxExactProcessor. */
  processor: ExactPaymentProcessor;
  now?: () => number;
  nonceCacheSize?: number;
  /**
   * Durable settlement store (Postgres in prod). When present it is the source
   * of truth for replay/idempotency across processes and crashes; the in-memory
   * nonce cache is only a fast-path. Absent = single-process in-memory only.
   */
  settlementStore?: SettlementStore;
  /** Max time to poll settle/status on a timeout settle (ms). Default 25s. */
  pollDeadlineMs?: number;
}

/**
 * Durable record of one settlement attempt, keyed by the EIP-3009 nonce. Lets a
 * retried/duplicated request recover the original result instead of re-charging,
 * and lets two machines coordinate (atomic reserve). DB-agnostic on purpose so
 * payment-adapter never imports a database driver (the isolation rule).
 */
export interface SettlementRecord {
  status: "pending" | "settled" | "failed";
  transaction?: string;
  payer?: string;
}

export interface SettlementStore {
  /**
   * Atomically reserve this nonce. Returns the EXISTING record if one is already
   * present (so a concurrent/duplicate request observes it), or null if this
   * caller won the reservation and should proceed to verify+settle.
   */
  reserve(nonceKey: string): Promise<SettlementRecord | null>;
  /** Record a terminal (or updated pending) state for the nonce. */
  update(nonceKey: string, record: SettlementRecord): Promise<void>;
  /** Read the current record, if any. */
  get(nonceKey: string): Promise<SettlementRecord | null>;
}

type ExactAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

type ValidatedPayload = {
  payload: PaymentPayload;
  authorization: ExactAuthorization;
  nonceKey: string;
};

/**
 * The official OKX facilitator path. syncSettle=true is deliberate: the tool is
 * not released until OKX reports an on-chain-confirmed transaction.
 */
export function createOkxExactProcessor(credentials: OkxCredentials): ExactPaymentProcessor {
  const facilitator = new OKXFacilitatorClient({
    ...credentials,
    syncSettle: true,
  });
  return new x402ResourceServer(facilitator).register(
    TREASURY_X402.network,
    new ExactEvmScheme(),
  );
}

/**
 * Real inbound-only Treasury adapter. It never holds a private key and never
 * broadcasts locally; OKX verifies and settles the authorization.
 */
export class SdkPaymentAdapter implements PaymentAdapter {
  private readonly prices: PriceTable;
  private readonly processor: ExactPaymentProcessor;
  private readonly now: () => number;
  private readonly nonceCacheSize: number;
  private readonly store?: SettlementStore;
  private readonly pollDeadlineMs: number;
  private readonly inFlightNonces = new Set<string>();
  private readonly settledNonces = new Map<string, true>();
  private initializePromise?: Promise<void>;

  constructor(config: SdkAdapterConfig) {
    this.prices = config.prices;
    this.processor = config.processor;
    this.now = config.now ?? Date.now;
    this.nonceCacheSize = config.nonceCacheSize ?? 10_000;
    this.store = config.settlementStore;
    this.pollDeadlineMs = config.pollDeadlineMs ?? 25_000;
    if (!Number.isSafeInteger(this.nonceCacheSize) || this.nonceCacheSize <= 0) {
      throw new Error("nonceCacheSize must be a positive safe integer");
    }
  }

  async requirePayment(tool: string, ctx: PaymentContext): Promise<RequirePaymentResult> {
    if (!(tool in this.prices)) {
      return misconfigured(tool);
    }

    const price = this.prices[tool] ?? null;
    if (price === null) {
      return { status: "paid", price: null, receiptId: `free:${tool}` };
    }
    if (price.decimals !== TREASURY_X402.decimals) {
      return misconfigured(tool, "configured price must use 6 decimals for USDT0");
    }

    const challenge = buildExactChallenge({
      tool,
      price,
      payTo: TREASURY_X402.payTo,
      asset: TREASURY_X402.asset,
      chainId: TREASURY_X402.chainId,
      assetDomainName: TREASURY_X402.assetDomainName,
      assetDomainVersion: TREASURY_X402.assetDomainVersion,
      maxTimeoutSeconds: TREASURY_X402.maxTimeoutSeconds,
      resourceUrl: ctx.resourceUrl,
    });

    const header = readPaymentHeader(ctx.headers);
    if (!header.ok) return challengeResult(price, challenge, header.reason);
    if (header.value === undefined) {
      // paymentProof is intentionally ignored in real mode. Only x402 headers count.
      return challengeResult(price, challenge, `payment required for "${tool}"`);
    }

    let validated: ValidatedPayload;
    try {
      const payload = decodePaymentPayload(header.value);
      validated = validateExactPayload(
        payload,
        paymentRequirements(challenge),
        this.now(),
        challenge.resource.url,
      );
    } catch (error) {
      return challengeResult(price, challenge, paymentError(error));
    }

    // Same-process concurrent guard (both store and no-store paths use this).
    if (this.inFlightNonces.has(validated.nonceKey)) {
      return challengeResult(price, challenge, "payment nonce was already submitted");
    }

    const requirements = paymentRequirements(challenge);

    // Idempotency / cross-machine coordination. With a durable store, reserve()
    // atomically claims the nonce and returns any PRIOR record (from this or
    // another process). With no store, fall back to the in-memory settled set.
    let prior: SettlementRecord | null = null;
    if (this.store) {
      prior = await this.store.reserve(validated.nonceKey);
    } else if (this.settledNonces.has(validated.nonceKey)) {
      return challengeResult(price, challenge, "payment nonce was already submitted");
    }
    if (prior) {
      return this.recoverFromRecord(prior, price, challenge, validated, requirements);
    }

    this.inFlightNonces.add(validated.nonceKey);
    try {
      await this.initialize();
      const verified = await this.processor.verifyPayment(validated.payload, requirements);
      if (!verified.isValid || !isAddress(verified.payer)) {
        await this.persist(validated.nonceKey, { status: "failed" });
        return challengeResult(
          price,
          challenge,
          verified.invalidMessage ?? verified.invalidReason ?? "facilitator rejected payment",
        );
      }
      if (!sameAddress(verified.payer, validated.authorization.from)) {
        await this.persist(validated.nonceKey, { status: "failed" });
        return challengeResult(price, challenge, "facilitator recovered a different payer");
      }

      let settled = await this.processor.settlePayment(validated.payload, requirements);

      // Timeout recovery: a syncSettle window can expire before a slow block
      // confirms (seen live: tx landed ~60 blocks after the request). Persist the
      // pending tx, then poll GET /settle/status until terminal rather than
      // leaving the buyer charged-without-delivery.
      if (
        (settled.status === "timeout" || settled.status === "pending") &&
        isTxHash(settled.transaction) &&
        this.processor.pollSettleStatus
      ) {
        await this.persist(validated.nonceKey, {
          status: "pending",
          transaction: settled.transaction,
          payer: verified.payer,
        });
        const poll = await this.processor.pollSettleStatus(
          settled.transaction,
          validated.payload,
          requirements,
          this.pollDeadlineMs,
        );
        if (poll === "success") {
          settled = { ...settled, success: true, status: "success" };
        }
      }

      if (!this.isConfirmed(settled, verified.payer)) {
        // Not confirmed. If the tx exists but is still unconfirmed, leave the
        // record PENDING so a later retry recovers via recoverFromRecord (and
        // never double-charges); otherwise mark failed. Nonce is not remembered.
        const stillPending =
          (settled.status === "timeout" || settled.status === "pending") &&
          isTxHash(settled.transaction);
        await this.persist(validated.nonceKey, {
          status: stillPending ? "pending" : "failed",
          transaction: isTxHash(settled.transaction) ? settled.transaction : undefined,
          payer: verified.payer,
        });
        return challengeResult(
          price,
          challenge,
          settled.errorMessage ??
            settled.errorReason ??
            `settlement was not confirmed (status: ${settled.status ?? "unknown"})`,
        );
      }

      // Settlement is confirmed ON-CHAIN here. Deliver unconditionally: the
      // in-memory nonce + the PAYMENT-RESPONSE receipt carry the result, so a
      // durable-store write failure must NOT turn a confirmed payment into a
      // charged-without-delivery error. Persist is therefore best-effort.
      this.rememberNonce(validated.nonceKey);
      try {
        await this.persist(validated.nonceKey, {
          status: "settled",
          transaction: settled.transaction,
          payer: settled.payer,
        });
      } catch {
        // swallow: on-chain settlement stands; cross-process recovery is degraded
        // for this one payment, but the buyer still gets their result now.
      }
      return this.paidResult(price, settled.transaction, settled.payer as string);
    } catch (error) {
      return challengeResult(price, challenge, `facilitator error: ${paymentError(error)}`);
    } finally {
      this.inFlightNonces.delete(validated.nonceKey);
    }
  }

  /** A prior record for this nonce exists — recover instead of re-charging. */
  private async recoverFromRecord(
    prior: SettlementRecord,
    price: Money,
    challenge: X402Challenge,
    validated: ValidatedPayload,
    requirements: PaymentRequirements,
  ): Promise<RequirePaymentResult> {
    if (prior.status === "settled" && isTxHash(prior.transaction)) {
      // Already paid — return the receipt, no second charge.
      this.rememberNonce(validated.nonceKey);
      return this.paidResult(price, prior.transaction, prior.payer ?? validated.authorization.from);
    }
    if (prior.status === "pending" && isTxHash(prior.transaction) && this.processor.pollSettleStatus) {
      // A prior attempt timed out with a tx in flight — poll again.
      const poll = await this.processor.pollSettleStatus(
        prior.transaction,
        validated.payload,
        requirements,
        this.pollDeadlineMs,
      );
      if (poll === "success") {
        this.rememberNonce(validated.nonceKey);
        await this.persist(validated.nonceKey, { status: "settled", transaction: prior.transaction, payer: prior.payer });
        return this.paidResult(price, prior.transaction, prior.payer ?? validated.authorization.from);
      }
      return challengeResult(price, challenge, "settlement still pending — retry shortly");
    }
    return challengeResult(price, challenge, "payment nonce was already submitted");
  }

  private isConfirmed(settled: SettleResponse, verifiedPayer: string): boolean {
    return (
      settled.success &&
      settled.status === "success" &&
      isTxHash(settled.transaction) &&
      settled.network === TREASURY_X402.network &&
      isAddress(settled.payer) &&
      sameAddress(settled.payer as string, verifiedPayer)
    );
  }

  private paidResult(price: Money, transaction: string, payer: string): RequirePaymentResult {
    return {
      status: "paid",
      price,
      receiptId: transaction,
      paymentResponse: encodePaymentResponse({
        success: true,
        status: "success",
        transaction,
        network: TREASURY_X402.network,
        amount: price.amount,
        payer,
      }),
    };
  }

  private async persist(nonceKey: string, record: SettlementRecord): Promise<void> {
    if (this.store) await this.store.update(nonceKey, record);
  }

  async payAndCall<T>(
    _endpoint: string,
    _tool: string,
    _args: unknown,
    _budgetCap: Money,
  ): Promise<PayAndCallResult<T>> {
    return {
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "SDK mode implements inbound settlement only",
      },
    };
  }

  private initialize(): Promise<void> {
    if (this.initializePromise === undefined) {
      this.initializePromise = this.processor.initialize().catch((error: unknown) => {
        this.initializePromise = undefined;
        throw error;
      });
    }
    return this.initializePromise;
  }

  private rememberNonce(key: string): void {
    this.settledNonces.delete(key);
    this.settledNonces.set(key, true);
    while (this.settledNonces.size > this.nonceCacheSize) {
      const oldest = this.settledNonces.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.settledNonces.delete(oldest);
    }
  }
}

function validateExactPayload(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  nowMs: number,
  expectedResourceUrl: string,
): ValidatedPayload {
  if (!isRecord(payload) || payload.x402Version !== 2) {
    throw new Error("payment must use x402Version 2");
  }
  // Tool binding: EIP-3009 signs only {from,to,value,nonce,validity}, so a proof
  // for one tool is otherwise fungible across any equal-priced tool (e.g.
  // get_revenue_report and get_expense_report both cost 0.10). When the payload
  // echoes the resource it was issued for, require it to match THIS tool's
  // challenge so a compliant client's proof can't be redirected to another tool.
  // (Absent resource falls back to price/payTo binding; a malicious buyer can at
  // most redirect their own single-use payment to another same-priced tool.)
  // Require the resource binding (the real OKX client echoes it — confirmed from a
  // live pay-local payload). Requiring rather than compare-if-present closes the
  // bypass where omitting `resource` would let an equal-priced proof cross tools.
  const declaredResource = isRecord(payload.resource) ? payload.resource.url : undefined;
  if (typeof declaredResource !== "string") {
    throw new Error("payment is missing its resource binding");
  }
  if (declaredResource !== expectedResourceUrl) {
    throw new Error("payment resource does not match the requested tool");
  }
  if (!isRecord(payload.accepted)) throw new Error("payment is missing accepted terms");
  const accepted = payload.accepted;
  if (accepted.scheme !== "exact") throw new Error("payment scheme must be exact");
  if (accepted.network !== requirements.network) throw new Error("payment network mismatch");
  if (!sameAddressValue(accepted.asset, requirements.asset)) {
    throw new Error("payment asset mismatch");
  }
  if (!sameAddressValue(accepted.payTo, requirements.payTo)) {
    throw new Error("payment recipient mismatch");
  }
  if (accepted.amount !== requirements.amount) throw new Error("payment amount mismatch");
  if (accepted.maxTimeoutSeconds !== requirements.maxTimeoutSeconds) {
    throw new Error("payment timeout mismatch");
  }

  if (!isRecord(payload.payload)) throw new Error("payment payload is missing");
  if (!isHexSignature(payload.payload.signature)) throw new Error("payment signature is malformed");
  if (!isRecord(payload.payload.authorization)) {
    throw new Error("exact payment authorization is missing");
  }
  if ("permit2Authorization" in payload.payload) {
    throw new Error("only EIP-3009 exact authorization is accepted");
  }

  const authorization = payload.payload.authorization;
  const fields = ["from", "to", "value", "validAfter", "validBefore", "nonce"] as const;
  for (const field of fields) {
    if (typeof authorization[field] !== "string") {
      throw new Error(`authorization ${field} is missing`);
    }
  }
  const exact = authorization as ExactAuthorization;
  if (!isAddress(exact.from)) throw new Error("authorization payer is malformed");
  if (!sameAddress(exact.to, requirements.payTo)) {
    throw new Error("authorization recipient mismatch");
  }
  if (exact.value !== requirements.amount) throw new Error("authorization amount mismatch");
  if (!/^0x[0-9a-fA-F]{64}$/.test(exact.nonce)) {
    throw new Error("authorization nonce must be 32-byte hex");
  }
  if (!/^\d+$/.test(exact.validAfter) || !/^\d+$/.test(exact.validBefore)) {
    throw new Error("authorization validity must use Unix-second integer strings");
  }

  const validAfter = BigInt(exact.validAfter);
  const validBefore = BigInt(exact.validBefore);
  const now = BigInt(Math.floor(nowMs / 1000));
  if (validBefore <= validAfter) throw new Error("authorization validity window is invalid");
  if (now < validAfter) throw new Error("authorization is not valid yet");
  if (now >= validBefore) throw new Error("authorization is expired");
  if (validBefore - now > BigInt(requirements.maxTimeoutSeconds)) {
    throw new Error("authorization expiry exceeds the challenge timeout");
  }

  return {
    payload,
    authorization: exact,
    // Scope the reservation key by the requested tool (resource), not just the
    // EIP-3009 nonce. `resource` is unsigned and rewritable, so keying by nonce
    // alone would let a settled proof for one tool be "recovered" as paid for a
    // different equal-priced tool. With the resource in the key, a cross-tool
    // replay is a NEW key -> it re-settles -> the facilitator rejects the
    // already-used on-chain nonce. A same-tool retry still recovers idempotently.
    nonceKey: `${exact.from.toLowerCase()}:${exact.nonce.toLowerCase()}:${expectedResourceUrl}`,
  };
}

function readPaymentHeader(
  headers: PaymentContext["headers"],
): { ok: true; value?: string } | { ok: false; reason: string } {
  let v2: string | undefined;
  let legacy: string | undefined;
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === X402_HEADERS.paymentSignature.toLowerCase()) v2 = value;
    if (name.toLowerCase() === X402_HEADERS.xPayment.toLowerCase()) legacy = value;
  }
  if (v2 !== undefined && legacy !== undefined && v2 !== legacy) {
    return { ok: false, reason: "conflicting payment headers" };
  }
  return { ok: true, value: v2 ?? legacy };
}

function challengeResult(
  price: Money,
  challenge: X402Challenge,
  reason: string,
): RequirePaymentResult {
  return {
    status: "payment_required",
    price,
    challenge: {
      reason,
      error: reason,
      x402Version: challenge.x402Version,
      resource: { ...challenge.resource },
      accepts: challenge.accepts.map((option) => ({ ...option })),
    },
  };
}

function misconfigured(tool: string, reason?: string): RequirePaymentResult {
  return {
    status: "payment_required",
    price: null,
    challenge: {
      reason: reason ?? `no price configured for tool "${tool}"`,
      accepts: "none — misconfiguration, refuse the call",
    },
  };
}

function paymentError(error: unknown): string {
  return error instanceof Error ? error.message : "payment validation failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameAddressValue(value: unknown, expected: string): boolean {
  return isAddress(value) && sameAddress(value, expected);
}

function isHexSignature(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{130}$/.test(value);
}

function isTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
