import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIgnoredMemoryQuery,
  buildRecallQuery,
  mapRecallRows,
  mapPostgresConflictRow,
  mapPostgresEventRow,
  mapPostgresMemoryRow,
  mapPostgresRunRow,
  mapPostgresTraceRow,
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
  assert.match(selectCall.sql, /from memories m/);
  assert.match(selectCall.sql, /\(m\.agent_profile_id is null or m\.agent_profile_id = \$3\)/);
  assert.match(selectCall.sql, /\(m\.project_id is null or m\.project_id = \$4\)/);
  assert.match(selectCall.sql, /m\.status = 'active'/);
  assert.match(ignoredCall.sql, /not \(m\.status = 'active'/);
  assert.deepEqual(updateCall.values, [now, "tenant_1", ["memory_selected"]]);
  assert.deepEqual(traceCall.values[4], ["memory_selected"]);
  assert.deepEqual(traceCall.values[5], ["memory_future"]);
  assert.deepEqual(traceCall.values[9], { stage: "unit-test" });
  assert.equal(eventCall.values[5], "recall");
  assert.equal(eventCall.values[6], "mcp_host");
  assert.equal(eventCall.values[7], "codex");
  assert.deepEqual(eventCall.values[12], { stage: "unit-test" });
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

test("PostgresMemoryStore.deleteMemory soft-deletes the row and persists a delete event", async () => {
  const client = new FakeSqlQueryClient();
  client.seedMemory(memoryRow({ id: "memory_delete", canonical_text: "Delete me." }));
  const store = new PostgresMemoryStore(client);
  const now = new Date("2026-07-07T07:00:00.000Z");

  const result = await store.deleteMemory("memory_delete", {
    now,
    actor: { type: "system", id: "retention" },
    reason: "retention cleanup"
  });

  assert.equal(result.before.status, "active");
  assert.equal(result.memory.status, "deleted");
  assert.equal(result.memory.updatedAt.toISOString(), now.toISOString());
  assert.equal(result.event.eventType, "delete");
  assert.equal(result.event.before.status, "active");
  assert.equal(result.event.after.status, "deleted");

  const update = client.requireQuery("update memories set");
  assert.equal(update.values[10], "deleted");
  const eventInsert = client.requireQuery("insert into memory_events");
  assert.equal(eventInsert.values[5], "delete");
  assert.equal(JSON.parse(eventInsert.values[10]).status, "deleted");
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

test("PostgresMemoryStore upserts embeddings and inserts runs and traces without a transaction", async () => {
  const client = new FakeSqlQueryClient();
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

  assert.equal(client.transactionCount, 0);
  assert.equal(client.requireQuery("insert into runs").values[11], '{"demo":"opportunity-scout"}');
  assert.deepEqual(JSON.parse(client.requireQuery("insert into memory_traces").values[7]), {
    memory_embed: "Matched procedure."
  });
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
  transactionCount = 0;
  inTransaction = false;

  seedMemory(row) {
    this.memories.set(row.id, { ...row });
  }

  async transaction(fn) {
    this.transactionCount += 1;
    const wasInTransaction = this.inTransaction;
    this.inTransaction = true;
    try {
      return await fn(this);
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

    if (normalizedSql.startsWith("update memories set last_used_at")) {
      const rows = this.touchRecallMemories(values);
      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.startsWith("update memories set")) {
      const row = this.updateMemory(values);
      return { rows: row === undefined ? [] : [row], rowCount: row === undefined ? 0 : 1 };
    }

    if (normalizedSql.startsWith("insert into memory_events")) {
      const row = eventRowFromInsert(values);
      this.events.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.startsWith("insert into memory_embeddings")) {
      const row = embeddingRowFromUpsert(values);
      this.embeddings.set(row.memory_id, row);
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
