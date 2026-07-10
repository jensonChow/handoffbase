import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildComparisonMarkdown,
  runLongMemEvalComparison
} from "../benchmarks/longmemeval/compare.mjs";
import { parseCompareArgs } from "../scripts/benchmarks/longmemeval-compare.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(rootDir, "benchmarks/longmemeval/fixtures/tiny-longmemeval.json");

function fixedClock(timestamp) {
  return () => new Date(timestamp);
}

function stepTimer(step) {
  let value = 0;
  return () => {
    const current = value;
    value += step;
    return current;
  };
}

test("comparison orchestrator ranks backends and stays offline/deterministic", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "handoffbase-lme-compare-"));
  const forbidNetwork = async () => {
    throw new Error("Network is forbidden in the comparison test.");
  };
  try {
    const { results, report, meta } = await runLongMemEvalComparison({
      rootDir,
      datasetPath,
      outputDir,
      readerMode: "deterministic",
      memoryProviderMode: "mock",
      embeddingMode: "mock",
      judgeMode: "deterministic",
      fetch: forbidNetwork,
      commit: "compare-test",
      fixedNow: "2026-01-01T00:00:00.000Z",
      clock: fixedClock("2026-01-01T00:00:00.000Z"),
      timer: stepTimer(5)
    });

    assert.equal(results.length, 3);
    const byBackend = Object.fromEntries(results.map((r) => [r.backend, r.scoring]));
    assert.ok(byBackend["no-memory"] && byBackend.handoffbase && byBackend["raw-history"]);

    // The core signal: memory beats the no-memory floor on this fixture.
    assert.ok(
      byBackend.handoffbase.overall_accuracy > byBackend["no-memory"].overall_accuracy,
      "handoffbase must outscore the no-memory floor"
    );
    for (const scoring of Object.values(byBackend)) {
      assert.equal(scoring.official_qa_evaluator, false);
      assert.equal(scoring.scored_questions, 3);
      assert.equal(scoring.missing_hypotheses, 0);
    }

    assert.equal(meta.official_qa_evaluator, false);
    assert.match(report, /# LongMemEval comparison/);
    assert.match(report, /official_qa_evaluator/);
    assert.match(report, /no-memory \(floor\)/);
    assert.match(report, /raw-history \(full-context ceiling\)/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("buildComparisonMarkdown renders per-type rows only for present types", () => {
  const results = [
    {
      backend: "no-memory",
      scoring: {
        overall_accuracy: 0,
        correct: 0,
        scored_questions: 1,
        answered: { correct: 0, total: 1, accuracy: 0 },
        abstention: { correct: 0, total: 0, accuracy: null },
        accuracy_by_question_type: { "multi-session": { correct: 0, total: 1, accuracy: 0 } }
      }
    },
    {
      backend: "handoffbase",
      scoring: {
        overall_accuracy: 1,
        correct: 1,
        scored_questions: 1,
        answered: { correct: 1, total: 1, accuracy: 1 },
        abstention: { correct: 0, total: 0, accuracy: null },
        accuracy_by_question_type: { "multi-session": { correct: 1, total: 1, accuracy: 1 } }
      }
    }
  ];
  const markdown = buildComparisonMarkdown(results, {
    dataset: { filename: "d.json", sha256: "abcdef0123456789", selected_questions: 1 },
    reader_mode: "qwen",
    judge_label: "qwen-judge/qwen-max",
    embedding_mode: "qwen",
    memory_provider_mode: "mock",
    commit: "deadbeefcafebabe",
    official_qa_evaluator: false
  });
  assert.match(markdown, /multi-session/);
  assert.doesNotMatch(markdown, /temporal-reasoning/);
  assert.match(markdown, /reader `qwen`/);
});

test("parseCompareArgs applies defaults and validates backends", () => {
  const parsed = parseCompareArgs(["--dataset", "/d.json", "--output-dir", "/o"]);
  assert.equal(parsed.readerMode, "deterministic");
  assert.equal(parsed.judgeMode, "deterministic");
  assert.equal(parsed.embeddingMode, "off");
  assert.deepEqual(parsed.backends, ["no-memory", "handoffbase", "raw-history"]);

  const custom = parseCompareArgs(["--dataset", "/d.json", "--output-dir", "/o", "--backends", "no-memory,handoffbase"]);
  assert.deepEqual(custom.backends, ["no-memory", "handoffbase"]);

  assert.throws(() => parseCompareArgs(["--dataset", "/d.json", "--output-dir", "/o", "--backends", "bogus"]), /unknown backend/);
  assert.throws(() => parseCompareArgs(["--output-dir", "/o"]), /Missing required flag/);
  assert.throws(() => parseCompareArgs(["--dataset", "/d.json", "--output-dir", "/o", "--judge-model", "x"]), /requires --judge qwen/);
});
