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
  resolveValidationExpectations,
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
  });

  assert.deepEqual(resolveValidationExpectations({ MCP_VALIDATION_PROFILE: "alibaba-demo" }), {
    profile: "alibaba-demo",
    authMode: "api_key",
    providerMode: "qwen",
    storeMode: "in-memory",
  });

  assert.deepEqual(
    resolveValidationExpectations({
      MCP_VALIDATION_PROFILE: "alibaba-demo",
      EXPECTED_STORE_MODE: "postgres",
    }),
    {
      profile: "alibaba-demo",
      authMode: "api_key",
      providerMode: "qwen",
      storeMode: "postgres",
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
  };

  assert.doesNotThrow(() => assertExpectedHealth(health, resolveValidationExpectations({})));
  assert.throws(
    () => assertExpectedHealth(health, resolveValidationExpectations({ EXPECTED_STORE_MODE: "in-memory" })),
    /storeMode expected in-memory, got postgres/,
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
