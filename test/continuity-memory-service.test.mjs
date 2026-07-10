import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryMemoryStore, MemoryMutationPreconditionError } from "@handoffbase/memory-core";
import { ScopeGuardError } from "../dist/auth/scope.js";
import { ContinuityMemoryService } from "../dist/services/continuity-memory-service.js";

const scope = {
  tenantId: "tenant_1",
  userId: "user_1",
  agentProfileId: "coding-agent"
};

const toolScopes = {
  tenant_id: scope.tenantId,
  user_id: scope.userId,
  agent_profile_id: scope.agentProfileId
};

test("remember persists provider conflicts and vault-conflicts returns conflict records", async () => {
  const store = new InMemoryMemoryStore({
    clock: () => new Date("2026-07-07T12:00:00.000Z")
  });
  await store.addMemory({
    id: "existing-preference",
    scope,
    type: "user_preference",
    canonicalText: "User prioritizes prize money.",
    sourceKind: "user_assertion",
    status: "active"
  });

  const provider = conflictProvider();
  const service = new ContinuityMemoryService({
    store,
    provider,
    seedDemoMemories: false
  });

  const remembered = await service.remember({
    source: "user_correction",
    content: "User now prioritizes founder network over prize money.",
    scopes: toolScopes,
    approval_mode: "active"
  });

  assert.equal(remembered.candidate_memories.length, 1);
  assert.equal(remembered.candidate_memories[0].status, "pending");
  assert.ok(remembered.candidate_memories[0].id);

  const existing = await store.getMemory("existing-preference");
  assert.equal(existing.status, "active");

  const conflicts = await store.listConflicts({ statuses: ["open"] });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].candidateMemoryId, remembered.candidate_memories[0].id);
  assert.equal(conflicts[0].existingMemoryId, "existing-preference");
  assert.equal(conflicts[0].conflictType, "contradiction");
  assert.equal(conflicts[0].recommendedAction, "ask_user");

  const resource = await service.readResource({
    name: "vault-conflicts",
    uri: "memory://vault/conflicts",
    variables: {}
  });
  const payload = JSON.parse(resource.text);

  assert.equal(payload.uri, "memory://vault/conflicts");
  assert.equal(payload.count, 1);
  assert.equal(payload.conflicts[0].id, conflicts[0].id);
  assert.equal(payload.conflicts[0].candidate_memory.id, remembered.candidate_memories[0].id);
  assert.equal(payload.conflicts[0].candidate_memory.status, "pending");
  assert.equal(payload.conflicts[0].existing_memory.id, "existing-preference");
  assert.equal(payload.conflicts[0].existing_memory.status, "active");
});

test("memory_resolve_conflict applies every documented lifecycle action with audit and provenance", async () => {
  const cases = [
    { action: "accept_candidate", candidateStatus: "active", existingStatus: "active", eventCount: 1 },
    { action: "reject_candidate", candidateStatus: "rejected", existingStatus: "active", eventCount: 1 },
    {
      action: "supersede_existing",
      candidateStatus: "active",
      existingStatus: "superseded",
      eventCount: 2
    },
    {
      action: "merge",
      candidateStatus: "active",
      existingStatus: "superseded",
      eventCount: 2,
      mergedText: "Merged preference preserves the confirmed parts of both memories."
    },
    { action: "keep_both", candidateStatus: "active", existingStatus: "active", eventCount: 1 },
    {
      action: "dismiss_conflict",
      candidateStatus: "pending",
      existingStatus: "active",
      eventCount: 0,
      conflictStatus: "dismissed"
    }
  ];

  for (const item of cases) {
    const store = new InMemoryMemoryStore({ clock: () => new Date("2026-07-10T08:00:00.000Z") });
    const fixture = await addConflictFixture(store, item.action);
    const service = resolutionService(store);
    const reason = `Authorized ${item.action} decision.`;

    const output = await service.resolveConflict(
      {
        conflict_id: fixture.conflictId,
        action: item.action,
        merged_text: item.mergedText,
        reason
      },
      { caller: authorizedCaller() }
    );

    const candidate = await store.getMemory(fixture.candidateId);
    const existing = await store.getMemory(fixture.existingId);
    const conflict = await store.getConflict(fixture.conflictId);
    assert.ok(candidate);
    assert.ok(existing);
    assert.ok(conflict);
    assert.equal(candidate.status, item.candidateStatus, `${item.action} candidate status`);
    assert.equal(existing.status, item.existingStatus, `${item.action} existing status`);
    assert.equal(conflict.status, item.conflictStatus ?? "resolved", `${item.action} conflict status`);
    assert.equal(conflict.resolution.action, item.action, `${item.action} records the decision`);
    assert.equal(typeof conflict.resolution.attempt_id, "string", `${item.action} records a unique attempt id`);
    assert.equal(output.conflict_status, item.conflictStatus ?? "resolved");
    assert.equal(output.event_ids.length, item.eventCount);
    assert.deepEqual(conflict.resolution.event_ids, output.event_ids);

    assert.deepEqual(candidate.scope, fixture.candidateBefore.scope, `${item.action} preserves candidate scope`);
    assert.equal(candidate.sourceKind, fixture.candidateBefore.sourceKind, `${item.action} preserves candidate source kind`);
    assert.equal(candidate.rawSource, fixture.candidateBefore.rawSource, `${item.action} preserves candidate raw source`);
    assert.deepEqual(candidate.metadata, fixture.candidateBefore.metadata, `${item.action} preserves candidate metadata`);
    assert.deepEqual(existing.scope, fixture.existingBefore.scope, `${item.action} preserves existing scope`);
    assert.equal(existing.sourceKind, fixture.existingBefore.sourceKind, `${item.action} preserves existing source kind`);
    assert.equal(existing.rawSource, fixture.existingBefore.rawSource, `${item.action} preserves existing raw source`);
    assert.deepEqual(existing.metadata, fixture.existingBefore.metadata, `${item.action} preserves existing metadata`);

    if (item.action === "supersede_existing" || item.action === "merge") {
      assert.ok(candidate.supersedes.includes(existing.id), `${item.action} records candidate supersedes link`);
      assert.equal(existing.supersededBy, candidate.id, `${item.action} records existing supersededBy link`);
    } else {
      assert.deepEqual(candidate.supersedes, fixture.candidateBefore.supersedes);
      assert.equal(existing.supersededBy, fixture.existingBefore.supersededBy);
    }
    if (item.action === "merge") {
      assert.equal(candidate.canonicalText, item.mergedText);
    } else {
      assert.equal(candidate.canonicalText, fixture.candidateBefore.canonicalText);
    }

    const resolutionEvents = (await store.listEvents({ tenantId: resolutionScope.tenantId })).filter(
      (event) => event.metadata.conflict_id === fixture.conflictId
    );
    assert.equal(resolutionEvents.length, item.eventCount, `${item.action} audit event count`);
    for (const event of resolutionEvents) {
      assert.deepEqual(event.actor, { type: "mcp_host", id: "authorized-reviewer" });
      assert.equal(event.reason, reason);
      assert.equal(event.metadata.resolution_action, item.action);
      assert.ok(output.event_ids.includes(event.id));
    }

    const totalEventsBeforeRetry = (await store.listEvents()).length;
    const retry = await service.resolveConflict(
      {
        conflict_id: fixture.conflictId,
        action: item.action,
        merged_text: item.mergedText,
        reason
      },
      { caller: authorizedCaller() }
    );
    assert.deepEqual(retry, output, `${item.action} retry returns the persisted result`);
    assert.equal((await store.listEvents()).length, totalEventsBeforeRetry, `${item.action} retry adds no events`);
  }
});

test("memory_resolve_conflict requires merged_text before changing lifecycle state", async () => {
  const store = new InMemoryMemoryStore();
  const fixture = await addConflictFixture(store, "merge-missing-text");
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.resolveConflict(
        {
          conflict_id: fixture.conflictId,
          action: "merge",
          reason: "A merge without text must fail."
        },
        { caller: authorizedCaller() }
      ),
    /merged_text is required/
  );

  assert.equal((await store.getMemory(fixture.candidateId)).status, "pending");
  assert.equal((await store.getMemory(fixture.existingId)).status, "active");
  assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
});

test("memory_resolve_conflict compensates partial memory mutations and leaves the conflict open", async () => {
  const store = new FailingSecondResolutionUpdateStore();
  const fixture = await addConflictFixture(store, "partial-update");
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.resolveConflict(
        {
          conflict_id: fixture.conflictId,
          action: "supersede_existing",
          reason: "Exercise compensating rollback."
        },
        { caller: authorizedCaller() }
      ),
    /injected second resolution update failure/
  );

  assertMemoryMatchesBefore(await store.getMemory(fixture.candidateId), fixture.candidateBefore);
  assertMemoryMatchesBefore(await store.getMemory(fixture.existingId), fixture.existingBefore);
  assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
});

test("memory_resolve_conflict rejects a non-persisted terminal state and rolls memory back", async () => {
  const store = new NonPersistingConflictResolutionStore();
  const fixture = await addConflictFixture(store, "non-persisted-conflict");
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.resolveConflict(
        {
          conflict_id: fixture.conflictId,
          action: "accept_candidate",
          reason: "The conflict store must actually persist resolution."
        },
        { caller: authorizedCaller() }
      ),
    /did not persist a consistent resolution/
  );

  assertMemoryMatchesBefore(await store.getMemory(fixture.candidateId), fixture.candidateBefore);
  assertMemoryMatchesBefore(await store.getMemory(fixture.existingId), fixture.existingBefore);
  assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
});

test("memory_resolve_conflict fails closed on an unreconciled pre-restart attempt", async () => {
  const store = new InMemoryMemoryStore();
  const fixture = await addConflictFixture(store, "restart-partial");
  const attemptMetadata = {
    conflict_id: fixture.conflictId,
    resolution_action: "supersede_existing",
    resolution_attempt_id: "crashed-attempt"
  };
  await store.updateMemory(
    fixture.candidateId,
    { status: "active", supersedes: [...fixture.candidateBefore.supersedes, fixture.existingId] },
    { metadata: attemptMetadata }
  );
  await store.updateMemory(
    fixture.existingId,
    { status: "superseded", supersededBy: fixture.candidateId },
    { metadata: attemptMetadata }
  );

  const restartedService = resolutionService(store);
  await assert.rejects(
    () =>
      restartedService.resolveConflict(
        {
          conflict_id: fixture.conflictId,
          action: "dismiss_conflict",
          reason: "Do not dismiss over a crashed partial attempt."
        },
        { caller: authorizedCaller() }
      ),
    /unreconciled prior resolution attempt/
  );

  assert.equal((await store.getMemory(fixture.candidateId)).status, "active");
  assert.equal((await store.getMemory(fixture.existingId)).status, "superseded");
  assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
});

test("memory_resolve_conflict serializes opposing decisions for the same conflict", async () => {
  const store = new InMemoryMemoryStore();
  const fixture = await addConflictFixture(store, "concurrent-opposing");
  const service = resolutionService(store);

  const [accepted, rejected] = await Promise.allSettled([
    service.resolveConflict(
      {
        conflict_id: fixture.conflictId,
        action: "accept_candidate",
        reason: "First authorized decision wins."
      },
      { caller: authorizedCaller() }
    ),
    service.resolveConflict(
      {
        conflict_id: fixture.conflictId,
        action: "reject_candidate",
        reason: "Conflicting concurrent decision must fail."
      },
      { caller: authorizedCaller() }
    )
  ]);

  assert.equal(accepted.status, "fulfilled");
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.reason.message, /different resolution/);
  assert.equal((await store.getMemory(fixture.candidateId)).status, "active");
  assert.equal((await store.getMemory(fixture.existingId)).status, "active");
  assert.equal((await store.getConflict(fixture.conflictId)).resolution.action, "accept_candidate");
});

test("memory_resolve_conflict cannot revive a candidate concurrently forgotten first", async () => {
  const store = new InMemoryMemoryStore();
  const fixture = await addConflictFixture(store, "concurrent-forget");
  const service = resolutionService(store);

  const [forgotten, resolution] = await Promise.allSettled([
    service.forget(
      {
        memory_id: fixture.candidateId,
        mode: "hard_delete",
        reason: "Delete the candidate before conflict review."
      },
      { caller: authorizedCaller() }
    ),
    service.resolveConflict(
      {
        conflict_id: fixture.conflictId,
        action: "accept_candidate",
        reason: "This must not revive a deleted candidate."
      },
      { caller: authorizedCaller() }
    )
  ]);

  assert.equal(forgotten.status, "fulfilled");
  assert.equal(resolution.status, "rejected");
  assert.match(resolution.reason.message, /missing candidate memory/);
  assert.equal(await store.getMemory(fixture.candidateId), undefined);
  assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
});

test("memory_resolve_conflict refuses to activate an already superseded candidate", async () => {
  const store = new InMemoryMemoryStore();
  const fixture = await addConflictFixture(store, "superseded-candidate");
  await store.updateMemory(fixture.candidateId, { status: "active", supersededBy: "other-replacement" });
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.resolveConflict(
        {
          conflict_id: fixture.conflictId,
          action: "accept_candidate",
          reason: "An unusable candidate must not be accepted."
        },
        { caller: authorizedCaller() }
      ),
    /already superseded/
  );
  assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
  assert.equal((await store.getMemory(fixture.candidateId)).supersededBy, "other-replacement");
});

test("memory_resolve_conflict enforces tenant, user, project, and agent authorization before writes", async () => {
  const cases = [
    { label: "tenant", caller: authorizedCaller({ tenantId: "tenant-other" }) },
    { label: "user", caller: authorizedCaller({ userId: "user-other" }) },
    { label: "project", caller: authorizedCaller({ allowedProjectIds: ["project-other"] }) },
    { label: "agent", caller: authorizedCaller({ allowedAgentProfileIds: ["agent-other"] }) }
  ];

  for (const item of cases) {
    const store = new InMemoryMemoryStore();
    const fixture = await addConflictFixture(store, `unauthorized-${item.label}`);
    const service = resolutionService(store);
    const eventCountBefore = (await store.listEvents()).length;

    await assert.rejects(
      () =>
        service.resolveConflict(
          {
            conflict_id: fixture.conflictId,
            action: "supersede_existing",
            reason: `Unauthorized ${item.label} attempt.`
          },
          { caller: item.caller }
        ),
      ScopeGuardError
    );

    assertMemoryMatchesBefore(await store.getMemory(fixture.candidateId), fixture.candidateBefore);
    assertMemoryMatchesBefore(await store.getMemory(fixture.existingId), fixture.existingBefore);
    assert.equal((await store.getConflict(fixture.conflictId)).status, "open");
    assert.equal((await store.listEvents()).length, eventCountBefore, `${item.label} denial writes no event`);
  }
});

test("vault-conflicts isolates same-tenant users without blocking on another user's records", async () => {
  const store = new InMemoryMemoryStore();
  const userA = await addConflictFixture(store, "user-a", { userId: "user-a" });
  const userB = await addConflictFixture(store, "user-b", { userId: "user-b" });
  await store.addConflict({
    id: "conflict-cross-user-link",
    tenantId: resolutionScope.tenantId,
    candidateMemoryId: userA.candidateId,
    existingMemoryId: userB.existingId,
    conflictType: "scope_overlap",
    recommendedAction: "ask_user"
  });
  const service = resolutionService(store);

  const payloadA = await readConflictVault(service, authorizedCaller({ userId: "user-a" }));
  const payloadB = await readConflictVault(service, authorizedCaller({ userId: "user-b" }));

  assert.equal(payloadA.count, 1);
  assert.deepEqual(payloadA.conflicts.map((conflict) => conflict.id), [userA.conflictId]);
  assert.equal(payloadB.count, 1);
  assert.deepEqual(payloadB.conflicts.map((conflict) => conflict.id), [userB.conflictId]);
});

test("memory_update enforces expected_status inside the mutation lock", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "service-pending-approval",
    scope: resolutionScope,
    type: "procedure",
    canonicalText: "Pending service approval.",
    sourceKind: "user_correction",
    status: "pending",
  });
  const service = resolutionService(store);
  const approved = await service.update(
    {
      memory_id: "service-pending-approval",
      expected_status: "pending",
      patch: { status: "active" },
      reason: "Approve the pending memory.",
    },
    { caller: authorizedCaller() },
  );
  assert.equal(approved.memory.status, "active");

  await assert.rejects(
    () =>
      service.update(
        {
          memory_id: "service-pending-approval",
          expected_status: "pending",
          patch: { status: "rejected" },
          reason: "A stale approval must not overwrite the active status.",
        },
        { caller: authorizedCaller() },
      ),
    MemoryMutationPreconditionError,
  );
  assert.equal((await store.getMemory("service-pending-approval")).status, "active");
  assert.equal((await store.listEvents({ memoryId: "service-pending-approval" })).length, 2);
});

test("memory_feedback accepts an authorized trace-only correction and emits a sanitized regression fixture", async () => {
  const store = new InMemoryMemoryStore({ clock: () => new Date("2026-07-10T10:00:00.000Z") });
  for (const id of ["feedback-trace-memory-a", "feedback-trace-memory-b"]) {
    await store.addMemory({
      id,
      scope: resolutionScope,
      type: "procedure",
      canonicalText: `Procedure selected by the trace: ${id}.`,
      sourceKind: "user_instruction",
      status: "active",
    });
  }
  const run = await store.addRun({
    id: "feedback-run",
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    projectId: resolutionScope.projectId,
    agentProfileId: resolutionScope.agentProfileId,
    taskHint: "Repair the response with password=synthetic-fixture-password.",
  });
  const trace = await store.addTrace({
    id: "feedback-trace",
    tenantId: resolutionScope.tenantId,
    runId: run.id,
    query: "Explain the failure using Bearer abcdefghijklmnopqrstuvwxyz123456.",
    selectedMemoryIds: ["feedback-trace-memory-a", "feedback-trace-memory-b"],
    contextPack: "Synthetic trace context.",
  });
  const service = resolutionService(store);

  const output = await service.feedback(
    {
      trace_id: trace.id,
      signal: "unhelpful",
      reason: "The answer repeated token=synthetic-feedback-token.",
      correction: "Ask for the missing constraint before proposing a repair.",
    },
    { caller: authorizedCaller() },
  );

  assert.equal(output.trace_id, trace.id);
  assert.equal(output.signal, "unhelpful");
  assert.equal(output.correction_memory?.status, "pending");
  assert.equal(output.correction_memory?.type, "failure_memory");
  const correction = await store.getMemory(output.correction_memory.id);
  assert.deepEqual(correction.scope, resolutionScope);
  assert.equal(correction.sourceKind, "user_correction");
  assert.equal(correction.status, "pending");

  assert.equal(output.regression_fixture.target, "trace");
  assert.match(output.regression_fixture.trace_query, /\[REDACTED_TOKEN\]/);
  assert.match(output.regression_fixture.run_task_hint, /\[REDACTED_PASSWORD\]/);
  assert.match(output.regression_fixture.reason, /\[REDACTED_PASSWORD\]/);
  assert.equal(output.regression_fixture.correction, "Ask for the missing constraint before proposing a repair.");
  assert.deepEqual(output.regression_fixture.scope_dimensions, ["tenant", "user", "agent_profile", "project"]);

  const renderedFixture = JSON.stringify(output.regression_fixture);
  for (const privateValue of [
    trace.id,
    run.id,
    resolutionScope.tenantId,
    resolutionScope.userId,
    resolutionScope.projectId,
    resolutionScope.agentProfileId,
    "abcdefghijklmnopqrstuvwxyz123456",
    "synthetic-fixture-password",
    "synthetic-feedback-token",
  ]) {
    assert.equal(renderedFixture.includes(privateValue), false, `fixture excludes ${privateValue}`);
  }

  const persisted = await store.getFeedback(output.feedback_id);
  assert.equal(persisted.scope.tenantId, resolutionScope.tenantId);
  assert.equal(persisted.scope.userId, resolutionScope.userId);
  assert.equal(persisted.scope.projectId, resolutionScope.projectId);
  assert.equal(persisted.scope.agentProfileId, resolutionScope.agentProfileId);
  assert.equal(persisted.traceId, trace.id);
  assert.equal(persisted.runId, run.id);
  assert.deepEqual(persisted.actor, { type: "mcp_host", id: "authorized-reviewer" });
});

test("memory_feedback records helpful feedback without creating a correction memory", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "helpful-feedback-target",
    scope: resolutionScope,
    type: "user_preference",
    canonicalText: "Keep progress updates concise.",
    sourceKind: "user_statement",
    status: "active",
  });
  const service = resolutionService(store);

  const output = await service.feedback(
    {
      memory_id: "helpful-feedback-target",
      signal: "helpful",
      reason: "This preference improved the response.",
    },
    { caller: authorizedCaller() },
  );

  assert.equal(output.memory_id, "helpful-feedback-target");
  assert.equal(output.signal, "helpful");
  assert.equal(output.correction_memory, undefined);
  assert.equal(output.regression_fixture.correction, undefined);
  assert.equal((await store.listFeedback({ memoryId: "helpful-feedback-target" })).length, 1);
  assert.equal((await store.listMemories({ scope: resolutionScope })).length, 1);

  await assert.rejects(
    () =>
      service.feedback(
        {
          memory_id: "helpful-feedback-target",
          signal: "helpful",
          correction: "This must be rejected by the tool schema.",
        },
        { caller: authorizedCaller() },
      ),
    /correction is only allowed for unhelpful feedback/,
  );
});

test("memory_feedback removes a pending correction when feedback persistence fails", async () => {
  const store = new FeedbackFailureStore();
  await store.addMemory({
    id: "feedback-rollback-target",
    scope: resolutionScope,
    type: "failure_memory",
    canonicalText: "A failed response needs corrected guidance.",
    sourceKind: "agent_observation",
    status: "active",
  });
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.feedback(
        {
          memory_id: "feedback-rollback-target",
          signal: "unhelpful",
          correction: "Ask for the missing constraint before retrying.",
        },
        { caller: authorizedCaller() },
      ),
    /synthetic feedback persistence failure/,
  );

  assert.deepEqual(
    (await store.listMemories()).map((memory) => memory.id),
    ["feedback-rollback-target"],
  );
  assert.deepEqual(await store.listFeedback(), []);
});

test("memory_feedback rejects explicit memory and run scope conflicts before any write", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "project-a-feedback-target",
    scope: resolutionScope,
    type: "failure_memory",
    canonicalText: "Project A failure guidance.",
    sourceKind: "agent_observation",
    status: "active",
  });
  await store.addRun({
    id: "project-b-feedback-run",
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    projectId: "project-b",
    agentProfileId: resolutionScope.agentProfileId,
    taskHint: "Project B private task hint.",
  });
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.feedback(
        {
          memory_id: "project-a-feedback-target",
          run_id: "project-b-feedback-run",
          signal: "unhelpful",
          correction: "This correction must not cross projects.",
        },
        {
          caller: authorizedCaller({
            allowedProjectIds: [resolutionScope.projectId, "project-b"],
          }),
        },
      ),
    /conflicting projectId scope/,
  );
  assert.deepEqual(await store.listFeedback(), []);
  assert.deepEqual(
    (await store.listMemories()).map((memory) => memory.id),
    ["project-a-feedback-target"],
  );
});

test("trace-only feedback uses the scoped run while inheriting only type from a global selected memory", async () => {
  const store = new InMemoryMemoryStore();
  const globalScope = {
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    agentProfileId: resolutionScope.agentProfileId,
  };
  await store.addMemory({
    id: "global-trace-feedback-memory",
    scope: globalScope,
    type: "procedure",
    canonicalText: "Global retry procedure.",
    sourceKind: "user_instruction",
    status: "active",
    importance: 0.91,
  });
  const run = await store.addRun({
    id: "scoped-trace-feedback-run",
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    projectId: "project-b",
    agentProfileId: resolutionScope.agentProfileId,
    taskHint: "Retry the Project B task.",
  });
  const trace = await store.addTrace({
    id: "scoped-trace-feedback",
    tenantId: resolutionScope.tenantId,
    runId: run.id,
    selectedMemoryIds: ["global-trace-feedback-memory"],
    query: "Which retry procedure applies?",
  });
  const service = resolutionService(store);
  const output = await service.feedback(
    {
      trace_id: trace.id,
      signal: "unhelpful",
      correction: "Verify the Project B constraint before retrying.",
    },
    {
      caller: authorizedCaller({ allowedProjectIds: ["project-b"] }),
    },
  );

  assert.equal(output.correction_memory.type, "procedure");
  const correction = await store.getMemory(output.correction_memory.id);
  assert.equal(correction.importance, 0.91);
  assert.deepEqual(correction.scope, {
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    agentProfileId: resolutionScope.agentProfileId,
    projectId: "project-b",
  });
  const persisted = await store.getFeedback(output.feedback_id);
  assert.equal(persisted.scope.projectId, "project-b");
  assert.equal(persisted.scope.agentProfileId, resolutionScope.agentProfileId);
});

test("memory_feedback redacts email and phone from corrections and regression fixtures", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "pii-feedback-target",
    scope: resolutionScope,
    type: "failure_memory",
    canonicalText: "A response used personal contact data.",
    sourceKind: "agent_observation",
    status: "active",
  });
  const run = await store.addRun({
    id: "pii-feedback-run",
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    projectId: resolutionScope.projectId,
    agentProfileId: resolutionScope.agentProfileId,
    taskHint: "Call +1 415 555 0199 before retrying.",
  });
  const trace = await store.addTrace({
    id: "pii-feedback-trace",
    tenantId: resolutionScope.tenantId,
    runId: run.id,
    query: "Ask reviewer@example.com why the response failed.",
    selectedMemoryIds: ["pii-feedback-target"],
  });
  const service = resolutionService(store);
  const output = await service.feedback(
    {
      memory_id: "pii-feedback-target",
      trace_id: trace.id,
      signal: "unhelpful",
      reason: "Reviewer reviewer@example.com confirmed +1 415 555 0199 was private.",
      correction: "Email owner@example.com or call +1 415 555 0199 before retrying.",
    },
    { caller: authorizedCaller() },
  );

  const correction = await store.getMemory(output.correction_memory.id);
  const persisted = await store.getFeedback(output.feedback_id);
  const rendered = JSON.stringify({ output, correction, persisted });
  assert.equal(rendered.includes("reviewer@example.com"), false);
  assert.equal(rendered.includes("owner@example.com"), false);
  assert.equal(rendered.includes("415 555 0199"), false);
  assert.match(output.correction_memory.text, /\[REDACTED_EMAIL\]/);
  assert.match(output.correction_memory.text, /\[REDACTED_PHONE\]/);
  assert.match(output.regression_fixture.trace_query, /\[REDACTED_EMAIL\]/);
  assert.match(output.regression_fixture.run_task_hint, /\[REDACTED_PHONE\]/);
  assert.match(output.regression_fixture.reason, /\[REDACTED_EMAIL\].*\[REDACTED_PHONE\]/);
});

test("memory_feedback rejects a cross-user target before writing feedback or correction", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "cross-user-feedback-target",
    scope: resolutionScope,
    type: "failure_memory",
    canonicalText: "A private failure belonging to the authorized user.",
    sourceKind: "agent_observation",
    status: "active",
  });
  const service = resolutionService(store);

  await assert.rejects(
    () =>
      service.feedback(
        {
          memory_id: "cross-user-feedback-target",
          signal: "unhelpful",
          correction: "An unauthorized replacement must not be persisted.",
        },
        { caller: authorizedCaller({ userId: "user-other" }) },
      ),
    ScopeGuardError,
  );

  assert.deepEqual(await store.listFeedback(), []);
  assert.deepEqual(
    (await store.listMemories()).map((memory) => memory.id),
    ["cross-user-feedback-target"],
  );
});

test("hard_delete makes a memory unavailable to feedback and redacts linked content while retaining scoped audit", async () => {
  const store = new InMemoryMemoryStore({ clock: () => new Date("2026-07-10T11:00:00.000Z") });
  const privateText = "Private target content that must disappear after hard deletion.";
  await store.addMemory({
    id: "hard-delete-feedback-target",
    scope: resolutionScope,
    type: "failure_memory",
    canonicalText: privateText,
    rawSource: `Raw source: ${privateText}`,
    sourceKind: "agent_observation",
    status: "active",
  });
  await store.addTrace({
    id: "hard-delete-feedback-trace",
    tenantId: resolutionScope.tenantId,
    selectedMemoryIds: ["hard-delete-feedback-target"],
    contextPack: privateText,
    selectionReasons: { "hard-delete-feedback-target": privateText },
  });
  const service = resolutionService(store);
  const feedback = await service.feedback(
    {
      memory_id: "hard-delete-feedback-target",
      trace_id: "hard-delete-feedback-trace",
      signal: "unhelpful",
      reason: `Incorrect because it repeated: ${privateText}`,
      correction: "Do not reuse deleted private content.",
    },
    { caller: authorizedCaller() },
  );

  const deletion = await service.forget(
    {
      memory_id: "hard-delete-feedback-target",
      mode: "hard_delete",
      reason: "The user requested permanent removal.",
    },
    { caller: authorizedCaller() },
  );
  assert.equal(deletion.status, "deleted");
  assert.equal(await store.getMemory("hard-delete-feedback-target"), undefined);

  await assert.rejects(
    () =>
      service.feedback(
        { memory_id: "hard-delete-feedback-target", signal: "helpful" },
        { caller: authorizedCaller() },
      ),
    /Memory not found: hard-delete-feedback-target/,
  );

  const redactedFeedback = await store.getFeedback(feedback.feedback_id);
  assert.equal(redactedFeedback.reason, undefined);
  assert.equal(redactedFeedback.regressionFixture.hard_deleted_content_redacted, true);
  assert.equal(JSON.stringify(redactedFeedback).includes(privateText), false);

  const redactedTrace = await store.getTrace("hard-delete-feedback-trace");
  assert.deepEqual(redactedTrace.selectedMemoryIds, []);
  assert.equal(redactedTrace.contextPack, undefined);
  assert.equal(JSON.stringify(redactedTrace).includes(privateText), false);

  const events = await store.listEvents({ memoryId: "hard-delete-feedback-target" });
  assert.equal(events.some((event) => event.id === deletion.event_id && event.eventType === "delete"), true);
  assert.equal(JSON.stringify(events).includes(privateText), false);
  const tombstone = events.find((event) => event.id === deletion.event_id);
  assert.deepEqual(tombstone.after.scope, resolutionScope);
  assert.equal(tombstone.after.deletedMemoryId, "hard-delete-feedback-target");
});

const resolutionScope = {
  tenantId: "tenant-resolution",
  userId: "user-resolution",
  projectId: "project-resolution",
  agentProfileId: "agent-resolution"
};

async function addConflictFixture(store, suffix, scopePatch = {}) {
  const fixtureScope = { ...resolutionScope, ...scopePatch };
  const candidateId = `candidate-${suffix}`;
  const existingId = `existing-${suffix}`;
  const conflictId = `conflict-${suffix}`;
  await store.addMemory({
    id: existingId,
    scope: fixtureScope,
    type: "user_preference",
    canonicalText: `Existing preference for ${suffix}.`,
    rawSource: `existing raw source ${suffix}`,
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.91,
    importance: 0.81,
    metadata: { fixture: suffix, role: "existing" }
  });
  await store.addMemory({
    id: candidateId,
    scope: fixtureScope,
    type: "user_preference",
    canonicalText: `Candidate preference for ${suffix}.`,
    rawSource: `candidate raw source ${suffix}`,
    sourceKind: "user_correction",
    status: "pending",
    confidence: 0.93,
    importance: 0.83,
    supersedes: ["earlier-history"],
    metadata: { fixture: suffix, role: "candidate" }
  });
  await store.addConflict({
    id: conflictId,
    tenantId: fixtureScope.tenantId,
    candidateMemoryId: candidateId,
    existingMemoryId: existingId,
    conflictType: "contradiction",
    recommendedAction: "ask_user",
    reason: `Fixture conflict ${suffix}.`
  });
  return {
    candidateId,
    existingId,
    conflictId,
    candidateBefore: await store.getMemory(candidateId),
    existingBefore: await store.getMemory(existingId)
  };
}

function resolutionService(store) {
  return new ContinuityMemoryService({
    store,
    provider: conflictProvider(),
    seedDemoMemories: false
  });
}

class FeedbackFailureStore extends InMemoryMemoryStore {
  addFeedbackWithCorrection = undefined;

  async addFeedback() {
    throw new Error("synthetic feedback persistence failure");
  }
}

function authorizedCaller(overrides = {}) {
  return {
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    actorType: "mcp_host",
    actorId: "authorized-reviewer",
    allowedProjectIds: [resolutionScope.projectId],
    allowedAgentProfileIds: [resolutionScope.agentProfileId],
    authMode: "api_key",
    ...overrides
  };
}

async function readConflictVault(service, caller) {
  const resource = await service.readResource(
    {
      name: "vault-conflicts",
      uri: "memory://vault/conflicts",
      variables: {}
    },
    { caller }
  );
  return JSON.parse(resource.text);
}

function assertMemoryMatchesBefore(actual, expected) {
  assert.ok(actual);
  assert.ok(expected);
  assert.equal(actual.id, expected.id);
  assert.deepEqual(actual.scope, expected.scope);
  assert.equal(actual.type, expected.type);
  assert.equal(actual.canonicalText, expected.canonicalText);
  assert.equal(actual.rawSource, expected.rawSource);
  assert.equal(actual.sourceKind, expected.sourceKind);
  assert.equal(actual.status, expected.status);
  assert.equal(actual.confidence, expected.confidence);
  assert.equal(actual.importance, expected.importance);
  assert.deepEqual(actual.supersedes, expected.supersedes);
  assert.equal(actual.supersededBy, expected.supersededBy);
  assert.deepEqual(actual.metadata, expected.metadata);
}

class FailingSecondResolutionUpdateStore extends InMemoryMemoryStore {
  resolutionUpdateCount = 0;

  async updateMemory(id, patch, options = {}) {
    if (options.metadata?.resolution_rollback !== true) {
      this.resolutionUpdateCount += 1;
    }
    const result = await super.updateMemory(id, patch, options);
    if (options.metadata?.resolution_rollback !== true && this.resolutionUpdateCount === 2) {
      throw new Error("injected second resolution update failure");
    }
    return result;
  }
}

class NonPersistingConflictResolutionStore extends InMemoryMemoryStore {
  async resolveConflict(id) {
    const before = await this.getConflict(id);
    assert.ok(before);
    return { before, conflict: before };
  }
}

function conflictProvider() {
  return {
    async extractMemories() {
      return [
        {
          type: "user_preference",
          canonicalText: "User prioritizes founder network over prize money.",
          scope,
          validity: { status: "current" },
          confidence: 0.92,
          importance: 0.86,
          status: "active",
          sourceKind: "user_correction",
          sourceTrust: "user_direct",
          rawSource: "User now prioritizes founder network over prize money.",
          safety: {
            decision: "allow",
            sensitive: false,
            untrustedExternal: false,
            reasons: [],
            redactions: []
          },
          rationale: "User corrected an existing preference."
        }
      ];
    },
    async detectConflicts() {
      return {
        conflicts: [
          {
            existingMemoryId: "existing-preference",
            conflictType: "contradiction",
            severity: "high",
            reason: "The candidate updates the user's prioritization criteria.",
            suggestedAction: "ask_user",
            confidence: 0.93
          }
        ],
        recommendedAction: "ask_user",
        reason: "A user-visible decision is required before changing the active preference."
      };
    },
    async buildContextPack() {
      throw new Error("buildContextPack is not used in this test.");
    },
    async reflectRun() {
      throw new Error("reflectRun is not used in this test.");
    },
    async explainMemoryUsage() {
      throw new Error("explainMemoryUsage is not used in this test.");
    },
    async classifyMemory() {
      throw new Error("classifyMemory is not used in this test.");
    }
  };
}
