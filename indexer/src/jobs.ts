import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  decodeEventLog,
  formatUnits,
  getAddress,
  isAddress,
  parseAbiItem,
  type Hex,
  type Log,
} from "viem";
import { publicClient } from "./config.js";
import { loadDb, type BazaarTier, type SkillRecord } from "./db.js";

export interface JobRecord {
  id: string;
  jobId: string;
  skillId: string;
  skillName: string;
  skillTier: BazaarTier;
  consumer: string;
  score: number;
  settlementTx: string;
  createJobTx: string;
  completeJobTx: string;
  pullTx: string;
  skillRegistryRepTx: string;
  erc8004FeedbackTx: string;
  amount: string;
  feeAmount: string;
  token: "USDC" | "USDe";
  blockNumber: number;
  timestamp: string;
  confirmed: boolean;
  provider: string;
  kind: "real" | "system";
}

const JOBS_DB_PATH = process.env.JOBS_DB_PATH ?? "./jobs_db.json";

const JOB_CREATED_EVENT = parseAbiItem(
  "event JobCreated(uint256 indexed jobId, address indexed consumer, address indexed provider, uint256 skillId, uint256 amount, address token)",
);
const JOB_COMPLETED_EVENT = parseAbiItem(
  "event JobCompleted(uint256 indexed jobId, uint256 paidToProvider, uint256 fee)",
);
const SKILL_REGISTRY_JOB_COMPLETED_EVENT = parseAbiItem(
  "event JobCompleted(uint256 indexed skillId, uint8 reputationScore, uint256 newAvgScore)",
);
const ERC20_TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const ESCROW_JOB_GETTER_ABI = [
  {
    name: "getJob",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "jobId",              type: "uint256" },
        { name: "consumer",           type: "address" },
        { name: "provider",           type: "address" },
        { name: "token",              type: "address" },
        { name: "amount",             type: "uint256" },
        { name: "skillId",            type: "uint256" },
        { name: "jobSpecURI",         type: "string"  },
        { name: "status",             type: "uint8"   },
        { name: "createdAt",          type: "uint256" },
        { name: "completedAt",        type: "uint256" },
        { name: "disputeWindow",      type: "uint256" },
        { name: "facilitatorFeeBps", type: "uint256" },
      ],
    }],
  },
] as const;

const KNOWN_TOKENS: Record<string, { symbol: "USDC" | "USDe"; decimals: number }> = {};
function ingestTokens(): void {
  const usdc = process.env.USDC_ADDRESS;
  const usde = process.env.USDE_ADDRESS;
  if (usdc && isAddress(usdc)) KNOWN_TOKENS[usdc.toLowerCase()] = { symbol: "USDC", decimals: 6 };
  if (usde && isAddress(usde)) KNOWN_TOKENS[usde.toLowerCase()] = { symbol: "USDe", decimals: 18 };
}
ingestTokens();

function tokenInfo(addr: string): { symbol: "USDC" | "USDe"; decimals: number } | null {
  return KNOWN_TOKENS[addr.toLowerCase()] ?? null;
}

function getEscrowAddress(): `0x${string}` | null {
  const a = process.env.X402_ESCROW_ADDRESS;
  if (a && isAddress(a)) return a as `0x${string}`;
  return null;
}

function getSkillRegistryAddress(): `0x${string}` | null {
  const a = process.env.SKILL_REGISTRY_ADDRESS;
  if (a && isAddress(a)) return a as `0x${string}`;
  return null;
}

function getErc8004Address(): `0x${string}` | null {
  const a = process.env.ERC8004_REPUTATION_REGISTRY;
  if (a && isAddress(a)) return a as `0x${string}`;
  return null;
}

function getUsdcAddress(): `0x${string}` | null {
  const a = process.env.USDC_ADDRESS;
  if (a && isAddress(a)) return a as `0x${string}`;
  return null;
}

function getOperatorAddress(): `0x${string}` | null {
  const a = process.env.OPERATOR_ADDRESS ?? process.env.FACILITATOR_OPERATOR;
  if (a && isAddress(a)) return getAddress(a) as `0x${string}`;
  return null;
}

export function loadJobsDb(): JobRecord[] {
  if (!existsSync(JOBS_DB_PATH)) return [];
  try {
    return JSON.parse(readFileSync(JOBS_DB_PATH, "utf-8")) as JobRecord[];
  } catch {
    return [];
  }
}

export function saveJobsDb(jobs: JobRecord[]): void {
  writeFileSync(JOBS_DB_PATH, JSON.stringify(jobs, null, 2));
}

function findSkill(
  skillId: bigint,
  provider: string,
  skills: Record<number, SkillRecord>,
): SkillRecord | null {
  const byId = skills[Number(skillId)];
  if (byId) return byId;
  // fallback to latest skill for this provider
  const matches = Object.values(skills).filter(
    (s) => s.owner.toLowerCase() === provider.toLowerCase(),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.registeredAt - a.registeredAt);
  return matches[0];
}

const CONSUMER_FROM_URI_RE = /\/consumer\/(0x[0-9a-fA-F]{40})\//;
function parseConsumerFromURI(uri: string): string | null {
  const m = uri.match(CONSUMER_FROM_URI_RE);
  return m ? m[1] : null;
}

const BLOCK_LOOKBACK = BigInt(process.env.JOBS_BLOCK_LOOKBACK ?? "20000");
const MAX_BLOCK_RANGE_PER_CALL = BigInt(
  process.env.JOBS_MAX_RANGE_PER_CALL ?? "2000",
);

async function fetchEscrowJobCreated(
  escrow: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + MAX_BLOCK_RANGE_PER_CALL - 1n > toBlock
        ? toBlock
        : cursor + MAX_BLOCK_RANGE_PER_CALL - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: escrow,
        event: JOB_CREATED_EVENT,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
    } catch (err) {
      console.warn(`job created logs ${cursor}-${end}:`, (err as Error).message);
    }
    cursor = end + 1n;
  }
  return out;
}

async function fetchEscrowJobCompleted(
  escrow: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + MAX_BLOCK_RANGE_PER_CALL - 1n > toBlock
        ? toBlock
        : cursor + MAX_BLOCK_RANGE_PER_CALL - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: escrow,
        event: JOB_COMPLETED_EVENT,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
    } catch (err) {
      console.warn(`job completed logs ${cursor}-${end}:`, (err as Error).message);
    }
    cursor = end + 1n;
  }
  return out;
}

async function fetchSkillRegistryJobCompleted(
  registry: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + MAX_BLOCK_RANGE_PER_CALL - 1n > toBlock
        ? toBlock
        : cursor + MAX_BLOCK_RANGE_PER_CALL - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: registry,
        event: SKILL_REGISTRY_JOB_COMPLETED_EVENT,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
    } catch (err) {
      console.warn(`skill registry rep logs ${cursor}-${end}:`, (err as Error).message);
    }
    cursor = end + 1n;
  }
  return out;
}

async function fetchUsdcTransfersToOperator(
  usdc: `0x${string}`,
  operator: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + MAX_BLOCK_RANGE_PER_CALL - 1n > toBlock
        ? toBlock
        : cursor + MAX_BLOCK_RANGE_PER_CALL - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: usdc,
        event: ERC20_TRANSFER_EVENT,
        args: { to: operator },
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
    } catch (err) {
      console.warn(`usdc transfer logs ${cursor}-${end}:`, (err as Error).message);
    }
    cursor = end + 1n;
  }
  return out;
}

async function fetchErc8004Logs(
  erc8004: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end =
      cursor + MAX_BLOCK_RANGE_PER_CALL - 1n > toBlock
        ? toBlock
        : cursor + MAX_BLOCK_RANGE_PER_CALL - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: erc8004,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
    } catch (err) {
      console.warn(`erc8004 logs ${cursor}-${end}:`, (err as Error).message);
    }
    cursor = end + 1n;
  }
  return out;
}

// Cache of tx hash -> from-address. Module-scoped so multiple poll cycles
// don't repeatedly hit getTransaction for the same hashes.
const txFromCache = new Map<string, string | null>();

async function getTxFrom(hash: `0x${string}`): Promise<string | null> {
  const cached = txFromCache.get(hash);
  if (cached !== undefined) return cached;
  try {
    const tx = await publicClient.getTransaction({ hash });
    const from = tx.from ? getAddress(tx.from) : null;
    txFromCache.set(hash, from);
    return from;
  } catch {
    txFromCache.set(hash, null);
    return null;
  }
}

async function resolveTxFromMany(
  hashes: Iterable<`0x${string}`>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = new Set<`0x${string}`>(hashes);
  for (const h of unique) {
    out.set(h, await getTxFrom(h));
  }
  return out;
}

const blockTimestampCache = new Map<string, number>();
async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const key = blockNumber.toString();
  const cached = blockTimestampCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const block = await publicClient.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    blockTimestampCache.set(key, ts);
    return ts;
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

interface JobCreatedDecoded {
  jobId: bigint;
  consumer: `0x${string}`;
  provider: `0x${string}`;
  skillId: bigint;
  amount: bigint;
  token: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

interface JobCompletedDecoded {
  jobId: bigint;
  paidToProvider: bigint;
  fee: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

function decodeJobCreated(log: Log): JobCreatedDecoded | null {
  try {
    const d = decodeEventLog({ abi: [JOB_CREATED_EVENT], data: log.data, topics: log.topics });
    if (d.eventName !== "JobCreated" || !log.transactionHash || log.blockNumber === null) return null;
    const a = d.args as unknown as {
      jobId: bigint; consumer: `0x${string}`; provider: `0x${string}`;
      skillId: bigint; amount: bigint; token: `0x${string}`;
    };
    return {
      jobId: a.jobId, consumer: a.consumer, provider: a.provider,
      skillId: a.skillId, amount: a.amount, token: a.token,
      txHash: log.transactionHash, blockNumber: log.blockNumber,
    };
  } catch { return null; }
}

function decodeJobCompleted(log: Log): JobCompletedDecoded | null {
  try {
    const d = decodeEventLog({ abi: [JOB_COMPLETED_EVENT], data: log.data, topics: log.topics });
    if (d.eventName !== "JobCompleted" || !log.transactionHash || log.blockNumber === null) return null;
    const a = d.args as unknown as { jobId: bigint; paidToProvider: bigint; fee: bigint };
    return {
      jobId: a.jobId, paidToProvider: a.paidToProvider, fee: a.fee,
      txHash: log.transactionHash, blockNumber: log.blockNumber,
    };
  } catch { return null; }
}

interface SkillRegistryRepDecoded {
  skillId: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

function decodeSkillRegistryRep(log: Log): SkillRegistryRepDecoded | null {
  try {
    const d = decodeEventLog({
      abi: [SKILL_REGISTRY_JOB_COMPLETED_EVENT],
      data: log.data,
      topics: log.topics,
    });
    if (
      d.eventName !== "JobCompleted" ||
      !log.transactionHash ||
      log.blockNumber === null
    )
      return null;
    const a = d.args as unknown as { skillId: bigint };
    return { skillId: a.skillId, txHash: log.transactionHash, blockNumber: log.blockNumber };
  } catch {
    return null;
  }
}

interface UsdcTransferDecoded {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

function decodeUsdcTransfer(log: Log): UsdcTransferDecoded | null {
  try {
    const d = decodeEventLog({ abi: [ERC20_TRANSFER_EVENT], data: log.data, topics: log.topics });
    if (
      d.eventName !== "Transfer" ||
      !log.transactionHash ||
      log.blockNumber === null
    )
      return null;
    const a = d.args as unknown as {
      from: `0x${string}`;
      to: `0x${string}`;
      value: bigint;
    };
    return {
      from: a.from,
      to: a.to,
      value: a.value,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    };
  } catch {
    return null;
  }
}

export async function scanJobs(): Promise<JobRecord[]> {
  const escrow = getEscrowAddress();
  if (!escrow) {
    return [];
  }

  const skillRegistry = getSkillRegistryAddress();
  const erc8004 = getErc8004Address();
  const usdc = getUsdcAddress();
  const operator = getOperatorAddress();

  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = latestBlock > BLOCK_LOOKBACK ? latestBlock - BLOCK_LOOKBACK : 0n;

  const existing = loadJobsDb();
  const seen = new Set(existing.map((j) => j.id));
  const skills = loadDb();

  const [createdLogs, completedLogs, skillRepLogs, usdcLogs, erc8004Logs] =
    await Promise.all([
      fetchEscrowJobCreated(escrow, fromBlock, latestBlock),
      fetchEscrowJobCompleted(escrow, fromBlock, latestBlock),
      skillRegistry
        ? fetchSkillRegistryJobCompleted(skillRegistry, fromBlock, latestBlock)
        : Promise.resolve([] as Log[]),
      usdc && operator
        ? fetchUsdcTransfersToOperator(usdc, operator, fromBlock, latestBlock)
        : Promise.resolve([] as Log[]),
      erc8004
        ? fetchErc8004Logs(erc8004, fromBlock, latestBlock)
        : Promise.resolve([] as Log[]),
    ]);

  const completedByJobId = new Map<string, JobCompletedDecoded>();
  for (const log of completedLogs) {
    const d = decodeJobCompleted(log);
    if (d) completedByJobId.set(d.jobId.toString(), d);
  }

  // skill registry rep events grouped by skillId, sorted ascending by block.
  const skillRepBySkillId = new Map<string, SkillRegistryRepDecoded[]>();
  for (const log of skillRepLogs) {
    const d = decodeSkillRegistryRep(log);
    if (!d) continue;
    const key = d.skillId.toString();
    const arr = skillRepBySkillId.get(key) ?? [];
    arr.push(d);
    skillRepBySkillId.set(key, arr);
  }
  for (const arr of skillRepBySkillId.values()) {
    arr.sort((a, b) =>
      a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
    );
  }

  // USDC transfers to operator, decoded and sorted ascending by block.
  const usdcTransfers: UsdcTransferDecoded[] = [];
  for (const log of usdcLogs) {
    const d = decodeUsdcTransfer(log);
    if (d) usdcTransfers.push(d);
  }
  usdcTransfers.sort((a, b) =>
    a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
  );

  // ERC-8004 logs from the operator. Need to resolve tx-from once per hash.
  // First batch-resolve, then build a list of (blockNumber, txHash) sorted asc.
  let erc8004FromOperator: { blockNumber: bigint; txHash: `0x${string}` }[] = [];
  if (erc8004 && operator) {
    const uniqueHashes: `0x${string}`[] = [];
    const seenHashes = new Set<string>();
    for (const log of erc8004Logs) {
      if (!log.transactionHash) continue;
      if (seenHashes.has(log.transactionHash)) continue;
      seenHashes.add(log.transactionHash);
      uniqueHashes.push(log.transactionHash);
    }
    const fromMap = await resolveTxFromMany(uniqueHashes);
    const operatorLc = operator.toLowerCase();
    const operatorTxHashes = new Set<string>();
    for (const [hash, from] of fromMap.entries()) {
      if (from && from.toLowerCase() === operatorLc) operatorTxHashes.add(hash);
    }
    const dedup = new Set<string>();
    for (const log of erc8004Logs) {
      if (!log.transactionHash || log.blockNumber === null) continue;
      if (!operatorTxHashes.has(log.transactionHash)) continue;
      // dedup by tx hash; one feedback call may emit multiple logs
      if (dedup.has(log.transactionHash)) continue;
      dedup.add(log.transactionHash);
      erc8004FromOperator.push({
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      });
    }
    erc8004FromOperator.sort((a, b) =>
      a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
    );
  }

  const newJobs: JobRecord[] = [];
  const operatorLc = operator ? operator.toLowerCase() : null;

  // Stitching helpers reused by both the backfill pass and the new-job pass.
  // They draw exclusively from the in-memory collections built above — no RPC.
  const derivePullTx = (
    createBlock: bigint,
    consumerLc: string,
    totalAmount: bigint,
  ): string => {
    if (!operatorLc || usdcTransfers.length === 0) return "";
    const lowerBound = createBlock > 5n ? createBlock - 5n : 0n;
    let best: UsdcTransferDecoded | null = null;
    for (const t of usdcTransfers) {
      if (t.blockNumber < lowerBound) continue;
      if (t.blockNumber > createBlock) break;
      if (t.value !== totalAmount) continue;
      if (t.from.toLowerCase() !== consumerLc) continue;
      if (t.to.toLowerCase() !== operatorLc) continue;
      if (!best || t.blockNumber >= best.blockNumber) best = t;
    }
    return best ? best.txHash : "";
  };

  const deriveSkillRegistryRepTx = (
    createBlock: bigint,
    skillId: string,
  ): string => {
    const candidates = skillRepBySkillId.get(skillId);
    if (!candidates || candidates.length === 0) return "";
    const upperBound = createBlock + 10n;
    for (const c of candidates) {
      if (c.blockNumber < createBlock) continue;
      if (c.blockNumber > upperBound) break;
      return c.txHash;
    }
    return "";
  };

  const deriveErc8004FeedbackTx = (createBlock: bigint): string => {
    if (erc8004FromOperator.length === 0) return "";
    const upperBound = createBlock + 10n;
    for (const c of erc8004FromOperator) {
      if (c.blockNumber < createBlock) continue;
      if (c.blockNumber > upperBound) break;
      return c.txHash;
    }
    return "";
  };

  // ---------------- Backfill pass ----------------
  // Iterate existing DB jobs in place and populate any of the three new tx
  // fields / `kind` that are still empty/missing. Reuses the pre-fetched
  // event collections — no extra RPC. Skips jobs whose block is below the
  // current scan window (they'll be caught on a future pass with larger
  // lookback if needed).
  const forceKind = process.env.FORCE_BACKFILL_KIND === "true";
  let backfilledCount = 0;
  const fromBlockNum = Number(fromBlock);
  for (const job of existing) {
    if (job.blockNumber < fromBlockNum) continue;

    const createBlock = BigInt(job.blockNumber);
    const consumerLc = job.consumer.toLowerCase();
    const totalAmount =
      job.token === "USDC"
        ? BigInt(Math.round(parseFloat(job.amount) * 1_000_000)) +
          BigInt(Math.round(parseFloat(job.feeAmount) * 1_000_000))
        : BigInt(Math.round(parseFloat(job.amount) * 1e18)) +
          BigInt(Math.round(parseFloat(job.feeAmount) * 1e18));

    let updated = false;

    if (!job.pullTx || job.pullTx === "") {
      const v = derivePullTx(createBlock, consumerLc, totalAmount);
      if (v) {
        job.pullTx = v;
        updated = true;
      }
    }

    if (!job.skillRegistryRepTx || job.skillRegistryRepTx === "") {
      const v = deriveSkillRegistryRepTx(createBlock, job.skillId);
      if (v) {
        job.skillRegistryRepTx = v;
        updated = true;
      }
    }

    if (!job.erc8004FeedbackTx || job.erc8004FeedbackTx === "") {
      const v = deriveErc8004FeedbackTx(createBlock);
      if (v) {
        job.erc8004FeedbackTx = v;
        updated = true;
      }
    }

    const kindMissing =
      job.kind !== "real" && job.kind !== "system";
    if (kindMissing || forceKind) {
      // Without re-reading getJob we don't have jobSpecURI here, so we
      // approximate: a job is "system" iff consumer === operator. The
      // operator-as-consumer pollution we're cleaning up has no real
      // consumer recovery, so this matches the original classification
      // for those records.
      const next: "real" | "system" =
        operatorLc && consumerLc === operatorLc ? "system" : "real";
      if (job.kind !== next) {
        job.kind = next;
        updated = true;
      } else if (kindMissing) {
        // Field was missing entirely but value matches default — still a
        // structural change worth saving.
        job.kind = next;
        updated = true;
      }
    }

    if (updated) backfilledCount += 1;
  }

  // ---------------- New-job pass ----------------
  for (const log of createdLogs) {
    const created = decodeJobCreated(log);
    if (!created) continue;

    const id = `${created.txHash}-${created.jobId}`;
    if (seen.has(id)) continue;

    const completed = completedByJobId.get(created.jobId.toString());

    const tokenMeta = tokenInfo(created.token);
    if (!tokenMeta) continue;

    // prefer the consumer encoded by settler
    let realConsumer = created.consumer;
    let jobSpecURI = "";
    try {
      const job = await publicClient.readContract({
        address: escrow,
        abi: ESCROW_JOB_GETTER_ABI,
        functionName: "getJob",
        args: [created.jobId],
      });
      jobSpecURI = job.jobSpecURI ?? "";
      const fromURI = parseConsumerFromURI(jobSpecURI);
      if (fromURI && isAddress(fromURI)) {
        realConsumer = getAddress(fromURI) as `0x${string}`;
      }
    } catch { /* keep on-chain consumer */ }

    const ts = await getBlockTimestamp(created.blockNumber);
    const skillRecord = findSkill(created.skillId, created.provider, skills);

    const totalAmount = created.amount;
    const fee = completed?.fee ?? 0n;
    const paidToProvider = completed?.paidToProvider ?? (totalAmount - fee);

    const pullTx = derivePullTx(
      created.blockNumber,
      realConsumer.toLowerCase(),
      totalAmount,
    );
    const skillRegistryRepTx = deriveSkillRegistryRepTx(
      created.blockNumber,
      created.skillId.toString(),
    );
    const erc8004FeedbackTx = deriveErc8004FeedbackTx(created.blockNumber);

    // -- kind classification: a "system" job is one where the consumer is the
    // operator EOA AND the settler did not encode a real consumer in the URI.
    let kind: "real" | "system" = "real";
    if (operatorLc) {
      const consumerIsOperator = realConsumer.toLowerCase() === operatorLc;
      const noSpec = !jobSpecURI || jobSpecURI.trim() === "";
      if (consumerIsOperator && noSpec) kind = "system";
    }

    const job: JobRecord = {
      id,
      jobId: created.jobId.toString(),
      skillId: created.skillId.toString(),
      skillName: skillRecord ? skillRecord.name : "unknown-skill",
      skillTier: skillRecord ? skillRecord.tier : "FREE",
      consumer: getAddress(realConsumer),
      score: skillRecord ? skillRecord.averageScore : 0,
      settlementTx: completed ? completed.txHash : created.txHash,
      createJobTx: created.txHash,
      completeJobTx: completed ? completed.txHash : "",
      pullTx,
      skillRegistryRepTx,
      erc8004FeedbackTx,
      amount: formatUnits(paidToProvider, tokenMeta.decimals),
      feeAmount: formatUnits(fee, tokenMeta.decimals),
      token: tokenMeta.symbol,
      blockNumber: Number((completed ?? created).blockNumber),
      timestamp: new Date(ts * 1000).toISOString(),
      confirmed: !!completed,
      provider: getAddress(created.provider),
      kind,
    };

    newJobs.push(job);
    seen.add(id);
  }

  const dirty = newJobs.length > 0 || backfilledCount > 0;
  if (dirty) {
    const merged = [...existing, ...newJobs];
    merged.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const trimmed = merged.slice(0, 1000);
    saveJobsDb(trimmed);
    if (newJobs.length > 0) {
      console.log(`indexed ${newJobs.length} jobs total=${trimmed.length}`);
    }
    console.log(
      `backfilled ${backfilledCount} existing jobs total=${trimmed.length}`,
    );
    return trimmed;
  }

  console.log(
    `backfilled ${backfilledCount} existing jobs total=${existing.length}`,
  );
  return existing;
}

export async function pollJobs(): Promise<void> {
  try {
    await scanJobs();
  } catch (err) {
    console.error("job poll error:", (err as Error).message);
  }
}

export function getJobs(
  limit = 100,
  opts: { includeSystem?: boolean } = {},
): JobRecord[] {
  const jobs = loadJobsDb();
  const filtered = opts.includeSystem
    ? jobs
    : jobs.filter((j) => j.kind !== "system");
  filtered.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return filtered.slice(0, Math.max(0, limit));
}
