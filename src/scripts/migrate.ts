import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db/client.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "../../drizzle/migrations");

const JOURNAL_DDL = `
CREATE TABLE IF NOT EXISTS "_lighthouse_migrations" (
  "id" text PRIMARY KEY,
  "applied_at" timestamptz DEFAULT now() NOT NULL
);
`;

async function isApplied(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM "_lighthouse_migrations" WHERE id = $1
    ) AS exists`,
    [id],
  );
  return rows[0]?.exists ?? false;
}

async function applyMigration(id: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO "_lighthouse_migrations" ("id") VALUES ($1) ON CONFLICT DO NOTHING`,
      [id],
    );
    await client.query("COMMIT");
    logger.info({ migration: id }, "migration_applied");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [tableName],
  );
  return rows[0]?.exists ?? false;
}

/** Only backfill the initial migration when schema predates the journal. */
async function backfillJournalFromExistingSchema(): Promise<void> {
  if (!(await tableExists("organizations"))) return;
  if (await isApplied("0000_initial")) return;
  if (await tableExists("poll_runs")) return;

  await pool.query(
    `INSERT INTO "_lighthouse_migrations" ("id") VALUES ($1) ON CONFLICT DO NOTHING`,
    ["0000_initial"],
  );
  logger.info({ migration: "0000_initial" }, "migration_backfilled");
}

async function migrationSchemaPresent(id: string): Promise<boolean> {
  if (id === "0000_initial") return tableExists("organizations");
  if (id === "0001_poll_runs") return tableExists("poll_runs");
  return true;
}

async function migrate() {
  await pool.query(JOURNAL_DDL);
  await backfillJournalFromExistingSchema();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if ((await isApplied(id)) && (await migrationSchemaPresent(id))) {
      logger.info({ migration: id }, "migration_skipped");
      continue;
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await applyMigration(id, sql);
  }

  logger.info("migration_complete");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
