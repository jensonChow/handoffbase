import { type SqlQueryClient, type SqlQueryResult } from "@handoffbase/memory-core";
import { Pool } from "pg";

interface PgQueryResultLike {
  rows: unknown[];
  rowCount: number | null;
}

export interface PgQueryable {
  query(sql: string, values?: unknown[]): Promise<PgQueryResultLike>;
}

export interface PgPoolClientLike extends PgQueryable {
  release(error?: Error | boolean): void;
}

export interface PgPoolLike extends PgQueryable {
  connect(): Promise<PgPoolClientLike>;
  end(): Promise<void>;
}

export interface CloseableSqlQueryClient extends SqlQueryClient {
  close(): Promise<void>;
}

export class PgSqlQueryClient implements CloseableSqlQueryClient {
  private closePromise?: Promise<void>;

  constructor(private readonly pool: PgPoolLike) {}

  async query<Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    return queryWith(this.pool, sql, values);
  }

  async transaction<T>(fn: (client: SqlQueryClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query("BEGIN");
      const result = await fn({
        query: <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) =>
          queryWith<Row>(client, sql, values),
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original transaction failure while the client is released below.
        releaseError = rollbackError instanceof Error ? rollbackError : new Error("Postgres rollback failed.");
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

export function createPgSqlQueryClient(databaseUrl: string): PgSqlQueryClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", () => {
    console.error("Postgres pool reported an idle client error.");
  });
  return new PgSqlQueryClient(pool);
}

async function queryWith<Row>(
  client: PgQueryable,
  sql: string,
  values?: readonly unknown[],
): Promise<SqlQueryResult<Row>> {
  const result = await client.query(sql, values === undefined ? undefined : [...values]);
  const rows = result.rows as Row[];
  return result.rowCount === null ? { rows } : { rows, rowCount: result.rowCount };
}
