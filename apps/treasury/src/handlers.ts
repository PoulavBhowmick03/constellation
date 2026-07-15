import {
  computeExpenseReport,
  computeRevenueReport,
  computeRunway,
  exportStatement,
  type Period,
  type StatementFormat,
} from "@constellation/indexer";
import type { PaymentContext } from "@constellation/payment-adapter";
import { getAddress, isAddress, verifyMessage } from "viem";
import type { TreasuryDeps } from "./deps.js";

// Error envelope used by every tool. INTERFACES.md names the codes
// (BAD_SIGNATURE, NONCE_EXPIRED) but not the envelope; this shape is our
// proposal, recorded in docs/status/P1.md for sign-off.
export type ToolError = {
  error: {
    code:
      | "BAD_SIGNATURE"
      | "NONCE_EXPIRED"
      | "BAD_REQUEST"
      | "WALLET_NOT_FOUND"
      | "PAYMENT_REQUIRED";
    message: string;
    /** For PAYMENT_REQUIRED: price + how to pay (mirrors HTTP 402 / x402). */
    payment?: unknown;
  };
};

export function isToolError(v: unknown): v is ToolError {
  return typeof v === "object" && v !== null && "error" in v;
}

/** The exact EIP-191 message a wallet owner signs. Returned in the challenge. */
export function challengeMessage(address: string, nonce: string): string {
  return `Constellation Treasury Copilot\nRegister wallet: ${getAddress(address)}\nNonce: ${nonce}`;
}

export interface RegisterChallenge {
  challenge: {
    nonce: string;
    /** Sign exactly this string with personal_sign (EIP-191). */
    message: string;
    expires_in_seconds: number;
  };
}

export interface RegisterOk {
  ok: true;
  wallet_id: string;
  indexed_from_block: number;
}

export function createHandlers(deps: TreasuryDeps) {
  const { ledger, payments } = deps;

  /** Gate a paid tool. Returns null when the call may proceed. */
  async function gate(tool: string, ctx: PaymentContext): Promise<ToolError | null> {
    const res = (ctx as any).preflightResult ?? await payments.requirePayment(tool, ctx);
    if (res.status === "paid") {
      // Real settlement (sdk mode) produces a base64 PAYMENT-RESPONSE receipt.
      // Hand it to the transport via the caller's sink so it reaches the payer
      // without contaminating the tool's domain result. Mock mode has none.
      if (res.paymentResponse && ctx.settlement) {
        ctx.settlement.paymentResponse = res.paymentResponse;
      }
      return null;
    }
    return {
      error: {
        code: "PAYMENT_REQUIRED",
        message: `payment required for "${tool}"`,
        payment: { price: res.price, ...res.challenge },
      },
    };
  }

  async function loadWallet(walletId: string) {
    const wallet = await ledger.getWalletById(walletId);
    if (!wallet) {
      // Also covers unproven wallets: a wallet_id only exists after a valid
      // EIP-191 registration, so "not found" and "not proven" are the same.
      return null;
    }
    return wallet;
  }

  return {
    /**
     * Two-phase, single tool (INTERFACES.md lists exactly five tools, so the
     * challenge is issued by this same tool):
     *  1. call with { address } → server-issued nonce + message to sign
     *  2. call with { address, nonce, signature } → registered
     */
    async register_wallet(args: {
      address: string;
      nonce?: string;
      signature?: string;
    }): Promise<RegisterChallenge | RegisterOk | ToolError> {
      if (!isAddress(args.address)) {
        return { error: { code: "BAD_REQUEST", message: "address is not a valid 0x address" } };
      }
      const address = getAddress(args.address);

      if (!args.nonce || !args.signature) {
        const nonce = await ledger.issueNonce(address, deps.nonceTtlSeconds);
        return {
          challenge: {
            nonce,
            message: challengeMessage(address, nonce),
            expires_in_seconds: deps.nonceTtlSeconds,
          },
        };
      }

      // Consume before verifying: a nonce is burned by any attempt, so a bad
      // signature can't be retried against the same challenge.
      const nonceCheck = await ledger.consumeNonce(args.nonce, address);
      if (!nonceCheck.ok) {
        return {
          error: { code: "NONCE_EXPIRED", message: "nonce is expired, used, or unknown" },
        };
      }

      let valid = false;
      try {
        valid = await verifyMessage({
          address,
          message: challengeMessage(address, args.nonce),
          signature: args.signature as `0x${string}`,
        });
      } catch {
        valid = false;
      }
      if (!valid) {
        return {
          error: {
            code: "BAD_SIGNATURE",
            message: "signature does not recover to the claimed address (request a new challenge)",
          },
        };
      }

      const wallet = await ledger.registerWallet(address, deps.chainId, deps.startBlock);
      return { ok: true, wallet_id: wallet.id, indexed_from_block: wallet.indexedFromBlock };
    },

    /** Free — the hook. */
    async get_runway(args: { wallet_id: string }) {
      const wallet = await loadWallet(args.wallet_id);
      if (!wallet) {
        return {
          error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${args.wallet_id}"` },
        } satisfies ToolError;
      }
      const [balance, gas] = await Promise.all([
        ledger.getLatestOkbBalance(wallet.id),
        ledger.getGas(wallet.id),
      ]);
      // No snapshot yet (indexer hasn't reached this wallet): report a zero
      // balance rather than inventing one; runway will be 0/null accordingly.
      return computeRunway(balance ?? "0", gas, deps.now?.() ?? new Date());
    },

    /** Paid, 0.10 USDT. */
    async get_revenue_report(
      args: { wallet_id: string; period: Period },
      ctx: PaymentContext = {},
    ) {
      const denied = await gate("get_revenue_report", ctx);
      if (denied) return denied;
      const wallet = await loadWallet(args.wallet_id);
      if (!wallet) {
        return {
          error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${args.wallet_id}"` },
        } satisfies ToolError;
      }
      const [transfers, labels] = await Promise.all([
        ledger.getTransfers(wallet.id),
        ledger.getLabels(),
      ]);
      return computeRevenueReport(transfers, args.period ?? {}, labels);
    },

    /** Paid, 0.10 USDT. Revenue shape + gas block. */
    async get_expense_report(
      args: { wallet_id: string; period: Period },
      ctx: PaymentContext = {},
    ) {
      const denied = await gate("get_expense_report", ctx);
      if (denied) return denied;
      const wallet = await loadWallet(args.wallet_id);
      if (!wallet) {
        return {
          error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${args.wallet_id}"` },
        } satisfies ToolError;
      }
      const [transfers, gas, labels] = await Promise.all([
        ledger.getTransfers(wallet.id),
        ledger.getGas(wallet.id),
        ledger.getLabels(),
      ]);
      return computeExpenseReport(transfers, gas, args.period ?? {}, labels);
    },

    /** Paid, 0.20 USDT. */
    async export_statement(
      args: { wallet_id: string; period: Period; format: StatementFormat },
      ctx: PaymentContext = {},
    ) {
      const denied = await gate("export_statement", ctx);
      if (denied) return denied;
      if (!["csv", "json", "md"].includes(args.format)) {
        return {
          error: { code: "BAD_REQUEST", message: `format must be csv | json | md` },
        } satisfies ToolError;
      }
      const wallet = await loadWallet(args.wallet_id);
      if (!wallet) {
        return {
          error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${args.wallet_id}"` },
        } satisfies ToolError;
      }
      const [transfers, gas] = await Promise.all([
        ledger.getTransfers(wallet.id),
        ledger.getGas(wallet.id),
      ]);
      return exportStatement(transfers, gas, args.period ?? {}, args.format);
    },
  };
}

export type TreasuryHandlers = ReturnType<typeof createHandlers>;
