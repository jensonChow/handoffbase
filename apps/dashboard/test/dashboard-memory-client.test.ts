import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMemoryClient,
  HttpMemoryClient,
  MemoryClientError,
  type DashboardSnapshot
} from "../src/lib/memory-client";

const emptySnapshot: DashboardSnapshot = {
  runtime: {
    mode: "server_in_memory"
  },
  memories: [],
  events: [],
  traces: [],
  conflicts: [],
  feedback: []
};

test("MemoryClient defaults to same-origin HTTP and mock mode is explicit", async () => {
  const calls: Array<{
    url: string;
    method: string;
    body?: string;
    headers: Headers;
  }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? init.body : undefined,
      headers: new Headers(init.headers)
    });

    if (init.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (String(input).endsWith("/api/dashboard/memory")) {
      return Response.json(emptySnapshot);
    }

    return Response.json({ id: "memory 1" });
  };

  const client = createMemoryClient({ fetcher });
  assert.equal(client instanceof HttpMemoryClient, true);
  assert.equal(createMemoryClient({ mode: "mock" }) instanceof HttpMemoryClient, false);

  await client.listDashboard();
  await client.updateMemory("memory 1", { canonicalText: "Updated" });
  await client.approveMemory("memory 1");
  await client.invalidateMemory("memory 1", "No longer valid");
  await client.deleteMemory("memory 1", "User requested deletion");

  assert.deepEqual(
    calls.map(({ url, method }) => ({ url, method })),
    [
      { url: "/api/dashboard/memory", method: "GET" },
      { url: "/api/dashboard/memories/memory%201", method: "PATCH" },
      { url: "/api/dashboard/memories/memory%201/approve", method: "POST" },
      { url: "/api/dashboard/memories/memory%201/invalidate", method: "POST" },
      { url: "/api/dashboard/memories/memory%201", method: "DELETE" }
    ]
  );
  assert.deepEqual(JSON.parse(calls[1]?.body ?? "{}"), {
    canonicalText: "Updated"
  });
  assert.deepEqual(JSON.parse(calls[3]?.body ?? "{}"), {
    reason: "No longer valid"
  });
  assert.deepEqual(JSON.parse(calls[4]?.body ?? "{}"), {
    reason: "User requested deletion"
  });
  assert.equal(calls[0]?.headers.has("authorization"), false);
  assert.equal(calls[1]?.headers.get("content-type"), "application/json");
});

test("HTTP failures preserve safe API error classification", async () => {
  const configuredClient = new HttpMemoryClient({
    fetcher: async () =>
      Response.json(
        {
          code: "dashboard_configuration_error",
          error: "The dashboard memory store is not configured."
        },
        { status: 503 }
      )
  });

  await assert.rejects(
    configuredClient.listDashboard(),
    (error: unknown) => {
      assert.equal(error instanceof MemoryClientError, true);
      assert.equal((error as MemoryClientError).status, 503);
      assert.equal(
        (error as MemoryClientError).code,
        "dashboard_configuration_error"
      );
      return true;
    }
  );

  const fallbackClient = new HttpMemoryClient({
    fetcher: async () => new Response("unavailable", { status: 502 })
  });
  await assert.rejects(
    fallbackClient.listDashboard(),
    /Memory dashboard API failed with 502/
  );
});

test("session, conflict, and feedback calls use same-origin cookies and runtime JSON", async () => {
  const calls: Array<{
    url: string;
    method: string;
    body?: string;
    credentials?: RequestCredentials;
    headers: Headers;
  }> = [];
  const client = new HttpMemoryClient({
    fetcher: async (input, init = {}) => {
      const url = String(input);
      calls.push({
        url,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? init.body : undefined,
        credentials: init.credentials,
        headers: new Headers(init.headers)
      });
      if (init.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/session")) {
        return Response.json({
          authenticated: true,
          authMode: "api_key",
          caller: {
            tenantId: "tenant-a",
            userId: "user-a",
            actorType: "dashboard",
            actorId: "user-a"
          }
        });
      }
      if (url.includes("/conflicts/")) {
        return Response.json({
          conflictId: "conflict 1",
          action: "keep_both",
          status: "resolved",
          eventIds: [],
          resolvedAt: "2026-07-10T00:00:00.000Z"
        });
      }
      return Response.json({
        id: "feedback-1",
        traceId: "trace 1",
        rating: "unhelpful",
        correction: "Use the verified constraint.",
        createdAt: "2026-07-10T00:00:00.000Z",
        regressionFixture: {
          schema_version: "1",
          target: "trace",
          signal: "unhelpful",
          scope_dimensions: ["tenant", "user"],
          correction: "Use the verified constraint."
        }
      });
    }
  });

  await client.getSession();
  await client.login("private-api-key");
  await client.logout();
  await client.resolveConflict("conflict 1", {
    action: "keep_both",
    reason: "Both facts remain valid in distinct contexts."
  });
  await client.submitTraceFeedback("trace 1", {
    rating: "unhelpful",
    correction: "Use the verified constraint."
  });

  assert.deepEqual(
    calls.map(({ url, method }) => ({ url, method })),
    [
      { url: "/api/dashboard/session", method: "GET" },
      { url: "/api/dashboard/session", method: "POST" },
      { url: "/api/dashboard/session", method: "DELETE" },
      { url: "/api/dashboard/conflicts/conflict%201/resolve", method: "POST" },
      { url: "/api/dashboard/traces/trace%201/feedback", method: "POST" }
    ]
  );
  assert.equal(calls.every((call) => call.credentials === "same-origin"), true);
  assert.equal(calls.every((call) => !call.headers.has("authorization")), true);
  assert.deepEqual(JSON.parse(calls[1]?.body ?? "{}"), {
    apiKey: "private-api-key"
  });
  assert.deepEqual(JSON.parse(calls[3]?.body ?? "{}"), {
    action: "keep_both",
    reason: "Both facts remain valid in distinct contexts."
  });
  assert.deepEqual(JSON.parse(calls[4]?.body ?? "{}"), {
    rating: "unhelpful",
    correction: "Use the verified constraint."
  });
});

test("browser client source contains no public auth or database configuration", async () => {
  const source = await readFile(
    new URL("../src/lib/memory-client.ts", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("NEXT_PUBLIC_"), false);
  assert.equal(/authorization|database_url|postgres_url|auth_token/i.test(source), false);
  assert.equal(/localStorage|sessionStorage/.test(source), false);
});
