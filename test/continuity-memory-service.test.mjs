import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryMemoryStore, MemoryMutationPreconditionError, MockMemoryProvider } from "@handoffbase/memory-core";
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

test("memory_feedback accepts a session-scoped memory paired with a run that has no session scope", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "session-scoped-target",
    scope: { ...resolutionScope, sessionId: "session-x" },
    type: "failure_memory",
    canonicalText: "A session-scoped failure worth giving feedback on.",
    sourceKind: "agent_observation",
    status: "active",
  });
  const run = await store.addRun({
    id: "session-feedback-run",
    tenantId: resolutionScope.tenantId,
    userId: resolutionScope.userId,
    projectId: resolutionScope.projectId,
    agentProfileId: resolutionScope.agentProfileId,
  });
  const service = resolutionService(store);

  const output = await service.feedback(
    {
      memory_id: "session-scoped-target",
      run_id: run.id,
      signal: "unhelpful",
      correction: "Prefer verifying the session context first.",
    },
    { caller: authorizedCaller() },
  );

  assert.ok(output.feedback_id);
  assert.ok(output.correction_memory?.id);
});

test("memory_update rejects reserved terminal statuses that have dedicated flows", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "update-guard-target",
    scope: resolutionScope,
    type: "user_preference",
    canonicalText: "A memory that should not be deleted through memory_update.",
    sourceKind: "user_statement",
    status: "active",
  });
  const service = resolutionService(store);
  const caller = authorizedCaller();

  for (const status of ["deleted", "superseded"]) {
    await assert.rejects(
      () => service.update({ memory_id: "update-guard-target", patch: { status } }, { caller }),
      /memory_update cannot set status/,
      `memory_update must not set reserved status "${status}"`,
    );
  }

  const current = await store.getMemory("update-guard-target");
  assert.equal(current.status, "active");
  assert.match(current.canonicalText, /should not be deleted/);
});

test("continuity_bootstrap respects a token budget too small for any memory", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "budget-memory",
    scope: { tenantId: "demo-tenant", userId: "budget-user" },
    type: "user_preference",
    canonicalText: "This user preference is far longer than a one-token budget could ever hold.",
    sourceKind: "user_statement",
    status: "active",
  });
  const service = new ContinuityMemoryService({
    store,
    provider: new MockMemoryProvider(),
    seedDemoMemories: false,
  });

  const output = await service.continuityBootstrap({
    host: "codex",
    user_id: "budget-user",
    token_budget: 1,
  });

  const pack = output.context_pack;
  const total =
    pack.user.length +
    pack.procedures.length +
    pack.project.length +
    pack.tool_memory.length +
    pack.failure_memory.length;
  assert.equal(total, 0, "a 1-token budget must not dump every recalled memory into the pack");
});

// ---------------------------------------------------------------------------
// Strategic forgetting: memory_forget mode enforce_capacity
// ---------------------------------------------------------------------------

const capacityScope = {
  tenantId: "tenant-capacity",
  userId: "user-capacity",
  projectId: "project-capacity",
  agentProfileId: "agent-capacity"
};

const capacityToolScopes = {
  tenant_id: capacityScope.tenantId,
  user_id: capacityScope.userId,
  project_id: capacityScope.projectId,
  agent_profile_id: capacityScope.agentProfileId
};

function capacityCaller(overrides = {}) {
  return {
    tenantId: capacityScope.tenantId,
    userId: capacityScope.userId,
    actorType: "mcp_host",
    actorId: "capacity-tester",
    allowedProjectIds: [capacityScope.projectId],
    allowedAgentProfileIds: [capacityScope.agentProfileId],
    authMode: "api_key",
    ...overrides
  };
}

async function seedCapacityFixture(store, { scopePatch = {}, idPrefix = "" } = {}) {
  const seedScope = { ...capacityScope, ...scopePatch };
  const seeds = [
    { id: "cap-keep-1", importance: 0.95, type: "user_preference" },
    { id: "cap-keep-2", importance: 0.8, type: "procedure" },
    { id: "cap-keep-3", importance: 0.65, type: "project_fact" },
    { id: "cap-evict-1", importance: 0.5, type: "tool_memory" },
    { id: "cap-evict-2", importance: 0.35, type: "outcome_memory" }
  ];
  for (const seed of seeds) {
    await store.addMemory({
      id: `${idPrefix}${seed.id}`,
      scope: seedScope,
      type: seed.type,
      canonicalText: `Capacity test memory ${idPrefix}${seed.id}.`,
      sourceKind: "manual_import",
      status: "active",
      confidence: 0.9,
      importance: seed.importance
    });
  }
  return seeds;
}

function capacityService(store) {
  return new ContinuityMemoryService({
    store,
    provider: new MockMemoryProvider(),
    seedDemoMemories: false,
    clock: () => new Date("2026-07-11T00:00:00.000Z")
  });
}

test("memory_forget enforce_capacity archives exactly the lowest-retention memories with events and a sweep trace", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  const service = capacityService(store);
  const eventCountBefore = (await store.listEvents()).length;

  const output = await service.forget(
    {
      mode: "enforce_capacity",
      capacity: 3,
      reason: "Test capacity sweep.",
      scopes: capacityToolScopes
    },
    { caller: capacityCaller() }
  );

  assert.equal(output.mode, "enforce_capacity");
  assert.equal(output.capacity, 3);
  assert.equal(output.dry_run, false);
  assert.equal(output.retained_count, 3);
  assert.deepEqual(
    output.evicted_memories.map((entry) => entry.memory_id).sort(),
    ["cap-evict-1", "cap-evict-2"]
  );

  for (const entry of output.evicted_memories) {
    assert.equal(entry.status, "archived");
    assert.ok(entry.event_id, "each eviction must emit its own governance event");
    assert.match(entry.reason, /capacity 3: retention \d+\.\d{4}, rank \d\/5/);
    const archived = await store.getMemory(entry.memory_id);
    assert.equal(archived.status, "archived", "eviction must be reversible archive, not delete");
    assert.ok(archived.canonicalText.length > 0, "archived memory keeps its content");
  }

  // One update event per eviction, attributed to the authenticated caller
  // (consistent with every other tool); the sweep provenance lives in the
  // event reason's capacity/retention/rank marker.
  const events = (await store.listEvents()).slice(eventCountBefore);
  const evictionEvents = events.filter((event) => event.eventType === "update");
  assert.equal(evictionEvents.length, 2);
  for (const event of evictionEvents) {
    assert.equal(event.actor.id, "capacity-tester");
    assert.match(event.reason, /capacity 3: retention/);
  }

  // Aggregate sweep trace explains retained vs evicted.
  assert.ok(output.trace_id, "apply must return a sweep trace id");
  const trace = await store.getTrace(output.trace_id);
  assert.equal(trace.metadata.stage, "capacity_sweep");
  assert.equal(trace.metadata.active_count_before, 5);
  assert.equal(trace.metadata.evicted_count, 2);
  assert.deepEqual([...trace.selectedMemoryIds].sort(), ["cap-keep-1", "cap-keep-2", "cap-keep-3"]);
  assert.deepEqual([...trace.ignoredMemoryIds].sort(), ["cap-evict-1", "cap-evict-2"]);
  assert.match(trace.selectionReasons["cap-evict-2"], /retention/);
  assert.match(trace.selectionReasons["cap-keep-1"], /Retained within capacity/);

  // Evicted memories drop out of recall; retained ones survive.
  const recall = await service.recall(
    { query: "capacity test memory", scopes: capacityToolScopes, limit: 5 },
    { caller: capacityCaller() }
  );
  const recalledIds = recall.memories.map((memory) => memory.id);
  assert.ok(["cap-keep-1", "cap-keep-2", "cap-keep-3"].every((id) => recalledIds.includes(id)));
  assert.ok(!recalledIds.includes("cap-evict-1"));
  assert.ok(!recalledIds.includes("cap-evict-2"));
});

test("memory_forget enforce_capacity is a no-op under capacity and dry_run never mutates", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  const service = capacityService(store);

  // No-op: capacity above the active count.
  const noop = await service.forget(
    { mode: "enforce_capacity", capacity: 10, reason: "No-op sweep.", scopes: capacityToolScopes },
    { caller: capacityCaller() }
  );
  assert.equal(noop.retained_count, 5);
  assert.deepEqual(noop.evicted_memories, []);

  // Dry run: full plan, zero mutation, zero events, zero traces.
  const eventCountBefore = (await store.listEvents()).length;
  const plan = await service.forget(
    { mode: "enforce_capacity", capacity: 3, dry_run: true, reason: "Plan only.", scopes: capacityToolScopes },
    { caller: capacityCaller() }
  );
  assert.equal(plan.dry_run, true);
  assert.equal(plan.trace_id, undefined, "dry run must not create a trace");
  assert.deepEqual(
    plan.evicted_memories.map((entry) => entry.memory_id).sort(),
    ["cap-evict-1", "cap-evict-2"]
  );
  for (const entry of plan.evicted_memories) {
    assert.equal(typeof entry.retention_score, "number");
    assert.equal(entry.event_id, undefined, "dry run must not emit events");
  }
  assert.equal((await store.listEvents()).length, eventCountBefore, "dry run must not emit events");
  const actives = await store.listMemories({ scope: capacityScope, statuses: ["active"] });
  assert.equal(actives.length, 5, "dry run must not archive anything");
});

test("memory_forget enforce_capacity honors protected_types by evicting the next-lowest instead", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  const service = capacityService(store);

  const output = await service.forget(
    {
      mode: "enforce_capacity",
      capacity: 3,
      reason: "Protect outcome memories.",
      scopes: capacityToolScopes,
      protected_types: ["outcome_memory"]
    },
    { caller: capacityCaller() }
  );

  // cap-evict-2 (outcome_memory, lowest retention) is exempt; the two lowest
  // non-protected candidates go instead: cap-evict-1 and cap-keep-3.
  assert.deepEqual(
    output.evicted_memories.map((entry) => entry.memory_id).sort(),
    ["cap-evict-1", "cap-keep-3"]
  );
  assert.equal((await store.getMemory("cap-evict-2")).status, "active");
});

test("memory_forget enforce_capacity enforces tenant, user, and project authorization and scope isolation", async () => {
  const unauthorized = [
    { label: "tenant", caller: capacityCaller({ tenantId: "tenant-other" }) },
    { label: "user", caller: capacityCaller({ userId: "user-other" }) },
    { label: "project", caller: capacityCaller({ allowedProjectIds: ["project-other"] }) }
  ];

  for (const item of unauthorized) {
    const store = new InMemoryMemoryStore();
    await seedCapacityFixture(store);
    const service = capacityService(store);
    await assert.rejects(
      () =>
        service.forget(
          { mode: "enforce_capacity", capacity: 1, reason: `Unauthorized ${item.label}.`, scopes: capacityToolScopes },
          { caller: item.caller }
        ),
      ScopeGuardError,
      `unauthorized ${item.label} caller must be rejected`
    );
  }

  // Cross-scope isolation: another user's over-capacity memories are neither
  // counted nor evicted by this user's sweep.
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  await seedCapacityFixture(store, { scopePatch: { userId: "user-capacity-b" }, idPrefix: "b-" });
  const service = capacityService(store);

  await service.forget(
    { mode: "enforce_capacity", capacity: 3, reason: "Scoped sweep.", scopes: capacityToolScopes },
    { caller: capacityCaller() }
  );

  const otherUserActives = await store.listMemories({
    scope: { ...capacityScope, userId: "user-capacity-b" },
    statuses: ["active"]
  });
  assert.equal(otherUserActives.length, 5, "the sweep must never touch another user's memories");
});

test("memory_forget rejects malformed enforce_capacity and per-memory cross-field combinations", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  const service = capacityService(store);
  const caller = capacityCaller();

  // enforce_capacity with memory_id, or without capacity.
  await assert.rejects(
    () => service.forget(
      { mode: "enforce_capacity", capacity: 3, memory_id: "cap-keep-1", reason: "Bad." , scopes: capacityToolScopes },
      { caller }
    ),
    /memory_id is not allowed/
  );
  await assert.rejects(
    () => service.forget(
      { mode: "enforce_capacity", reason: "Bad.", scopes: capacityToolScopes },
      { caller }
    ),
    /capacity is required/
  );

  // Per-memory mode with capacity-only fields.
  await assert.rejects(
    () => service.forget(
      { mode: "archive", memory_id: "cap-keep-1", capacity: 3, reason: "Bad." },
      { caller }
    ),
    /capacity is only allowed/
  );
  await assert.rejects(
    () => service.forget(
      { mode: "archive", memory_id: "cap-keep-1", dry_run: true, reason: "Bad." },
      { caller }
    ),
    /dry_run is only allowed/
  );
  await assert.rejects(
    () => service.forget({ mode: "invalidate", reason: "Bad." }, { caller }),
    /memory_id is required/
  );
});

test("memory_forget enforce_capacity racing a per-memory forget yields exactly one mutation and no double event", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  const service = capacityService(store);
  const caller = capacityCaller();

  const [sweep, single] = await Promise.allSettled([
    service.forget(
      { mode: "enforce_capacity", capacity: 3, reason: "Race sweep.", scopes: capacityToolScopes },
      { caller }
    ),
    service.forget(
      { mode: "invalidate", memory_id: "cap-evict-2", reason: "Race invalidate." },
      { caller }
    )
  ]);

  assert.equal(sweep.status, "fulfilled", sweep.reason?.message);
  assert.equal(single.status, "fulfilled", single.reason?.message);

  // The raced victim ends in exactly one terminal state and has exactly one
  // terminal-transition event; the sweep skipped it if the invalidate won.
  const raced = await store.getMemory("cap-evict-2");
  assert.ok(["archived", "invalidated"].includes(raced.status));
  const racedEvents = (await store.listEvents({ memoryId: "cap-evict-2" }))
    .filter((event) => event.eventType === "update");
  assert.equal(racedEvents.length, 1, "the raced memory must receive exactly one mutation event");
});

// ---------------------------------------------------------------------------
// Limited context window: strict server-side token budget enforcement
// ---------------------------------------------------------------------------

test("recall trims the provider selection to the caller token budget and records the trim on the trace", async () => {
  const store = new InMemoryMemoryStore();
  const budgetScope = { tenantId: "tenant-budget", userId: "user-budget" };
  const texts = [
    { id: "budget-top", importance: 0.99, text: "Prefer infrastructure-grade opportunities." },
    { id: "budget-trimmed", importance: 0.8, text: "Weight founder-network value over prizes." },
    { id: "budget-skipped", importance: 0.6, text: "Verify deadlines from primary sources first." }
  ];
  for (const seed of texts) {
    await store.addMemory({
      id: seed.id,
      scope: budgetScope,
      type: "user_preference",
      canonicalText: seed.text,
      sourceKind: "user_statement",
      status: "active",
      confidence: 0.9,
      importance: seed.importance
    });
  }
  const service = new ContinuityMemoryService({ store, provider: new MockMemoryProvider(), seedDemoMemories: false });

  // Budget 25: the mock provider selects the top two raw texts (11 + 11
  // estimated tokens), but only the first rendered "- [type] text" line fits.
  const output = await service.recall({
    query: "opportunity preferences",
    scopes: { tenant_id: budgetScope.tenantId, user_id: budgetScope.userId },
    limit: 5,
    token_budget: 25
  });

  assert.equal(output.token_budget, 25);
  assert.ok(output.estimated_tokens <= output.token_budget, "estimated_tokens must never exceed the budget");
  assert.match(output.context_block, /Prefer infrastructure-grade opportunities\./);
  assert.doesNotMatch(output.context_block, /founder-network value/);
  assert.doesNotMatch(output.context_block, /primary sources first/);

  const trace = await store.getTrace(output.trace_id);
  assert.ok(trace.ignoredMemoryIds.includes("budget-trimmed"));
  assert.match(
    trace.selectionReasons["budget-trimmed"],
    /Trimmed to fit the token budget of 25 tokens\./,
    "server trim reason must be distinct from the provider's skip reason"
  );
});

test("a provider echoing a bogus token budget cannot bypass the caller budget", async () => {
  const store = new InMemoryMemoryStore();
  const echoScope = { tenantId: "tenant-echo", userId: "user-echo" };
  await store.addMemory({
    id: "echo-long",
    scope: echoScope,
    type: "user_preference",
    canonicalText: "This over-budget selection was returned by a model that ignored the requested budget entirely.",
    sourceKind: "user_statement",
    status: "active"
  });

  // Qwen-shaped provider: returns an over-budget selection and echoes
  // tokenBudget 0, the normalizeContextPack fallback for a missing echo.
  const mock = new MockMemoryProvider();
  const echoProvider = {
    extractMemories: (input) => mock.extractMemories(input),
    classifyMemory: (input) => mock.classifyMemory(input),
    detectConflicts: (input) => mock.detectConflicts(input),
    reflectRun: (input) => mock.reflectRun(input),
    explainMemoryUsage: (input) => mock.explainMemoryUsage(input),
    async buildContextPack(input) {
      const line = (memory) => `- [${memory.type}] ${memory.canonicalText}`;
      return {
        contextBlock: input.memories.map(line).join("\n"),
        selectedMemories: input.memories.map((memory) => ({
          memoryId: memory.id,
          type: memory.type,
          text: memory.canonicalText,
          reason: "Selected by the over-eager stub provider.",
          score: 1
        })),
        ignoredMemories: [],
        tokenBudget: 0,
        estimatedTokens: 0,
        trace: { query: input.query, scope: input.scopes }
      };
    }
  };

  const service = new ContinuityMemoryService({ store, provider: echoProvider, seedDemoMemories: false });
  const output = await service.recall({
    query: "anything",
    scopes: { tenant_id: echoScope.tenantId, user_id: echoScope.userId },
    token_budget: 5
  });

  assert.equal(output.token_budget, 5, "output must reflect the caller budget, not the provider echo");
  assert.equal(output.context_block, "", "an over-budget selection must be trimmed server-side");
  assert.ok(output.estimated_tokens <= 5);
});

test("bootstrap surfaces token accounting and stays within the caller budget", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "bootstrap-budget-pref",
    scope: { tenantId: "demo-tenant", userId: "bootstrap-budget-user" },
    type: "user_preference",
    canonicalText: "Keep bootstrap packs short.",
    sourceKind: "user_statement",
    status: "active",
    importance: 0.9
  });
  const service = new ContinuityMemoryService({ store, provider: new MockMemoryProvider(), seedDemoMemories: false });

  const output = await service.continuityBootstrap({
    host: "codex",
    user_id: "bootstrap-budget-user",
    token_budget: 40
  });

  assert.equal(output.token_budget, 40);
  assert.ok(Number.isInteger(output.estimated_tokens));
  assert.ok(output.estimated_tokens <= output.token_budget);
  assert.ok(output.context_pack.user.some((text) => text.includes("Keep bootstrap packs short.")));
});

test("enforceTokenBudget lets a smaller later memory fit, preserves order, and holds its invariant", async () => {
  const { enforceTokenBudget } = await import("../dist/services/continuity-memory-service.js");
  const packMemory = (id, text) => ({ memoryId: id, type: "user_preference", text, reason: "test", score: 1 });
  const basePack = (memories) => ({
    contextBlock: "unused-by-enforcer",
    selectedMemories: memories,
    ignoredMemories: [{ memoryId: "provider-skip", reason: "Skipped to fit the token budget." }],
    tokenBudget: 0,
    estimatedTokens: 0,
    trace: { query: "q", scope: { tenantId: "t", userId: "u" } }
  });

  // Skip-and-continue: the long middle memory is trimmed; the short later one fits.
  const pack = enforceTokenBudget(
    basePack([
      packMemory("first", "Short first entry."),
      packMemory("middle", "This middle entry is deliberately much longer than the remaining budget can accommodate."),
      packMemory("last", "Tiny.")
    ]),
    18
  );
  assert.deepEqual(pack.selectedMemories.map((memory) => memory.memoryId), ["first", "last"]);
  assert.ok(pack.ignoredMemories.some((memory) => memory.memoryId === "middle" && /Trimmed to fit/.test(memory.reason)));
  assert.ok(pack.ignoredMemories.some((memory) => memory.memoryId === "provider-skip"), "provider skips are preserved");
  assert.equal(pack.tokenBudget, 18);
  assert.ok(pack.estimatedTokens <= 18);
  assert.equal(pack.contextBlock, "- [user_preference] Short first entry.\n- [user_preference] Tiny.");

  // Empty selection stays empty at any budget.
  const empty = enforceTokenBudget(basePack([]), 1);
  assert.equal(empty.contextBlock, "");
  assert.deepEqual(empty.selectedMemories, []);
  assert.equal(empty.estimatedTokens, 0);
});

// ---------------------------------------------------------------------------
// memory_reflect: report only actually-invalidated ids
// ---------------------------------------------------------------------------

test("reflect reports only actually-invalidated ids, never hallucinated or stale provider ids", async () => {
  const store = new InMemoryMemoryStore();
  const reflectScope = { tenantId: "tenant-reflect", userId: "user-reflect" };
  await store.addMemory({
    id: "reflect-real-target",
    scope: reflectScope,
    type: "project_fact",
    canonicalText: "This fact is stale and should be invalidated.",
    sourceKind: "manual_import",
    status: "active"
  });

  const mock = new MockMemoryProvider();
  const reflectProvider = {
    extractMemories: (input) => mock.extractMemories(input),
    classifyMemory: (input) => mock.classifyMemory(input),
    detectConflicts: (input) => mock.detectConflicts(input),
    buildContextPack: (input) => mock.buildContextPack(input),
    explainMemoryUsage: (input) => mock.explainMemoryUsage(input),
    async reflectRun() {
      return {
        summary: "Run reflection with one real and one hallucinated invalidation.",
        newMemories: [],
        invalidatedMemories: [
          { memoryId: "reflect-real-target", reason: "Confirmed stale." },
          { memoryId: "reflect-hallucinated-id", reason: "Provider made this up." }
        ]
      };
    }
  };

  const service = new ContinuityMemoryService({ store, provider: reflectProvider, seedDemoMemories: false });
  const output = await service.reflect({
    run_id: "reflect-regression-run",
    summary: "Regression check for invalidated id reporting.",
    scopes: { tenant_id: reflectScope.tenantId, user_id: reflectScope.userId }
  });

  assert.deepEqual(output.invalidated_memories, ["reflect-real-target"], "only the real id may be reported");
  assert.equal((await store.getMemory("reflect-real-target")).status, "invalidated");
  const hallucinatedEvents = await store.listEvents({ memoryId: "reflect-hallucinated-id" });
  assert.equal(hallucinatedEvents.length, 0, "no event may reference the hallucinated id");
});

// ---------------------------------------------------------------------------
// enforce_capacity: eviction eligibility (scope narrowness + caller authority)
// ---------------------------------------------------------------------------

async function seedBroadMemory(store) {
  // A user-wide memory with no project/agent dimension: it appears in every
  // narrowed recall view (undefined dimensions are wildcards) but belongs to
  // a broader scope than any project-scoped sweep.
  await store.addMemory({
    id: "cap-broad-user-wide",
    scope: { tenantId: capacityScope.tenantId, userId: capacityScope.userId },
    type: "user_preference",
    canonicalText: "Capacity test broad user-wide memory.",
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.9,
    importance: 0.1
  });
}

test("enforce_capacity never aborts mid-sweep on broader memories a restricted caller cannot archive; dry-run and apply agree", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  await seedBroadMemory(store);
  const service = capacityService(store);
  // Restricted caller: allowed lists are set, so the broad memory (no
  // project/agent dimension) is outside its mutation authority.
  const caller = capacityCaller();
  const sweepInput = {
    mode: "enforce_capacity",
    capacity: 3,
    reason: "Restricted-caller sweep.",
    scopes: capacityToolScopes
  };

  // 6 actives (5 scoped + 1 broad), capacity 3 -> excess 3, but only the 5
  // scoped memories are eligible; the broad one counts toward capacity yet
  // must never be planned, evicted, or crash the loop.
  const plan = await service.forget({ ...sweepInput, dry_run: true }, { caller });
  const plannedIds = plan.evicted_memories.map((entry) => entry.memory_id).sort();
  assert.ok(!plannedIds.includes("cap-broad-user-wide"), "dry run must not plan a broader-scope victim");

  const applied = await service.forget(sweepInput, { caller });
  const evictedIds = applied.evicted_memories.map((entry) => entry.memory_id).sort();
  assert.deepEqual(evictedIds, plannedIds, "apply must evict exactly what dry run planned");
  assert.ok(applied.trace_id, "the sweep must complete and produce its audit trace");
  assert.equal((await store.getMemory("cap-broad-user-wide")).status, "active");

  const trace = await store.getTrace(applied.trace_id);
  assert.equal(trace.metadata.ineligible_count, 1, "the broad memory is counted as ineligible");
});

test("a project/agent-scoped sweep from an unrestricted caller never archives broader user-wide memories", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  await seedBroadMemory(store);
  const service = capacityService(store);
  // Unrestricted caller (no allowed lists): authority alone would permit
  // archiving the broad memory — scope narrowness must still forbid it.
  const caller = capacityCaller({ allowedProjectIds: undefined, allowedAgentProfileIds: undefined });

  // 6 actives, capacity 5 -> exactly one eviction. The broad memory has the
  // LOWEST retention (importance 0.1) but must be passed over in favor of the
  // lowest-retention memory that is fully inside the sweep scope.
  const output = await service.forget(
    { mode: "enforce_capacity", capacity: 5, reason: "Narrow sweep.", scopes: capacityToolScopes },
    { caller }
  );

  assert.deepEqual(
    output.evicted_memories.map((entry) => entry.memory_id),
    ["cap-evict-2"],
    "the lowest-retention IN-SCOPE memory is evicted, not the broader one"
  );
  assert.equal((await store.getMemory("cap-broad-user-wide")).status, "active");
});

// ---------------------------------------------------------------------------
// enforce_capacity: race-skipped victims must not be reported as retained
// ---------------------------------------------------------------------------

test("victims skipped mid-race are reported as skipped, never as retained, and retained_count stays truthful", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  // Inject a concurrent invalidate between the sweep's active snapshot and
  // its victim locks: the snapshot is computed first, the mutation lands,
  // then the stale snapshot is returned to the sweep.
  const originalList = store.listMemories.bind(store);
  let injected = false;
  store.listMemories = async (filter) => {
    const snapshot = await originalList(filter);
    if (!injected && filter?.statuses?.includes("active")) {
      injected = true;
      await store.updateMemory(
        "cap-evict-2",
        { status: "invalidated" },
        { actor: { type: "user", id: "race-injector" }, reason: "Concurrent invalidate during sweep." }
      );
    }
    return snapshot;
  };
  const service = capacityService(store);

  const output = await service.forget(
    { mode: "enforce_capacity", capacity: 3, reason: "Race sweep.", scopes: capacityToolScopes },
    { caller: capacityCaller() }
  );

  // 5 actives in the snapshot, capacity 3, victims [cap-evict-2, cap-evict-1];
  // cap-evict-2 was concurrently invalidated -> skipped, one real eviction.
  assert.deepEqual(output.evicted_memories.map((entry) => entry.memory_id), ["cap-evict-1"]);
  assert.equal(output.retained_count, 3, "retained_count must exclude the skipped victim");

  const trace = await store.getTrace(output.trace_id);
  assert.ok(!trace.selectedMemoryIds.includes("cap-evict-2"), "a concurrently-forgotten memory must not be traced as retained");
  assert.ok(trace.ignoredMemoryIds.includes("cap-evict-2"));
  assert.match(trace.selectionReasons["cap-evict-2"], /Skipped by the capacity sweep/);
  assert.equal(trace.metadata.skipped_count, 1);
  assert.equal(trace.metadata.evicted_count, 1);
});

test("a cross-process style precondition failure on archive is treated as a skip, not an overwrite or crash", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  const originalUpdate = store.updateMemory.bind(store);
  let sawExpectedStatus = false;
  let threw = false;
  store.updateMemory = async (id, patch, options) => {
    if (patch?.status === "archived") {
      sawExpectedStatus = options?.expectedStatus === "active";
      if (!threw && id === "cap-evict-2") {
        // Simulate another server instance winning the row-locked update on a
        // shared Postgres store after our in-process re-fetch.
        threw = true;
        throw new MemoryMutationPreconditionError("cap-evict-2", "active", "invalidated");
      }
    }
    return originalUpdate(id, patch, options);
  };
  const service = capacityService(store);

  const output = await service.forget(
    { mode: "enforce_capacity", capacity: 3, reason: "Precondition sweep.", scopes: capacityToolScopes },
    { caller: capacityCaller() }
  );

  assert.ok(sawExpectedStatus, "capacity archives must carry expectedStatus 'active'");
  assert.deepEqual(output.evicted_memories.map((entry) => entry.memory_id), ["cap-evict-1"]);
  assert.equal(output.retained_count, 3);
  const trace = await store.getTrace(output.trace_id);
  assert.match(trace.selectionReasons["cap-evict-2"], /Skipped by the capacity sweep/);
});

// ---------------------------------------------------------------------------
// enforceTokenBudget: provider echoing an id in both lists must not duplicate
// ---------------------------------------------------------------------------

test("enforceTokenBudget keeps each memory id exactly once when a provider echoes it in both lists", async () => {
  const { enforceTokenBudget } = await import("../dist/services/continuity-memory-service.js");
  const packMemory = (id, text) => ({ memoryId: id, type: "user_preference", text, reason: "test", score: 1 });

  const pack = enforceTokenBudget(
    {
      contextBlock: "unused",
      selectedMemories: [
        packMemory("fits", "Short."),
        packMemory("dup", "This entry is far too long to fit inside the tiny budget used by this regression test.")
      ],
      // The provider echoed "dup" as ignored too, and also echoed "fits"
      // (which the server retains) as ignored — both must be dropped in
      // favor of the server-side outcome.
      ignoredMemories: [
        { memoryId: "dup", reason: "Skipped to fit the token budget." },
        { memoryId: "fits", reason: "Skipped to fit the token budget." },
        { memoryId: "other", reason: "Skipped to fit the token budget." }
      ],
      tokenBudget: 0,
      estimatedTokens: 0,
      trace: { query: "q", scope: { tenantId: "t", userId: "u" } }
    },
    8
  );

  const dupEntries = pack.ignoredMemories.filter((memory) => memory.memoryId === "dup");
  assert.equal(dupEntries.length, 1, "an id echoed in both lists must appear exactly once");
  assert.match(dupEntries[0].reason, /Trimmed to fit the token budget/, "the server-side outcome wins");
  assert.ok(!pack.ignoredMemories.some((memory) => memory.memoryId === "fits"), "a retained id must not stay in ignored");
  assert.ok(pack.ignoredMemories.some((memory) => memory.memoryId === "other"), "genuine provider skips are preserved");
});

test("enforceTokenBudget suppresses only exact-duplicate lines, never meaning-differing ones", async () => {
  const { enforceTokenBudget } = await import("../dist/services/continuity-memory-service.js");
  const packMemory = (id, text, type = "user_preference") => ({ memoryId: id, type, text, reason: "test", score: 1 });
  const basePack = (memories) => ({
    contextBlock: "unused-by-enforcer",
    selectedMemories: memories,
    ignoredMemories: [],
    tokenBudget: 0,
    estimatedTokens: 0,
    trace: { query: "q", scope: { tenantId: "t", userId: "u" } }
  });

  // Exact duplicate (differs only by case/whitespace, same type) is suppressed.
  const original = packMemory("dedup-original", "Prefer credentials and founder network over prize money.");
  const exactDup = packMemory("dedup-exact", "Prefer  credentials and founder network over PRIZE money.");
  const distinct = packMemory("dedup-distinct", "Verify deadline, timezone, and eligibility before ranking.");
  const roomy = enforceTokenBudget(basePack([original, exactDup, distinct]), 500);
  assert.deepEqual(
    roomy.selectedMemories.map((memory) => memory.memoryId),
    ["dedup-original", "dedup-distinct"]
  );
  assert.match(
    roomy.ignoredMemories.find((memory) => memory.memoryId === "dedup-exact").reason,
    /Exact duplicate of higher-ranked memory dedup-original/
  );
  assert.ok(roomy.estimatedTokens <= 500);

  // Data-loss guard: facts that differ ONLY by a number or a negation must both
  // survive — the exact one that fuzzy Jaccard matching used to silently drop.
  const numeric = enforceTokenBudget(
    basePack([
      packMemory("num-5", "Q4 revenue target is 5.", "project_fact"),
      packMemory("num-9", "Q4 revenue target is 9.", "project_fact")
    ]),
    500
  );
  assert.deepEqual(numeric.selectedMemories.map((memory) => memory.memoryId), ["num-5", "num-9"]);

  const polarity = enforceTokenBudget(
    basePack([
      packMemory("pol-may", "Contributors may merge their own pull requests after one approval.", "procedure"),
      packMemory("pol-maynot", "Contributors may not merge their own pull requests after one approval.", "procedure")
    ]),
    500
  );
  assert.deepEqual(polarity.selectedMemories.map((memory) => memory.memoryId), ["pol-may", "pol-maynot"]);

  // A same-type/different-id exact repeat is dropped before the budget check,
  // so its reason is the duplicate reason, not the trim reason.
  const tight = enforceTokenBudget(basePack([original, exactDup, distinct]), 25);
  assert.deepEqual(tight.selectedMemories.map((memory) => memory.memoryId), ["dedup-original"]);
  assert.match(
    tight.ignoredMemories.find((memory) => memory.memoryId === "dedup-exact").reason,
    /Exact duplicate of higher-ranked memory dedup-original/
  );
  assert.match(
    tight.ignoredMemories.find((memory) => memory.memoryId === "dedup-distinct").reason,
    /Trimmed to fit the token budget/
  );
});

test("memory_forget enforce_capacity lets helpful feedback rescue a low-importance memory", async () => {
  const store = new InMemoryMemoryStore();
  await seedCapacityFixture(store);
  // Endorse the weaker cap-evict-1 (retention 1.45) three times: +0.45 lifts
  // it above cap-keep-3 (retention 1.75), so the sweep must evict cap-keep-3
  // instead — users' explicit "helpful" signals earn retention under pressure.
  for (const [index] of ["a", "b", "c"].entries()) {
    await store.addFeedback({
      id: `capacity-feedback-${index}`,
      scope: capacityScope,
      memoryId: "cap-evict-1",
      signal: "helpful",
      regressionFixture: {
        schema_version: "1",
        target: "memory",
        signal: "helpful",
        correction: "none",
        scope_dimensions: ["tenant", "user"]
      }
    });
  }
  const service = capacityService(store);

  const output = await service.forget(
    {
      mode: "enforce_capacity",
      capacity: 3,
      reason: "Feedback-informed capacity sweep.",
      scopes: capacityToolScopes
    },
    { caller: capacityCaller() }
  );

  assert.deepEqual(
    output.evicted_memories.map((entry) => entry.memory_id).sort(),
    ["cap-evict-2", "cap-keep-3"],
    "helpful feedback must rescue cap-evict-1 at cap-keep-3's expense"
  );
  const rescued = await store.getMemory("cap-evict-1");
  assert.equal(rescued.status, "active");
});
