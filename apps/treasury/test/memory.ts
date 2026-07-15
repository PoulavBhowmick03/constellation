import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import type { GasRow, NonceCheck, TransferRow, WalletRow } from "@constellation/indexer";
import type { Ledger } from "../src/deps.js";

/**
 * In-memory Ledger used by the handler tests (no Postgres). Mirrors the
 * semantics of packages/indexer/src/repo.ts, including single-use nonces and
 * idempotent registration. Clock injectable to test nonce expiry.
 */
export class MemoryLedger implements Ledger {
  wallets = new Map<string, WalletRow>();
  transfers: TransferRow[] = [];
  gas: GasRow[] = [];
  balances = new Map<string, string>();
  labels = new Map<string, string>();
  private nonces = new Map<string, { address: string; expiresAt: number; used: boolean }>();

  constructor(private readonly now: () => number = Date.now) {}

  async registerWallet(address: string, chainId: number, fromBlock: number): Promise<WalletRow> {
    const checksummed = getAddress(address);
    const id = `w_${checksummed.toLowerCase().slice(2, 14)}`;
    const existing = this.wallets.get(id);
    if (existing) return existing;
    const row: WalletRow = {
      id,
      address: checksummed,
      chainId,
      indexedFromBlock: fromBlock,
      lastIndexedBlock: 0,
    };
    this.wallets.set(id, row);
    return row;
  }

  async getWalletById(id: string): Promise<WalletRow | null> {
    return this.wallets.get(id) ?? null;
  }

  async getTransfers(walletId: string): Promise<TransferRow[]> {
    return this.transfers.filter((t) => t.walletId === walletId);
  }

  async getGas(walletId: string): Promise<GasRow[]> {
    return this.gas.filter((g) => g.walletId === walletId);
  }

  async getLatestOkbBalance(walletId: string): Promise<string | null> {
    return this.balances.get(walletId) ?? null;
  }

  async getLabels(): Promise<Map<string, string>> {
    return this.labels;
  }

  async issueNonce(address: string, ttlSeconds: number): Promise<string> {
    const nonce = `0x${randomBytes(16).toString("hex")}`;
    this.nonces.set(nonce, {
      address: getAddress(address),
      expiresAt: this.now() + ttlSeconds * 1000,
      used: false,
    });
    return nonce;
  }

  async consumeNonce(nonce: string, address: string): Promise<NonceCheck> {
    const rec = this.nonces.get(nonce);
    if (!rec || rec.used || rec.address !== getAddress(address) || rec.expiresAt <= this.now()) {
      return { ok: false, reason: "NONCE_EXPIRED" };
    }
    rec.used = true;
    return { ok: true };
  }
}
