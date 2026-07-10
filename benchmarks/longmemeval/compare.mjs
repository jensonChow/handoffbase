import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  LONGMEMEVAL_QUESTION_TYPES,
  loadLongMemEvalDataset,
  runLongMemEval,
  selectLongMemEvalQuestions
} from "./adapter.mjs";
import {
  createDeterministicExtractiveReader,
  createLocalHandoffBaseBoundary,
  createOpenAIChatReader,
  createQwenChatReader
} from "./local-runtime.mjs";
import {
  createDeterministicJudge,
  createOpenAIJudge,
  createQwenJudge,
  parseHypothesesJsonl,
  scoreLongMemEval
} from "./scorer.mjs";

function createReader(readerMode, env, fetch) {
  if (readerMode === "qwen") return createQwenChatReader({ env, fetch });
  if (readerMode === "openai") return createOpenAIChatReader({ env, fetch });
  return createDeterministicExtractiveReader();
}

function createJudge(judgeMode, env, fetch, model) {
  if (judgeMode === "qwen") return createQwenJudge({ env, fetch, model });
  if (judgeMode === "openai") return createOpenAIJudge({ env, fetch, model });
  return createDeterministicJudge();
}

export const LONGMEMEVAL_DEFAULT_BACKENDS = Object.freeze(["no-memory", "handoffbase", "raw-history"]);

const BACKEND_LABELS = Object.freeze({
  "no-memory": "no-memory (floor)",
  handoffbase: "handoffbase",
  "raw-history": "raw-history (full-context ceiling)"
});

/**
 * Run several backends over the same dataset selection, score each with one
 * judge, and assemble a comparison. Everything is injectable so CI can drive it
 * deterministically and offline. This does NOT write into any tracked doc: it
 * returns the report and writes it only under the caller's output directory, so
 * real numbers are reviewed before publication.
 */
export async function runLongMemEvalComparison(options) {
  const {
    rootDir,
    datasetPath,
    outputDir,
    backends = LONGMEMEVAL_DEFAULT_BACKENDS,
    readerMode = "deterministic",
    memoryProviderMode = "mock",
    embeddingMode = "off",
    judgeMode = "deterministic",
    judgeModel,
    limit,
    env,
    fetch,
    commit = "unknown",
    fixedNow,
    clock,
    timer
  } = options;

  const dataset = await loadLongMemEvalDataset(datasetPath);
  const selected = selectLongMemEvalQuestions(dataset.questions, limit === undefined ? {} : { limit });
  const judge = createJudge(judgeMode, env, fetch, judgeModel);

  const results = [];
  for (const backend of backends) {
    const backendOutputDir = path.join(outputDir, backend);
    const reader = createReader(readerMode, env, fetch);
    const memoryBoundary = backend === "handoffbase"
      ? await createLocalHandoffBaseBoundary({ rootDir, memoryProviderMode, embeddingMode, env, fetch, fixedNow })
      : undefined;

    await runLongMemEval({
      datasetPath,
      outputDir: backendOutputDir,
      backend,
      reader,
      memoryBoundary,
      commit,
      limit,
      clock,
      timer
    });

    const hypotheses = parseHypothesesJsonl(
      await readFile(path.join(backendOutputDir, "hypotheses.jsonl"), "utf8")
    );
    const scoring = await scoreLongMemEval({
      questions: selected,
      hypotheses,
      judge,
      dataset: { filename: dataset.filename, sha256: dataset.sha256 }
    });
    results.push({ backend, readerMode, memoryProviderMode, embeddingMode, scoring });
  }

  const meta = {
    dataset: { filename: dataset.filename, sha256: dataset.sha256, selected_questions: selected.length },
    reader_mode: readerMode,
    judge_label: judge.label ?? "custom-judge",
    embedding_mode: embeddingMode,
    memory_provider_mode: memoryProviderMode,
    commit,
    official_qa_evaluator: false
  };
  const report = buildComparisonMarkdown(results, meta);
  return { meta, results, report };
}

export function buildComparisonMarkdown(results, meta) {
  const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
  const cell = (bucket) => `${pct(bucket.accuracy)} (${bucket.correct}/${bucket.total})`;
  const lines = [];
  lines.push("# LongMemEval comparison");
  lines.push("");
  lines.push(
    `Methodology: dataset \`${meta.dataset.filename}\` (sha256 \`${short(meta.dataset.sha256)}\`, ` +
    `N=${meta.dataset.selected_questions}) · reader \`${meta.reader_mode}\` · judge \`${meta.judge_label}\` · ` +
    `handoffbase memory-provider \`${meta.memory_provider_mode}\` · embeddings \`${meta.embedding_mode}\` · ` +
    `commit \`${short(meta.commit)}\`.`
  );
  lines.push("");
  lines.push(
    "> **`official_qa_evaluator: false`.** These are judge-scored accuracies on a " +
    "subset, NOT the official LongMemEval GPT-4o evaluator leaderboard number."
  );
  lines.push("");
  lines.push("| Backend | Overall QA accuracy | Answered | Abstention |");
  lines.push("| --- | --- | --- | --- |");
  for (const result of results) {
    const s = result.scoring;
    lines.push(
      `| ${BACKEND_LABELS[result.backend] ?? result.backend} | ` +
      `${pct(s.overall_accuracy)} (${s.correct}/${s.scored_questions}) | ${cell(s.answered)} | ${cell(s.abstention)} |`
    );
  }
  lines.push("");

  const presentTypes = LONGMEMEVAL_QUESTION_TYPES.filter((type) =>
    results.some((result) => result.scoring.accuracy_by_question_type[type]?.total > 0)
  );
  if (presentTypes.length > 0) {
    lines.push("Per-question-type accuracy:");
    lines.push("");
    lines.push(`| Question type | ${results.map((r) => BACKEND_LABELS[r.backend] ?? r.backend).join(" | ")} |`);
    lines.push(`| --- | ${results.map(() => "---").join(" | ")} |`);
    for (const type of presentTypes) {
      const cells = results.map((result) => {
        const bucket = result.scoring.accuracy_by_question_type[type];
        return bucket && bucket.total > 0 ? cell(bucket) : "n/a";
      });
      lines.push(`| ${type} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function short(value) {
  if (typeof value !== "string" || value.length <= 12) {
    return value ?? "unknown";
  }
  return value.slice(0, 12);
}
