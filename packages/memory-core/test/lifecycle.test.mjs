import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryRecord,
  filterRecallableMemories,
  getEffectiveMemoryStatus,
  InMemoryMemoryStore
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
