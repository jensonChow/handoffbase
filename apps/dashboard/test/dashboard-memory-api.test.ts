import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMemoryStore,
  MemoryMutationPreconditionError
} from "@handoffbase/memory-core";
import type {
  ConflictResolutionResult,
  DashboardSnapshot,
  MemoryRecord,
  TraceFeedback
} from "../src/lib/memory-client";
import { GET } from "../src/app/api/dashboard/memory/route";
import {
  DELETE,
  PATCH
} from "../src/app/api/dashboard/memories/[memoryId]/route";
import { POST as approveMemory } from "../src/app/api/dashboard/memories/[memoryId]/approve/route";
import { POST as invalidateMemory } from "../src/app/api/dashboard/memories/[memoryId]/invalidate/route";
import { POST as resolveConflict } from "../src/app/api/dashboard/conflicts/[conflictId]/resolve/route";
import { POST as submitTraceFeedback } from "../src/app/api/dashboard/traces/[traceId]/feedback/route";
import { resetDashboardMemoryBackendForTest } from "../src/lib/server/dashboard-memory-store";
import { dashboardErrorResponse } from "../src/lib/server/dashboard-route-utils";
import { ScopeGuardError } from "../../../src/auth/scope";

test("GET /api/dashboard/memory returns seeded dashboard data", async () => {
  resetDashboardMemoryBackendForTest();

  const response = await GET();
  assert.equal(response.status, 200);

  const snapshot = (await response.json()) as DashboardSnapshot;
  assert.equal(snapshot.runtime.mode, "server_in_memory");
  assert.equal(snapshot.memories.length, 6);
  assert.equal(snapshot.traces.length, 2);
  assert.equal(snapshot.conflicts.length, 1);
  assert.equal(snapshot.conflicts[0]?.status, "open");
  assert.equal(snapshot.conflicts[0]?.conflictType, "supersedes");
  assert.equal(JSON.stringify(snapshot).includes("not wired yet"), false);
  assert.equal(
    snapshot.memories.find((memory) => memory.id === "mem_pending_004")?.status,
    "pending"
  );
});

test("dashboard mutations survive fresh reads while the server process stays alive", async () => {
  resetDashboardMemoryBackendForTest();

  const patchResponse = await PATCH(
    jsonRequest("PATCH", {
      canonicalText: "Updated from the dashboard API route test."
    }),
    routeContext("mem_user_pref_001")
  );
  assert.equal(patchResponse.status, 200);
  assert.equal(
    ((await patchResponse.json()) as MemoryRecord).canonicalText,
    "Updated from the dashboard API route test."
  );

  const approveResponse = await approveMemory(
    new Request("http://localhost/api/dashboard/memories/mem_pending_004/approve", {
      method: "POST"
    }),
    routeContext("mem_pending_004")
  );
  assert.equal(approveResponse.status, 200);
  assert.equal(((await approveResponse.json()) as MemoryRecord).status, "active");

  const invalidateResponse = await invalidateMemory(
    jsonRequest("POST", {
      reason: "Rejected from route test."
    }),
    routeContext("mem_tool_003")
  );
  assert.equal(invalidateResponse.status, 200);
  assert.equal(((await invalidateResponse.json()) as MemoryRecord).status, "invalidated");

  const deleteResponse = await DELETE(
    jsonRequest("DELETE", {
      reason: "Deleted from route test."
    }),
    routeContext("mem_pending_005")
  );
  assert.equal(deleteResponse.status, 204);

  const snapshotResponse = await GET();
  const snapshot = (await snapshotResponse.json()) as DashboardSnapshot;
  assert.equal(
    snapshot.memories.find((memory) => memory.id === "mem_user_pref_001")?.canonicalText,
    "Updated from the dashboard API route test."
  );
  assert.equal(
    snapshot.memories.some((memory) => memory.id === "mem_pending_005"),
    false
  );
  assert.equal(
    snapshot.memories.find((memory) => memory.id === "mem_pending_004")?.status,
    "active"
  );
  assert.equal(
    snapshot.memories.find((memory) => memory.id === "mem_tool_003")?.status,
    "invalidated"
  );
  assert.equal(
    snapshot.memories.find((memory) => memory.id === "mem_tool_003")?.validity.reason,
    "Tool behavior observed during current demo data collection."
  );
  assert.equal(
    snapshot.events.some(
      (event) => event.memoryId === "mem_pending_004" && event.eventType === "approved"
    ),
    true
  );
  const deletion = snapshot.events.find(
    (event) => event.memoryId === "mem_pending_005" && event.eventType === "deleted"
  );
  assert.ok(deletion);
  assert.equal(deletion.hardDeleted, true);
  assert.equal(deletion.scopeLabel, "user / project / agent profile / host");
  assert.equal(JSON.stringify(deletion).includes("canonicalText"), false);
  assert.equal(JSON.stringify(deletion).includes("rawSource"), false);
  assert.equal(
    snapshot.events.some(
      (event) =>
        event.memoryId === "mem_tool_003" &&
        event.eventType === "invalidated" &&
        event.reason === "Rejected from route test."
    ),
    true
  );

  const forbiddenReapproval = await approveMemory(
    new Request("http://localhost/api/dashboard/memories/mem_tool_003/approve", {
      method: "POST"
    }),
    routeContext("mem_tool_003")
  );
  assert.equal(forbiddenReapproval.status, 409);
  assert.equal((await forbiddenReapproval.json()).code, "memory_precondition_failed");
  assert.equal(
    ((await (await GET()).json()) as DashboardSnapshot).memories.find(
      (memory) => memory.id === "mem_tool_003"
    )?.status,
    "invalidated"
  );

  const secondRefresh = (await (await GET()).json()) as DashboardSnapshot;
  assert.deepEqual(secondRefresh.memories, snapshot.memories);
});

test("an injected shared store scopes memories, events, traces, and conflicts", async () => {
  const store = new InMemoryMemoryStore();

  await store.addMemory({
    id: "shared_memory_001",
    scope: {
      tenantId: "demo-tenant",
      userId: "demo-user",
      projectId: "project_shared"
    },
    type: "project_fact",
    canonicalText: "This record came from the injected shared store.",
    sourceKind: "manual_import"
  });
  await store.addMemory({
    id: "other_user_memory",
    scope: {
      tenantId: "demo-tenant",
      userId: "other_user"
    },
    type: "project_fact",
    canonicalText: "This record must stay outside the dashboard scope.",
    sourceKind: "manual_import"
  });

  await store.addRun({
    id: "run_shared",
    tenantId: "demo-tenant",
    userId: "demo-user",
    projectId: "project_shared",
    hostId: "codex"
  });
  await store.addRun({
    id: "run_other_user",
    tenantId: "demo-tenant",
    userId: "other_user",
    projectId: "project_shared",
    hostId: "codex"
  });
  const sharedTrace = await store.addTrace({
    id: "trace_shared",
    tenantId: "demo-tenant",
    runId: "run_shared",
    selectedMemoryIds: ["shared_memory_001"],
    ignoredMemoryIds: [],
    selectionReasons: {
      shared_memory_001: "Visible to the configured dashboard user."
    }
  });
  const otherUserTrace = await store.addTrace({
    id: "trace_other_user",
    tenantId: "demo-tenant",
    runId: "run_other_user",
    selectedMemoryIds: ["other_user_memory"],
    ignoredMemoryIds: [],
    selectionReasons: {
      other_user_memory: "Must remain hidden from the configured dashboard user."
    }
  });
  await store.addConflict({
    id: "conflict_other_user",
    tenantId: "demo-tenant",
    candidateMemoryId: "other_user_memory",
    existingMemoryId: "shared_memory_001",
    conflictType: "contradiction",
    severity: "high",
    recommendedAction: "ask_user",
    reason: "This cross-user conflict must remain hidden."
  });

  let factoryCalls = 0;
  resetDashboardMemoryBackendForTest(async () => {
    factoryCalls += 1;
    return {
      store,
      mode: "shared_persistent_store",
      scope: {
        tenantId: "demo-tenant",
        userId: "demo-user"
      },
      seedDemoData: false,
      loadMemories: async ({ store: boundStore }) =>
        boundStore.listMemories({ includeExpiredByValidity: true }),
      loadTraces: async () => [sharedTrace, otherUserTrace]
    };
  });

  const [firstResponse, secondResponse] = await Promise.all([GET(), GET()]);
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(factoryCalls, 1);

  const snapshot = (await firstResponse.json()) as DashboardSnapshot;
  assert.equal(snapshot.runtime.mode, "shared_persistent_store");
  assert.deepEqual(
    snapshot.memories.map((memory) => memory.id),
    ["shared_memory_001"]
  );
  assert.deepEqual(snapshot.traces.map((trace) => trace.id), ["trace_shared"]);
  assert.deepEqual(
    snapshot.traces[0]?.usedMemories.map((memory) => memory.memoryId),
    ["shared_memory_001"]
  );
  assert.equal(
    snapshot.events.every((event) => event.memoryId === "shared_memory_001"),
    true
  );
  assert.equal(snapshot.conflicts.length, 0);
  assert.equal(JSON.stringify(snapshot).includes("other_user_memory"), false);
  assert.equal(
    JSON.stringify(snapshot).includes("outside the dashboard scope"),
    false
  );

  const crossScopeMutation = await PATCH(
    jsonRequest("PATCH", { canonicalText: "Cross-scope edit" }),
    routeContext("other_user_memory")
  );
  assert.equal(crossScopeMutation.status, 404);
  assert.equal(
    (await store.getMemory("other_user_memory"))?.canonicalText,
    "This record must stay outside the dashboard scope."
  );
});

test("store factory failures return a sanitized configuration response", async () => {
  resetDashboardMemoryBackendForTest(() => {
    throw new Error("INTERNAL_DATABASE_DETAIL_SHOULD_NOT_LEAK");
  });

  const response = await GET();
  assert.equal(response.status, 503);

  const body = (await response.json()) as { code: string; error: string };
  assert.deepEqual(body, {
    code: "dashboard_configuration_error",
    error: "The dashboard memory store is not configured."
  });
  assert.equal(JSON.stringify(body).includes("INTERNAL_DATABASE_DETAIL"), false);
});

test("dashboard routes reject malformed requests without exposing server details", async () => {
  resetDashboardMemoryBackendForTest();

  const malformed = await PATCH(
    new Request("http://localhost/api/dashboard/memories/mem_pending_005", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{"
    }),
    routeContext("mem_pending_005")
  );
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "invalid_request");

  const missing = await PATCH(
    jsonRequest("PATCH", { canonicalText: "Unknown" }),
    routeContext("missing_memory")
  );
  assert.equal(missing.status, 404);

  const lifecycleBypass = await PATCH(
    jsonRequest("PATCH", { status: "active" }),
    routeContext("mem_pending_005")
  );
  assert.equal(lifecycleBypass.status, 400);
  assert.match((await lifecycleBypass.json()).error, /unsupported field status/);

  const invalidValidity = await PATCH(
    jsonRequest("PATCH", {
      validity: { validFrom: "not-a-date" }
    }),
    routeContext("mem_pending_005")
  );
  assert.equal(invalidValidity.status, 400);
  assert.match((await invalidValidity.json()).error, /valid date-time string/);
});

test("conflict resolution requires an audit reason and refreshes open conflicts", async () => {
  resetDashboardMemoryBackendForTest();

  const invalidMerge = await resolveConflict(
    jsonRequest("POST", {
      action: "merge",
      reason: "Combine both durable facts."
    }),
    conflictContext("conflict_001")
  );
  assert.equal(invalidMerge.status, 400);
  assert.match((await invalidMerge.json()).error, /mergedText is required/);

  const inapplicableAction = await resolveConflict(
    jsonRequest("POST", {
      action: "keep_both",
      reason: "Try an action that cannot revive the superseded memory."
    }),
    conflictContext("conflict_001")
  );
  assert.equal(inapplicableAction.status, 409);
  assert.deepEqual(await inapplicableAction.json(), {
    code: "conflict_action_not_applicable",
    error: "The conflict state does not allow this action. Refresh and choose an applicable resolution."
  });

  const response = await resolveConflict(
    jsonRequest("POST", {
      action: "dismiss_conflict",
      reason: "Existing lifecycle links already encode the reviewed outcome."
    }),
    conflictContext("conflict_001")
  );
  assert.equal(response.status, 200);
  const result = (await response.json()) as ConflictResolutionResult;
  assert.equal(result.action, "dismiss_conflict");
  assert.equal(result.status, "dismissed");

  const snapshot = (await (await GET()).json()) as DashboardSnapshot;
  assert.equal(snapshot.conflicts.length, 0);
});

test("trace feedback persists a safe regression fixture across refresh", async () => {
  const store = new InMemoryMemoryStore();
  resetDashboardMemoryBackendForTest(store);

  const response = await submitTraceFeedback(
    jsonRequest("POST", {
      rating: "unhelpful",
      reason: "The recalled context missed the region constraint.",
      correction: "Always verify region eligibility before ranking an event.",
      outcome: "The first recommendation was ineligible."
    }),
    traceContext("trace_0706_02")
  );
  assert.equal(response.status, 201);
  const submitted = (await response.json()) as TraceFeedback;
  assert.equal(submitted.rating, "unhelpful");
  assert.ok(submitted.correctionMemoryId);
  assert.equal(submitted.regressionFixture.signal, "unhelpful");
  const rawFeedback = await store.listFeedback();
  assert.equal(rawFeedback.length, 1, JSON.stringify(rawFeedback, null, 2));
  assert.equal(
    (await store.listFeedback({
      scope: { tenantId: "demo-tenant", userId: "demo-user" }
    })).length,
    1
  );

  const snapshot = (await (await GET()).json()) as DashboardSnapshot;
  const persisted = snapshot.feedback.find((item) => item.id === submitted.id);
  assert.ok(
    persisted,
    JSON.stringify(
      {
        rawFeedback,
        visibleFeedback: snapshot.feedback,
        traces: snapshot.traces.map((trace) => trace.id),
        memories: snapshot.memories.map((memory) => memory.id)
      },
      null,
      2
    )
  );
  assert.deepEqual(persisted.regressionFixture, submitted.regressionFixture);
  assert.equal(
    snapshot.memories.some((memory) => memory.id === submitted.correctionMemoryId),
    true
  );
  const fixtureJson = JSON.stringify(persisted.regressionFixture);
  assert.equal(fixtureJson.includes("demo-tenant"), false);
  assert.equal(fixtureJson.includes("demo-user"), false);
  assert.equal(fixtureJson.includes("trace_0706_02"), false);
  assert.equal(fixtureJson.includes(submitted.id), false);
});

test("feedback rejects sensitive corrections safely and remains recoverable", async () => {
  resetDashboardMemoryBackendForTest();

  const rejected = await submitTraceFeedback(
    jsonRequest("POST", {
      rating: "unhelpful",
      correction: "password=synthetic-sensitive-fixture-value-12345"
    }),
    traceContext("trace_0706_02")
  );
  assert.equal(rejected.status, 400);
  const rejectedBody = (await rejected.json()) as { code: string; error: string };
  assert.equal(rejectedBody.code, "sensitive_data_rejected");
  assert.equal(JSON.stringify(rejectedBody).includes("synthetic-sensitive"), false);
  assert.equal(JSON.stringify(rejectedBody).includes("password"), false);

  const recovered = await submitTraceFeedback(
    jsonRequest("POST", {
      rating: "unhelpful",
      correction: "Verify the official eligibility rules before ranking."
    }),
    traceContext("trace_0706_02")
  );
  assert.equal(recovered.status, 201);
});

test("scope guard failures map to a stable non-leaking 403 response", async () => {
  const response = dashboardErrorResponse(
    new ScopeGuardError("private tenant identifier must not leak")
  );
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code: string; error: string };
  assert.equal(body.code, "handoffbase_scope_forbidden");
  assert.equal(JSON.stringify(body).includes("private tenant identifier"), false);
});

test("atomic lifecycle preconditions map to a recoverable 409 response", async () => {
  const response = dashboardErrorResponse(
    new MemoryMutationPreconditionError("memory-1", "pending", "invalidated")
  );
  assert.equal(response.status, 409);
  const body = (await response.json()) as {
    code: string;
    error: string;
    expectedStatus: string;
    actualStatus: string;
  };
  assert.equal(body.code, "memory_precondition_failed");
  assert.equal(body.expectedStatus, "pending");
  assert.equal(body.actualStatus, "invalidated");
  assert.match(body.error, /Refresh and retry/);
  assert.equal(JSON.stringify(body).includes("memory-1"), false);
});

function routeContext(memoryId: string) {
  return {
    params: Promise.resolve({ memoryId })
  };
}

function conflictContext(conflictId: string) {
  return { params: Promise.resolve({ conflictId }) };
}

function traceContext(traceId: string) {
  return { params: Promise.resolve({ traceId }) };
}

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/dashboard/memories/test", {
    method,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
