export const DEFAULT_TREASURY_MCP_URL = "https://constellationokx.fly.dev/mcp";

export type McpSuccess<T> = {
  kind: "success";
  data: T;
  httpStatus: number;
};

export type McpPaymentRequired = {
  kind: "payment_required";
  message: string;
  payment: unknown;
  httpStatus: number;
};

export type McpCallResult<T> = McpSuccess<T> | McpPaymentRequired;

type JsonRpcEnvelope = {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
  };
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type ToolError = {
  error?: {
    code?: string;
    message?: string;
    payment?: unknown;
  };
};

/**
 * Call Treasury through the same-origin route. The route keeps the configurable
 * Fly target server-side so browser CORS policy cannot hide a genuine response.
 */
export async function callTreasuryTool<T>(
  tool: string,
  args: Record<string, unknown>,
): Promise<McpCallResult<T>> {
  const response = await fetch("/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });

  const rawBody = await response.text();
  const envelope = parseEnvelope(rawBody);
  const headerChallenge = decodePaymentRequired(response.headers.get("PAYMENT-REQUIRED"));

  if (response.status === 402) {
    return {
      kind: "payment_required",
      message: envelope.error?.message ?? `payment required for "${tool}"`,
      payment: headerChallenge ?? envelope.error?.data ?? null,
      httpStatus: response.status,
    };
  }

  if (!response.ok) {
    throw new Error(
      envelope.error?.message ?? `Treasury MCP returned HTTP ${response.status}`,
    );
  }

  const text = envelope.result?.content?.find(
    (item) => item.type === "text" && typeof item.text === "string",
  )?.text;
  if (text === undefined) {
    throw new Error("Treasury MCP response did not contain a text tool result");
  }

  let toolResult: T & ToolError;
  try {
    toolResult = JSON.parse(text) as T & ToolError;
  } catch {
    throw new Error("Treasury MCP tool result was not valid JSON");
  }

  if (toolResult.error?.code === "PAYMENT_REQUIRED" || toolResult.error?.payment !== undefined) {
    return {
      kind: "payment_required",
      message: toolResult.error.message ?? `payment required for "${tool}"`,
      payment: toolResult.error.payment ?? headerChallenge ?? null,
      httpStatus: response.status,
    };
  }

  return { kind: "success", data: toolResult, httpStatus: response.status };
}

function parseEnvelope(rawBody: string): JsonRpcEnvelope {
  const dataLines = rawBody
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  const encoded = dataLines.length > 0 ? dataLines.join("\n") : rawBody.trim();
  if (encoded.length === 0) throw new Error("Treasury MCP returned an empty response");

  try {
    return JSON.parse(encoded) as JsonRpcEnvelope;
  } catch {
    throw new Error("Treasury MCP returned malformed SSE/JSON");
  }
}

function decodePaymentRequired(value: string | null): unknown {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    // Decode as UTF-8 (atob yields a binary string; multibyte chars like the ₮ in
    // "USD₮0" would otherwise mojibake). Reinterpret the bytes through TextDecoder.
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { raw_header: value, decode_error: "PAYMENT-REQUIRED was not valid base64 JSON" };
  }
}

function requestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dashboard-${Date.now()}`;
}
