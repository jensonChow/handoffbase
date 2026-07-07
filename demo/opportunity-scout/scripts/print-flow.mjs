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

const seed = await readJson(join(root, "seed-memories.json"));

console.log(`# ${seed.demo_id} (${seed.version})`);
console.log(seed.description);
console.log("");
console.log("Seed memories:");
for (const memory of seed.memories) {
  console.log(`- ${memory.id} [${memory.type}]: ${memory.canonical_text}`);
}

for (const file of sessionFiles) {
  const session = await readJson(join(sessionDir, file));
  console.log("");
  console.log(`## ${session.title}`);
  console.log(session.goal);
  for (const step of session.steps) {
    if (step.kind === "user_message") {
      console.log(`USER: ${step.text}`);
    }
    if (step.kind === "tool_call") {
      console.log(`TOOL ${step.tool}: ${JSON.stringify(step.arguments)}`);
    }
    if (step.kind === "assistant_response") {
      console.log(`ASSISTANT: ${step.text}`);
    }
  }
}
