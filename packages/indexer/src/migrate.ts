import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { closePool, getPool } from "./db.js";

/**
 * Applies every `NNN_*.sql` file in migrations/ in filename order. Idempotent:
 * each migration should use IF NOT EXISTS / IF EXISTS, and applied names are
 * tracked in `_migrations` so a rerun is a no-op.
 *
 * Previously this list was hand-maintained and silently drifted from the
 * directory — 003_receipt_results.sql shipped in the repo and in the deployed
 * image but was never in the array, so `fly deploy`'s release_command reported
 * success while quietly applying nothing. Scanning the directory makes "add a
 * migration file" and "it gets applied" the same action.
 */
async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, "..", "migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort();
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const name of migrations) {
    const already = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [name]);
    if (already.rowCount && already.rowCount > 0) {
      console.log(`skip ${name} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, name), "utf-8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    console.log(`applied ${name}`);
  }
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("migration failed:", err);
    await closePool();
    process.exit(1);
  });
