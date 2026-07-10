#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LongMemEvalValidationError,
  loadLongMemEvalDataset
} from "../../benchmarks/longmemeval/adapter.mjs";
import {
  LONGMEMEVAL_JUDGE_MODES,
  LongMemEvalScoringError,
  createDeterministicJudge,
  createQwenJudge,
  parseHypothesesJsonl,
  scoreLongMemEval
} from "../../benchmarks/longmemeval/scorer.mjs";
import { LongMemEvalRuntimeConfigurationError } from "../../benchmarks/longmemeval/local-runtime.mjs";

const scriptPath = fileURLToPath(import.meta.url);

export function parseScoreArgs(argv) {
  const options = {};
  const seen = new Set();
  const valueFlags = new Map([
    ["--dataset", "datasetPath"],
    ["--hypotheses", "hypothesesPath"],
    ["--output", "outputPath"],
    ["--judge", "judgeMode"],
    ["--judge-model", "judgeModel"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    const optionName = valueFlags.get(argument);
    if (optionName === undefined) {
      throw new LongMemEvalValidationError(`Unknown argument: ${argument}.`);
    }
    if (seen.has(argument)) {
      throw new LongMemEvalValidationError(`Duplicate flag: ${argument}.`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new LongMemEvalValidationError(`${argument} requires a value.`);
    }
    seen.add(argument);
    options[optionName] = value;
    index += 1;
  }

  if (options.help) {
    return options;
  }
  for (const required of ["datasetPath", "hypothesesPath"]) {
    if (options[required] === undefined) {
      throw new LongMemEvalValidationError(`Missing required flag: ${flagFor(required)}.`);
    }
  }
  options.judgeMode ??= "deterministic";
  if (!LONGMEMEVAL_JUDGE_MODES.includes(options.judgeMode)) {
    throw new LongMemEvalValidationError("--judge must be deterministic or qwen.");
  }
  if (options.judgeModel !== undefined && options.judgeMode !== "qwen") {
    throw new LongMemEvalValidationError("--judge-model requires --judge qwen.");
  }
  return options;
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  const args = parseScoreArgs(argv);
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }

  const dataset = await loadLongMemEvalDataset(args.datasetPath);
  const hypothesesText = await readFile(args.hypothesesPath, "utf8");
  const hypotheses = parseHypothesesJsonl(hypothesesText);

  const judge = args.judgeMode === "qwen"
    ? createQwenJudge({ env: runtime.env, fetch: runtime.fetch, model: args.judgeModel })
    : createDeterministicJudge();

  const scoring = await scoreLongMemEval({
    questions: dataset.questions,
    hypotheses,
    judge,
    dataset: { filename: dataset.filename, sha256: dataset.sha256 }
  });

  if (args.outputPath !== undefined) {
    await atomicWriteJson(args.outputPath, scoring);
  }
  process.stdout.write(renderSummary(scoring));
}

function renderSummary(scoring) {
  const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
  const lines = [
    `LongMemEval scoring (judge=${scoring.judge_label}; official-evaluator=${scoring.official_qa_evaluator}).`,
    `Dataset: ${scoring.dataset.filename ?? "unknown"} (${scoring.dataset.total_questions} questions; scored ${scoring.scored_questions}, missing ${scoring.missing_hypotheses}).`,
    `Overall QA accuracy: ${pct(scoring.overall_accuracy)} (${scoring.correct}/${scoring.scored_questions}).`,
    `  answered:   ${pct(scoring.answered.accuracy)} (${scoring.answered.correct}/${scoring.answered.total})`,
    `  abstention: ${pct(scoring.abstention.accuracy)} (${scoring.abstention.correct}/${scoring.abstention.total})`,
    "By question type:"
  ];
  for (const [type, bucket] of Object.entries(scoring.accuracy_by_question_type)) {
    if (bucket.total > 0) {
      lines.push(`  ${type}: ${pct(bucket.accuracy)} (${bucket.correct}/${bucket.total})`);
    }
  }
  lines.push(
    "NOTE: judge-scored subset, NOT the official LongMemEval GPT-4o evaluator leaderboard number."
  );
  return `${lines.join("\n")}\n`;
}

function flagFor(optionName) {
  return { datasetPath: "--dataset", hypothesesPath: "--hypotheses" }[optionName];
}

function helpText() {
  return `Usage:
  node scripts/benchmarks/longmemeval-score.mjs \\
    --dataset /path/to/longmemeval_s.json \\
    --hypotheses /path/to/output/hypotheses.jsonl \\
    [--output /path/to/output/scoring.json] \\
    [--judge deterministic|qwen] [--judge-model qwen-max]

Scores LongMemEval hypotheses against gold answers. Default --judge
deterministic is credential-free and network-free (a coarse substring/abstention
proxy, NOT the official metric). --judge qwen uses the QWEN_*/DASHSCOPE_*
environment (default judge model qwen-max) to reproduce the official yes/no
correctness check in spirit; it is still an independent reimplementation, not the
official GPT-4o evaluator. The scorer never loads an .env file or downloads data.
`;
}

async function atomicWriteJson(filename, value) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, filename);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    const message = error instanceof LongMemEvalValidationError ||
      error instanceof LongMemEvalScoringError ||
      error instanceof LongMemEvalRuntimeConfigurationError
      ? error.message
      : "The LongMemEval scoring run failed.";
    process.stderr.write(`LongMemEval scoring error: ${message}\n`);
    process.exitCode = 1;
  });
}
