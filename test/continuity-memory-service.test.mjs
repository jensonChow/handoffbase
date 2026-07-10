import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryMemoryStore } from "@handoffbase/memory-core";
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
  assert.match(resolution.reason.message, /cannot be applied to candidate memory status deleted/);
  assert.equal((await store.getMemory(fixture.candidateId)).status, "deleted");
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
