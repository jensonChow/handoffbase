import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import { startHttpServer } from "../src/http.js";
import { registrationManifest } from "../src/mcp/manifest.js";

const manifest = registrationManifest();
const started = await startHttpServer({ host: "127.0.0.1", port: 0 });
const client = new Client({
  name: "agent-continuity-registration-smoke",
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

  const traceResult = await client.callTool({
    name: "memory_trace",
    arguments: {
      trace_id: recallPayload.trace_id,
    },
  });
  const tracePayload = traceResult.structuredContent as {
    used_memories?: Array<{ memory_id: string; reason: string }>;
  };
  assert.ok(tracePayload.used_memories?.length, "trace explains used memories");

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
