import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { PaymentContext } from "@constellation/payment-adapter";
import { encodePaymentRequired, X402_HEADERS } from "@constellation/payment-adapter";
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

        // Precondition checks BEFORE any settlement — never charge for a request
        // we cannot fulfil. Covers the common charge-without-result cases (unknown
        // wallet, bad export format). Deeper crash-safety needs a durable receipt
        // store (see docs/status/P1.md) and is tracked separately.
        const precheck = await precheckPaidCall(deps, tool, args);
        if (precheck) {
          res.json({ jsonrpc: "2.0", id: req.body.id, result: asContent(precheck) });
          return;
        }

        const ctx = paymentCtx(req);
        const payRes = await deps.payments.requirePayment(tool, ctx);
        if (payRes.status === "payment_required") {
          // Only emit the standard x402 PAYMENT-REQUIRED header for a real x402 v2
          // challenge (array `accepts`). A mock-mode challenge carries a string
          // `accepts` and no x402Version — encoding that as x402 would ship a
          // structurally-invalid header, so mock 402s stay in the JSON-RPC body.
          const ch = payRes.challenge as Record<string, unknown> | undefined;
          const isRealX402 = ch?.x402Version === 2 && Array.isArray(ch.accepts);
          if (isRealX402) {
            res.header(X402_HEADERS.paymentRequired, encodePaymentRequired(ch as never));
          }
          res.status(402).json({
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
    res.json({ status: "ok", service: "treasury-copilot", tools: 5 });
  });

  return app;
}
