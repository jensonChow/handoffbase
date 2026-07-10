import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LONGMEMEVAL_OUTPUT_FILES,
  LongMemEvalRunError,
  LongMemEvalValidationError,
  loadLongMemEvalDataset,
  parseLongMemEvalTimestamp,
  runLongMemEval,
  selectLongMemEvalQuestions,
  validateLongMemEvalDataset
} from "../benchmarks/longmemeval/adapter.mjs";
import {
  LongMemEvalQwenReaderError,
  LongMemEvalRuntimeConfigurationError,
  createDeterministicExtractiveReader,
  createLocalHandoffBaseBoundary,
  createQwenChatReader,
  resolveQwenRuntimeConfig
} from "../benchmarks/longmemeval/local-runtime.mjs";
import { parseLongMemEvalArgs } from "../scripts/benchmarks/longmemeval-run.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "benchmarks/longmemeval/fixtures/tiny-longmemeval.json");
const outputNames = Object.values(LONGMEMEVAL_OUTPUT_FILES);

test("validates the official shape, preserves positional alignment, and strips evaluator labels", async () => {
  const dataset = await loadLongMemEvalDataset(fixturePath);
  assert.equal(dataset.questions.length, 3);
  assert.match(dataset.sha256, /^[a-f0-9]{64}$/);

  const [alpha] = dataset.questions;
  assert.deepEqual(alpha.sessions.map((session) => session.id), [
    "filler_synthetic_alpha",
    "answer_synthetic_alpha"
  ]);
  assert.deepEqual(alpha.sessions[0].turns[0], {
    role: "user",
    content: "Project Atlas dashboard should use a monospace font."
  });
  assert.equal(Object.hasOwn(alpha.sessions[0].turns[0], "has_answer"), false);

  const raw = JSON.parse(await readFile(fixturePath, "utf8"));
  raw[0].answer = 42;
  raw[0].haystack_session_ids[1] = raw[0].haystack_session_ids[0];
  raw[0].answer_session_ids = [raw[0].haystack_session_ids[0]];
  assert.doesNotThrow(() => validateLongMemEvalDataset(raw));

  assert.equal(parseLongMemEvalTimestamp("2025/01/15 (Wed) 10:00"), Date.UTC(2025, 0, 15, 10, 0));
  assert.equal(parseLongMemEvalTimestamp("2025-01-15T10:00:00+08:00"), Date.UTC(2025, 0, 15, 2, 0));
});

test("rejects malformed official fields before a run can mutate outputs", async (t) => {
  const source = JSON.parse(await readFile(fixturePath, "utf8"));
  const cases = [
    ["missing question_id", (data) => { delete data[0].question_id; }],
    ["duplicate question_id", (data) => { data[1].question_id = data[0].question_id; }],
    ["unsupported question type", (data) => { data[0].question_type = "abstention"; }],
    ["null answer", (data) => { data[0].answer = null; }],
    ["bad parallel lengths", (data) => { data[0].haystack_dates.pop(); }],
    ["bad calendar date", (data) => { data[0].haystack_dates[0] = "2025/02/30 (Sun) 12:00"; }],
    ["bad weekday", (data) => { data[0].haystack_dates[0] = "2025/01/12 (Mon) 14:30"; }],
    ["bad role", (data) => { data[0].haystack_sessions[0][0].role = "system"; }],
    ["bad content", (data) => { data[0].haystack_sessions[0][0].content = ""; }],
    ["bad has_answer", (data) => { data[0].haystack_sessions[0][0].has_answer = "yes"; }],
    ["unknown evidence id", (data) => { data[0].answer_session_ids = ["missing_session"]; }],
    ["unlisted evidence label", (data) => { data[0].answer_session_ids = []; }],
    ["evidence without label", (data) => { delete data[0].haystack_sessions[0][0].has_answer; }],
    ["abstention with evidence", (data) => {
      data[2].answer_session_ids = [data[2].haystack_session_ids[0]];
      data[2].haystack_sessions[0][0].has_answer = true;
    }]
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const data = structuredClone(source);
      mutate(data);
      assert.throws(() => validateLongMemEvalDataset(data), LongMemEvalValidationError);
    });
  }

  const temp = await makeTempDir(t);
  const badDataset = path.join(temp, "invalid.json");
  const outputDir = path.join(temp, "output");
  await writeFile(badDataset, "{not json", "utf8");
  await assert.rejects(
    runLongMemEval(baseRunOptions({ datasetPath: badDataset, outputDir, backend: "no-memory" })),
    LongMemEvalValidationError
  );
  await assert.rejects(readdir(outputDir), (error) => error.code === "ENOENT");
});

test("runs all three backends with isolated scopes and evaluator-compatible output", async (t) => {
  for (const backend of ["no-memory", "raw-history", "handoffbase"]) {
    await t.test(backend, async () => {
      const temp = await makeTempDir(t);
      const outputDir = path.join(temp, backend);
      const reader = createFakeReader();
      const memoryBoundary = createFakeMemoryBoundary();
      const result = await runLongMemEval(baseRunOptions({
        outputDir,
        backend,
        reader,
        memoryBoundary: backend === "handoffbase" ? memoryBoundary : undefined
      }));

      assert.equal(result.status, "complete");
      assert.equal(result.completedQuestions, 3);
      const hypotheses = await readJsonl(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.hypotheses));
      assert.equal(hypotheses.length, 3);
      for (const hypothesis of hypotheses) {
        assert.deepEqual(Object.keys(hypothesis), ["question_id", "hypothesis"]);
      }
      const expected = backend === "no-memory"
        ? ["I don't know.", "I don't know.", "I don't know."]
        : ["Juniper", "Saffron", "I don't know."];
      assert.deepEqual(hypotheses.map((entry) => entry.hypothesis), expected);

      const retrieval = await readJsonl(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.retrieval));
      assert.equal(retrieval.length, 3);
      assert.equal(retrieval[2].internal_pre_context_retrieval_metrics.evaluable, false);
      assert.equal(retrieval[2].internal_pre_context_retrieval_metrics.precision_at_k, null);
      if (backend === "raw-history") {
        assert.deepEqual(retrieval[0].retrieved_session_ids, [
          "filler_synthetic_alpha",
          "answer_synthetic_alpha"
        ]);
        assert.deepEqual(retrieval[0].reader_context_session_ids, retrieval[0].retrieved_session_ids);
        assert.equal(retrieval[0].internal_pre_context_retrieval_metrics.precision_at_k, 0.5);
        assert.equal(retrieval[0].internal_pre_context_retrieval_metrics.recall_at_k, 1);
      }
      if (backend === "handoffbase") {
        assert.deepEqual(retrieval[0].retrieved_session_ids, ["answer_synthetic_alpha"]);
        assert.deepEqual(retrieval[1].retrieved_session_ids, ["answer_synthetic_beta"]);
        assert.deepEqual(retrieval[0].reader_context_session_ids, ["answer_synthetic_alpha"]);
        assert.equal(retrieval[0].reader_context_mapping.complete, true);
        assert.equal(retrieval[0].trace_id_present, true);
        assert.equal(retrieval[0].internal_pre_context_retrieval_metrics.precision_at_k, 1);
        assert.equal(retrieval[0].internal_pre_context_retrieval_metrics.recall_at_k, 1);
        assert.equal(memoryBoundary.rememberCalls.length, 5);
        assert.equal(memoryBoundary.recallCalls.length, 3);
        assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.input.scopes.tenant_id)).size, 3);
        assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.input.scopes.user_id)).size, 3);
        assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.input.scopes.project_id)).size, 3);
        for (const call of memoryBoundary.rememberCalls) {
          assert.equal(call.input.source, "task_note");
          assert.equal(call.input.approval_mode, "active");
          assert.equal(Object.hasOwn(call.input.scopes, "session_id"), false);
          assert.doesNotMatch(call.input.content, /has_answer|answer_synthetic/);
          assert.match(call.context.idempotency_key, /^[a-f0-9]{64}$/);
        }
      } else {
        assert.equal(memoryBoundary.rememberCalls.length, 0);
        assert.equal(memoryBoundary.recallCalls.length, 0);
      }

      for (const input of reader.calls) {
        assert.equal(Object.hasOwn(input.question, "answer"), false);
        assert.equal(Object.hasOwn(input.question, "answer_session_ids"), false);
        assert.equal(Object.hasOwn(input.question, "question_id"), false);
        assert.equal(Object.hasOwn(input.question, "question_type"), false);
        assert.equal(Object.hasOwn(input, "backend"), false);
        assert.doesNotMatch(JSON.stringify(input), /has_answer|answer_synthetic|longmemeval_session_ref/);
      }

      const metadata = JSON.parse(await readFile(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.metadata), "utf8"));
      assert.equal(metadata.commit, "test-commit");
      assert.equal(metadata.backend, backend);
      assert.equal(metadata.model_label, "deterministic-fake-reader");
      assert.equal(
        metadata.memory_boundary_label,
        backend === "handoffbase" ? "deterministic-fake-memory-boundary" : "none"
      );
      assert.equal(metadata.evaluation_boundary.official_qa_evaluator_run, false);
      assert.equal(metadata.evaluation_boundary.internal_retrieval_metrics_only, true);
      assert.equal(metadata.token_counters.reader.total_tokens, 36);
      assert.equal(metadata.token_counters.memory_boundary.total_tokens, backend === "handoffbase" ? 29 : 0);
      assert.equal(metadata.timing.duration_ms, 15);
      const summary = JSON.parse(await readFile(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.summary), "utf8"));
      assert.equal(summary.official_qa_evaluation.run, false);
      assert.equal(summary.official_qa_evaluation.score, null);
      assert.match(summary.internal_pre_context_retrieval_metrics.label, /not reader-context metrics/);
    });
  }
});

test("selection and CLI parsing are strict and deterministic", async () => {
  const dataset = await loadLongMemEvalDataset(fixturePath);
  assert.deepEqual(
    selectLongMemEvalQuestions(dataset.questions, { limit: 1 }).map((question) => question.questionId),
    ["synthetic_alpha"]
  );
  assert.deepEqual(
    selectLongMemEvalQuestions(dataset.questions, { questionId: "synthetic_beta", limit: 1 })
      .map((question) => question.questionId),
    ["synthetic_beta"]
  );
  assert.throws(
    () => selectLongMemEvalQuestions(dataset.questions, { questionId: "missing" }),
    /question_id not found/
  );

  assert.deepEqual(parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--output-dir", "/tmp/lme-output",
    "--backend", "raw-history",
    "--limit", "2",
    "--question-id", "synthetic_beta",
    "--resume"
  ]), {
    datasetPath: fixturePath,
    outputDir: "/tmp/lme-output",
    backend: "raw-history",
    readerMode: "deterministic",
    memoryProviderMode: "mock",
    limit: 2,
    questionId: "synthetic_beta",
    resume: true
  });
  assert.deepEqual(parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--output-dir", "/tmp/lme-qwen-output",
    "--backend", "handoffbase",
    "--reader", "qwen",
    "--memory-provider", "qwen"
  ]), {
    datasetPath: fixturePath,
    outputDir: "/tmp/lme-qwen-output",
    backend: "handoffbase",
    readerMode: "qwen",
    memoryProviderMode: "qwen",
    resume: false
  });
  assert.deepEqual(parseLongMemEvalArgs(["--help"]), { help: true });
  assert.throws(() => parseLongMemEvalArgs(["--dataset", fixturePath]), /Missing required flag/);
  assert.throws(() => parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--dataset", fixturePath,
    "--output-dir", "/tmp/out",
    "--backend", "raw-history"
  ]), /Duplicate flag/);
  assert.throws(() => parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--output-dir", "/tmp/out",
    "--backend", "unknown"
  ]), /--backend/);
  assert.throws(() => parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--output-dir", "/tmp/out",
    "--backend", "raw-history",
    "--limit", "0"
  ]), /--limit/);
  assert.throws(() => parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--output-dir", "/tmp/out",
    "--backend", "raw-history",
    "--memory-provider", "qwen"
  ]), /requires --backend handoffbase/);
  assert.throws(() => parseLongMemEvalArgs([
    "--dataset", fixturePath,
    "--output-dir", "/tmp/out",
    "--backend", "handoffbase",
    "--reader", "unknown"
  ]), /--reader/);
  await assert.rejects(loadLongMemEvalDataset("https://example.test/longmemeval.json"), /local file path/);
});

test("resume repairs artifacts, skips completed questions, and never duplicates hypotheses", async (t) => {
  const temp = await makeTempDir(t);
  const outputDir = path.join(temp, "resume-output");
  const firstReader = createFakeReader();
  await runLongMemEval(baseRunOptions({ outputDir, backend: "raw-history", reader: firstReader }));
  const originals = await readAllOutputs(outputDir);

  await writeFile(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.hypotheses), "{truncated", "utf8");
  await writeFile(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.retrieval), "", "utf8");
  const skipReader = {
    modelLabel: "deterministic-fake-reader",
    async generate() {
      throw new Error("completed questions must be skipped");
    }
  };
  const result = await runLongMemEval(baseRunOptions({
    outputDir,
    backend: "raw-history",
    reader: skipReader,
    resume: true,
    clock: () => { throw new Error("no-op resume must preserve timestamps"); },
    timer: () => { throw new Error("no-op resume must not time completed questions"); }
  }));
  assert.equal(result.completedQuestions, 3);
  assert.deepEqual(await readAllOutputs(outputDir), originals);
  assert.equal((await readJsonl(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.hypotheses))).length, 3);

  await assert.rejects(
    runLongMemEval(baseRunOptions({ outputDir, backend: "raw-history", reader: createFakeReader() })),
    /Output already exists/
  );

  const statePath = path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.state);
  const corruptState = JSON.parse(await readFile(statePath, "utf8"));
  delete corruptState.records.synthetic_alpha.hypothesis;
  await writeFile(statePath, `${JSON.stringify(corruptState)}\n`, "utf8");
  await assert.rejects(
    runLongMemEval(baseRunOptions({
      outputDir,
      backend: "raw-history",
      reader: createFakeReader(),
      resume: true
    })),
    /hypothesis/
  );
});

test("interrupted runs resume only unfinished questions and reject mismatched state", async (t) => {
  const temp = await makeTempDir(t);
  const outputDir = path.join(temp, "interrupted");
  const failingReader = createFakeReader({ failOnCall: 2 });
  await assert.rejects(
    runLongMemEval(baseRunOptions({ outputDir, backend: "raw-history", reader: failingReader })),
    LongMemEvalRunError
  );
  assert.deepEqual(
    (await readJsonl(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.hypotheses))).map((item) => item.question_id),
    ["synthetic_alpha"]
  );

  const resumeReader = createFakeReader();
  await runLongMemEval(baseRunOptions({
    outputDir,
    backend: "raw-history",
    reader: resumeReader,
    resume: true,
    clock: fixedClock("2026-01-02T00:00:00.000Z")
  }));
  assert.deepEqual(resumeReader.calls.map((input) => input.question.question), [
    "What garden codename did I choose for Project Birch?",
    "What telescope model did I buy?"
  ]);
  assert.deepEqual(
    (await readJsonl(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.hypotheses))).map((item) => item.question_id),
    ["synthetic_alpha", "synthetic_beta", "synthetic_gamma_abs"]
  );

  await assert.rejects(
    runLongMemEval(baseRunOptions({
      outputDir,
      backend: "no-memory",
      reader: createFakeReader(),
      resume: true
    })),
    /Resume state backend/
  );

  const changedDataset = path.join(temp, "tiny-longmemeval.json");
  const changed = JSON.parse(await readFile(fixturePath, "utf8"));
  changed[0].question = `${changed[0].question} changed`;
  await writeFile(changedDataset, `${JSON.stringify(changed)}\n`, "utf8");
  await assert.rejects(
    runLongMemEval(baseRunOptions({
      datasetPath: changedDataset,
      outputDir,
      backend: "raw-history",
      reader: createFakeReader(),
      resume: true
    })),
    /Resume state dataset digest/
  );

  await assert.rejects(
    runLongMemEval(baseRunOptions({
      outputDir,
      backend: "raw-history",
      reader: createFakeReader(),
      resume: true,
      commit: "different-commit"
    })),
    /Resume state commit/
  );
  await assert.rejects(
    runLongMemEval(baseRunOptions({
      outputDir,
      backend: "raw-history",
      reader: createFakeReader(),
      resume: true,
      retrievalLimit: 5
    })),
    /Resume state retrieval limit/
  );
});

test("handoffbase retries interrupted questions without duplicate memory writes", async (t) => {
  const temp = await makeTempDir(t);
  const outputDir = path.join(temp, "handoffbase-interrupted");
  const memoryBoundary = createFakeMemoryBoundary();
  await assert.rejects(
    runLongMemEval(baseRunOptions({
      outputDir,
      backend: "handoffbase",
      reader: createFakeReader({ failOnCall: 2 }),
      memoryBoundary
    })),
    LongMemEvalRunError
  );
  assert.equal(memoryBoundary.uniqueWriteCount, 4);

  const resumeReader = createFakeReader();
  await runLongMemEval(baseRunOptions({
    outputDir,
    backend: "handoffbase",
    reader: resumeReader,
    memoryBoundary,
    resume: true
  }));
  assert.equal(memoryBoundary.uniqueWriteCount, 5);
  assert.equal(memoryBoundary.rememberCalls.length, 7);
  assert.deepEqual(resumeReader.calls.map((input) => input.question.question), [
    "What garden codename did I choose for Project Birch?",
    "What telescope model did I buy?"
  ]);
  assert.equal((await readJsonl(path.join(outputDir, LONGMEMEVAL_OUTPUT_FILES.hypotheses))).length, 3);
});

test("distinct run fingerprints isolate persistent scopes and idempotency receipts", async (t) => {
  const temp = await makeTempDir(t);
  const memoryBoundary = createFakeMemoryBoundary();
  await runLongMemEval(baseRunOptions({
    outputDir: path.join(temp, "run-a"),
    backend: "handoffbase",
    reader: createFakeReader(),
    memoryBoundary,
    limit: 1,
    commit: "commit-a"
  }));
  await runLongMemEval(baseRunOptions({
    outputDir: path.join(temp, "run-b"),
    backend: "handoffbase",
    reader: createFakeReader(),
    memoryBoundary,
    limit: 1,
    commit: "commit-b"
  }));

  assert.equal(memoryBoundary.uniqueWriteCount, 4);
  assert.equal(memoryBoundary.rememberCalls.length, 4);
  assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.context.idempotency_key)).size, 4);
  assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.input.scopes.tenant_id)).size, 2);
  assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.input.scopes.user_id)).size, 2);
  assert.equal(new Set(memoryBoundary.rememberCalls.map((call) => call.input.scopes.project_id)).size, 2);
});

test("deterministic adapters do not read env values, fetch, or embed local paths in artifacts", async (t) => {
  const temp = await makeTempDir(t);
  const outputA = path.join(temp, "deterministic-a");
  const outputB = path.join(temp, "deterministic-b");
  const sentinel = "SECRET_SENTINEL_LONGMEMEVAL_4f6a";
  const previous = {
    qwen: process.env.QWEN_API_KEY,
    dashscope: process.env.DASHSCOPE_API_KEY,
    custom: process.env.LME_TEST_SENTINEL,
    fetch: globalThis.fetch
  };
  process.env.QWEN_API_KEY = sentinel;
  process.env.DASHSCOPE_API_KEY = sentinel;
  process.env.LME_TEST_SENTINEL = sentinel;
  globalThis.fetch = async () => { throw new Error("network access is forbidden"); };
  t.after(() => {
    restoreEnv("QWEN_API_KEY", previous.qwen);
    restoreEnv("DASHSCOPE_API_KEY", previous.dashscope);
    restoreEnv("LME_TEST_SENTINEL", previous.custom);
    globalThis.fetch = previous.fetch;
  });

  for (const outputDir of [outputA, outputB]) {
    await runLongMemEval(baseRunOptions({
      outputDir,
      backend: "handoffbase",
      reader: createFakeReader(),
      memoryBoundary: createFakeMemoryBoundary()
    }));
  }
  assert.deepEqual(await readAllOutputs(outputA), await readAllOutputs(outputB));

  const serialized = Object.values(await readAllOutputs(outputA)).join("\n");
  assert.doesNotMatch(serialized, new RegExp(sentinel));
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(temp)));
  assert.doesNotMatch(serialized, /QWEN_API_KEY|DASHSCOPE_API_KEY|LME_TEST_SENTINEL/);
  assert.doesNotMatch(serialized, /Project Atlas dashboard should use a monospace font/);
});

test("the bundled reader is deterministic and remains honest without context", async () => {
  const reader = createDeterministicExtractiveReader();
  const empty = await reader.generate({
    question: { question: "What launch codename did I choose?" },
    context: { text: "" }
  });
  assert.equal(empty.hypothesis, "I don't know.");
  const extracted = await reader.generate({
    question: { question: "What launch codename did I choose?" },
    context: { text: "Date: 2025/01/12 (Sun) 14:30\nuser: I chose the launch codename Juniper." }
  });
  assert.equal(extracted.hypothesis, "I chose the launch codename Juniper.");
  assert.equal(extracted.usage.total_tokens, extracted.usage.input_tokens + extracted.usage.output_tokens);
});

test("Qwen runtime configuration follows existing env aliases without exposing values in errors", () => {
  const config = resolveQwenRuntimeConfig({
    QWEN_API_KEY: "unit-test-primary-credential",
    DASHSCOPE_API_KEY: "unit-test-fallback-credential",
    QWEN_BASE_URL: "https://reader.example.test/compatible-mode/v1/",
    DASHSCOPE_BASE_URL: "https://ignored.example.test/v1",
    QWEN_MODEL: "qwen-plus-test",
    DASHSCOPE_MODEL: "ignored-model",
    QWEN_TIMEOUT_MS: "45000"
  });
  assert.equal(config.apiKey, "unit-test-primary-credential");
  assert.equal(config.baseUrl, "https://reader.example.test/compatible-mode/v1/");
  assert.equal(config.model, "qwen-plus-test");
  assert.equal(config.timeoutMs, 45_000);

  assert.throws(
    () => resolveQwenRuntimeConfig({}),
    (error) => error instanceof LongMemEvalRuntimeConfigurationError &&
      /QWEN_API_KEY or DASHSCOPE_API_KEY/.test(error.message)
  );
  const invalidSecret = "unit-test-value-that-must-not-appear";
  assert.throws(
    () => resolveQwenRuntimeConfig({
      DASHSCOPE_API_KEY: invalidSecret,
      DASHSCOPE_BASE_URL: `https://${invalidSecret}@reader.example.test/v1`
    }),
    (error) => error instanceof LongMemEvalRuntimeConfigurationError &&
      !error.message.includes(invalidSecret)
  );
});

test("injectable Qwen reader uses fake fetch, records only a model label, and keeps failures secret-safe", async (t) => {
  const temp = await makeTempDir(t);
  const outputDir = path.join(temp, "qwen-reader-output");
  const credential = "unit-test-reader-credential";
  const calls = [];
  const reader = createQwenChatReader({
    env: {
      DASHSCOPE_API_KEY: credential,
      DASHSCOPE_BASE_URL: "https://reader.example.test/compatible-mode/v1",
      DASHSCOPE_MODEL: "qwen-plus-test"
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: "Juniper" } }],
            usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 }
          });
        }
      };
    }
  });

  await runLongMemEval(baseRunOptions({
    outputDir,
    backend: "no-memory",
    reader,
    limit: 1
  }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://reader.example.test/compatible-mode/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${credential}`);
  const request = JSON.parse(calls[0].init.body);
  assert.equal(request.model, "qwen-plus-test");
  assert.doesNotMatch(request.messages[1].content, /synthetic_alpha|answer_synthetic_alpha/);

  const artifacts = await readAllOutputs(outputDir);
  const serialized = Object.values(artifacts).join("\n");
  assert.doesNotMatch(serialized, new RegExp(credential));
  const metadata = JSON.parse(artifacts[LONGMEMEVAL_OUTPUT_FILES.metadata]);
  assert.equal(metadata.reader_mode, "qwen");
  assert.equal(metadata.model_label, "qwen-chat/qwen-plus-test");
  assert.equal(metadata.memory_provider_mode, "none");
  assert.equal(metadata.evaluation_boundary.official_qa_evaluator_run, false);

  const responseSecret = "unit-test-response-secret";
  const failingReader = createQwenChatReader({
    env: { QWEN_API_KEY: credential },
    fetch: async () => ({
      ok: false,
      status: 401,
      async text() {
        return responseSecret;
      }
    })
  });
  await assert.rejects(
    failingReader.generate({
      question: { question: "What did I choose?", question_date: "2025-01-01T00:00:00.000Z" },
      context: { text: "user: I chose Juniper." }
    }),
    (error) => error instanceof LongMemEvalQwenReaderError &&
      error.status === 401 &&
      !error.message.includes(credential) &&
      !error.message.includes(responseSecret)
  );

  const echoingReader = createQwenChatReader({
    env: { QWEN_API_KEY: credential },
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ choices: [{ message: { content: credential } }] });
      }
    })
  });
  await assert.rejects(
    echoingReader.generate({
      question: { question: "What did I choose?", question_date: "2025-01-01T00:00:00.000Z" },
      context: { text: "user: I chose Juniper." }
    }),
    (error) => error instanceof LongMemEvalQwenReaderError &&
      /credential material/.test(error.message) &&
      !error.message.includes(credential)
  );
});

test("local HandoffBase boundary can explicitly construct QwenMemoryProvider without a network call", async () => {
  let fetchCalls = 0;
  const boundary = await createLocalHandoffBaseBoundary({
    rootDir: repoRoot,
    memoryProviderMode: "qwen",
    env: {
      QWEN_API_KEY: "unit-test-memory-provider-credential",
      QWEN_MODEL: "qwen-plus-test"
    },
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("fake fetch should not be called during construction");
    }
  });
  assert.equal(boundary.providerMode, "qwen");
  assert.equal(boundary.label, "local-continuity-memory-service/qwen-provider/in-memory");
  assert.equal(boundary.supportsIdempotency, true);
  assert.equal(fetchCalls, 0);

  await assert.rejects(
    createLocalHandoffBaseBoundary({
      rootDir: repoRoot,
      memoryProviderMode: "qwen",
      env: {},
      fetch: async () => { throw new Error("network access is forbidden"); }
    }),
    LongMemEvalRuntimeConfigurationError
  );
});

function baseRunOptions(overrides = {}) {
  return {
    datasetPath: overrides.datasetPath ?? fixturePath,
    outputDir: overrides.outputDir,
    backend: overrides.backend,
    reader: overrides.reader ?? createFakeReader(),
    memoryBoundary: overrides.memoryBoundary,
    questionId: overrides.questionId,
    limit: overrides.limit,
    resume: overrides.resume ?? false,
    commit: overrides.commit ?? "test-commit",
    retrievalLimit: overrides.retrievalLimit,
    tokenBudget: overrides.tokenBudget,
    clock: overrides.clock ?? fixedClock("2026-01-01T00:00:00.000Z"),
    timer: overrides.timer ?? stepTimer(5)
  };
}

function createFakeReader(options = {}) {
  const calls = [];
  let callCount = 0;
  return {
    modelLabel: "deterministic-fake-reader",
    calls,
    async generate(input) {
      callCount += 1;
      calls.push(structuredClone(input));
      if (callCount === options.failOnCall) {
        throw new Error("synthetic reader interruption");
      }
      const context = input.context.text;
      const hypothesis = context.includes("Juniper")
        ? "Juniper"
        : context.includes("Saffron")
          ? "Saffron"
          : "I don't know.";
      return {
        hypothesis,
        usage: {
          input_tokens: 10,
          output_tokens: 2,
          total_tokens: 12,
          counting: "reported"
        }
      };
    }
  };
}

function createFakeMemoryBoundary() {
  const memories = new Map();
  const receipts = new Map();
  const rememberCalls = [];
  const recallCalls = [];
  const boundary = {
    label: "deterministic-fake-memory-boundary",
    supportsIdempotency: true,
    rememberCalls,
    recallCalls,
    async memory_remember(input, context) {
      rememberCalls.push({ input: structuredClone(input), context: structuredClone(context) });
      const fingerprint = JSON.stringify(input);
      const receipt = receipts.get(context.idempotency_key);
      if (receipt !== undefined) {
        assert.equal(receipt.fingerprint, fingerprint);
        return structuredClone(receipt.output);
      }
      const id = `mem_${context.session_ref}`;
      memories.set(id, {
        id,
        text: input.content,
        scopes: structuredClone(input.scopes)
      });
      const output = {
        candidate_memories: [{ id, type: "project_fact", text: input.content, status: "active" }],
        usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4, counting: "reported" }
      };
      receipts.set(context.idempotency_key, { fingerprint, output: structuredClone(output) });
      return output;
    },
    async memory_recall(input) {
      recallCalls.push(structuredClone(input));
      const scoped = [...memories.values()].filter((memory) => sameScope(memory.scopes, input.scopes));
      const wanted = input.query.includes("Atlas")
        ? "Juniper"
        : input.query.includes("Birch")
          ? "Saffron"
          : "__no_match__";
      const selected = scoped.filter((memory) => memory.text.includes(wanted));
      return {
        memories: selected.map((memory) => ({
          id: memory.id,
          type: "project_fact",
          text: memory.text,
          status: "active"
        })),
        context_block: selected.map((memory) => `- [project_fact] ${memory.text}`).join("\n"),
        trace_id: `trace_${input.scopes.project_id}`,
        usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3, counting: "reported" }
      };
    }
  };
  Object.defineProperty(boundary, "uniqueWriteCount", {
    enumerable: true,
    get: () => receipts.size
  });
  return boundary;
}

function sameScope(left, right) {
  return ["tenant_id", "user_id", "project_id", "agent_profile_id", "host_id"]
    .every((field) => left[field] === right[field]);
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

async function makeTempDir(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "handoffbase-longmemeval-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function readJsonl(filename) {
  const text = await readFile(filename, "utf8");
  return text.trim().length === 0 ? [] : text.trimEnd().split("\n").map((line) => JSON.parse(line));
}

async function readAllOutputs(outputDir) {
  const entries = {};
  for (const name of outputNames) {
    entries[name] = await readFile(path.join(outputDir, name), "utf8");
  }
  return entries;
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
