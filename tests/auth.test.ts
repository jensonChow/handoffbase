import { InMemoryMemoryStore, MockMemoryProvider, type CreateMemoryInput } from "@handoffbase/memory-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { authConfigFromEnv } from "../src/auth/config.js";
import { resolveCallerContext, type HeaderReader } from "../src/auth/request.js";
import { ScopeGuardError } from "../src/auth/scope.js";
import type { AuthConfig, CallerContext } from "../src/auth/types.js";
import { startHttpServer } from "../src/http.js";
import { ContinuityMemoryService } from "../src/services/continuity-memory-service.js";

test("disabled auth mode preserves local demo behavior", async () => {
  const config = authConfigFromEnv({});
  const caller = resolveCallerContext({ headers: {} }, config);
  assert.equal(caller.authMode, "disabled");
  assert.equal(caller.tenantId, "demo-tenant");
  assert.equal(caller.userId, "demo-user");

  const service = new ContinuityMemoryService({ provider: new MockMemoryProvider() });
  const result = await service.recall({
    query: "MemoryAgent hackathon preferences",
    scopes: {
      tenant_id: "demo-tenant",
      user_id: "demo-user",
      agent_profile_id: "opportunity-scout",
    },
  });
  assert.ok(result.memories.length > 0);
});

test("api_key auth mode rejects missing and invalid API keys at the HTTP boundary", async () => {
  const started = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    authConfig: apiKeyAuthConfig(),
  });

  try {
    const missing = await postJsonRpc(started.url, {});
    assert.equal(missing.status, 401);
    assert.match(await missing.text(), /Missing Handoffbase API key/);

    const invalid = await postJsonRpc(started.url, {
      authorization: "Bearer wrong-key",
    });
    assert.equal(invalid.status, 401);
    assert.match(await invalid.text(), /Invalid Handoffbase API key/);
  } finally {
    await closeServer(started.server);
  }
});

test("api_key auth mode resolves callers from bearer, custom header, JSON env, and single-key env", () => {
  const config = authConfigFromEnv({
    HANDOFFBASE_AUTH_MODE: "api_key",
    HANDOFFBASE_API_KEYS_JSON: JSON.stringify({
      "json-key": {
        tenantId: "tenant-json",
        userId: "user-json",
        actorId: "json-actor",
        allowedProjectIds: ["project-a"],
      },
    }),
    HANDOFFBASE_API_KEY: "single-key",
    HANDOFFBASE_TENANT_ID: "tenant-single",
    HANDOFFBASE_USER_ID: "user-single",
    HANDOFFBASE_ACTOR_ID: "single-actor",
  });

  const bearerCaller = resolveCallerContext(requestWithHeaders({ authorization: "Bearer json-key" }), config);
  assert.deepEqual(
    pickCallerFields(bearerCaller),
    {
      tenantId: "tenant-json",
      userId: "user-json",
      actorType: "mcp_host",
      actorId: "json-actor",
      authMode: "api_key",
    },
  );
  assert.deepEqual(bearerCaller.allowedProjectIds, ["project-a"]);

  const headerCaller = resolveCallerContext(requestWithHeaders({ "x-handoffbase-api-key": "single-key" }), config);
  assert.deepEqual(
    pickCallerFields(headerCaller),
    {
      tenantId: "tenant-single",
      userId: "user-single",
      actorType: "mcp_host",
      actorId: "single-actor",
      authMode: "api_key",
    },
  );
});

test("memory_resolve_conflict preserves API-key caller scope through the HTTP MCP wrapper", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory({
    ...memoryInput("auth-conflict-existing", "tenant-a", "user-a"),
    status: "active",
  });
  await store.addMemory({
    ...memoryInput("auth-conflict-candidate", "tenant-a", "user-a"),
    sourceKind: "user_correction",
    status: "pending",
  });
  await store.addConflict({
    id: "auth-conflict",
    tenantId: "tenant-a",
    candidateMemoryId: "auth-conflict-candidate",
    existingMemoryId: "auth-conflict-existing",
    conflictType: "contradiction",
    recommendedAction: "ask_user",
  });
  const service = new ContinuityMemoryService({
    store,
    provider: new MockMemoryProvider(),
    seedDemoMemories: false,
  });
  const started = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    service,
    authConfig: {
      mode: "api_key",
      apiKeys: {
        "user-a-key": { tenantId: "tenant-a", userId: "user-a", actorId: "reviewer-a" },
        "user-b-key": { tenantId: "tenant-a", userId: "user-b", actorId: "reviewer-b" },
      },
    },
  });

  try {
    const denied = await callConflictResolution(started.url, "user-b-key");
    assert.equal(denied.isError, true, "another user in the tenant cannot resolve the conflict");
    assert.match(renderToolText(denied), /not authorized for user user-a/);
    assert.equal((await store.getMemory("auth-conflict-candidate"))?.status, "pending");
    assert.equal((await store.getMemory("auth-conflict-existing"))?.status, "active");
    assert.equal((await store.getConflict("auth-conflict"))?.status, "open");

    const allowed = await callConflictResolution(started.url, "user-a-key");
    assert.notEqual(allowed.isError, true);
    const payload = allowed.structuredContent as {
      conflict_status?: string;
      candidate_memory?: { status?: string };
    };
    assert.equal(payload.conflict_status, "resolved");
    assert.equal(payload.candidate_memory?.status, "active");
    assert.equal((await store.getConflict("auth-conflict"))?.status, "resolved");
    const resolutionEvent = (await store.listEvents({ memoryId: "auth-conflict-candidate" })).find(
      (event) => event.metadata.conflict_id === "auth-conflict",
    );
    assert.deepEqual(resolutionEvent?.actor, { type: "mcp_host", id: "reviewer-a" });
  } finally {
    await closeServer(started.server);
  }
});

test("HANDOFFBASE_API_KEYS_JSON parse errors never reveal raw API keys", () => {
  const rawApiKey = "synthetic-malformed-json-api-key";

  assertApiKeyConfigErrorDoesNotReveal(
    `{"${rawApiKey}":}`,
    [rawApiKey],
    /HANDOFFBASE_API_KEYS_JSON must contain valid JSON/,
  );
});

test("HANDOFFBASE_API_KEYS_JSON entry errors never reveal raw API keys", () => {
  const cases: Array<{
    label: string;
    caller: (rawApiKey: string) => unknown;
    expectedMessage: RegExp;
  }> = [
    {
      label: "non-object",
      caller: () => null,
      expectedMessage: /entry 1 must be an object/,
    },
    {
      label: "missing-tenant",
      caller: () => ({ userId: "user-a" }),
      expectedMessage: /entry 1 is missing tenantId/,
    },
    {
      label: "missing-user",
      caller: () => ({ tenantId: "tenant-a" }),
      expectedMessage: /entry 1 is missing userId/,
    },
    {
      label: "invalid-actor-type",
      caller: (rawApiKey) => ({ tenantId: "tenant-a", userId: "user-a", actorType: rawApiKey }),
      expectedMessage: /entry 1 has unsupported actorType/,
    },
  ];

  for (const item of cases) {
    const rawApiKey = `synthetic-${item.label}-api-key`;
    assertApiKeyConfigErrorDoesNotReveal(
      JSON.stringify({ [rawApiKey]: item.caller(rawApiKey) }),
      [rawApiKey],
      item.expectedMessage,
    );
  }

  const validRawApiKey = "synthetic-valid-first-api-key";
  const invalidRawApiKey = "synthetic-invalid-second-api-key";
  assertApiKeyConfigErrorDoesNotReveal(
    JSON.stringify({
      [validRawApiKey]: { tenantId: "tenant-a", userId: "user-a" },
      [invalidRawApiKey]: { tenantId: "tenant-a" },
    }),
    [validRawApiKey, invalidRawApiKey],
    /entry 2 is missing userId/,
  );
});

test("memory_update and memory_forget reject cross-tenant memory access", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory(memoryInput("mem-other-tenant", "tenant-b", "user-a"));
  const service = new ContinuityMemoryService({
    store,
    provider: new MockMemoryProvider(),
    seedDemoMemories: false,
  });
  const context = { caller: callerContext("tenant-a", "user-a") };

  await assert.rejects(
    () =>
      service.update(
        {
          memory_id: "mem-other-tenant",
          patch: { text: "changed" },
        },
        context,
      ),
    ScopeGuardError,
  );

  await assert.rejects(
    () =>
      service.forget(
        {
          memory_id: "mem-other-tenant",
          mode: "archive",
          reason: "test cross-tenant denial",
        },
        context,
      ),
    ScopeGuardError,
  );
});

test("readResource rejects cross-user profile access in api_key mode", async () => {
  const store = new InMemoryMemoryStore();
  await store.addMemory(memoryInput("mem-other-user", "tenant-a", "user-b"));
  const service = new ContinuityMemoryService({
    store,
    provider: new MockMemoryProvider(),
    seedDemoMemories: false,
  });

  await assert.rejects(
    () =>
      service.readResource(
        {
          name: "user-profile",
          uri: "memory://users/user-b/profile",
          variables: { user_id: "user-b" },
        },
        { caller: callerContext("tenant-a", "user-a") },
      ),
    ScopeGuardError,
  );
});

function apiKeyAuthConfig(): AuthConfig {
  return {
    mode: "api_key",
    apiKeys: {
      "dev-key": {
        tenantId: "tenant-a",
        userId: "user-a",
        actorId: "local-dev",
      },
    },
  };
}

function callerContext(tenantId: string, userId: string): CallerContext {
  return {
    tenantId,
    userId,
    actorType: "mcp_host",
    actorId: "test-caller",
    authMode: "api_key",
  };
}

function memoryInput(id: string, tenantId: string, userId: string): CreateMemoryInput {
  return {
    id,
    scope: { tenantId, userId },
    type: "user_preference",
    canonicalText: `Preference for ${tenantId}/${userId}.`,
    rawSource: "auth test",
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.9,
    importance: 0.8,
  };
}

function requestWithHeaders(headers: Record<string, string>): HeaderReader {
  return {
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function pickCallerFields(caller: CallerContext) {
  return {
    tenantId: caller.tenantId,
    userId: caller.userId,
    actorType: caller.actorType,
    actorId: caller.actorId,
    authMode: caller.authMode,
  };
}

function assertApiKeyConfigErrorDoesNotReveal(
  apiKeysJson: string,
  rawApiKeys: string[],
  expectedMessage: RegExp,
): void {
  assert.throws(
    () =>
      authConfigFromEnv({
        HANDOFFBASE_AUTH_MODE: "api_key",
        HANDOFFBASE_API_KEYS_JSON: apiKeysJson,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, expectedMessage);

      const renderedError = `${error.message}\n${error.stack ?? ""}`;
      for (const rawApiKey of rawApiKeys) {
        assert.equal(renderedError.includes(rawApiKey), false, "configuration error must not reveal a raw API key");
      }
      return true;
    },
  );
}

async function callConflictResolution(url: string, apiKey: string) {
  const client = new Client({
    name: "handoffbase-auth-resolution-test",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    },
  });

  try {
    await client.connect(transport);
    return await client.callTool({
      name: "memory_resolve_conflict",
      arguments: {
        conflict_id: "auth-conflict",
        action: "accept_candidate",
        reason: "Accept the authorized user's candidate memory.",
      },
    });
  } finally {
    await transport.close();
  }
}

function renderToolText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

async function postJsonRpc(url: string, headers: Record<string, string>): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "auth-test",
      method: "tools/list",
      params: {},
    }),
  });
}

async function closeServer(server: { close(callback: (error?: Error) => void): void }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
