import { DEFAULT_TREASURY_MCP_URL } from "../../mcpClient";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const target = process.env.NEXT_PUBLIC_TREASURY_MCP_URL ?? DEFAULT_TREASURY_MCP_URL;
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return Response.json(
      { error: "NEXT_PUBLIC_TREASURY_MCP_URL is not a valid URL" },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: await request.text(),
      cache: "no-store",
    });

    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    });
    for (const name of ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Treasury MCP proxy failed",
        },
      },
      { status: 502 },
    );
  }
}
