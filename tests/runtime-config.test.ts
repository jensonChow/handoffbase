import {
  type SqlQueryClient,
  type SqlQueryResult,
} from "@handoffbase/memory-core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, loadServerConfig } from "../src/config.js";
import { createHttpApp, startHttpServer } from "../src/http.js";
import { createMemoryRuntime } from "../src/runtime/memory-runtime.js";
import type { CloseableSqlQueryClient } from "../src/runtime/postgres-query-client.js";

test("server config defaults to the credential-free in-memory store", () => {
  assert.deepEqual(loadServerConfig({}), {
    host: "127.0.0.1",
    port: 3000,
    mcpPath: "/mcp",
    storeMode: "in-memory",
  });
});

test("in-memory config does not retain an unrelated DATABASE_URL", () => {
  const config = loadServerConfig({
    STORE_MODE: "in-memory",
    DATABASE_URL: "postgresql://not-used.invalid/sentinel-secret",
  });

  assert.equal(config.storeMode, "in-memory");
  assert.equal(config.databaseUrl, undefined);
});

test("postgres config requires and trims DATABASE_URL", () => {
  const config = loadServerConfig({
    STORE_MODE: " postgres ",
    DATABASE_URL: " postgresql://runtime.invalid/handoffbase_test ",
  });

  assert.equal(config.storeMode, "postgres");
  assert.equal(config.databaseUrl, "postgresql://runtime.invalid/handoffbase_test");
});

test("invalid STORE_MODE fails without echoing rejected or secret values", () => {
  const rejectedMode = "sentinel-secret-mode";
  const databaseUrl = "postgresql://sentinel-secret@runtime.invalid/handoffbase";

  assert.throws(
    () => loadServerConfig({ STORE_MODE: rejectedMode, DATABASE_URL: databaseUrl }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.message, "STORE_MODE must be one of: in-memory, postgres.");
      assert.equal(error.message.includes(rejectedMode), false);
      assert.equal(error.message.includes(databaseUrl), false);
      return true;
    },
  );
});

test("postgres mode without DATABASE_URL fails with a secret-safe message", () => {
  assert.throws(
    () => loadServerConfig({ STORE_MODE: "postgres", DATABASE_URL: "   " }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.message, "DATABASE_URL is required when STORE_MODE=postgres.");
      return true;
    },
  );
});

test("non-loopback HTTP binds require auth unless an insecure demo override is explicit", () => {
  assert.throws(
    () =>
      createHttpApp({
        host: "0.0.0.0",
        authConfig: { mode: "disabled" },
        allowInsecureRemote: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /HANDOFFBASE_AUTH_MODE=api_key is required/);
      return true;
    },
  );
  assert.doesNotThrow(() =>
    createHttpApp({
      host: "0.0.0.0",
      authConfig: { mode: "disabled" },
      allowInsecureRemote: true,
    }),
  );
  assert.doesNotThrow(() =>
    createHttpApp({ host: "127.0.0.1", authConfig: { mode: "disabled" } }),
  );
  for (const deceptiveHost of ["127.example.com", "127.0.0.1.attacker.invalid"]) {
    assert.throws(
      () =>
        createHttpApp({
          host: deceptiveHost,
          authConfig: { mode: "disabled" },
          allowInsecureRemote: false,
        }),
      ConfigError,
    );
  }
});

test("runtime factory preserves in-memory default without constructing a pg client", async () => {
  let clientFactoryCalls = 0;
  const runtime = createMemoryRuntime({
    createPostgresClient: () => {
      clientFactoryCalls += 1;
      return new FakeSqlClient();
    },
  });

  assert.equal(runtime.service.getRuntimeInfo?.().storeMode, "in-memory");
  assert.equal(clientFactoryCalls, 0);
  await runtime.close();
});

test("postgres factory drives truthful health metadata and closes its pool once", async () => {
  const client = new FakeSqlClient();
  const started = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    authConfig: { mode: "disabled" },
    storeMode: "postgres",
    databaseUrl: "postgresql://runtime.invalid/handoffbase_test",
    createPostgresClient: () => client,
  });

  try {
    const response = await fetch(new URL("/health", started.url));
    assert.equal(response.status, 200);
    const health = (await response.json()) as Record<string, unknown>;
    assert.equal(health.storeMode, "postgres");
    assert.equal(client.queryCount, 0, "startup and health must not auto-migrate or query the database");

    const readinessResponse = await fetch(new URL("/ready", started.url));
    assert.equal(readinessResponse.status, 200);
    const readiness = (await readinessResponse.json()) as {
      ok: boolean;
      checks: { store: { ok: boolean; mode: string; probe: string } };
    };
    assert.equal(readiness.ok, true);
    assert.deepEqual(
      {
        ok: readiness.checks.store.ok,
        mode: readiness.checks.store.mode,
        probe: readiness.checks.store.probe,
      },
      { ok: true, mode: "postgres", probe: "live" },
    );
    assert.equal(client.queryCount, 1, "readiness must execute a real database probe");
  } finally {
    await started.close();
    await started.close();
  }

  assert.equal(client.closeCount, 1);
});

test("HTTP listen failure closes an owned postgres runtime", async () => {
  const client = new FakeSqlClient();

  await assert.rejects(() =>
    startHttpServer({
      host: "127.0.0.1",
      port: -1,
      authConfig: { mode: "disabled" },
      storeMode: "postgres",
      databaseUrl: "postgresql://runtime.invalid/handoffbase_test",
      createPostgresClient: () => client,
    }),
  );

  assert.equal(client.closeCount, 1);
});

class FakeSqlClient implements CloseableSqlQueryClient {
  queryCount = 0;
  closeCount = 0;

  async query<Row = Record<string, unknown>>(): Promise<SqlQueryResult<Row>> {
    this.queryCount += 1;
    return { rows: [] };
  }

  async transaction<T>(fn: (client: SqlQueryClient) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}
