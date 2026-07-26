import { AsyncLocalStorage } from "node:async_hooks";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import {
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import type { OkxCredentials, SettlementStore } from "./sdk.js";
import { TREASURY_X402 } from "./sdk.js";
import type { Money } from "./types.js";
import { bazaarExtensions, decodePaymentPayload, X402_HEADERS, type ToolDescriptor } from "./x402.js";

/** Just enough of the SDK's SettleResponse to persist a receipt. */
interface CapturedSettleResult {
  transaction?: string;
  payer?: string;
}

/**
 * Minimal structural Express handler type.
 *
 * Deliberately NOT `import type { RequestHandler } from "express"` — this
 * package stays transport-light, and typing the boundary structurally keeps
 * express out of payment-adapter's public declarations.
 */
export type MiddlewareHandler = (
  req: ExpressLikeRequest,
  res: ExpressLikeResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>;

export interface ExpressLikeRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  /** Set by the middleware; read by the delivery handler. See X402RequestState. */
  x402?: X402RequestState;
}

/**
 * Per-request handoff from the payment middleware to the delivery handler.
 *
 * The middleware owns the settlement store (payment-adapter is the only package
 * allowed to), but the handler is what produces and sends the result. This is
 * the seam between them: the handler asks "was this already delivered?" and
 * reports back "here is what I delivered".
 */
export interface X402RequestState {
  /**
   * The result previously delivered under this settlement. When present the
   * handler MUST send it verbatim and do no work — that is what makes the
   * exactly-once guarantee cover delivery and not just the charge.
   */
  cachedResult?: unknown;
  /** Cache the freshly computed result under this settlement (write-once, best effort). */
  saveResult(result: unknown): Promise<void>;
}

/** Shared no-op for requests with nothing durable to write back to. */
const NO_SAVE: X402RequestState = { saveResult: async () => undefined };

export interface ExpressLikeResponse {
  header(name: string, value: string): unknown;
  /** Present on Express responses; used to read back the settlement receipt. */
  getHeader?(name: string): string | number | string[] | undefined;
}

/** One paid HTTP route advertised and enforced by the OKX middleware. */
export interface PaidRouteSpec {
  /** Route pattern in the SDK's "VERB /path" form, e.g. "POST /services/revenue-report". */
  pattern: string;
  tool: string;
  price: Money;
  /** Public https URL advertised as `resource.url` and bound at settle time. */
  resource: string;
  descriptor?: ToolDescriptor;
}

export interface PaidRouteMiddlewareConfig {
  credentials: OkxCredentials;
  routes: PaidRouteSpec[];
  /**
   * Durable receipt store. Required for exactly-once semantics: see the replay
   * short-circuit below for why this cannot be expressed as an SDK hook.
   */
  settlementStore?: SettlementStore;
  /** Body returned to API clients on an unpaid call (browsers get the paywall). */
  unpaidBody?: (tool: string) => unknown;
  /**
   * Max time the SDK polls settle/status after a `timeout` settle. The SDK
   * default is 5s, which is too short: a live settlement once confirmed ~60
   * blocks after the request. 25s matches the value the hand-rolled adapter used.
   */
  pollDeadlineMs?: number;
  /**
   * Test seam: substitute the facilitator client.
   *
   * The middleware syncs supported kinds from the facilitator on first request
   * and CANNOT serve a 402 without it, so an injectable client is the only way
   * to exercise the challenge/paywall path without live OKX credentials.
   * Production always leaves this undefined.
   */
  facilitatorClient?: unknown;
}

/**
 * Build the OKX-official Express payment middleware for the paid routes.
 *
 * Why this exists in payment-adapter rather than in the app: the repo rule is
 * that only this package may import the OKX SDK. The app mounts the returned
 * handler and never sees the SDK.
 *
 * Why the official middleware at all: OKX's listing review rejected the
 * hand-rolled equivalent as "not integrated with the official OKX Payment SDK".
 * The middleware owns the 402/verify/settle cycle and, critically, serves the
 * SDK paywall HTML to browser requests — a divergence a reviewer can spot by
 * simply opening the endpoint URL.
 */
export function createPaidRouteMiddleware(config: PaidRouteMiddlewareConfig): MiddlewareHandler {
  const facilitator =
    config.facilitatorClient ?? new OKXFacilitatorClient({ ...config.credentials, syncSettle: true });
  const resourceServer = new x402ResourceServer(facilitator as never).register(
    TREASURY_X402.network,
    new ExactEvmScheme(),
  );

  /**
   * Capture the settlement result directly from the SDK instead of reading it
   * back off `res` after the fact.
   *
   * Discovered live: the PAYMENT-RESPONSE header is not yet set on `res` at the
   * point the middleware calls `next()` — it gets attached later, downstream,
   * closer to when the response body is actually written. Reading it inside our
   * `next` callback (the previous approach) reliably found nothing against the
   * real SDK, even though the header does end up in the response the client
   * receives. `onAfterSettle` hands back the settlement result as data, so
   * there is nothing to race.
   *
   * AsyncLocalStorage correlates the hook firing (registered once, globally,
   * on `resourceServer`) back to the ONE in-flight request that triggered it:
   * `withReceiptStore` runs `inner()` inside `als.run()`, so a hook invoked
   * anywhere in that call's async chain sees the same store.
   */
  const settleResultAls = new AsyncLocalStorage<CapturedSettleResult>();
  resourceServer.onAfterSettle(async (context) => {
    const store = settleResultAls.getStore();
    if (!store) return;
    const result = context.result as { transaction?: string; payer?: string } | undefined;
    if (typeof result?.transaction === "string") store.transaction = result.transaction;
    if (typeof result?.payer === "string") store.payer = result.payer;
  });

  const byPattern: Record<string, unknown> = {};
  const toolByPath = new Map<string, string>();
  for (const route of config.routes) {
    const path = route.pattern.includes(" ") ? route.pattern.split(/\s+/)[1]! : route.pattern;
    toolByPath.set(path, route.tool);
    const extensions = bazaarExtensions(route.descriptor);
    byPattern[route.pattern] = {
      accepts: [
        {
          scheme: "exact",
          network: TREASURY_X402.network,
          payTo: TREASURY_X402.payTo,
          price: {
            asset: TREASURY_X402.asset,
            amount: route.price.amount,
            extra: {
              name: TREASURY_X402.assetDomainName,
              version: TREASURY_X402.assetDomainVersion,
            },
          },
          maxTimeoutSeconds: TREASURY_X402.maxTimeoutSeconds,
        },
      ],
      resource: route.resource,
      description: route.descriptor?.description ?? `Paid MCP tool: ${route.tool}`,
      mimeType: "application/json",
      ...(extensions ? { extensions } : {}),
      ...(config.unpaidBody
        ? {
            unpaidResponseBody: () => ({
              contentType: "application/json",
              body: config.unpaidBody!(route.tool),
            }),
          }
        : {}),
    };
  }

  // Timeout recovery is NATIVE to the HTTP server: on a `timeout` settle with a
  // tx hash it polls settle/status and delivers on success. We only widen the
  // deadline from the 5s default.
  const httpServer = new x402HTTPResourceServer(resourceServer, byPattern as never).setPollDeadline(
    config.pollDeadlineMs ?? 25_000,
  );
  const inner = paymentMiddlewareFromHTTPServer(httpServer) as unknown as MiddlewareHandler;
  const store = config.settlementStore;
  if (!store) return inner;
  return withReceiptStore(inner, store, toolByPath, settleResultAls);
}

/**
 * Wrap the OKX middleware with the durable-receipt guarantees.
 *
 * Exported separately so the exactly-once behaviour is unit-testable with a
 * stub `inner` — it is the property most easily broken by this migration and
 * the one that costs real money when it regresses.
 */
export function withReceiptStore(
  inner: MiddlewareHandler,
  store: SettlementStore,
  toolByPath: Map<string, string>,
  /**
   * Correlates `inner`'s call to the `onAfterSettle` hook fired somewhere
   * inside it. Omitted in tests, where a stub `inner` has no hook to fire —
   * `persistReceipt`'s header read is the fallback for that case.
   */
  settleResultAls?: AsyncLocalStorage<CapturedSettleResult>,
): MiddlewareHandler {

  /**
   * Exactly-once replay short-circuit.
   *
   * This CANNOT be an `onBeforeSettle` hook: that hook's only rejection path is
   * `{abort}`, which the SDK turns into a 400. Our contract for a duplicate
   * nonce is to re-DELIVER the original result with its receipt (HTTP 200) and
   * charge nothing. So the store is consulted before the middleware runs, and a
   * known-settled nonce bypasses payment processing entirely.
   */
  /** Bind a write-once result cache for this settlement, if the store supports one. */
  const saverFor = (nonceKey: string): X402RequestState => ({
    saveResult: async (result: unknown) => {
      // Best effort by design: the buyer has already been charged and served.
      // Failing to cache costs a recomputation on replay, never a double charge,
      // so it must not surface as an error on a successful paid call.
      try {
        await store.putResult?.(nonceKey, result);
      } catch (err) {
        console.warn("[payment-adapter] result cache write failed:", (err as Error).message);
      }
    },
  });

  return async function paidRouteMiddleware(req, res, next) {
    const tool = toolByPath.get(req.path);
    const nonceKeyForRequest = tool ? readNonceKey(req, tool) : null;
    try {
      if (tool) {
        const nonceKey = nonceKeyForRequest;
        if (nonceKey) {
          const prior = await store.get(nonceKey);
          if (prior?.status === "settled" && prior.transaction) {
            res.header(
              X402_HEADERS.paymentResponse,
              Buffer.from(
                JSON.stringify({
                  success: true,
                  status: "success",
                  transaction: prior.transaction,
                  network: TREASURY_X402.network,
                  payer: prior.payer,
                }),
                "utf-8",
              ).toString("base64"),
            );
            // A settled receipt whose result never got cached (crash between
            // settle and delivery, or a store without putResult) still has to be
            // delivered — recompute and cache it so the NEXT replay is exact.
            req.x402 =
              prior.result !== undefined
                ? { ...saverFor(nonceKey), cachedResult: prior.result }
                : saverFor(nonceKey);
            next();
            return;
          }
        }
      }
    } catch (err) {
      // A store failure must never block a payable request; fall through to the
      // middleware, which re-verifies against the facilitator anyway.
      console.warn("[payment-adapter] replay lookup failed:", (err as Error).message);
    }

    // The middleware calls next() ONLY on a confirmed-successful settlement
    // (including one recovered by its internal timeout polling). That makes
    // this the correct place to persist the receipt.
    const captured: CapturedSettleResult = {};
    const runInner = () =>
      inner(req, res, (err?: unknown) => {
        if (err !== undefined && err !== null) {
          next(err);
          return;
        }
        if (!nonceKeyForRequest) {
          req.x402 = NO_SAVE;
          next();
          return;
        }
        req.x402 = saverFor(nonceKeyForRequest);
        void persistReceipt(store, nonceKeyForRequest, res, captured)
          .catch((e: unknown) =>
            console.warn("[payment-adapter] receipt persist failed:", (e as Error).message),
          )
          .finally(() => next());
      });
    return settleResultAls ? settleResultAls.run(captured, runInner) : runInner();
  };
}

/**
 * Record a confirmed settlement so a later replay re-delivers without charging.
 *
 * Prefers `captured` (populated by the SDK's `onAfterSettle` hook via
 * AsyncLocalStorage) over reading the PAYMENT-RESPONSE response header: the
 * header is not reliably present on `res` yet at this point in the request
 * lifecycle — verified against the real SDK, where reading it here found
 * nothing even on a confirmed, on-chain-settled payment. The header read
 * remains as a fallback for callers (tests) that don't wire the hook.
 */
async function persistReceipt(
  store: SettlementStore,
  nonceKey: string,
  res: ExpressLikeResponse,
  captured?: CapturedSettleResult,
): Promise<void> {
  if (captured?.transaction) {
    await store.update(nonceKey, {
      status: "settled",
      transaction: captured.transaction,
      ...(captured.payer ? { payer: captured.payer } : {}),
    });
    return;
  }
  const raw = res.getHeader?.(X402_HEADERS.paymentResponse);
  const encoded = Array.isArray(raw) ? raw[0] : raw;
  if (typeof encoded !== "string" || encoded.length === 0) return;
  const receipt = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as {
    transaction?: unknown;
    payer?: unknown;
  };
  if (typeof receipt.transaction !== "string") return;
  await store.update(nonceKey, {
    status: "settled",
    transaction: receipt.transaction,
    ...(typeof receipt.payer === "string" ? { payer: receipt.payer } : {}),
  });
}

/** `payer:nonce:tool`, matching SdkPaymentAdapter's durable-store key format. */
function readNonceKey(req: ExpressLikeRequest, tool: string): string | null {
  let raw: string | undefined;
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    const lower = name.toLowerCase();
    const v = Array.isArray(value) ? value[0] : value;
    if (!v) continue;
    if (lower === X402_HEADERS.paymentSignature.toLowerCase()) raw = v;
    if (lower === X402_HEADERS.xPayment.toLowerCase() && !raw) raw = v;
  }
  if (!raw) return null;
  try {
    const payload = decodePaymentPayload(raw) as unknown as {
      payload?: { authorization?: { from?: unknown; nonce?: unknown } };
    };
    const from = payload.payload?.authorization?.from;
    const nonce = payload.payload?.authorization?.nonce;
    if (typeof from !== "string" || typeof nonce !== "string") return null;
    return `${from.toLowerCase()}:${nonce.toLowerCase()}:${tool}`;
  } catch {
    return null;
  }
}
