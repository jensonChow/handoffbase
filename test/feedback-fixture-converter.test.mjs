import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  convertFeedbackFixtures,
} from "../scripts/feedback-fixture-to-benchmark.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const converterPath = path.join(repositoryRoot, "scripts/feedback-fixture-to-benchmark.mjs");

const fixture = Object.freeze({
  schema_version: "1",
  target: "trace",
  signal: "unhelpful",
  memory_type: "failure_memory",
  scope_dimensions: ["user", "tenant", "project"],
  trace_query: "How should the agent recover from this failed response?",
  run_task_hint: "Repair the response using the confirmed constraint.",
  reason: "The response ignored the confirmed constraint [REDACTED_TOKEN].",
  correction: "Ask for the missing constraint before proposing a repair.",
});

const convert = (input) => convertFeedbackFixtures(input, { publicSafeConfirmed: true });

test("feedback converter produces deterministic long-memory cases for both benchmark baselines", () => {
  const first = convert(fixture);
  const second = convert({ ...fixture, scope_dimensions: ["project", "tenant", "user"] });
  assert.deepEqual(second, first);
  assert.equal(first.family, "long-memory");
  assert.deepEqual(first.defaultScope, {
    tenantId: "feedback-bench-tenant",
    userId: "feedback-bench-user",
    projectId: "feedback-bench-project",
    agentProfileId: "feedback-bench-agent",
  });
  assert.equal(first.cases.length, 1);

  const testCase = first.cases[0];
  assert.match(testCase.id, /^feedback-[0-9a-f]{16}$/);
  assert.deepEqual(testCase.baselines, ["no-memory", "handoffbase-memory-context"]);
  assert.deepEqual(testCase.baselineExpectations, {
    "no-memory": { pass: false },
    "handoffbase-memory-context": { pass: true },
  });
  assert.equal(testCase.seedMemories[0].status, "active");
  assert.equal(testCase.seedMemories[0].sourceKind, "user_correction");
  assert.equal(testCase.seedMemories[0].canonicalText, fixture.correction);
  assert.equal(testCase.steps[0].operation, "memory_recall");
  assert.equal(testCase.steps[0].input.query, fixture.trace_query);
  assert.deepEqual(testCase.expected.memoryIdsPresent, [testCase.seedMemories[0].id]);
  assert.deepEqual(testCase.expected.usedMemoryIds, [testCase.seedMemories[0].id]);
  assert.deepEqual(testCase.expected.contextIncludes, [fixture.correction]);
  assert.deepEqual(testCase.metrics, [
    "answer_correct",
    "evidence_recall_at_k",
    "trace_id_present",
    "used_memory_correct",
  ]);
});

test("feedback converter accepts arrays, sorts cases deterministically, and rejects duplicates", () => {
  const another = {
    ...fixture,
    memory_type: "procedure",
    trace_query: "What confirmed procedure should guide the retry?",
    correction: "Verify the official constraint before retrying.",
  };
  const forward = convert([fixture, another]);
  const reverse = convert([another, fixture]);
  assert.deepEqual(reverse, forward);
  assert.deepEqual(
    forward.cases.map((testCase) => testCase.id),
    [...forward.cases.map((testCase) => testCase.id)].sort(),
  );
  assert.throws(() => convert([fixture, fixture]), /duplicate regression cases/);
});

test("feedback converter rejects helpful, uncorrected, identified, scoped, and sensitive input", () => {
  assert.throws(
    () => convertFeedbackFixtures(fixture),
    /requires explicit public-safe confirmation/,
  );
  assert.throws(
    () => convert({ ...fixture, signal: "helpful" }),
    /must have signal unhelpful/,
  );
  assert.throws(
    () => convert({ ...fixture, correction: "" }),
    /non-empty correction/,
  );
  assert.throws(
    () => convert({ ...fixture, memory_id: "private-memory-id" }),
    /forbidden or unsupported field memory_id/,
  );
  assert.throws(
    () => convert({ ...fixture, scope: { tenantId: "private-tenant" } }),
    /forbidden or unsupported field scope/,
  );
  assert.throws(
    () => convert({ ...fixture, trace_query: "Trace 019f4b73-90b1-4813-a07e-ce506cb7dd0e failed." }),
    /contains an identifier/,
  );
  assert.throws(
    () => convert({ ...fixture, correction: "Retry with token=synthetic-secret-value." }),
    /contains sensitive content/,
  );
  assert.throws(
    () => convert({ ...fixture, correction: "Email reviewer@example.com before retrying." }),
    /contains sensitive content/,
  );
  assert.throws(
    () => convert({ ...fixture, reason: "Call +1 415 555 0199 for the missing constraint." }),
    /contains sensitive content/,
  );
});

test("feedback converter writes stdout by default and only writes a file with explicit --output", async () => {
  const stdout = execFileSync(process.execPath, [converterPath, "--public-safe-confirmed"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: JSON.stringify(fixture),
  });
  assert.deepEqual(JSON.parse(stdout), convert(fixture));

  const directory = await mkdtemp(path.join(tmpdir(), "handoffbase-feedback-converter-"));
  const inputPath = path.join(directory, "feedback.json");
  const outputPath = path.join(directory, "cases.json");
  try {
    await writeFile(inputPath, JSON.stringify([fixture]), "utf8");
    const explicitStdout = execFileSync(
      process.execPath,
      [converterPath, inputPath, "--public-safe-confirmed", "--output", outputPath],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(explicitStdout, "");
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), convert([fixture]));
    assert.throws(
      () => execFileSync(process.execPath, [converterPath, inputPath, "--public-safe-confirmed", "--output", outputPath], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
      /Command failed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("feedback converter exposes command-line usage without reading input", () => {
  const stdout = execFileSync(process.execPath, [converterPath, "--help"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.match(stdout, /Usage: npm run feedback:to-benchmark/);
  assert.match(stdout, /--public-safe-confirmed/);
});
