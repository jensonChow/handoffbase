import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryRecord,
  filterRecallableMemories,
  getEffectiveMemoryStatus,
  InMemoryMemoryStore,
  MemoryMutationPreconditionError
} from "../dist/index.js";

const scope = {
  tenantId: "tenant_1",
  userId: "user_1",
  projectId: "project_1",
  agentProfileId: "coding-agent"
};

function memory(overrides) {
  return createMemoryRecord(
    {
      id: overrides.id,
      scope,
      type: overrides.type ?? "procedure",
      canonicalText: overrides.canonicalText ?? "Verify deadlines before recommending hackathons.",
      sourceKind: "user_correction",
      status: overrides.status,
      validFrom: overrides.validFrom,
      validUntil: overrides.validUntil,
      supersedes: overrides.supersedes,
      importance: overrides.importance
    },
    new Date("2026-07-07T00:00:00.000Z")
  );
}

test("filterRecallableMemories returns only active memories within validity window", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const records = [
    memory({ id: "active", canonicalText: "Use memory traces in answers." }),
    memory({ id: "pending", status: "pending" }),
    memory({ id: "expired_status", status: "expired" }),
    memory({ id: "deleted", status: "deleted" }),
    memory({ id: "expired_validity", validUntil: "2026-07-07T00:00:00.000Z" }),
    memory({ id: "future", validFrom: "2026-07-08T00:00:00.000Z" })
  ];

  assert.deepEqual(
    filterRecallableMemories(records, now).map((record) => record.id),
    ["active"]
  );
  assert.equal(getEffectiveMemoryStatus(records[4], now), "expired");
});

test("in-memory supersede links old and new records and excludes old recall", async () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const store = new InMemoryMemoryStore({ clock: () => now });

  await store.addMemory({
    id: "old-memory",
    scope,
    type: "user_preference",
    canonicalText: "User prioritizes prize money.",
    sourceKind: "user_assertion"
  });

  const result = await store.supersedeMemory(
    "old-memory",
    {
      id: "new-memory",
      scope,
      type: "user_preference",
      canonicalText: "User prioritizes founder network and startup resources over prize money.",
      sourceKind: "user_correction"
    },
    { reason: "User updated preference." }
  );

  assert.equal(result.previous.status, "superseded");
  assert.equal(result.previous.supersededBy, "new-memory");
  assert.deepEqual(result.replacement.supersedes, ["old-memory"]);
  assert.deepEqual(
    result.events.map((event) => event.eventType),
    ["add", "supersede"]
  );

  const recall = await store.recallMemories({
    scope,
    query: "founder network prize",
    limit: 10
  });

  assert.deepEqual(
    recall.memories.map((record) => record.id),
    ["new-memory"]
  );
  assert.deepEqual(recall.ignoredMemoryIds, ["old-memory"]);
  assert.equal(recall.event.eventType, "recall");
});

test("listMemories can inspect records expired by validUntil", async () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const store = new InMemoryMemoryStore({ clock: () => now });

  await store.addMemory({
    id: "validity-expired",
    scope,
    type: "project_fact",
    canonicalText: "Submission deadline was July 6.",
    sourceKind: "agent_observation",
    validUntil: "2026-07-07T00:00:00.000Z"
  });

  assert.deepEqual(await store.listMemories({ scope }), []);

  const expired = await store.listMemories({
    scope,
    statuses: ["expired"],
    now
  });

  assert.deepEqual(
    expired.map((record) => record.id),
    ["validity-expired"]
  );
});

test("in-memory conflict lifecycle creates, filters, and resolves conflict records", async () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const later = new Date("2026-07-07T13:00:00.000Z");
  let current = now;
  const store = new InMemoryMemoryStore({ clock: () => current });

  await store.addMemory({
    id: "existing-memory",
    scope,
    type: "user_preference",
    canonicalText: "User prioritizes prize money.",
    sourceKind: "user_assertion"
  });
  await store.addMemory({
    id: "candidate-memory",
    scope,
    type: "user_preference",
    canonicalText: "User prioritizes founder network.",
    sourceKind: "user_correction",
    status: "pending"
  });

  const conflict = await store.addConflict({
    id: "conflict-1",
    tenantId: scope.tenantId,
    candidateMemoryId: "candidate-memory",
    existingMemoryId: "existing-memory",
    conflictType: "contradiction",
    severity: "high",
    recommendedAction: "ask_user",
    reason: "The new preference contradicts the old preference.",
    confidence: 0.91,
    metadata: { source: "unit-test" }
  });

  assert.equal(conflict.status, "open");
  assert.equal(conflict.createdAt.toISOString(), now.toISOString());
  assert.deepEqual(
    (await store.listConflicts({ tenantId: scope.tenantId, statuses: ["open"] })).map((record) => record.id),
    ["conflict-1"]
  );
  assert.deepEqual(
    await store.listConflicts({ existingMemoryId: "missing", statuses: ["open"] }),
    []
  );

  current = later;
  const resolved = await store.resolveConflict(
    "conflict-1",
    { action: "keep_both", reason: "User wants both preserved for now." },
    { status: "dismissed", metadata: { reviewed: true } }
  );

  assert.equal(resolved.before.status, "open");
  assert.equal(resolved.conflict.status, "dismissed");
  assert.equal(resolved.conflict.resolvedAt.toISOString(), later.toISOString());
  assert.deepEqual(resolved.conflict.resolution, {
    action: "keep_both",
    reason: "User wants both preserved for now."
  });
  assert.deepEqual(resolved.conflict.metadata, {
    source: "unit-test",
    reviewed: true
  });
  assert.deepEqual(await store.listConflicts({ statuses: ["open"] }), []);
});

test("in-memory feedback is scoped and hard delete removes content while retaining an authorized tombstone", async () => {
  const now = new Date("2026-07-07T14:00:00.000Z");
  const sentinel = "HARD_DELETE_SENTINEL_CONTENT";
  const store = new InMemoryMemoryStore({ clock: () => now });
  await store.addMemory(
    {
      id: "feedback-target",
      scope,
      type: "failure_memory",
      canonicalText: `Never expose ${sentinel} in an answer.`,
      rawSource: `Raw source contains ${sentinel}.`,
      sourceKind: "user_correction",
      metadata: { private_note: sentinel }
    },
    { reason: `Added because ${sentinel}.`, metadata: { private_note: sentinel } }
  );
  await store.upsertEmbedding({
    memoryId: "feedback-target",
    embedding: [0.1, 0.2],
    embeddingModel: "test",
    createdAt: now
  });
  const trace = await store.addTrace({
    id: "feedback-trace",
    tenantId: scope.tenantId,
    query: `Why did ${sentinel} appear?`,
    selectedMemoryIds: ["feedback-target"],
    contextPack: `Never expose ${sentinel} in an answer.`,
    selectionReasons: { "feedback-target": `Selected because ${sentinel}.` },
    metadata: { private_note: sentinel }
  });
  await store.addConflict({
    id: "feedback-conflict",
    tenantId: scope.tenantId,
    candidateMemoryId: "feedback-target",
    conflictType: "contradiction",
    recommendedAction: "ask_user",
    status: "resolved",
    reason: `Conflict reason ${sentinel}.`,
    resolution: { action: "merge", mergedText: `Merged ${sentinel}.`, note: sentinel },
    resolvedAt: now,
    metadata: { private_note: sentinel }
  });
  const feedback = await store.addFeedback({
    id: "feedback-1",
    scope,
    memoryId: "feedback-target",
    traceId: trace.id,
    signal: "unhelpful",
    reason: `The remembered instruction exposed ${sentinel}.`,
    regressionFixture: {
      schema_version: "1",
      target: "memory_and_trace",
      signal: "unhelpful",
      correction: `Use the corrected policy without ${sentinel}.`,
      scope_dimensions: ["tenant", "user", "project", "agent_profile"]
    },
    metadata: { private_note: sentinel }
  });
  await store.addFeedback({
    id: "feedback-trace-only",
    scope,
    traceId: trace.id,
    signal: "unhelpful",
    reason: `Trace-only feedback contains ${sentinel}.`,
    regressionFixture: {
      schema_version: "1",
      target: "trace",
      signal: "unhelpful",
      correction: `Trace-only correction contains ${sentinel}.`,
      scope_dimensions: ["tenant", "user", "project", "agent_profile"]
    },
    metadata: { private_note: sentinel }
  });
  assert.equal(feedback.signal, "unhelpful");
  assert.deepEqual(
    (await store.listFeedback({ scope })).map((item) => item.id).sort(),
    ["feedback-1", "feedback-trace-only"]
  );
  assert.deepEqual(
    await store.listFeedback({ scope: { tenantId: scope.tenantId, userId: "other-user" } }),
    []
  );

  const deleted = await store.deleteMemory("feedback-target", {
    reason: `User deletion reason contains ${sentinel}.`,
    metadata: { private_note: sentinel }
  });
  assert.equal(deleted.event.eventType, "delete");
  assert.equal(deleted.deletedMemoryId, "feedback-target");
  assert.equal(JSON.stringify(deleted).includes(sentinel), false);
  assert.equal(await store.getMemory("feedback-target"), undefined);
  assert.equal(await store.getEmbedding("feedback-target"), undefined);
  const redactedTrace = await store.getTrace("feedback-trace");
  assert.deepEqual(redactedTrace.selectedMemoryIds, []);
  assert.equal(redactedTrace.query, undefined);
  assert.equal(redactedTrace.contextPack, undefined);
  assert.deepEqual(redactedTrace.selectionReasons, {});
  assert.deepEqual(redactedTrace.metadata, { hard_deleted_content_redacted: true });

  const events = await store.listEvents({ memoryId: "feedback-target" });
  assert.equal(events.length, 2);
  assert.equal(JSON.stringify(events).includes(sentinel), false);
  const tombstone = events.find((event) => event.eventType === "delete");
  assert.equal(tombstone.reason, "User requested hard deletion.");
  assert.equal(tombstone.after.deletedMemoryId, "feedback-target");
  assert.deepEqual(tombstone.after.scope, scope);
  assert.equal((await store.listEvents({ scope })).length, 1);
  assert.equal(
    (await store.listEvents({ scope: { tenantId: scope.tenantId, userId: "other-user" } })).length,
    0
  );

  const redactedFeedback = await store.getFeedback("feedback-1");
  assert.equal(redactedFeedback.reason, undefined);
  assert.equal(JSON.stringify(redactedFeedback.regressionFixture).includes(sentinel), false);
  assert.equal(redactedFeedback.regressionFixture.hard_deleted_content_redacted, true);
  const traceOnlyFeedback = await store.getFeedback("feedback-trace-only");
  assert.equal(traceOnlyFeedback.reason, undefined);
  assert.equal(traceOnlyFeedback.regressionFixture.hard_deleted_content_redacted, true);
  const redactedConflict = await store.getConflict("feedback-conflict");
  assert.equal(redactedConflict.reason, undefined);
  assert.equal(redactedConflict.resolution, undefined);
  assert.deepEqual(redactedConflict.metadata, { hard_deleted_content_redacted: true });

  const allReadableState = {
    memories: await store.listMemories(),
    events: await store.listEvents(),
    feedback: await store.listFeedback(),
    traces: [await store.getTrace("feedback-trace")],
    conflicts: await store.listConflicts()
  };
  assert.equal(JSON.stringify(allReadableState).includes(sentinel), false);
  await assert.rejects(
    () => store.addFeedback({
      id: "feedback-after-delete-memory",
      scope,
      memoryId: "feedback-target",
      signal: "helpful",
      regressionFixture: { schema_version: "1", target: "memory", signal: "helpful", scope_dimensions: ["tenant", "user"] }
    }),
    /feedback target not found/
  );
  await assert.rejects(
    () => store.addFeedback({
      id: "feedback-after-delete-trace",
      scope,
      traceId: "feedback-trace",
      signal: "helpful",
      regressionFixture: { schema_version: "1", target: "trace", signal: "helpful", scope_dimensions: ["tenant", "user"] }
    }),
    /trace target was hard deleted/
  );
});

test("in-memory feedback scope filters match Postgres vault semantics", async () => {
  const store = new InMemoryMemoryStore();
  const base = {
    tenantId: "tenant-feedback-scope",
    userId: "user-feedback-scope"
  };
  await store.addMemory({
    id: "global-memory",
    scope: base,
    type: "failure_memory",
    canonicalText: "Global feedback fixture.",
    sourceKind: "agent_observation"
  });
  await store.addMemory({
    id: "project-memory",
    scope: { ...base, projectId: "project-a", agentProfileId: "agent-a" },
    type: "failure_memory",
    canonicalText: "Project feedback fixture.",
    sourceKind: "agent_observation"
  });
  await store.addFeedback({
    id: "feedback-global",
    scope: base,
    signal: "helpful",
    memoryId: "global-memory",
    regressionFixture: { schema_version: "1", target: "memory", signal: "helpful", scope_dimensions: ["tenant", "user"] }
  });
  await store.addFeedback({
    id: "feedback-project-a",
    scope: { ...base, projectId: "project-a", agentProfileId: "agent-a" },
    signal: "helpful",
    memoryId: "project-memory",
    regressionFixture: { schema_version: "1", target: "memory", signal: "helpful", scope_dimensions: ["tenant", "user", "project", "agent_profile"] }
  });

  assert.deepEqual(
    (await store.listFeedback({ scope: base })).map((item) => item.id).sort(),
    ["feedback-global", "feedback-project-a"]
  );
  assert.deepEqual(
    (await store.listFeedback({ scope: { ...base, projectId: "project-a" } })).map((item) => item.id).sort(),
    ["feedback-global", "feedback-project-a"]
  );
  assert.deepEqual(
    (await store.listFeedback({ scope: { ...base, projectId: "project-b" } })).map((item) => item.id),
    ["feedback-global"]
  );
});

test("in-memory updates enforce expected status atomically", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "pending-approval",
    scope,
    type: "procedure",
    canonicalText: "Pending approval memory.",
    sourceKind: "user_correction",
    status: "pending"
  });
  const approved = await store.updateMemory(
    "pending-approval",
    { status: "active" },
    { expectedStatus: "pending" }
  );
  assert.equal(approved.memory.status, "active");

  await assert.rejects(
    () => store.updateMemory(
      "pending-approval",
      { status: "rejected" },
      { expectedStatus: "pending" }
    ),
    (error) => {
      assert.ok(error instanceof MemoryMutationPreconditionError);
      assert.equal(error.memoryId, "pending-approval");
      assert.equal(error.expectedStatus, "pending");
      assert.equal(error.actualStatus, "active");
      return true;
    }
  );
  assert.equal((await store.getMemory("pending-approval")).status, "active");
  assert.equal((await store.listEvents({ memoryId: "pending-approval" })).length, 2);
});

test("in-memory feedback and correction commit as one unit", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "atomic-feedback-target",
    scope,
    type: "failure_memory",
    canonicalText: "Atomic feedback target.",
    sourceKind: "agent_observation"
  });
  const trace = await store.addTrace({
    id: "atomic-feedback-trace",
    tenantId: scope.tenantId,
    selectedMemoryIds: ["atomic-feedback-target"]
  });
  const result = await store.addFeedbackWithCorrection(
    {
      id: "atomic-feedback",
      scope,
      memoryId: "atomic-feedback-target",
      traceId: trace.id,
      signal: "unhelpful",
      regressionFixture: {
        schema_version: "1",
        target: "memory_and_trace",
        signal: "unhelpful",
        scope_dimensions: ["tenant", "user", "project", "agent_profile"]
      }
    },
    {
      id: "atomic-correction",
      scope,
      type: "failure_memory",
      canonicalText: "Corrected atomic guidance.",
      sourceKind: "user_correction",
      status: "pending"
    }
  );
  assert.equal(result.feedback.correctionMemoryId, "atomic-correction");
  assert.equal(result.correction.memory.status, "pending");
  assert.equal((await store.getMemory("atomic-correction")).canonicalText, "Corrected atomic guidance.");

  const eventCount = (await store.listEvents()).length;
  await assert.rejects(
    () => store.addFeedbackWithCorrection(
      {
        id: "atomic-feedback",
        scope,
        memoryId: "atomic-feedback-target",
        signal: "unhelpful",
        regressionFixture: {
          schema_version: "1",
          target: "memory",
          signal: "unhelpful",
          scope_dimensions: ["tenant", "user"]
        }
      },
      {
        id: "atomic-correction-rollback",
        scope,
        type: "failure_memory",
        canonicalText: "This correction must not commit.",
        sourceKind: "user_correction",
        status: "pending"
      }
    ),
    /feedback already exists/
  );
  assert.equal(await store.getMemory("atomic-correction-rollback"), undefined);
  assert.equal((await store.listEvents()).length, eventCount);
});
