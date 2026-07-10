#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LONGMEMEVAL_BACKENDS,
  LongMemEvalValidationError
} from "../../benchmarks/longmemeval/adapter.mjs";
import {
  LONGMEMEVAL_EMBEDDING_MODES,
  LONGMEMEVAL_MEMORY_PROVIDER_MODES,
  LONGMEMEVAL_READER_MODES,
  LongMemEvalRuntimeConfigurationError
} from "../../benchmarks/longmemeval/local-runtime.mjs";
import { LONGMEMEVAL_JUDGE_MODES, LongMemEvalScoringError } from "../../benchmarks/longmemeval/scorer.mjs";
import {
  LONGMEMEVAL_DEFAULT_BACKENDS,
  runLongMemEvalComparison
} from "../../benchmarks/longmemeval/compare.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");

export function parseCompareArgs(argv) {
  const options = {};
  const seen = new Set();
  const valueFlags = new Map([
    ["--dataset", "datasetPath"],
    ["--output-dir", "outputDir"],
    ["--reader", "readerMode"],
    ["--memory-provider", "memoryProviderMode"],
    ["--embeddings", "embeddingMode"],
    ["--judge", "judgeMode"],
    ["--judge-model", "judgeModel"],
    ["--limit", "limit"],
    ["--backends", "backends"]
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
  for (const required of ["datasetPath", "outputDir"]) {
    if (options[required] === undefined) {
      throw new LongMemEvalValidationError(`Missing required flag: ${flagFor(required)}.`);
    }
  }
  options.readerMode ??= "deterministic";
  options.memoryProviderMode ??= "mock";
  options.embeddingMode ??= "off";
  options.judgeMode ??= "deterministic";
  if (!LONGMEMEVAL_READER_MODES.includes(options.readerMode)) {
    throw new LongMemEvalValidationError("--reader must be deterministic or qwen.");
  }
  if (!LONGMEMEVAL_MEMORY_PROVIDER_MODES.includes(options.memoryProviderMode)) {
    throw new LongMemEvalValidationError("--memory-provider must be mock or qwen.");
  }
  if (!LONGMEMEVAL_EMBEDDING_MODES.includes(options.embeddingMode)) {
    throw new LongMemEvalValidationError("--embeddings must be off, mock, or qwen.");
  }
  if (!LONGMEMEVAL_JUDGE_MODES.includes(options.judgeMode)) {
    throw new LongMemEvalValidationError("--judge must be deterministic or qwen.");
  }
  if (options.judgeModel !== undefined && options.judgeMode !== "qwen") {
    throw new LongMemEvalValidationError("--judge-model requires --judge qwen.");
  }
  if (options.limit !== undefined) {
    if (!/^[1-9]\d*$/.test(options.limit)) {
      throw new LongMemEvalValidationError("--limit must be a positive integer.");
    }
    options.limit = Number(options.limit);
  }
  if (options.backends !== undefined) {
    const parsed = options.backends.split(",").map((value) => value.trim()).filter(Boolean);
    for (const backend of parsed) {
      if (!LONGMEMEVAL_BACKENDS.includes(backend)) {
        throw new LongMemEvalValidationError(`--backends contains an unknown backend: ${backend}.`);
      }
    }
    if (parsed.length === 0 || new Set(parsed).size !== parsed.length) {
      throw new LongMemEvalValidationError("--backends must be a non-empty, unique, comma-separated list.");
    }
    options.backends = parsed;
  } else {
    options.backends = [...LONGMEMEVAL_DEFAULT_BACKENDS];
  }
  return options;
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  const args = parseCompareArgs(argv);
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }

  const { report } = await runLongMemEvalComparison({
    rootDir,
    datasetPath: args.datasetPath,
    outputDir: args.outputDir,
    backends: args.backends,
    readerMode: args.readerMode,
    memoryProviderMode: args.memoryProviderMode,
    embeddingMode: args.embeddingMode,
    judgeMode: args.judgeMode,
    judgeModel: args.judgeModel,
    limit: args.limit,
    env: runtime.env,
    fetch: runtime.fetch,
    commit: currentCommit()
  });

  await atomicWriteText(path.join(args.outputDir, "comparison.md"), report);
  process.stdout.write(report);
  process.stdout.write(
    `\nWrote ${path.join(args.outputDir, "comparison.md")}. Review before pasting any numbers into docs/benchmark-results.md.\n`
  );
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
}

function flagFor(optionName) {
  return { datasetPath: "--dataset", outputDir: "--output-dir" }[optionName];
}

function helpText() {
  return `Usage:
  node scripts/benchmarks/longmemeval-compare.mjs \\
    --dataset /path/to/longmemeval_s.json \\
    --output-dir /path/to/results \\
    [--reader deterministic|qwen] [--memory-provider mock|qwen] \\
    [--embeddings off|mock|qwen] [--judge deterministic|qwen] [--judge-model qwen-max] \\
    [--limit N] [--backends no-memory,handoffbase,raw-history]

Runs each backend over the same dataset selection, scores every run with one
judge, and writes a markdown comparison table (comparison.md) plus each backend's
hypotheses/scoring under --output-dir. Defaults are fully deterministic and
credential-free. For a real number use --reader qwen --embeddings qwen --judge
qwen and export QWEN_API_KEY/DASHSCOPE_API_KEY. This never writes into a tracked
doc; review comparison.md before publishing any figure.
`;
}

async function atomicWriteText(filename, value) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, filename);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    const message = error instanceof LongMemEvalValidationError ||
      error instanceof LongMemEvalScoringError ||
      error instanceof LongMemEvalRuntimeConfigurationError
      ? error.message
      : "The LongMemEval comparison run failed.";
    process.stderr.write(`LongMemEval comparison error: ${message}\n`);
    process.exitCode = 1;
  });
}
