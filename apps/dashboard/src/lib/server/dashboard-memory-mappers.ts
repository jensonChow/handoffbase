import {
  getEffectiveMemoryStatus,
  type JsonObject,
  type JsonValue,
  type MemoryConflictRecord as CoreMemoryConflictRecord,
  type MemoryEvent as CoreMemoryEvent,
  type MemoryEventType as CoreMemoryEventType,
  type MemoryRecord as CoreMemoryRecord,
  type MemorySourceKind as CoreMemorySourceKind,
  type MemoryStatus as CoreMemoryStatus,
  type MemoryTrace as CoreMemoryTrace,
  type UpdateMemoryPatch as CoreUpdateMemoryPatch
} from "@handoffbase/memory-core";
import type {
  ConflictCandidate,
  DashboardSnapshot,
  DashboardRuntimeMode,
  MemoryEvent as DashboardMemoryEvent,
  MemoryPatch,
  MemoryRecord as DashboardMemoryRecord,
  MemoryStatus as DashboardMemoryStatus,
  MemoryTrace as DashboardMemoryTrace,
  SourceKind as DashboardSourceKind,
  TraceMemoryRef
} from "@/lib/memory-client";

const VISIBLE_CORE_STATUSES: CoreMemoryStatus[] = [
  "active",
  "pending",
  "invalidated",
  "expired",
  "superseded"
];

type DashboardSnapshotInput = {
  runtimeMode: DashboardRuntimeMode;
  memories: CoreMemoryRecord[];
  events: CoreMemoryEvent[];
  traces: CoreMemoryTrace[];
  conflicts: CoreMemoryConflictRecord[];
  now?: Date;
};

export function isDashboardVisibleMemory(memory: CoreMemoryRecord, now = new Date()): boolean {
  return VISIBLE_CORE_STATUSES.includes(getEffectiveMemoryStatus(memory, now));
}

export function toDashboardSnapshot(input: DashboardSnapshotInput): DashboardSnapshot {
  const now = input.now ?? new Date();
  const eventCounts = countEventsByMemoryId(input.events);
  const visibleMemories = input.memories.filter((memory) => isDashboardVisibleMemory(memory, now));
  const memoryById = new Map(visibleMemories.map((memory) => [memory.id, memory]));

  return {
    runtime: {
      mode: input.runtimeMode
    },
    memories: visibleMemories.map((memory) =>
      toDashboardMemory(memory, eventCounts.get(memory.id) ?? 0, now)
    ),
    events: input.events.flatMap((event) => {
      if (!event.memoryId || !memoryById.has(event.memoryId)) {
        return [];
      }

      const mapped = toDashboardEvent(event);
      return mapped ? [mapped] : [];
    }),
    traces: input.traces.map((trace) => toDashboardTrace(trace, memoryById)),
    conflicts: input.conflicts.flatMap((conflict) => {
      const mapped = toDashboardConflict(conflict, memoryById);
      return mapped ? [mapped] : [];
    })
  };
}

export function toDashboardMemory(
  memory: CoreMemoryRecord,
  eventCount: number,
  now = new Date()
): DashboardMemoryRecord {
  return {
    id: memory.id,
    type: memory.type,
    scope: {
      userId: memory.scope.userId,
      agentProfileId: memory.scope.agentProfileId,
      hostId: memory.scope.hostId,
      projectId: memory.scope.projectId,
      toolId: memory.scope.toolId
    },
    source: {
      kind: toDashboardSourceKind(memory.sourceKind),
      label: stringMetadata(memory.metadata, "sourceLabel") ?? formatToken(memory.sourceKind),
      runId: stringMetadata(memory.metadata, "runId")
    },
    status: toDashboardStatus(getEffectiveMemoryStatus(memory, now)),
    confidence: memory.confidence,
    importance: memory.importance,
    validity: {
      validFrom: (memory.validFrom ?? memory.createdAt).toISOString(),
      validUntil: memory.validUntil?.toISOString(),
      reason: stringMetadata(memory.metadata, "validityReason")
    },
    canonicalText: memory.canonicalText,
    rawSource: memory.rawSource,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    lastUsedAt: memory.lastUsedAt?.toISOString(),
    useCount: memory.useCount,
    eventCount,
    supersedes: memory.supersedes.length > 0 ? [...memory.supersedes] : undefined,
    supersededBy: memory.supersededBy,
    metadata: primitiveMetadata(memory.metadata)
  };
}

export function toDashboardEvent(event: CoreMemoryEvent): DashboardMemoryEvent | undefined {
  if (!event.memoryId) {
    return undefined;
  }

  return {
    id: event.id,
    memoryId: event.memoryId,
    eventType: toDashboardEventType(event),
    actorType: toDashboardActorType(event.actor.type),
    actorId: event.actor.id ?? event.actor.type,
    reason: event.reason ?? formatToken(event.eventType),
    createdAt: event.createdAt.toISOString()
  };
}

export function toCoreMemoryPatch(
  patch: MemoryPatch,
  current: CoreMemoryRecord
): CoreUpdateMemoryPatch {
  const update: CoreUpdateMemoryPatch = {};

  if (patch.type !== undefined) update.type = patch.type;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.confidence !== undefined) update.confidence = patch.confidence;
  if (patch.importance !== undefined) update.importance = patch.importance;
  if (patch.canonicalText !== undefined) update.canonicalText = patch.canonicalText;

  if (patch.validity !== undefined) {
    if (patch.validity.validFrom !== undefined) {
      update.validFrom = parseIsoDate(patch.validity.validFrom, "validity.validFrom");
    }

    update.validUntil =
      patch.validity.validUntil === undefined
        ? null
        : parseIsoDate(patch.validity.validUntil, "validity.validUntil");

    update.metadata = {
      ...current.metadata,
      ...(patch.validity.reason !== undefined
        ? { validityReason: patch.validity.reason }
        : {})
    };
  }

  return update;
}

function toDashboardTrace(
  trace: CoreMemoryTrace,
  memoryById: Map<string, CoreMemoryRecord>
): DashboardMemoryTrace {
  const excludedMemoryIds = stringArrayMetadata(trace.metadata, "excludedMemoryIds");
  const scoreByMemoryId = objectMetadata(trace.metadata, "scores");

  return {
    id: trace.id,
    runId: trace.runId ?? trace.id,
    query: trace.query ?? "",
    hostId: stringMetadata(trace.metadata, "hostId") ?? "dashboard-api",
    agentProfileId: stringMetadata(trace.metadata, "agentProfileId") ?? "dashboard",
    createdAt: trace.createdAt.toISOString(),
    contextPack: trace.contextPack ?? "",
    usedMemories: trace.selectedMemoryIds.map((memoryId) =>
      toTraceMemoryRef(memoryId, memoryById, trace.selectionReasons[memoryId], scoreByMemoryId)
    ),
    ignoredMemories: trace.ignoredMemoryIds.map((memoryId) =>
      toTraceMemoryRef(memoryId, memoryById, trace.selectionReasons[memoryId], scoreByMemoryId)
    ),
    excludedMemories: excludedMemoryIds.map((memoryId) =>
      toTraceMemoryRef(memoryId, memoryById, trace.selectionReasons[memoryId], scoreByMemoryId)
    ),
    metadata: primitiveMetadata(trace.metadata)
  };
}

function toDashboardConflict(
  conflict: CoreMemoryConflictRecord,
  memoryById: Map<string, CoreMemoryRecord>
): ConflictCandidate | undefined {
  const candidate = conflict.candidateMemoryId
    ? memoryById.get(conflict.candidateMemoryId)
    : undefined;
  const existing = conflict.existingMemoryId
    ? memoryById.get(conflict.existingMemoryId)
    : undefined;
  const referencedIds = [
    conflict.candidateMemoryId,
    conflict.existingMemoryId
  ].filter((memoryId): memoryId is string => memoryId !== undefined);

  if (
    referencedIds.length === 0 ||
    referencedIds.some((memoryId) => !memoryById.has(memoryId))
  ) {
    return undefined;
  }

  const scopeMemory = candidate ?? existing;

  if (!scopeMemory) {
    return undefined;
  }

  return {
    id: conflict.id,
    status: conflict.status,
    conflictType: conflict.conflictType,
    severity: conflict.severity,
    incoming: candidate?.canonicalText ?? "Candidate memory is unavailable.",
    existing: existing?.canonicalText ?? "Existing memory is unavailable.",
    recommendation: conflict.reason
      ? `${formatToken(conflict.recommendedAction)}: ${conflict.reason}`
      : formatToken(conflict.recommendedAction),
    memoryType: candidate?.type ?? existing?.type ?? "project_fact",
    scopeLabel: coreScopeLabel(scopeMemory)
  };
}

function toTraceMemoryRef(
  memoryId: string,
  memoryById: Map<string, CoreMemoryRecord>,
  reason: string | undefined,
  scoreByMemoryId: JsonObject | undefined
): TraceMemoryRef {
  const memory = memoryById.get(memoryId);
  const score = scoreByMemoryId?.[memoryId];

  return {
    memoryId,
    text: memory?.canonicalText ?? "Memory is no longer visible in the dashboard snapshot.",
    type: memory?.type ?? "project_fact",
    score: typeof score === "number" ? score : undefined,
    reason: reason ?? "Selected by memory-core trace metadata."
  };
}

function toDashboardStatus(status: CoreMemoryStatus): DashboardMemoryStatus {
  switch (status) {
    case "active":
    case "pending":
    case "invalidated":
    case "expired":
    case "superseded":
      return status;
    case "archived":
    case "deleted":
    case "rejected":
      return "invalidated";
  }
}

function toDashboardSourceKind(kind: CoreMemorySourceKind): DashboardSourceKind {
  switch (kind) {
    case "user_correction":
      return "user_correction";
    case "manual_edit":
      return "manual_edit";
    case "manual_import":
      return "import";
    case "agent_observation":
    case "decision_record":
    case "post_run_reflection":
    case "run_reflection":
    case "run_summary":
      return "run_reflection";
    case "external_content":
    case "external_web":
    case "mcp_tool_description":
    case "tool_result":
      return "import";
    case "user_assertion":
    case "user_instruction":
    case "user_statement":
      return "user_correction";
  }
}

function toDashboardEventType(event: CoreMemoryEvent): DashboardMemoryEvent["eventType"] {
  const dashboardAction = stringMetadata(event.metadata, "dashboardAction");

  if (event.eventType === "update" && dashboardAction === "approve") {
    return "approved";
  }

  if (event.eventType === "update" && dashboardAction === "invalidate") {
    return "invalidated";
  }

  return eventTypeMap(event.eventType);
}

function eventTypeMap(eventType: CoreMemoryEventType): DashboardMemoryEvent["eventType"] {
  switch (eventType) {
    case "add":
      return "created";
    case "approve":
      return "approved";
    case "delete":
      return "deleted";
    case "expire":
    case "reject":
    case "supersede":
      return "invalidated";
    case "recall":
      return "recalled";
    case "update":
      return "updated";
  }
}

function toDashboardActorType(actorType: CoreMemoryEvent["actor"]["type"]): DashboardMemoryEvent["actorType"] {
  switch (actorType) {
    case "agent":
      return "agent";
    case "user":
    case "dashboard":
      return "user";
    case "mcp_host":
    case "system":
      return "system";
  }
}

function countEventsByMemoryId(events: CoreMemoryEvent[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (!event.memoryId) {
      continue;
    }

    counts.set(event.memoryId, (counts.get(event.memoryId) ?? 0) + 1);
  }

  return counts;
}

function parseIsoDate(value: string, path: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${path} must be a valid ISO date string.`);
  }

  return date;
}

function primitiveMetadata(metadata: JsonObject): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] =>
      ["string", "number", "boolean"].includes(typeof entry[1])
    )
  );
}

function stringMetadata(metadata: JsonObject, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" ? value : undefined;
}

function stringArrayMetadata(metadata: JsonObject, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function objectMetadata(metadata: JsonObject, key: string): JsonObject | undefined {
  const value = metadata[key];
  return isJsonObject(value) ? value : undefined;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatToken(value: string): string {
  return value.replace(/_/g, " ");
}

function coreScopeLabel(memory: CoreMemoryRecord): string {
  return [
    memory.scope.userId,
    memory.scope.projectId,
    memory.scope.agentProfileId,
    memory.scope.hostId,
    memory.scope.toolId
  ]
    .filter((value): value is string => value !== undefined)
    .join(" / ");
}
