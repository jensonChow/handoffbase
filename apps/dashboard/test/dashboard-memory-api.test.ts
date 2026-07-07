import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(snapshot.memories.length, 6);
  assert.equal(snapshot.traces.length, 2);
  assert.equal(snapshot.conflicts.length, 2);
  assert.equal(
    snapshot.memories.find((memory) => memory.id === "mem_pending_004")?.status,
    "pending"
  );
});

test("dashboard memory routes mutate the server-side store", async () => {
  resetDashboardMemoryBackendForTest();

  const patchResponse = await PATCH(
    jsonRequest("PATCH", {
      canonicalText: "Updated from the dashboard API route test."
    }),
    routeContext("mem_pending_005")
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
