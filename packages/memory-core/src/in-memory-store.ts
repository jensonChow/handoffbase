import {
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type CreateMemoryFeedbackInput,
  type CreateRunInput,
  type CreateTraceInput,
  type JsonObject,
  type MemoryEmbedding,
  type MemoryFeedbackListFilter,
  type MemoryFeedbackRecord,
  type MemoryFeedbackWithCorrectionOptions,
  type MemoryFeedbackWithCorrectionResult,
  type MemoryConflictListFilter,
  type MemoryConflictRecord,
  type MemoryConflictResolution,
  type MemoryConflictResolutionResult,
  type MemoryEvent,
  type MemoryListFilter,
  type MemoryRecallQuery,
  type MemoryRecallResult,
  type MemoryRecord,
  type MemoryDeleteResult,
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
import {
  applyMemoryPatch,
  assertMemoryExpectedStatus,
  compareRecallRank,
  createMemoryConflictRecord,
  createMemoryRecord,
  createRunRecord,
  getEffectiveMemoryStatus,
  isRecallableMemory,
  lexicalRecallScore,
  netFeedbackByMemoryId,
  normalizeRecallLimit,
  recallQueryTerms,
  resolveMemoryConflictRecord,
  retentionScore,
  scopeMatches,
  supersedeMemoryRecord,
  touchMemoryUsage
} from "./lifecycle.js";
import {
  createAddEvent,
  createDeleteEvent,
  createMemoryTrace,
  createRecallEvent,
  createSupersedeEvent,
  createUpdateEvent,
  HARD_DELETE_REDACTED_EVENT_REASON
} from "./events.js";
import { type EventListFilter, type MemoryStore } from "./storage.js";
import { cloneJsonObject, cloneMemoryConflictRecord, cloneMemoryRecord, isPlainObject } from "./utils.js";
import { cloneMemoryFeedbackRecord, createMemoryFeedbackRecord } from "./feedback.js";
import { cosineSimilarity } from "./embeddings/provider.js";

/**
 * Weight applied to non-negative cosine similarity when a query embedding is
 * supplied. The lexical keyword term contributes up to 1.0, so an equal weight
 * lets a strong semantic match outrank a weak lexical one without erasing the
 * lexical signal. With no query embedding this term is 0, preserving the exact
 * prior lexical ordering.
 */
const SEMANTIC_RECALL_WEIGHT = 1;

export interface InMemoryMemoryStoreOptions {
  clock?: () => Date;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly clock: () => Date;
  private readonly memories = new Map<string, MemoryRecord>();
  private readonly embeddings = new Map<string, MemoryEmbedding>();
  private readonly events = new Map<string, MemoryEvent>();
  private readonly feedback = new Map<string, MemoryFeedbackRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly traces = new Map<string, MemoryTrace>();
  private readonly conflicts = new Map<string, MemoryConflictRecord>();

  constructor(options: InMemoryMemoryStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
  }

  async addMemory(input: CreateMemoryInput, options: MutationOptions = {}): Promise<MemoryWriteResult> {
    const now = this.optionTime(options);
    const memory = createMemoryRecord(input, now);

    if (this.memories.has(memory.id)) {
      throw new Error(`Memory already exists: ${memory.id}`);
    }

    this.memories.set(memory.id, cloneMemoryRecord(memory));
    const event = createAddEvent(memory, { ...options, now });
    this.events.set(event.id, cloneMemoryEvent(event));

    return {
      memory: cloneMemoryRecord(memory),
      event: cloneMemoryEvent(event)
    };
  }

  async updateMemory(
    id: string,
    patch: UpdateMemoryPatch,
    options: MutationOptions = {}
  ): Promise<MemoryUpdateResult> {
    const now = this.optionTime(options);
    const before = this.requireMemory(id);
    assertMemoryExpectedStatus(before, options.expectedStatus);
    const memory = applyMemoryPatch(before, patch, now);
    this.memories.set(id, cloneMemoryRecord(memory));

    const event = createUpdateEvent(before, memory, { ...options, now });
    this.events.set(event.id, cloneMemoryEvent(event));

    return {
      before,
      memory: cloneMemoryRecord(memory),
      event: cloneMemoryEvent(event)
    };
  }

  async deleteMemory(id: string, options: MutationOptions = {}): Promise<MemoryDeleteResult> {
    const now = this.optionTime(options);
    const before = this.requireMemory(id);

    this.memories.delete(id);
    this.embeddings.delete(id);
    this.redactHistoricalContentForHardDelete(id);

    const event = createDeleteEvent(before, { ...options, now });
    this.events.set(event.id, cloneMemoryEvent(event));

    return {
      deletedMemoryId: before.id,
      scope: { ...before.scope },
      event: cloneMemoryEvent(event)
    };
  }

  async supersedeMemory(
    id: string,
    replacementInput: CreateMemoryInput,
    options: MutationOptions = {}
  ): Promise<SupersedeMemoryResult> {
    const now = this.optionTime(options);
    const previousBefore = this.requireMemory(id);
    const replacement = createMemoryRecord(
      {
        ...replacementInput,
        supersedes: [...(replacementInput.supersedes ?? []), id]
      },
      now
    );

    if (this.memories.has(replacement.id)) {
      throw new Error(`Memory already exists: ${replacement.id}`);
    }

    const previous = supersedeMemoryRecord(previousBefore, replacement.id, now);
    this.memories.set(previous.id, cloneMemoryRecord(previous));
    this.memories.set(replacement.id, cloneMemoryRecord(replacement));

    const addEvent = createAddEvent(replacement, {
      ...options,
      now,
      reason: options.reason ?? `Supersedes memory ${previous.id}`
    });
    const supersedeEvent = createSupersedeEvent(previousBefore, previous, replacement, { ...options, now });
    this.events.set(addEvent.id, cloneMemoryEvent(addEvent));
    this.events.set(supersedeEvent.id, cloneMemoryEvent(supersedeEvent));

    return {
      previous: cloneMemoryRecord(previous),
      replacement: cloneMemoryRecord(replacement),
      events: [cloneMemoryEvent(addEvent), cloneMemoryEvent(supersedeEvent)]
    };
  }

  async getMemory(id: string): Promise<MemoryRecord | undefined> {
    const memory = this.memories.get(id);
    return memory ? cloneMemoryRecord(memory) : undefined;
  }

  async listMemories(filter: MemoryListFilter = {}): Promise<MemoryRecord[]> {
    const at = filter.now ?? this.clock();
    const memories = [...this.memories.values()].filter((memory) => {
      if (filter.scope !== undefined && !scopeMatches(memory.scope, filter.scope)) {
        return false;
      }

      if (filter.types !== undefined && !filter.types.includes(memory.type)) {
        return false;
      }

      const effectiveStatus = getEffectiveMemoryStatus(memory, at);

      if (filter.statuses !== undefined && !filter.statuses.includes(effectiveStatus)) {
        return false;
      }

      if (filter.statuses === undefined && !filter.includeExpiredByValidity && effectiveStatus === "expired") {
        return false;
      }

      return true;
    });

    return memories.map((memory) => cloneMemoryRecord(memory));
  }

  async recallMemories(query: MemoryRecallQuery): Promise<MemoryRecallResult> {
    const limit = normalizeRecallLimit(query.limit);
    const now = query.now ?? this.clock();
    const scoped = [...this.memories.values()].filter((memory) => {
      if (!scopeMatches(memory.scope, query.scope)) {
        return false;
      }

      return query.types === undefined || query.types.includes(memory.type);
    });

    const ignored = scoped.filter((memory) => !isRecallableMemory(memory, now));
    const recallable = scoped.filter((memory) => isRecallableMemory(memory, now));
    // One ranking everywhere: the same additive formula as the Postgres
    // buildRecallScoreSql — the shared retention prior (importance,
    // confidence, capped usage, recency, bounded feedback reinforcement)
    // plus the shared lexical term and the semantic cosine bonus. Memory ids
    // are globally unique, so the unfiltered feedback aggregate cannot leak
    // ranking signal across scopes. Precompute each score once (the semantic
    // term reads a stored vector) so the comparator is a cheap map lookup
    // and cannot recompute inconsistently.
    const feedbackNet = netFeedbackByMemoryId([...this.feedback.values()]);
    const terms = recallQueryTerms(query.query);
    const recallScores = new Map(
      recallable.map((memory) => [
        memory.id,
        retentionScore(memory, now, feedbackNet.get(memory.id) ?? 0) +
          lexicalRecallScore(memory, terms) +
          this.semanticBonus(memory, query.queryEmbedding)
      ])
    );
    const selected = recallable
      .sort((left, right) =>
        compareRecallRank(left, right, recallScores.get(left.id) ?? 0, recallScores.get(right.id) ?? 0)
      )
      .slice(0, limit);

    const touched = selected.map((memory) => touchMemoryUsage(memory, now));
    for (const memory of touched) {
      this.memories.set(memory.id, cloneMemoryRecord(memory));
    }

    const selectionReasons = Object.fromEntries(
      touched.map((memory) => [
        memory.id,
        query.query ? `Matched recall query within ${memory.type}.` : `Selected active ${memory.type} memory.`
      ])
    );

    const trace = createMemoryTrace(
      {
        tenantId: query.scope.tenantId,
        runId: query.runId,
        query: query.query,
        selectedMemoryIds: touched.map((memory) => memory.id),
        ignoredMemoryIds: ignored.map((memory) => memory.id),
        contextPack: touched.map((memory) => `- [${memory.type}] ${memory.canonicalText}`).join("\n"),
        selectionReasons,
        metadata: query.metadata
      },
      now
    );
    this.traces.set(trace.id, cloneMemoryTrace(trace));

    const event = createRecallEvent(trace, {
      actor: query.actor,
      reason: query.query,
      metadata: query.metadata
    });
    this.events.set(event.id, cloneMemoryEvent(event));

    return {
      memories: touched.map((memory) => cloneMemoryRecord(memory)),
      trace: cloneMemoryTrace(trace),
      event: cloneMemoryEvent(event),
      ignoredMemoryIds: ignored.map((memory) => memory.id)
    };
  }

  async upsertEmbedding(embedding: MemoryEmbedding): Promise<MemoryEmbedding> {
    const clone = cloneEmbedding(embedding);
    this.embeddings.set(clone.memoryId, clone);
    return cloneEmbedding(clone);
  }

  async getEmbedding(memoryId: string): Promise<MemoryEmbedding | undefined> {
    const embedding = this.embeddings.get(memoryId);
    return embedding ? cloneEmbedding(embedding) : undefined;
  }

  private semanticBonus(memory: MemoryRecord, queryEmbedding?: readonly number[]): number {
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return 0;
    }
    const stored = this.embeddings.get(memory.id);
    if (!stored) {
      return 0;
    }
    return SEMANTIC_RECALL_WEIGHT * Math.max(0, cosineSimilarity(stored.embedding, queryEmbedding));
  }

  async addFeedback(
    input: CreateMemoryFeedbackInput,
    options: MutationOptions = {}
  ): Promise<MemoryFeedbackRecord> {
    this.assertFeedbackTargetsAvailable(input);
    const feedback = createMemoryFeedbackRecord(input, {
      ...options,
      now: this.optionTime(options)
    });
    if (this.feedback.has(feedback.id)) {
      throw new Error(`Memory feedback already exists: ${feedback.id}`);
    }
    this.feedback.set(feedback.id, cloneMemoryFeedbackRecord(feedback));
    return cloneMemoryFeedbackRecord(feedback);
  }

  async addFeedbackWithCorrection(
    feedbackInput: CreateMemoryFeedbackInput,
    correctionInput: CreateMemoryInput,
    options: MemoryFeedbackWithCorrectionOptions = {}
  ): Promise<MemoryFeedbackWithCorrectionResult> {
    const correctionNow = this.optionTime(options.correction ?? {});
    const correction = createMemoryRecord(correctionInput, correctionNow);
    if (this.memories.has(correction.id)) {
      throw new Error(`Memory already exists: ${correction.id}`);
    }
    this.assertFeedbackTargetsAvailable(
      { ...feedbackInput, correctionMemoryId: correction.id },
      correction.id
    );
    const feedback = createMemoryFeedbackRecord(
      { ...feedbackInput, correctionMemoryId: correction.id },
      { ...options.feedback, now: this.optionTime(options.feedback ?? {}) }
    );
    if (this.feedback.has(feedback.id)) {
      throw new Error(`Memory feedback already exists: ${feedback.id}`);
    }
    const event = createAddEvent(correction, { ...options.correction, now: correctionNow });

    this.memories.set(correction.id, cloneMemoryRecord(correction));
    this.events.set(event.id, cloneMemoryEvent(event));
    this.feedback.set(feedback.id, cloneMemoryFeedbackRecord(feedback));
    return {
      feedback: cloneMemoryFeedbackRecord(feedback),
      correction: {
        memory: cloneMemoryRecord(correction),
        event: cloneMemoryEvent(event)
      }
    };
  }

  async getFeedback(id: string): Promise<MemoryFeedbackRecord | undefined> {
    const feedback = this.feedback.get(id);
    return feedback ? cloneMemoryFeedbackRecord(feedback) : undefined;
  }

  async listFeedback(filter: MemoryFeedbackListFilter = {}): Promise<MemoryFeedbackRecord[]> {
    return [...this.feedback.values()]
      .filter((feedback) => {
        if (filter.scope !== undefined && !scopeMatches(feedback.scope, filter.scope)) return false;
        if (filter.memoryId !== undefined && feedback.memoryId !== filter.memoryId) return false;
        if (filter.traceId !== undefined && feedback.traceId !== filter.traceId) return false;
        if (filter.runId !== undefined && feedback.runId !== filter.runId) return false;
        if (filter.signals !== undefined && !filter.signals.includes(feedback.signal)) return false;
        return true;
      })
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((feedback) => cloneMemoryFeedbackRecord(feedback));
  }

  async addRun(input: CreateRunInput): Promise<RunRecord> {
    const run = createRunRecord(input, this.clock());
    this.runs.set(run.id, cloneRunRecord(run));
    return cloneRunRecord(run);
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    const run = this.runs.get(id);
    return run ? cloneRunRecord(run) : undefined;
  }

  async addTrace(input: CreateTraceInput): Promise<MemoryTrace> {
    const trace = createMemoryTrace(input, this.clock());
    for (const memoryId of traceReferencedMemoryIds(trace)) {
      if (!this.memories.has(memoryId)) {
        throw new Error(`Memory trace target not found: ${memoryId}`);
      }
    }
    this.traces.set(trace.id, cloneMemoryTrace(trace));
    return cloneMemoryTrace(trace);
  }

  async getTrace(id: string): Promise<MemoryTrace | undefined> {
    const trace = this.traces.get(id);
    return trace ? cloneMemoryTrace(trace) : undefined;
  }

  async addConflict(
    input: AddMemoryConflictInput,
    options: MutationOptions = {}
  ): Promise<MemoryConflictRecord> {
    const conflict = createMemoryConflictRecord(input, this.optionTime(options));

    for (const memoryId of [conflict.candidateMemoryId, conflict.existingMemoryId]) {
      if (memoryId !== undefined && !this.memories.has(memoryId)) {
        throw new Error(`Memory conflict target not found: ${memoryId}`);
      }
    }

    if (this.conflicts.has(conflict.id)) {
      throw new Error(`Memory conflict already exists: ${conflict.id}`);
    }

    this.conflicts.set(conflict.id, cloneMemoryConflictRecord(conflict));
    return cloneMemoryConflictRecord(conflict);
  }

  async getConflict(id: string): Promise<MemoryConflictRecord | undefined> {
    const conflict = this.conflicts.get(id);
    return conflict ? cloneMemoryConflictRecord(conflict) : undefined;
  }

  async listConflicts(filter: MemoryConflictListFilter = {}): Promise<MemoryConflictRecord[]> {
    return [...this.conflicts.values()]
      .filter((conflict) => {
        if (filter.tenantId !== undefined && conflict.tenantId !== filter.tenantId) {
          return false;
        }

        if (filter.candidateMemoryId !== undefined && conflict.candidateMemoryId !== filter.candidateMemoryId) {
          return false;
        }

        if (filter.existingMemoryId !== undefined && conflict.existingMemoryId !== filter.existingMemoryId) {
          return false;
        }

        if (filter.statuses !== undefined && !filter.statuses.includes(conflict.status)) {
          return false;
        }

        if (filter.conflictTypes !== undefined && !filter.conflictTypes.includes(conflict.conflictType)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((conflict) => cloneMemoryConflictRecord(conflict));
  }

  async resolveConflict(
    id: string,
    resolution: MemoryConflictResolution,
    options: ResolveMemoryConflictOptions = {}
  ): Promise<MemoryConflictResolutionResult> {
    const before = this.requireConflict(id);
    const conflict = resolveMemoryConflictRecord(before, resolution, {
      ...options,
      now: this.optionTime(options)
    });
    this.conflicts.set(id, cloneMemoryConflictRecord(conflict));

    return {
      before,
      conflict: cloneMemoryConflictRecord(conflict)
    };
  }

  async listEvents(filter: EventListFilter = {}): Promise<MemoryEvent[]> {
    return [...this.events.values()]
      .filter((event) => {
        if (filter.tenantId !== undefined && event.tenantId !== filter.tenantId) {
          return false;
        }

        if (filter.scope !== undefined && !this.eventMatchesScope(event, filter.scope)) {
          return false;
        }

        if (filter.memoryId !== undefined && event.memoryId !== filter.memoryId) {
          return false;
        }

        if (filter.runId !== undefined && event.runId !== filter.runId) {
          return false;
        }

        if (filter.traceId !== undefined && event.traceId !== filter.traceId) {
          return false;
        }

        return true;
      })
      .map((event) => cloneMemoryEvent(event));
  }

  private requireMemory(id: string): MemoryRecord {
    const memory = this.memories.get(id);
    if (memory === undefined) {
      throw new Error(`Memory not found: ${id}`);
    }

    return cloneMemoryRecord(memory);
  }

  private requireConflict(id: string): MemoryConflictRecord {
    const conflict = this.conflicts.get(id);
    if (conflict === undefined) {
      throw new Error(`Memory conflict not found: ${id}`);
    }

    return cloneMemoryConflictRecord(conflict);
  }

  private redactHistoricalContentForHardDelete(memoryId: string): void {
    const associatedTraceIds = new Set(
      [...this.traces.values()]
        .filter((trace) => traceReferencesMemoryForRedaction(trace, memoryId))
        .map((trace) => trace.id)
    );

    for (const [eventId, event] of this.events) {
      if (event.memoryId !== memoryId && (!event.traceId || !associatedTraceIds.has(event.traceId))) continue;
      const redacted = cloneMemoryEvent(event);
      delete redacted.before;
      delete redacted.after;
      redacted.reason = HARD_DELETE_REDACTED_EVENT_REASON;
      redacted.metadata = { hard_deleted_content_redacted: true };
      this.events.set(eventId, redacted);
    }

    for (const [traceId, trace] of this.traces) {
      if (!associatedTraceIds.has(traceId)) continue;
      const redacted = cloneMemoryTrace(trace);
      redacted.selectedMemoryIds = redacted.selectedMemoryIds.filter((id) => id !== memoryId);
      redacted.ignoredMemoryIds = redacted.ignoredMemoryIds.filter((id) => id !== memoryId);
      redacted.selectionReasons = {};
      delete redacted.query;
      delete redacted.contextPack;
      redacted.metadata = { hard_deleted_content_redacted: true };
      this.traces.set(traceId, redacted);
    }

    for (const [conflictId, conflict] of this.conflicts) {
      if (conflict.candidateMemoryId !== memoryId && conflict.existingMemoryId !== memoryId) continue;
      const redacted = cloneMemoryConflictRecord(conflict);
      delete redacted.reason;
      delete redacted.resolution;
      redacted.metadata = { hard_deleted_content_redacted: true };
      this.conflicts.set(conflictId, redacted);
    }

    for (const [feedbackId, feedback] of this.feedback) {
      if (
        feedback.memoryId !== memoryId
        && feedback.correctionMemoryId !== memoryId
        && (!feedback.traceId || !associatedTraceIds.has(feedback.traceId))
      ) continue;
      const redacted = cloneMemoryFeedbackRecord(feedback);
      delete redacted.reason;
      redacted.regressionFixture = redactedFeedbackFixture(redacted);
      redacted.metadata = { hard_deleted_content_redacted: true };
      this.feedback.set(feedbackId, redacted);
    }
  }

  private eventMatchesScope(event: MemoryEvent, scope: MemoryScopeFilter): boolean {
    if (event.memoryId) {
      const memory = this.memories.get(event.memoryId);
      if (memory) return scopeMatches(memory.scope, scope);
    }
    const snapshotScope = eventScopeFromSnapshot(event.after) ?? eventScopeFromSnapshot(event.before);
    return snapshotScope !== undefined && scopeMatches(snapshotScope, scope);
  }

  private assertFeedbackTargetsAvailable(
    input: CreateMemoryFeedbackInput,
    prospectiveMemoryId?: string
  ): void {
    if (
      input.memoryId !== undefined
      && input.memoryId !== prospectiveMemoryId
      && !this.memories.has(input.memoryId)
    ) {
      throw new Error(`Memory feedback target not found: ${input.memoryId}`);
    }
    if (
      input.correctionMemoryId !== undefined
      && input.correctionMemoryId !== prospectiveMemoryId
      && !this.memories.has(input.correctionMemoryId)
    ) {
      throw new Error(`Memory feedback correction target not found: ${input.correctionMemoryId}`);
    }
    if (input.traceId !== undefined) {
      const trace = this.traces.get(input.traceId);
      if (!trace) {
        throw new Error(`Memory feedback trace target not found: ${input.traceId}`);
      }
      if (trace.metadata.hard_deleted_content_redacted === true) {
        throw new Error(`Memory feedback trace target was hard deleted: ${input.traceId}`);
      }
    }
  }

  private optionTime(options: { now?: Date }): Date {
    return options.now ? new Date(options.now.getTime()) : this.clock();
  }
}

function traceReferencesMemoryForRedaction(trace: MemoryTrace, memoryId: string): boolean {
  if (trace.selectedMemoryIds.includes(memoryId) || trace.ignoredMemoryIds.includes(memoryId)) {
    return true;
  }
  for (const key of ["excludedMemoryIds", "excluded_memory_ids"]) {
    const values = trace.metadata[key];
    if (Array.isArray(values) && values.includes(memoryId)) return true;
  }
  return false;
}

function traceReferencedMemoryIds(trace: MemoryTrace): string[] {
  const ids = [...trace.selectedMemoryIds, ...trace.ignoredMemoryIds];
  for (const key of ["excludedMemoryIds", "excluded_memory_ids"]) {
    const values = trace.metadata[key];
    if (Array.isArray(values)) {
      ids.push(...values.filter((value): value is string => typeof value === "string"));
    }
  }
  return [...new Set(ids)];
}

function eventScopeFromSnapshot(snapshot: JsonObject | undefined): MemoryRecord["scope"] | undefined {
  const scope = snapshot?.scope;
  if (!isPlainObject(scope) || typeof scope.tenantId !== "string" || typeof scope.userId !== "string") {
    return undefined;
  }
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    agentProfileId: optionalJsonString(scope.agentProfileId),
    projectId: optionalJsonString(scope.projectId),
    hostId: optionalJsonString(scope.hostId),
    sessionId: optionalJsonString(scope.sessionId),
    toolId: optionalJsonString(scope.toolId)
  };
}

function optionalJsonString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function redactedFeedbackFixture(feedback: MemoryFeedbackRecord): JsonObject {
  const target = feedback.regressionFixture.target;
  const scopeDimensions = feedback.regressionFixture.scope_dimensions;
  return {
    schema_version: "1",
    target: typeof target === "string" ? target : feedback.memoryId && feedback.traceId
      ? "memory_and_trace"
      : feedback.memoryId ? "memory" : "trace",
    signal: feedback.signal,
    scope_dimensions: Array.isArray(scopeDimensions) ? scopeDimensions : [],
    hard_deleted_content_redacted: true
  };
}

function cloneEmbedding(embedding: MemoryEmbedding): MemoryEmbedding {
  return {
    memoryId: embedding.memoryId,
    embedding: [...embedding.embedding],
    embeddingModel: embedding.embeddingModel,
    createdAt: new Date(embedding.createdAt.getTime())
  };
}

function cloneMemoryEvent(event: MemoryEvent): MemoryEvent {
  const clone: MemoryEvent = {
    id: event.id,
    tenantId: event.tenantId,
    eventType: event.eventType,
    actor: { ...event.actor },
    createdAt: new Date(event.createdAt.getTime()),
    metadata: cloneJsonObject(event.metadata)
  };

  if (event.memoryId !== undefined) clone.memoryId = event.memoryId;
  if (event.runId !== undefined) clone.runId = event.runId;
  if (event.traceId !== undefined) clone.traceId = event.traceId;
  if (event.reason !== undefined) clone.reason = event.reason;
  if (event.before !== undefined) clone.before = cloneJsonObject(event.before);
  if (event.after !== undefined) clone.after = cloneJsonObject(event.after);

  return clone;
}

function cloneRunRecord(run: RunRecord): RunRecord {
  const clone: RunRecord = {
    id: run.id,
    tenantId: run.tenantId,
    userId: run.userId,
    metadata: cloneJsonObject(run.metadata)
  };

  if (run.hostId !== undefined) clone.hostId = run.hostId;
  if (run.agentProfileId !== undefined) clone.agentProfileId = run.agentProfileId;
  if (run.projectId !== undefined) clone.projectId = run.projectId;
  if (run.taskHint !== undefined) clone.taskHint = run.taskHint;
  if (run.summary !== undefined) clone.summary = run.summary;
  if (run.outcome !== undefined) clone.outcome = run.outcome;
  if (run.startedAt !== undefined) clone.startedAt = new Date(run.startedAt.getTime());
  if (run.endedAt !== undefined) clone.endedAt = new Date(run.endedAt.getTime());

  return clone;
}

function cloneMemoryTrace(trace: MemoryTrace): MemoryTrace {
  const clone: MemoryTrace = {
    id: trace.id,
    tenantId: trace.tenantId,
    selectedMemoryIds: [...trace.selectedMemoryIds],
    ignoredMemoryIds: [...trace.ignoredMemoryIds],
    selectionReasons: { ...trace.selectionReasons },
    createdAt: new Date(trace.createdAt.getTime()),
    metadata: cloneJsonObject(trace.metadata)
  };

  if (trace.runId !== undefined) clone.runId = trace.runId;
  if (trace.query !== undefined) clone.query = trace.query;
  if (trace.contextPack !== undefined) clone.contextPack = trace.contextPack;

  return clone;
}
