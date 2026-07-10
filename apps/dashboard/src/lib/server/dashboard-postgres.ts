import {
  mapPostgresTraceRow,
  type MemoryScopeFilter,
  type MemoryTrace,
  type PostgresMemoryTraceRow,
  type SqlQueryClient,
  type SqlQueryResult
} from "@handoffbase/memory-core";

interface PgQueryResultLike {
  rows: unknown[];
  rowCount: number | null;
}

export interface DashboardPgQueryable {
  query(sql: string, values?: unknown[]): Promise<PgQueryResultLike>;
}

export interface DashboardPgPoolClientLike extends DashboardPgQueryable {
  release(error?: Error | boolean): void;
}

export interface DashboardPgPoolLike extends DashboardPgQueryable {
  connect(): Promise<DashboardPgPoolClientLike>;
  end(): Promise<void>;
}

export interface CloseableDashboardSqlQueryClient extends SqlQueryClient {
  close(): Promise<void>;
}

export class DashboardPgSqlQueryClient implements CloseableDashboardSqlQueryClient {
  private closePromise?: Promise<void>;

  constructor(private readonly pool: DashboardPgPoolLike) {}

  async query<Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<SqlQueryResult<Row>> {
    return queryWith<Row>(this.pool, sql, values);
  }

  async transaction<T>(fn: (client: SqlQueryClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let releaseError: Error | undefined;

    try {
      await client.query("BEGIN");
      const result = await fn({
        query: <Row = Record<string, unknown>>(
          sql: string,
          values?: readonly unknown[]
        ) => queryWith<Row>(client, sql, values)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Postgres rollback failed.");
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }

  close(): Promise<void> {
    this.closePromise ??= this.pool.end();
    return this.closePromise;
  }
}

export async function createDashboardPgSqlQueryClient(
  databaseUrl: string
): Promise<DashboardPgSqlQueryClient> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  pool.on("error", () => {
    console.error("Dashboard Postgres pool reported an idle client error.");
  });

  return new DashboardPgSqlQueryClient(pool);
}

export async function loadScopedPostgresTraces(
  client: SqlQueryClient,
  scope: MemoryScopeFilter
): Promise<MemoryTrace[]> {
  const values: unknown[] = [scope.tenantId, scope.userId];
  const where = ["t.tenant_id = $1", "r.user_id = $2"];

  addOptionalRunScope(where, values, "agent_profile_id", scope.agentProfileId);
  addOptionalRunScope(where, values, "project_id", scope.projectId);
  addOptionalRunScope(where, values, "host_id", scope.hostId);

  const result = await client.query<PostgresMemoryTraceRow>(
    `select t.*
from memory_traces t
inner join runs r
  on r.id = t.run_id
 and r.tenant_id = t.tenant_id
where ${where.join("\n  and ")}
order by t.created_at desc`,
    values
  );

  return result.rows.map(mapPostgresTraceRow);
}

async function queryWith<Row>(
  client: DashboardPgQueryable,
  sql: string,
  values?: readonly unknown[]
): Promise<SqlQueryResult<Row>> {
  const result = await client.query(
    sql,
    values === undefined ? undefined : [...values]
  );
  const rows = result.rows as Row[];
  return result.rowCount === null ? { rows } : { rows, rowCount: result.rowCount };
}

function addOptionalRunScope(
  where: string[],
  values: unknown[],
  column: "agent_profile_id" | "project_id" | "host_id",
  value: string | undefined
): void {
  if (value === undefined) {
    return;
  }

  values.push(value);
  where.push(`(r.${column} is null or r.${column} = $${values.length})`);
}
