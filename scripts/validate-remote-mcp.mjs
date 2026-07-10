#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { registrationManifest } from "../dist/mcp/manifest.js";

export const VALIDATION_PROFILES = Object.freeze({
  generic: Object.freeze({}),
  "alibaba-demo": Object.freeze({
    authMode: "api_key",
    providerMode: "qwen",
    storeMode: "in-memory",
  }),
});

export class RemoteValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RemoteValidationError";
  }
}

export function resolveValidationExpectations(env = process.env) {
  const profileName = readOptional(env.MCP_VALIDATION_PROFILE) ?? "generic";
  const profile = VALIDATION_PROFILES[profileName];
  if (!profile) {
    throw new RemoteValidationError(
      `Unsupported MCP_VALIDATION_PROFILE: ${profileName}. Use one of: ${Object.keys(VALIDATION_PROFILES).join(", ")}.`,
    );
  }

  return {
    profile: profileName,
    authMode: readOptional(env.EXPECTED_AUTH_MODE) ?? profile.authMode,
    providerMode: readOptional(env.EXPECTED_PROVIDER_MODE) ?? profile.providerMode,
    storeMode: readOptional(env.EXPECTED_STORE_MODE) ?? profile.storeMode,
  };
}

export function assertExpectedHealth(health, expectations) {
  assertField(health, "ok", true);
  assertField(health, "name", "handoffbase-mcp-server");
  assertField(health, "transport", "streamable-http");

  for (const field of ["authMode", "providerMode", "storeMode"]) {
    const expected = expectations[field];
    if (expected !== undefined) {
      assertField(health, field, expected);
    }
  }
}

export function assertExactToolManifest(actualToolNames, expectedToolNames = registrationManifest().tools) {
  const actual = [...actualToolNames].sort();
  const expected = [...expectedToolNames].sort();
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    return;
  }

  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((name) => !actualSet.has(name));
  const unexpected = actual.filter((name) => !expectedSet.has(name));
  const details = [
    missing.length > 0 ? `missing=${missing.join(",")}` : undefined,
    unexpected.length > 0 ? `unexpected=${unexpected.join(",")}` : undefined,
    actual.length !== expected.length ? `count=${actual.length},expected=${expected.length}` : undefined,
  ].filter(Boolean);

  throw new RemoteValidationError(`tools/list does not match the current HandoffBase manifest (${details.join("; ")}).`);
}

export function summarizeReadiness(readiness) {
  if (readiness?.ok !== true || !readiness.checks?.store || !readiness.checks?.provider) {
    throw new RemoteValidationError("GET /ready returned an invalid readiness payload.");
  }

  return {
    store: summarizeReadinessCheck(readiness.checks.store, "store"),
    provider: summarizeReadinessCheck(readiness.checks.provider, "provider"),
  };
}

export async function validateRemoteMcp(env = process.env) {
  const endpoint = readOptional(env.MCP_ENDPOINT);
  if (!endpoint) {
    throw new RemoteValidationError("Set MCP_ENDPOINT to the deployed /mcp URL.");
  }

  const endpointUrl = parseUrl(endpoint, "MCP_ENDPOINT");
  const authToken = readOptional(env.MCP_AUTH_TOKEN);
  const expectations = resolveValidationExpectations(env);
  const healthUrl = new URL("/health", endpointUrl);
  const readinessUrl = new URL("/ready", endpointUrl);
  const requestInit = authToken
    ? {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    : undefined;

  const healthResponse = await fetch(healthUrl);
  if (!healthResponse.ok) {
    throw new RemoteValidationError(`GET /health returned HTTP ${healthResponse.status}.`);
  }

  const health = await healthResponse.json();
  assertExpectedHealth(health, expectations);
  if (health.authMode === "api_key" && !authToken) {
    throw new RemoteValidationError("The server requires API-key auth; set MCP_AUTH_TOKEN in the shell or secret manager.");
  }

  const skipReadiness = env.MCP_SKIP_READINESS === "1";
  let readinessSummary;
  if (!skipReadiness) {
    const readinessResponse = await fetch(readinessUrl, requestInit);
    if (readinessResponse.status !== 200) {
      throw new RemoteValidationError(`GET /ready returned HTTP ${readinessResponse.status}.`);
    }
    readinessSummary = summarizeReadiness(await readinessResponse.json());
  }

  const client = new Client({
    name: "handoffbase-remote-validator",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(endpointUrl, { requestInit });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    assertExactToolManifest(toolNames);

    const recall = await client.callTool({
      name: "memory_recall",
      arguments: await readPayload("examples/http/payloads/memory-recall-rank-opportunities.json"),
    });
    const recallSummary = summarizeRecall(recall.structuredContent);
    if (!recallSummary.hasTraceId) {
      throw new RemoteValidationError("memory_recall did not return a trace_id.");
    }

    const remember = await client.callTool({
      name: "memory_remember",
      arguments: await readPayload("examples/http/payloads/memory-remember-preferences.json"),
    });
    const rememberSummary = summarizeRemember(remember.structuredContent);

    console.log("HandoffBase remote validation passed.");
    console.log(`Endpoint: ${redactUrl(endpointUrl)}`);
    console.log(`Profile: ${expectations.profile}`);
    console.log(`Health: ${JSON.stringify(pickHealth(health))}`);
    console.log(
      skipReadiness
        ? "Readiness: skipped by MCP_SKIP_READINESS=1"
        : `Readiness: ${JSON.stringify(readinessSummary)}`,
    );
    console.log(`Tools: ${toolNames.length} (${toolNames.join(", ")})`);
    console.log(`memory_recall: memories=${recallSummary.memoryCount}, trace_id=present`);
    console.log(
      `memory_remember: candidate_memories=${rememberSummary.candidateCount}, statuses=${rememberSummary.statuses.join(", ") || "none"}`,
    );
  } finally {
    await client.close();
  }
}

async function readPayload(path) {
  const payload = JSON.parse(await readFile(path, "utf8"));
  return payload.arguments ?? payload;
}

function assertField(object, field, expected) {
  if (object?.[field] !== expected) {
    throw new RemoteValidationError(`/health ${field} expected ${expected}, got ${String(object?.[field])}.`);
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

function summarizeReadinessCheck(value, label) {
  if (typeof value?.mode !== "string" || typeof value?.ok !== "boolean") {
    throw new RemoteValidationError(`GET /ready returned an invalid ${label} check.`);
  }
  return {
    mode: value.mode,
    ok: value.ok,
    cached: value.cached === true,
  };
}

function parseUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    throw new RemoteValidationError(`${name} must be a valid URL.`);
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

function readOptional(value) {
  const normalized = value?.trim();
  return normalized || undefined;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  void validateRemoteMcp().catch((error) => {
    console.error(error instanceof Error ? error.message : "Remote MCP validation failed.");
    process.exitCode = 1;
  });
}
