#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFile } from "node:fs/promises";

const endpoint = process.env.MCP_ENDPOINT;
const authToken = process.env.MCP_AUTH_TOKEN;

if (!endpoint) {
  fail("Set MCP_ENDPOINT to the deployed /mcp URL.");
}

const endpointUrl = parseUrl(endpoint, "MCP_ENDPOINT");
const healthUrl = new URL("/health", endpointUrl);
const requestInit = authToken
  ? {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  : undefined;

const healthResponse = await fetch(healthUrl);
if (!healthResponse.ok) {
  fail(`GET /health returned HTTP ${healthResponse.status}.`);
}

const health = await healthResponse.json();
assertField(health, "authMode", "api_key");
assertField(health, "providerMode", "qwen");
assertField(health, "storeMode", "in-memory");

const client = new Client({
  name: "handoffbase-remote-validator",
  version: "0.1.0",
});
const transport = new StreamableHTTPClientTransport(endpointUrl, { requestInit });

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  for (const expected of ["continuity_bootstrap", "memory_recall", "memory_remember", "memory_trace"]) {
    if (!toolNames.includes(expected)) {
      fail(`tools/list did not include ${expected}.`);
    }
  }

  const recall = await client.callTool({
    name: "memory_recall",
    arguments: await readPayload("examples/http/payloads/memory-recall-rank-opportunities.json"),
  });
  const recallSummary = summarizeRecall(recall.structuredContent);

  const remember = await client.callTool({
    name: "memory_remember",
    arguments: await readPayload("examples/http/payloads/memory-remember-preferences.json"),
  });
  const rememberSummary = summarizeRemember(remember.structuredContent);

  console.log("HandoffBase remote validation passed.");
  console.log(`Endpoint: ${redactUrl(endpointUrl)}`);
  console.log(`Health: ${JSON.stringify(pickHealth(health))}`);
  console.log(`Tools: ${toolNames.length} (${toolNames.join(", ")})`);
  console.log(`memory_recall: memories=${recallSummary.memoryCount}, trace_id=${recallSummary.hasTraceId ? "present" : "missing"}`);
  console.log(
    `memory_remember: candidate_memories=${rememberSummary.candidateCount}, statuses=${rememberSummary.statuses.join(", ") || "none"}`,
  );
} finally {
  await client.close();
}

async function readPayload(path) {
  const payload = JSON.parse(await readFile(path, "utf8"));
  return payload.arguments ?? payload;
}

function assertField(object, field, expected) {
  if (object?.[field] !== expected) {
    fail(`/health ${field} expected ${expected}, got ${String(object?.[field])}.`);
  }
}

function summarizeRecall(value) {
  const memories = Array.isArray(value?.memories) ? value.memories : [];
  return {
    memoryCount: memories.length,
    hasTraceId: typeof value?.trace_id === "string" && value.trace_id.length > 0,
  };
}

function summarizeRemember(value) {
  const candidates = Array.isArray(value?.candidate_memories) ? value.candidate_memories : [];
  const statuses = [...new Set(candidates.map((candidate) => candidate?.status).filter((status) => typeof status === "string"))].sort();
  return {
    candidateCount: candidates.length,
    statuses,
  };
}

function pickHealth(value) {
  return {
    ok: value.ok,
    name: value.name,
    version: value.version,
    transport: value.transport,
    mcpPath: value.mcpPath,
    authMode: value.authMode,
    providerMode: value.providerMode,
    storeMode: value.storeMode,
  };
}

function parseUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    fail(`${name} must be a valid URL.`);
  }
}

function redactUrl(url) {
  const safe = new URL(url);
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.toString();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
