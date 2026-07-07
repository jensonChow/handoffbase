import {
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type CreateRunInput,
  type CreateTraceInput,
  type JsonObject,
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
  type MemoryTrace,
  type MemoryUpdateResult,
  type MemoryWriteResult,
  type MutationOptions,
  type ResolveMemoryConflictOptions,
  type RunRecord,
  type SupersedeMemoryResult,
  type UpdateMemoryPatch
} from "./types.js";
import {
  applyMemoryPatch,
  contextPackFromMemories,
  createMemoryConflictRecord,
  createMemoryRecord,
  createRunRecord,
  markMemoryDeleted,
  resolveMemoryConflictRecord,
  supersedeMemoryRecord,
  touchMemoryUsage
} from "./lifecycle.js";
import {
  createAddEvent,
  createDeleteEvent,
  createMemoryTrace,
  createRecallEvent,
  createSupersedeEvent,
  createUpdateEvent
} from "./events.js";
import { type EventListFilter, type MemoryStore } from "./storage.js";
import { assertValidMemoryConflictRecord, assertValidMemoryEvent, assertValidMemoryRecord } from "./validation.js";
import { cloneJsonObject, isPlainObject, setOptionalString } from "./utils.js";

export interface SqlQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number;
}

export interface SqlQueryClient {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
  /**
   * Optional atomic wrapper. PostgresMemoryStore requires this for memory
   * mutations that must persist a row change and its audit event together.
   * Single-statement writes use query directly and do not require it.
   */
  transaction?<T>(fn: (client: SqlQueryClient) => Promise<T>): Promise<T>;
}

export interface PostgresRecallOptions {
  /**
   * Optional pgvector-ready recall hook. No embedding provider is called by this
   * store; callers may pass a precomputed query embedding in a future branch.
   */
  queryEmbedding?: readonly number[];
  embeddingModel?: string;
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

export interface PostgresRecallRow extends PostgresMemoryRow {
  recall_score?: SqlNumber;
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

export interface PostgresMemoryConflictRow {
  id: string;
  tenant_id: string;
  candidate_memory_id?: string | null;
  existing_memory_id?: string | null;
  conflict_type: string;
  severity: string;
  recommended_action: string;
  status: string;
  reason?: string | null;
  confidence?: SqlNumber;
  resolution?: SqlJsonObject;
  created_at: Date | string;
  resolved_at?: SqlDate;
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

  async addMemory(input: CreateMemoryInput, options: MutationOptions = {}): Promise<MemoryWriteResult> {
    return withRequiredTransaction(this.client, "addMemory", async (client) => {
      const now = optionTime(options);
      const memory = createMemoryRecord(input, now);
      const insertedMemory = await insertMemoryRow(client, memory);
      const event = createAddEvent(insertedMemory, { ...options, now });
      const insertedEvent = await insertEventRow(client, event);

      return {
        memory: insertedMemory,
        event: insertedEvent
      };
    });
  }

  async updateMemory(
    id: string,
    patch: UpdateMemoryPatch,
    options: MutationOptions = {}
  ): Promise<MemoryUpdateResult> {
    return withRequiredTransaction(this.client, "updateMemory", async (client) => {
      const now = optionTime(options);
      const before = await getMemoryRowForUpdate(client, id);
      const memory = applyMemoryPatch(before, patch, now);
      const updatedMemory = await updateMemoryRow(client, memory);
      const event = createUpdateEvent(before, updatedMemory, { ...options, now });
      const insertedEvent = await insertEventRow(client, event);

      return {
        before,
        memory: updatedMemory,
        event: insertedEvent
      };
    });
  }

  async deleteMemory(id: string, options: MutationOptions = {}): Promise<MemoryUpdateResult> {
    return withRequiredTransaction(this.client, "deleteMemory", async (client) => {
      const now = optionTime(options);
      const before = await getMemoryRowForUpdate(client, id);
      const memory = markMemoryDeleted(before, now);
      const updatedMemory = await updateMemoryRow(client, memory);
      const event = createDeleteEvent(before, updatedMemory, { ...options, now });
      const insertedEvent = await insertEventRow(client, event);

      return {
        before,
        memory: updatedMemory,
        event: insertedEvent
      };
    });
  }

  async supersedeMemory(
    id: string,
    replacementInput: CreateMemoryInput,
    options: MutationOptions = {}
  ): Promise<SupersedeMemoryResult> {
    return withRequiredTransaction(this.client, "supersedeMemory", async (client) => {
      const now = optionTime(options);
      const previousBefore = await getMemoryRowForUpdate(client, id);
      const replacement = createMemoryRecord(
        {
          ...replacementInput,
          supersedes: [...(replacementInput.supersedes ?? []), id]
        },
        now
      );
      const insertedReplacement = await insertMemoryRow(client, replacement);
      const previous = supersedeMemoryRecord(previousBefore, insertedReplacement.id, now);
      const updatedPrevious = await updateMemoryRow(client, previous);

      const addEvent = createAddEvent(insertedReplacement, {
        ...options,
        now,
        reason: options.reason ?? `Supersedes memory ${updatedPrevious.id}`
      });
      const insertedAddEvent = await insertEventRow(client, addEvent);
      const supersedeEvent = createSupersedeEvent(previousBefore, updatedPrevious, insertedReplacement, {
        ...options,
        now
      });
      const insertedSupersedeEvent = await insertEventRow(client, supersedeEvent);

      return {
        previous: updatedPrevious,
        replacement: insertedReplacement,
        events: [insertedAddEvent, insertedSupersedeEvent]
      };
    });
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

  async recallMemories(query: MemoryRecallQuery, options: PostgresRecallOptions = {}): Promise<MemoryRecallResult> {
    const now = query.now ?? new Date();
    const scope = normalizeRecallScope(query.scope);
    const recallQuery: MemoryRecallQuery = { ...query, scope, now };

    const selectedQuery = buildRecallQuery(recallQuery, options);
    const selectedResult = await this.client.query<PostgresRecallRow>(selectedQuery.sql, selectedQuery.values);
    const selected = mapRecallRows(selectedResult.rows);

    const ignoredQuery = buildIgnoredMemoryQuery(recallQuery);
    const ignoredResult = await this.client.query<{ id: string }>(ignoredQuery.sql, ignoredQuery.values);
    const ignoredMemoryIds = ignoredResult.rows.map((row) => row.id);

    const touched = await this.touchSelectedMemories(scope.tenantId, selected, now);
    const selectionReasons = buildSelectionReasons(touched, ignoredMemoryIds, query.query);
    const trace = createMemoryTrace(
      {
        tenantId: scope.tenantId,
        runId: query.runId,
        query: query.query,
        selectedMemoryIds: touched.map((memory) => memory.id),
        ignoredMemoryIds,
        contextPack: contextPackFromMemories(touched),
        selectionReasons,
        metadata: query.metadata
      },
      now
    );
    await this.insertTrace(trace);

    const event = createRecallEvent(trace, {
      actor: query.actor,
      reason: query.query,
      metadata: query.metadata
    });
    await this.insertEvent(event);

    return {
      memories: touched,
      trace,
      event,
      ignoredMemoryIds
    };
  }

  async upsertEmbedding(embedding: MemoryEmbedding): Promise<MemoryEmbedding> {
    const result = await this.client.query<PostgresMemoryEmbeddingRow>(UPSERT_EMBEDDING_SQL, [
      embedding.memoryId,
      vectorParam(embedding.embedding),
      embedding.embeddingModel,
      requiredInputDate(embedding.createdAt, "createdAt")
    ]);

    return mapPostgresEmbeddingRow(requireReturnedRow(result, "upsertEmbedding"));
  }

  async getEmbedding(memoryId: string): Promise<MemoryEmbedding | undefined> {
    const result = await this.client.query<PostgresMemoryEmbeddingRow>(
      "select * from memory_embeddings where memory_id = $1",
      [memoryId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresEmbeddingRow(row);
  }

  async addRun(input: CreateRunInput): Promise<RunRecord> {
    const run = createRunRecord(input);
    return insertRunRow(this.client, run);
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    const result = await this.client.query<PostgresRunRow>("select * from runs where id = $1", [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresRunRow(row);
  }

  async addTrace(input: CreateTraceInput): Promise<MemoryTrace> {
    const trace = createMemoryTrace(input);
    return insertTraceRow(this.client, trace);
  }

  async getTrace(id: string): Promise<MemoryTrace | undefined> {
    const result = await this.client.query<PostgresMemoryTraceRow>("select * from memory_traces where id = $1", [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresTraceRow(row);
  }

  async addConflict(
    input: AddMemoryConflictInput,
    options: MutationOptions = {}
  ): Promise<MemoryConflictRecord> {
    const conflict = createMemoryConflictRecord(input, optionTime(options));
    const result = await this.client.query<PostgresMemoryConflictRow>(
      `insert into memory_conflicts (
  id,
  tenant_id,
  candidate_memory_id,
  existing_memory_id,
  conflict_type,
  severity,
  recommended_action,
  status,
  reason,
  confidence,
  resolution,
  created_at,
  resolved_at,
  metadata
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14::jsonb)
returning *`,
      [
        conflict.id,
        conflict.tenantId,
        conflict.candidateMemoryId ?? null,
        conflict.existingMemoryId ?? null,
        conflict.conflictType,
        conflict.severity,
        conflict.recommendedAction,
        conflict.status,
        conflict.reason ?? null,
        conflict.confidence ?? null,
        conflict.resolution === undefined ? null : JSON.stringify(conflict.resolution),
        conflict.createdAt,
        conflict.resolvedAt ?? null,
        JSON.stringify(conflict.metadata)
      ]
    );
    const row = result.rows[0];
    return row === undefined ? conflict : mapPostgresConflictRow(row);
  }

  async getConflict(id: string): Promise<MemoryConflictRecord | undefined> {
    const result = await this.client.query<PostgresMemoryConflictRow>(
      "select * from memory_conflicts where id = $1",
      [id]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapPostgresConflictRow(row);
  }

  async listConflicts(filter: MemoryConflictListFilter = {}): Promise<MemoryConflictRecord[]> {
    const query = buildConflictListQuery(filter);
    const result = await this.client.query<PostgresMemoryConflictRow>(query.sql, query.values);
    return result.rows.map(mapPostgresConflictRow);
  }

  async resolveConflict(
    id: string,
    resolution: MemoryConflictResolution,
    options: ResolveMemoryConflictOptions = {}
  ): Promise<MemoryConflictResolutionResult> {
    const before = await this.getConflict(id);
    if (before === undefined) {
      throw new Error(`Memory conflict not found: ${id}`);
    }

    const conflict = resolveMemoryConflictRecord(before, resolution, {
      ...options,
      now: optionTime(options)
    });
    const result = await this.client.query<PostgresMemoryConflictRow>(
      `update memory_conflicts
set status = $2,
    resolution = $3::jsonb,
    resolved_at = $4,
    metadata = $5::jsonb
where id = $1
returning *`,
      [
        id,
        conflict.status,
        JSON.stringify(conflict.resolution),
        conflict.resolvedAt,
        JSON.stringify(conflict.metadata)
      ]
    );

    return {
      before,
      conflict: result.rows[0] === undefined ? conflict : mapPostgresConflictRow(result.rows[0])
    };
  }

  async listEvents(filter: EventListFilter = {}): Promise<MemoryEvent[]> {
    const query = buildEventListQuery(filter);
    const result = await this.client.query<PostgresMemoryEventRow>(query.sql, query.values);
    return result.rows.map(mapPostgresEventRow);
  }

  private async touchSelectedMemories(tenantId: string, selected: MemoryRecord[], now: Date): Promise<MemoryRecord[]> {
    if (selected.length === 0) {
      return [];
    }

    const selectedMemoryIds = selected.map((memory) => memory.id);
    const result = await this.client.query<PostgresMemoryRow>(
      `update memories
set last_used_at = $1,
    use_count = use_count + 1
where tenant_id = $2 and id = any($3::text[])
returning *`,
      [now, tenantId, selectedMemoryIds]
    );

    if (result.rows.length === 0) {
      return selected.map((memory) => touchMemoryUsage(memory, now));
    }

    const updatedById = new Map(result.rows.map((row) => [row.id, mapPostgresMemoryRow(row)] as const));
    return selected.map((memory) => updatedById.get(memory.id) ?? touchMemoryUsage(memory, now));
  }

  private async insertTrace(trace: MemoryTrace): Promise<void> {
    await this.client.query(
      `insert into memory_traces (
  id,
  tenant_id,
  run_id,
  query,
  selected_memory_ids,
  ignored_memory_ids,
  context_pack,
  selection_reasons,
  created_at,
  metadata
) values ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::jsonb, $9, $10::jsonb)`,
      [
        trace.id,
        trace.tenantId,
        trace.runId ?? null,
        trace.query ?? null,
        trace.selectedMemoryIds,
        trace.ignoredMemoryIds,
        trace.contextPack ?? null,
        trace.selectionReasons,
        trace.createdAt,
        trace.metadata
      ]
    );
  }

  private async insertEvent(event: MemoryEvent): Promise<void> {
    await this.client.query(
      `insert into memory_events (
  id,
  tenant_id,
  memory_id,
  run_id,
  trace_id,
  event_type,
  actor_type,
  actor_id,
  reason,
  before,
  after,
  created_at,
  metadata
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13::jsonb)`,
      [
        event.id,
        event.tenantId,
        event.memoryId ?? null,
        event.runId ?? null,
        event.traceId ?? null,
        event.eventType,
        event.actor.type,
        event.actor.id ?? null,
        event.reason ?? null,
        event.before ?? null,
        event.after ?? null,
        event.createdAt,
        event.metadata
      ]
    );
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

export function mapPostgresConflictRow(row: PostgresMemoryConflictRow): MemoryConflictRecord {
  const conflict: MemoryConflictRecord = {
    id: row.id,
    tenantId: row.tenant_id,
    conflictType: row.conflict_type as MemoryConflictRecord["conflictType"],
    severity: row.severity as MemoryConflictRecord["severity"],
    recommendedAction: row.recommended_action as MemoryConflictRecord["recommendedAction"],
    status: row.status as MemoryConflictRecord["status"],
    createdAt: requiredDate(row.created_at, "created_at"),
    metadata: parseJsonObject(row.metadata, "metadata")
  };

  setOptionalString(conflict, "candidateMemoryId", optionalString(row.candidate_memory_id));
  setOptionalString(conflict, "existingMemoryId", optionalString(row.existing_memory_id));
  setOptionalString(conflict, "reason", optionalString(row.reason));
  const confidence = optionalNumber(row.confidence, "confidence");
  if (confidence !== undefined) {
    conflict.confidence = confidence;
  }
  const resolution = parseOptionalConflictResolution(row.resolution, "resolution");
  if (resolution !== undefined) {
    conflict.resolution = resolution;
  }
  const resolvedAt = optionalDate(row.resolved_at, "resolved_at");
  if (resolvedAt !== undefined) {
    conflict.resolvedAt = resolvedAt;
  }

  assertValidMemoryConflictRecord(conflict);
  return conflict;
}

export function mapPostgresEmbeddingRow(row: PostgresMemoryEmbeddingRow): MemoryEmbedding {
  return {
    memoryId: row.memory_id,
    embedding: parseNumberArray(row.embedding, "embedding"),
    embeddingModel: row.embedding_model,
    createdAt: requiredDate(row.created_at, "created_at")
  };
}

const INSERT_MEMORY_SQL = `
insert into memories (
  id,
  tenant_id,
  user_id,
  agent_profile_id,
  project_id,
  host_id,
  session_id,
  tool_id,
  type,
  canonical_text,
  raw_source,
  source_kind,
  status,
  confidence,
  importance,
  valid_from,
  valid_until,
  supersedes,
  superseded_by,
  created_at,
  updated_at,
  last_used_at,
  use_count,
  metadata
) values (
  $1, $2, $3, $4, $5, $6, $7, $8,
  $9, $10, $11, $12, $13, $14, $15, $16,
  $17, $18::text[], $19, $20, $21, $22, $23, $24::jsonb
)
returning *
`;

const UPDATE_MEMORY_SQL = `
update memories set
  agent_profile_id = $2,
  project_id = $3,
  host_id = $4,
  session_id = $5,
  tool_id = $6,
  type = $7,
  canonical_text = $8,
  raw_source = $9,
  source_kind = $10,
  status = $11,
  confidence = $12,
  importance = $13,
  valid_from = $14,
  valid_until = $15,
  supersedes = $16::text[],
  superseded_by = $17,
  updated_at = $18,
  last_used_at = $19,
  use_count = $20,
  metadata = $21::jsonb
where id = $1
returning *
`;

const SELECT_MEMORY_FOR_UPDATE_SQL = "select * from memories where id = $1 for update";

const INSERT_EVENT_SQL = `
insert into memory_events (
  id,
  tenant_id,
  memory_id,
  run_id,
  trace_id,
  event_type,
  actor_type,
  actor_id,
  reason,
  before,
  after,
  created_at,
  metadata
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13::jsonb
)
returning *
`;

const UPSERT_EMBEDDING_SQL = `
insert into memory_embeddings (
  memory_id,
  embedding,
  embedding_model,
  created_at
) values (
  $1, $2::vector, $3, $4
)
on conflict (memory_id) do update set
  embedding = excluded.embedding,
  embedding_model = excluded.embedding_model,
  created_at = excluded.created_at
returning *
`;

const INSERT_RUN_SQL = `
insert into runs (
  id,
  tenant_id,
  user_id,
  host_id,
  agent_profile_id,
  project_id,
  task_hint,
  summary,
  outcome,
  started_at,
  ended_at,
  metadata
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
)
returning *
`;

const INSERT_TRACE_SQL = `
insert into memory_traces (
  id,
  tenant_id,
  run_id,
  query,
  selected_memory_ids,
  ignored_memory_ids,
  context_pack,
  selection_reasons,
  created_at,
  metadata
) values (
  $1, $2, $3, $4, $5::text[], $6::text[], $7, $8::jsonb, $9, $10::jsonb
)
returning *
`;

interface SqlQueryParts {
  sql: string;
  values: unknown[];
}

async function withRequiredTransaction<T>(
  client: SqlQueryClient,
  method: string,
  fn: (client: SqlQueryClient) => Promise<T>
): Promise<T> {
  if (client.transaction === undefined) {
    throw new Error(
      `PostgresMemoryStore.${method} requires SqlQueryClient.transaction for atomic memory and event writes.`
    );
  }

  return client.transaction(fn);
}

async function getMemoryRowForUpdate(client: SqlQueryClient, id: string): Promise<MemoryRecord> {
  const result = await client.query<PostgresMemoryRow>(SELECT_MEMORY_FOR_UPDATE_SQL, [id]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(`Memory not found: ${id}`);
  }

  return mapPostgresMemoryRow(row);
}

async function insertMemoryRow(client: SqlQueryClient, memory: MemoryRecord): Promise<MemoryRecord> {
  const result = await client.query<PostgresMemoryRow>(INSERT_MEMORY_SQL, memoryInsertValues(memory));
  return mapPostgresMemoryRow(requireReturnedRow(result, "insertMemory"));
}

async function updateMemoryRow(client: SqlQueryClient, memory: MemoryRecord): Promise<MemoryRecord> {
  const result = await client.query<PostgresMemoryRow>(UPDATE_MEMORY_SQL, memoryUpdateValues(memory));
  return mapPostgresMemoryRow(requireReturnedRow(result, "updateMemory"));
}

async function insertEventRow(client: SqlQueryClient, event: MemoryEvent): Promise<MemoryEvent> {
  const result = await client.query<PostgresMemoryEventRow>(INSERT_EVENT_SQL, eventInsertValues(event));
  return mapPostgresEventRow(requireReturnedRow(result, "insertEvent"));
}

async function insertRunRow(client: SqlQueryClient, run: RunRecord): Promise<RunRecord> {
  const result = await client.query<PostgresRunRow>(INSERT_RUN_SQL, runInsertValues(run));
  return mapPostgresRunRow(requireReturnedRow(result, "insertRun"));
}

async function insertTraceRow(client: SqlQueryClient, trace: MemoryTrace): Promise<MemoryTrace> {
  const result = await client.query<PostgresMemoryTraceRow>(INSERT_TRACE_SQL, traceInsertValues(trace));
  return mapPostgresTraceRow(requireReturnedRow(result, "insertTrace"));
}

function requireReturnedRow<Row>(result: SqlQueryResult<Row>, operation: string): Row {
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(`PostgresMemoryStore.${operation} did not return a row.`);
  }

  return row;
}

function memoryInsertValues(memory: MemoryRecord): unknown[] {
  return [
    memory.id,
    memory.scope.tenantId,
    memory.scope.userId,
    nullableString(memory.scope.agentProfileId),
    nullableString(memory.scope.projectId),
    nullableString(memory.scope.hostId),
    nullableString(memory.scope.sessionId),
    nullableString(memory.scope.toolId),
    memory.type,
    memory.canonicalText,
    nullableString(memory.rawSource),
    memory.sourceKind,
    memory.status,
    memory.confidence,
    memory.importance,
    nullableDate(memory.validFrom, "validFrom"),
    nullableDate(memory.validUntil, "validUntil"),
    [...memory.supersedes],
    nullableString(memory.supersededBy),
    requiredInputDate(memory.createdAt, "createdAt"),
    requiredInputDate(memory.updatedAt, "updatedAt"),
    nullableDate(memory.lastUsedAt, "lastUsedAt"),
    memory.useCount,
    jsonParam(memory.metadata)
  ];
}

function memoryUpdateValues(memory: MemoryRecord): unknown[] {
  return [
    memory.id,
    nullableString(memory.scope.agentProfileId),
    nullableString(memory.scope.projectId),
    nullableString(memory.scope.hostId),
    nullableString(memory.scope.sessionId),
    nullableString(memory.scope.toolId),
    memory.type,
    memory.canonicalText,
    nullableString(memory.rawSource),
    memory.sourceKind,
    memory.status,
    memory.confidence,
    memory.importance,
    nullableDate(memory.validFrom, "validFrom"),
    nullableDate(memory.validUntil, "validUntil"),
    [...memory.supersedes],
    nullableString(memory.supersededBy),
    requiredInputDate(memory.updatedAt, "updatedAt"),
    nullableDate(memory.lastUsedAt, "lastUsedAt"),
    memory.useCount,
    jsonParam(memory.metadata)
  ];
}

function eventInsertValues(event: MemoryEvent): unknown[] {
  return [
    event.id,
    event.tenantId,
    nullableString(event.memoryId),
    nullableString(event.runId),
    nullableString(event.traceId),
    event.eventType,
    event.actor.type,
    nullableString(event.actor.id),
    nullableString(event.reason),
    optionalJsonParam(event.before),
    optionalJsonParam(event.after),
    requiredInputDate(event.createdAt, "createdAt"),
    jsonParam(event.metadata)
  ];
}

function runInsertValues(run: RunRecord): unknown[] {
  return [
    run.id,
    run.tenantId,
    run.userId,
    nullableString(run.hostId),
    nullableString(run.agentProfileId),
    nullableString(run.projectId),
    nullableString(run.taskHint),
    nullableString(run.summary),
    nullableString(run.outcome),
    nullableDate(run.startedAt, "startedAt"),
    nullableDate(run.endedAt, "endedAt"),
    jsonParam(run.metadata)
  ];
}

function traceInsertValues(trace: MemoryTrace): unknown[] {
  return [
    trace.id,
    trace.tenantId,
    nullableString(trace.runId),
    nullableString(trace.query),
    [...trace.selectedMemoryIds],
    [...trace.ignoredMemoryIds],
    nullableString(trace.contextPack),
    jsonParam(trace.selectionReasons),
    requiredInputDate(trace.createdAt, "createdAt"),
    jsonParam(trace.metadata)
  ];
}

function vectorParam(values: number[]): string {
  return `[${values.map((value) => requireArrayNumber(value, "embedding")).join(",")}]`;
}

function optionTime(options: { now?: Date }): Date {
  return options.now === undefined ? new Date() : requiredInputDate(options.now, "now");
}

function nullableString(value: string | undefined): string | null {
  return value === undefined ? null : value;
}

function nullableDate(value: Date | undefined, field: string): Date | null {
  return value === undefined ? null : requiredInputDate(value, field);
}

function requiredInputDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${field} must be a valid date.`);
  }

  return new Date(value.getTime());
}

function jsonParam(value: JsonObject | Record<string, string>): string {
  return JSON.stringify(value);
}

function optionalJsonParam(value: JsonObject | undefined): string | null {
  return value === undefined ? null : jsonParam(value);
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

function buildConflictListQuery(filter: MemoryConflictListFilter): SqlQueryParts {
  const values: unknown[] = [];
  const where: string[] = [];

  addExactFilter(where, values, "tenant_id", filter.tenantId);
  addExactFilter(where, values, "candidate_memory_id", filter.candidateMemoryId);
  addExactFilter(where, values, "existing_memory_id", filter.existingMemoryId);

  if (filter.statuses !== undefined && filter.statuses.length > 0) {
    values.push(filter.statuses);
    where.push(`status = any($${values.length}::text[])`);
  }

  if (filter.conflictTypes !== undefined && filter.conflictTypes.length > 0) {
    values.push(filter.conflictTypes);
    where.push(`conflict_type = any($${values.length}::text[])`);
  }

  return {
    sql: `select * from memory_conflicts${whereClause(where)} order by created_at desc`,
    values
  };
}

export function buildRecallQuery(query: MemoryRecallQuery, options: PostgresRecallOptions = {}): SqlQueryParts {
  const values: unknown[] = [];
  const where: string[] = [];
  const scope = normalizeRecallScope(query.scope);
  const nowIndex = addRecallableFilters(where, values, scope, query.types, query.now ?? new Date(), "m");
  const terms = tokenizeRecallQuery(query.query);
  const vector = buildVectorRecallSql(values, options);

  values.push(terms);
  const termsIndex = values.length;
  values.push(normalizeRecallLimit(query.limit));
  const limitIndex = values.length;

  const scoreSql = buildRecallScoreSql({
    tableAlias: "m",
    termsIndex,
    nowIndex,
    vectorScoreSql: vector.scoreSql
  });

  return {
    sql: `select m.*,
  (${scoreSql}) as recall_score
from memories m${vector.joinSql}${whereClause(where)}
order by recall_score desc,
  m.importance desc,
  m.confidence desc,
  m.last_used_at desc nulls last,
  m.use_count desc,
  m.updated_at desc,
  m.created_at desc
limit $${limitIndex}`,
    values
  };
}

export function buildIgnoredMemoryQuery(query: MemoryRecallQuery): SqlQueryParts {
  const values: unknown[] = [];
  const where: string[] = [];
  const scope = normalizeRecallScope(query.scope);

  addRecallScopeFilters(where, values, scope, "m");
  addMemoryTypeFilter(where, values, query.types, "m");
  values.push(query.now ?? new Date());
  where.push(`not (${recallableLifecycleSql("m", values.length)})`);

  return {
    sql: `select m.id
from memories m${whereClause(where)}
order by m.updated_at desc, m.created_at desc`,
    values
  };
}

export function mapRecallRows(rows: readonly PostgresRecallRow[]): MemoryRecord[] {
  return rows.map(mapPostgresMemoryRow);
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

function addRecallableFilters(
  where: string[],
  values: unknown[],
  scope: MemoryRecallQuery["scope"],
  types: MemoryRecallQuery["types"],
  now: Date,
  tableAlias: string
): number {
  addRecallScopeFilters(where, values, scope, tableAlias);
  addMemoryTypeFilter(where, values, types, tableAlias);
  values.push(now);
  const nowIndex = values.length;
  where.push(recallableLifecycleSql(tableAlias, nowIndex));
  return nowIndex;
}

function addRecallScopeFilters(
  where: string[],
  values: unknown[],
  scope: MemoryRecallQuery["scope"],
  tableAlias: string
): void {
  addAliasedExactFilter(where, values, tableAlias, "tenant_id", requiredScopeString(scope.tenantId, "tenantId"));
  addAliasedExactFilter(where, values, tableAlias, "user_id", requiredScopeString(scope.userId, "userId"));
  addAliasedScopedDimensionFilter(where, values, tableAlias, "agent_profile_id", scope.agentProfileId);
  addAliasedScopedDimensionFilter(where, values, tableAlias, "project_id", scope.projectId);
  addAliasedScopedDimensionFilter(where, values, tableAlias, "host_id", scope.hostId);
  addAliasedScopedDimensionFilter(where, values, tableAlias, "session_id", scope.sessionId);
  addAliasedScopedDimensionFilter(where, values, tableAlias, "tool_id", scope.toolId);
}

function addMemoryTypeFilter(
  where: string[],
  values: unknown[],
  types: MemoryRecallQuery["types"],
  tableAlias: string
): void {
  if (types === undefined) {
    return;
  }

  if (types.length === 0) {
    where.push("false");
    return;
  }

  values.push(types);
  where.push(`${tableAlias}.type = any($${values.length}::text[])`);
}

function addAliasedExactFilter(
  where: string[],
  values: unknown[],
  tableAlias: string,
  column: string,
  value: string
): void {
  values.push(value);
  where.push(`${tableAlias}.${column} = $${values.length}`);
}

function addAliasedScopedDimensionFilter(
  where: string[],
  values: unknown[],
  tableAlias: string,
  column: string,
  value: string | undefined
): void {
  const normalized = optionalString(value);
  if (normalized === undefined) {
    return;
  }

  values.push(normalized);
  where.push(`(${tableAlias}.${column} is null or ${tableAlias}.${column} = $${values.length})`);
}

function recallableLifecycleSql(tableAlias: string, nowIndex: number): string {
  return [
    `${tableAlias}.status = 'active'`,
    `${tableAlias}.superseded_by is null`,
    `(${tableAlias}.valid_from is null or ${tableAlias}.valid_from <= $${nowIndex})`,
    `(${tableAlias}.valid_until is null or ${tableAlias}.valid_until > $${nowIndex})`
  ].join(" and ");
}

function buildRecallScoreSql(input: {
  tableAlias: string;
  termsIndex: number;
  nowIndex: number;
  vectorScoreSql: string;
}): string {
  const alias = input.tableAlias;
  return [
    `${alias}.importance::double precision * 2.0`,
    `${alias}.confidence::double precision * 0.5`,
    keywordScoreSql(alias, input.termsIndex),
    `least(${alias}.use_count, 20)::double precision * 0.01`,
    `case
    when ${alias}.last_used_at is null then 0
    else 0.05 / (1 + greatest(extract(epoch from ($${input.nowIndex}::timestamptz - ${alias}.last_used_at)) / 86400, 0))
  end`,
    input.vectorScoreSql
  ].join(" + ");
}

function keywordScoreSql(tableAlias: string, termsIndex: number): string {
  return `case
    when cardinality($${termsIndex}::text[]) = 0 then 0
    else (
      select coalesce(sum(
        case when lower(${tableAlias}.canonical_text) like '%' || query_terms.term || '%' then 1.0 else 0 end +
        case when lower(${tableAlias}.type) = query_terms.term then 0.5 else 0 end +
        case when lower(${tableAlias}.source_kind) like '%' || query_terms.term || '%' then 0.25 else 0 end
      ), 0) / greatest(cardinality($${termsIndex}::text[]), 1)
      from unnest($${termsIndex}::text[]) as query_terms(term)
    )
  end`;
}

function buildVectorRecallSql(
  values: unknown[],
  options: PostgresRecallOptions
): { joinSql: string; scoreSql: string } {
  if (options.queryEmbedding === undefined || options.queryEmbedding.length === 0) {
    return {
      joinSql: "",
      scoreSql: "0"
    };
  }

  values.push(formatPgVector(options.queryEmbedding));
  const embeddingIndex = values.length;
  let modelClause = "";

  if (options.embeddingModel !== undefined) {
    values.push(options.embeddingModel);
    modelClause = ` and e.embedding_model = $${values.length}`;
  }

  return {
    joinSql: ` left join memory_embeddings e on e.memory_id = m.id${modelClause}`,
    scoreSql: `case when e.embedding is null then 0 else 1 - (e.embedding <=> $${embeddingIndex}::vector) end`
  };
}

function buildSelectionReasons(
  selected: MemoryRecord[],
  ignoredMemoryIds: string[],
  query: string | undefined
): Record<string, string> {
  const reasons: Record<string, string> = {};
  const hasQuery = query !== undefined && query.trim().length > 0;

  for (const memory of selected) {
    reasons[memory.id] = hasQuery
      ? `Matched recall query within ${memory.type}.`
      : `Selected active ${memory.type} memory.`;
  }

  for (const memoryId of ignoredMemoryIds) {
    reasons[memoryId] = "Ignored because memory is not recallable at retrieval time.";
  }

  return reasons;
}

function normalizeRecallScope(scope: MemoryRecallQuery["scope"]): MemoryRecallQuery["scope"] {
  return {
    tenantId: requiredScopeString(scope.tenantId, "tenantId"),
    userId: requiredScopeString(scope.userId, "userId"),
    agentProfileId: optionalString(scope.agentProfileId),
    projectId: optionalString(scope.projectId),
    hostId: optionalString(scope.hostId),
    sessionId: optionalString(scope.sessionId),
    toolId: optionalString(scope.toolId)
  };
}

function requiredScopeString(value: string, field: string): string {
  const normalized = optionalString(value);
  if (normalized === undefined) {
    throw new Error(`Memory recall scope requires ${field}.`);
  }

  return normalized;
}

function normalizeRecallLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Memory recall limit must be a positive integer.");
  }

  return limit;
}

function tokenizeRecallQuery(query: string | undefined): string[] {
  if (query === undefined) {
    return [];
  }

  return [...new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length >= 3))];
}

function formatPgVector(embedding: readonly number[]): string {
  const values = embedding.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error("queryEmbedding must contain only finite numbers.");
    }

    return String(value);
  });

  return `[${values.join(",")}]`;
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

function optionalNumber(value: SqlNumber, field: string): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return requiredNumber(value, field);
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

function parseOptionalConflictResolution(
  value: SqlJsonObject,
  field: string
): MemoryConflictResolution | undefined {
  const object = parseOptionalJsonObject(value, field);
  return object === undefined ? undefined : (object as MemoryConflictResolution);
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
