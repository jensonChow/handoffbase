#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LONGMEMEVAL_BACKENDS,
  LONGMEMEVAL_OUTPUT_FILES,
  runLongMemEval
} from "../../benchmarks/longmemeval/adapter.mjs";
import {
  createDeterministicExtractiveReader,
  createLocalHandoffBaseBoundary
} from "../../benchmarks/longmemeval/local-runtime.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");
const datasetPath = path.join(rootDir, "benchmarks/longmemeval/fixtures/tiny-longmemeval.json");

export async function runTinyLongMemEvalMatrix() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "handoffbase-longmemeval-tiny-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network access is forbidden in the LongMemEval tiny-fixture gate.");
  };

  try {
    const results = [];
    for (const backend of LONGMEMEVAL_BACKENDS) {
      const outputDir = path.join(temporaryRoot, backend);
      const reader = createDeterministicExtractiveReader();
      const memoryBoundary = backend === "handoffbase"
        ? await createLocalHandoffBaseBoundary({
            rootDir,
            memoryProviderMode: "mock",
            fixedNow: "2026-01-01T00:00:00.000Z"
          })
        : undefined;
      const result = await runLongMemEval({
        datasetPath,
        outputDir,
        backend,
        reader,
        memoryBoundary,
        commit: "tiny-fixture-ci",
        clock: fixedClock("2026-01-01T00:00:00.000Z"),
        timer: stepTimer(5)
      });
      const metadata = JSON.parse(
        await readFile(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.metadata), "utf8")
      );
      const summary = JSON.parse(
        await readFile(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.summary), "utf8")
      );
      assertTinyResult({ backend, result, metadata, summary });
      results.push({
        backend,
        completedQuestions: result.completedQuestions,
        selectedQuestions: result.selectedQuestions
      });
    }
    return results;
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function assertTinyResult({ backend, result, metadata, summary }) {
  const expectedMemoryProvider = backend === "handoffbase" ? "mock" : "none";
  const valid = result.status === "complete" &&
    result.selectedQuestions === 3 &&
    result.completedQuestions === 3 &&
    metadata.status === "complete" &&
    metadata.reader_mode === "deterministic" &&
    metadata.memory_provider_mode === expectedMemoryProvider &&
    metadata.evaluation_boundary?.official_qa_evaluator_run === false &&
    metadata.evaluation_boundary?.official_qa_score_present === false &&
    summary.completed_questions === 3 &&
    summary.reader_mode === "deterministic" &&
    summary.memory_provider_mode === expectedMemoryProvider &&
    summary.official_qa_evaluation?.run === false &&
    summary.official_qa_evaluation?.score === null;
  if (!valid) {
    throw new Error(`LongMemEval tiny-fixture assertions failed for backend ${backend}.`);
  }
}

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

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runTinyLongMemEvalMatrix()
    .then((results) => {
      const totalQuestions = results.reduce((total, result) => total + result.completedQuestions, 0);
      process.stdout.write(
        `LongMemEval tiny fixture: PASS (${totalQuestions}/${totalQuestions} question-runs; ` +
        "backends=no-memory,raw-history,handoffbase; reader=deterministic; " +
        "handoffbase-memory-provider=mock; official-evaluator=not-run).\n"
      );
    })
    .catch(() => {
      process.stderr.write("LongMemEval tiny fixture: FAIL.\n");
      process.exitCode = 1;
    });
}
