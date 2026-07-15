import "dotenv/config";
import { getPublicClient } from "./config.js";
import { closePool, query } from "./db.js";
import { scanWallet } from "./scan.js";

// One-shot: scan every registered wallet to chain head. Intended to be run on a
// schedule (cron / loop) or manually via `pnpm -F @constellation/indexer index`.
async function main(): Promise<void> {
  const client = getPublicClient();
  const wallets = await query<{ id: string }>("SELECT id FROM wallets ORDER BY registered_at");
  if (wallets.length === 0) {
    console.log("[indexer] no registered wallets yet");
    return;
  }
  for (const w of wallets) {
    try {
      await scanWallet(client, w.id);
    } catch (err) {
      console.error(`[indexer] scan ${w.id} failed:`, (err as Error).message);
    }
  }
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[indexer] run failed:", err);
    await closePool();
    process.exit(1);
  });
