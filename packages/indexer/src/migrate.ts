import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { closePool, getPool } from "./db.js";

// Applies every migration in migrations/ in filename order. Idempotent: each
// migration uses IF NOT EXISTS, and applied names are tracked in a table.
const MIGRATIONS = ["001_init.sql", "002_payment_receipts.sql"];

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, "..", "migrations");
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const name of MIGRATIONS) {
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
