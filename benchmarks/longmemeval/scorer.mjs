import { LONGMEMEVAL_QUESTION_TYPES } from "./adapter.mjs";
import { resolveOpenAIRuntimeConfig, resolveQwenRuntimeConfig } from "./local-runtime.mjs";

export const LONGMEMEVAL_SCORER_VERSION = "1.0.0";
export const LONGMEMEVAL_JUDGE_MODES = Object.freeze(["deterministic", "qwen", "openai"]);
const SCORING_SCHEMA_VERSION = "1";
const DEFAULT_JUDGE_MODEL = "qwen-max";
const DEFAULT_OPENAI_JUDGE_MODEL = "gpt-4o";
const DEFAULT_JUDGE_TIMEOUT_MS = 30_000;

export class LongMemEvalScoringError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "LongMemEvalScoringError";
    this.status = options.status;
  }
}

/**
 * Build the QA correctness prompt. This mirrors the official LongMemEval
 * evaluate_qa `get_anscheck_prompt` templates (per question type, plus an
 * abstention variant) so a judge model's yes/no decision is comparable in
 * spirit to the official metric. It remains an INDEPENDENT reimplementation,
 * not the official GPT-4o evaluator.
 */
export function buildAnswerCheckPrompt({ questionType, question, answer, hypothesis, isAbstention }) {
  const q = String(question);
  const a = String(answer);
  const r = String(hypothesis);
  if (isAbstention) {
    return (
      "I will give you an unanswerable question, an explanation, and a response from a model. " +
      "Please answer yes if the model correctly identifies the question as unanswerable. " +
      "The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\n" +
      `Question: ${q}\nExplanation: ${a}\nModel Response: ${r}\n` +
      "Does the model correctly identify the question as unanswerable? Answer yes or no only."
    );
  }
  if (questionType === "temporal-reasoning") {
    return (
      "I will give you a question, a correct answer, and a response from a model. " +
      "Please answer yes if the response contains the correct answer. Otherwise, answer no. " +
      "If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. " +
      "If the response only contains a subset of the information required by the answer, answer no. " +
      "In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., " +
      "and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct.\n\n" +
      `Question: ${q}\nCorrect Answer: ${a}\nModel Response: ${r}\n` +
      "Is the model response correct? Answer yes or no only."
    );
  }
  if (questionType === "knowledge-update") {
    return (
      "I will give you a question, a correct answer, and a response from a model. " +
      "Please answer yes if the response contains the correct answer. Otherwise, answer no. " +
      "If the response contains some previous information along with an updated answer, the response should be considered correct as long as the updated answer is the required answer.\n\n" +
      `Question: ${q}\nCorrect Answer: ${a}\nModel Response: ${r}\n` +
      "Is the model response correct? Answer yes or no only."
    );
  }
  if (questionType === "single-session-preference") {
    return (
      "I will give you a question, a rubric for the desired personalized response, and a response from a model. " +
      "Please answer yes if the response satisfies the desired response. Otherwise, answer no. " +
      "The model does not need to reflect all the points in the rubric. " +
      "The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\n" +
      `Question: ${q}\nRubric: ${a}\nModel Response: ${r}\n` +
      "Is the model response correct? Answer yes or no only."
    );
  }
  return (
    "I will give you a question, a correct answer, and a response from a model. " +
    "Please answer yes if the response contains the correct answer. Otherwise, answer no. " +
    "If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. " +
    "If the response only contains a subset of the information required by the answer, answer no.\n\n" +
    `Question: ${q}\nCorrect Answer: ${a}\nModel Response: ${r}\n` +
    "Is the model response correct? Answer yes or no only."
  );
}

/** Parse a judge model's free-text reply into a boolean. Defaults to false. */
export function parseJudgeVerdict(text) {
  if (typeof text !== "string") {
    return false;
  }
  const normalized = text.trim().toLowerCase();
  if (/^\s*yes\b/.test(normalized)) {
    return true;
  }
  if (/^\s*no\b/.test(normalized)) {
    return false;
  }
  // Fall back to whole-string signal when the model prepends filler.
  if (/\byes\b/.test(normalized) && !/\bno\b/.test(normalized)) {
    return true;
  }
  return false;
}

const ABSTENTION_PATTERN =
  /\b(i (?:do not|don'?t) know|not (?:sure|available|enough|mentioned|specified|provided|stated)|no (?:information|record|mention|data|details)|cannot (?:determine|find|answer|tell)|unable to (?:determine|answer|find)|there is no|isn'?t (?:any )?(?:information|mention))\b/i;

/**
 * Deterministic, network-free judge for CI and offline runs. It is a coarse
 * proxy — abstention questions are correct iff the response signals abstention,
 * and answerable questions are correct iff the normalized gold answer appears in
 * the normalized response. It is NOT the official evaluator and MUST be labeled
 * as such wherever its numbers are reported.
 */
export function createDeterministicJudge() {
  return {
    label: "deterministic-substring-judge",
    async judge({ answer, hypothesis, isAbstention }) {
      const response = String(hypothesis ?? "");
      if (isAbstention) {
        return { correct: ABSTENTION_PATTERN.test(response) };
      }
      const gold = normalizeText(String(answer ?? ""));
      const got = normalizeText(response);
      if (gold.length === 0) {
        return { correct: false };
      }
      return { correct: got.includes(gold) };
    }
  };
}

/**
 * Qwen-backed LLM judge (DashScope OpenAI-compatible chat completions). Defaults
 * to qwen-max via QWEN_JUDGE_MODEL. Reuses the QWEN_ and DASHSCOPE_ credential
 * conventions; the API key is never echoed into errors.
 */
export function createQwenJudge(options = {}) {
  const base = resolveQwenRuntimeConfig(options.env ?? process.env);
  const model = firstNonEmpty(
    options.model,
    (options.env ?? process.env).QWEN_JUDGE_MODEL,
    (options.env ?? process.env).DASHSCOPE_JUDGE_MODEL
  ) ?? DEFAULT_JUDGE_MODEL;
  const timeoutMs = options.timeoutMs ?? base.timeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new LongMemEvalScoringError("Qwen judge mode requires a Fetch API implementation.");
  }

  return {
    label: `qwen-judge/${model}`,
    async judge(input) {
      const prompt = buildAnswerCheckPrompt(input);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(chatCompletionsEndpoint(base.baseUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${base.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [{ role: "user", content: prompt }]
          }),
          signal: controller.signal
        });
        if (!response?.ok) {
          const status = Number.isSafeInteger(response?.status) ? response.status : undefined;
          throw new LongMemEvalScoringError(
            status === undefined ? "Qwen judge request failed." : `Qwen judge request failed with HTTP ${status}.`,
            { status }
          );
        }
        let payload;
        try {
          payload = JSON.parse(await response.text());
        } catch {
          throw new LongMemEvalScoringError("Qwen judge response was not valid JSON.");
        }
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new LongMemEvalScoringError("Qwen judge response did not include a verdict.");
        }
        return { correct: parseJudgeVerdict(content) };
      } catch (error) {
        if (error instanceof LongMemEvalScoringError) {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new LongMemEvalScoringError(`Qwen judge request timed out after ${timeoutMs}ms.`);
        }
        throw new LongMemEvalScoringError("Qwen judge request failed before receiving a response.");
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

/**
 * OpenAI GPT-4o judge (default gpt-4o via OPENAI_JUDGE_MODEL). Using GPT-4o here
 * matches the model the official LongMemEval evaluator uses, so a Qwen-reader
 * run judged by GPT-4o is more directly comparable to published numbers. It is
 * still an independent reimplementation of the correctness check, not the
 * official evaluator harness.
 */
export function createOpenAIJudge(options = {}) {
  const base = resolveOpenAIRuntimeConfig(options.env ?? process.env);
  const model = firstNonEmpty(
    options.model,
    (options.env ?? process.env).OPENAI_JUDGE_MODEL
  ) ?? DEFAULT_OPENAI_JUDGE_MODEL;
  const timeoutMs = options.timeoutMs ?? base.timeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new LongMemEvalScoringError("OpenAI judge mode requires a Fetch API implementation.");
  }

  return {
    label: `openai-judge/${model}`,
    async judge(input) {
      const prompt = buildAnswerCheckPrompt(input);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(chatCompletionsEndpoint(base.baseUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${base.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [{ role: "user", content: prompt }]
          }),
          signal: controller.signal
        });
        if (!response?.ok) {
          const status = Number.isSafeInteger(response?.status) ? response.status : undefined;
          throw new LongMemEvalScoringError(
            status === undefined ? "OpenAI judge request failed." : `OpenAI judge request failed with HTTP ${status}.`,
            { status }
          );
        }
        let payload;
        try {
          payload = JSON.parse(await response.text());
        } catch {
          throw new LongMemEvalScoringError("OpenAI judge response was not valid JSON.");
        }
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new LongMemEvalScoringError("OpenAI judge response did not include a verdict.");
        }
        return { correct: parseJudgeVerdict(content) };
      } catch (error) {
        if (error instanceof LongMemEvalScoringError) {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new LongMemEvalScoringError(`OpenAI judge request timed out after ${timeoutMs}ms.`);
        }
        throw new LongMemEvalScoringError("OpenAI judge request failed before receiving a response.");
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function parseHypothesesJsonl(text) {
  const map = new Map();
  const lines = String(text).split("\n");
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new LongMemEvalScoringError(`hypotheses line ${index + 1} is not valid JSON.`);
    }
    if (parsed === null || typeof parsed !== "object" || typeof parsed.question_id !== "string") {
      throw new LongMemEvalScoringError(`hypotheses line ${index + 1} is missing question_id.`);
    }
    if (typeof parsed.hypothesis !== "string") {
      throw new LongMemEvalScoringError(`hypotheses line ${index + 1} is missing hypothesis.`);
    }
    if (map.has(parsed.question_id)) {
      throw new LongMemEvalScoringError(`Duplicate hypothesis for question ${parsed.question_id}.`);
    }
    map.set(parsed.question_id, parsed.hypothesis);
  }
  return map;
}

/**
 * Score LongMemEval hypotheses against gold answers with a supplied judge.
 * `questions` are validated dataset questions (from validateLongMemEvalDataset).
 * `hypotheses` is a Map of question_id -> hypothesis string.
 */
export async function scoreLongMemEval({ questions, hypotheses, judge, dataset = {} }) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new LongMemEvalScoringError("questions must be a non-empty array.");
  }
  if (!(hypotheses instanceof Map)) {
    throw new LongMemEvalScoringError("hypotheses must be a Map of question_id to hypothesis.");
  }
  if (typeof judge?.judge !== "function") {
    throw new LongMemEvalScoringError("judge must expose a judge() function.");
  }

  const perQuestion = [];
  const byType = new Map(LONGMEMEVAL_QUESTION_TYPES.map((type) => [type, { correct: 0, total: 0 }]));
  let abstentionCorrect = 0;
  let abstentionTotal = 0;
  let answeredCorrect = 0;
  let answeredTotal = 0;
  let missing = 0;

  for (const question of questions) {
    const hypothesis = hypotheses.get(question.questionId);
    if (hypothesis === undefined) {
      missing += 1;
      continue;
    }
    const { correct } = await judge.judge({
      questionType: question.questionType,
      question: question.question,
      answer: question.answer,
      hypothesis,
      isAbstention: question.isAbstention
    });
    const isCorrect = correct === true;
    perQuestion.push({
      question_id: question.questionId,
      question_type: question.questionType,
      is_abstention: question.isAbstention,
      correct: isCorrect
    });
    const typeBucket = byType.get(question.questionType);
    if (typeBucket) {
      typeBucket.total += 1;
      if (isCorrect) typeBucket.correct += 1;
    }
    if (question.isAbstention) {
      abstentionTotal += 1;
      if (isCorrect) abstentionCorrect += 1;
    } else {
      answeredTotal += 1;
      if (isCorrect) answeredCorrect += 1;
    }
  }

  const scored = perQuestion.length;
  const correctCount = perQuestion.filter((entry) => entry.correct).length;

  return {
    schema_version: SCORING_SCHEMA_VERSION,
    scorer_version: LONGMEMEVAL_SCORER_VERSION,
    judge_label: judge.label ?? "custom-judge",
    official_qa_evaluator: false,
    dataset: {
      filename: dataset.filename ?? null,
      sha256: dataset.sha256 ?? null,
      total_questions: questions.length
    },
    scored_questions: scored,
    missing_hypotheses: missing,
    overall_accuracy: ratio(correctCount, scored),
    correct: correctCount,
    accuracy_by_question_type: Object.fromEntries(
      [...byType.entries()].map(([type, bucket]) => [
        type,
        { correct: bucket.correct, total: bucket.total, accuracy: ratio(bucket.correct, bucket.total) }
      ])
    ),
    answered: { correct: answeredCorrect, total: answeredTotal, accuracy: ratio(answeredCorrect, answeredTotal) },
    abstention: { correct: abstentionCorrect, total: abstentionTotal, accuracy: ratio(abstentionCorrect, abstentionTotal) },
    per_question: perQuestion
  };
}

function ratio(correct, total) {
  if (total === 0) {
    return null;
  }
  return Math.round((correct / total) * 1_000_000) / 1_000_000;
}

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function chatCompletionsEndpoint(baseUrl) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}
