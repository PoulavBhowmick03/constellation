import type { ToolDescriptor } from "@constellation/payment-adapter";

/**
 * What each paid tool advertises in its 402 challenge.
 *
 * Two audiences, both required:
 *  - `description` is prose read by a buying agent (the OKX marketplace is
 *    LLM-driven; its own service listings declare arguments in prose).
 *  - `input` is the machine-readable declaration, surfaced under the challenge's
 *    top-level `extensions.bazaar`.
 *
 * Without this a buyer has no way to learn that `wallet_id` is required and
 * belongs in the JSON body, so its first paid replay fails on a missing arg.
 */
const walletIdProp = {
  type: "string",
  description: "Registered wallet id from register_wallet (e.g. w_1b3f5ecf3694). Optional — defaults to the paying wallet.",
} as const;

const periodProp = {
  type: "object",
  description: "Optional reporting window; ISO dates. Example: {\"from\":\"2026-07-01\",\"to\":\"2026-07-31\"}",
} as const;

export const TOOL_DESCRIPTORS: Record<string, ToolDescriptor> = {
  get_revenue_report: {
    description:
      "Incoming USDT/USDG totals for a period, ranked by counterparty. " +
      "POST a JSON body; wallet_id defaults to the paying wallet if omitted. " +
      'Example: {"wallet_id":"w_1b3f5ecf3694"}',
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: {
        type: "object",
        properties: { wallet_id: walletIdProp, period: periodProp },
        required: [],
      },
    },
  },
  get_expense_report: {
    description:
      "Outgoing USDT/USDG totals plus gas spend for a period, ranked by counterparty. " +
      "POST a JSON body; wallet_id defaults to the paying wallet if omitted. " +
      'Example: {"wallet_id":"w_1b3f5ecf3694"}',
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: {
        type: "object",
        properties: { wallet_id: walletIdProp, period: periodProp },
        required: [],
      },
    },
  },
  export_statement: {
    description:
      "Exportable treasury statement for a period. POST a JSON body; " +
      "format is csv | json | md (defaults to json), wallet_id defaults to the paying wallet. " +
      'Example: {"wallet_id":"w_1b3f5ecf3694","format":"csv"}',
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: {
        type: "object",
        properties: {
          wallet_id: walletIdProp,
          period: periodProp,
          format: {
            type: "string",
            description: "csv | json | md. Defaults to json when omitted.",
          },
        },
        required: [],
      },
    },
  },
};
