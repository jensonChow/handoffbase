import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const migrationDirectoryUrl = new URL("../../packages/memory-core/migrations/", import.meta.url);
const MIGRATION_LEDGER_SQL = `create table if not exists handoffbase_schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
)`;
const MIGRATION_LOCK_SQL = "select pg_advisory_xact_lock(hashtext('handoffbase_memory_core_migrations'))";

export class MigrationConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationConfigError";
  }
}

export async function runMemoryCoreMigration(databaseUrl, createPool = defaultPoolFactory) {
  const normalizedUrl = databaseUrl?.trim();
  if (!normalizedUrl) {
    throw new MigrationConfigError("DATABASE_URL is required to run the memory-core migration.");
  }

  const pool = createPool(normalizedUrl);
  try {
    const migrationNames = (await readdir(migrationDirectoryUrl))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort();
    const results = [];
    for (const name of migrationNames) {
      const sql = await readFile(new URL(name, migrationDirectoryUrl), "utf8");
      results.push(await applyVersionedMigration(pool, {
        name,
        sql,
        checksum: migrationChecksum(sql),
      }));
    }
    return results;
  } finally {
    await pool.end();
  }
}

export async function applyMigration(pool, sql) {
  return await withMigrationTransaction(pool, async (client) => {
    await client.query(sql);
  });
}

export async function applyVersionedMigration(pool, migration) {
  return await withMigrationTransaction(pool, async (client) => {
    await client.query(MIGRATION_LOCK_SQL);
    await client.query(MIGRATION_LEDGER_SQL);
    const existing = await client.query(
      "select checksum from handoffbase_schema_migrations where name = $1",
      [migration.name],
    );
    const appliedChecksum = existing.rows[0]?.checksum;
    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== migration.checksum) {
        throw new MigrationConfigError(`Applied migration checksum mismatch: ${migration.name}.`);
      }
      return { name: migration.name, status: "skipped" };
    }

    await client.query(migration.sql);
    await client.query(
      "insert into handoffbase_schema_migrations (name, checksum) values ($1, $2)",
      [migration.name, migration.checksum],
    );
    return { name: migration.name, status: "applied" };
  });
}

async function withMigrationTransaction(pool, operation) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // Preserve the original migration failure.
      releaseError = rollbackError instanceof Error ? rollbackError : new Error("Postgres rollback failed.");
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

function migrationChecksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function defaultPoolFactory(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

async function main() {
  const results = await runMemoryCoreMigration(process.env.DATABASE_URL);
  const applied = results.filter((result) => result.status === "applied").length;
  const skipped = results.length - applied;
  console.log(`Memory-core migrations complete: ${applied} applied, ${skipped} already current.`);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  void main().catch((error) => {
    if (error instanceof MigrationConfigError) {
      console.error(error.message);
    } else {
      console.error("Memory-core migration failed; the DATABASE_URL value was not logged.");
    }
    process.exitCode = 1;
  });
}
