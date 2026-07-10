import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const migrationUrl = new URL("../../packages/memory-core/migrations/0001_memory_core.sql", import.meta.url);

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
    const sql = await readFile(migrationUrl, "utf8");
    await applyMigration(pool, sql);
  } finally {
    await pool.end();
  }
}

export async function applyMigration(pool, sql) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
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

function defaultPoolFactory(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

async function main() {
  await runMemoryCoreMigration(process.env.DATABASE_URL);
  console.log("Applied memory-core migration 0001_memory_core.sql.");
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
