import {
  type CreateTraceInput,
  type JsonObject,
  type MemoryActor,
  type MemoryEvent,
  type MemoryEventType,
  type MemoryRecord,
  type MemoryTrace,
  type MutationOptions
} from "./types.js";
import { assertValidMemoryEvent } from "./validation.js";
import { cloneJsonObject, generateUuid, stringifyDate } from "./utils.js";

const SYSTEM_ACTOR: MemoryActor = { type: "system", id: "memory-core" };
export const HARD_DELETE_EVENT_REASON = "User requested hard deletion.";
export const HARD_DELETE_REDACTED_EVENT_REASON = "Content redacted after hard deletion.";

interface EventInput {
  id?: string;
  tenantId: string;
  memoryId?: string;
  runId?: string;
  traceId?: string;
  eventType: MemoryEventType;
  actor?: MemoryActor;
  reason?: string;
  before?: JsonObject;
  after?: JsonObject;
  now?: Date;
  metadata?: JsonObject;
}

export function createMemoryEvent(input: EventInput): MemoryEvent {
  const event: MemoryEvent = {
    id: input.id ?? generateUuid(),
    tenantId: input.tenantId,
    eventType: input.eventType,
    actor: input.actor ?? SYSTEM_ACTOR,
    createdAt: input.now ? new Date(input.now.getTime()) : new Date(),
    metadata: cloneJsonObject(input.metadata)
  };

  setOptional(event, "memoryId", input.memoryId);
  setOptional(event, "runId", input.runId);
  setOptional(event, "traceId", input.traceId);
  setOptional(event, "reason", input.reason);
  setOptionalObject(event, "before", input.before);
  setOptionalObject(event, "after", input.after);

  assertValidMemoryEvent(event);
  return event;
}

export function createAddEvent(memory: MemoryRecord, options: MutationOptions = {}): MemoryEvent {
  return createMemoryEvent({
    tenantId: memory.scope.tenantId,
    memoryId: memory.id,
    runId: options.runId,
    eventType: "add",
    actor: options.actor,
    reason: options.reason,
    after: memorySnapshot(memory),
    now: options.now,
    metadata: options.metadata
  });
}

export function createUpdateEvent(
  before: MemoryRecord,
  after: MemoryRecord,
  options: MutationOptions = {}
): MemoryEvent {
  return createMemoryEvent({
    tenantId: after.scope.tenantId,
    memoryId: after.id,
    runId: options.runId,
    eventType: "update",
    actor: options.actor,
    reason: options.reason,
    before: memorySnapshot(before),
    after: memorySnapshot(after),
    now: options.now,
    metadata: options.metadata
  });
}

export function createDeleteEvent(
  before: MemoryRecord,
  options: MutationOptions = {}
): MemoryEvent {
  return createMemoryEvent({
    tenantId: before.scope.tenantId,
    memoryId: before.id,
    runId: options.runId,
    eventType: "delete",
    actor: options.actor,
    reason: HARD_DELETE_EVENT_REASON,
    after: {
      deletedMemoryId: before.id,
      status: "deleted",
      hardDeleted: true,
      scope: { ...before.scope }
    },
    now: options.now,
    metadata: {
      hard_delete: true
    }
  });
}

export function createSupersedeEvent(
  before: MemoryRecord,
  after: MemoryRecord,
  replacement: MemoryRecord,
  options: MutationOptions = {}
): MemoryEvent {
  return createMemoryEvent({
    tenantId: after.scope.tenantId,
    memoryId: after.id,
    runId: options.runId,
    eventType: "supersede",
    actor: options.actor,
    reason: options.reason,
    before: memorySnapshot(before),
    after: {
      ...memorySnapshot(after),
      replacementMemoryId: replacement.id
    },
    now: options.now,
    metadata: options.metadata
  });
}

export function createRecallEvent(
  trace: MemoryTrace,
  options: Pick<MutationOptions, "actor" | "reason" | "metadata"> = {}
): MemoryEvent {
  return createMemoryEvent({
    tenantId: trace.tenantId,
    runId: trace.runId,
    traceId: trace.id,
    eventType: "recall",
    actor: options.actor,
    reason: options.reason,
    after: {
      query: trace.query ?? "",
      selectedMemoryIds: trace.selectedMemoryIds,
      ignoredMemoryIds: trace.ignoredMemoryIds
    },
    now: trace.createdAt,
    metadata: options.metadata
  });
}

export function createMemoryTrace(input: CreateTraceInput, now: Date = new Date()): MemoryTrace {
  const trace: MemoryTrace = {
    id: input.id ?? generateUuid(),
    tenantId: input.tenantId,
    selectedMemoryIds: [...(input.selectedMemoryIds ?? [])],
    ignoredMemoryIds: [...(input.ignoredMemoryIds ?? [])],
    selectionReasons: { ...(input.selectionReasons ?? {}) },
    createdAt: new Date(now.getTime()),
    metadata: cloneJsonObject(input.metadata)
  };

  setOptional(trace, "runId", input.runId);
  setOptional(trace, "query", input.query);
  setOptional(trace, "contextPack", input.contextPack);

  return trace;
}

export function memorySnapshot(memory: MemoryRecord): JsonObject {
  const snapshot: JsonObject = {
    id: memory.id,
    scope: { ...memory.scope },
    type: memory.type,
    canonicalText: memory.canonicalText,
    sourceKind: memory.sourceKind,
    status: memory.status,
    confidence: memory.confidence,
    importance: memory.importance,
    supersedes: [...memory.supersedes],
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    useCount: memory.useCount,
    metadata: cloneJsonObject(memory.metadata)
  };

  setOptional(snapshot, "rawSource", memory.rawSource);
  setOptional(snapshot, "validFrom", stringifyDate(memory.validFrom));
  setOptional(snapshot, "validUntil", stringifyDate(memory.validUntil));
  setOptional(snapshot, "supersededBy", memory.supersededBy);
  setOptional(snapshot, "lastUsedAt", stringifyDate(memory.lastUsedAt));

  return snapshot;
}

function setOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function setOptionalObject<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = cloneJsonObject(value as JsonObject) as T[K];
  }
}
