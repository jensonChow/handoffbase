import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PgSqlQueryClient,
  type PgPoolClientLike,
  type PgPoolLike,
} from "../src/runtime/postgres-query-client.js";

test("PgSqlQueryClient forwards ordinary queries through the pool", async () => {
  const sourceValues: readonly unknown[] = Object.freeze(["memory-1"]);
  let receivedValues: unknown[] | undefined;
  const pool: PgPoolLike = {
    async query(sql, values) {
      assert.equal(sql, "select * from memories where id = $1");
      receivedValues = values;
      return { rows: [{ id: "memory-1" }], rowCount: null };
    },
    async connect() {
      throw new Error("connect should not be used for an ordinary query");
    },
    async end() {},
  };

  const result = await new PgSqlQueryClient(pool).query<{ id: string }>(
    "select * from memories where id = $1",
    sourceValues,
  );

  assert.deepEqual(result, { rows: [{ id: "memory-1" }] });
  assert.deepEqual(receivedValues, sourceValues);
  assert.notEqual(receivedValues, sourceValues);
});

test("PgSqlQueryClient commits transaction callback queries on one checked-out client", async () => {
  const events: string[] = [];
  const pool = fakePool(events);
  const client = new PgSqlQueryClient(pool);

  const result = await client.transaction(async (transaction) => {
    const selected = await transaction.query<{ value: number }>("select $1 as value", [7]);
    return selected.rows[0]?.value;
  });

  assert.equal(result, 7);
  assert.deepEqual(events, ["CONNECT", "BEGIN", "select $1 as value", "COMMIT", "RELEASE"]);
});

test("PgSqlQueryClient rolls back, releases, and preserves the transaction error", async () => {
  const events: string[] = [];
  const failure = new Error("unit transaction failure");
  const pool = fakePool(events);
  const client = new PgSqlQueryClient(pool);

  await assert.rejects(
    () =>
      client.transaction(async (transaction) => {
        await transaction.query("update memories set status = $1", ["archived"]);
        throw failure;
      }),
    (error: unknown) => error === failure,
  );

  assert.deepEqual(events, [
    "CONNECT",
    "BEGIN",
    "update memories set status = $1",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("PgSqlQueryClient destroys a checked-out client when rollback also fails", async () => {
  const events: string[] = [];
  const transactionFailure = new Error("unit transaction failure");
  const rollbackFailure = new Error("unit rollback failure");
  const pool = fakePool(events, { rollbackFailure });
  const client = new PgSqlQueryClient(pool);

  await assert.rejects(
    () =>
      client.transaction(async () => {
        throw transactionFailure;
      }),
    (error: unknown) => error === transactionFailure,
  );

  assert.deepEqual(events, ["CONNECT", "BEGIN", "ROLLBACK", "RELEASE_DESTROY"]);
});

test("PgSqlQueryClient closes the pool idempotently", async () => {
  const events: string[] = [];
  const client = new PgSqlQueryClient(fakePool(events));

  await client.close();
  await client.close();

  assert.deepEqual(events, ["END"]);
});

function fakePool(events: string[], options: { rollbackFailure?: Error } = {}): PgPoolLike {
  const checkedOutClient: PgPoolClientLike = {
    async query(sql) {
      events.push(sql);
      if (sql === "ROLLBACK" && options.rollbackFailure) {
        throw options.rollbackFailure;
      }
      if (sql === "select $1 as value") {
        return { rows: [{ value: 7 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release(error) {
      events.push(error ? "RELEASE_DESTROY" : "RELEASE");
    },
  };

  return {
    async query() {
      throw new Error("pool.query must not be used inside a transaction");
    },
    async connect() {
      events.push("CONNECT");
      return checkedOutClient;
    },
    async end() {
      events.push("END");
    },
  };
}
