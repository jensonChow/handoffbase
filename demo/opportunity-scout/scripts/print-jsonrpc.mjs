#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "..");
const sessionDir = join(root, "sessions");
const sessionFiles = [
  "session-01-remember-preferences.json",
  "session-02-bootstrap-rank-opportunities.json",
  "session-03-reflect-failure.json",
  "session-04-cross-host-continuity.json"
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

let id = 1;
for (const file of sessionFiles) {
  const session = await readJson(join(sessionDir, file));
  for (const step of session.steps) {
    if (step.kind !== "tool_call") {
      continue;
    }

    const request = {
      jsonrpc: "2.0",
      id: `${session.session_id}-${id++}`,
      method: "tools/call",
      params: {
        name: step.tool,
        arguments: step.arguments
      }
    };

    console.log(JSON.stringify(request, null, 2));
  }
}
