#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const LOCAL_ENV_FILE = ".env.local";

export function buildServerArgs(mode, localEnvExists = existsSync(LOCAL_ENV_FILE)) {
  const envArgs = localEnvExists ? [`--env-file=${LOCAL_ENV_FILE}`] : [];

  if (mode === "dev") {
    return [...envArgs, "--import=tsx", "src/index.ts"];
  }
  if (mode === "start") {
    return [...envArgs, "dist/index.js"];
  }

  throw new Error("Usage: node scripts/run-server.mjs <dev|start>");
}

export async function runServer(mode, options = {}) {
  const args = buildServerArgs(mode, options.localEnvExists);
  const child = (options.spawn ?? spawn)(process.execPath, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: "inherit",
  });

  return await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolveExit(code ?? 1);
    });
  });
}

async function main() {
  const exitCode = await runServer(process.argv[2]);
  process.exitCode = exitCode;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Failed to start HandoffBase.");
    process.exitCode = 1;
  });
}
