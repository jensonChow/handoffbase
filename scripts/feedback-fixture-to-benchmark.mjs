#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  MEMORY_STATUSES,
  MEMORY_TYPES,
  assessMemorySafety,
} from "@handoffbase/memory-core";

const ALLOWED_KEYS = new Set([
  "schema_version",
  "target",
  "signal",
  "memory_type",
  "memory_status",
  "scope_dimensions",
  "trace_query",
  "run_task_hint",
  "reason",
  "correction",
]);
const ALLOWED_TARGETS = new Set(["memory", "trace", "memory_and_trace"]);
const ALLOWED_SCOPE_DIMENSIONS = new Set([
  "tenant",
  "user",
  "agent_profile",
  "project",
  "host",
  "session",
  "tool",
]);
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const FIXED_NOW = "2026-01-01T00:00:00.000Z";
const SYNTHETIC_SCOPE = Object.freeze({
  tenantId: "feedback-bench-tenant",
  userId: "feedback-bench-user",
  projectId: "feedback-bench-project",
  agentProfileId: "feedback-bench-agent",
});
const USAGE = `Usage: npm run feedback:to-benchmark -- [input.json|-] --public-safe-confirmed [--output new-file.json]\n\nReads one sanitized feedback fixture or an array. Without --output, writes the converted benchmark fixture to stdout. The output path must not already exist.\n`;

export function convertFeedbackFixtures(input, { publicSafeConfirmed = false } = {}) {
  if (!publicSafeConfirmed) {
    throw new Error("Feedback fixture conversion requires explicit public-safe confirmation.");
  }
  const fixtures = Array.isArray(input) ? input : [input];
  if (fixtures.length === 0) {
    throw new Error("Feedback fixture input must not be empty.");
  }

  const cases = fixtures.map((fixture, index) => fixtureToCase(validateFixture(fixture, index)));
  cases.sort((left, right) => left.id.localeCompare(right.id));
  const caseIds = cases.map((testCase) => testCase.id);
  if (new Set(caseIds).size !== caseIds.length) {
    throw new Error("Feedback fixture input contains duplicate regression cases.");
  }

  return {
    family: "long-memory",
    description: "Synthetic long-memory regression cases generated from sanitized unhelpful feedback corrections.",
    fixedNow: FIXED_NOW,
    defaultScope: { ...SYNTHETIC_SCOPE },
    cases,
  };
}

export async function main(args = process.argv.slice(2), io = defaultIo()) {
  const options = parseArgs(args);
  if (options.help) {
    io.write(USAGE);
    return;
  }
  const raw = options.inputPath === "-"
    ? await io.readStdin()
    : await readFile(options.inputPath, "utf8");
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("Feedback fixture input must be valid JSON.");
  }

  const rendered = `${JSON.stringify(convertFeedbackFixtures(input, {
    publicSafeConfirmed: options.publicSafeConfirmed,
  }), null, 2)}\n`;
  if (options.outputPath) {
    await writeFile(options.outputPath, rendered, { encoding: "utf8", flag: "wx" });
  } else {
    io.write(rendered);
  }
}

function validateFixture(value, index) {
  const label = `feedback fixture ${index + 1}`;
  if (!isObject(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`${label} contains forbidden or unsupported field ${key}.`);
    }
  }
  if (value.schema_version !== "1") {
    throw new Error(`${label} schema_version must be 1.`);
  }
  if (!ALLOWED_TARGETS.has(value.target)) {
    throw new Error(`${label} target is unsupported.`);
  }
  if (value.signal !== "unhelpful") {
    throw new Error(`${label} must have signal unhelpful.`);
  }
  if (typeof value.correction !== "string" || value.correction.trim().length === 0) {
    throw new Error(`${label} must include a non-empty correction.`);
  }
  if (value.memory_type !== undefined && !MEMORY_TYPES.includes(value.memory_type)) {
    throw new Error(`${label} memory_type is unsupported.`);
  }
  if (value.memory_status !== undefined && !MEMORY_STATUSES.includes(value.memory_status)) {
    throw new Error(`${label} memory_status is unsupported.`);
  }
  if (!Array.isArray(value.scope_dimensions) || value.scope_dimensions.length === 0) {
    throw new Error(`${label} must include scope_dimensions.`);
  }
  if (
    value.scope_dimensions.some(
      (dimension) => typeof dimension !== "string" || !ALLOWED_SCOPE_DIMENSIONS.has(dimension),
    )
  ) {
    throw new Error(`${label} scope_dimensions may contain dimension names only.`);
  }
  for (const field of ["trace_query", "run_task_hint", "reason", "correction"]) {
    const text = value[field];
    if (text === undefined) continue;
    if (typeof text !== "string") {
      throw new Error(`${label} ${field} must be a string.`);
    }
    if (UUID_PATTERN.test(text)) {
      throw new Error(`${label} ${field} contains an identifier.`);
    }
    const safety = assessMemorySafety({
      text,
      type: value.memory_type ?? "failure_memory",
      sourceTrust: "user_direct",
    });
    if (safety.sensitive) {
      throw new Error(`${label} ${field} contains sensitive content.`);
    }
  }
  return {
    schema_version: "1",
    target: value.target,
    signal: "unhelpful",
    memory_type: value.memory_type ?? "failure_memory",
    scope_dimensions: [...new Set(value.scope_dimensions)].sort(),
    trace_query: optionalTrimmed(value.trace_query),
    run_task_hint: optionalTrimmed(value.run_task_hint),
    reason: optionalTrimmed(value.reason),
    correction: value.correction.trim(),
  };
}

function fixtureToCase(fixture) {
  const fingerprint = createHash("sha256")
    .update(stableStringify(fixture))
    .digest("hex")
    .slice(0, 16);
  const caseId = `feedback-${fingerprint}`;
  const memoryId = `synthetic-correction-${fingerprint}`;
  const query = fixture.trace_query
    ?? fixture.run_task_hint
    ?? fixture.reason
    ?? "What corrected guidance should apply to this response?";

  return {
    id: caseId,
    name: `Feedback regression ${fingerprint}`,
    description: "A user correction from sanitized unhelpful feedback should be recalled in the matching task.",
    capability: "feedback-driven regression",
    baselines: ["no-memory", "handoffbase-memory-context"],
    baselineExpectations: {
      "no-memory": { pass: false },
      "handoffbase-memory-context": { pass: true },
    },
    seedMemories: [
      {
        id: memoryId,
        type: fixture.memory_type,
        canonicalText: fixture.correction,
        sourceKind: "user_correction",
        status: "active",
        confidence: 1,
        importance: 1,
        metadata: {
          synthetic: true,
          origin: "memory-feedback-regression-fixture",
        },
      },
    ],
    steps: [
      {
        id: `recall-${fingerprint}`,
        operation: "memory_recall",
        sessionId: `synthetic-session-${fingerprint}`,
        input: {
          query,
          types: [fixture.memory_type],
          limit: 5,
          tokenBudget: 700,
        },
      },
    ],
    expected: {
      memoryIdsPresent: [memoryId],
      usedMemoryIds: [memoryId],
      contextIncludes: [fixture.correction],
      traceIdPresent: true,
    },
    metrics: ["answer_correct", "evidence_recall_at_k", "trace_id_present", "used_memory_correct"],
  };
}

function parseArgs(args) {
  let inputPath = "-";
  let outputPath;
  let publicSafeConfirmed = false;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--public-safe-confirmed") {
      publicSafeConfirmed = true;
      continue;
    }
    if (argument === "--output") {
      outputPath = args[index + 1];
      if (!outputPath) throw new Error("--output requires a file path.");
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new Error(`Unsupported option ${argument}.`);
    }
    if (inputPath !== "-") {
      throw new Error("Provide at most one input path; omit it or use - for stdin.");
    }
    inputPath = argument;
  }
  return { inputPath, outputPath, publicSafeConfirmed, help };
}

function defaultIo() {
  return {
    readStdin: async () => {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      return Buffer.concat(chunks).toString("utf8");
    },
    write: (text) => process.stdout.write(text),
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function optionalTrimmed(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
