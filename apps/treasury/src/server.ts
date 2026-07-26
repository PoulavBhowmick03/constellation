import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { PaymentContext, X402RequestState } from "@constellation/payment-adapter";
import {
  encodePaymentRequired,
  readClaimedPayer,
  MOCK_PAYMENT_HEADER,
  X402_HEADERS,
} from "@constellation/payment-adapter";
import type { TreasuryHandlers } from "./handlers.js";
import { createHandlers } from "./handlers.js";
import type { TreasuryDeps } from "./deps.js";
import { clientKey, createRateLimiter } from "./ratelimit.js";

const periodShape = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .optional()
  .default({});

/**
 * Cheap preconditions checked BEFORE settlement so a paid call is never charged
 * when it cannot be fulfilled. Returns a ToolError-shaped object to return
 * verbatim (matching the handler's own errors), or null to proceed to charging.
 */
async function precheckPaidCall(
  deps: TreasuryDeps,
  tool: string,
  args: Record<string, unknown>,
  /** True when wallet_id is deferred to the paying wallet, resolved post-settle. */
  walletFromPayer = false,
): Promise<{ error: { code: string; message: string } } | null> {
  if (tool === "export_statement" && !["csv", "json", "md"].includes(String(args.format))) {
    return { error: { code: "BAD_REQUEST", message: "format must be csv | json | md" } };
  }
  // Validate the spend amount BEFORE charging — a malformed amount must not settle.
  if (tool === "spend_preflight" && !/^\d+$/.test(String(args.amount ?? ""))) {
    return {
      error: { code: "BAD_REQUEST", message: "amount must be an unsigned base-unit integer string" },
    };
  }
  // Validate the period BEFORE charging — a malformed from/to must not settle.
  const period = args.period;
  if (period !== undefined && period !== null) {
    if (typeof period !== "object") {
      return { error: { code: "BAD_REQUEST", message: "period must be an object" } };
    }
    for (const key of ["from", "to"] as const) {
      const v = (period as Record<string, unknown>)[key];
      if (v !== undefined && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) {
        return { error: { code: "BAD_REQUEST", message: `period.${key} must be an ISO date` } };
      }
    }
  }
  const walletId = args.wallet_id;
  if (typeof walletId !== "string" || walletId.length === 0) {
    // Deferred to the paying wallet: registration always succeeds, so this
    // cannot become a charged-but-unfulfillable call.
    if (walletFromPayer) return null;
    return { error: { code: "BAD_REQUEST", message: "wallet_id is required" } };
  }
  const wallet = await deps.ledger.getWalletById(walletId);
  if (!wallet) {
    return { error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${walletId}"` } };
  }
  return null;
}

/**
 * Fill in arguments a paying caller may reasonably omit, BEFORE the precheck.
 *
 * `wallet_id` defaults to the paying wallet: an EIP-3009 authorization is a
 * signature by that address, so the payer has already proven control of it —
 * the same proof `register_wallet`'s EIP-191 challenge asks for. A payer whose
 * wallet is unknown is therefore registered here rather than rejected, so a
 * funded caller (including the listing reviewer) gets a valid report instead of
 * an error on a call it has already paid for.
 *
 * This grants no access the caller lacked: it can only ever resolve to its own
 * address, and an explicit `wallet_id` always wins. Registration is idempotent.
 *
 * Cost note: each NEW payer registers a wallet, and the indexer backfills from
 * `deps.startBlock` (INDEXER_REGISTER_LOOKBACK). That is a paid-but-cheap way
 * to add indexing work; tune the lookback if it becomes a problem.
 */
function planPaidCallDefaults(
  tool: string,
  args: Record<string, unknown>,
  req: Request,
): { payerWallet: string | null } {
  if (tool === "export_statement" && args.format === undefined) {
    args.format = "json";
  }
  const walletId = args.wallet_id;
  if (typeof walletId === "string" && walletId.length > 0) return { payerWallet: null };

  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  // Claimed, not yet verified — deliberately NOT acted on until payment settles.
  return { payerWallet: readClaimedPayer(headers) };
}

/**
 * Resolve the deferred payer wallet AFTER payment is confirmed.
 *
 * Registration must never happen before settlement: it is the one side effect
 * in this path that costs real work (the indexer backfills from
 * INDEXER_REGISTER_LOOKBACK), so doing it pre-payment would let an unpaid
 * caller force arbitrary indexing by sending a bogus payment header.
 *
 * By this point the claimed payer IS the verified payer — the adapter binds
 * `authorization.from` into the signed payload and rejects the settlement
 * unless the facilitator recovers that same address.
 */
async function resolvePayerWallet(
  deps: TreasuryDeps,
  args: Record<string, unknown>,
  payerWallet: string | null,
): Promise<void> {
  if (!payerWallet) return;
  if (typeof args.wallet_id === "string" && args.wallet_id.length > 0) return;
  const wallet = await deps.ledger.registerWallet(payerWallet, deps.chainId, deps.startBlock);
  args.wallet_id = wallet.id;
}

/** Flatten express headers into the PaymentContext shape the adapter reads. */
function paymentCtx(req: Request): PaymentContext {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  return { headers, ...(req as any).paymentSettlement };
}

/**
 * Whether the request carries ANY payment proof (real x402 or the documented
 * mock header). Per the OKX A2MCP spec, an unpaid request to a paid service
 * must get a 402 challenge IMMEDIATELY — before argument validation — so the
 * platform's x402 validator (which has no wallet_id) always sees the challenge.
 * Precondition checks still run for paying callers BEFORE settlement.
 */
function hasPaymentHeader(req: Request): boolean {
  const h = (name: string) => req.headers[name.toLowerCase()];
  return Boolean(
    h(X402_HEADERS.paymentSignature) || h(X402_HEADERS.xPayment) || h(MOCK_PAYMENT_HEADER),
  );
}

/** Emit a 402 with the standard PAYMENT-REQUIRED header (real x402 only). */
function send402(
  res: Response,
  challenge: unknown,
  body: Record<string, unknown>,
): void {
  const ch = challenge as Record<string, unknown> | undefined;
  const isRealX402 = ch?.x402Version === 2 && Array.isArray(ch.accepts);
  if (isRealX402) {
    // `challenge` is created by the OKX SDK. Encode exactly that standard
    // PaymentRequired object; internal diagnostics live outside it.
    res.header(X402_HEADERS.paymentRequired, encodePaymentRequired(ch as never));
  }
  res.status(402).json(body);
}

function asContent(result: unknown, paymentResponse?: string) {
  const content = [{ type: "text" as const, text: JSON.stringify(result, null, 2) }];
  if (paymentResponse) {
    // The x402 settlement receipt travels as its own MCP content block (not an
    // HTTP header — payment is tunnelled through MCP tool content here). x402Version
    // lets an MCP-aware payer recognize and decode PAYMENT-RESPONSE.
    content.push({
      type: "text" as const,
      text: JSON.stringify({ x402Version: 2, "PAYMENT-RESPONSE": paymentResponse }, null, 2),
    });
  }
  return { content };
}

/**
 * Run a paid tool with a fresh settlement sink so its x402 receipt (sdk mode)
 * is echoed back as a PAYMENT-RESPONSE block. The domain result is returned
 * verbatim; the receipt never merges into it.
 */
async function paidContent(
  ctx: PaymentContext,
  run: (ctx: PaymentContext) => Promise<unknown>,
) {
  const result = await run(ctx);
  return asContent(result, ctx.settlement?.paymentResponse);
}

/**
 * One McpServer per request (stateless streamable-HTTP pattern) so each tool
 * call sees the payment headers of ITS request — sessions must not share
 * payment proof.
 */
function buildServer(
  handlers: TreasuryHandlers,
  ctx: PaymentContext,
  /**
   * Consume one unit of this caller's free-tool budget. Returns the retry delay
   * in seconds when the caller is over its limit, or null to proceed. Applied to
   * the free tools ONLY — the paid ones are throttled by their own price, and
   * refusing a call someone has already paid for would be indefensible.
   */
  takeFreeBudget: () => number | null = () => null,
): McpServer {
  const server = new McpServer({ name: "treasury-copilot", version: "0.1.0" });

  /** Shared shape so an MCP caller sees the same error as the HTTP surface. */
  const rateLimited = (retry: number) =>
    asContent({
      error: {
        code: "RATE_LIMITED",
        message: `too many free-tool requests — retry in ${retry}s. Paid tools are not rate limited.`,
      },
    });

  server.tool(
    "register_wallet",
    "Prove ownership of a wallet (EIP-191). Call with {address} to get a challenge; sign challenge.message and call again with {address, nonce, signature}. Free.",
    {
      address: z.string(),
      nonce: z.string().optional(),
      signature: z.string().optional(),
    },
    async (args) => {
      const retry = takeFreeBudget();
      if (retry !== null) return rateLimited(retry);
      return asContent(await handlers.register_wallet(args));
    },
  );

  server.tool(
    "get_runway",
    "OKB balance, average daily gas over 7d, and estimated runway in days for a registered wallet. Free.",
    { wallet_id: z.string() },
    async (args) => {
      const retry = takeFreeBudget();
      if (retry !== null) return rateLimited(retry);
      return asContent(await handlers.get_runway(args));
    },
  );

  server.tool(
    "get_revenue_report",
    "Incoming USDT/USDG totals by counterparty for a period. Paid: 0.10 USDT.",
    { wallet_id: z.string(), period: periodShape },
    async (args) => paidContent(ctx, (c) => handlers.get_revenue_report(args, c)),
  );

  server.tool(
    "get_expense_report",
    "Outgoing USDT/USDG totals by counterparty plus OKB gas for a period. Paid: 0.10 USDT.",
    { wallet_id: z.string(), period: periodShape },
    async (args) => paidContent(ctx, (c) => handlers.get_expense_report(args, c)),
  );

  server.tool(
    "export_statement",
    "Full statement (transfers + gas) for a period as csv, json, or md. Paid: 0.20 USDT.",
    {
      wallet_id: z.string(),
      period: periodShape,
      format: z.enum(["csv", "json", "md"]),
    },
    async (args) => paidContent(ctx, (c) => handlers.export_statement(args, c)),
  );

  server.tool(
    "spend_preflight",
    "Advisory check before an agent spends: projects balance and burn-rate runway past the spend and evaluates it against optional policy caps. Read-only — moves nothing, authorises nothing. Paid: 0.05 USDT.",
    {
      wallet_id: z.string(),
      amount: z.string(),
      token: z.string().optional(),
      counterparty: z.string().optional(),
      policy: z
        .object({
          max_pct_balance: z.number().optional(),
          min_runway_days_after: z.number().optional(),
          max_single_spend: z.string().optional(),
        })
        .optional(),
    },
    async (args) => paidContent(ctx, (c) => handlers.spend_preflight(args, c)),
  );

  return server;
}

export function createApp(deps: TreasuryDeps): express.Express {
  const handlers = createHandlers(deps);
  const app = express();
  app.use(express.json());

  const PAID_TOOLS = ["get_revenue_report", "get_expense_report", "export_statement", "spend_preflight"];

  app.post("/mcp", async (req: Request, res: Response, next: express.NextFunction) => {
    try {
      if (req.body?.method === "tools/call" && PAID_TOOLS.includes(req.body.params?.name)) {
        const tool = req.body.params.name;
        const args = (req.body.params.arguments ?? {}) as Record<string, unknown>;

        // x402 spec order (OKX A2MCP requirement): an UNPAID request gets the
        // 402 challenge immediately — argument validation must not mask it, or
        // the platform's validator (no registered wallet_id) never sees a 402.
        if (!hasPaymentHeader(req)) {
          const unpaid = await deps.payments.requirePayment(tool, paymentCtx(req));
          if (unpaid.status === "payment_required") {
            const ch = unpaid.challenge as Record<string, unknown> | undefined;
            send402(res, ch, {
              jsonrpc: "2.0",
              id: req.body.id,
              error: { code: -32000, message: `payment required for "${tool}"`, data: { payment: ch } },
            });
            return;
          }
          // Free/misconfigured tools fall through to the MCP transport.
        }

        // Plan omitted args (no side effects); the payer wallet is resolved
        // only once payment is confirmed.
        const { payerWallet } = planPaidCallDefaults(tool, args, req);

        // Precondition checks BEFORE any settlement — never charge for a request
        // we cannot fulfil. Covers the common charge-without-result cases (unknown
        // wallet, bad export format). Runs only for paying callers now; unpaid
        // callers already got their 402 above.
        const precheck = await precheckPaidCall(deps, tool, args, payerWallet !== null);
        if (precheck) {
          res.json({ jsonrpc: "2.0", id: req.body.id, result: asContent(precheck) });
          return;
        }

        const ctx = paymentCtx(req);
        const payRes = await deps.payments.requirePayment(tool, ctx);
        if (payRes.status === "payment_required") {
          // Invalid/failed proof: re-issue the challenge. Only emit the standard
          // x402 PAYMENT-REQUIRED header for a real x402 v2 challenge (array
          // `accepts`) — a mock-mode challenge stays in the JSON-RPC body.
          const ch = payRes.challenge as Record<string, unknown> | undefined;
          send402(res, ch, {
            jsonrpc: "2.0",
            id: req.body.id,
            error: { code: -32000, message: `payment required for "${tool}"`, data: { payment: ch } },
          });
          return;
        }
        // Payment confirmed — now safe to register/resolve the payer's wallet.
        // `args` aliases req.body.params.arguments, so the transport sees it.
        await resolvePayerWallet(deps, args, payerWallet);

        // Set the standard x402 PAYMENT-RESPONSE HTTP header so an unmodified OKX
        // client can reconcile settlement via its normal path — in addition to the
        // MCP content block (below) for MCP-aware buyers. Set before the transport
        // writes the response so it persists on the 200.
        if (payRes.paymentResponse) {
          res.header(X402_HEADERS.paymentResponse, payRes.paymentResponse);
        }
        // Attach the settled receipt so the handler can echo PAYMENT-RESPONSE.
        (req as unknown as { paymentSettlement?: unknown }).paymentSettlement = {
          preflightResult: payRes,
          settlement: { paymentResponse: payRes.paymentResponse },
        };
      }
      next();
    } catch (err) {
      next(err);
    }
  }, async (req: Request, res: Response) => {
    const server = buildServer(handlers, paymentCtx(req), () => {
      const key = clientKey(req);
      return limiter.take(key) ? null : Math.max(1, limiter.retryAfter(key));
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[treasury] mcp request failed:", (err as Error).message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "internal error" },
          id: null,
        });
      }
    }
  });

  // ── Plain-HTTP service routes (OKX A2MCP listing surface) ─────────────────
  // The listing validator probes each registered service endpoint with plain
  // HTTP and requires: first call with no payment header → HTTP 402 with the
  // base64 PAYMENT-REQUIRED challenge header (resource.url = this https URL).
  // A paid replay POSTs the same URL with the payment header + JSON args and
  // receives the domain result directly (200) + PAYMENT-RESPONSE header.
  // The /mcp surface stays canonical for MCP-native agents.
  const publicBase = (req: Request): string =>
    process.env.PUBLIC_BASE_URL ?? `https://${req.get("host") ?? "localhost"}`;

  /**
   * Rate limit for the free tools only.
   *
   * Sized for agent traffic, not human clicking: a burst of 30 then 1/s
   * sustained is far above any legitimate caller's registration or runway-check
   * rate, and far below what it takes to keep the indexer saturated. The paid
   * routes are intentionally NOT limited — settlement already costs the caller
   * money, and a 429 on a call someone paid for would be the worst possible
   * failure mode.
   */
  const limiter =
    deps.freeRateLimiter ??
    createRateLimiter({
      capacity: Number(process.env.FREE_RATE_BURST ?? 30),
      refillPerSecond: Number(process.env.FREE_RATE_PER_SECOND ?? 1),
    });

  const freeLimit = (req: Request, res: Response, next: express.NextFunction): void => {
    const key = clientKey(req);
    if (limiter.take(key)) {
      next();
      return;
    }
    const retry = limiter.retryAfter(key);
    res.setHeader("Retry-After", String(Math.max(1, retry)));
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: `too many free-tool requests — retry in ${Math.max(1, retry)}s. Paid tools are not rate limited.`,
      },
    });
  };

  const PAID_SERVICES = [
    ["revenue-report", "get_revenue_report"],
    ["expense-report", "get_expense_report"],
    ["export-statement", "export_statement"],
    ["spend-preflight", "spend_preflight"],
  ] as const satisfies ReadonlyArray<readonly [string, string]>;

  const errorStatus = (code: string): number =>
    code === "WALLET_NOT_FOUND" ? 404 : code === "PAYMENT_REQUIRED" ? 402 : 400;

  type PaidTool =
    | "get_revenue_report"
    | "get_expense_report"
    | "export_statement"
    | "spend_preflight";

  const runPaidTool = async (
    tool: PaidTool,
    args: Record<string, unknown>,
    ctx: PaymentContext,
  ): Promise<unknown> =>
    tool === "get_revenue_report"
      ? await handlers.get_revenue_report(args as never, ctx)
      : tool === "get_expense_report"
        ? await handlers.get_expense_report(args as never, ctx)
        : tool === "spend_preflight"
          ? await handlers.spend_preflight(args as never, ctx)
          : await handlers.export_statement(args as never, ctx);

  /**
   * Production paid surface: the official OKX Express middleware owns the
   * 402 / verify / settle cycle (and serves the SDK paywall to browsers).
   *
   * Three mounted layers, in order:
   *  1. precheck — runs ONLY for callers presenting a payment header, so an
   *     unpaid request still reaches the middleware and gets its 402 first.
   *     Kept out of the SDK's `onProtectedRequest` hook deliberately: that
   *     hook's only rejection path is 403, and our contract is 400 / 404.
   *  2. the OKX middleware.
   *  3. delivery — reached only on a confirmed settlement, which is why the
   *     payer's wallet is registered here rather than before payment.
   */
  const mountSdkPaidRoutes = (middleware: NonNullable<TreasuryDeps["paidRouteMiddleware"]>) => {
    const paths = PAID_SERVICES.map(([slug]) => `/services/${slug}`);
    const toolByPath = new Map<string, PaidTool>(
      PAID_SERVICES.map(([slug, tool]) => [`/services/${slug}`, tool as PaidTool]),
    );

    app.all(paths, async (req: Request, res: Response, next: express.NextFunction) => {
      try {
        // Gate on the payment header alone, not on method. Routes are
        // registered verb-less so the SDK settles a payment attached to ANY
        // HTTP method (GET included — a client that reuses the verb it used
        // to probe the 402 will replay with the same one). Excluding non-POST
        // here let exactly that kind of paid request skip precheck entirely
        // and reach real settlement unvalidated — a buyer paid, the export
        // handler then rejected the call for a missing `format`, and the
        // charge had already gone through. Found live, on a real external
        // payment (0.2 USDT₮0, tx 0x2b0a7eed...).
        if (!hasPaymentHeader(req)) {
          next();
          return;
        }
        // A paid replay carrying a non-POST verb (most likely a client that
        // reused the method from its unpaid probe) has nowhere reliable to
        // put JSON body args. Reject with a precise reason before the SDK
        // ever sees it, rather than let a tool without required args settle
        // silently or a tool with them (export_statement's format,
        // spend_preflight's amount) fail confusingly after being charged.
        if (req.method !== "POST") {
          res.status(400).json({
            error: {
              code: "BAD_REQUEST",
              message: `replay this paid call as POST with a JSON body, not ${req.method}`,
            },
          });
          return;
        }
        const tool = toolByPath.get(req.path)!;
        const args = (req.body ?? {}) as Record<string, unknown>;
        const { payerWallet } = planPaidCallDefaults(tool, args, req);
        (req as unknown as { payerWallet?: string | null }).payerWallet = payerWallet;
        const precheck = await precheckPaidCall(deps, tool, args, payerWallet !== null);
        if (precheck) {
          res.status(errorStatus(precheck.error.code)).json(precheck);
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    });

    app.use(middleware as unknown as express.RequestHandler);

    app.all(paths, async (req: Request, res: Response) => {
      const tool = toolByPath.get(req.path)!;
      const x402 = (req as unknown as { x402?: X402RequestState }).x402;
      try {
        // Exactly-once DELIVERY. A replayed authorization already bought a
        // specific answer; returning a freshly computed one would mean the same
        // receipt vouches for two different results — and for a balance- and
        // time-sensitive tool like spend_preflight those can genuinely disagree.
        // Serving from cache also stops a spent nonce being replayed forever for
        // free indexer work.
        if (x402?.cachedResult !== undefined) {
          res.json(x402.cachedResult);
          return;
        }

        const args = (req.body ?? {}) as Record<string, unknown>;
        const payerWallet =
          (req as unknown as { payerWallet?: string | null }).payerWallet ?? null;
        await resolvePayerWallet(deps, args, payerWallet);

        // Reaching here means the middleware already settled the payment. The
        // handler's own gate must NOT run the adapter again — that would ask
        // the facilitator to verify/settle an already-spent nonce. Hand it a
        // satisfied preflight result instead; the middleware has already set
        // the PAYMENT-RESPONSE header on this response.
        const ctx: PaymentContext & { preflightResult?: unknown } = {
          ...paymentCtx(req),
          settlement: {},
          preflightResult: { status: "paid", price: null },
        };
        const result = await runPaidTool(tool, args, ctx);
        res.json(result);
        // Cached AFTER the response is handed to the client: the buyer paid for
        // delivery, and a slow or failing cache write must not delay or fail it.
        await x402?.saveResult(result);
      } catch (err) {
        console.error(`[treasury] service ${tool} failed:`, (err as Error).message);
        if (!res.headersSent) {
          res.status(500).json({ error: { code: "INTERNAL", message: "internal error" } });
        }
      }
    });
  };

  const paidService = (slug: string, tool: PaidTool) => {
    app.all(`/services/${slug}`, async (req: Request, res: Response) => {
      try {
        const resourceUrl = `${publicBase(req)}/services/${slug}`;

        // Unpaid (any method) → the standard 402 challenge, unconditionally.
        if (req.method !== "POST" || !hasPaymentHeader(req)) {
          const unpaid = await deps.payments.requirePayment(tool, { headers: {}, resourceUrl });
          if (unpaid.status === "payment_required") {
            const ch = unpaid.challenge as Record<string, unknown> | undefined;
            send402(res, ch, {
              error: {
                code: "PAYMENT_REQUIRED",
                message: `payment required for "${tool}" — replay as POST with the payment header and JSON body args`,
                payment: ch,
              },
            });
            return;
          }
        }

        const args = (req.body ?? {}) as Record<string, unknown>;

        // Plan omitted args (no side effects); the payer wallet is resolved
        // only once payment is confirmed.
        const { payerWallet } = planPaidCallDefaults(tool, args, req);

        // Never settle a payment for a request we cannot fulfil.
        const precheck = await precheckPaidCall(deps, tool, args, payerWallet !== null);
        if (precheck) {
          res.status(errorStatus(precheck.error.code)).json(precheck);
          return;
        }

        const ctx: PaymentContext & { preflightResult?: unknown } = {
          ...paymentCtx(req),
          resourceUrl,
          settlement: {},
        };
        const payRes = await deps.payments.requirePayment(tool, ctx);
        if (payRes.status === "payment_required") {
          const ch = payRes.challenge as Record<string, unknown> | undefined;
          send402(res, ch, {
            error: { code: "PAYMENT_REQUIRED", message: `payment required for "${tool}"`, payment: ch },
          });
          return;
        }
        ctx.preflightResult = payRes;

        // Payment confirmed — now safe to register/resolve the payer's wallet.
        await resolvePayerWallet(deps, args, payerWallet);

        const result = await runPaidTool(tool, args, ctx);

        if (payRes.paymentResponse) {
          res.header(X402_HEADERS.paymentResponse, payRes.paymentResponse);
        }
        res.json(result);
      } catch (err) {
        console.error(`[treasury] service ${slug} failed:`, (err as Error).message);
        if (!res.headersSent) res.status(500).json({ error: { code: "INTERNAL", message: "internal error" } });
      }
    });
  };
  if (deps.paidRouteMiddleware) {
    mountSdkPaidRoutes(deps.paidRouteMiddleware);
  } else {
    for (const [slug, tool] of PAID_SERVICES) paidService(slug, tool);
  }

  // Free tools over plain HTTP (200 with the result directly, per the A2MCP
  // spec's free-endpoint shape) so the whole journey works without MCP framing.
  app.post("/services/register-wallet", freeLimit, async (req: Request, res: Response) => {
    try {
      res.json(await handlers.register_wallet((req.body ?? {}) as never));
    } catch (err) {
      console.error("[treasury] register-wallet failed:", (err as Error).message);
      if (!res.headersSent) res.status(500).json({ error: { code: "INTERNAL", message: "internal error" } });
    }
  });
  app.post("/services/runway", freeLimit, async (req: Request, res: Response) => {
    try {
      const result = await handlers.get_runway((req.body ?? {}) as never);
      const code = (result as { error?: { code?: string } }).error?.code;
      res.status(code ? errorStatus(code) : 200).json(result);
    } catch (err) {
      console.error("[treasury] runway failed:", (err as Error).message);
      if (!res.headersSent) res.status(500).json({ error: { code: "INTERNAL", message: "internal error" } });
    }
  });

  // Stateless server: GET (SSE resume) and DELETE (session teardown) don't apply.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "method not allowed (stateless server)" },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "treasury-copilot",
      tools: 6,
      services: [
        "/services/register-wallet",
        "/services/runway",
        "/services/revenue-report",
        "/services/expense-report",
        "/services/export-statement",
        "/services/spend-preflight",
      ],
    });
  });

  return app;
}
