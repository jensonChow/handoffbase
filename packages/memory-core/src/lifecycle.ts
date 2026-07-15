import {
  type AddMemoryConflictInput,
  type CreateMemoryInput,
  type CreateRunInput,
  type JsonObject,
  type MemoryConflictRecord,
  type MemoryConflictResolution,
  type MemoryFeedbackRecord,
  type MemoryRecord,
  type MemoryScope,
  type MemoryStatus,
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

export class MemoryMutationPreconditionError extends Error {
  readonly memoryId: string;
  readonly expectedStatus: MemoryStatus;
  readonly actualStatus: MemoryStatus;

  constructor(memoryId: string, expectedStatus: MemoryStatus, actualStatus: MemoryStatus) {
    super(`Memory ${memoryId} expected status ${expectedStatus}, but found ${actualStatus}.`);
    this.name = "MemoryMutationPreconditionError";
    this.memoryId = memoryId;
    this.expectedStatus = expectedStatus;
    this.actualStatus = actualStatus;
  }
}

export function assertMemoryExpectedStatus(
  memory: MemoryRecord,
  expectedStatus: MemoryStatus | undefined
): void {
  if (expectedStatus !== undefined && memory.status !== expectedStatus) {
    throw new MemoryMutationPreconditionError(memory.id, expectedStatus, memory.status);
  }
}

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

export function normalizeRecallLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Memory recall limit must be a positive integer.");
  }

  return limit;
}

/**
 * Bounded reinforcement learned from explicit user feedback. Each helpful
 * signal on a memory contributes +1 to the net, each unhelpful -1; the net is
 * capped so repeated feedback cannot buy a memory permanent immunity (or
 * condemnation). At the cap the full swing is ±0.6 — a meaningful signal on
 * the order of the confidence and usage terms, but far below the importance
 * term's 0–2.0 range, so feedback shapes ranking without ever dominating it.
 * The SQL twin is feedbackScoreSql in the Postgres store; keep weight and cap
 * in lockstep.
 */
export const FEEDBACK_REINFORCEMENT_WEIGHT = 0.15;
export const FEEDBACK_REINFORCEMENT_NET_CAP = 4;

export function feedbackReinforcement(netHelpfulFeedback: number): number {
  if (!Number.isFinite(netHelpfulFeedback)) {
    return 0;
  }

  const capped = Math.max(
    -FEEDBACK_REINFORCEMENT_NET_CAP,
    Math.min(FEEDBACK_REINFORCEMENT_NET_CAP, netHelpfulFeedback)
  );
  return capped * FEEDBACK_REINFORCEMENT_WEIGHT;
}

/**
 * Net helpful-minus-unhelpful count per memory id. Feedback that targets only
 * a trace or run (no memoryId) carries no per-memory ranking signal and is
 * skipped. Memory ids are globally unique, so aggregating an unfiltered
 * feedback list cannot leak signal across scopes.
 */
export function netFeedbackByMemoryId(records: readonly MemoryFeedbackRecord[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const record of records) {
    if (record.memoryId === undefined) {
      continue;
    }
    net.set(record.memoryId, (net.get(record.memoryId) ?? 0) + (record.signal === "helpful" ? 1 : -1));
  }
  return net;
}

/**
 * Query tokenizer shared by every recall path: lowercase, split on
 * non-word characters, keep terms of three or more characters, dedupe.
 * The Postgres store applies the same rule before binding `$terms`.
 */
export function recallQueryTerms(query: string | undefined): string[] {
  if (query === undefined) {
    return [];
  }

  return [...new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length >= 3))];
}

/**
 * Lexical recall term — the TypeScript twin of keywordScoreSql in the
 * Postgres store: per query term, a canonical-text substring match counts
 * 1.0, an exact type match 0.5, and a source-kind substring match 0.25,
 * normalized by the term count. Keep the two implementations in lockstep.
 */
export function lexicalRecallScore(memory: MemoryRecord, terms: readonly string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const text = memory.canonicalText.toLowerCase();
  const type = memory.type.toLowerCase();
  const sourceKind = memory.sourceKind.toLowerCase();
  let sum = 0;
  for (const term of terms) {
    if (text.includes(term)) {
      sum += 1.0;
    }
    if (type === term) {
      sum += 0.5;
    }
    if (sourceKind.includes(term)) {
      sum += 0.25;
    }
  }
  return sum / terms.length;
}

/**
 * Deterministic recall ordering shared by both stores for equal scores — the
 * TypeScript mirror of the Postgres recall ORDER BY tiebreakers (importance,
 * confidence, last-used desc nulls last, use count, updated, created), with a
 * final id comparison so the order is total for any input.
 */
export function compareRecallRank(a: MemoryRecord, b: MemoryRecord, scoreA: number, scoreB: number): number {
  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  if (a.importance !== b.importance) {
    return b.importance - a.importance;
  }

  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }

  const aUsed = a.lastUsedAt?.getTime();
  const bUsed = b.lastUsedAt?.getTime();
  if (aUsed !== bUsed) {
    if (aUsed === undefined) {
      return 1;
    }
    if (bUsed === undefined) {
      return -1;
    }
    return bUsed - aUsed;
  }

  if (a.useCount !== b.useCount) {
    return b.useCount - a.useCount;
  }

  const updatedDelta = b.updatedAt.getTime() - a.updatedAt.getTime();
  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  const createdDelta = b.createdAt.getTime() - a.createdAt.getTime();
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Retention priority for capacity-bounded forgetting. This is exactly the
 * non-query projection of the Postgres recall ranking (buildRecallScoreSql):
 * importance and confidence at the same 2.0/0.5 weights, useCount capped at
 * 20 contributing 0.01 per use, a hyperbolic recency term worth at most
 * 0.05 that decays with days since last use, and the bounded feedback
 * reinforcement term (±0.6). Recall priority and forgetting priority are one
 * ordering: what recall would rank last is what capacity pressure evicts
 * first, and a memory users called unhelpful moves toward eviction while a
 * helpful one earns retention.
 */
export function retentionScore(memory: MemoryRecord, now: Date = new Date(), netHelpfulFeedback = 0): number {
  const recency =
    memory.lastUsedAt === undefined
      ? 0
      : 0.05 / (1 + Math.max(0, (now.getTime() - memory.lastUsedAt.getTime()) / 86_400_000));

  return (
    memory.importance * 2.0 +
    memory.confidence * 0.5 +
    Math.min(memory.useCount, 20) * 0.01 +
    recency +
    feedbackReinforcement(netHelpfulFeedback)
  );
}

/**
 * Deterministic total order for eviction: lowest retention first, then the
 * least-recently-used, least-used, least-recently-updated, oldest, and
 * finally id — so capacity sweeps are reproducible for any input order.
 * When a feedback map is provided, net helpful/unhelpful feedback shifts
 * retention through the same bounded term recall uses.
 */
export function compareRetentionForEviction(
  a: MemoryRecord,
  b: MemoryRecord,
  now: Date = new Date(),
  feedbackNetByMemoryId?: ReadonlyMap<string, number>
): number {
  const scoreDelta =
    retentionScore(a, now, feedbackNetByMemoryId?.get(a.id) ?? 0) -
    retentionScore(b, now, feedbackNetByMemoryId?.get(b.id) ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const lastUsedDelta = (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0);
  if (lastUsedDelta !== 0) {
    return lastUsedDelta;
  }

  if (a.useCount !== b.useCount) {
    return a.useCount - b.useCount;
  }

  const updatedDelta = a.updatedAt.getTime() - b.updatedAt.getTime();
  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  const createdDelta = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
  if (filterValue === undefined) {
    return true;
  }

  return memoryValue === undefined || memoryValue === filterValue;
}
