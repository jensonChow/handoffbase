import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMemoryStore } from "@handoffbase/memory-core";
import type { DashboardSnapshot, MemoryRecord } from "../src/lib/memory-client";
import { GET } from "../src/app/api/dashboard/memory/route";
import {
  DELETE,
  PATCH
} from "../src/app/api/dashboard/memories/[memoryId]/route";
import { POST as approveMemory } from "../src/app/api/dashboard/memories/[memoryId]/approve/route";
import { POST as invalidateMemory } from "../src/app/api/dashboard/memories/[memoryId]/invalidate/route";
import { resetDashboardMemoryBackendForTest } from "../src/lib/server/dashboard-memory-store";

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
    "Rejected from route test."
  );
  assert.equal(
    snapshot.events.some(
      (event) => event.memoryId === "mem_pending_004" && event.eventType === "approved"
    ),
    true
  );
  assert.equal(
    snapshot.events.some(
      (event) => event.memoryId === "mem_tool_003" && event.eventType === "invalidated"
    ),
    true
  );

  const secondRefresh = (await (await GET()).json()) as DashboardSnapshot;
  assert.deepEqual(secondRefresh.memories, snapshot.memories);
});

test("an injected shared store is scoped, unseeded, and created once", async () => {
  const store = new InMemoryMemoryStore();

  await store.addMemory({
    id: "shared_memory_001",
    scope: {
      tenantId: "tenant_shared",
      userId: "user_shared",
      projectId: "project_shared"
    },
    type: "project_fact",
    canonicalText: "This record came from the injected shared store.",
    sourceKind: "manual_import"
  });
  await store.addMemory({
    id: "other_user_memory",
    scope: {
      tenantId: "tenant_shared",
      userId: "other_user"
    },
    type: "project_fact",
    canonicalText: "This record must stay outside the dashboard scope.",
    sourceKind: "manual_import"
  });

  let factoryCalls = 0;
  resetDashboardMemoryBackendForTest(async () => {
    factoryCalls += 1;
    return {
      store,
      mode: "shared_persistent_store",
      scope: {
        tenantId: "tenant_shared",
        userId: "user_shared"
      },
      seedDemoData: false,
      loadMemories: async ({ store: boundStore }) =>
        boundStore.listMemories({ includeExpiredByValidity: true })
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
  assert.equal(snapshot.traces.length, 0);
  assert.equal(snapshot.conflicts.length, 0);

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
});

function routeContext(memoryId: string) {
  return {
    params: Promise.resolve({ memoryId })
  };
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
