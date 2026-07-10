import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryMemoryStore, MockMemoryProvider } from "@handoffbase/memory-core";
import assert from "node:assert/strict";
import { startHttpServer } from "../src/http.js";
import { registrationManifest } from "../src/mcp/manifest.js";
import { ContinuityMemoryService } from "../src/services/continuity-memory-service.js";

const manifest = registrationManifest();
const store = new InMemoryMemoryStore();
const service = new ContinuityMemoryService({ store, provider: new MockMemoryProvider() });
const started = await startHttpServer({
  host: "127.0.0.1",
  port: 0,
  authConfig: { mode: "disabled" },
  service,
});
const client = new Client({
  name: "handoffbase-registration-smoke",
  version: "0.1.0",
});
const transport = new StreamableHTTPClientTransport(new URL(started.url));

try {
  const healthResponse = await fetch(new URL("/health", started.url));
  assert.equal(healthResponse.status, 200, "health endpoint returns HTTP 200");
  const health = (await healthResponse.json()) as Record<string, unknown>;
  assert.equal(health.ok, true, "health reports ok");
  assert.equal(health.name, "handoffbase-mcp-server", "health reports server name");
  assert.equal(health.version, "0.1.0", "health reports server version");
  assert.equal(health.transport, "streamable-http", "health reports transport");
  assert.equal(health.mcpPath, "/mcp", "health reports MCP path");
  assert.equal(health.authMode, "disabled", "health reports default auth mode");
  assert.equal(health.providerMode, "mock", "health reports default provider mode");
  assert.equal(health.storeMode, "in-memory", "health reports default store mode");

  await client.connect(transport);

  const tools = await client.listTools();
  const prompts = await client.listPrompts();
  const resources = await client.listResources();
  const resourceTemplates = await client.listResourceTemplates();
  const resourceCount = resources.resources.length + resourceTemplates.resourceTemplates.length;

  assert.equal(tools.tools.length, 8, "smoke expects 8 MCP tools");
  assert.equal(resourceCount, 9, "smoke expects 9 MCP resources");
  assert.equal(prompts.prompts.length, 4, "smoke expects 4 MCP prompts");

  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    [...manifest.tools].sort(),
    "registered tool names",
  );
  assert.deepEqual(
    prompts.prompts.map((prompt) => prompt.name).sort(),
    [...manifest.prompts].sort(),
    "registered prompt names",
  );
  assert.deepEqual(
    [
      ...resources.resources.map((resource) => resource.uri),
      ...resourceTemplates.resourceTemplates.map((resource) => resource.uriTemplate),
    ].sort(),
    [...manifest.resources].sort(),
    "registered resources and resource templates",
  );

  for (const tool of tools.tools) {
    assert.ok(tool.inputSchema, `${tool.name} has an input schema`);
    assert.ok(tool.outputSchema, `${tool.name} has an output schema`);
  }

  const invalidMerge = await client.callTool({
    name: "memory_resolve_conflict",
    arguments: {
      conflict_id: "missing-merge-text",
      action: "merge",
      reason: "The MCP boundary must reject merge without merged_text.",
    },
  });
  assert.equal(invalidMerge.isError, true, "merge without merged_text is rejected");
  assert.match(renderToolText(invalidMerge), /merged_text is required/);

  await client.readResource({ uri: "memory://vault/pending" });
  await client.readResource({ uri: "memory://users/smoke-user/profile" });

  const bootstrapResult = await client.callTool({
    name: "continuity_bootstrap",
    arguments: {
      host: "codex",
      agent_profile: "opportunity-scout",
      user_id: "demo-user",
      project: {
        name: "AI Opportunity Scout",
        root: "demo/opportunity-scout",
      },
      task_hint: "Rank Qwen, TRAE, and CockroachDB opportunities.",
      token_budget: 1200,
    },
  });
  const bootstrapPayload = bootstrapResult.structuredContent as {
    context_pack?: Record<string, string[]>;
    memory_trace_id?: string;
  };
  assert.ok(bootstrapPayload.context_pack?.procedures?.length, "bootstrap returns procedure context");
  assert.ok(bootstrapPayload.memory_trace_id, "bootstrap returns trace id");
  const bootstrapTrace = parseJsonResource(
    await client.readResource({ uri: `memory://traces/${bootstrapPayload.memory_trace_id}` }),
  );
  const bootstrapTraceMetadata = bootstrapTrace.metadata as Record<string, unknown> | undefined;
  assert.equal(bootstrapTraceMetadata?.stage, "context_pack", "bootstrap returns context-pack trace");
  assert.equal(typeof bootstrapTraceMetadata?.retrieval_trace_id, "string", "bootstrap trace links retrieval trace");

  const recallResult = await client.callTool({
    name: "memory_recall",
    arguments: {
      query: "Rank Qwen, TRAE, and CockroachDB opportunities for this user's AI hackathon goals.",
      scopes: {
        tenant_id: "demo-tenant",
        user_id: "demo-user",
        agent_profile_id: "opportunity-scout",
        project_id: "ai-opportunity-scout",
      },
      types: ["user_preference", "procedure", "failure_memory", "decision_memory"],
      limit: 8,
      token_budget: 900,
    },
  });
  const recallPayload = recallResult.structuredContent as {
    memories?: Array<{ id: string; type: string; text: string }>;
    context_block?: string;
    trace_id?: string;
  };
  assert.ok(recallPayload.memories?.length, "recall returns memories");
  assert.ok(recallPayload.context_block?.includes("MemoryAgent"), "recall context includes demo memory");
  assert.ok(recallPayload.trace_id, "recall returns trace id");
  const recallTrace = parseJsonResource(await client.readResource({ uri: `memory://traces/${recallPayload.trace_id}` }));
  const recallTraceMetadata = recallTrace.metadata as Record<string, unknown> | undefined;
  assert.equal(recallTraceMetadata?.stage, "context_pack", "recall returns context-pack trace");
  assert.equal(typeof recallTraceMetadata?.retrieval_trace_id, "string", "recall trace links retrieval trace");

  const traceResult = await client.callTool({
    name: "memory_trace",
    arguments: {
      trace_id: recallPayload.trace_id,
    },
  });
  const tracePayload = traceResult.structuredContent as {
    used_memories?: Array<{ memory_id: string; reason: string }>;
    ignored_memories?: Array<{ memory_id: string; reason: string }>;
  };
  assert.ok(tracePayload.used_memories?.length, "trace explains used memories");

  const tightRecallResult = await client.callTool({
    name: "memory_recall",
    arguments: {
      query: "Rank Qwen, TRAE, and CockroachDB opportunities for this user's AI hackathon goals.",
      scopes: {
        tenant_id: "demo-tenant",
        user_id: "demo-user",
        agent_profile_id: "opportunity-scout",
        project_id: "ai-opportunity-scout",
      },
      types: ["user_preference", "procedure", "failure_memory", "decision_memory"],
      limit: 8,
      token_budget: 1,
    },
  });
  const tightRecallPayload = tightRecallResult.structuredContent as {
    memories?: Array<{ id: string; type: string; text: string }>;
    context_block?: string;
    trace_id?: string;
  };
  assert.ok(tightRecallPayload.memories?.length, "tight recall still retrieves candidates");
  assert.equal(tightRecallPayload.context_block, "", "tight recall context pack is empty under budget");
  assert.ok(tightRecallPayload.trace_id, "tight recall returns trace id");

  const tightTraceResult = await client.callTool({
    name: "memory_trace",
    arguments: {
      trace_id: tightRecallPayload.trace_id,
    },
  });
  const tightTracePayload = tightTraceResult.structuredContent as {
    used_memories?: Array<{ memory_id: string; reason: string }>;
    ignored_memories?: Array<{ memory_id: string; reason: string }>;
  };
  assert.equal(tightTracePayload.used_memories?.length ?? 0, 0, "tight trace has no used memories");
  assert.deepEqual(
    (tightTracePayload.ignored_memories ?? []).map((memory) => memory.memory_id).sort(),
    tightRecallPayload.memories.map((memory) => memory.id).sort(),
    "tight trace explains provider-ignored context-pack memories",
  );

  const rememberResult = await client.callTool({
    name: "memory_remember",
    arguments: {
      source: "explicit_user_request",
      content: "Remember that demo smoke tests should verify deadline, timezone, eligibility, and trace output.",
      scopes: {
        tenant_id: "demo-tenant",
        user_id: "demo-user",
        agent_profile_id: "opportunity-scout",
      },
      approval_mode: "pending",
    },
  });
  const rememberPayload = rememberResult.structuredContent as {
    candidate_memories?: Array<{ id?: string; status?: string }>;
  };
  assert.ok(rememberPayload.candidate_memories?.[0]?.id, "remember persists a candidate memory");

  await store.addMemory({
    id: "smoke-conflict-existing",
    scope: { tenantId: "demo-tenant", userId: "demo-user", agentProfileId: "opportunity-scout" },
    type: "user_preference",
    canonicalText: "Smoke conflict existing memory.",
    rawSource: "smoke fixture",
    sourceKind: "user_statement",
    status: "active",
  });
  await store.addMemory({
    id: "smoke-conflict-candidate",
    scope: { tenantId: "demo-tenant", userId: "demo-user", agentProfileId: "opportunity-scout" },
    type: "user_preference",
    canonicalText: "Smoke conflict candidate memory.",
    rawSource: "smoke fixture",
    sourceKind: "user_correction",
    status: "pending",
  });
  await store.addConflict({
    id: "smoke-conflict",
    tenantId: "demo-tenant",
    candidateMemoryId: "smoke-conflict-candidate",
    existingMemoryId: "smoke-conflict-existing",
    conflictType: "contradiction",
    recommendedAction: "supersede_existing",
  });

  const resolutionResult = await client.callTool({
    name: "memory_resolve_conflict",
    arguments: {
      conflict_id: "smoke-conflict",
      action: "supersede_existing",
      reason: "Verify the complete conflict resolution workflow in the local smoke test.",
    },
  });
  const resolutionPayload = resolutionResult.structuredContent as {
    conflict_status?: string;
    candidate_memory?: { id?: string; status?: string; supersedes?: string[] };
    existing_memory?: { id?: string; status?: string; superseded_by?: string };
    event_ids?: string[];
  };
  assert.equal(resolutionPayload.conflict_status, "resolved", "resolution closes the conflict");
  assert.equal(resolutionPayload.candidate_memory?.status, "active", "resolution activates the candidate");
  assert.deepEqual(
    resolutionPayload.candidate_memory?.supersedes,
    ["smoke-conflict-existing"],
    "resolution links the candidate to the superseded memory",
  );
  assert.equal(resolutionPayload.existing_memory?.status, "superseded", "resolution supersedes the existing memory");
  assert.equal(
    resolutionPayload.existing_memory?.superseded_by,
    "smoke-conflict-candidate",
    "resolution records the replacement link",
  );
  assert.equal(resolutionPayload.event_ids?.length, 2, "resolution returns both lifecycle audit events");

  console.log(
    `registered ${tools.tools.length} tools, ${
      resourceCount
    } resources, ${prompts.prompts.length} prompts`,
  );
} finally {
  await transport.close();
  await new Promise<void>((resolve, reject) => {
    started.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function parseJsonResource(resource: unknown): Record<string, unknown> {
  const content = (resource as { contents?: Array<{ text?: string }> }).contents?.[0];
  const text = content?.text;
  assert.ok(typeof text === "string", "resource returns JSON text");
  return JSON.parse(text) as Record<string, unknown>;
}

function renderToolText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}
