import type { GasRow, NonceCheck, TransferRow, WalletRow } from "@constellation/indexer";
import type { PaymentAdapter } from "@constellation/payment-adapter";

/**
 * Everything the tool handlers need from the outside world, injectable so the
 * whole tool surface is unit-testable without Postgres or a chain. The shape
 * deliberately mirrors @constellation/indexer's repo exports one-to-one; the
 * production wiring (see index.ts) passes those functions straight through.
 */
export interface Ledger {
  registerWallet(address: string, chainId: number, fromBlock: number): Promise<WalletRow>;
  getWalletById(id: string): Promise<WalletRow | null>;
  getTransfers(walletId: string): Promise<TransferRow[]>;
  getGas(walletId: string): Promise<GasRow[]>;
  getLatestOkbBalance(walletId: string): Promise<string | null>;
  getLabels(): Promise<Map<string, string>>;
  issueNonce(address: string, ttlSeconds: number): Promise<string>;
  consumeNonce(nonce: string, address: string): Promise<NonceCheck>;
}

export interface TreasuryDeps {
  ledger: Ledger;
  payments: PaymentAdapter;
  chainId: number;
  /** Block a newly registered wallet is indexed from. */
  startBlock: number;
  nonceTtlSeconds: number;
  /** Injectable clock for tests. */
  now?: () => Date;
}
