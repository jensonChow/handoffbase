import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMemoryStore } from "@handoffbase/memory-core";
import { DashboardMemoryBackend } from "../src/lib/server/dashboard-memory-store";
import {
  DASHBOARD_SESSION_COOKIE,
  DashboardSessionError,
  createDashboardSession,
  getDashboardSessionStatus,
  requireDashboardCaller,
  requireDashboardSameOriginMutation
} from "../src/lib/server/dashboard-session";

const SESSION_SECRET = "dashboard-session-secret-at-least-32-characters";
const apiEnvironment = {
  HANDOFFBASE_AUTH_MODE: "api_key",
  HANDOFFBASE_DASHBOARD_SESSION_SECRET: SESSION_SECRET,
  HANDOFFBASE_API_KEYS_JSON: JSON.stringify({
    "key-for-alice": {
      tenantId: "tenant-a",
      userId: "alice",
      actorType: "dashboard",
      actorId: "alice-dashboard"
    },
    "key-for-bob": {
      tenantId: "tenant-a",
      userId: "bob",
      actorType: "dashboard",
      actorId: "bob-dashboard"
    }
  })
};

test("dashboard sessions are stateless signed caller cookies without API keys", () => {
  const created = createDashboardSession("key-for-alice", apiEnvironment, 1_000);
  assert.equal(created.status.authenticated, true);
  assert.equal(created.status.caller?.userId, "alice");
  assert.ok(created.token);
  assert.equal(created.token.includes("key-for-alice"), false);

  const payload = JSON.parse(
    Buffer.from(created.token.split(".")[0] ?? "", "base64url").toString("utf8")
  ) as Record<string, unknown>;
  assert.equal(JSON.stringify(payload).includes("key-for-alice"), false);
  assert.equal(JSON.stringify(payload).includes("alice"), false);
  assert.equal(JSON.stringify(payload).includes("tenant-a"), false);
  assert.equal(typeof payload.keyFingerprint, "string");

  const request = sessionRequest(created.token);
  assert.equal(
    getDashboardSessionStatus(request, apiEnvironment, 2_000).caller?.userId,
    "alice"
  );
});

test("revoked keys stop working and grant changes apply to existing sessions", () => {
  const token = createDashboardSession("key-for-alice", apiEnvironment).token;
  const narrowedEnvironment = {
    ...apiEnvironment,
    HANDOFFBASE_API_KEYS_JSON: JSON.stringify({
      "key-for-alice": {
        tenantId: "tenant-a",
        userId: "alice",
        actorType: "dashboard",
        actorId: "alice-dashboard",
        allowedProjectIds: ["project-tight"]
      }
    })
  };
  const narrowed = getDashboardSessionStatus(
    sessionRequest(token),
    narrowedEnvironment
  );
  assert.equal(narrowed.authenticated, true);
  assert.deepEqual(narrowed.caller?.allowedProjectIds, ["project-tight"]);

  const revoked = getDashboardSessionStatus(sessionRequest(token), {
    ...apiEnvironment,
    HANDOFFBASE_API_KEYS_JSON: "{}"
  });
  assert.equal(revoked.authenticated, false);
});

test("tampered, expired, and malformed dashboard cookies fail closed", () => {
  const token = createDashboardSession("key-for-alice", apiEnvironment, 1_000).token;
  assert.ok(token);
  const [payload, signature] = token.split(".");
  const tampered = `${payload?.startsWith("a") ? "b" : "a"}${payload?.slice(1)}.${signature}`;

  assert.equal(
    getDashboardSessionStatus(sessionRequest(tampered), apiEnvironment, 2_000)
      .authenticated,
    false
  );
  assert.equal(
    getDashboardSessionStatus(
      sessionRequest(token),
      apiEnvironment,
      9 * 60 * 60 * 1_000
    ).authenticated,
    false
  );
  assert.equal(
    getDashboardSessionStatus(
      new Request("http://localhost", {
        headers: { cookie: `${DASHBOARD_SESSION_COOKIE}=%not-valid` }
      }),
      apiEnvironment,
      2_000
    ).authenticated,
    false
  );
  assert.throws(
    () => requireDashboardCaller(sessionRequest(tampered), apiEnvironment, 2_000),
    (error: unknown) =>
      error instanceof DashboardSessionError && error.statusCode === 401
  );
});

test("api-key mode requires a strong session secret and disabled production fails closed", () => {
  assert.throws(
    () =>
      createDashboardSession("key-for-alice", {
        ...apiEnvironment,
        HANDOFFBASE_DASHBOARD_SESSION_SECRET: undefined
      }),
    (error: unknown) =>
      error instanceof DashboardSessionError &&
      error.code === "dashboard_session_configuration_error" &&
      error.statusCode === 503
  );

  assert.throws(
    () =>
      getDashboardSessionStatus(new Request("http://localhost"), {
        HANDOFFBASE_AUTH_MODE: "disabled",
        NODE_ENV: "production"
      }),
    (error: unknown) =>
      error instanceof DashboardSessionError &&
      error.code === "dashboard_insecure_auth_configuration" &&
      error.statusCode === 503
  );
});

test("production mutations require an exact same-origin Origin header", () => {
  assert.doesNotThrow(() =>
    requireDashboardSameOriginMutation(
      new Request("https://vault.example/api/dashboard/memory", {
        method: "PATCH",
        headers: { origin: "https://vault.example" }
      }),
      { NODE_ENV: "production" }
    )
  );

  assert.doesNotThrow(() =>
    requireDashboardSameOriginMutation(
      new Request("http://localhost:3001/api/dashboard/session", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3001",
          origin: "http://127.0.0.1:3001"
        }
      }),
      { NODE_ENV: "production" }
    )
  );

  assert.doesNotThrow(() =>
    requireDashboardSameOriginMutation(
      new Request("http://dashboard:3001/api/dashboard/memory", {
        method: "PATCH",
        headers: {
          host: "dashboard:3001",
          origin: "https://vault.example",
          "x-forwarded-host": "vault.example",
          "x-forwarded-proto": "https"
        }
      }),
      { NODE_ENV: "production" }
    )
  );

  for (const origin of [undefined, "https://attacker.example", "https://vault.example/path"]) {
    assert.throws(
      () =>
        requireDashboardSameOriginMutation(
          new Request("https://vault.example/api/dashboard/memory", {
            method: "PATCH",
            headers: origin ? { origin } : undefined
          }),
          { NODE_ENV: "production" }
        ),
      (error: unknown) =>
        error instanceof DashboardSessionError &&
        error.code === "dashboard_csrf_rejected" &&
        error.statusCode === 403
    );
  }
});

test("authenticated API-key callers see and mutate only their own vault", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "alice-memory",
    scope: { tenantId: "tenant-a", userId: "alice" },
    type: "project_fact",
    canonicalText: "Alice private memory",
    sourceKind: "manual_import"
  });
  await store.addMemory({
    id: "bob-memory",
    scope: { tenantId: "tenant-a", userId: "bob" },
    type: "project_fact",
    canonicalText: "Bob private memory",
    sourceKind: "manual_import"
  });
  const backend = new DashboardMemoryBackend(store, {
    mode: "server_in_memory",
    seedDemoData: false,
    loadMemories: ({ store: currentStore }) =>
      currentStore.listMemories({ includeExpiredByValidity: true })
  });
  const alice = requireDashboardCaller(
    sessionRequest(createDashboardSession("key-for-alice", apiEnvironment).token),
    apiEnvironment
  );
  const bob = requireDashboardCaller(
    sessionRequest(createDashboardSession("key-for-bob", apiEnvironment).token),
    apiEnvironment
  );

  const [aliceSnapshot, bobSnapshot] = await Promise.all([
    backend.listDashboard(alice),
    backend.listDashboard(bob)
  ]);
  assert.deepEqual(aliceSnapshot.memories.map((memory) => memory.id), ["alice-memory"]);
  assert.deepEqual(bobSnapshot.memories.map((memory) => memory.id), ["bob-memory"]);
  assert.equal(JSON.stringify(aliceSnapshot).includes("Bob private memory"), false);
  await assert.rejects(
    backend.updateMemory("bob-memory", { canonicalText: "Cross-user edit" }, alice),
    /not found/
  );
});

test("restricted callers cannot read legacy unscoped traces, context, or feedback", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    id: "legacy-memory",
    scope: { tenantId: "tenant-a", userId: "alice" },
    type: "project_fact",
    canonicalText: "LEGACY_MEMORY_SECRET",
    sourceKind: "manual_import"
  });
  await store.addRun({
    id: "legacy-run",
    tenantId: "tenant-a",
    userId: "alice"
  });
  const trace = await store.addTrace({
    id: "legacy-trace",
    tenantId: "tenant-a",
    runId: "legacy-run",
    selectedMemoryIds: ["legacy-memory"],
    contextPack: "LEGACY_CONTEXT_SECRET",
    selectionReasons: { "legacy-memory": "legacy" }
  });
  await store.addFeedback({
    id: "legacy-feedback",
    scope: { tenantId: "tenant-a", userId: "alice" },
    traceId: trace.id,
    runId: "legacy-run",
    signal: "unhelpful",
    reason: "LEGACY_FEEDBACK_SECRET",
    regressionFixture: {
      schema_version: "1",
      target: "trace",
      signal: "unhelpful",
      scope_dimensions: ["tenant", "user"],
      correction: "Legacy correction"
    }
  });
  const backend = new DashboardMemoryBackend(store, {
    mode: "server_in_memory",
    seedDemoData: false,
    loadMemories: ({ store: currentStore }) =>
      currentStore.listMemories({ includeExpiredByValidity: true }),
    loadTraces: async () => [trace]
  });
  const snapshot = await backend.listDashboard({
    tenantId: "tenant-a",
    userId: "alice",
    actorType: "dashboard",
    actorId: "alice-dashboard",
    authMode: "api_key",
    allowedAgentProfileIds: ["agent-tight"],
    allowedProjectIds: ["project-tight"]
  });

  assert.deepEqual(snapshot.memories, []);
  assert.deepEqual(snapshot.traces, []);
  assert.deepEqual(snapshot.feedback, []);
  assert.equal(JSON.stringify(snapshot).includes("LEGACY_"), false);
});

test("restricted callers see only deletion tombstones with explicit allowed grants", async () => {
  const store = new InMemoryMemoryStore();
  const records = [
    {
      id: "deleted-global",
      scope: { tenantId: "tenant-a", userId: "alice" }
    },
    {
      id: "deleted-other-project",
      scope: {
        tenantId: "tenant-a",
        userId: "alice",
        agentProfileId: "agent-tight",
        projectId: "project-other"
      }
    },
    {
      id: "deleted-allowed",
      scope: {
        tenantId: "tenant-a",
        userId: "alice",
        agentProfileId: "agent-tight",
        projectId: "project-tight"
      }
    }
  ] as const;
  for (const record of records) {
    await store.addMemory({
      id: record.id,
      scope: record.scope,
      type: "project_fact",
      canonicalText: `Private content for ${record.id}`,
      sourceKind: "manual_import"
    });
    await store.deleteMemory(record.id, {
      actor: { type: "dashboard", id: "alice-dashboard" },
      reason: `Delete ${record.id}`
    });
  }
  const backend = new DashboardMemoryBackend(store, {
    mode: "server_in_memory",
    seedDemoData: false,
    loadMemories: ({ store: currentStore }) =>
      currentStore.listMemories({ includeExpiredByValidity: true }),
    loadTraces: async () => []
  });
  const snapshot = await backend.listDashboard({
    tenantId: "tenant-a",
    userId: "alice",
    actorType: "dashboard",
    actorId: "alice-dashboard",
    authMode: "api_key",
    allowedAgentProfileIds: ["agent-tight"],
    allowedProjectIds: ["project-tight"]
  });

  assert.deepEqual(snapshot.events.map((event) => event.memoryId), ["deleted-allowed"]);
  assert.equal(JSON.stringify(snapshot).includes("deleted-global"), false);
  assert.equal(JSON.stringify(snapshot).includes("deleted-other-project"), false);
});

function sessionRequest(token: string | undefined): Request {
  return new Request("http://localhost", {
    headers: token
      ? { cookie: `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(token)}` }
      : undefined
  });
}
