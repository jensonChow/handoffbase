import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyMigration,
  applyVersionedMigration,
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

test("migration command records checksums and skips already applied files", async () => {
  const harness = versionedMigrationPool();

  const first = await runMemoryCoreMigration(
    "postgresql://runtime.invalid/handoffbase_test",
    () => harness.pool,
  );
  const second = await runMemoryCoreMigration(
    "postgresql://runtime.invalid/handoffbase_test",
    () => harness.pool,
  );

  assert.deepEqual(first.map((result) => result.status), ["applied", "applied"]);
  assert.deepEqual(second.map((result) => result.status), ["skipped", "skipped"]);
  assert.equal(harness.appliedSql.length, 2);
  assert.match(harness.appliedSql[0], /create extension if not exists vector;/);
  assert.match(harness.appliedSql[0], /create table if not exists memories/);
  assert.match(harness.appliedSql[1], /create table if not exists memory_feedback/);
  assert.deepEqual([...harness.ledger.keys()], [
    "0001_memory_core.sql",
    "0002_feedback_hard_delete.sql",
  ]);
  assert.equal(harness.endCount(), 2);
});

test("versioned migration rejects checksum drift without replaying SQL", async () => {
  const harness = versionedMigrationPool(
    new Map([["0001_memory_core.sql", "already-applied-checksum"]]),
  );

  await assert.rejects(
    () =>
      applyVersionedMigration(harness.pool, {
        name: "0001_memory_core.sql",
        sql: "changed sql must not run",
        checksum: "changed-checksum",
      }),
    (error: unknown) => {
      assert.ok(error instanceof MigrationConfigError);
      assert.equal(error.message, "Applied migration checksum mismatch: 0001_memory_core.sql.");
      return true;
    },
  );
  assert.deepEqual(harness.appliedSql, []);
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

function versionedMigrationPool(
  initialLedger: Map<string, string> = new Map(),
) {
  const ledger = new Map(initialLedger);
  const appliedSql: string[] = [];
  let ends = 0;
  const pool = {
    async connect() {
      return {
        async query(sql: string, values: unknown[] = []) {
          if (
            sql === "BEGIN" ||
            sql === "COMMIT" ||
            sql === "ROLLBACK" ||
            sql.includes("pg_advisory_xact_lock") ||
            sql.startsWith("create table if not exists handoffbase_schema_migrations")
          ) {
            return { rows: [], rowCount: 0 };
          }
          if (sql.startsWith("select checksum from handoffbase_schema_migrations")) {
            const checksum = ledger.get(String(values[0]));
            return {
              rows: checksum === undefined ? [] : [{ checksum }],
              rowCount: checksum === undefined ? 0 : 1,
            };
          }
          if (sql.startsWith("insert into handoffbase_schema_migrations")) {
            ledger.set(String(values[0]), String(values[1]));
            return { rows: [], rowCount: 1 };
          }
          appliedSql.push(sql);
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
    async end() {
      ends += 1;
    },
  };
  return { pool, ledger, appliedSql, endCount: () => ends };
}
