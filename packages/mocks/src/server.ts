import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { KyaMockService } from "./kya.js";
import { TreasuryMockService } from "./treasury.js";
import type { AgentRef, AttestationMode } from "./types.js";

const agentRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("erc8004"),
    chain: z.string(),
    registry: z.string(),
    agent_id: z.number().int(),
  }),
  z.object({
    kind: z.literal("wallet"),
    chain: z.string(),
    address: z.string(),
  }),
]);

const periodSchema = z.object({ from: z.string().optional(), to: z.string().optional() }).optional().default({});

function asContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function buildServer(
  treasury: TreasuryMockService,
  kya: KyaMockService,
): McpServer {
  const server = new McpServer({ name: "constellation-mocks", version: "0.1.0" });

  server.tool(
    "register_wallet",
    "Mock Treasury challenge/register flow for wallet_with_history.",
    { address: z.string(), nonce: z.string().optional(), signature: z.string().optional() },
    async (args) => asContent(await treasury.register_wallet(args)),
  );
  server.tool(
    "get_runway",
    "Mock Treasury runway for wallet_with_history.",
    { wallet_id: z.string() },
    async (args) => asContent(await treasury.get_runway(args)),
  );
  server.tool(
    "get_revenue_report",
    "Mock Treasury revenue report for wallet_with_history.",
    { wallet_id: z.string(), period: periodSchema },
    async (args) => asContent(await treasury.get_revenue_report(args)),
  );
  server.tool(
    "get_expense_report",
    "Mock Treasury expense report for wallet_with_history.",
    { wallet_id: z.string(), period: periodSchema },
    async (args) => asContent(await treasury.get_expense_report(args)),
  );
  server.tool(
    "export_statement",
    "Mock Treasury statement export for wallet_with_history.",
    { wallet_id: z.string(), period: periodSchema, format: z.enum(["csv", "json", "md"]) },
    async (args) => asContent(await treasury.export_statement(args)),
  );

  server.tool(
    "get_flags",
    "Mock KYA flags for the golden agent fixtures.",
    { agent_ref: agentRefSchema },
    async (args) => asContent(await kya.get_flags(args as { agent_ref: AgentRef })),
  );
  server.tool(
    "check_agent",
    "Mock KYA report for the golden agent fixtures.",
    { agent_ref: agentRefSchema },
    async (args) => asContent(await kya.check_agent(args as { agent_ref: AgentRef })),
  );
  server.tool(
    "attest_agent",
    "Mock KYA attestation for the golden agent fixtures.",
    { agent_ref: agentRefSchema },
    async (args) => asContent(await kya.attest_agent(args as { agent_ref: AgentRef })),
  );
  server.tool(
    "verify_attestation",
    "Mock KYA verifier.",
    { proof: z.string(), public_inputs: z.array(z.string()) },
    async (args) =>
      asContent(
        await kya.verify_attestation(
          args as { proof: `0x${string}`; public_inputs: readonly string[] },
        ),
      ),
  );

  return server;
}

export function createMockApp(
  options: { attestationMode?: AttestationMode } = {},
): express.Express {
  const treasury = new TreasuryMockService();
  const kya = new KyaMockService(options.attestationMode);
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = buildServer(treasury, kya);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[mocks] mcp request failed:", (err as Error).message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "internal error" },
          id: null,
        });
      }
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "constellation-mocks", tools: 9 });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.MOCK_MODE !== "1") {
    throw new Error("packages/mocks only starts when MOCK_MODE=1");
  }
  const port = Number(process.env.PORT ?? "4040");
  const app = createMockApp({
    attestationMode: (process.env.MOCK_ZK_MODE as AttestationMode | undefined) ?? "mixed",
  });
  app.listen(port, () => {
    console.log(`constellation-mocks listening on http://localhost:${port}`);
  });
}
