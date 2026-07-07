import test from "node:test";
import assert from "node:assert/strict";
import {
  mapPostgresEventRow,
  mapPostgresMemoryRow,
  mapPostgresRunRow,
  mapPostgresTraceRow
} from "../dist/index.js";

test("mapPostgresMemoryRow converts snake_case SQL values into a MemoryRecord", () => {
  const record = mapPostgresMemoryRow({
    id: "memory_1",
    tenant_id: "tenant_1",
    user_id: "user_1",
    agent_profile_id: "coding-agent",
    project_id: null,
    host_id: "codex",
    session_id: "session_1",
    tool_id: null,
    type: "procedure",
    canonical_text: "Verify deadlines before recommending hackathons.",
    raw_source: null,
    source_kind: "user_correction",
    status: "active",
    confidence: "0.93",
    importance: "0.75",
    valid_from: "2026-07-01T00:00:00.000Z",
    valid_until: null,
    supersedes: ["memory_0"],
    superseded_by: null,
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: new Date("2026-07-07T01:00:00.000Z"),
    last_used_at: null,
    use_count: "4",
    metadata: { tags: ["demo"], reviewed: true }
  });

  assert.equal(record.id, "memory_1");
  assert.deepEqual(record.scope, {
    tenantId: "tenant_1",
    userId: "user_1",
    agentProfileId: "coding-agent",
    projectId: undefined,
    hostId: "codex",
    sessionId: "session_1",
    toolId: undefined
  });
  assert.equal(record.rawSource, undefined);
  assert.equal(record.confidence, 0.93);
  assert.equal(record.importance, 0.75);
  assert.deepEqual(record.supersedes, ["memory_0"]);
  assert.equal(record.useCount, 4);
  assert.equal(record.validFrom.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(record.createdAt.toISOString(), "2026-07-07T00:00:00.000Z");
  assert.deepEqual(record.metadata, { tags: ["demo"], reviewed: true });
});

test("mapPostgresEventRow rebuilds actor and JSON audit payloads", () => {
  const event = mapPostgresEventRow({
    id: "event_1",
    tenant_id: "tenant_1",
    memory_id: null,
    run_id: "run_1",
    trace_id: "trace_1",
    event_type: "recall",
    actor_type: "system",
    actor_id: null,
    reason: "rank hackathons",
    before: null,
    after: '{"query":"rank hackathons","selectedMemoryIds":["memory_1"]}',
    created_at: "2026-07-07T02:00:00.000Z",
    metadata: '{"source":"unit-test"}'
  });

  assert.equal(event.eventType, "recall");
  assert.deepEqual(event.actor, { type: "system", id: undefined });
  assert.deepEqual(event.after, {
    query: "rank hackathons",
    selectedMemoryIds: ["memory_1"]
  });
  assert.deepEqual(event.metadata, { source: "unit-test" });
});

test("mapPostgresRunRow maps nullable run columns without defaults", () => {
  const run = mapPostgresRunRow({
    id: "run_1",
    tenant_id: "tenant_1",
    user_id: "user_1",
    host_id: "codex",
    agent_profile_id: null,
    project_id: "project_1",
    task_hint: "Rank AI hackathons.",
    summary: null,
    outcome: "accepted",
    started_at: "2026-07-07T03:00:00.000Z",
    ended_at: null,
    metadata: { demo: "opportunity-scout" }
  });

  assert.equal(run.agentProfileId, undefined);
  assert.equal(run.summary, undefined);
  assert.equal(run.outcome, "accepted");
  assert.equal(run.startedAt.toISOString(), "2026-07-07T03:00:00.000Z");
  assert.equal(run.endedAt, undefined);
  assert.deepEqual(run.metadata, { demo: "opportunity-scout" });
});

test("mapPostgresTraceRow maps SQL array and JSON selection reasons", () => {
  const trace = mapPostgresTraceRow({
    id: "trace_1",
    tenant_id: "tenant_1",
    run_id: "run_1",
    query: "founder network",
    selected_memory_ids: "{memory_1,memory_2}",
    ignored_memory_ids: '["memory_3"]',
    context_pack: "- [procedure] Verify deadlines.",
    selection_reasons: '{"memory_1":"Matched procedure.","memory_2":"Matched preference."}',
    created_at: "2026-07-07T04:00:00.000Z",
    metadata: { tokenBudget: 900 }
  });

  assert.deepEqual(trace.selectedMemoryIds, ["memory_1", "memory_2"]);
  assert.deepEqual(trace.ignoredMemoryIds, ["memory_3"]);
  assert.deepEqual(trace.selectionReasons, {
    memory_1: "Matched procedure.",
    memory_2: "Matched preference."
  });
  assert.equal(trace.contextPack, "- [procedure] Verify deadlines.");
});

test("mapPostgresTraceRow rejects non-string selection reasons", () => {
  assert.throws(
    () =>
      mapPostgresTraceRow({
        id: "trace_bad",
        tenant_id: "tenant_1",
        selected_memory_ids: [],
        ignored_memory_ids: [],
        selection_reasons: { memory_1: 42 },
        created_at: "2026-07-07T04:00:00.000Z",
        metadata: {}
      }),
    /selection_reasons/
  );
});
