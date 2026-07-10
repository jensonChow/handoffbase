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

export const MEMORY_CONFLICT_STATUSES = ["open", "resolved", "dismissed"] as const;

export type MemoryConflictStatus = (typeof MEMORY_CONFLICT_STATUSES)[number];

export const MEMORY_CONFLICT_TYPES = [
  "contradiction",
  "supersedes",
  "duplicate",
  "scope_overlap",
  "none"
] as const;

export type MemoryConflictType = (typeof MEMORY_CONFLICT_TYPES)[number];

export const MEMORY_CONFLICT_SEVERITIES = ["low", "medium", "high"] as const;

export type MemoryConflictSeverity = (typeof MEMORY_CONFLICT_SEVERITIES)[number];

export const MEMORY_CONFLICT_RECOMMENDED_ACTIONS = [
  "accept",
  "ignore",
  "merge",
  "supersede",
  "supersede_existing",
  "ask_user",
  "keep_both",
  "reject"
] as const;

export type MemoryConflictRecommendedAction = (typeof MEMORY_CONFLICT_RECOMMENDED_ACTIONS)[number];

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

export const MEMORY_FEEDBACK_SIGNALS = ["helpful", "unhelpful"] as const;

export type MemoryFeedbackSignal = (typeof MEMORY_FEEDBACK_SIGNALS)[number];

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

export interface MemoryFeedbackRecord {
  id: string;
  scope: MemoryScope;
  memoryId?: string;
  traceId?: string;
  runId?: string;
  signal: MemoryFeedbackSignal;
  reason?: string;
  correctionMemoryId?: string;
  actor: MemoryActor;
  regressionFixture: JsonObject;
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

export type MemoryConflictResolution = JsonObject & { action: string };

export interface MemoryConflictRecord {
  id: string;
  tenantId: string;
  candidateMemoryId?: string;
  existingMemoryId?: string;
  conflictType: MemoryConflictType;
  severity: MemoryConflictSeverity;
  recommendedAction: MemoryConflictRecommendedAction;
  status: MemoryConflictStatus;
  reason?: string;
  confidence?: number;
  resolution?: MemoryConflictResolution;
  createdAt: Date;
  resolvedAt?: Date;
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

export interface AddMemoryConflictInput {
  id?: string;
  tenantId: string;
  candidateMemoryId?: string;
  existingMemoryId?: string;
  conflictType: MemoryConflictType;
  severity?: MemoryConflictSeverity;
  recommendedAction: MemoryConflictRecommendedAction;
  status?: MemoryConflictStatus;
  reason?: string;
  confidence?: number;
  resolution?: MemoryConflictResolution;
  createdAt?: Date | string;
  resolvedAt?: Date | string;
  metadata?: JsonObject;
}

export interface CreateMemoryFeedbackInput {
  id?: string;
  scope: MemoryScope;
  memoryId?: string;
  traceId?: string;
  runId?: string;
  signal: MemoryFeedbackSignal;
  reason?: string;
  correctionMemoryId?: string;
  regressionFixture: JsonObject;
  metadata?: JsonObject;
}

export interface MemoryFeedbackListFilter {
  scope?: MemoryScopeFilter;
  memoryId?: string;
  traceId?: string;
  runId?: string;
  signals?: MemoryFeedbackSignal[];
}

export interface MemoryConflictListFilter {
  tenantId?: string;
  candidateMemoryId?: string;
  existingMemoryId?: string;
  statuses?: MemoryConflictStatus[];
  conflictTypes?: MemoryConflictType[];
}

export interface MutationOptions {
  actor?: MemoryActor;
  reason?: string;
  now?: Date;
  runId?: string;
  expectedStatus?: MemoryStatus;
  metadata?: JsonObject;
}

export interface ResolveMemoryConflictOptions extends MutationOptions {
  status?: Extract<MemoryConflictStatus, "resolved" | "dismissed">;
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
  /**
   * Optional precomputed query embedding. When present, stores blend semantic
   * (cosine) similarity into recall ranking alongside lexical scoring. Absent =
   * lexical-only behavior (the credential-free default).
   */
  queryEmbedding?: readonly number[];
  /** Model that produced queryEmbedding; stores may match it against stored vectors. */
  embeddingModel?: string;
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

export interface MemoryDeleteResult {
  deletedMemoryId: string;
  scope: MemoryScope;
  event: MemoryEvent;
}

export interface MemoryFeedbackWithCorrectionResult {
  feedback: MemoryFeedbackRecord;
  correction: MemoryWriteResult;
}

export interface MemoryFeedbackWithCorrectionOptions {
  feedback?: MutationOptions;
  correction?: MutationOptions;
}

export interface MemoryConflictResolutionResult {
  before: MemoryConflictRecord;
  conflict: MemoryConflictRecord;
}
