import { InMemoryMemoryStore, PostgresMemoryStore } from "@handoffbase/memory-core";
import { resolveStoreConfig, type StoreMode } from "../config.js";
import { ContinuityMemoryService } from "../services/continuity-memory-service.js";
import type { MemoryService } from "../services/memory-service.js";
import {
  createPgSqlQueryClient,
  type CloseableSqlQueryClient,
} from "./postgres-query-client.js";
import {
  createRuntimeReadinessCheck,
  type RuntimeReadinessCheck,
} from "../readiness.js";

export type PostgresClientFactory = (databaseUrl: string) => CloseableSqlQueryClient;

export interface MemoryRuntimeOptions {
  storeMode?: StoreMode;
  databaseUrl?: string;
  createPostgresClient?: PostgresClientFactory;
  readinessEnv?: Record<string, string | undefined>;
  readinessFetch?: typeof fetch;
}

export interface MemoryRuntime {
  service: MemoryService;
  checkReadiness: RuntimeReadinessCheck;
  close(): Promise<void>;
}

export function createMemoryRuntime(options: MemoryRuntimeOptions = {}): MemoryRuntime {
  const config = resolveStoreConfig(options.storeMode, options.databaseUrl);
  if (config.storeMode === "in-memory") {
    const service = new ContinuityMemoryService({ store: new InMemoryMemoryStore() });
    return {
      service,
      checkReadiness: createRuntimeReadinessCheck({
        service,
        storeProbe: async () => undefined,
        env: options.readinessEnv,
        fetch: options.readinessFetch,
      }),
      close: async () => undefined,
    };
  }

  const clientFactory = options.createPostgresClient ?? createPgSqlQueryClient;
  const client = clientFactory(config.databaseUrl);
  const service = new ContinuityMemoryService({
    store: new PostgresMemoryStore(client),
    seedDemoMemories: false,
  });
  let closePromise: Promise<void> | undefined;

  return {
    service,
    checkReadiness: createRuntimeReadinessCheck({
      service,
      storeProbe: async () => {
        await client.query("select 1 from memories, memory_feedback limit 0");
      },
      env: options.readinessEnv,
      fetch: options.readinessFetch,
    }),
    close: () => {
      closePromise ??= client.close();
      return closePromise;
    },
  };
}
