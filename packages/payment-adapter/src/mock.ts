import { lteMoney } from "./money.js";
import type {
  Money,
  PaymentAdapter,
  PaymentContext,
  PayAndCallResult,
  PriceTable,
  ProcurementReceipt,
  RequirePaymentResult,
} from "./types.js";

/** Header a caller sets to satisfy the mock's inbound charge (documented, not secret). */
export const MOCK_PAYMENT_HEADER = "x-mock-payment";

export interface MockAdapterConfig {
  prices: PriceTable;
  /**
   * Cost the mock charges for an outbound payAndCall. Defaults to 0 (no real
   * charge — consistent with the wash-trading rule: the mock never simulates
   * paying ourselves real money). Tests raise this to exercise budget caps.
   */
  outboundMockCost?: Money;
  /** Deterministic id source for tests; defaults to a random-ish counter. */
  now?: () => number;
}

/**
 * In-memory payment adapter used until the OKX Payment SDK is wired. It is the
 * ONLY implementation available today; `createPaymentAdapter` selects it while
 * PAYMENT_MODE !== "sdk". No network, no keys, no SDK import.
 */
export class MockPaymentAdapter implements PaymentAdapter {
  private readonly prices: PriceTable;
  private readonly outboundMockCost?: Money;
  private readonly now: () => number;
  private seq = 0;

  constructor(config: MockAdapterConfig) {
    this.prices = config.prices;
    this.outboundMockCost = config.outboundMockCost;
    this.now = config.now ?? Date.now;
  }

  private receiptId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.now().toString(36)}_${this.seq}`;
  }

  private isSatisfied(tool: string, ctx: PaymentContext): boolean {
    if (ctx.paymentProof && ctx.paymentProof.length > 0) return true;
    const header = ctx.headers?.[MOCK_PAYMENT_HEADER];
    // Accept either the exact tool name or the wildcard "any".
    return header === tool || header === "any";
  }

  async requirePayment(tool: string, ctx: PaymentContext): Promise<RequirePaymentResult> {
    if (!(tool in this.prices)) {
      return {
        status: "payment_required",
        price: null,
        challenge: {
          reason: `no price configured for tool "${tool}"`,
          accepts: "none — misconfiguration, refuse the call",
        },
      };
    }

    const price = this.prices[tool] ?? null;
    if (price === null) {
      // Free tool.
      return { status: "paid", price: null, receiptId: this.receiptId("free") };
    }

    if (this.isSatisfied(tool, ctx)) {
      return { status: "paid", price, receiptId: this.receiptId("mock") };
    }

    return {
      status: "payment_required",
      price,
      challenge: {
        reason: `payment required for "${tool}"`,
        accepts: `mock: header "${MOCK_PAYMENT_HEADER}: ${tool}" (or "any"), or a non-empty paymentProof`,
      },
    };
  }

  async payAndCall<T>(
    endpoint: string,
    tool: string,
    args: unknown,
    budgetCap: Money,
  ): Promise<PayAndCallResult<T>> {
    const cost: Money =
      this.outboundMockCost ?? { token: budgetCap.token, amount: "0", decimals: budgetCap.decimals };

    if (!lteMoney(cost, budgetCap)) {
      return {
        ok: false,
        error: {
          code: "BUDGET_EXCEEDED",
          message: `mock cost ${cost.amount} ${cost.token} exceeds budget cap ${budgetCap.amount} ${budgetCap.token}`,
        },
      };
    }

    const receipt: ProcurementReceipt = {
      id: this.receiptId("out"),
      endpoint,
      tool,
      cost,
      status: "paid",
    };
    // Mock invocation: echo the args back as the "result". Real SDK will call
    // the endpoint. Cast is unavoidable at this boundary — the mock has no way
    // to produce a real T.
    return { ok: true, result: { echo: args } as unknown as T, receipt };
  }
}
