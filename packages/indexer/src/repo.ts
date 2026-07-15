import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { query } from "./db.js";
import type { GasRow, TransferRow } from "./types.js";

// ---- Wallets ---------------------------------------------------------------

export interface WalletRow {
  id: string;
  address: string;
  chainId: number;
  indexedFromBlock: number;
  lastIndexedBlock: number;
}

function walletIdFor(address: string): string {
  return `w_${address.toLowerCase().slice(2, 14)}`;
}

/** Idempotent: registering an already-known wallet returns the existing row. */
export async function registerWallet(
  address: string,
  chainId: number,
  fromBlock: number,
): Promise<WalletRow> {
  const checksummed = getAddress(address);
  const id = walletIdFor(checksummed);
  const rows = await query<{
    id: string;
    address: string;
    chain_id: number;
    indexed_from_block: string;
    last_indexed_block: string;
  }>(
    `INSERT INTO wallets (id, address, chain_id, indexed_from_block)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address
     RETURNING id, address, chain_id, indexed_from_block, last_indexed_block`,
    [id, checksummed, chainId, fromBlock],
  );
  const r = rows[0]!;
  return {
    id: r.id,
    address: r.address,
    chainId: r.chain_id,
    indexedFromBlock: Number(r.indexed_from_block),
    lastIndexedBlock: Number(r.last_indexed_block),
  };
}

export async function getWalletById(id: string): Promise<WalletRow | null> {
  const rows = await query<{
    id: string;
    address: string;
    chain_id: number;
    indexed_from_block: string;
    last_indexed_block: string;
  }>(
    `SELECT id, address, chain_id, indexed_from_block, last_indexed_block
     FROM wallets WHERE id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    address: r.address,
    chainId: r.chain_id,
    indexedFromBlock: Number(r.indexed_from_block),
    lastIndexedBlock: Number(r.last_indexed_block),
  };
}

export async function setLastIndexedBlock(walletId: string, block: number): Promise<void> {
  await query(`UPDATE wallets SET last_indexed_block = $2 WHERE id = $1`, [walletId, block]);
}

// ---- Writes from the scanner ----------------------------------------------

export async function insertTransfer(t: TransferRow): Promise<void> {
  await query(
    `INSERT INTO transfers
       (wallet_id, tx_hash, log_index, block_number, block_time, token, token_address,
        decimals, from_address, to_address, amount, direction, counterparty)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (wallet_id, tx_hash, log_index) DO NOTHING`,
    [
      t.walletId, t.txHash, t.logIndex, t.blockNumber, t.blockTime, t.token, t.tokenAddress,
      t.decimals, t.from, t.to, t.amount, t.direction, t.counterparty,
    ],
  );
}

export async function insertGas(g: GasRow): Promise<void> {
  await query(
    `INSERT INTO gas_spend
       (wallet_id, tx_hash, block_number, block_time, gas_used, gas_price, gas_cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (wallet_id, tx_hash) DO NOTHING`,
    [g.walletId, g.txHash, g.blockNumber, g.blockTime, g.gasUsed, g.gasPrice, g.gasCost],
  );
}

export async function insertBalanceSnapshot(
  walletId: string,
  blockNumber: number,
  blockTime: string,
  okbBalanceWei: string,
): Promise<void> {
  await query(
    `INSERT INTO balance_snapshots (wallet_id, block_number, block_time, okb_balance)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (wallet_id, block_number) DO NOTHING`,
    [walletId, blockNumber, blockTime, okbBalanceWei],
  );
}

// ---- Reads for the Treasury reports ---------------------------------------

export async function getTransfers(walletId: string): Promise<TransferRow[]> {
  const rows = await query<{
    wallet_id: string; tx_hash: string; log_index: number; block_number: string;
    block_time: Date; token: string; token_address: string; decimals: number;
    from_address: string; to_address: string; amount: string; direction: "in" | "out";
    counterparty: string;
  }>(
    `SELECT wallet_id, tx_hash, log_index, block_number, block_time, token, token_address,
            decimals, from_address, to_address, amount, direction, counterparty
     FROM transfers WHERE wallet_id = $1 ORDER BY block_number, log_index`,
    [walletId],
  );
  return rows.map((r) => ({
    walletId: r.wallet_id,
    txHash: r.tx_hash,
    logIndex: r.log_index,
    blockNumber: Number(r.block_number),
    blockTime: r.block_time.toISOString(),
    token: r.token,
    tokenAddress: r.token_address,
    decimals: r.decimals,
    from: r.from_address,
    to: r.to_address,
    amount: r.amount,
    direction: r.direction,
    counterparty: r.counterparty,
  }));
}

export async function getGas(walletId: string): Promise<GasRow[]> {
  const rows = await query<{
    wallet_id: string; tx_hash: string; block_number: string; block_time: Date;
    gas_used: string; gas_price: string; gas_cost: string;
  }>(
    `SELECT wallet_id, tx_hash, block_number, block_time, gas_used, gas_price, gas_cost
     FROM gas_spend WHERE wallet_id = $1 ORDER BY block_number`,
    [walletId],
  );
  return rows.map((r) => ({
    walletId: r.wallet_id,
    txHash: r.tx_hash,
    blockNumber: Number(r.block_number),
    blockTime: r.block_time.toISOString(),
    gasUsed: r.gas_used,
    gasPrice: r.gas_price,
    gasCost: r.gas_cost,
  }));
}

export async function getLatestOkbBalance(walletId: string): Promise<string | null> {
  const rows = await query<{ okb_balance: string }>(
    `SELECT okb_balance FROM balance_snapshots
     WHERE wallet_id = $1 ORDER BY block_number DESC LIMIT 1`,
    [walletId],
  );
  return rows[0]?.okb_balance ?? null;
}

export async function getLabels(): Promise<Map<string, string>> {
  const rows = await query<{ address: string; label: string }>(
    `SELECT address, label FROM counterparty_tags`,
  );
  return new Map(rows.map((r) => [r.address.toLowerCase(), r.label]));
}

// ---- register_wallet nonce flow -------------------------------------------

/**
 * Issue a challenge nonce. Returns the nonce string; the consumer builds the
 * EIP-191 message from (address, nonce) and reconstructs it identically at
 * verify time, so the expiry need not appear in the message. Returning a bare
 * string keeps the consumer contract in apps/treasury/deps.ts (Ledger) stable.
 */
export async function issueNonce(address: string, ttlSeconds: number): Promise<string> {
  const nonce = `0x${randomBytes(16).toString("hex")}`;
  await query(
    `INSERT INTO register_nonces (nonce, address, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
    [nonce, getAddress(address), String(ttlSeconds)],
  );
  return nonce;
}

export type NonceCheck =
  | { ok: true }
  | { ok: false; reason: "NONCE_EXPIRED" };

/**
 * Atomically consume a nonce for `address`. Returns NONCE_EXPIRED for any nonce
 * that is missing, already used, bound to a different address, or past its TTL —
 * the caller must not distinguish these to a client (avoid an oracle).
 */
export async function consumeNonce(nonce: string, address: string): Promise<NonceCheck> {
  const rows = await query<{ nonce: string }>(
    `UPDATE register_nonces SET used = true
     WHERE nonce = $1 AND address = $2 AND used = false AND expires_at > now()
     RETURNING nonce`,
    [nonce, getAddress(address)],
  );
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "NONCE_EXPIRED" };
}

// ── Durable settlement receipts (x402 sdk-mode idempotency) ──────────────────

export interface SettlementRow {
  status: "pending" | "settled" | "failed";
  transaction?: string;
  payer?: string;
}

/**
 * Atomically claim `nonceKey`. Inserts a fresh `pending` row and returns null
 * when THIS caller won the reservation; on conflict (another request/machine got
 * there first) returns the existing row so the caller recovers instead of
 * re-settling. This single INSERT ... ON CONFLICT is the cross-machine guard.
 */
export async function reserveSettlement(nonceKey: string): Promise<SettlementRow | null> {
  const inserted = await query<{ nonce_key: string }>(
    `INSERT INTO payment_receipts (nonce_key, status)
     VALUES ($1, 'pending')
     ON CONFLICT (nonce_key) DO NOTHING
     RETURNING nonce_key`,
    [nonceKey],
  );
  if (inserted.length > 0) return null; // we won the reservation
  return getSettlement(nonceKey);
}

export async function updateSettlement(nonceKey: string, row: SettlementRow): Promise<void> {
  // Monotonic: `settled` is terminal. The WHERE guard blocks a late/slow poll
  // from overwriting a settled record back to pending/failed while still allowing
  // pending -> settled/failed. The tx hash is also never cleared once set.
  await query(
    `INSERT INTO payment_receipts (nonce_key, status, transaction, payer)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nonce_key)
     DO UPDATE SET status = EXCLUDED.status,
                   transaction = COALESCE(EXCLUDED.transaction, payment_receipts.transaction),
                   payer = COALESCE(EXCLUDED.payer, payment_receipts.payer),
                   updated_at = now()
     WHERE payment_receipts.status <> 'settled'`,
    [nonceKey, row.status, row.transaction ?? null, row.payer ?? null],
  );
}

export async function getSettlement(nonceKey: string): Promise<SettlementRow | null> {
  const rows = await query<{ status: SettlementRow["status"]; transaction: string | null; payer: string | null }>(
    `SELECT status, transaction, payer FROM payment_receipts WHERE nonce_key = $1`,
    [nonceKey],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    status: r.status,
    transaction: r.transaction ?? undefined,
    payer: r.payer ?? undefined,
  };
}
