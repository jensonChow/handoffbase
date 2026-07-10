import { InMemoryMemoryStore, PostgresMemoryStore } from "@handoffbase/memory-core";
import { resolveStoreConfig, type StoreMode } from "../config.js";
import { ContinuityMemoryService } from "../services/continuity-memory-service.js";
import type { MemoryService } from "../services/memory-service.js";
import {
  createPgSqlQueryClient,
  type CloseableSqlQueryClient,
} from "./postgres-query-client.js";

export type PostgresClientFactory = (databaseUrl: string) => CloseableSqlQueryClient;

export interface MemoryRuntimeOptions {
  storeMode?: StoreMode;
  databaseUrl?: string;
  createPostgresClient?: PostgresClientFactory;
}

export interface MemoryRuntime {
  service: MemoryService;
  close(): Promise<void>;
}

export function createMemoryRuntime(options: MemoryRuntimeOptions = {}): MemoryRuntime {
  const config = resolveStoreConfig(options.storeMode, options.databaseUrl);
  if (config.storeMode === "in-memory") {
    return {
      service: new ContinuityMemoryService({ store: new InMemoryMemoryStore() }),
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
    close: () => {
      closePromise ??= client.close();
      return closePromise;
    },
  };
}
