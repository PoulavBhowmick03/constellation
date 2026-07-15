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
  private readonly inFlightNonces = new Set<string>();
  private readonly settledNonces = new Map<string, true>();
  private initializePromise?: Promise<void>;

  constructor(config: SdkAdapterConfig) {
    this.prices = config.prices;
    this.processor = config.processor;
    this.now = config.now ?? Date.now;
    this.nonceCacheSize = config.nonceCacheSize ?? 10_000;
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
      validated = validateExactPayload(payload, paymentRequirements(challenge), this.now());
    } catch (error) {
      return challengeResult(price, challenge, paymentError(error));
    }

    if (
      this.inFlightNonces.has(validated.nonceKey) ||
      this.settledNonces.has(validated.nonceKey)
    ) {
      return challengeResult(price, challenge, "payment nonce was already submitted");
    }

    this.inFlightNonces.add(validated.nonceKey);
    try {
      await this.initialize();
      const requirements = paymentRequirements(challenge);
      const verified = await this.processor.verifyPayment(validated.payload, requirements);
      if (!verified.isValid || !isAddress(verified.payer)) {
        return challengeResult(
          price,
          challenge,
          verified.invalidMessage ?? verified.invalidReason ?? "facilitator rejected payment",
        );
      }
      if (!sameAddress(verified.payer, validated.authorization.from)) {
        return challengeResult(price, challenge, "facilitator recovered a different payer");
      }

      const settled = await this.processor.settlePayment(validated.payload, requirements);
      if (isTxHash(settled.transaction)) this.rememberNonce(validated.nonceKey);
      if (
        !settled.success ||
        settled.status !== "success" ||
        !isTxHash(settled.transaction) ||
        settled.network !== TREASURY_X402.network ||
        !isAddress(settled.payer) ||
        !sameAddress(settled.payer, verified.payer)
      ) {
        return challengeResult(
          price,
          challenge,
          settled.errorMessage ??
            settled.errorReason ??
            `settlement was not confirmed (status: ${settled.status ?? "unknown"})`,
        );
      }

      this.rememberNonce(validated.nonceKey);
      const response = encodePaymentResponse({
        success: true,
        status: "success",
        transaction: settled.transaction,
        network: settled.network,
        amount: price.amount,
        payer: settled.payer,
      });
      return {
        status: "paid",
        price,
        receiptId: settled.transaction,
        paymentResponse: response,
      };
    } catch (error) {
      return challengeResult(price, challenge, `facilitator error: ${paymentError(error)}`);
    } finally {
      this.inFlightNonces.delete(validated.nonceKey);
    }
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
): ValidatedPayload {
  if (!isRecord(payload) || payload.x402Version !== 2) {
    throw new Error("payment must use x402Version 2");
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
    nonceKey: `${exact.from.toLowerCase()}:${exact.nonce.toLowerCase()}`,
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
