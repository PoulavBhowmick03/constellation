import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { PaymentContext } from "@constellation/payment-adapter";
import {
  encodePaymentRequired,
  MOCK_PAYMENT_HEADER,
  X402_HEADERS,
} from "@constellation/payment-adapter";
import type { TreasuryHandlers } from "./handlers.js";
import { createHandlers } from "./handlers.js";
import type { TreasuryDeps } from "./deps.js";

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
): Promise<{ error: { code: string; message: string } } | null> {
  if (tool === "export_statement" && !["csv", "json", "md"].includes(String(args.format))) {
    return { error: { code: "BAD_REQUEST", message: "format must be csv | json | md" } };
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
    return { error: { code: "BAD_REQUEST", message: "wallet_id is required" } };
  }
  const wallet = await deps.ledger.getWalletById(walletId);
  if (!wallet) {
    return { error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${walletId}"` } };
  }
  return null;
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
function buildServer(handlers: TreasuryHandlers, ctx: PaymentContext): McpServer {
  const server = new McpServer({ name: "treasury-copilot", version: "0.1.0" });

  server.tool(
    "register_wallet",
    "Prove ownership of a wallet (EIP-191). Call with {address} to get a challenge; sign challenge.message and call again with {address, nonce, signature}. Free.",
    {
      address: z.string(),
      nonce: z.string().optional(),
      signature: z.string().optional(),
    },
    async (args) => asContent(await handlers.register_wallet(args)),
  );

  server.tool(
    "get_runway",
    "OKB balance, average daily gas over 7d, and estimated runway in days for a registered wallet. Free.",
    { wallet_id: z.string() },
    async (args) => asContent(await handlers.get_runway(args)),
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

  return server;
}

export function createApp(deps: TreasuryDeps): express.Express {
  const handlers = createHandlers(deps);
  const app = express();
  app.use(express.json());

  const PAID_TOOLS = ["get_revenue_report", "get_expense_report", "export_statement"];

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

        // Precondition checks BEFORE any settlement — never charge for a request
        // we cannot fulfil. Covers the common charge-without-result cases (unknown
        // wallet, bad export format). Runs only for paying callers now; unpaid
        // callers already got their 402 above.
        const precheck = await precheckPaidCall(deps, tool, args);
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
    const server = buildServer(handlers, paymentCtx(req));
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

  const errorStatus = (code: string): number =>
    code === "WALLET_NOT_FOUND" ? 404 : code === "PAYMENT_REQUIRED" ? 402 : 400;

  const paidService = (slug: string, tool: "get_revenue_report" | "get_expense_report" | "export_statement") => {
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

        // Never settle a payment for a request we cannot fulfil.
        const precheck = await precheckPaidCall(deps, tool, args);
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

        const result =
          tool === "get_revenue_report"
            ? await handlers.get_revenue_report(args as never, ctx)
            : tool === "get_expense_report"
              ? await handlers.get_expense_report(args as never, ctx)
              : await handlers.export_statement(args as never, ctx);

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
  paidService("revenue-report", "get_revenue_report");
  paidService("expense-report", "get_expense_report");
  paidService("export-statement", "export_statement");

  // Free tools over plain HTTP (200 with the result directly, per the A2MCP
  // spec's free-endpoint shape) so the whole journey works without MCP framing.
  app.post("/services/register-wallet", async (req: Request, res: Response) => {
    try {
      res.json(await handlers.register_wallet((req.body ?? {}) as never));
    } catch (err) {
      console.error("[treasury] register-wallet failed:", (err as Error).message);
      if (!res.headersSent) res.status(500).json({ error: { code: "INTERNAL", message: "internal error" } });
    }
  });
  app.post("/services/runway", async (req: Request, res: Response) => {
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
      tools: 5,
      services: [
        "/services/register-wallet",
        "/services/runway",
        "/services/revenue-report",
        "/services/expense-report",
        "/services/export-statement",
      ],
    });
  });

  return app;
}
