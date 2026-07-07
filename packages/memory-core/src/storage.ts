import {
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type CreateRunInput,
  type CreateTraceInput,
  type MemoryEmbedding,
  type MemoryConflictListFilter,
  type MemoryConflictRecord,
  type MemoryConflictResolution,
  type MemoryConflictResolutionResult,
  type MemoryEvent,
  type MemoryListFilter,
  type MemoryRecallQuery,
  type MemoryRecallResult,
  type MemoryRecord,
  type MemoryScopeFilter,
  type MemoryTrace,
  type MemoryUpdateResult,
  type MemoryWriteResult,
  type MutationOptions,
  type ResolveMemoryConflictOptions,
  type RunRecord,
  type SupersedeMemoryResult,
  type UpdateMemoryPatch
} from "./types.js";

export interface EventListFilter {
  tenantId?: string;
  memoryId?: string;
  runId?: string;
  traceId?: string;
}

export interface MemoryStore {
  addMemory(input: CreateMemoryInput, options?: MutationOptions): Promise<MemoryWriteResult>;
  updateMemory(id: string, patch: UpdateMemoryPatch, options?: MutationOptions): Promise<MemoryUpdateResult>;
  deleteMemory(id: string, options?: MutationOptions): Promise<MemoryUpdateResult>;
  supersedeMemory(
    id: string,
    replacement: CreateMemoryInput,
    options?: MutationOptions
  ): Promise<SupersedeMemoryResult>;
  getMemory(id: string): Promise<MemoryRecord | undefined>;
  listMemories(filter?: MemoryListFilter): Promise<MemoryRecord[]>;
  recallMemories(query: MemoryRecallQuery): Promise<MemoryRecallResult>;
  upsertEmbedding(embedding: MemoryEmbedding): Promise<MemoryEmbedding>;
  getEmbedding(memoryId: string): Promise<MemoryEmbedding | undefined>;
  addRun(input: CreateRunInput): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | undefined>;
  addTrace(input: CreateTraceInput): Promise<MemoryTrace>;
  getTrace(id: string): Promise<MemoryTrace | undefined>;
  addConflict(input: AddMemoryConflictInput, options?: MutationOptions): Promise<MemoryConflictRecord>;
  getConflict(id: string): Promise<MemoryConflictRecord | undefined>;
  listConflicts(filter?: MemoryConflictListFilter): Promise<MemoryConflictRecord[]>;
  resolveConflict(
    id: string,
    resolution: MemoryConflictResolution,
    options?: ResolveMemoryConflictOptions
  ): Promise<MemoryConflictResolutionResult>;
  listEvents(filter?: EventListFilter): Promise<MemoryEvent[]>;
}

export interface MemoryStoreOptions {
  defaultScope?: MemoryScopeFilter;
}
