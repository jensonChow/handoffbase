import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMPLEMENTED_BASELINES,
  assertIdsAbsentOrContextExcluded
} from "../scripts/run-memory-benchmarks.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerPath = path.join(repositoryRoot, "scripts/run-memory-benchmarks.mjs");

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
});

function runJsonBenchmark() {
  return execFileSync(process.execPath, [runnerPath, "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      HANDOFFBASE_BENCH_SKIP_BUILD: "1"
    }
  });
}
