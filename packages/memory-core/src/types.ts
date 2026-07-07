export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export const MEMORY_TYPES = [
  "identity",
  "user_preference",
  "procedure",
  "project_fact",
  "tool_memory",
  "decision_memory",
  "failure_memory",
  "outcome_memory",
  "negative_preference",
  "skill"
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_STATUSES = [
  "active",
  "pending",
  "rejected",
  "expired",
  "superseded",
  "invalidated",
  "archived",
  "deleted"
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_SOURCE_KINDS = [
  "user_assertion",
  "user_correction",
  "user_instruction",
  "user_statement",
  "agent_observation",
  "run_reflection",
  "post_run_reflection",
  "run_summary",
  "decision_record",
  "manual_import",
  "manual_edit",
  "external_content",
  "external_web",
  "mcp_tool_description",
  "tool_result"
] as const;

export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];

export const MEMORY_EVENT_TYPES = [
  "add",
  "update",
  "delete",
  "recall",
  "supersede",
  "expire",
  "approve",
  "reject"
] as const;

export type MemoryEventType = (typeof MEMORY_EVENT_TYPES)[number];

export const MEMORY_ACTOR_TYPES = [
  "user",
  "agent",
  "system",
  "dashboard",
  "mcp_host"
] as const;

export type MemoryActorType = (typeof MEMORY_ACTOR_TYPES)[number];

export interface MemoryActor {
  type: MemoryActorType;
  id?: string;
}

export interface MemoryScope {
  tenantId: string;
  userId: string;
  agentProfileId?: string;
  projectId?: string;
  hostId?: string;
  sessionId?: string;
  toolId?: string;
}

export type MemoryScopeFilter = Pick<MemoryScope, "tenantId" | "userId"> &
  Partial<Omit<MemoryScope, "tenantId" | "userId">>;

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  canonicalText: string;
  rawSource?: string;
  sourceKind: MemorySourceKind;
  status: MemoryStatus;
  confidence: number;
  importance: number;
  validFrom?: Date;
  validUntil?: Date;
  supersedes: string[];
  supersededBy?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  useCount: number;
  metadata: JsonObject;
}

export interface MemoryEmbedding {
  memoryId: string;
  embedding: number[];
  embeddingModel: string;
  createdAt: Date;
}

export interface MemoryEvent {
  id: string;
  tenantId: string;
  memoryId?: string;
  runId?: string;
  traceId?: string;
  eventType: MemoryEventType;
  actor: MemoryActor;
  reason?: string;
  before?: JsonObject;
  after?: JsonObject;
  createdAt: Date;
  metadata: JsonObject;
}

export interface RunRecord {
  id: string;
  tenantId: string;
  userId: string;
  hostId?: string;
  agentProfileId?: string;
  projectId?: string;
  taskHint?: string;
  summary?: string;
  outcome?: string;
  startedAt?: Date;
  endedAt?: Date;
  metadata: JsonObject;
}

export interface MemoryTrace {
  id: string;
  tenantId: string;
  runId?: string;
  query?: string;
  selectedMemoryIds: string[];
  ignoredMemoryIds: string[];
  contextPack?: string;
  selectionReasons: Record<string, string>;
  createdAt: Date;
  metadata: JsonObject;
}

export interface CreateMemoryInput {
  id?: string;
  scope: MemoryScope;
  type: MemoryType;
  canonicalText: string;
  rawSource?: string;
  sourceKind: MemorySourceKind;
  status?: MemoryStatus;
  confidence?: number;
  importance?: number;
  validFrom?: Date | string;
  validUntil?: Date | string;
  supersedes?: string[];
  metadata?: JsonObject;
}

export interface UpdateMemoryPatch {
  type?: MemoryType;
  canonicalText?: string;
  rawSource?: string | null;
  sourceKind?: MemorySourceKind;
  status?: MemoryStatus;
  confidence?: number;
  importance?: number;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  supersedes?: string[];
  supersededBy?: string | null;
  metadata?: JsonObject;
}

export interface CreateRunInput {
  id?: string;
  tenantId: string;
  userId: string;
  hostId?: string;
  agentProfileId?: string;
  projectId?: string;
  taskHint?: string;
  summary?: string;
  outcome?: string;
  startedAt?: Date | string;
  endedAt?: Date | string;
  metadata?: JsonObject;
}

export interface CreateTraceInput {
  id?: string;
  tenantId: string;
  runId?: string;
  query?: string;
  selectedMemoryIds?: string[];
  ignoredMemoryIds?: string[];
  contextPack?: string;
  selectionReasons?: Record<string, string>;
  metadata?: JsonObject;
}

export interface MutationOptions {
  actor?: MemoryActor;
  reason?: string;
  now?: Date;
  runId?: string;
  metadata?: JsonObject;
}

export interface MemoryListFilter {
  scope?: MemoryScopeFilter;
  types?: MemoryType[];
  statuses?: MemoryStatus[];
  includeExpiredByValidity?: boolean;
  now?: Date;
}

export interface MemoryRecallQuery {
  scope: MemoryScopeFilter;
  query?: string;
  types?: MemoryType[];
  limit?: number;
  now?: Date;
  runId?: string;
  actor?: MemoryActor;
  metadata?: JsonObject;
}

export interface MemoryRecallResult {
  memories: MemoryRecord[];
  trace: MemoryTrace;
  event: MemoryEvent;
  ignoredMemoryIds: string[];
}

export interface SupersedeMemoryResult {
  previous: MemoryRecord;
  replacement: MemoryRecord;
  events: MemoryEvent[];
}

export interface MemoryWriteResult {
  memory: MemoryRecord;
  event: MemoryEvent;
}

export interface MemoryUpdateResult {
  before: MemoryRecord;
  memory: MemoryRecord;
  event: MemoryEvent;
}
