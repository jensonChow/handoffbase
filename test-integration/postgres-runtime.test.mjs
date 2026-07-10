import { PostgresMemoryStore } from "@handoffbase/memory-core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPgSqlQueryClient } from "../dist/runtime/postgres-query-client.js";
import { runMemoryCoreMigration } from "../scripts/db/migrate.mjs";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

test(
  "PostgresMemoryStore persists a memory across pool restart",
  { skip: testDatabaseUrl ? false : "TEST_DATABASE_URL was not supplied" },
  async () => {
    assertSafeTestDatabaseUrl(testDatabaseUrl);
    await runMemoryCoreMigration(testDatabaseUrl);

    const memoryId = `postgres-integration-${randomUUID()}`;
    const writerClient = createPgSqlQueryClient(testDatabaseUrl);
    try {
      const writerStore = new PostgresMemoryStore(writerClient);
      await writerStore.addMemory({
        id: memoryId,
        scope: {
          tenantId: "postgres-integration-test",
          userId: "postgres-integration-test",
        },
        type: "project_fact",
        canonicalText: "This memory must survive a Postgres pool restart.",
        sourceKind: "agent_observation",
        status: "active",
        confidence: 0.95,
        importance: 0.8,
      });
    } finally {
      await writerClient.close();
    }

    const readerClient = createPgSqlQueryClient(testDatabaseUrl);
    try {
      const readerStore = new PostgresMemoryStore(readerClient);
      const persisted = await readerStore.getMemory(memoryId);
      assert.equal(persisted?.canonicalText, "This memory must survive a Postgres pool restart.");
    } finally {
      try {
        await readerClient.query("delete from memory_events where memory_id = $1", [memoryId]);
        await readerClient.query("delete from memories where id = $1", [memoryId]);
      } finally {
        await readerClient.close();
      }
    }
  },
);

function assertSafeTestDatabaseUrl(value) {
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for the Postgres integration test.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!databaseName || !/(?:^|[_-])test(?:$|[_-])/i.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL must name a dedicated database with a standalone 'test' segment.");
  }
}
