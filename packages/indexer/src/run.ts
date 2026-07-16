import "dotenv/config";
import type { PublicClient } from "viem";
import { getPublicClient } from "./config.js";
import { closePool, query } from "./db.js";
import { scanWallet } from "./scan.js";

/**
 * Scan every registered wallet to chain head once. Idempotent (all writes
 * upsert), so safe to run on a schedule, from a loop, or manually. Reused both
 * by the one-shot CLI (below) and by the treasury server's background loop.
 */
export async function scanAllWallets(client?: PublicClient): Promise<void> {
  const c = client ?? getPublicClient();
  const wallets = await query<{ id: string }>("SELECT id FROM wallets ORDER BY registered_at");
  if (wallets.length === 0) {
    console.log("[indexer] no registered wallets yet");
    return;
  }
  for (const w of wallets) {
    try {
      await scanWallet(c, w.id);
    } catch (err) {
      console.error(`[indexer] scan ${w.id} failed:`, (err as Error).message);
    }
  }
}

// One-shot CLI: `pnpm -F @constellation/indexer index`. Skipped when this module
// is imported (e.g. by the treasury background loop) so importing never scans.
const isCli =
  typeof process.argv[1] === "string" && /run\.(js|ts)$/.test(process.argv[1]);

if (isCli) {
  scanAllWallets()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[indexer] run failed:", err);
      await closePool();
      process.exit(1);
    });
}
