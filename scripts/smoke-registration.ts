import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import { startHttpServer } from "../src/http.js";
import { registrationManifest } from "../src/mcp/manifest.js";

const manifest = registrationManifest();
const started = await startHttpServer({ host: "127.0.0.1", port: 0 });
const client = new Client({
  name: "handoffbase-registration-smoke",
  version: "0.1.0",
});
const transport = new StreamableHTTPClientTransport(new URL(started.url));

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const prompts = await client.listPrompts();
  const resources = await client.listResources();
  const resourceTemplates = await client.listResourceTemplates();

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

  console.log(
    `registered ${tools.tools.length} tools, ${
      resources.resources.length + resourceTemplates.resourceTemplates.length
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
