import {
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type CreateRunInput,
  type JsonObject,
  type MemoryConflictRecord,
  type MemoryConflictResolution,
  type MemoryRecord,
  type MemoryScope,
  type ResolveMemoryConflictOptions,
  type RunRecord,
  type UpdateMemoryPatch
} from "./types.js";
import { assertValidMemoryConflictRecord, assertValidMemoryRecord } from "./validation.js";
import {
  cloneJsonObject,
  cloneMemoryConflictRecord,
  cloneMemoryRecord,
  generateUuid,
  normalizeDate,
  normalizeScope,
  setOptionalDate,
  setOptionalString,
  uniqueStrings
} from "./utils.js";

export const DEFAULT_CONFIDENCE = 0.8;
export const DEFAULT_IMPORTANCE = 0.5;

export function createMemoryRecord(input: CreateMemoryInput, now: Date = new Date()): MemoryRecord {
  const memory: MemoryRecord = {
    id: input.id ?? generateUuid(),
    scope: normalizeScope(input.scope),
    type: input.type,
    canonicalText: input.canonicalText.trim(),
    sourceKind: input.sourceKind,
    status: input.status ?? "active",
    confidence: input.confidence ?? DEFAULT_CONFIDENCE,
    importance: input.importance ?? DEFAULT_IMPORTANCE,
    supersedes: uniqueStrings(input.supersedes ?? []),
    createdAt: new Date(now.getTime()),
    updatedAt: new Date(now.getTime()),
    useCount: 0,
    metadata: cloneJsonObject(input.metadata)
  };

  setOptionalString(memory, "rawSource", input.rawSource);
  setOptionalDate(memory, "validFrom", normalizeDate(input.validFrom));
  setOptionalDate(memory, "validUntil", normalizeDate(input.validUntil));

  assertValidMemoryRecord(memory);
  return memory;
}

export function createMemoryConflictRecord(
  input: AddMemoryConflictInput,
  now: Date = new Date()
): MemoryConflictRecord {
  const conflict: MemoryConflictRecord = {
    id: input.id ?? generateUuid(),
    tenantId: input.tenantId.trim(),
    conflictType: input.conflictType,
    severity: input.severity ?? "medium",
    recommendedAction: input.recommendedAction,
    status: input.status ?? "open",
    createdAt: normalizeDate(input.createdAt) ?? new Date(now.getTime()),
    metadata: cloneJsonObject(input.metadata)
  };

  setOptionalString(conflict, "candidateMemoryId", input.candidateMemoryId);
  setOptionalString(conflict, "existingMemoryId", input.existingMemoryId);
  setOptionalString(conflict, "reason", input.reason);
  if (input.confidence !== undefined) {
    conflict.confidence = input.confidence;
  }
  if (input.resolution !== undefined) {
    conflict.resolution = cloneJsonObject(input.resolution) as MemoryConflictResolution;
  }
  setOptionalDate(conflict, "resolvedAt", normalizeDate(input.resolvedAt));

  assertValidMemoryConflictRecord(conflict);
  return conflict;
}

export function resolveMemoryConflictRecord(
  conflict: MemoryConflictRecord,
  resolution: MemoryConflictResolution,
  options: ResolveMemoryConflictOptions = {}
): MemoryConflictRecord {
  const resolved = cloneMemoryConflictRecord(conflict);
  resolved.status = options.status ?? "resolved";
  resolved.resolution = cloneJsonObject(resolution) as MemoryConflictResolution;
  resolved.resolvedAt = options.now ? new Date(options.now.getTime()) : new Date();
  resolved.metadata = mergeMetadata(resolved.metadata, options.metadata);

  assertValidMemoryConflictRecord(resolved);
  return resolved;
}

export function applyMemoryPatch(memory: MemoryRecord, patch: UpdateMemoryPatch, now: Date = new Date()): MemoryRecord {
  const updated = cloneMemoryRecord(memory);

  if (patch.type !== undefined) {
    updated.type = patch.type;
  }

  if (patch.canonicalText !== undefined) {
    updated.canonicalText = patch.canonicalText.trim();
  }

  if (patch.rawSource === null) {
    delete updated.rawSource;
  } else {
    setOptionalString(updated, "rawSource", patch.rawSource);
  }

  if (patch.sourceKind !== undefined) {
    updated.sourceKind = patch.sourceKind;
  }

  if (patch.status !== undefined) {
    updated.status = patch.status;
  }

  if (patch.confidence !== undefined) {
    updated.confidence = patch.confidence;
  }

  if (patch.importance !== undefined) {
    updated.importance = patch.importance;
  }

  if (patch.validFrom === null) {
    delete updated.validFrom;
  } else if (patch.validFrom !== undefined) {
    setOptionalDate(updated, "validFrom", normalizeDate(patch.validFrom));
  }

  if (patch.validUntil === null) {
    delete updated.validUntil;
  } else if (patch.validUntil !== undefined) {
    setOptionalDate(updated, "validUntil", normalizeDate(patch.validUntil));
  }

  if (patch.supersedes !== undefined) {
    updated.supersedes = uniqueStrings(patch.supersedes);
  }

  if (patch.supersededBy === null) {
    delete updated.supersededBy;
  } else {
    setOptionalString(updated, "supersededBy", patch.supersededBy);
  }

  if (patch.metadata !== undefined) {
    updated.metadata = cloneJsonObject(patch.metadata);
  }

  updated.updatedAt = new Date(now.getTime());

  assertValidMemoryRecord(updated);
  return updated;
}

export function markMemoryDeleted(memory: MemoryRecord, now: Date = new Date()): MemoryRecord {
  return applyMemoryPatch(memory, { status: "deleted" }, now);
}

export function markMemoryExpired(memory: MemoryRecord, now: Date = new Date()): MemoryRecord {
  return applyMemoryPatch(memory, { status: "expired" }, now);
}

export function supersedeMemoryRecord(
  memory: MemoryRecord,
  replacementMemoryId: string,
  now: Date = new Date()
): MemoryRecord {
  return applyMemoryPatch(
    memory,
    {
      status: "superseded",
      supersededBy: replacementMemoryId
    },
    now
  );
}

export function linkReplacementToSuperseded(
  replacement: MemoryRecord,
  supersededMemoryId: string,
  now: Date = new Date()
): MemoryRecord {
  return applyMemoryPatch(
    replacement,
    {
      supersedes: uniqueStrings([...replacement.supersedes, supersededMemoryId])
    },
    now
  );
}

export function isExpiredByValidity(memory: MemoryRecord, at: Date = new Date()): boolean {
  return memory.validUntil !== undefined && memory.validUntil <= at;
}

export function isNotYetValid(memory: MemoryRecord, at: Date = new Date()): boolean {
  return memory.validFrom !== undefined && memory.validFrom > at;
}

export function getEffectiveMemoryStatus(memory: MemoryRecord, at: Date = new Date()): MemoryRecord["status"] {
  if (memory.status === "active" && isExpiredByValidity(memory, at)) {
    return "expired";
  }

  return memory.status;
}

export function isRecallableMemory(memory: MemoryRecord, at: Date = new Date()): boolean {
  return (
    memory.status === "active" &&
    memory.supersededBy === undefined &&
    !isExpiredByValidity(memory, at) &&
    !isNotYetValid(memory, at)
  );
}

export function filterRecallableMemories(memories: MemoryRecord[], at: Date = new Date()): MemoryRecord[] {
  return memories.filter((memory) => isRecallableMemory(memory, at));
}

export function touchMemoryUsage(memory: MemoryRecord, at: Date = new Date()): MemoryRecord {
  const touched = cloneMemoryRecord(memory);
  touched.lastUsedAt = new Date(at.getTime());
  touched.useCount += 1;
  return touched;
}

export function createRunRecord(input: CreateRunInput, now: Date = new Date()): RunRecord {
  const run: RunRecord = {
    id: input.id ?? generateUuid(),
    tenantId: input.tenantId.trim(),
    userId: input.userId.trim(),
    metadata: cloneJsonObject(input.metadata)
  };

  setOptionalString(run, "hostId", input.hostId);
  setOptionalString(run, "agentProfileId", input.agentProfileId);
  setOptionalString(run, "projectId", input.projectId);
  setOptionalString(run, "taskHint", input.taskHint);
  setOptionalString(run, "summary", input.summary);
  setOptionalString(run, "outcome", input.outcome);
  setOptionalDate(run, "startedAt", normalizeDate(input.startedAt) ?? now);
  setOptionalDate(run, "endedAt", normalizeDate(input.endedAt));

  return run;
}

export function scopeMatches(memoryScope: MemoryScope, filter: Partial<MemoryScope>): boolean {
  if (filter.tenantId !== undefined && memoryScope.tenantId !== filter.tenantId) {
    return false;
  }

  if (filter.userId !== undefined && memoryScope.userId !== filter.userId) {
    return false;
  }

  return scopedDimensionMatches(memoryScope.agentProfileId, filter.agentProfileId) &&
    scopedDimensionMatches(memoryScope.projectId, filter.projectId) &&
    scopedDimensionMatches(memoryScope.hostId, filter.hostId) &&
    scopedDimensionMatches(memoryScope.sessionId, filter.sessionId) &&
    scopedDimensionMatches(memoryScope.toolId, filter.toolId);
}

export function contextPackFromMemories(memories: MemoryRecord[]): string {
  return memories.map((memory) => `- [${memory.type}] ${memory.canonicalText}`).join("\n");
}

export function mergeMetadata(base: JsonObject, next: JsonObject | undefined): JsonObject {
  return {
    ...cloneJsonObject(base),
    ...(next ? cloneJsonObject(next) : {})
  };
}

function scopedDimensionMatches(memoryValue: string | undefined, filterValue: string | undefined): boolean {
  if (memoryValue === undefined) {
    return true;
  }

  return filterValue !== undefined && memoryValue === filterValue;
}
