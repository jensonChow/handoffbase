#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { PostgresMemoryStore } from "@handoffbase/memory-core";
import { createPgSqlQueryClient } from "../../dist/runtime/postgres-query-client.js";
import { runMemoryCoreMigration } from "./migrate.mjs";

const execFileAsync = promisify(execFile);
const composeFile = fileURLToPath(new URL("../../compose.yaml", import.meta.url));
const projectName = `handoffbase-restart-${process.pid}-${Date.now()}`;
const memoryId = `postgres-restart-${randomUUID()}`;
let composeStarted = false;

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown restart-test failure.";
  process.stderr.write(`Postgres restart proof failed: ${message}\n`);
  process.exitCode = 1;
});

async function main() {
  await requireDockerCompose();
  const hostPort = await reserveEphemeralPort();
  const databaseUrl =
    `postgresql://handoffbase_local:local-placeholder-only@127.0.0.1:${hostPort}/handoffbase_test`;
  const composeEnv = {
    ...process.env,
    HANDOFFBASE_POSTGRES_PORT: String(hostPort),
  };

  try {
    await compose(["--profile", "postgres", "up", "-d", "--wait"], composeEnv);
    composeStarted = true;
    await runMemoryCoreMigration(databaseUrl);

    const writer = createPgSqlQueryClient(databaseUrl);
    try {
      const store = new PostgresMemoryStore(writer);
      await store.addMemory({
        id: memoryId,
        scope: {
          tenantId: "postgres-restart-test",
          userId: "postgres-restart-test",
          projectId: "postgres-restart-test",
        },
        type: "project_fact",
        canonicalText: "A disposable Postgres restart preserves HandoffBase memory.",
        sourceKind: "agent_observation",
        status: "active",
        confidence: 1,
        importance: 1,
      });
    } finally {
      await writer.close();
    }

    await compose(["restart", "postgres"], composeEnv);
    await waitForPostgres(composeEnv);

    const reader = createPgSqlQueryClient(databaseUrl);
    try {
      const store = new PostgresMemoryStore(reader);
      const persisted = await store.getMemory(memoryId);
      if (persisted?.canonicalText !== "A disposable Postgres restart preserves HandoffBase memory.") {
        throw new Error("The persisted memory was unavailable after the database container restart.");
      }
    } finally {
      await reader.close();
    }

    process.stdout.write(
      "Postgres restart proof: PASS (migration applied, memory written, database container restarted, memory recalled).\n",
    );
  } finally {
    if (composeStarted) {
      await compose(["down", "--volumes", "--remove-orphans"], composeEnv).catch(() => undefined);
    }
  }
}

async function requireDockerCompose() {
  try {
    await execFileAsync("docker", ["compose", "version"], { timeout: 10_000 });
    await execFileAsync("docker", ["info"], { timeout: 10_000 });
  } catch {
    throw new Error("Docker with the Compose plugin and a running daemon is required.");
  }
}

async function reserveEphemeralPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) {
    throw new Error("Could not reserve a loopback port for disposable Postgres.");
  }
  return port;
}

async function waitForPostgres(env) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await compose(
        ["exec", "-T", "postgres", "pg_isready", "-U", "handoffbase_local", "-d", "handoffbase_test"],
        env,
      );
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error("Postgres did not become ready after restart.", { cause: lastError });
}

async function compose(args, env) {
  return await execFileAsync(
    "docker",
    ["compose", "-p", projectName, "-f", composeFile, ...args],
    {
      env,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
