import {
  computeExpenseReport,
  computeRevenueReport,
  computeRunway,
  exportStatement,
  type Period,
  type StatementFormat,
} from "@constellation/indexer";
import { getAddress, isAddress, verifyMessage } from "viem";
import { walletGas, walletLabels, walletTransfers, walletWithHistory } from "./fixtures.js";
import type {
  MockWalletFixture,
  RegisterChallenge,
  RegisterOk,
  ToolError,
} from "./types.js";

const NONCE_TTL_SECONDS = 600;

export function challengeMessage(address: string, nonce: string): string {
  return `Constellation Treasury Copilot\nRegister wallet: ${getAddress(address)}\nNonce: ${nonce}`;
}

interface NonceRecord {
  readonly address: `0x${string}`;
  readonly expiresAt: number;
}

export class TreasuryMockService {
  private readonly nonces = new Map<string, NonceRecord>();

  constructor(
    private readonly fixture: MockWalletFixture = walletWithHistory,
    private readonly now: () => number = () => Date.parse("2026-07-15T12:00:00.000Z"),
  ) {}

  private badRequest(message: string): ToolError {
    return { error: { code: "BAD_REQUEST", message } };
  }

  private walletNotFound(walletId: string): ToolError {
    return { error: { code: "WALLET_NOT_FOUND", message: `unknown wallet_id "${walletId}"` } };
  }

  private issueNonce(address: `0x${string}`): RegisterChallenge {
    const nonce = `nonce_${this.now().toString(36)}_${address.slice(2, 8)}`;
    this.nonces.set(nonce, {
      address,
      expiresAt: this.now() + NONCE_TTL_SECONDS * 1_000,
    });
    return {
      challenge: {
        nonce,
        message: challengeMessage(address, nonce),
        expires_in_seconds: NONCE_TTL_SECONDS,
      },
    };
  }

  async register_wallet(args: {
    address: string;
    nonce?: string;
    signature?: string;
  }): Promise<RegisterChallenge | RegisterOk | ToolError> {
    if (!isAddress(args.address)) {
      return this.badRequest("address is not a valid 0x address");
    }

    const address = getAddress(args.address);
    if (!args.nonce || !args.signature) {
      return this.issueNonce(address);
    }

    const nonceRecord = this.nonces.get(args.nonce);
    this.nonces.delete(args.nonce);
    if (
      nonceRecord === undefined ||
      nonceRecord.address !== address ||
      nonceRecord.expiresAt < this.now()
    ) {
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

    if (address !== this.fixture.address) {
      return this.walletNotFound("unseeded_wallet");
    }

    return {
      ok: true,
      wallet_id: this.fixture.wallet_id,
      indexed_from_block: this.fixture.indexed_from_block,
    };
  }

  async get_runway(args: { wallet_id: string }) {
    if (args.wallet_id !== this.fixture.wallet_id) {
      return this.walletNotFound(args.wallet_id);
    }

    return computeRunway(this.fixture.okb_balance.amount, [...walletGas], new Date(this.now()));
  }

  async get_revenue_report(args: { wallet_id: string; period: Period }) {
    if (args.wallet_id !== this.fixture.wallet_id) {
      return this.walletNotFound(args.wallet_id);
    }
    return computeRevenueReport([...walletTransfers], args.period ?? {}, walletLabels);
  }

  async get_expense_report(args: { wallet_id: string; period: Period }) {
    if (args.wallet_id !== this.fixture.wallet_id) {
      return this.walletNotFound(args.wallet_id);
    }
    return computeExpenseReport(
      [...walletTransfers],
      [...walletGas],
      args.period ?? {},
      walletLabels,
    );
  }

  async export_statement(args: {
    wallet_id: string;
    period: Period;
    format: StatementFormat;
  }) {
    if (args.wallet_id !== this.fixture.wallet_id) {
      return this.walletNotFound(args.wallet_id);
    }
    return exportStatement([...walletTransfers], [...walletGas], args.period ?? {}, args.format);
  }
}
