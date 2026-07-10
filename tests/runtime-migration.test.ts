import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyMigration,
  MigrationConfigError,
  runMemoryCoreMigration,
} from "../scripts/db/migrate.mjs";

test("migration command requires DATABASE_URL before constructing a pool", async () => {
  let poolFactoryCalls = 0;

  await assert.rejects(
    () =>
      runMemoryCoreMigration("   ", () => {
        poolFactoryCalls += 1;
        throw new Error("pool factory must not run");
      }),
    (error: unknown) => {
      assert.ok(error instanceof MigrationConfigError);
      assert.equal(error.message, "DATABASE_URL is required to run the memory-core migration.");
      return true;
    },
  );
  assert.equal(poolFactoryCalls, 0);
});

test("migration command applies the canonical memory-core SQL explicitly and closes the pool", async () => {
  const events: string[] = [];
  let migrationSql = "";
  const pool = migrationPool(events, (sql) => {
    migrationSql = sql;
  });

  await runMemoryCoreMigration("postgresql://runtime.invalid/handoffbase_test", () => pool);

  assert.match(migrationSql, /create extension if not exists vector;/);
  assert.match(migrationSql, /create table if not exists memories/);
  assert.deepEqual(events, ["CONNECT", "BEGIN", "MIGRATION", "COMMIT", "RELEASE", "END"]);
});

test("migration transaction rolls back and releases its client on failure", async () => {
  const events: string[] = [];
  const failure = new Error("fake migration failure");
  const pool = migrationPool(events, () => {
    throw failure;
  });

  await assert.rejects(() => applyMigration(pool, "broken migration sql"), (error: unknown) => error === failure);
  assert.deepEqual(events, ["CONNECT", "BEGIN", "MIGRATION", "ROLLBACK", "RELEASE"]);
});

test("migration transaction destroys its client when rollback also fails", async () => {
  const events: string[] = [];
  const migrationFailure = new Error("fake migration failure");
  const rollbackFailure = new Error("fake rollback failure");
  const pool = migrationPool(
    events,
    () => {
      throw migrationFailure;
    },
    { rollbackFailure },
  );

  await assert.rejects(() => applyMigration(pool, "broken migration sql"), (error: unknown) => error === migrationFailure);
  assert.deepEqual(events, ["CONNECT", "BEGIN", "MIGRATION", "ROLLBACK", "RELEASE_DESTROY"]);
});

function migrationPool(
  events: string[],
  onMigration: (sql: string) => void,
  options: { rollbackFailure?: Error } = {},
) {
  return {
    async connect() {
      events.push("CONNECT");
      return {
        async query(sql: string) {
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            events.push(sql);
            if (sql === "ROLLBACK" && options.rollbackFailure) {
              throw options.rollbackFailure;
            }
          } else {
            events.push("MIGRATION");
            onMigration(sql);
          }
          return { rows: [], rowCount: 0 };
        },
        release(error?: Error | boolean) {
          events.push(error ? "RELEASE_DESTROY" : "RELEASE");
        },
      };
    },
    async end() {
      events.push("END");
    },
  };
}
