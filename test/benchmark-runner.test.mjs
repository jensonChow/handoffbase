import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertFeedbackFixtures } from "../scripts/feedback-fixture-to-benchmark.mjs";
import {
  IMPLEMENTED_BASELINES,
  assertIdsAbsentOrContextExcluded
} from "../scripts/run-memory-benchmarks.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerPath = path.join(repositoryRoot, "scripts/run-memory-benchmarks.mjs");
const conflictFixturePath = path.join(repositoryRoot, "examples/benchmarks/conflicts/cases.json");

test("excluded-memory assertion rejects a returned MemorySummary whose text is in context", () => {
  assert.throws(
    () => assertIdsAbsentOrContextExcluded(
      [{ id: "returned-memory", text: "memory text that reached context" }],
      "prefix memory text that reached context suffix",
      ["returned-memory"],
      "regression"
    ),
    /returned-memory should be absent or excluded from context/
  );

  assert.doesNotThrow(() => assertIdsAbsentOrContextExcluded(
    [{ id: "returned-memory", text: "memory text kept out of context" }],
    "unrelated context",
    ["returned-memory", "absent-memory"],
    "regression"
  ));

  assert.throws(
    () => assertIdsAbsentOrContextExcluded(
      [{ id: "malformed-summary" }],
      "unrelated context",
      ["malformed-summary"],
      "regression"
    ),
    (error) => error.name === "Error" && /summary must expose text/.test(error.message)
  );
});

test("benchmark JSON executes both implemented baselines with a deterministic schema", () => {
  assert.deepEqual(
    IMPLEMENTED_BASELINES.map((baseline) => baseline.id),
    ["no-memory", "handoffbase-memory-context"]
  );

  const firstOutput = runJsonBenchmark();
  const secondOutput = runJsonBenchmark();
  assert.equal(secondOutput, firstOutput);

  const report = JSON.parse(firstOutput);
  assert.deepEqual(Object.keys(report), [
    "schemaVersion",
    "suite",
    "mode",
    "implementedBaselines",
    "fixtureCaseCount",
    "baselineExecutionCount",
    "results",
    "errors",
    "summary"
  ]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.suite, "handoffbase-memory-regression");
  assert.equal(report.mode, "deterministic-local");
  assert.equal(report.fixtureCaseCount, 17);
  assert.equal(report.baselineExecutionCount, 34);
  assert.equal(report.summary.harness.ok, true);
  assert.equal(report.summary.harness.conformant, 34);
  assert.equal(report.summary.harness.executionErrors, 0);
  assert.deepEqual(Object.keys(report.results[0]), [
    "baseline",
    "family",
    "caseId",
    "name",
    "metrics",
    "observedPass",
    "expectedPass",
    "expectationMatched",
    "failure",
    "executionError"
  ]);

  assert.deepEqual(report.summary.perBaseline["no-memory"].cases, {
    passed: 0,
    total: 17,
    rate: 0
  });
  assert.deepEqual(report.summary.perBaseline["handoffbase-memory-context"].cases, {
    passed: 17,
    total: 17,
    rate: 1
  });
  assert.equal(report.summary.perBaseline["no-memory"].expectationConformance.passed, 17);
  assert.equal(report.summary.handoffbaseDeltaOverNoMemory.comparisonCoverage.sharedCases, 17);
  assert.equal(report.summary.handoffbaseDeltaOverNoMemory.cases.passedDelta, 17);
  assert.equal(report.summary.handoffbaseDeltaOverNoMemory.metricTaggedCases.passedDelta, 43);

  const executedBaselines = new Set(report.results.map((result) => result.baseline));
  assert.deepEqual([...executedBaselines].sort(), ["handoffbase-memory-context", "no-memory"]);
  assert.equal(report.results.filter((result) => result.baseline === "no-memory").length, 17);
  assert.equal(report.results.filter((result) => result.baseline === "handoffbase-memory-context").length, 17);
  assert.equal(report.results.every((result) => result.executionError === null), true);
  assert.equal(report.results.some((result) => result.baseline === "raw-history"), false);
  assert.equal(report.results.some((result) => result.baseline === "naive-vector-rag"), false);

  for (const caseId of [
    "preference-contradiction-supersede",
    "procedure-duplicate-merge",
    "different-project-keep-both"
  ]) {
    const noMemory = report.results.find(
      (result) => result.baseline === "no-memory" && result.caseId === caseId
    );
    const handoffbase = report.results.find(
      (result) => result.baseline === "handoffbase-memory-context" && result.caseId === caseId
    );
    assert.equal(noMemory.observedPass, false, `${caseId} remains a no-memory capability miss`);
    assert.equal(noMemory.expectationMatched, true);
    assert.equal(noMemory.executionError, null, `${caseId} no-memory miss is not a harness error`);
    assert.equal(handoffbase.observedPass, true, `${caseId} resolves deterministically in HandoffBase`);
    assert.equal(handoffbase.executionError, null);
  }
});

test("conflict fixtures cover terminal supersede, merge, and keep-both postconditions", () => {
  const fixture = JSON.parse(readFileSync(conflictFixturePath, "utf8"));
  const resolutionSteps = fixture.cases
    .flatMap((testCase) => testCase.steps.map((step) => ({ caseId: testCase.id, ...step })))
    .filter((step) => step.op === "resolveConflict");

  assert.deepEqual(
    resolutionSteps.map((step) => step.action),
    ["supersede_existing", "merge", "keep_both"]
  );
  assert.equal(resolutionSteps.every((step) => step.expect.conflictStatus === "resolved"), true);
  assert.equal(resolutionSteps.every((step) => step.expect.candidateStatus === "active"), true);
  assert.equal(resolutionSteps.every((step) => step.expect.openConflictCount === 0), true);
  assert.equal(resolutionSteps.every((step) => step.expect.vaultConflictsCount === 0), true);

  const [supersede, merge, keepBoth] = resolutionSteps;
  assert.equal(supersede.expect.existingStatus, "superseded");
  assert.deepEqual(supersede.expect.candidateSupersedesMemoryIds, ["bench-pref-prize-money"]);
  assert.equal(supersede.expect.existingSupersededBy, "bench-candidate-pref-credibility-network");

  assert.equal(merge.expect.existingStatus, "superseded");
  assert.equal(merge.expect.candidateText, merge.mergedText);
  assert.deepEqual(merge.expect.candidateSupersedesMemoryIds, ["bench-procedure-deadline-timezone"]);
  assert.equal(merge.expect.existingSupersededBy, "bench-candidate-procedure-rules");

  assert.equal(keepBoth.expect.existingStatus, "active");
  assert.deepEqual(keepBoth.expect.candidateSupersedesMemoryIds, []);
  assert.equal(keepBoth.expect.existingSupersededBy, null);
});

test("benchmark runner consumes an explicit generated feedback fixture outside the family directory", () => {
  const fixture = convertFeedbackFixtures(
    {
      schema_version: "1",
      target: "trace",
      signal: "unhelpful",
      memory_type: "failure_memory",
      scope_dimensions: ["tenant", "user", "project"],
      trace_query: "What confirmed correction should guide the retry?",
      correction: "Ask for the missing constraint before proposing a retry.",
    },
    { publicSafeConfirmed: true },
  );
  const directory = mkdtempSync(path.join(tmpdir(), "handoffbase-explicit-benchmark-"));
  const fixturePath = path.join(directory, "generated-feedback.json");
  try {
    writeFileSync(fixturePath, JSON.stringify(fixture), "utf8");
    const report = JSON.parse(runJsonBenchmark(["--fixture", fixturePath]));
    assert.equal(report.fixtureCaseCount, 1);
    assert.equal(report.baselineExecutionCount, 2);
    assert.equal(report.errors.length, 0);
    assert.equal(report.summary.harness.ok, true);
    assert.deepEqual(
      report.results.map((result) => result.baseline).sort(),
      ["handoffbase-memory-context", "no-memory"],
    );
    assert.equal(
      report.results.find((result) => result.baseline === "handoffbase-memory-context")?.observedPass,
      true,
    );
    assert.equal(
      report.results.find((result) => result.baseline === "no-memory")?.observedPass,
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runJsonBenchmark(extraArgs = []) {
  return execFileSync(process.execPath, [runnerPath, "--json", ...extraArgs], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      HANDOFFBASE_BENCH_SKIP_BUILD: "1"
    }
  });
}
