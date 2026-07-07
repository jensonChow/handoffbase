import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryMemoryStore } from "@handoffbase/memory-core";
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
