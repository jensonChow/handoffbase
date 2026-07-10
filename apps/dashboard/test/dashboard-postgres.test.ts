import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMemoryStore,
  PostgresMemoryStore,
  type PostgresMemoryTraceRow,
  type SqlQueryClient,
  type SqlQueryResult
} from "@handoffbase/memory-core";
import { GET } from "../src/app/api/dashboard/memory/route";
import {
  createDashboardMemoryStoreBindingFromEnvironment,
  DashboardMemoryConfigurationError,
  resetDashboardMemoryBackendForTest
} from "../src/lib/server/dashboard-memory-store";
import {
  DashboardPgSqlQueryClient,
  type DashboardPgPoolClientLike,
  type DashboardPgPoolLike
} from "../src/lib/server/dashboard-postgres";

test("dashboard defaults to credential-free server memory without constructing Postgres", async () => {
  let clientFactoryCalls = 0;
  const binding = await createDashboardMemoryStoreBindingFromEnvironment(
    {
      STORE_MODE: " in-memory ",
      DATABASE_URL: "postgresql://unused.invalid/handoffbase"
    },
    () => {
      clientFactoryCalls += 1;
      return new FakeSqlQueryClient();
    }
  );

  assert.equal(binding.store instanceof InMemoryMemoryStore, true);
  assert.equal(binding.mode, "server_in_memory");
  assert.deepEqual(binding.scope, {
    tenantId: "tenant_demo",
    userId: "user_demo"
  });
  assert.equal(binding.seedDemoData, true);
  assert.equal(clientFactoryCalls, 0);
});

test("Postgres dashboard binding uses DATABASE_URL, explicit scope, and real scoped trace rows", async () => {
  const traceRow: PostgresMemoryTraceRow = {
    id: "trace-scoped",
    tenant_id: "tenant-shared",
    run_id: "run-scoped",
    query: "What should this user remember?",
    selected_memory_ids: ["memory-visible"],
    ignored_memory_ids: [],
    context_pack: "Scoped memory context",
    selection_reasons: { "memory-visible": "Matches the current work." },
    created_at: "2026-07-10T03:00:00.000Z",
    metadata: { hostId: "codex" }
  };
  const client = new FakeSqlQueryClient([traceRow]);
  const observedDatabaseUrls: string[] = [];
  const binding = await createDashboardMemoryStoreBindingFromEnvironment(
    {
      STORE_MODE: " postgres ",
      DATABASE_URL: " postgresql://runtime.invalid/handoffbase_test ",
      HANDOFFBASE_DASHBOARD_TENANT_ID: " tenant-shared ",
      HANDOFFBASE_DASHBOARD_USER_ID: " user-shared ",
      HANDOFFBASE_DASHBOARD_AGENT_PROFILE_ID: " opportunity-scout ",
      HANDOFFBASE_DASHBOARD_PROJECT_ID: " product-proof ",
      HANDOFFBASE_DASHBOARD_HOST_ID: " codex "
    },
    (databaseUrl) => {
      observedDatabaseUrls.push(databaseUrl);
      return client;
    }
  );

  assert.equal(binding.store instanceof PostgresMemoryStore, true);
  assert.equal(binding.mode, "shared_persistent_store");
  assert.equal(binding.seedDemoData, false);
  assert.deepEqual(binding.scope, {
    tenantId: "tenant-shared",
    userId: "user-shared",
    agentProfileId: "opportunity-scout",
    projectId: "product-proof",
    hostId: "codex"
  });
  assert.deepEqual(observedDatabaseUrls, [
    "postgresql://runtime.invalid/handoffbase_test"
  ]);

  assert.ok(binding.loadTraces);
  const traces = await binding.loadTraces({
    store: binding.store,
    scope: binding.scope
  });
  assert.deepEqual(traces.map((trace) => trace.id), ["trace-scoped"]);
  assert.equal(traces[0]?.createdAt.toISOString(), "2026-07-10T03:00:00.000Z");
  assert.match(client.queries[0]?.sql ?? "", /inner join runs r/);
  assert.match(client.queries[0]?.sql ?? "", /r\.user_id = \$2/);
  assert.deepEqual(client.queries[0]?.values, [
    "tenant-shared",
    "user-shared",
    "opportunity-scout",
    "product-proof",
    "codex"
  ]);
});

test("Postgres dashboard configuration requires private tenant and user scope", async () => {
  const databaseUrl = "postgresql://runtime.invalid/handoffbase_test";
  let clientFactoryCalls = 0;

  await assert.rejects(
    createDashboardMemoryStoreBindingFromEnvironment(
      {
        STORE_MODE: "postgres",
        DATABASE_URL: databaseUrl,
        NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_TENANT_ID: "public-tenant",
        NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_USER_ID: "public-user"
      },
      () => {
        clientFactoryCalls += 1;
        return new FakeSqlQueryClient();
      }
    ),
    (error: unknown) => {
      assert.equal(error instanceof DashboardMemoryConfigurationError, true);
      assert.equal(
        (error as Error).message,
        "HANDOFFBASE_DASHBOARD_TENANT_ID is required when STORE_MODE=postgres."
      );
      assert.equal((error as Error).message.includes(databaseUrl), false);
      return true;
    }
  );
  assert.equal(clientFactoryCalls, 0);

  resetDashboardMemoryBackendForTest(() =>
    createDashboardMemoryStoreBindingFromEnvironment({
      STORE_MODE: "postgres",
      DATABASE_URL: databaseUrl,
      HANDOFFBASE_DASHBOARD_TENANT_ID: "tenant-shared"
    })
  );
  const response = await GET();
  assert.equal(response.status, 503);
  const body = (await response.json()) as { code: string; error: string };
  assert.deepEqual(body, {
    code: "dashboard_configuration_error",
    error: "The dashboard memory store is not configured."
  });
  assert.equal(JSON.stringify(body).includes(databaseUrl), false);
});

test("dashboard pg query client commits and rolls back transactions with fake pools", async () => {
  const committedConnection = new FakePgConnection();
  const committedPool = new FakePgPool(committedConnection);
  const committedClient = new DashboardPgSqlQueryClient(committedPool);

  const result = await committedClient.transaction(async (transaction) => {
    await transaction.query("select scoped rows", ["tenant-shared"]);
    return "committed";
  });
  assert.equal(result, "committed");
  assert.deepEqual(committedConnection.statements, [
    "BEGIN",
    "select scoped rows",
    "COMMIT"
  ]);
  assert.equal(committedConnection.releaseCalls, 1);

  const rolledBackConnection = new FakePgConnection();
  const rolledBackClient = new DashboardPgSqlQueryClient(
    new FakePgPool(rolledBackConnection)
  );
  await assert.rejects(
    rolledBackClient.transaction(async () => {
      throw new Error("transaction failed");
    }),
    /transaction failed/
  );
  assert.deepEqual(rolledBackConnection.statements, ["BEGIN", "ROLLBACK"]);
  assert.equal(rolledBackConnection.releaseCalls, 1);

  await Promise.all([committedClient.close(), committedClient.close()]);
  assert.equal(committedPool.endCalls, 1);
});

class FakeSqlQueryClient implements SqlQueryClient {
  readonly queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];

  constructor(private readonly traceRows: PostgresMemoryTraceRow[] = []) {}

  async query<Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<SqlQueryResult<Row>> {
    this.queries.push({ sql, values });
    return {
      rows: this.traceRows as Row[],
      rowCount: this.traceRows.length
    };
  }

  async transaction<T>(fn: (client: SqlQueryClient) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

class FakePgConnection implements DashboardPgPoolClientLike {
  readonly statements: string[] = [];
  releaseCalls = 0;

  async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
    this.statements.push(sql);
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    this.releaseCalls += 1;
  }
}

class FakePgPool implements DashboardPgPoolLike {
  endCalls = 0;

  constructor(private readonly connection: FakePgConnection) {}

  async query(): Promise<{ rows: unknown[]; rowCount: number }> {
    return { rows: [], rowCount: 0 };
  }

  async connect(): Promise<DashboardPgPoolClientLike> {
    return this.connection;
  }

  async end(): Promise<void> {
    this.endCalls += 1;
  }
}
