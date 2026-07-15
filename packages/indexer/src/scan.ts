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

// Block-timestamp cache — harvested from the LedgerForge indexer so a rescan of
// overlapping ranges doesn't re-hit getBlock for the same height.
const blockTimestampCache = new Map<string, number>();
async function blockTimeISO(client: PublicClient, blockNumber: bigint): Promise<string> {
  const key = blockNumber.toString();
  let ts = blockTimestampCache.get(key);
  if (ts === undefined) {
    const block = await client.getBlock({ blockNumber });
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
      const logs = await client.getLogs({
        address: token,
        event: ERC20_TRANSFER_EVENT,
        args: filter,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
    } catch (err) {
      console.warn(`[indexer] transfer logs ${cursor}-${end}:`, (err as Error).message);
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
  const receipt = await client.getTransactionReceipt({ hash: txHash });
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

  const head = await client.getBlockNumber();
  const fromBlock = BigInt(Math.max(wallet.indexedFromBlock, wallet.lastIndexedBlock + 1));

  for (const token of tokens) {
    await scanToken(client, wallet, token, fromBlock, head);
  }

  // Current native OKB balance snapshot at head.
  const balance = await client.getBalance({ address: wallet.address as `0x${string}` });
  const headTime = await blockTimeISO(client, head);
  await insertBalanceSnapshot(wallet.id, Number(head), headTime, balance.toString());

  await setLastIndexedBlock(wallet.id, Number(head));
  console.log(`[indexer] scanned ${walletId} up to block ${head}`);
}
