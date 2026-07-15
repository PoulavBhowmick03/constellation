import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { PaymentContext } from "@constellation/payment-adapter";
import type { TreasuryHandlers } from "./handlers.js";

const periodShape = z
  .object({ from: z.string().optional(), to: z.string().optional() })
  .optional()
  .default({});

/** Flatten express headers into the PaymentContext shape the adapter reads. */
function paymentCtx(req: Request): PaymentContext {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  return { headers };
}

function asContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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
    async (args) => asContent(await handlers.get_revenue_report(args, ctx)),
  );

  server.tool(
    "get_expense_report",
    "Outgoing USDT/USDG totals by counterparty plus OKB gas for a period. Paid: 0.10 USDT.",
    { wallet_id: z.string(), period: periodShape },
    async (args) => asContent(await handlers.get_expense_report(args, ctx)),
  );

  server.tool(
    "export_statement",
    "Full statement (transfers + gas) for a period as csv, json, or md. Paid: 0.20 USDT.",
    {
      wallet_id: z.string(),
      period: periodShape,
      format: z.enum(["csv", "json", "md"]),
    },
    async (args) => asContent(await handlers.export_statement(args, ctx)),
  );

  return server;
}

export function createApp(handlers: TreasuryHandlers): express.Express {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response) => {
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
