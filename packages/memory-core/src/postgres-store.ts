import {
  type CreateMemoryInput,
  type CreateRunInput,
  type CreateTraceInput,
  type JsonObject,
  type MemoryEmbedding,
  type MemoryEvent,
  type MemoryListFilter,
  type MemoryRecallQuery,
  type MemoryRecallResult,
  type MemoryRecord,
  type MemoryTrace,
  type MemoryUpdateResult,
  type MemoryWriteResult,
  type MutationOptions,
  type RunRecord,
  type SupersedeMemoryResult,
  type UpdateMemoryPatch
} from "./types.js";
import { type EventListFilter, type MemoryStore } from "./storage.js";
import { assertValidMemoryEvent, assertValidMemoryRecord } from "./validation.js";
import { cloneJsonObject, isPlainObject } from "./utils.js";

export interface SqlQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number;
}

export interface SqlQueryClient {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

type SqlDate = Date | string | null | undefined;
type SqlJsonObject = JsonObject | string | null | undefined;
type SqlNumber = number | string | null | undefined;
type SqlStringArray = string[] | string | null | undefined;

export interface PostgresMemoryRow {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_profile_id?: string | null;
  project_id?: string | null;
  host_id?: string | null;
  session_id?: string | null;
  tool_id?: string | null;
  type: string;
  canonical_text: string;
  raw_source?: string | null;
  source_kind: string;
  status: string;
  confidence: SqlNumber;
  importance: SqlNumber;
  valid_from?: SqlDate;
  valid_until?: SqlDate;
  supersedes?: SqlStringArray;
  superseded_by?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_used_at?: SqlDate;
  use_count: SqlNumber;
  metadata?: SqlJsonObject;
}

export interface PostgresMemoryEventRow {
  id: string;
  tenant_id: string;
  memory_id?: string | null;
  run_id?: string | null;
  trace_id?: string | null;
  event_type: string;
  actor_type: string;
  actor_id?: string | null;
  reason?: string | null;
  before?: SqlJsonObject;
  after?: SqlJsonObject;
  created_at: Date | string;
  metadata?: SqlJsonObject;
}

export interface PostgresRunRow {
  id: string;
  tenant_id: string;
  user_id: string;
  host_id?: string | null;
  agent_profile_id?: string | null;
  project_id?: string | null;
  task_hint?: string | null;
  summary?: string | null;
  outcome?: string | null;
  started_at?: SqlDate;
  ended_at?: SqlDate;
  metadata?: SqlJsonObject;
}

export interface PostgresMemoryTraceRow {
  id: string;
  tenant_id: string;
  run_id?: string | null;
  query?: string | null;
  selected_memory_ids?: SqlStringArray;
  ignored_memory_ids?: SqlStringArray;
  context_pack?: string | null;
  selection_reasons?: SqlJsonObject;
  created_at: Date | string;
  metadata?: SqlJsonObject;
}

export interface PostgresMemoryEmbeddingRow {
  memory_id: string;
  embedding: number[] | string;
  embedding_model: string;
  created_at: Date | string;
}

export class PostgresMemoryStore implements MemoryStore {
  constructor(private readonly client: SqlQueryClient) {}

  async addMemory(_input: CreateMemoryInput, _options: MutationOptions = {}): Promise<MemoryWriteResult> {
    unsupported(
      "addMemory",
      "insert memories and memory_events in one transaction after the SQL contract branch stabilizes."
    );
  }

  async updateMemory(
    _id: string,
    _patch: UpdateMemoryPatch,
    _options: MutationOptions = {}
  ): Promise<MemoryUpdateResult> {
    unsupported(
      "updateMemory",
      "apply lifecycle patches and append audit events transactionally after the SQL contract branch stabilizes."
    );
  }

  async deleteMemory(_id: string, _options: MutationOptions = {}): Promise<MemoryUpdateResult> {
    unsupported(
      "deleteMemory",
      "choose soft-delete versus hard-delete semantics with the storage contract before wiring SQL mutations."
    );
  }

  async supersedeMemory(
    _id: string,
    _replacement: CreateMemoryInput,
    _options: MutationOptions = {}
  ): Promise<SupersedeMemoryResult> {
    unsupported(
      "supersedeMemory",
      "update the old memory, insert the replacement, and append both audit events in one transaction."
    );
  }

  async getMemory(id: string): Promise<MemoryRecord | undefined> {
    const result = await this.client.query<PostgresMemoryRow>("select * from memories where id = $1", [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresMemoryRow(row);
  }

  async listMemories(filter: MemoryListFilter = {}): Promise<MemoryRecord[]> {
    const query = buildMemoryListQuery(filter);
    const result = await this.client.query<PostgresMemoryRow>(query.sql, query.values);
    return result.rows.map(mapPostgresMemoryRow);
  }

  async recallMemories(_query: MemoryRecallQuery): Promise<MemoryRecallResult> {
    unsupported(
      "recallMemories",
      "structured recall, use-count updates, trace creation, and pgvector search are intentionally deferred."
    );
  }

  async upsertEmbedding(_embedding: MemoryEmbedding): Promise<MemoryEmbedding> {
    unsupported("upsertEmbedding", "serialize pgvector values only after vector dimensions and model contracts settle.");
  }

  async getEmbedding(memoryId: string): Promise<MemoryEmbedding | undefined> {
    const result = await this.client.query<PostgresMemoryEmbeddingRow>(
      "select * from memory_embeddings where memory_id = $1",
      [memoryId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresEmbeddingRow(row);
  }

  async addRun(_input: CreateRunInput): Promise<RunRecord> {
    unsupported("addRun", "insert run records once run lifecycle ownership is finalized.");
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    const result = await this.client.query<PostgresRunRow>("select * from runs where id = $1", [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresRunRow(row);
  }

  async addTrace(_input: CreateTraceInput): Promise<MemoryTrace> {
    unsupported("addTrace", "insert trace records together with recall events once recall SQL is implemented.");
  }

  async getTrace(id: string): Promise<MemoryTrace | undefined> {
    const result = await this.client.query<PostgresMemoryTraceRow>("select * from memory_traces where id = $1", [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresTraceRow(row);
  }

  async listEvents(filter: EventListFilter = {}): Promise<MemoryEvent[]> {
    const query = buildEventListQuery(filter);
    const result = await this.client.query<PostgresMemoryEventRow>(query.sql, query.values);
    return result.rows.map(mapPostgresEventRow);
  }
}

export function mapPostgresMemoryRow(row: PostgresMemoryRow): MemoryRecord {
  const memory: MemoryRecord = {
    id: row.id,
    scope: {
      tenantId: row.tenant_id,
      userId: row.user_id,
      agentProfileId: optionalString(row.agent_profile_id),
      projectId: optionalString(row.project_id),
      hostId: optionalString(row.host_id),
      sessionId: optionalString(row.session_id),
      toolId: optionalString(row.tool_id)
    },
    type: row.type as MemoryRecord["type"],
    canonicalText: row.canonical_text,
    rawSource: optionalString(row.raw_source),
    sourceKind: row.source_kind as MemoryRecord["sourceKind"],
    status: row.status as MemoryRecord["status"],
    confidence: requiredNumber(row.confidence, "confidence"),
    importance: requiredNumber(row.importance, "importance"),
    validFrom: optionalDate(row.valid_from, "valid_from"),
    validUntil: optionalDate(row.valid_until, "valid_until"),
    supersedes: parseStringArray(row.supersedes, "supersedes"),
    supersededBy: optionalString(row.superseded_by),
    createdAt: requiredDate(row.created_at, "created_at"),
    updatedAt: requiredDate(row.updated_at, "updated_at"),
    lastUsedAt: optionalDate(row.last_used_at, "last_used_at"),
    useCount: requiredInteger(row.use_count, "use_count"),
    metadata: parseJsonObject(row.metadata, "metadata")
  };

  assertValidMemoryRecord(memory);
  return memory;
}

export function mapPostgresEventRow(row: PostgresMemoryEventRow): MemoryEvent {
  const event: MemoryEvent = {
    id: row.id,
    tenantId: row.tenant_id,
    memoryId: optionalString(row.memory_id),
    runId: optionalString(row.run_id),
    traceId: optionalString(row.trace_id),
    eventType: row.event_type as MemoryEvent["eventType"],
    actor: {
      type: row.actor_type as MemoryEvent["actor"]["type"],
      id: optionalString(row.actor_id)
    },
    reason: optionalString(row.reason),
    before: parseOptionalJsonObject(row.before, "before"),
    after: parseOptionalJsonObject(row.after, "after"),
    createdAt: requiredDate(row.created_at, "created_at"),
    metadata: parseJsonObject(row.metadata, "metadata")
  };

  assertValidMemoryEvent(event);
  return event;
}

export function mapPostgresRunRow(row: PostgresRunRow): RunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    hostId: optionalString(row.host_id),
    agentProfileId: optionalString(row.agent_profile_id),
    projectId: optionalString(row.project_id),
    taskHint: optionalString(row.task_hint),
    summary: optionalString(row.summary),
    outcome: optionalString(row.outcome),
    startedAt: optionalDate(row.started_at, "started_at"),
    endedAt: optionalDate(row.ended_at, "ended_at"),
    metadata: parseJsonObject(row.metadata, "metadata")
  };
}

export function mapPostgresTraceRow(row: PostgresMemoryTraceRow): MemoryTrace {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runId: optionalString(row.run_id),
    query: optionalString(row.query),
    selectedMemoryIds: parseStringArray(row.selected_memory_ids, "selected_memory_ids"),
    ignoredMemoryIds: parseStringArray(row.ignored_memory_ids, "ignored_memory_ids"),
    contextPack: optionalString(row.context_pack),
    selectionReasons: parseSelectionReasons(row.selection_reasons),
    createdAt: requiredDate(row.created_at, "created_at"),
    metadata: parseJsonObject(row.metadata, "metadata")
  };
}

export function mapPostgresEmbeddingRow(row: PostgresMemoryEmbeddingRow): MemoryEmbedding {
  return {
    memoryId: row.memory_id,
    embedding: parseNumberArray(row.embedding, "embedding"),
    embeddingModel: row.embedding_model,
    createdAt: requiredDate(row.created_at, "created_at")
  };
}

interface SqlQueryParts {
  sql: string;
  values: unknown[];
}

function buildMemoryListQuery(filter: MemoryListFilter): SqlQueryParts {
  const values: unknown[] = [];
  const where: string[] = [];

  addScopeFilter(where, values, filter.scope);

  if (filter.types !== undefined && filter.types.length > 0) {
    values.push(filter.types);
    where.push(`type = any($${values.length}::text[])`);
  }

  const now = filter.now ?? new Date();
  if (filter.statuses !== undefined && filter.statuses.length > 0) {
    values.push(now);
    const nowIndex = values.length;
    values.push(filter.statuses);
    where.push(
      `case when status = 'active' and valid_until is not null and valid_until <= $${nowIndex} then 'expired' else status end = any($${values.length}::text[])`
    );
  } else if (!filter.includeExpiredByValidity) {
    values.push(now);
    where.push(`not (status = 'active' and valid_until is not null and valid_until <= $${values.length})`);
  }

  return {
    sql: `select * from memories${whereClause(where)} order by updated_at desc, created_at desc`,
    values
  };
}

function buildEventListQuery(filter: EventListFilter): SqlQueryParts {
  const values: unknown[] = [];
  const where: string[] = [];

  addExactFilter(where, values, "tenant_id", filter.tenantId);
  addExactFilter(where, values, "memory_id", filter.memoryId);
  addExactFilter(where, values, "run_id", filter.runId);
  addExactFilter(where, values, "trace_id", filter.traceId);

  return {
    sql: `select * from memory_events${whereClause(where)} order by created_at desc`,
    values
  };
}

function addScopeFilter(
  where: string[],
  values: unknown[],
  scope: MemoryListFilter["scope"] | undefined
): void {
  if (scope === undefined) {
    return;
  }

  addExactFilter(where, values, "tenant_id", scope.tenantId);
  addExactFilter(where, values, "user_id", scope.userId);
  addScopedDimensionFilter(where, values, "agent_profile_id", scope.agentProfileId);
  addScopedDimensionFilter(where, values, "project_id", scope.projectId);
  addScopedDimensionFilter(where, values, "host_id", scope.hostId);
  addScopedDimensionFilter(where, values, "session_id", scope.sessionId);
  addScopedDimensionFilter(where, values, "tool_id", scope.toolId);
}

function addExactFilter(where: string[], values: unknown[], column: string, value: string | undefined): void {
  if (value === undefined) {
    return;
  }

  values.push(value);
  where.push(`${column} = $${values.length}`);
}

function addScopedDimensionFilter(
  where: string[],
  values: unknown[],
  column: string,
  value: string | undefined
): void {
  if (value === undefined) {
    return;
  }

  values.push(value);
  where.push(`(${column} is null or ${column} = $${values.length})`);
}

function whereClause(where: string[]): string {
  return where.length === 0 ? "" : ` where ${where.join(" and ")}`;
}

function optionalString(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredNumber(value: SqlNumber, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new TypeError(`${field} must be a finite number.`);
}

function requiredInteger(value: SqlNumber, field: string): number {
  const parsed = requiredNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`${field} must be a non-negative integer.`);
  }

  return parsed;
}

function optionalDate(value: SqlDate, field: string): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${field} must be a valid date.`);
  }

  return date;
}

function requiredDate(value: Date | string, field: string): Date {
  const date = optionalDate(value, field);
  if (date === undefined) {
    throw new TypeError(`${field} must be a valid date.`);
  }

  return date;
}

function parseJsonObject(value: SqlJsonObject, field: string): JsonObject {
  if (value === null || value === undefined) {
    return {};
  }

  const parsed = typeof value === "string" ? parseJson(value, field) : value;
  if (!isPlainObject(parsed)) {
    throw new TypeError(`${field} must be a JSON object.`);
  }

  return cloneJsonObject(parsed as JsonObject);
}

function parseOptionalJsonObject(value: SqlJsonObject, field: string): JsonObject | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return parseJsonObject(value, field);
}

function parseJson(value: string, field: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new TypeError(`${field} must contain valid JSON.`, { cause: error });
  }
}

function parseSelectionReasons(value: SqlJsonObject): Record<string, string> {
  const object = parseJsonObject(value, "selection_reasons");
  const reasons: Record<string, string> = {};

  for (const [memoryId, reason] of Object.entries(object)) {
    if (typeof reason !== "string") {
      throw new TypeError("selection_reasons values must be strings.");
    }

    reasons[memoryId] = reason;
  }

  return reasons;
}

function parseStringArray(value: SqlStringArray, field: string): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => requireArrayString(item, field));
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "{}") {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseStringArray(parseJson(trimmed, field) as SqlStringArray, field);
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => requireArrayString(item.replace(/^"|"$/g, ""), field))
      .filter((item) => item.length > 0);
  }

  throw new TypeError(`${field} must be a string array.`);
}

function parseNumberArray(value: number[] | string, field: string): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => requireArrayNumber(item, field));
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const bracketed = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed : `[${trimmed}]`;
  const parsed = parseJson(bracketed, field);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${field} must be a number array.`);
  }

  return parsed.map((item) => requireArrayNumber(item, field));
}

function requireArrayString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must contain only strings.`);
  }

  return value.trim();
}

function requireArrayNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must contain only finite numbers.`);
  }

  return value;
}

function unsupported(method: string, todo: string): never {
  throw new Error(`PostgresMemoryStore.${method} is not implemented yet. TODO: ${todo}`);
}
