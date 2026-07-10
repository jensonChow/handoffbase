import {
  getEffectiveMemoryStatus,
  type JsonObject,
  type JsonValue,
  type MemoryConflictRecord as CoreMemoryConflictRecord,
  type MemoryEvent as CoreMemoryEvent,
  type MemoryEventType as CoreMemoryEventType,
  type MemoryFeedbackRecord as CoreMemoryFeedbackRecord,
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
  TraceFeedback,
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
  feedback: CoreMemoryFeedbackRecord[];
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
      const mapped = toDashboardEvent(event);
      return mapped ? [mapped] : [];
    }),
    traces: input.traces.map((trace) => toDashboardTrace(trace, memoryById)),
    conflicts: input.conflicts.flatMap((conflict) => {
      const mapped = toDashboardConflict(conflict, memoryById);
      return mapped ? [mapped] : [];
    }),
    feedback: input.feedback.map(toDashboardFeedback)
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

  const deletion = event.eventType === "delete" ? deletionDetails(event.after) : undefined;

  return {
    id: event.id,
    memoryId: event.memoryId,
    eventType: toDashboardEventType(event),
    actorType: toDashboardActorType(event.actor.type),
    actorId: event.actor.id ?? event.actor.type,
    reason: event.reason ?? formatToken(event.eventType),
    createdAt: event.createdAt.toISOString(),
    hardDeleted: deletion?.hardDeleted,
    scopeLabel: deletion?.scopeLabel
  };
}

export function toDashboardFeedback(feedback: CoreMemoryFeedbackRecord): TraceFeedback {
  return {
    id: feedback.id,
    traceId: feedback.traceId ?? "",
    memoryId: feedback.memoryId,
    rating: feedback.signal,
    reason: feedback.reason,
    correction: stringMetadata(feedback.regressionFixture, "correction"),
    correctionMemoryId: feedback.correctionMemoryId,
    runId: feedback.runId,
    createdAt: feedback.createdAt.toISOString(),
    regressionFixture: feedback.regressionFixture
  };
}

export function toCoreMemoryPatch(
  patch: MemoryPatch,
  current: CoreMemoryRecord
): CoreUpdateMemoryPatch {
  const update: CoreUpdateMemoryPatch = {};

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
    usedMemories: toVisibleTraceMemoryRefs(
      trace.selectedMemoryIds,
      memoryById,
      trace.selectionReasons,
      scoreByMemoryId
    ),
    ignoredMemories: toVisibleTraceMemoryRefs(
      trace.ignoredMemoryIds,
      memoryById,
      trace.selectionReasons,
      scoreByMemoryId
    ),
    excludedMemories: toVisibleTraceMemoryRefs(
      excludedMemoryIds,
      memoryById,
      trace.selectionReasons,
      scoreByMemoryId
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
    recommendedAction: toDashboardConflictAction(conflict.recommendedAction),
    memoryType: candidate?.type ?? existing?.type ?? "project_fact",
    scopeLabel: coreScopeLabel(scopeMemory)
  };
}

function toDashboardConflictAction(
  action: CoreMemoryConflictRecord["recommendedAction"]
): ConflictCandidate["recommendedAction"] {
  switch (action) {
    case "accept":
      return "accept_candidate";
    case "reject":
      return "reject_candidate";
    case "supersede":
    case "supersede_existing":
      return "supersede_existing";
    case "merge":
      return "merge";
    case "ask_user":
    case "keep_both":
      return "keep_both";
    case "ignore":
      return "dismiss_conflict";
  }
}

function toVisibleTraceMemoryRefs(
  memoryIds: string[],
  memoryById: Map<string, CoreMemoryRecord>,
  selectionReasons: Record<string, string>,
  scoreByMemoryId: JsonObject | undefined
): TraceMemoryRef[] {
  return memoryIds.flatMap((memoryId) => {
    const memory = memoryById.get(memoryId);
    if (memory === undefined) {
      return [];
    }

    return [
      toTraceMemoryRef(
        memoryId,
        memory,
        selectionReasons[memoryId],
        scoreByMemoryId
      )
    ];
  });
}

function toTraceMemoryRef(
  memoryId: string,
  memory: CoreMemoryRecord,
  reason: string | undefined,
  scoreByMemoryId: JsonObject | undefined
): TraceMemoryRef {
  const score = scoreByMemoryId?.[memoryId];

  return {
    memoryId,
    text: memory.canonicalText,
    type: memory.type,
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

  if (
    event.eventType === "update" &&
    stringMetadata(event.before ?? {}, "status") === "pending" &&
    stringMetadata(event.after ?? {}, "status") === "active"
  ) {
    return "approved";
  }

  if (
    event.eventType === "update" &&
    stringMetadata(event.after ?? {}, "status") === "invalidated"
  ) {
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

function deletionDetails(after: JsonObject | undefined): {
  hardDeleted: true;
  scopeLabel?: string;
} | undefined {
  if (after?.hardDeleted !== true) {
    return undefined;
  }
  const scope = objectMetadata(after, "scope");
  const dimensions = scope
    ? [
        ["userId", "user"],
        ["projectId", "project"],
        ["agentProfileId", "agent profile"],
        ["hostId", "host"],
        ["toolId", "tool"]
      ]
        .filter(([key]) => stringMetadata(scope, key) !== undefined)
        .map(([, label]) => label)
    : [];
  return {
    hardDeleted: true,
    scopeLabel: dimensions.length > 0 ? dimensions.join(" / ") : undefined
  };
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
