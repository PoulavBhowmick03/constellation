import { getAddress, type Address, type Hex, type PublicClient } from "viem";

/**
 * Default x402Escrow address on Mantle mainnet. Skill servers fall back to this
 * when X402_ESCROW_ADDRESS is not set in the environment so the on-chain check
 * still runs in the live deployment.
 */
const DEFAULT_ESCROW_ADDRESS = "0x1d550b555B3a2e124ef611b55965848d6be233a2" as Address;

const ESCROW_ADDRESS = (process.env.X402_ESCROW_ADDRESS ?? DEFAULT_ESCROW_ADDRESS) as Address;

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const SETTLED_PREFIX = "Bearer settled:";

/**
 * In-memory cache of settlement tx hashes already verified on-chain, so repeat
 * calls within an agent run do not re-query the RPC. Positive results only.
 */
const verifiedTxCache = new Map<string, number>();
const VERIFIED_TTL_MS = 60 * 60 * 1000;

export interface SettlementAuthResult {
  ok: boolean;
  reason?: string;
  txHash?: Hex;
}

/**
 * Verify a `Bearer settled:<txHash>:<timestamp>` access token by confirming the
 * txHash is a real, successful settlement against the x402Escrow contract on
 * Mantle.
 *
 * This is the gate that makes the access token unforgeable: a skill server will
 * not run paid work unless the caller can point to an actual on-chain escrow
 * settlement. The facilitator cannot mint free access by handing out a string,
 * and a fabricated header is rejected. The check fails closed — if the
 * settlement cannot be proven on-chain, access is denied.
 */
export async function verifySettlementAccess(
  authHeader: string | undefined,
  publicClient: PublicClient,
  escrowAddress: Address = ESCROW_ADDRESS,
): Promise<SettlementAuthResult> {
  const header = authHeader ?? "";
  if (!header.startsWith(SETTLED_PREFIX)) {
    return { ok: false, reason: "missing 'Bearer settled:' settlement token" };
  }

  const txHash = header.slice(SETTLED_PREFIX.length).split(":")[0] as Hex;
  if (!TX_HASH_RE.test(txHash)) {
    return { ok: false, reason: "malformed settlement tx hash" };
  }

  const cacheKey = txHash.toLowerCase();
  const cachedAt = verifiedTxCache.get(cacheKey);
  if (cachedAt && Date.now() - cachedAt < VERIFIED_TTL_MS) {
    return { ok: true, txHash };
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, reason: "settlement tx reverted", txHash };
    }
    if (!receipt.to || getAddress(receipt.to) !== getAddress(escrowAddress)) {
      return { ok: false, reason: "tx is not an x402Escrow settlement", txHash };
    }
    verifiedTxCache.set(cacheKey, Date.now());
    return { ok: true, txHash };
  } catch (err) {
    return {
      ok: false,
      reason: `could not verify settlement on-chain: ${
        err instanceof Error ? err.message : String(err)
      }`,
      txHash,
    };
  }
}
