// Shared payment types. Kept SDK-agnostic on purpose: no import here may pull in
// a real payment SDK, so downstream packages can depend on these types without
// ever transitively importing the SDK (the isolation rule).

/** An amount in token base units, per INTERFACES.md conventions. */
export interface Money {
  token: string;
  /** base units as a decimal string (never a JS number — avoids precision loss) */
  amount: string;
  decimals: number;
}

/** Everything an inbound paid tool call carries that could satisfy payment. */
export interface PaymentContext {
  /** Opaque payment proof / x402 authorization the caller presented, if any. */
  paymentProof?: string;
  /** Raw request headers (e.g. an x402 / mock-payment header). */
  headers?: Record<string, string | undefined>;
  /** Wallet the call is being made on behalf of, if known. */
  callerWallet?: string;
  /**
   * Overrides the x402 challenge's resource URL (and the settle-time resource
   * binding) for this request. The MCP surface leaves it unset (mcp://tool/<t>);
   * the plain-HTTP service routes set their public https URL, matching the shape
   * OKX's listing validator expects (`resource.url: https://<endpoint>`).
   */
  resourceUrl?: string;
  /**
   * Output channel for the x402 settlement receipt. When a caller supplies this
   * object, a tool that settles a real payment writes the base64 PAYMENT-RESPONSE
   * carrier into it, so the transport can echo it back to the payer WITHOUT
   * polluting the tool's domain result. Left undefined by callers that don't care
   * (tests, the mock path). See handlers.gate + server.asContent in apps/treasury.
   */
  settlement?: { paymentResponse?: string };
}

export type RequirePaymentStatus = "paid" | "payment_required";

/** Result of gating an inbound paid tool. `payment_required` mirrors HTTP 402. */
export interface RequirePaymentResult {
  status: RequirePaymentStatus;
  /** Price for this tool. `null` means the tool is free. */
  price: Money | null;
  /** Present when status === "paid": a settlement receipt id for logging. */
  receiptId?: string;
  /** Base64 x402 settlement receipt for the transport's PAYMENT-RESPONSE carrier. */
  paymentResponse?: string;
  /** Present when status === "payment_required": why, plus how to pay. */
  challenge?: {
    reason: string;
    /** Standard x402 PaymentRequired error field; mirrors reason. */
    error?: string;
    /** Mock documentation or the real x402 accepts array. */
    accepts: string | Array<Record<string, unknown>>;
    /** Present for real x402 challenges so MCP buyers can detect the protocol. */
    x402Version?: 2;
    resource?: Record<string, unknown>;
  };
}

/** Receipt for an outbound paid call we made to someone else's tool. */
export interface ProcurementReceipt {
  id: string;
  endpoint: string;
  tool: string;
  cost: Money;
  status: "paid";
}

export type PayAndCallResult<T> =
  | { ok: true; result: T; receipt: ProcurementReceipt }
  | { ok: false; error: { code: PaymentErrorCode; message: string } };

export type PaymentErrorCode =
  | "PAYMENT_REQUIRED"
  | "BUDGET_EXCEEDED"
  | "PRICE_UNKNOWN"
  | "NOT_IMPLEMENTED";

/**
 * The adapter boundary. `requirePayment` gates our own paid tools (inbound);
 * `payAndCall` pays for and invokes someone else's paid tool (outbound).
 */
export interface PaymentAdapter {
  requirePayment(tool: string, ctx: PaymentContext): Promise<RequirePaymentResult>;
  payAndCall<T>(
    endpoint: string,
    tool: string,
    args: unknown,
    budgetCap: Money,
  ): Promise<PayAndCallResult<T>>;
}

/** Price table: tool name → price, or `null` for a free tool. */
export type PriceTable = Record<string, Money | null>;
