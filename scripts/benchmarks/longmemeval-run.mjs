#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LONGMEMEVAL_BACKENDS,
  LongMemEvalValidationError,
  runLongMemEval
} from "../../benchmarks/longmemeval/adapter.mjs";
import {
  LONGMEMEVAL_EMBEDDING_MODES,
  LONGMEMEVAL_MEMORY_PROVIDER_MODES,
  LONGMEMEVAL_READER_MODES,
  LongMemEvalRuntimeConfigurationError,
  createDeterministicExtractiveReader,
  createLocalHandoffBaseBoundary,
  createQwenChatReader
} from "../../benchmarks/longmemeval/local-runtime.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "../..");

export function parseLongMemEvalArgs(argv) {
  const options = {};
  const seen = new Set();
  const valueFlags = new Map([
    ["--dataset", "datasetPath"],
    ["--output-dir", "outputDir"],
    ["--backend", "backend"],
    ["--reader", "readerMode"],
    ["--memory-provider", "memoryProviderMode"],
    ["--embeddings", "embeddingMode"],
    ["--limit", "limit"],
    ["--question-id", "questionId"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      if (seen.has(argument)) {
        throw new LongMemEvalValidationError("Duplicate flag: --help.");
      }
      seen.add(argument);
      options.help = true;
      continue;
    }
    if (argument === "--resume") {
      if (seen.has(argument)) {
        throw new LongMemEvalValidationError("Duplicate flag: --resume.");
      }
      seen.add(argument);
      options.resume = true;
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
    if (Object.keys(options).length > 1) {
      throw new LongMemEvalValidationError("--help cannot be combined with run arguments.");
    }
    return options;
  }
  for (const required of ["datasetPath", "outputDir", "backend"]) {
    if (options[required] === undefined) {
      throw new LongMemEvalValidationError(`Missing required flag: ${flagFor(required)}.`);
    }
  }
  if (!LONGMEMEVAL_BACKENDS.includes(options.backend)) {
    throw new LongMemEvalValidationError("--backend must be no-memory, raw-history, or handoffbase.");
  }
  options.readerMode ??= "deterministic";
  options.memoryProviderMode ??= "mock";
  options.embeddingMode ??= "off";
  if (!LONGMEMEVAL_READER_MODES.includes(options.readerMode)) {
    throw new LongMemEvalValidationError("--reader must be deterministic or qwen.");
  }
  if (!LONGMEMEVAL_MEMORY_PROVIDER_MODES.includes(options.memoryProviderMode)) {
    throw new LongMemEvalValidationError("--memory-provider must be mock or qwen.");
  }
  if (!LONGMEMEVAL_EMBEDDING_MODES.includes(options.embeddingMode)) {
    throw new LongMemEvalValidationError("--embeddings must be off, mock, or qwen.");
  }
  if (options.backend !== "handoffbase" && options.memoryProviderMode !== "mock") {
    throw new LongMemEvalValidationError("--memory-provider qwen requires --backend handoffbase.");
  }
  if (options.backend !== "handoffbase" && options.embeddingMode !== "off") {
    throw new LongMemEvalValidationError("--embeddings requires --backend handoffbase.");
  }
  if (options.limit !== undefined) {
    if (!/^[1-9]\d*$/.test(options.limit)) {
      throw new LongMemEvalValidationError("--limit must be a positive integer.");
    }
    options.limit = Number(options.limit);
    if (!Number.isSafeInteger(options.limit)) {
      throw new LongMemEvalValidationError("--limit is too large.");
    }
  }
  options.resume ??= false;
  return options;
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  const args = parseLongMemEvalArgs(argv);
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }

  const reader = args.readerMode === "qwen"
    ? createQwenChatReader({ env: runtime.env, fetch: runtime.fetch })
    : createDeterministicExtractiveReader();
  const memoryBoundary = args.backend === "handoffbase"
    ? await createLocalHandoffBaseBoundary({
        rootDir,
        memoryProviderMode: args.memoryProviderMode,
        embeddingMode: args.embeddingMode,
        env: runtime.env,
        fetch: runtime.fetch,
        provider: runtime.memoryProvider
      })
    : undefined;
  const result = await runLongMemEval({
    ...args,
    reader,
    memoryBoundary,
    commit: currentCommit()
  });
  process.stdout.write(
    `LongMemEval adapter ${result.status}: ${result.completedQuestions}/${result.selectedQuestions} questions ` +
    `(reader=${args.readerMode}, memory-provider=${args.memoryProviderMode}, embeddings=${args.embeddingMode}).\n` +
    "Official hypotheses: hypotheses.jsonl; internal metrics: retrieval-evidence.jsonl and summary.json.\n" +
    "Score hypotheses with scripts/benchmarks/longmemeval-score.mjs to produce a QA accuracy number.\n"
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
  return {
    datasetPath: "--dataset",
    outputDir: "--output-dir",
    backend: "--backend"
  }[optionName];
}

function helpText() {
  return `Usage:
  node scripts/benchmarks/longmemeval-run.mjs \\
    --dataset /path/to/longmemeval_s_cleaned.json \\
    --output-dir /path/to/output \\
    --backend no-memory|raw-history|handoffbase \\
    [--reader deterministic|qwen] \\
    [--memory-provider mock|qwen] \\
    [--embeddings off|mock|qwen] \\
    [--limit N] [--question-id ID] [--resume]

Defaults are --reader deterministic, --memory-provider mock, and --embeddings
off. Those defaults are credential-free and deterministic. --embeddings mock|qwen
enables semantic recall (qwen requires QWEN_*/DASHSCOPE_* and applies only to
--backend handoffbase). Qwen modes read only the existing QWEN_*/DASHSCOPE_*
process environment conventions; the runner never loads an .env file or downloads
a dataset. Local handoffbase mode requires existing memory-core and server build
artifacts.
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    const message = error instanceof LongMemEvalValidationError ||
      error instanceof LongMemEvalRuntimeConfigurationError
      ? error.message
      : "The LongMemEval adapter run failed.";
    process.stderr.write(`LongMemEval adapter error: ${message}\n`);
    process.exitCode = 1;
  });
}
