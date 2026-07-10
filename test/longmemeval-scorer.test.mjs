import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnswerCheckPrompt,
  createDeterministicJudge,
  createQwenJudge,
  parseHypothesesJsonl,
  parseJudgeVerdict,
  scoreLongMemEval
} from "../benchmarks/longmemeval/scorer.mjs";

function question(overrides) {
  return {
    questionId: "q1",
    questionType: "single-session-user",
    question: "What is the user's editor theme?",
    answer: "dark",
    isAbstention: false,
    ...overrides
  };
}

test("buildAnswerCheckPrompt selects type-specific and abstention templates", () => {
  const temporal = buildAnswerCheckPrompt({
    questionType: "temporal-reasoning",
    question: "How many days?",
    answer: "18",
    hypothesis: "19",
    isAbstention: false
  });
  assert.match(temporal, /off-by-one/);

  const update = buildAnswerCheckPrompt({
    questionType: "knowledge-update",
    question: "Current city?",
    answer: "Berlin",
    hypothesis: "Berlin",
    isAbstention: false
  });
  assert.match(update, /updated answer/);

  const abstain = buildAnswerCheckPrompt({
    questionType: "single-session-user",
    question: "Unanswerable?",
    answer: "no evidence",
    hypothesis: "I don't know.",
    isAbstention: true
  });
  assert.match(abstain, /unanswerable/);
});

test("parseJudgeVerdict reads yes/no with filler tolerance", () => {
  assert.equal(parseJudgeVerdict("Yes"), true);
  assert.equal(parseJudgeVerdict("no"), false);
  assert.equal(parseJudgeVerdict("Yes, the response is correct."), true);
  assert.equal(parseJudgeVerdict("The answer is correct, yes."), true);
  assert.equal(parseJudgeVerdict("No, it is wrong."), false);
  assert.equal(parseJudgeVerdict("maybe"), false);
});

test("deterministic judge scores answerable and abstention questions", async () => {
  const judge = createDeterministicJudge();
  assert.deepEqual(await judge.judge({ answer: "dark", hypothesis: "The user prefers dark mode.", isAbstention: false }), { correct: true });
  assert.deepEqual(await judge.judge({ answer: "dark", hypothesis: "The user prefers light mode.", isAbstention: false }), { correct: false });
  assert.deepEqual(await judge.judge({ answer: "n/a", hypothesis: "I don't know.", isAbstention: true }), { correct: true });
  assert.deepEqual(await judge.judge({ answer: "n/a", hypothesis: "The theme is blue.", isAbstention: true }), { correct: false });
});

test("parseHypothesesJsonl reads records and rejects duplicates", () => {
  const map = parseHypothesesJsonl('{"question_id":"a","hypothesis":"x"}\n\n{"question_id":"b","hypothesis":"y"}\n');
  assert.equal(map.get("a"), "x");
  assert.equal(map.get("b"), "y");
  assert.throws(
    () => parseHypothesesJsonl('{"question_id":"a","hypothesis":"x"}\n{"question_id":"a","hypothesis":"z"}'),
    /Duplicate hypothesis/
  );
});

test("scoreLongMemEval aggregates overall, per-type, answered, and abstention accuracy", async () => {
  const questions = [
    question({ questionId: "q1", answer: "dark", isAbstention: false }),
    question({ questionId: "q2", questionType: "temporal-reasoning", answer: "friday", isAbstention: false }),
    question({ questionId: "q3_abs", answer: "no evidence", isAbstention: true })
  ];
  const hypotheses = new Map([
    ["q1", "dark mode"],
    ["q2", "monday"],
    ["q3_abs", "I don't know."]
  ]);
  const scoring = await scoreLongMemEval({
    questions,
    hypotheses,
    judge: createDeterministicJudge(),
    dataset: { filename: "tiny.json", sha256: "abc" }
  });

  assert.equal(scoring.official_qa_evaluator, false);
  assert.equal(scoring.scored_questions, 3);
  assert.equal(scoring.missing_hypotheses, 0);
  assert.equal(scoring.correct, 2); // q1 correct, q2 wrong, q3 abstains correctly
  assert.ok(Math.abs(scoring.overall_accuracy - 2 / 3) < 1e-5);
  assert.deepEqual(scoring.answered, { correct: 1, total: 2, accuracy: 0.5 });
  assert.deepEqual(scoring.abstention, { correct: 1, total: 1, accuracy: 1 });
  assert.equal(scoring.accuracy_by_question_type["temporal-reasoning"].accuracy, 0);
});

test("scoreLongMemEval counts missing hypotheses without scoring them", async () => {
  const scoring = await scoreLongMemEval({
    questions: [question({ questionId: "q1" }), question({ questionId: "q2" })],
    hypotheses: new Map([["q1", "dark"]]),
    judge: createDeterministicJudge()
  });
  assert.equal(scoring.scored_questions, 1);
  assert.equal(scoring.missing_hypotheses, 1);
});

test("Qwen judge posts to chat completions, defaults to qwen-max, and redacts the key", async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(JSON.stringify({ choices: [{ message: { content: "Yes" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const judge = createQwenJudge({ env: { QWEN_API_KEY: "secret-key" }, fetch: okFetch });
  assert.equal(judge.label, "qwen-judge/qwen-max");
  assert.deepEqual(await judge.judge(question({ hypothesis: "dark" })), { correct: true });
  assert.match(calls[0].url, /\/chat\/completions$/);
  assert.equal(calls[0].body.model, "qwen-max");
  assert.equal(calls[0].auth, "Bearer secret-key");

  const failFetch = async () => new Response("token secret-key rejected", { status: 500 });
  const failingJudge = createQwenJudge({ env: { QWEN_API_KEY: "secret-key" }, fetch: failFetch });
  await assert.rejects(failingJudge.judge(question({ hypothesis: "dark" })), (error) => {
    assert.match(error.message, /HTTP 500/);
    assert.doesNotMatch(error.message, /secret-key/);
    return true;
  });
});
