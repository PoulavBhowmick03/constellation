import { getAddress, parseAbiItem, type Log, type PublicClient } from "viem";
import {
  INDEXER_MAX_RANGE_PER_CALL,
  trackedTokens,
  XLAYER_CHAIN_ID,
  type TrackedToken,
} from "./config.js";
import {
  getWalletById,
  insertBalanceSnapshot,
  insertGas,
  insertTransfer,
  setLastIndexedBlock,
  type WalletRow,
} from "./repo.js";

const ERC20_TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

// X Layer's public RPC throttles aggressively ("over rate limit") on top of its
// 100-block getLogs cap. A backfill spanning tens of thousands of blocks issues
// hundreds of chunked calls, so we pace them and retry transient throttling with
// exponential backoff. Tunable via env so a paid/dedicated RPC can go faster.
const RPC_CALL_DELAY_MS = Number(process.env.INDEXER_RPC_DELAY_MS ?? "120");
const RPC_MAX_RETRIES = Number(process.env.INDEXER_RPC_MAX_RETRIES ?? "6");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// A throttling error is transient (back off + retry); a range-cap or other
// request error is a real misconfiguration and must fail loud (see below).
function isRateLimit(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return (
    msg.includes("over rate limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("429")
  );
}

// Retry ONLY rate-limit errors with exponential backoff; rethrow everything
// else immediately so a genuine bug (bad range, wrong RPC) never hides behind
// retries. Returns the call's result on success.
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimit(err) || attempt >= RPC_MAX_RETRIES) throw err;
      const backoff = Math.min(500 * 2 ** attempt, 8000);
      attempt += 1;
      console.warn(`[indexer] rate limited, backoff ${backoff}ms (attempt ${attempt}/${RPC_MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
}

// Block-timestamp cache — harvested from the LedgerForge indexer so a rescan of
// overlapping ranges doesn't re-hit getBlock for the same height.
const blockTimestampCache = new Map<string, number>();
async function blockTimeISO(client: PublicClient, blockNumber: bigint): Promise<string> {
  const key = blockNumber.toString();
  let ts = blockTimestampCache.get(key);
  if (ts === undefined) {
    const block = await withRateLimitRetry(() => client.getBlock({ blockNumber }));
    ts = Number(block.timestamp);
    blockTimestampCache.set(key, ts);
  }
  return new Date(ts * 1000).toISOString();
}

/**
 * Chunked getLogs over [fromBlock, toBlock] for one token filtered by an indexed
 * arg (`to` or `from` = wallet). The range-chunking is the reusable core of the
 * legacy indexer; RPCs cap the span per call.
 */
async function fetchTransferLogs(
  client: PublicClient,
  token: `0x${string}`,
  filter: { to: `0x${string}` } | { from: `0x${string}` },
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + INDEXER_MAX_RANGE_PER_CALL - 1n > toBlock
        ? toBlock
        : cursor + INDEXER_MAX_RANGE_PER_CALL - 1n;
    try {
      const logs = await withRateLimitRetry(() =>
        client.getLogs({
          address: token,
          event: ERC20_TRANSFER_EVENT,
          args: filter,
          fromBlock: cursor,
          toBlock: end,
        }),
      );
      out.push(...(logs as Log[]));
      if (RPC_CALL_DELAY_MS > 0) await sleep(RPC_CALL_DELAY_MS);
    } catch (err) {
      // Do NOT swallow-and-continue: a persistent failure (e.g. the RPC's
      // 100-block range cap) would otherwise index ZERO logs while the caller
      // still marks the wallet fully scanned — reports would be silently empty.
      // Fail loud so a misconfigured range/RPC can never masquerade as "no
      // activity". Callers must not advance last_indexed_block on a throw.
      const msg = (err as Error).message;
      throw new Error(
        `[indexer] getLogs ${cursor}-${end} failed: ${msg}. ` +
          `If this is a block-range cap, lower INDEXER_MAX_RANGE_PER_CALL ` +
          `(current ${INDEXER_MAX_RANGE_PER_CALL}).`,
      );
    }
    cursor = end + 1n;
  }
  return out;
}

interface DecodedTransfer {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
}

function decodeTransferLog(log: Log): DecodedTransfer | null {
  const args = (log as unknown as { args?: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint } }).args;
  if (
    !args?.from ||
    !args.to ||
    args.value === undefined ||
    !log.transactionHash ||
    log.blockNumber === null ||
    log.logIndex === null
  ) {
    return null;
  }
  return {
    from: args.from,
    to: args.to,
    value: args.value,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
  };
}

async function recordGasForTx(
  client: PublicClient,
  wallet: WalletRow,
  txHash: `0x${string}`,
  blockTime: string,
): Promise<void> {
  // Only count gas for txs the wallet actually paid for (wallet is tx.from).
  const receipt = await withRateLimitRetry(() => client.getTransactionReceipt({ hash: txHash }));
  if (getAddress(receipt.from).toLowerCase() !== wallet.address.toLowerCase()) return;
  const gasUsed = receipt.gasUsed;
  const gasPrice = receipt.effectiveGasPrice;
  await insertGas({
    walletId: wallet.id,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    blockTime,
    gasUsed: gasUsed.toString(),
    gasPrice: gasPrice.toString(),
    gasCost: (gasUsed * gasPrice).toString(),
  });
}

async function scanToken(
  client: PublicClient,
  wallet: WalletRow,
  token: TrackedToken,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const walletAddr = wallet.address as `0x${string}`;
  const [inbound, outbound] = await Promise.all([
    fetchTransferLogs(client, token.address, { to: walletAddr }, fromBlock, toBlock),
    fetchTransferLogs(client, token.address, { from: walletAddr }, fromBlock, toBlock),
  ]);

  for (const log of [...inbound, ...outbound]) {
    const d = decodeTransferLog(log);
    if (!d) continue;
    const direction: "in" | "out" =
      d.to.toLowerCase() === wallet.address.toLowerCase() ? "in" : "out";
    const counterparty = direction === "in" ? d.from : d.to;
    const blockTime = await blockTimeISO(client, d.blockNumber);

    await insertTransfer({
      walletId: wallet.id,
      txHash: d.txHash,
      logIndex: d.logIndex,
      blockNumber: Number(d.blockNumber),
      blockTime,
      token: token.symbol,
      tokenAddress: token.address,
      decimals: token.decimals,
      from: getAddress(d.from),
      to: getAddress(d.to),
      amount: d.value.toString(),
      direction,
      counterparty: getAddress(counterparty),
    });

    if (direction === "out") {
      // Wallet-initiated transfer → capture its gas (dedup via ON CONFLICT).
      await recordGasForTx(client, wallet, d.txHash, blockTime).catch((err) =>
        console.warn(`[indexer] gas for ${d.txHash}:`, (err as Error).message),
      );
    }
  }
}

/**
 * Index one registered wallet from its start block to chain head: USDT/USDG
 * transfers, per-tx gas on wallet-originated transfers, and a current OKB
 * balance snapshot. Read-only against chain; safe to re-run (all writes upsert).
 */
export async function scanWallet(client: PublicClient, walletId: string): Promise<void> {
  const wallet = await getWalletById(walletId);
  if (!wallet) throw new Error(`unknown wallet ${walletId}`);
  if (wallet.chainId !== XLAYER_CHAIN_ID) {
    throw new Error(`wallet ${walletId} chain ${wallet.chainId} != configured ${XLAYER_CHAIN_ID}`);
  }

  const tokens = trackedTokens();
  if (tokens.length === 0) {
    console.warn("[indexer] no tracked tokens configured (TODO(unverified)); nothing to scan");
    return;
  }

  const head = await withRateLimitRetry(() => client.getBlockNumber());
  const fromBlock = BigInt(Math.max(wallet.indexedFromBlock, wallet.lastIndexedBlock + 1));

  for (const token of tokens) {
    await scanToken(client, wallet, token, fromBlock, head);
  }

  // Current native OKB balance snapshot at head.
  const balance = await withRateLimitRetry(() =>
    client.getBalance({ address: wallet.address as `0x${string}` }),
  );
  const headTime = await blockTimeISO(client, head);
  await insertBalanceSnapshot(wallet.id, Number(head), headTime, balance.toString());

  await setLastIndexedBlock(wallet.id, Number(head));
  console.log(`[indexer] scanned ${walletId} up to block ${head}`);
}
