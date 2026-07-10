import { InMemoryMemoryStore, MockMemoryProvider } from "@handoffbase/memory-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import { startHttpServer } from "../../dist/http.js";
import { ContinuityMemoryService } from "../../dist/services/continuity-memory-service.js";

export const CROSS_HOST_FIXTURE = Object.freeze({
  tenantId: "cross-host-tenant",
  userId: "cross-host-user",
  agentProfileId: "coding-agent",
  projectAlphaId: "project-alpha",
  projectBetaId: "project-beta",
  hostAId: "host-a",
  hostBId: "host-b",
  hostCId: "host-c",
  preferenceText: "The user prefers concise progress summaries followed by one suggested next action.",
  procedureText: "For project alpha, always run the local check suite and report exact results before handoff.",
});

const API_KEYS = Object.freeze({
  hostA: "cross-host-a-fixture-key",
  hostB: "cross-host-b-fixture-key",
  hostC: "cross-host-c-fixture-key",
});

const EXPECTED_TOOLS = [
  "continuity_bootstrap",
  "memory_forget",
  "memory_recall",
  "memory_reflect",
  "memory_remember",
  "memory_resolve_conflict",
  "memory_trace",
  "memory_update",
];

export async function runCrossHostScenario() {
  const service = new ContinuityMemoryService({
    store: new InMemoryMemoryStore(),
    provider: new MockMemoryProvider(),
    seedDemoMemories: false,
  });
  const started = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    authConfig: explicitAuthConfig(),
    service,
  });
  const clients = [];

  try {
    const endpoint = new URL(started.url);
    assert.equal(endpoint.hostname, "127.0.0.1", "E2E endpoint stays on loopback");
    assert.notEqual(endpoint.port, "0", "server resolves an ephemeral port");

    const health = await readHealth(started.url);
    assert.deepEqual(
      pick(health, ["ok", "transport", "authMode", "providerMode", "storeMode"]),
      {
        ok: true,
        transport: "streamable-http",
        authMode: "api_key",
        providerMode: "mock",
        storeMode: "in-memory",
      },
      "health reports the deterministic authenticated runtime",
    );

    const authBoundary = await assertMissingKeyJsonRpcError(started.url);
    const hostB = await connectClient(started.url, "handoffbase-host-b", API_KEYS.hostB);
    clients.push(hostB);

    const tools = await hostB.client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    assert.equal(tools.tools.length, EXPECTED_TOOLS.length, "tools/list returns exactly the 8-tool surface");
    assert.deepEqual([...toolNames].sort(), [...EXPECTED_TOOLS].sort(), "tools/list matches the exact 8-tool surface");

    const hostBScopes = {
      tenant_id: CROSS_HOST_FIXTURE.tenantId,
      user_id: CROSS_HOST_FIXTURE.userId,
      agent_profile_id: CROSS_HOST_FIXTURE.agentProfileId,
      host_id: CROSS_HOST_FIXTURE.hostBId,
      project_id: CROSS_HOST_FIXTURE.projectAlphaId,
      session_id: "host-b-session",
    };
    const baseline = await callStructuredTool(hostB.client, "memory_recall", {
      query: "Continue project alpha using saved user guidance and project procedures.",
      scopes: hostBScopes,
      types: ["user_preference", "procedure"],
      limit: 8,
      token_budget: 512,
    });
    assert.deepEqual(baseline.memories, [], "Host B starts without continuity memory");
    assert.equal(baseline.context_block, "", "Host B starts without a context block");
    assertNonEmptyString(baseline.trace_id, "baseline recall trace id");

    const hostA = await connectClient(started.url, "handoffbase-host-a", API_KEYS.hostA);
    clients.push(hostA);
    const commonWriteScopes = {
      tenant_id: CROSS_HOST_FIXTURE.tenantId,
      user_id: CROSS_HOST_FIXTURE.userId,
    };

    const rememberedPreference = await callStructuredTool(hostA.client, "memory_remember", {
      source: "explicit_user_request",
      content: CROSS_HOST_FIXTURE.preferenceText,
      scopes: commonWriteScopes,
      approval_mode: "active",
    });
    const preference = requireSingleCandidate(rememberedPreference, "user_preference");

    const rememberedProcedure = await callStructuredTool(hostA.client, "memory_remember", {
      source: "explicit_user_request",
      content: CROSS_HOST_FIXTURE.procedureText,
      scopes: {
        ...commonWriteScopes,
        project_id: CROSS_HOST_FIXTURE.projectAlphaId,
      },
      approval_mode: "active",
    });
    const procedure = requireSingleCandidate(rememberedProcedure, "procedure");

    const bootstrap = await callStructuredTool(hostB.client, "continuity_bootstrap", {
      host: CROSS_HOST_FIXTURE.hostBId,
      agent_profile: CROSS_HOST_FIXTURE.agentProfileId,
      user_id: CROSS_HOST_FIXTURE.userId,
      project: { id: CROSS_HOST_FIXTURE.projectAlphaId },
      session_id: "host-b-session",
      task_hint: "Continue project alpha using saved user guidance and project procedures.",
      token_budget: 512,
    });
    assert.ok(
      bootstrap.context_pack.user.includes(CROSS_HOST_FIXTURE.preferenceText),
      "Host B bootstrap receives Host A's user preference",
    );
    assert.ok(
      bootstrap.context_pack.procedures.includes(CROSS_HOST_FIXTURE.procedureText),
      "Host B bootstrap receives Host A's project procedure",
    );
    assertNonEmptyString(bootstrap.memory_trace_id, "bootstrap trace id");

    const recalled = await callStructuredTool(hostB.client, "memory_recall", {
      query: "Continue project alpha using saved user guidance and project procedures.",
      scopes: hostBScopes,
      types: ["user_preference", "procedure"],
      limit: 8,
      token_budget: 512,
    });
    const recalledIds = recalled.memories.map((memory) => memory.id);
    assertSameIds(recalledIds, [preference.id, procedure.id], "Host B recall memory ids");
    assert.ok(recalled.context_block.includes(CROSS_HOST_FIXTURE.preferenceText));
    assert.ok(recalled.context_block.includes(CROSS_HOST_FIXTURE.procedureText));
    assertNonEmptyString(recalled.trace_id, "Host B recall trace id");

    const rawTrace = await readJsonResource(hostB.client, `memory://traces/${recalled.trace_id}`);
    assert.equal(rawTrace.metadata?.stage, "context_pack", "recall id points to the context-pack trace");
    assert.equal(rawTrace.metadata?.token_budget, 512, "trace records the context budget");
    assertSameIds(rawTrace.selectedMemoryIds, [preference.id, procedure.id], "context trace selected ids");
    assert.ok(rawTrace.contextPack.includes(CROSS_HOST_FIXTURE.preferenceText));
    assert.ok(rawTrace.contextPack.includes(CROSS_HOST_FIXTURE.procedureText));
    assertNonEmptyString(rawTrace.metadata?.retrieval_trace_id, "linked retrieval trace id");

    const rawRetrievalTrace = await readJsonResource(
      hostB.client,
      `memory://traces/${rawTrace.metadata.retrieval_trace_id}`,
    );
    assert.equal(rawRetrievalTrace.metadata?.stage, "memory_recall");
    assertSameIds(rawRetrievalTrace.selectedMemoryIds, [preference.id, procedure.id], "retrieval trace selected ids");
    assert.deepEqual(rawRetrievalTrace.ignoredMemoryIds, []);

    const explainedTrace = await callStructuredTool(hostB.client, "memory_trace", {
      trace_id: recalled.trace_id,
    });
    assertSameIds(
      explainedTrace.used_memories.map((memory) => memory.memory_id),
      [preference.id, procedure.id],
      "memory_trace used ids",
    );
    assert.deepEqual(explainedTrace.ignored_memories, []);
    assert.deepEqual(explainedTrace.excluded_memories, []);

    const hostC = await connectClient(started.url, "handoffbase-host-c", API_KEYS.hostC);
    clients.push(hostC);
    const isolatedBootstrap = await callStructuredTool(hostC.client, "continuity_bootstrap", {
      host: CROSS_HOST_FIXTURE.hostCId,
      agent_profile: CROSS_HOST_FIXTURE.agentProfileId,
      user_id: CROSS_HOST_FIXTURE.userId,
      project: { id: CROSS_HOST_FIXTURE.projectBetaId },
      session_id: "host-c-session",
      task_hint: "Continue project beta with any applicable user preference.",
      token_budget: 512,
    });
    assert.ok(
      isolatedBootstrap.context_pack.user.includes(CROSS_HOST_FIXTURE.preferenceText),
      "Host C can receive the user-scoped preference",
    );
    assert.ok(
      !Object.values(isolatedBootstrap.context_pack).flat().includes(CROSS_HOST_FIXTURE.procedureText),
      "Host C cannot receive Project Alpha's procedure",
    );
    assert.deepEqual(isolatedBootstrap.context_pack.procedures, []);

    const isolatedRecall = await callStructuredTool(hostC.client, "memory_recall", {
      query: "Which project procedure applies?",
      scopes: {
        tenant_id: CROSS_HOST_FIXTURE.tenantId,
        user_id: CROSS_HOST_FIXTURE.userId,
        agent_profile_id: CROSS_HOST_FIXTURE.agentProfileId,
        host_id: CROSS_HOST_FIXTURE.hostCId,
        project_id: CROSS_HOST_FIXTURE.projectBetaId,
        session_id: "host-c-session",
      },
      types: ["procedure"],
      limit: 8,
      token_budget: 512,
    });
    assert.deepEqual(isolatedRecall.memories, [], "Project Beta recall cannot receive Project Alpha procedure");
    assert.equal(isolatedRecall.context_block, "");

    const forbiddenProjectRecall = await callExpectedToolError(hostC.client, "memory_recall", {
      query: "Attempt to access Project Alpha procedure from Host C.",
      scopes: {
        tenant_id: CROSS_HOST_FIXTURE.tenantId,
        user_id: CROSS_HOST_FIXTURE.userId,
        agent_profile_id: CROSS_HOST_FIXTURE.agentProfileId,
        host_id: CROSS_HOST_FIXTURE.hostCId,
        project_id: CROSS_HOST_FIXTURE.projectAlphaId,
        session_id: "host-c-session",
      },
      types: ["procedure"],
      limit: 8,
      token_budget: 512,
    });
    assert.match(forbiddenProjectRecall, /not authorized.*project-alpha/i);
    assert.ok(!forbiddenProjectRecall.includes(procedure.id), "authorization error does not leak the memory id");
    assert.ok(
      !forbiddenProjectRecall.includes(CROSS_HOST_FIXTURE.procedureText),
      "authorization error does not leak the memory text",
    );

    const forgotten = await callStructuredTool(hostB.client, "memory_forget", {
      memory_id: procedure.id,
      mode: "invalidate",
      reason: "Project procedure was retired for this deterministic E2E proof.",
    });
    assert.equal(forgotten.memory_id, procedure.id);
    assert.equal(forgotten.mode, "invalidate");
    assert.equal(forgotten.status, "invalidated");
    assertNonEmptyString(forgotten.event_id, "forget event id");

    const afterForget = await callStructuredTool(hostB.client, "memory_recall", {
      query: "Continue project alpha using saved user guidance and project procedures.",
      scopes: hostBScopes,
      types: ["user_preference", "procedure"],
      limit: 8,
      token_budget: 512,
    });
    assertSameIds(
      afterForget.memories.map((memory) => memory.id),
      [preference.id],
      "later Host B recall excludes invalidated procedure",
    );
    assert.ok(afterForget.context_block.includes(CROSS_HOST_FIXTURE.preferenceText));
    assert.ok(!afterForget.context_block.includes(CROSS_HOST_FIXTURE.procedureText));

    const rawAfterForgetTrace = await readJsonResource(hostB.client, `memory://traces/${afterForget.trace_id}`);
    assert.equal(rawAfterForgetTrace.metadata?.stage, "context_pack");
    assertSameIds(rawAfterForgetTrace.selectedMemoryIds, [preference.id], "post-forget context trace selected ids");
    assertNonEmptyString(rawAfterForgetTrace.metadata?.retrieval_trace_id, "post-forget retrieval trace id");

    const postForgetTrace = await callStructuredTool(hostB.client, "memory_trace", {
      trace_id: afterForget.trace_id,
    });
    assertSameIds(
      postForgetTrace.used_memories.map((memory) => memory.memory_id),
      [preference.id],
      "post-forget context trace uses only the preference",
    );
    assert.ok(!traceMemoryIds(postForgetTrace).includes(procedure.id));

    const rawAfterForgetRetrieval = await readJsonResource(
      hostB.client,
      `memory://traces/${rawAfterForgetTrace.metadata.retrieval_trace_id}`,
    );
    assertSameIds(rawAfterForgetRetrieval.selectedMemoryIds, [preference.id], "post-forget retrieval selected ids");
    assertSameIds(rawAfterForgetRetrieval.ignoredMemoryIds, [procedure.id], "post-forget retrieval ignored ids");

    const explainedAfterForgetRetrieval = await callStructuredTool(hostB.client, "memory_trace", {
      trace_id: rawAfterForgetTrace.metadata.retrieval_trace_id,
    });
    assertSameIds(
      explainedAfterForgetRetrieval.used_memories.map((memory) => memory.memory_id),
      [preference.id],
      "post-forget retrieval trace still uses the preference",
    );
    assertSameIds(
      explainedAfterForgetRetrieval.ignored_memories.map((memory) => memory.memory_id),
      [procedure.id],
      "post-forget retrieval trace explains the invalidated procedure",
    );
    assert.match(
      explainedAfterForgetRetrieval.ignored_memories[0].reason,
      /lifecycle|validity/i,
      "trace explains lifecycle exclusion",
    );

    return {
      runtime: {
        loopback: endpoint.hostname === "127.0.0.1",
        ephemeralPort: Number(endpoint.port),
        health,
      },
      authBoundary,
      tools: { count: tools.tools.length, names: toolNames.sort() },
      baseline: { memoryCount: baseline.memories.length, traceId: baseline.trace_id },
      hostA: {
        preference: pick(preference, ["id", "type", "status"]),
        procedure: pick(procedure, ["id", "type", "status"]),
      },
      hostB: {
        bootstrap: {
          contextPack: bootstrap.context_pack,
          traceId: bootstrap.memory_trace_id,
        },
        recall: {
          memoryIds: recalledIds,
          contextBlock: recalled.context_block,
          traceId: recalled.trace_id,
        },
        trace: {
          selectedMemoryIds: rawTrace.selectedMemoryIds,
          usedMemoryIds: explainedTrace.used_memories.map((memory) => memory.memory_id),
          retrievalTraceId: rawTrace.metadata.retrieval_trace_id,
        },
      },
      hostC: {
        userPreferenceVisible: isolatedBootstrap.context_pack.user.includes(CROSS_HOST_FIXTURE.preferenceText),
        projectProcedureVisible: Object.values(isolatedBootstrap.context_pack)
          .flat()
          .includes(CROSS_HOST_FIXTURE.procedureText),
        procedureRecallCount: isolatedRecall.memories.length,
        projectAlphaAccessDenied: true,
      },
      forgetting: {
        memoryId: forgotten.memory_id,
        status: forgotten.status,
        eventId: forgotten.event_id,
        laterMemoryIds: afterForget.memories.map((memory) => memory.id),
        laterTraceId: afterForget.trace_id,
        laterUsedMemoryIds: postForgetTrace.used_memories.map((memory) => memory.memory_id),
        retrievalTraceId: rawAfterForgetTrace.metadata.retrieval_trace_id,
        retrievalIgnoredMemoryIds: rawAfterForgetRetrieval.ignoredMemoryIds,
        retrievalIgnoredReasons: explainedAfterForgetRetrieval.ignored_memories.map((memory) => memory.reason),
      },
    };
  } finally {
    await Promise.allSettled(clients.reverse().map(({ client }) => client.close()));
    await started.close();
  }
}

function explicitAuthConfig() {
  const caller = (actorId, allowedProjectIds) => ({
    tenantId: CROSS_HOST_FIXTURE.tenantId,
    userId: CROSS_HOST_FIXTURE.userId,
    actorType: "mcp_host",
    actorId,
    ...(allowedProjectIds ? { allowedProjectIds } : {}),
  });

  return {
    mode: "api_key",
    apiKeys: {
      [API_KEYS.hostA]: caller(CROSS_HOST_FIXTURE.hostAId),
      [API_KEYS.hostB]: caller(CROSS_HOST_FIXTURE.hostBId),
      [API_KEYS.hostC]: caller(CROSS_HOST_FIXTURE.hostCId, [CROSS_HOST_FIXTURE.projectBetaId]),
    },
  };
}

async function connectClient(url, name, apiKey) {
  const client = new Client({ name, version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  });
  try {
    await client.connect(transport);
    return { client, transport };
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  }
}

async function callStructuredTool(client, name, arguments_) {
  const result = await client.callTool({ name, arguments: arguments_ });
  assert.notEqual(result.isError, true, `${name} returns a successful MCP tool result`);
  assert.ok(isRecord(result.structuredContent), `${name} returns structuredContent`);

  const textPart = result.content.find((part) => part.type === "text");
  assert.ok(textPart && "text" in textPart, `${name} returns JSON text content`);
  const textPayload = JSON.parse(textPart.text);
  const structuredPayload = JSON.parse(JSON.stringify(result.structuredContent));
  assert.deepEqual(textPayload, structuredPayload, `${name} text and structured MCP payloads agree`);
  return structuredPayload;
}

async function callExpectedToolError(client, name, arguments_) {
  const result = await client.callTool({ name, arguments: arguments_ });
  assert.equal(result.isError, true, `${name} returns an MCP tool error`);
  const message = result.content
    .filter((part) => part.type === "text" && "text" in part)
    .map((part) => part.text)
    .join("\n");
  assertNonEmptyString(message, `${name} error message`);
  return message;
}

async function readJsonResource(client, uri) {
  const result = await client.readResource({ uri });
  assert.equal(result.contents.length, 1, `${uri} returns one MCP resource content item`);
  const content = result.contents[0];
  assert.equal(content.uri, uri);
  assert.equal(content.mimeType, "application/json");
  assert.ok("text" in content && typeof content.text === "string", `${uri} returns JSON text`);
  return JSON.parse(content.text);
}

async function readHealth(mcpUrl) {
  const response = await fetch(new URL("/health", mcpUrl));
  assert.equal(response.status, 200, "health endpoint returns HTTP 200");
  return await response.json();
}

async function assertMissingKeyJsonRpcError(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "cross-host-auth-check",
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(response.status, 401, "missing API key is rejected at the HTTP boundary");
  const payload = await response.json();
  assert.deepEqual(payload, {
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Missing Handoffbase API key.",
    },
    id: null,
  });
  return { httpStatus: response.status, jsonRpcCode: payload.error.code };
}

function requireSingleCandidate(payload, expectedType) {
  assert.equal(payload.candidate_memories.length, 1, `${expectedType} remember returns one candidate`);
  const candidate = payload.candidate_memories[0];
  assertNonEmptyString(candidate.id, `${expectedType} memory id`);
  assert.equal(candidate.type, expectedType);
  assert.equal(candidate.status, "active");
  return candidate;
}

function traceMemoryIds(trace) {
  return [trace.used_memories, trace.ignored_memories, trace.excluded_memories]
    .flat()
    .map((memory) => memory.memory_id);
}

function assertSameIds(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} is an array`);
  assert.equal(actual.length, expected.length, `${label} has the expected length`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function assertNonEmptyString(value, label) {
  assert.ok(typeof value === "string" && value.length > 0, `${label} is present`);
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
