import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConflictListQuery,
  buildFeedbackListQuery,
  buildIgnoredMemoryQuery,
  buildMemoryListQuery,
  buildRecallQuery,
  mapRecallRows,
  mapPostgresConflictRow,
  mapPostgresEventRow,
  mapPostgresMemoryRow,
  mapPostgresRunRow,
  mapPostgresTraceRow,
  MemoryMutationPreconditionError,
  PostgresMemoryStore
} from "../dist/index.js";

const tenantScope = {
  tenantId: "tenant_1",
  userId: "user_1",
  agentProfileId: "coding-agent",
  projectId: "project_1",
  hostId: "codex",
  sessionId: "session_1",
  toolId: "tool_1"
};

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

test("mapPostgresConflictRow converts SQL values into a MemoryConflictRecord", () => {
  const conflict = mapPostgresConflictRow({
    id: "conflict_1",
    tenant_id: "tenant_1",
    candidate_memory_id: "candidate_memory",
    existing_memory_id: "existing_memory",
    conflict_type: "contradiction",
    severity: "high",
    recommended_action: "ask_user",
    status: "resolved",
    reason: "Candidate contradicts existing preference.",
    confidence: "0.88",
    resolution: '{"action":"keep_both","reason":"User asked to retain both."}',
    created_at: "2026-07-07T05:00:00.000Z",
    resolved_at: "2026-07-07T06:00:00.000Z",
    metadata: { provider: "mock" }
  });

  assert.equal(conflict.id, "conflict_1");
  assert.equal(conflict.candidateMemoryId, "candidate_memory");
  assert.equal(conflict.existingMemoryId, "existing_memory");
  assert.equal(conflict.conflictType, "contradiction");
  assert.equal(conflict.recommendedAction, "ask_user");
  assert.equal(conflict.status, "resolved");
  assert.equal(conflict.confidence, 0.88);
  assert.deepEqual(conflict.resolution, {
    action: "keep_both",
    reason: "User asked to retain both."
  });
  assert.equal(conflict.createdAt.toISOString(), "2026-07-07T05:00:00.000Z");
  assert.equal(conflict.resolvedAt.toISOString(), "2026-07-07T06:00:00.000Z");
  assert.deepEqual(conflict.metadata, { provider: "mock" });
});

test("buildRecallQuery applies structured scope, lifecycle, type, keyword, and limit filters", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const query = buildRecallQuery({
    scope: tenantScope,
    query: "Verify Qwen deadlines",
    types: ["procedure", "failure_memory"],
    limit: 5,
    now
  });

  assert.deepEqual(query.values.slice(0, 7), [
    "tenant_1",
    "user_1",
    "coding-agent",
    "project_1",
    "codex",
    "session_1",
    "tool_1"
  ]);
  assert.deepEqual(query.values[7], ["procedure", "failure_memory"]);
  assert.equal(query.values[8], now);
  assert.deepEqual(query.values[9], ["verify", "qwen", "deadlines"]);
  assert.equal(query.values[10], 5);

  assert.match(query.sql, /m\.tenant_id = \$1/);
  assert.match(query.sql, /\(m\.agent_profile_id is null or m\.agent_profile_id = \$3\)/);
  assert.match(query.sql, /\(m\.tool_id is null or m\.tool_id = \$7\)/);
  assert.match(query.sql, /m\.type = any\(\$8::text\[\]\)/);
  assert.match(query.sql, /m\.status = 'active'/);
  assert.match(query.sql, /m\.superseded_by is null/);
  assert.match(query.sql, /\(m\.valid_from is null or m\.valid_from <= \$9\)/);
  assert.match(query.sql, /\(m\.valid_until is null or m\.valid_until > \$9\)/);
  assert.match(query.sql, /lower\(m\.canonical_text\)/);
  assert.match(query.sql, /lower\(m\.type\)/);
  assert.match(query.sql, /lower\(m\.source_kind\)/);
  assert.match(query.sql, /order by recall_score desc/);
  // Keyword matching must be a literal substring test (position), not LIKE:
  // the tokenizer preserves underscores, and LIKE's `_` wildcard would match
  // strings the in-memory String.includes twin does not, breaking parity.
  assert.match(query.sql, /position\(query_terms\.term in lower\(m\.canonical_text\)\) > 0/);
  assert.match(query.sql, /position\(query_terms\.term in lower\(m\.source_kind\)\) > 0/);
  assert.doesNotMatch(query.sql, /like '%' \|\| query_terms\.term/);
  // The recall ORDER BY must end with an id tiebreaker so fully-tied rows sort
  // identically to compareRecallRank's final id-ascending comparison.
  assert.match(query.sql, /m\.created_at desc,\s*m\.id asc\s*limit/);
});

test("buildIgnoredMemoryQuery finds scoped non-recallable candidates", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const query = buildIgnoredMemoryQuery({
    scope: {
      tenantId: "tenant_1",
      userId: "user_1",
      projectId: "project_1"
    },
    types: ["procedure"],
    now
  });

  assert.deepEqual(query.values, ["tenant_1", "user_1", "project_1", ["procedure"], now]);
  assert.match(query.sql, /select m\.id/);
  assert.match(query.sql, /m\.tenant_id = \$1/);
  assert.match(query.sql, /\(m\.project_id is null or m\.project_id = \$3\)/);
  assert.match(query.sql, /m\.type = any\(\$4::text\[\]\)/);
  assert.match(query.sql, /not \(m\.status = 'active'/);
  assert.match(query.sql, /m\.superseded_by is null/);
  assert.match(query.sql, /\(m\.valid_until is null or m\.valid_until > \$5\)/);
});

test("buildRecallQuery has an optional pgvector-ready scoring path", () => {
  const query = buildRecallQuery(
    {
      scope: {
        tenantId: "tenant_1",
        userId: "user_1"
      },
      now: new Date("2026-07-07T12:00:00.000Z")
    },
    {
      queryEmbedding: [0.1, 0.2, 0.3],
      embeddingModel: "test-embedding-model"
    }
  );

  assert.match(query.sql, /left join memory_embeddings e on e\.memory_id = m\.id and e\.embedding_model = \$5/);
  assert.match(query.sql, /e\.embedding <=> \$4::vector/);
  assert.equal(query.values[3], "[0.1,0.2,0.3]");
  assert.equal(query.values[4], "test-embedding-model");
});

test("buildRecallQuery blends bounded feedback reinforcement and floors the vector similarity at zero", () => {
  const query = buildRecallQuery(
    {
      scope: {
        tenantId: "tenant_1",
        userId: "user_1"
      },
      now: new Date("2026-07-14T12:00:00.000Z")
    },
    {
      queryEmbedding: [0.1, 0.2, 0.3],
      embeddingModel: "test-embedding-model"
    }
  );

  // Feedback term: the SQL twin of lifecycle's feedbackReinforcement — same
  // weight, same net cap, aggregated per memory id from memory_feedback.
  assert.match(
    query.sql,
    /0\.15 \* greatest\(-4, least\(4, coalesce\(\(\s*select sum\(case when f\.signal = 'helpful' then 1\.0 else -1\.0 end\)\s*from memory_feedback f\s*where f\.memory_id = m\.id\s*\), 0\)\)\)/
  );
  // Vector similarity is floored at zero exactly like the in-memory
  // semanticBonus, so anti-similar vectors cannot penalize one store only.
  assert.match(query.sql, /greatest\(0, 1 - \(e\.embedding <=> \$4::vector\)\)/);
});

test("mapRecallRows maps selected recall rows and ignores SQL-only score columns", () => {
  const records = mapRecallRows([
    memoryRow({
      id: "memory_selected",
      recall_score: "3.42",
      use_count: "2"
    })
  ]);

  assert.equal(records[0].id, "memory_selected");
  assert.equal(records[0].useCount, 2);
  assert.equal("recall_score" in records[0], false);
});

test("PostgresMemoryStore.recallMemories updates selected memories and persists recall trace and event", async () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const selectedRow = memoryRow({
    id: "memory_selected",
    agent_profile_id: "coding-agent",
    project_id: "project_1",
    canonical_text: "Verify deadlines before ranking Qwen hackathons.",
    use_count: "2"
  });
  const ignoredRow = memoryRow({
    id: "memory_future",
    agent_profile_id: "coding-agent",
    project_id: "project_1",
    valid_from: "2026-07-08T00:00:00.000Z"
  });
  const client = new FakeSqlQueryClient();
  client.seedMemory(selectedRow);
  client.seedMemory(ignoredRow);
  const store = new PostgresMemoryStore(client);

  const result = await store.recallMemories({
    scope: {
      tenantId: "tenant_1",
      userId: "user_1",
      projectId: "project_1",
      agentProfileId: "coding-agent"
    },
    query: "Qwen deadlines",
    types: ["procedure"],
    limit: 1,
    now,
    runId: "run_1",
    actor: { type: "mcp_host", id: "codex" },
    metadata: { stage: "unit-test" }
  });

  assert.deepEqual(
    result.memories.map((memory) => memory.id),
    ["memory_selected"]
  );
  assert.equal(result.memories[0].useCount, 3);
  assert.equal(result.memories[0].lastUsedAt.toISOString(), now.toISOString());
  assert.deepEqual(result.ignoredMemoryIds, ["memory_future"]);
  assert.deepEqual(result.trace.selectedMemoryIds, ["memory_selected"]);
  assert.deepEqual(result.trace.ignoredMemoryIds, ["memory_future"]);
  assert.equal(result.trace.contextPack, "- [procedure] Verify deadlines before ranking Qwen hackathons.");
  assert.equal(result.trace.selectionReasons.memory_selected, "Matched recall query within procedure.");
  assert.equal(result.trace.selectionReasons.memory_future, "Ignored because memory is not recallable at retrieval time.");
  assert.deepEqual(result.trace.metadata, { stage: "unit-test" });
  assert.equal(result.event.eventType, "recall");
  assert.equal(result.event.traceId, result.trace.id);
  assert.deepEqual(result.event.actor, { type: "mcp_host", id: "codex" });
  assert.deepEqual(result.event.metadata, { stage: "unit-test" });

  const selectCall = client.requireQuery("select m.*");
  const ignoredCall = client.requireQuery("select m.id");
  const updateCall = client.requireQuery("update memories set last_used_at");
  const traceCall = client.requireQuery("insert into memory_traces");
  const eventCall = client.requireQuery("insert into memory_events");
  const referenceLock = client.requireQuery(
    "select * from memories where id = any($1::text[]) order by id for no key update"
  );
  assert.equal(client.transactionCount, 1);
  assert.deepEqual(referenceLock.values[0], ["memory_future", "memory_selected"]);
  assert.equal(referenceLock.inTransaction, true);
  assert.equal(updateCall.inTransaction, true);
  assert.equal(traceCall.inTransaction, true);
  assert.equal(eventCall.inTransaction, true);
  assert.match(selectCall.sql, /from memories m/);
  assert.match(selectCall.sql, /\(m\.agent_profile_id is null or m\.agent_profile_id = \$3\)/);
  assert.match(selectCall.sql, /\(m\.project_id is null or m\.project_id = \$4\)/);
  assert.match(selectCall.sql, /m\.status = 'active'/);
  assert.match(ignoredCall.sql, /not \(m\.status = 'active'/);
  assert.deepEqual(updateCall.values, [now, "tenant_1", ["memory_selected"]]);
  assert.deepEqual(traceCall.values[4], ["memory_selected"]);
  assert.deepEqual(traceCall.values[5], ["memory_future"]);
  assert.deepEqual(JSON.parse(traceCall.values[9]), { stage: "unit-test" });
  assert.equal(eventCall.values[5], "recall");
  assert.equal(eventCall.values[6], "mcp_host");
  assert.equal(eventCall.values[7], "codex");
  assert.deepEqual(JSON.parse(eventCall.values[12]), { stage: "unit-test" });
});

test("PostgresMemoryStore recall aborts before trace persistence when a selected memory disappears", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "recall-delete-race", canonical_text: "Must not survive deletion." }));
  client.dropMemoryBeforeKeyShare = "recall-delete-race";
  const store = new PostgresMemoryStore(client);

  await assert.rejects(
    () => store.recallMemories({
      scope: { tenantId: "tenant_1", userId: "user_1" },
      query: "deletion race",
      limit: 1
    }),
    /target memory no longer exists: recall-delete-race/
  );
  assert.equal(client.traces.size, 0);
  assert.equal(client.events.length, 0);
  assert.equal(client.findQueries("insert into memory_traces").length, 0);
  assert.equal(client.findQueries("insert into memory_events").length, 0);
});

test("PostgresMemoryStore recall revalidates fresh lifecycle, type, and scope under its row lock", async () => {
  const cases = [
    { label: "lifecycle", patch: { status: "invalidated" } },
    { label: "type", patch: { type: "project_fact" } },
    { label: "scope", patch: { project_id: "project-other" } }
  ];
  for (const item of cases) {
    const client = new FakeSqlQueryClient();
    client.seedMemory(memoryRow({
      id: `recall-${item.label}-race`,
      project_id: "project_1",
      canonical_text: "Fresh state must be revalidated."
    }));
    client.mutateMemoryBeforeNoKeyUpdate = {
      id: `recall-${item.label}-race`,
      patch: item.patch
    };
    const store = new PostgresMemoryStore(client);

    await assert.rejects(
      () => store.recallMemories({
        scope: { tenantId: "tenant_1", userId: "user_1", projectId: "project_1" },
        query: "fresh state",
        types: ["procedure"],
        limit: 1
      }),
      /selected memory changed before it was locked/
    );
    assert.equal(client.findQueries("update memories set last_used_at").length, 0, item.label);
    assert.equal(client.findQueries("insert into memory_traces").length, 0, item.label);
    assert.equal(client.findQueries("insert into memory_events").length, 0, item.label);
    const lock = client.requireQuery(
      "select * from memories where id = any($1::text[]) order by id for no key update"
    );
    assert.equal(lock.inTransaction, true);
  }
});

test("PostgresMemoryStore omits an initially ignored memory that becomes recallable before locking", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({
    id: "ignored-became-current",
    valid_from: "2026-07-08T00:00:00.000Z"
  }));
  client.mutateMemoryBeforeNoKeyUpdate = {
    id: "ignored-became-current",
    patch: { valid_from: null }
  };
  const store = new PostgresMemoryStore(client);
  const result = await store.recallMemories({
    scope: { tenantId: "tenant_1", userId: "user_1" },
    query: "current guidance",
    now: new Date("2026-07-07T12:00:00.000Z")
  });
  assert.deepEqual(result.memories, []);
  assert.deepEqual(result.ignoredMemoryIds, []);
  assert.deepEqual(result.trace.ignoredMemoryIds, []);
});

test("PostgresMemoryStore.addMemory inserts a memory row and add event transactionally", async () => {
  const client = new FakeSqlQueryClient();
  const store = new PostgresMemoryStore(client);
  const now = new Date("2026-07-07T05:00:00.000Z");

  const result = await store.addMemory(
    {
      id: "memory_add",
      scope: {
        tenantId: "tenant_1",
        userId: "user_1",
        agentProfileId: "coding-agent",
        hostId: "codex"
      },
      type: "procedure",
      canonicalText: "  Verify deadlines before recommending hackathons.  ",
      sourceKind: "user_instruction",
      confidence: 0.9,
      importance: 0.7,
      metadata: { tags: ["postgres"] }
    },
    {
      now,
      runId: "run_1",
      actor: { type: "agent", id: "codex" },
      reason: "unit test",
      metadata: { source: "postgres-store.test" }
    }
  );

  assert.equal(client.transactionCount, 1);
  assert.equal(result.memory.id, "memory_add");
  assert.equal(result.memory.canonicalText, "Verify deadlines before recommending hackathons.");
  assert.equal(result.memory.createdAt.toISOString(), now.toISOString());
  assert.equal(result.event.eventType, "add");
  assert.equal(result.event.memoryId, "memory_add");
  assert.equal(result.event.runId, "run_1");
  assert.deepEqual(result.event.actor, { type: "agent", id: "codex" });
  assert.deepEqual(result.event.after.id, "memory_add");

  const memoryInsert = client.requireQuery("insert into memories");
  assert.equal(memoryInsert.inTransaction, true);
  assert.match(memoryInsert.sql, /returning \*/);
  assert.equal(memoryInsert.values[0], "memory_add");
  assert.equal(memoryInsert.values[9], "Verify deadlines before recommending hackathons.");
  assert.deepEqual(JSON.parse(memoryInsert.values[23]), { tags: ["postgres"] });

  const eventInsert = client.requireQuery("insert into memory_events");
  assert.equal(eventInsert.inTransaction, true);
  assert.equal(eventInsert.values[2], "memory_add");
  assert.equal(eventInsert.values[5], "add");
  assert.equal(eventInsert.values[6], "agent");
  assert.deepEqual(JSON.parse(eventInsert.values[10]).id, "memory_add");
});

test("PostgresMemoryStore.updateMemory updates the row and persists an update event", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "memory_update", canonical_text: "Original preference." }));
  const store = new PostgresMemoryStore(client);
  const now = new Date("2026-07-07T06:00:00.000Z");

  const result = await store.updateMemory(
    "memory_update",
    {
      canonicalText: "Updated preference.",
      importance: 0.8,
      metadata: { version: 2 }
    },
    {
      now,
      actor: { type: "dashboard", id: "operator_1" },
      reason: "manual correction"
    }
  );

  assert.equal(result.before.canonicalText, "Original preference.");
  assert.equal(result.memory.canonicalText, "Updated preference.");
  assert.equal(result.memory.updatedAt.toISOString(), now.toISOString());
  assert.equal(result.event.eventType, "update");
  assert.equal(result.event.before.canonicalText, "Original preference.");
  assert.equal(result.event.after.canonicalText, "Updated preference.");

  const select = client.requireQuery("select * from memories where id = $1 for update");
  assert.equal(select.inTransaction, true);
  const update = client.requireQuery("update memories set");
  assert.equal(update.inTransaction, true);
  assert.equal(update.values[0], "memory_update");
  assert.equal(update.values[7], "Updated preference.");
  assert.equal(update.values[12], 0.8);

  const eventInsert = client.requireQuery("insert into memory_events");
  assert.equal(eventInsert.values[5], "update");
  assert.equal(JSON.parse(eventInsert.values[9]).canonicalText, "Original preference.");
  assert.equal(JSON.parse(eventInsert.values[10]).canonicalText, "Updated preference.");
});

test("PostgresMemoryStore.updateMemory enforces expected status under the row lock", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "memory_precondition", status: "active" }));
  const store = new PostgresMemoryStore(client);

  await assert.rejects(
    () => store.updateMemory(
      "memory_precondition",
      { status: "rejected" },
      { expectedStatus: "pending" }
    ),
    (error) => {
      assert.ok(error instanceof MemoryMutationPreconditionError);
      assert.equal(error.expectedStatus, "pending");
      assert.equal(error.actualStatus, "active");
      return true;
    }
  );
  assert.equal(client.transactionCount, 1);
  assert.ok(client.requireQuery("select * from memories where id = $1 for update"));
  assert.equal(client.findQueries("update memories set").length, 0);
  assert.equal(client.findQueries("insert into memory_events").length, 0);
  assert.equal(client.memories.get("memory_precondition").status, "active");
});

test("PostgresMemoryStore.deleteMemory physically deletes content and persists a scoped tombstone event", async () => {
  const client = new FakeSqlQueryClient();
  const sentinel = "POSTGRES_HARD_DELETE_SENTINEL";
  client.seedMemory(memoryRow({
    id: "memory_delete",
    canonical_text: `Delete ${sentinel}.`,
    raw_source: sentinel,
    metadata: { private_note: sentinel }
  }));
  client.traces.set("trace-delete", {
    id: "trace-delete",
    tenant_id: "tenant_1",
    run_id: null,
    query: `Why did ${sentinel} appear?`,
    selected_memory_ids: ["memory_delete"],
    ignored_memory_ids: [],
    context_pack: sentinel,
    selection_reasons: { memory_delete: sentinel },
    created_at: "2026-07-07T06:00:00.000Z",
    metadata: { private_note: sentinel }
  });
  client.events.push({
    id: "event-delete-history",
    tenant_id: "tenant_1",
    memory_id: "memory_delete",
    run_id: null,
    trace_id: null,
    event_type: "add",
    actor_type: "system",
    actor_id: "fixture",
    reason: sentinel,
    before: null,
    after: { canonicalText: sentinel },
    created_at: "2026-07-07T06:00:00.000Z",
    metadata: { private_note: sentinel }
  });
  client.events.push({
    id: "event-delete-trace",
    tenant_id: "tenant_1",
    memory_id: null,
    run_id: null,
    trace_id: "trace-delete",
    event_type: "recall",
    actor_type: "system",
    actor_id: "fixture",
    reason: sentinel,
    before: null,
    after: { query: sentinel },
    created_at: "2026-07-07T06:00:00.000Z",
    metadata: { private_note: sentinel }
  });
  client.feedback.set("feedback-trace-only", {
    id: "feedback-trace-only",
    tenant_id: "tenant_1",
    user_id: "user_1",
    agent_profile_id: null,
    project_id: null,
    host_id: null,
    session_id: null,
    tool_id: null,
    memory_id: null,
    trace_id: "trace-delete",
    run_id: null,
    signal: "unhelpful",
    reason: sentinel,
    correction_memory_id: null,
    actor_type: "user",
    actor_id: "fixture",
    regression_fixture: {
      schema_version: "1",
      target: "trace",
      signal: "unhelpful",
      scope_dimensions: ["tenant", "user"],
      correction: sentinel
    },
    created_at: "2026-07-07T06:00:00.000Z",
    metadata: { private_note: sentinel }
  });
  client.conflicts.set("conflict-delete", {
    id: "conflict-delete",
    tenant_id: "tenant_1",
    candidate_memory_id: "memory_delete",
    existing_memory_id: null,
    conflict_type: "contradiction",
    severity: "high",
    recommended_action: "ask_user",
    status: "resolved",
    reason: sentinel,
    confidence: 0.9,
    resolution: { action: "merge", mergedText: sentinel, note: sentinel },
    created_at: "2026-07-07T06:00:00.000Z",
    resolved_at: "2026-07-07T06:30:00.000Z",
    metadata: { private_note: sentinel }
  });
  const store = new PostgresMemoryStore(client);
  const now = new Date("2026-07-07T07:00:00.000Z");

  const result = await store.deleteMemory("memory_delete", {
    now,
    actor: { type: "system", id: "retention" },
    reason: sentinel,
    metadata: { private_note: sentinel }
  });

  assert.equal(result.deletedMemoryId, "memory_delete");
  assert.equal(result.scope.userId, "user_1");
  assert.equal(result.event.eventType, "delete");
  assert.equal(result.event.reason, "User requested hard deletion.");
  assert.equal(result.event.before, undefined);
  assert.equal(result.event.after.status, "deleted");
  assert.equal(result.event.after.deletedMemoryId, "memory_delete");
  assert.equal(result.event.after.scope.userId, "user_1");

  assert.equal(client.memories.has("memory_delete"), false);
  const traceLock = client.requireQuery("select id from memory_traces where");
  assert.equal(traceLock.inTransaction, true);
  assert.match(traceLock.sql, /for update$/);
  assert.deepEqual(traceLock.values, ["memory_delete"]);
  assert.ok(
    client.queries.indexOf(client.requireQuery("select * from memories where id = $1 for update"))
      < client.queries.indexOf(traceLock)
  );
  const eventRedaction = client.requireQuery("update memory_events set before = null");
  assert.equal(eventRedaction.values[1], "Content redacted after hard deletion.");
  assert.deepEqual(eventRedaction.values[2], ["trace-delete"]);
  assert.match(eventRedaction.sql, /trace_id = any\(\$3::text\[\]\)/);
  const feedbackRedaction = client.requireQuery("update memory_feedback set reason = null");
  assert.deepEqual(feedbackRedaction.values[1], ["trace-delete"]);
  assert.match(feedbackRedaction.sql, /trace_id = any\(\$2::text\[\]\)/);
  const traceRedaction = client.requireQuery("update memory_traces set selected_memory_ids");
  assert.ok(client.queries.indexOf(traceLock) < client.queries.indexOf(eventRedaction));
  assert.ok(client.queries.indexOf(traceLock) < client.queries.indexOf(feedbackRedaction));
  assert.match(traceRedaction.sql, /query = null/);
  assert.match(traceRedaction.sql, /where id = any\(\$2::text\[\]\)/);
  assert.match(traceRedaction.sql, /selection_reasons = '\{\}'::jsonb/);
  assert.ok(client.requireQuery("update memory_conflicts set reason = null"));
  assert.ok(client.requireQuery("delete from memories where id = $1 returning id"));
  const eventInsert = client.requireQuery("insert into memory_events");
  assert.equal(eventInsert.values[5], "delete");
  assert.equal(eventInsert.values[9], null);
  assert.equal(JSON.parse(eventInsert.values[10]).hardDeleted, true);

  const allReadableState = {
    result,
    memory: await store.getMemory("memory_delete"),
    trace: await store.getTrace("trace-delete"),
    conflict: await store.getConflict("conflict-delete"),
    feedback: await store.getFeedback("feedback-trace-only"),
    events: await store.listEvents(),
    conflicts: await store.listConflicts(),
    feedbackList: await store.listFeedback()
  };
  assert.equal(JSON.stringify(allReadableState).includes(sentinel), false);
  await assert.rejects(
    () => store.addFeedback({
      id: "feedback-after-delete-memory",
      scope: { tenantId: "tenant_1", userId: "user_1" },
      memoryId: "memory_delete",
      signal: "helpful",
      regressionFixture: { schema_version: "1", target: "memory", signal: "helpful", scope_dimensions: ["tenant", "user"] }
    }),
    /feedback target not found/
  );
  await assert.rejects(
    () => store.addFeedback({
      id: "feedback-after-delete-trace",
      scope: { tenantId: "tenant_1", userId: "user_1" },
      traceId: "trace-delete",
      signal: "helpful",
      regressionFixture: { schema_version: "1", target: "trace", signal: "helpful", scope_dimensions: ["tenant", "user"] }
    }),
    /trace target was hard deleted/
  );
});

test("PostgresMemoryStore persists and scope-filters feedback records", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "memory_1" }));
  client.seedMemory(memoryRow({ id: "memory_correction_1", status: "pending" }));
  client.traces.set("trace_1", {
    id: "trace_1",
    tenant_id: "tenant_1",
    run_id: null,
    query: "feedback query",
    selected_memory_ids: ["memory_1"],
    ignored_memory_ids: [],
    context_pack: null,
    selection_reasons: {},
    created_at: "2026-07-07T07:00:00.000Z",
    metadata: {}
  });
  const store = new PostgresMemoryStore(client);
  const createdAt = new Date("2026-07-07T07:30:00.000Z");
  const feedback = await store.addFeedback(
    {
      id: "feedback_pg_1",
      scope: {
        tenantId: "tenant_1",
        userId: "user_1",
        projectId: "project_1"
      },
      memoryId: "memory_1",
      traceId: "trace_1",
      signal: "unhelpful",
      reason: "The answer used stale context.",
      correctionMemoryId: "memory_correction_1",
      regressionFixture: {
        schema_version: "1",
        target: "memory_and_trace",
        signal: "unhelpful",
        scope_dimensions: ["tenant", "user", "project"]
      }
    },
    {
      now: createdAt,
      actor: { type: "user", id: "reviewer_1" }
    }
  );

  assert.equal(feedback.id, "feedback_pg_1");
  assert.equal(client.transactionCount, 1);
  assert.ok(client.requireQuery("select id from memories where id = $1 for key share"));
  assert.ok(client.requireQuery("select id, metadata from memory_traces where id = $1 for share"));
  assert.equal(feedback.scope.userId, "user_1");
  assert.equal(feedback.actor.id, "reviewer_1");
  assert.equal((await store.getFeedback("feedback_pg_1")).signal, "unhelpful");
  assert.deepEqual(
    (await store.listFeedback({
      scope: { tenantId: "tenant_1", userId: "user_1", projectId: "project_1" }
    })).map((item) => item.id),
    ["feedback_pg_1"]
  );
  assert.deepEqual(
    (await store.listFeedback({
      scope: { tenantId: "tenant_1", userId: "user_1" }
    })).map((item) => item.id),
    ["feedback_pg_1"]
  );
  const listQuery = client.findQueries("select * from memory_feedback where")
    .find((query) => query.sql.includes("project_id is null"));
  assert.match(listQuery.sql, /tenant_id = \$1/);
  assert.match(listQuery.sql, /user_id = \$2/);
  assert.match(listQuery.sql, /project_id is null or project_id = \$3/);
});

test("PostgresMemoryStore commits feedback and correction in one transaction and rolls both back on failure", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "atomic-feedback-target" }));
  client.traces.set("atomic-feedback-trace", {
    id: "atomic-feedback-trace",
    tenant_id: "tenant_1",
    run_id: null,
    query: "Atomic feedback query.",
    selected_memory_ids: ["atomic-feedback-target"],
    ignored_memory_ids: [],
    context_pack: null,
    selection_reasons: {},
    created_at: "2026-07-07T07:00:00.000Z",
    metadata: {}
  });
  const store = new PostgresMemoryStore(client);
  const result = await store.addFeedbackWithCorrection(
    {
      id: "atomic-feedback-pg",
      scope: { tenantId: "tenant_1", userId: "user_1" },
      memoryId: "atomic-feedback-target",
      traceId: "atomic-feedback-trace",
      signal: "unhelpful",
      regressionFixture: {
        schema_version: "1",
        target: "memory_and_trace",
        signal: "unhelpful",
        scope_dimensions: ["tenant", "user"]
      }
    },
    {
      id: "atomic-correction-pg",
      scope: { tenantId: "tenant_1", userId: "user_1" },
      type: "failure_memory",
      canonicalText: "Atomic correction.",
      sourceKind: "user_correction",
      status: "pending"
    }
  );
  assert.equal(result.feedback.correctionMemoryId, "atomic-correction-pg");
  assert.equal(result.correction.memory.id, "atomic-correction-pg");
  assert.equal(client.transactionCount, 1);
  assert.equal(client.requireQuery("insert into memories").inTransaction, true);
  assert.equal(client.requireQuery("insert into memory_events").inTransaction, true);
  assert.equal(client.requireQuery("insert into memory_feedback").inTransaction, true);

  const memoryCount = client.memories.size;
  const eventCount = client.events.length;
  const feedbackCount = client.feedback.size;
  client.failFeedbackInsert = true;
  await assert.rejects(
    () => store.addFeedbackWithCorrection(
      {
        id: "atomic-feedback-pg-fail",
        scope: { tenantId: "tenant_1", userId: "user_1" },
        memoryId: "atomic-feedback-target",
        traceId: "atomic-feedback-trace",
        signal: "unhelpful",
        regressionFixture: {
          schema_version: "1",
          target: "memory_and_trace",
          signal: "unhelpful",
          scope_dimensions: ["tenant", "user"]
        }
      },
      {
        id: "atomic-correction-pg-fail",
        scope: { tenantId: "tenant_1", userId: "user_1" },
        type: "failure_memory",
        canonicalText: "Must roll back.",
        sourceKind: "user_correction",
        status: "pending"
      }
    ),
    /synthetic feedback insert failure/
  );
  assert.equal(client.memories.has("atomic-correction-pg-fail"), false);
  assert.equal(client.memories.size, memoryCount);
  assert.equal(client.events.length, eventCount);
  assert.equal(client.feedback.size, feedbackCount);
});

test("PostgresMemoryStore locks and revalidates linked memories before adding a conflict", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "conflict-candidate", status: "pending" }));
  client.seedMemory(memoryRow({ id: "conflict-existing", status: "active" }));
  const store = new PostgresMemoryStore(client);
  const conflict = await store.addConflict({
    id: "atomic-conflict",
    tenantId: "tenant_1",
    candidateMemoryId: "conflict-candidate",
    existingMemoryId: "conflict-existing",
    conflictType: "contradiction",
    recommendedAction: "ask_user",
    reason: "The candidate contradicts the existing memory."
  });
  assert.equal(conflict.id, "atomic-conflict");
  const lock = client.requireQuery("select * from memories where id = any($1::text[]) for key share");
  assert.deepEqual(lock.values[0], ["conflict-candidate", "conflict-existing"]);
  assert.equal(lock.inTransaction, true);
  assert.equal(client.requireQuery("insert into memory_conflicts").inTransaction, true);

  const missingClient = new FakeSqlQueryClient();
  missingClient.seedMemory(memoryRow({ id: "conflict-existing" }));
  const missingStore = new PostgresMemoryStore(missingClient);
  await assert.rejects(
    () => missingStore.addConflict({
      id: "missing-linked-conflict",
      tenantId: "tenant_1",
      candidateMemoryId: "deleted-candidate",
      existingMemoryId: "conflict-existing",
      conflictType: "contradiction",
      recommendedAction: "ask_user",
      reason: "Must not persist after deletion."
    }),
    /target memory no longer exists: deleted-candidate/
  );
  assert.equal(missingClient.conflicts.size, 0);
});

test("PostgresMemoryStore resolves conflicts only while linked memories remain locked and present", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "resolve-candidate", status: "pending" }));
  client.seedMemory(memoryRow({ id: "resolve-existing", status: "active" }));
  client.conflicts.set("resolve-conflict", conflictRowFromInsert([
    "resolve-conflict",
    "tenant_1",
    "resolve-candidate",
    "resolve-existing",
    "contradiction",
    "high",
    "ask_user",
    "open",
    "Needs review.",
    0.9,
    null,
    new Date("2026-07-07T07:00:00.000Z"),
    null,
    {}
  ]));
  const store = new PostgresMemoryStore(client);
  const result = await store.resolveConflict(
    "resolve-conflict",
    { action: "keep_both", reason: "User confirmed both." }
  );
  assert.equal(result.before.status, "open");
  assert.equal(result.conflict.status, "resolved");
  const memoryLock = client.requireQuery("select * from memories where id = any($1::text[]) for key share");
  const conflictLock = client.requireQuery("select * from memory_conflicts where id = $1 for update");
  const update = client.requireQuery("update memory_conflicts set status =");
  assert.deepEqual(memoryLock.values[0], ["resolve-candidate", "resolve-existing"]);
  assert.equal(memoryLock.inTransaction, true);
  assert.equal(conflictLock.inTransaction, true);
  assert.equal(update.inTransaction, true);
  assert.ok(client.queries.indexOf(memoryLock) < client.queries.indexOf(conflictLock));
  assert.ok(client.queries.indexOf(conflictLock) < client.queries.indexOf(update));

  const deleteFirstClient = new FakeSqlQueryClient();
  deleteFirstClient.seedMemory(memoryRow({ id: "resolve-existing" }));
  deleteFirstClient.conflicts.set("delete-first-conflict", conflictRowFromInsert([
    "delete-first-conflict",
    "tenant_1",
    "deleted-candidate",
    "resolve-existing",
    "contradiction",
    "high",
    "ask_user",
    "open",
    "Must remain unchanged.",
    0.9,
    null,
    new Date("2026-07-07T07:00:00.000Z"),
    null,
    {}
  ]));
  const deleteFirstStore = new PostgresMemoryStore(deleteFirstClient);
  await assert.rejects(
    () => deleteFirstStore.resolveConflict(
      "delete-first-conflict",
      { action: "merge", mergedText: "Must not reappear." }
    ),
    /target memory no longer exists: deleted-candidate/
  );
  assert.equal(deleteFirstClient.conflicts.get("delete-first-conflict").status, "open");
  assert.equal(deleteFirstClient.findQueries("update memory_conflicts set status =").length, 0);
});

test("PostgresMemoryStore.supersedeMemory inserts replacement, updates previous, and writes events", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "memory_old", canonical_text: "Old project fact." }));
  const store = new PostgresMemoryStore(client);
  const now = new Date("2026-07-07T08:00:00.000Z");

  const result = await store.supersedeMemory(
    "memory_old",
    {
      id: "memory_new",
      scope: {
        tenantId: "tenant_1",
        userId: "user_1",
        projectId: "project_1"
      },
      type: "project_fact",
      canonicalText: "New project fact.",
      sourceKind: "manual_edit",
      supersedes: ["memory_prior"],
      metadata: { replacement: true }
    },
    {
      now,
      actor: { type: "user", id: "user_1" }
    }
  );

  assert.equal(result.previous.id, "memory_old");
  assert.equal(result.previous.status, "superseded");
  assert.equal(result.previous.supersededBy, "memory_new");
  assert.equal(result.replacement.id, "memory_new");
  assert.deepEqual(result.replacement.supersedes, ["memory_prior", "memory_old"]);
  assert.deepEqual(result.events.map((event) => event.eventType), ["add", "supersede"]);
  assert.equal(result.events[0].reason, "Supersedes memory memory_old");
  assert.equal(result.events[1].after.replacementMemoryId, "memory_new");

  assert.equal(client.findQueries("insert into memories").length, 1);
  assert.equal(client.findQueries("update memories set").length, 1);
  assert.deepEqual(client.events.map((event) => event.event_type), ["add", "supersede"]);
});

test("PostgresMemoryStore locks referenced memories before inserting traces transactionally", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "memory_embed" }));
  client.seedMemory(memoryRow({ id: "memory_ignored", status: "invalidated" }));
  const store = new PostgresMemoryStore(client);
  const now = new Date("2026-07-07T09:00:00.000Z");

  const embedding = await store.upsertEmbedding({
    memoryId: "memory_embed",
    embedding: [0.1, 0.2, 0.3],
    embeddingModel: "text-embedding-v1",
    createdAt: now
  });
  assert.deepEqual(embedding.embedding, [0.1, 0.2, 0.3]);
  const embeddingQuery = client.requireQuery("insert into memory_embeddings");
  assert.equal(embeddingQuery.inTransaction, false);
  assert.match(embeddingQuery.sql, /on conflict \(memory_id\) do update/);
  assert.equal(embeddingQuery.values[1], "[0.1,0.2,0.3]");

  const run = await store.addRun({
    id: "run_1",
    tenantId: "tenant_1",
    userId: "user_1",
    hostId: "codex",
    taskHint: "Rank AI events.",
    startedAt: now,
    metadata: { demo: "opportunity-scout" }
  });
  assert.equal(run.id, "run_1");
  assert.equal(run.startedAt.toISOString(), now.toISOString());
  assert.deepEqual(run.metadata, { demo: "opportunity-scout" });

  const trace = await store.addTrace({
    id: "trace_1",
    tenantId: "tenant_1",
    runId: "run_1",
    query: "founder network",
    selectedMemoryIds: ["memory_embed"],
    ignoredMemoryIds: ["memory_ignored"],
    contextPack: "- [procedure] Verify deadlines.",
    selectionReasons: { memory_embed: "Matched procedure." },
    metadata: { tokenBudget: 900 }
  });
  assert.equal(trace.id, "trace_1");
  assert.deepEqual(trace.selectedMemoryIds, ["memory_embed"]);
  assert.deepEqual(trace.selectionReasons, { memory_embed: "Matched procedure." });

  assert.equal(client.transactionCount, 1);
  assert.equal(client.requireQuery("insert into runs").values[11], '{"demo":"opportunity-scout"}');
  const traceLock = client.findQueries("select * from memories where id = any($1::text[]) for key share").at(-1);
  assert.deepEqual(traceLock.values[0], ["memory_embed", "memory_ignored"]);
  assert.equal(traceLock.inTransaction, true);
  assert.equal(client.requireQuery("insert into memory_traces").inTransaction, true);
  assert.deepEqual(JSON.parse(client.requireQuery("insert into memory_traces").values[7]), {
    memory_embed: "Matched procedure."
  });

  const missingClient = new FakeSqlQueryClient();
  const missingStore = new PostgresMemoryStore(missingClient);
  await assert.rejects(
    () => missingStore.addTrace({
      id: "trace-after-delete",
      tenantId: "tenant_1",
      selectedMemoryIds: ["deleted-memory"],
      query: "Must not recreate deleted context."
    }),
    /target memory no longer exists: deleted-memory/
  );
  assert.equal(missingClient.traces.size, 0);
});

test("PostgresMemoryStore memory mutations require transaction support", async () => {
  const store = new PostgresMemoryStore({
    async query() {
      return { rows: [] };
    }
  });

  await assert.rejects(
    () =>
      store.addMemory({
        id: "memory_no_tx",
        scope: { tenantId: "tenant_1", userId: "user_1" },
        type: "procedure",
        canonicalText: "Requires transaction support.",
        sourceKind: "manual_import"
      }),
    /requires SqlQueryClient\.transaction/
  );
});

class FakeSqlQueryClient {
  queries = [];
  memories = new Map();
  events = [];
  embeddings = new Map();
  runs = new Map();
  traces = new Map();
  feedback = new Map();
  conflicts = new Map();
  failFeedbackInsert = false;
  dropMemoryBeforeKeyShare;
  mutateMemoryBeforeNoKeyUpdate;
  transactionCount = 0;
  inTransaction = false;

  seedMemory(row) {
    this.memories.set(row.id, { ...row });
  }

  async transaction(fn) {
    this.transactionCount += 1;
    const wasInTransaction = this.inTransaction;
    const snapshot = {
      memories: structuredClone(this.memories),
      events: structuredClone(this.events),
      embeddings: structuredClone(this.embeddings),
      runs: structuredClone(this.runs),
      traces: structuredClone(this.traces),
      feedback: structuredClone(this.feedback),
      conflicts: structuredClone(this.conflicts)
    };
    this.inTransaction = true;
    try {
      return await fn(this);
    } catch (error) {
      this.memories = snapshot.memories;
      this.events = snapshot.events;
      this.embeddings = snapshot.embeddings;
      this.runs = snapshot.runs;
      this.traces = snapshot.traces;
      this.feedback = snapshot.feedback;
      this.conflicts = snapshot.conflicts;
      throw error;
    } finally {
      this.inTransaction = wasInTransaction;
    }
  }

  async query(sql, values = []) {
    const normalizedSql = normalizeSql(sql);
    const query = {
      sql: normalizedSql,
      values: [...values],
      inTransaction: this.inTransaction
    };
    this.queries.push(query);

    if (normalizedSql.startsWith("select m.*")) {
      const rows = this.recallableRows(values);
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("select m.id")) {
      const rows = this.ignoredRows(values).map((row) => ({ id: row.id }));
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("insert into memories")) {
      const row = memoryRowFromInsert(values);
      this.memories.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql === "select * from memories where id = $1 for update") {
      const row = this.memories.get(values[0]);
      return { rows: row === undefined ? [] : [{ ...row }], rowCount: row === undefined ? 0 : 1 };
    }

    if (normalizedSql === "select id from memories where id = $1 for key share") {
      const row = this.memories.get(values[0]);
      return { rows: row === undefined ? [] : [{ id: row.id }], rowCount: row === undefined ? 0 : 1 };
    }

    if (normalizedSql === "select * from memories where id = any($1::text[]) for key share") {
      const ids = values[0] ?? [];
      if (this.dropMemoryBeforeKeyShare) {
        this.memories.delete(this.dropMemoryBeforeKeyShare);
        this.dropMemoryBeforeKeyShare = undefined;
      }
      const rows = ids
        .map((id) => this.memories.get(id))
        .filter(Boolean)
        .map((row) => ({ ...row }));
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql === "select * from memories where id = any($1::text[]) order by id for no key update") {
      const ids = values[0] ?? [];
      if (this.dropMemoryBeforeKeyShare) {
        this.memories.delete(this.dropMemoryBeforeKeyShare);
        this.dropMemoryBeforeKeyShare = undefined;
      }
      if (this.mutateMemoryBeforeNoKeyUpdate) {
        const { id, patch } = this.mutateMemoryBeforeNoKeyUpdate;
        const current = this.memories.get(id);
        if (current) this.memories.set(id, { ...current, ...patch });
        this.mutateMemoryBeforeNoKeyUpdate = undefined;
      }
      const rows = ids
        .map((id) => this.memories.get(id))
        .filter(Boolean)
        .map((row) => ({ ...row }));
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql === "select id, metadata from memory_traces where id = $1 for share") {
      const row = this.traces.get(values[0]);
      return {
        rows: row === undefined ? [] : [{ id: row.id, metadata: row.metadata }],
        rowCount: row === undefined ? 0 : 1
      };
    }

    if (normalizedSql.startsWith("select id from memory_traces where") && normalizedSql.endsWith("for update")) {
      const rows = [...this.traces.values()]
        .filter((trace) => traceReferencesMemoryRow(trace, values[0]))
        .map((trace) => ({ id: trace.id }));
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql === "select * from memories where id = $1") {
      const row = this.memories.get(values[0]);
      return { rows: row === undefined ? [] : [{ ...row }], rowCount: row === undefined ? 0 : 1 };
    }

    if (normalizedSql.startsWith("select * from memories")) {
      const rows = [...this.memories.values()].map((row) => ({ ...row }));
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("update memories set last_used_at")) {
      const rows = this.touchRecallMemories(values);
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("update memories set")) {
      const row = this.updateMemory(values);
      return { rows: row === undefined ? [] : [row], rowCount: row === undefined ? 0 : 1 };
    }

    if (normalizedSql.startsWith("update memory_events set before = null")) {
      const associatedTraceIds = new Set(
        [...this.traces.values()]
          .filter((trace) => traceReferencesMemoryRow(trace, values[0]))
          .map((trace) => trace.id)
      );
      for (const event of this.events) {
        if (event.memory_id !== values[0] && !associatedTraceIds.has(event.trace_id)) continue;
        event.before = null;
        event.after = null;
        event.reason = values[1];
        event.metadata = { hard_deleted_content_redacted: true };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalizedSql.startsWith("update memory_feedback set reason = null")) {
      const associatedTraceIds = new Set(
        [...this.traces.values()]
          .filter((trace) => traceReferencesMemoryRow(trace, values[0]))
          .map((trace) => trace.id)
      );
      for (const item of this.feedback.values()) {
        if (
          item.memory_id !== values[0]
          && item.correction_memory_id !== values[0]
          && !associatedTraceIds.has(item.trace_id)
        ) continue;
        item.reason = null;
        item.regression_fixture = {
          schema_version: "1",
          target: item.regression_fixture.target,
          signal: item.signal,
          scope_dimensions: item.regression_fixture.scope_dimensions,
          hard_deleted_content_redacted: true
        };
        item.metadata = { hard_deleted_content_redacted: true };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalizedSql.startsWith("update memory_traces set selected_memory_ids")) {
      for (const trace of this.traces.values()) {
        if (!traceReferencesMemoryRow(trace, values[0])) continue;
        trace.selected_memory_ids = trace.selected_memory_ids.filter((id) => id !== values[0]);
        trace.ignored_memory_ids = trace.ignored_memory_ids.filter((id) => id !== values[0]);
        trace.query = null;
        trace.context_pack = null;
        trace.selection_reasons = {};
        trace.metadata = { hard_deleted_content_redacted: true };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalizedSql.startsWith("update memory_conflicts set reason = null")) {
      for (const conflict of this.conflicts.values()) {
        if (conflict.candidate_memory_id !== values[0] && conflict.existing_memory_id !== values[0]) continue;
        conflict.reason = null;
        conflict.resolution = null;
        conflict.metadata = { hard_deleted_content_redacted: true };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalizedSql.startsWith("delete from memories where id = $1 returning id")) {
      const id = values[0];
      const existed = this.memories.delete(id);
      this.embeddings.delete(id);
      return { rows: existed ? [{ id }] : [], rowCount: existed ? 1 : 0 };
    }

    if (normalizedSql.startsWith("insert into memory_events")) {
      const row = eventRowFromInsert(values);
      this.events.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.startsWith("insert into memory_feedback")) {
      if (this.failFeedbackInsert) throw new Error("synthetic feedback insert failure");
      const row = feedbackRowFromInsert(values);
      this.feedback.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql === "select * from memory_feedback where id = $1") {
      const row = this.feedback.get(values[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    if (normalizedSql === "select * from memory_traces where id = $1") {
      const row = this.traces.get(values[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    if (normalizedSql === "select * from memory_conflicts where id = $1 for update") {
      const row = this.conflicts.get(values[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    if (normalizedSql === "select * from memory_conflicts where id = $1") {
      const row = this.conflicts.get(values[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    if (normalizedSql.startsWith("select * from memory_events")) {
      return { rows: this.events.map((event) => ({ ...event })), rowCount: this.events.length };
    }

    if (normalizedSql.startsWith("select * from memory_conflicts")) {
      const rows = [...this.conflicts.values()].map((conflict) => ({ ...conflict }));
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("update memory_conflicts set status =")) {
      const row = this.conflicts.get(values[0]);
      if (!row) return { rows: [], rowCount: 0 };
      const updated = {
        ...row,
        status: values[1],
        resolution: values[2],
        resolved_at: values[3],
        metadata: values[4]
      };
      this.conflicts.set(updated.id, updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (normalizedSql.startsWith("select * from memory_feedback")) {
      const rows = [...this.feedback.values()].filter((row) =>
        values.every((value) => {
          if (Array.isArray(value)) return value.includes(row.signal);
          return Object.values(row).includes(value) || value === row.project_id;
        })
      );
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("insert into memory_embeddings")) {
      const row = embeddingRowFromUpsert(values);
      this.embeddings.set(row.memory_id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.startsWith("insert into memory_conflicts")) {
      const row = conflictRowFromInsert(values);
      this.conflicts.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.startsWith("insert into runs")) {
      const row = runRowFromInsert(values);
      this.runs.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.startsWith("insert into memory_traces")) {
      const row = traceRowFromInsert(values);
      this.traces.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    throw new Error(`Unhandled fake SQL: ${normalizedSql}`);
  }

  recallableRows(values) {
    const now = findDateParam(values);
    const limit = values.findLast((value) => typeof value === "number") ?? this.memories.size;
    const rows = [...this.memories.values()].filter((row) => matchesRecallScope(row, values) && matchesRecallType(row, values) && isRecallableRow(row, now));
    return rows.slice(0, limit).map((row) => ({ ...row, recall_score: "1" }));
  }

  ignoredRows(values) {
    const now = findDateParam(values);
    return [...this.memories.values()].filter((row) => matchesRecallScope(row, values) && matchesRecallType(row, values) && !isRecallableRow(row, now));
  }

  touchRecallMemories(values) {
    const [now, tenantId, ids] = values;
    return ids.map((id) => {
      const existing = this.memories.get(id);
      if (existing === undefined || existing.tenant_id !== tenantId) {
        return undefined;
      }
      const updated = {
        ...existing,
        last_used_at: now,
        use_count: Number(existing.use_count ?? 0) + 1
      };
      this.memories.set(id, updated);
      return updated;
    }).filter(Boolean);
  }

  updateMemory(values) {
    const existing = this.memories.get(values[0]);
    if (existing === undefined) {
      return undefined;
    }

    const updated = {
      ...existing,
      agent_profile_id: values[1],
      project_id: values[2],
      host_id: values[3],
      session_id: values[4],
      tool_id: values[5],
      type: values[6],
      canonical_text: values[7],
      raw_source: values[8],
      source_kind: values[9],
      status: values[10],
      confidence: values[11],
      importance: values[12],
      valid_from: values[13],
      valid_until: values[14],
      supersedes: values[15],
      superseded_by: values[16],
      updated_at: values[17],
      last_used_at: values[18],
      use_count: values[19],
      metadata: values[20]
    };
    this.memories.set(updated.id, updated);
    return updated;
  }

  findQueries(prefix) {
    return this.queries.filter((query) => query.sql.startsWith(prefix));
  }

  requireQuery(prefix) {
    const query = this.findQueries(prefix)[0];
    assert.ok(query, `expected query starting with ${prefix}`);
    return query;
  }
}

function normalizeSql(sql) {
  return sql.trim().replace(/\s+/g, " ");
}

function findDateParam(values) {
  return values.find((value) => value instanceof Date) ?? new Date("2026-07-07T12:00:00.000Z");
}

function matchesRecallScope(row, values) {
  return row.tenant_id === values[0] && row.user_id === values[1];
}

function matchesRecallType(row, values) {
  const typeFilter = values.find((value) => Array.isArray(value) && value.includes(row.type));
  return typeFilter === undefined || typeFilter.includes(row.type);
}

function isRecallableRow(row, now) {
  return (
    row.status === "active" &&
    row.superseded_by == null &&
    (row.valid_from == null || new Date(row.valid_from) <= now) &&
    (row.valid_until == null || new Date(row.valid_until) > now)
  );
}

function memoryRow(overrides = {}) {
  return {
    id: "memory_1",
    tenant_id: "tenant_1",
    user_id: "user_1",
    agent_profile_id: null,
    project_id: null,
    host_id: null,
    session_id: null,
    tool_id: null,
    type: "procedure",
    canonical_text: "Original memory.",
    raw_source: null,
    source_kind: "manual_import",
    status: "active",
    confidence: 0.8,
    importance: 0.5,
    valid_from: null,
    valid_until: null,
    supersedes: [],
    superseded_by: null,
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z",
    last_used_at: null,
    use_count: 0,
    metadata: {},
    ...overrides
  };
}

function memoryRowFromInsert(values) {
  return memoryRow({
    id: values[0],
    tenant_id: values[1],
    user_id: values[2],
    agent_profile_id: values[3],
    project_id: values[4],
    host_id: values[5],
    session_id: values[6],
    tool_id: values[7],
    type: values[8],
    canonical_text: values[9],
    raw_source: values[10],
    source_kind: values[11],
    status: values[12],
    confidence: values[13],
    importance: values[14],
    valid_from: values[15],
    valid_until: values[16],
    supersedes: values[17],
    superseded_by: values[18],
    created_at: values[19],
    updated_at: values[20],
    last_used_at: values[21],
    use_count: values[22],
    metadata: values[23]
  });
}

function eventRowFromInsert(values) {
  return {
    id: values[0],
    tenant_id: values[1],
    memory_id: values[2],
    run_id: values[3],
    trace_id: values[4],
    event_type: values[5],
    actor_type: values[6],
    actor_id: values[7],
    reason: values[8],
    before: values[9],
    after: values[10],
    created_at: values[11],
    metadata: values[12]
  };
}

function feedbackRowFromInsert(values) {
  return {
    id: values[0],
    tenant_id: values[1],
    user_id: values[2],
    agent_profile_id: values[3],
    project_id: values[4],
    host_id: values[5],
    session_id: values[6],
    tool_id: values[7],
    memory_id: values[8],
    trace_id: values[9],
    run_id: values[10],
    signal: values[11],
    reason: values[12],
    correction_memory_id: values[13],
    actor_type: values[14],
    actor_id: values[15],
    regression_fixture: values[16],
    created_at: values[17],
    metadata: values[18]
  };
}

function conflictRowFromInsert(values) {
  return {
    id: values[0],
    tenant_id: values[1],
    candidate_memory_id: values[2],
    existing_memory_id: values[3],
    conflict_type: values[4],
    severity: values[5],
    recommended_action: values[6],
    status: values[7],
    reason: values[8],
    confidence: values[9],
    resolution: values[10],
    created_at: values[11],
    resolved_at: values[12],
    metadata: values[13]
  };
}

function embeddingRowFromUpsert(values) {
  return {
    memory_id: values[0],
    embedding: values[1],
    embedding_model: values[2],
    created_at: values[3]
  };
}

function runRowFromInsert(values) {
  return {
    id: values[0],
    tenant_id: values[1],
    user_id: values[2],
    host_id: values[3],
    agent_profile_id: values[4],
    project_id: values[5],
    task_hint: values[6],
    summary: values[7],
    outcome: values[8],
    started_at: values[9],
    ended_at: values[10],
    metadata: values[11]
  };
}

function traceRowFromInsert(values) {
  return {
    id: values[0],
    tenant_id: values[1],
    run_id: values[2],
    query: values[3],
    selected_memory_ids: values[4],
    ignored_memory_ids: values[5],
    context_pack: values[6],
    selection_reasons: values[7],
    created_at: values[8],
    metadata: values[9]
  };
}

function traceReferencesMemoryRow(trace, memoryId) {
  if (trace.selected_memory_ids?.includes(memoryId) || trace.ignored_memory_ids?.includes(memoryId)) {
    return true;
  }
  return trace.metadata?.excludedMemoryIds?.includes(memoryId)
    || trace.metadata?.excluded_memory_ids?.includes(memoryId)
    || false;
}

test("buildMemoryListQuery excludes explicitly-expired memories on the default path", () => {
  const { sql } = buildMemoryListQuery({
    scope: { tenantId: "tenant_1", userId: "user_1" },
    now: new Date("2026-07-07T00:00:00.000Z")
  });
  // Must use the effective-status expression (matches getEffectiveMemoryStatus),
  // not just the active+validity predicate, so status='expired' rows are hidden.
  assert.match(sql, /else status end\) <> 'expired'/);
});

test("buildMemoryListQuery treats an empty allowlist as match-nothing", () => {
  const statuses = buildMemoryListQuery({ scope: { tenantId: "t", userId: "u" }, statuses: [] });
  assert.match(statuses.sql, /\bfalse\b/);
  const types = buildMemoryListQuery({ scope: { tenantId: "t", userId: "u" }, types: [] });
  assert.match(types.sql, /\bfalse\b/);
});

test("feedback and conflict list builders treat empty arrays as match-nothing", () => {
  assert.match(buildFeedbackListQuery({ signals: [] }).sql, /\bfalse\b/);
  assert.match(buildConflictListQuery({ statuses: [] }).sql, /\bfalse\b/);
  assert.match(buildConflictListQuery({ conflictTypes: [] }).sql, /\bfalse\b/);
});

test("buildRecallQuery guards the vector distance against a dimension mismatch", () => {
  const { sql } = buildRecallQuery(
    { scope: { tenantId: "tenant_1", userId: "user_1" }, now: new Date("2026-07-07T00:00:00.000Z") },
    { queryEmbedding: [0.1, 0.2, 0.3] }
  );
  assert.match(sql, /vector_dims\(e\.embedding\) <> 3/);
});
