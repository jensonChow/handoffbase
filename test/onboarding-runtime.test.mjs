import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { registrationManifest } from "../dist/mcp/manifest.js";
import { buildServerArgs } from "../scripts/run-server.mjs";
import {
  RemoteValidationError,
  assertExactToolManifest,
  assertExpectedHealth,
  resolveToolResultPayload,
  resolveValidationExpectations,
  summarizeRemember,
  summarizeReadiness,
} from "../scripts/validate-remote-mcp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("server wrapper loads .env.local only when it exists", () => {
  assert.deepEqual(buildServerArgs("dev", false), ["--import=tsx", "src/index.ts"]);
  assert.deepEqual(buildServerArgs("dev", true), ["--env-file=.env.local", "--import=tsx", "src/index.ts"]);
  assert.deepEqual(buildServerArgs("start", false), ["dist/index.js"]);
  assert.deepEqual(buildServerArgs("start", true), ["--env-file=.env.local", "dist/index.js"]);
  assert.throws(() => buildServerArgs("unknown", false), /<dev\|start>/);
});

test("package scripts use the safe server wrapper and reserve port 3001 for the dashboard", async () => {
  const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const dashboardPackage = JSON.parse(await readFile(resolve(root, "apps/dashboard/package.json"), "utf8"));

  assert.equal(rootPackage.scripts["dev:server"], "node scripts/run-server.mjs dev");
  assert.equal(rootPackage.scripts["start:server"], "node scripts/run-server.mjs start");
  assert.match(dashboardPackage.scripts.dev, /--hostname 127\.0\.0\.1 --port 3001$/);
  assert.match(dashboardPackage.scripts.start, /--port 3001$/);
});

test("Codex examples provide canonical local and environment-backed remote configs", async () => {
  const localConfig = await readFile(resolve(root, "examples/mcp/codex-local.config.toml"), "utf8");
  const remoteConfig = await readFile(resolve(root, "examples/mcp/codex-remote.config.toml"), "utf8");

  assert.match(localConfig, /\[mcp_servers\.handoffbase_local\]/);
  assert.match(localConfig, /url = "http:\/\/127\.0\.0\.1:3000\/mcp"/);
  assert.match(remoteConfig, /\[mcp_servers\.handoffbase_remote\]/);
  assert.match(remoteConfig, /bearer_token_env_var = "HANDOFFBASE_MCP_TOKEN"/);
  assert.doesNotMatch(remoteConfig, /Bearer\s+[A-Za-z0-9_-]{16,}/);
});

test("tracked env template keeps the dashboard session secret empty and documents its minimum", async () => {
  const envTemplate = await readFile(resolve(root, ".env.example"), "utf8");

  assert.match(envTemplate, /at least 32 characters/);
  assert.match(envTemplate, /^HANDOFFBASE_DASHBOARD_SESSION_SECRET=$/m);
});

test("remote validation defaults to discovery and supports profile or field expectations", () => {
  assert.deepEqual(resolveValidationExpectations({}), {
    profile: "generic",
    authMode: undefined,
    providerMode: undefined,
    storeMode: undefined,
    embeddingMode: undefined,
  });

  assert.deepEqual(resolveValidationExpectations({ MCP_VALIDATION_PROFILE: "alibaba-demo" }), {
    profile: "alibaba-demo",
    authMode: "api_key",
    providerMode: "qwen",
    storeMode: "in-memory",
    embeddingMode: undefined,
  });

  assert.deepEqual(
    resolveValidationExpectations({
      MCP_VALIDATION_PROFILE: "alibaba-demo",
      EXPECTED_STORE_MODE: "postgres",
      EXPECTED_EMBEDDING_MODE: "qwen",
    }),
    {
      profile: "alibaba-demo",
      authMode: "api_key",
      providerMode: "qwen",
      storeMode: "postgres",
      embeddingMode: "qwen",
    },
  );

  assert.throws(
    () => resolveValidationExpectations({ MCP_VALIDATION_PROFILE: "missing" }),
    RemoteValidationError,
  );
});

test("generic health validation accepts runtime modes while explicit expectations enforce them", () => {
  const health = {
    ok: true,
    name: "handoffbase-mcp-server",
    transport: "streamable-http",
    authMode: "disabled",
    providerMode: "mock",
    storeMode: "postgres",
    embeddingMode: "mock",
  };

  assert.doesNotThrow(() => assertExpectedHealth(health, resolveValidationExpectations({})));
  assert.throws(
    () => assertExpectedHealth(health, resolveValidationExpectations({ EXPECTED_STORE_MODE: "in-memory" })),
    /storeMode expected in-memory, got postgres/,
  );
  assert.throws(
    () => assertExpectedHealth(health, resolveValidationExpectations({ EXPECTED_EMBEDDING_MODE: "qwen" })),
    /embeddingMode expected qwen, got mock/,
  );
});

test("remote validation requires the exact current tool manifest", () => {
  const tools = registrationManifest().tools;
  assert.doesNotThrow(() => assertExactToolManifest(tools));
  assert.throws(() => assertExactToolManifest(tools.slice(1)), /missing=continuity_bootstrap/);
  assert.throws(() => assertExactToolManifest([...tools, "unexpected_tool"]), /unexpected=unexpected_tool/);
});

test("readiness output includes only mode, ok, and cached", () => {
  assert.deepEqual(
    summarizeReadiness({
      ok: true,
      checks: {
        store: {
          mode: "postgres",
          ok: true,
          cached: false,
          latencyMs: 12,
          checkedAt: "2026-07-10T00:00:00.000Z",
        },
        provider: {
          mode: "qwen",
          ok: true,
          cached: true,
          latencyMs: 20,
          providerBody: "must-not-be-logged",
        },
      },
    }),
    {
      store: { mode: "postgres", ok: true, cached: false },
      provider: { mode: "qwen", ok: true, cached: true },
    },
  );
  assert.throws(() => summarizeReadiness({ ok: false }), /invalid readiness payload/);
});

test("remote validation preserves structured tool results and falls back to JSON text content", () => {
  const structuredPayload = { memories: [], trace_id: "trace-structured" };
  assert.equal(
    resolveToolResultPayload(
      {
        structuredContent: structuredPayload,
        content: [{ type: "text", text: "not-json" }],
      },
      "memory_recall",
    ),
    structuredPayload,
  );

  assert.deepEqual(
    resolveToolResultPayload(
      {
        content: [
          { type: "image", data: "ignored", mimeType: "image/png" },
          { type: "text", text: '{"candidate_memories":[{"status":"created"}]}' },
        ],
      },
      "memory_remember",
    ),
    { candidate_memories: [{ status: "created" }] },
  );
});

test("remote validation surfaces sanitized MCP tool errors before reading payloads", () => {
  assert.throws(
    () =>
      resolveToolResultPayload(
        {
          isError: true,
          structuredContent: { should_not: "be accepted" },
          content: [{ type: "text", text: "\u001b[31m  Qwen\nupstream\tfailed\u0000 " }],
        },
        "memory_recall",
      ),
    (error) => {
      assert.ok(error instanceof RemoteValidationError);
      assert.equal(error.message, "memory_recall returned an MCP tool error: Qwen upstream failed");
      return true;
    },
  );

  assert.throws(
    () => resolveToolResultPayload({ content: [{ type: "text", text: "not-json" }] }, "memory_remember"),
    /text content was not valid JSON/,
  );
});

test("remote validation requires memory_remember to persist at least one candidate", () => {
  assert.deepEqual(
    summarizeRemember({
      candidate_memories: [
        { id: "memory-1", status: "pending" },
        { id: "memory-2", status: "pending" },
      ],
    }),
    { candidateCount: 2, persistedCount: 2, statuses: ["pending"] },
  );
  assert.throws(
    () => summarizeRemember({ candidate_memories: [] }),
    /memory_remember did not return any candidate_memories/,
  );
  assert.throws(
    () => summarizeRemember({ candidate_memories: [{ status: "pending" }] }),
    /did not return a persisted candidate memory with an id/,
  );
  assert.throws(
    () => summarizeRemember({ candidate_memories: [{ id: "rejected-1", status: "rejected" }] }),
    /did not return a persisted candidate memory with an id/,
  );
});
