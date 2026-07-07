import {
  type CreateMemoryInput,
  type CreateRunInput,
  type CreateTraceInput,
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
import {
  applyMemoryPatch,
  createMemoryRecord,
  createRunRecord,
  getEffectiveMemoryStatus,
  isRecallableMemory,
  markMemoryDeleted,
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
  createUpdateEvent
} from "./events.js";
import { type EventListFilter, type MemoryStore } from "./storage.js";
import { cloneJsonObject, cloneMemoryRecord } from "./utils.js";

export interface InMemoryMemoryStoreOptions {
  clock?: () => Date;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly clock: () => Date;
  private readonly memories = new Map<string, MemoryRecord>();
  private readonly embeddings = new Map<string, MemoryEmbedding>();
  private readonly events = new Map<string, MemoryEvent>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly traces = new Map<string, MemoryTrace>();

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

  async deleteMemory(id: string, options: MutationOptions = {}): Promise<MemoryUpdateResult> {
    const now = this.optionTime(options);
    const before = this.requireMemory(id);
    const memory = markMemoryDeleted(before, now);
    this.memories.set(id, cloneMemoryRecord(memory));

    const event = createDeleteEvent(before, memory, { ...options, now });
    this.events.set(event.id, cloneMemoryEvent(event));

    return {
      before,
      memory: cloneMemoryRecord(memory),
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
    const now = query.now ?? this.clock();
    const scoped = [...this.memories.values()].filter((memory) => {
      if (!scopeMatches(memory.scope, query.scope)) {
        return false;
      }

      return query.types === undefined || query.types.includes(memory.type);
    });

    const ignored = scoped.filter((memory) => !isRecallableMemory(memory, now));
    const selected = scoped
      .filter((memory) => isRecallableMemory(memory, now))
      .sort((left, right) => scoreMemory(right, query.query) - scoreMemory(left, query.query))
      .slice(0, query.limit ?? 10);

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
    this.traces.set(trace.id, cloneMemoryTrace(trace));
    return cloneMemoryTrace(trace);
  }

  async getTrace(id: string): Promise<MemoryTrace | undefined> {
    const trace = this.traces.get(id);
    return trace ? cloneMemoryTrace(trace) : undefined;
  }

  async listEvents(filter: EventListFilter = {}): Promise<MemoryEvent[]> {
    return [...this.events.values()]
      .filter((event) => {
        if (filter.tenantId !== undefined && event.tenantId !== filter.tenantId) {
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

  private optionTime(options: { now?: Date }): Date {
    return options.now ? new Date(options.now.getTime()) : this.clock();
  }
}

function scoreMemory(memory: MemoryRecord, query: string | undefined): number {
  let score = memory.importance + memory.confidence * 0.25;
  if (query === undefined || query.trim().length === 0) {
    return score;
  }

  const terms = tokenize(query);
  if (terms.length === 0) {
    return score;
  }

  const text = `${memory.type} ${memory.canonicalText}`.toLowerCase();
  const hits = terms.filter((term) => text.includes(term)).length;
  score += hits / terms.length;
  return score;
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length >= 3))];
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
