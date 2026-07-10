import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

export const LONGMEMEVAL_ADAPTER_VERSION = "1.0.0";
export const LONGMEMEVAL_BACKENDS = Object.freeze(["no-memory", "raw-history", "handoffbase"]);
export const LONGMEMEVAL_QUESTION_TYPES = Object.freeze([
  "single-session-user",
  "single-session-assistant",
  "single-session-preference",
  "temporal-reasoning",
  "knowledge-update",
  "multi-session"
]);

export const LONGMEMEVAL_OUTPUT_FILES = Object.freeze({
  hypotheses: "hypotheses.jsonl",
  retrieval: "retrieval-evidence.jsonl",
  metadata: "run-metadata.json",
  summary: "summary.json",
  state: ".longmemeval-run-state.json"
});

const OUTPUT_SCHEMA_VERSION = "1";
const OFFICIAL_TIMESTAMP = /^(\d{4})\/(\d{2})\/(\d{2}) \(([A-Z][a-z]{2})\) (\d{2}):(\d{2})$/;
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const WEEKDAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const SESSION_REF_PATTERN = /\[longmemeval_session_ref=(s_[a-f0-9]{24})\]/g;

export class LongMemEvalValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LongMemEvalValidationError";
  }
}

export class LongMemEvalRunError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "LongMemEvalRunError";
  }
}

export async function loadLongMemEvalDataset(datasetPath) {
  assertLocalDatasetPath(datasetPath);
  let bytes;
  try {
    bytes = await readFile(datasetPath);
  } catch (error) {
    throw new LongMemEvalValidationError(`Unable to read the LongMemEval dataset file (${safeErrorCode(error)}).`);
  }

  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new LongMemEvalValidationError("The LongMemEval dataset file is not valid JSON.");
  }

  const questions = validateLongMemEvalDataset(parsed);
  return {
    questions,
    filename: path.basename(datasetPath),
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

export function validateLongMemEvalDataset(value) {
  validate(Array.isArray(value), "Dataset root must be a JSON array.");
  validate(value.length > 0, "Dataset must contain at least one question.");

  const seenQuestionIds = new Set();
  return value.map((entry, index) => {
    const label = `Question at index ${index}`;
    validate(isPlainObject(entry), `${label} must be an object.`);
    for (const field of [
      "question_id",
      "question_type",
      "question",
      "answer",
      "question_date",
      "haystack_session_ids",
      "haystack_dates",
      "haystack_sessions",
      "answer_session_ids"
    ]) {
      validate(Object.hasOwn(entry, field), `${label} is missing required field ${field}.`);
    }

    validateNonEmptyString(entry.question_id, `${label}.question_id`);
    validate(!seenQuestionIds.has(entry.question_id), `Duplicate question_id: ${entry.question_id}.`);
    seenQuestionIds.add(entry.question_id);

    validate(
      LONGMEMEVAL_QUESTION_TYPES.includes(entry.question_type),
      `${label}.question_type is not an official LongMemEval question type.`
    );
    validateNonEmptyString(entry.question, `${label}.question`);
    validate(entry.answer !== null, `${label}.answer must not be null.`);
    validateNonEmptyString(entry.question_date, `${label}.question_date`);
    const questionTimestampMs = parseLongMemEvalTimestamp(entry.question_date, `${label}.question_date`);

    validate(Array.isArray(entry.haystack_session_ids), `${label}.haystack_session_ids must be an array.`);
    validate(Array.isArray(entry.haystack_dates), `${label}.haystack_dates must be an array.`);
    validate(Array.isArray(entry.haystack_sessions), `${label}.haystack_sessions must be an array.`);
    validate(Array.isArray(entry.answer_session_ids), `${label}.answer_session_ids must be an array.`);
    validate(entry.haystack_sessions.length > 0, `${label} must include at least one haystack session.`);
    validate(
      entry.haystack_session_ids.length === entry.haystack_dates.length &&
        entry.haystack_dates.length === entry.haystack_sessions.length,
      `${label} haystack session ids, timestamps, and sessions must have equal lengths.`
    );

    const sessions = entry.haystack_sessions.map((turns, sessionIndex) => {
      const sessionLabel = `${label}.haystack_sessions[${sessionIndex}]`;
      const sessionId = entry.haystack_session_ids[sessionIndex];
      const timestamp = entry.haystack_dates[sessionIndex];
      validateNonEmptyString(sessionId, `${label}.haystack_session_ids[${sessionIndex}]`);
      validateNonEmptyString(timestamp, `${label}.haystack_dates[${sessionIndex}]`);
      const timestampMs = parseLongMemEvalTimestamp(timestamp, `${label}.haystack_dates[${sessionIndex}]`);
      validate(Array.isArray(turns) && turns.length > 0, `${sessionLabel} must be a non-empty turn array.`);

      const sanitizedTurns = turns.map((turn, turnIndex) => {
        const turnLabel = `${sessionLabel}[${turnIndex}]`;
        validate(isPlainObject(turn), `${turnLabel} must be an object.`);
        validate(turn.role === "user" || turn.role === "assistant", `${turnLabel}.role must be user or assistant.`);
        validateNonEmptyString(turn.content, `${turnLabel}.content`);
        if (Object.hasOwn(turn, "has_answer")) {
          validate(typeof turn.has_answer === "boolean", `${turnLabel}.has_answer must be boolean when present.`);
        }
        return { role: turn.role, content: turn.content };
      });

      return {
        id: sessionId,
        timestamp,
        timestampMs,
        originalIndex: sessionIndex,
        turns: sanitizedTurns,
        hasAnswer: turns.some((turn) => turn.has_answer === true)
      };
    });

    for (const [evidenceIndex, evidenceId] of entry.answer_session_ids.entries()) {
      validateNonEmptyString(evidenceId, `${label}.answer_session_ids[${evidenceIndex}]`);
      validate(
        entry.haystack_session_ids.includes(evidenceId),
        `${label}.answer_session_ids[${evidenceIndex}] does not reference a haystack session id.`
      );
    }

    const evidenceIds = new Set(entry.answer_session_ids);
    const sessionsWithAnswerLabels = new Set(sessions.filter((session) => session.hasAnswer).map((session) => session.id));
    for (const sessionId of sessionsWithAnswerLabels) {
      validate(evidenceIds.has(sessionId), `${label} has_answer evidence is missing from answer_session_ids.`);
    }

    const isAbstention = entry.question_id.endsWith("_abs");
    if (isAbstention) {
      validate(evidenceIds.size === 0, `${label} abstention questions must not include answer_session_ids.`);
      validate(sessionsWithAnswerLabels.size === 0, `${label} abstention questions must not mark has_answer evidence.`);
    } else {
      validate(evidenceIds.size > 0, `${label} non-abstention questions must include answer_session_ids.`);
      for (const evidenceId of evidenceIds) {
        validate(
          sessionsWithAnswerLabels.has(evidenceId),
          `${label} evidence session ${evidenceId} must contain a has_answer turn.`
        );
      }
    }

    return {
      questionId: entry.question_id,
      questionType: entry.question_type,
      question: entry.question,
      answer: structuredClone(entry.answer),
      questionDate: entry.question_date,
      questionTimestampMs,
      answerSessionIds: [...entry.answer_session_ids],
      isAbstention,
      sessions: [...sessions].sort((left, right) =>
        left.timestampMs - right.timestampMs || left.originalIndex - right.originalIndex
      )
    };
  });
}

export function parseLongMemEvalTimestamp(value, label = "timestamp") {
  validateNonEmptyString(value, label);
  const official = OFFICIAL_TIMESTAMP.exec(value);
  if (official) {
    const [, yearText, monthText, dayText, weekday, hourText, minuteText] = official;
    const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
    const [year, month, day, hour, minute] = parts;
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const date = new Date(timestamp);
    validateDateParts(date, { year, month, day, hour, minute }, label);
    validate(WEEKDAYS[date.getUTCDay()] === weekday, `${label} has an incorrect weekday label.`);
    return timestamp;
  }

  const rfc3339 = RFC3339_TIMESTAMP.exec(value);
  if (rfc3339) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone] = rfc3339;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const millisecond = Number((fraction + "000").slice(0, 3));
    validate(second <= 59, `${label} has an invalid second.`);
    const utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    validateDateParts(new Date(utc), { year, month, day, hour, minute, second }, label);
    if (zone === "Z") {
      return utc;
    }
    const sign = zone[0] === "+" ? 1 : -1;
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    validate(zoneHour <= 23 && zoneMinute <= 59, `${label} has an invalid UTC offset.`);
    return utc - sign * (zoneHour * 60 + zoneMinute) * 60_000;
  }

  throw new LongMemEvalValidationError(
    `${label} must use the official YYYY/MM/DD (Mon) HH:MM format or RFC 3339.`
  );
}

export function selectLongMemEvalQuestions(questions, options = {}) {
  let selected = questions;
  if (options.questionId !== undefined) {
    validateNonEmptyString(options.questionId, "questionId");
    selected = selected.filter((question) => question.questionId === options.questionId);
    validate(selected.length === 1, `question_id not found: ${options.questionId}.`);
  }
  if (options.limit !== undefined) {
    validate(Number.isSafeInteger(options.limit) && options.limit > 0, "limit must be a positive integer.");
    selected = selected.slice(0, options.limit);
  }
  validate(selected.length > 0, "Selection did not contain any questions.");
  return selected;
}

export function createQuestionScope(datasetSha256, questionId, runIsolationKey) {
  validateNonEmptyString(datasetSha256, "datasetSha256");
  validateNonEmptyString(questionId, "questionId");
  validateNonEmptyString(runIsolationKey, "runIsolationKey");
  const key = stableHash(`scope\0${datasetSha256}\0${runIsolationKey}\0${questionId}`).slice(0, 24);
  return Object.freeze({
    tenant_id: `lme_t_${key}`,
    user_id: `lme_u_${key}`,
    project_id: `lme_p_${key}`,
    agent_profile_id: "longmemeval-reader",
    host_id: "longmemeval-adapter"
  });
}

export async function runLongMemEval(options) {
  const normalized = normalizeRunOptions(options);
  const dataset = await loadLongMemEvalDataset(normalized.datasetPath);
  const selected = selectLongMemEvalQuestions(dataset.questions, {
    questionId: normalized.questionId,
    limit: normalized.limit
  });
  const selectedQuestionIds = selected.map((question) => question.questionId);
  const runId = `lme_${stableHash(JSON.stringify({
    adapter: LONGMEMEVAL_ADAPTER_VERSION,
    dataset: dataset.sha256,
    backend: normalized.backend,
    model: normalized.reader.modelLabel,
    commit: normalized.commit,
    retrievalLimit: normalized.retrievalLimit,
    tokenBudget: normalized.tokenBudget,
    memoryBoundaryLabel: normalized.memoryBoundaryLabel,
    selectedQuestionIds
  })).slice(0, 24)}`;

  const outputPaths = Object.fromEntries(
    Object.entries(LONGMEMEVAL_OUTPUT_FILES).map(([key, filename]) => [key, path.join(normalized.outputDir, filename)])
  );
  const expectedConfig = {
    adapterVersion: LONGMEMEVAL_ADAPTER_VERSION,
    datasetFilename: dataset.filename,
    datasetSha256: dataset.sha256,
    datasetQuestions: dataset.questions.length,
    backend: normalized.backend,
    modelLabel: normalized.reader.modelLabel,
    memoryBoundaryLabel: normalized.memoryBoundaryLabel,
    retrievalLimit: normalized.retrievalLimit,
    tokenBudget: normalized.tokenBudget,
    commit: normalized.commit,
    selection: {
      questionId: normalized.questionId ?? null,
      limit: normalized.limit ?? null,
      selectedQuestionIds
    },
    runId
  };

  await prepareOutputDirectory(normalized.outputDir, outputPaths, normalized.resume);
  let state;
  if (normalized.resume) {
    state = await readRunState(outputPaths.state);
    assertResumeCompatible(state, expectedConfig);
  } else {
    const startedAt = normalizeClockValue(normalized.clock(), "clock");
    state = {
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      ...expectedConfig,
      status: "running",
      startedAt,
      completedAt: null,
      durationMs: 0,
      records: {},
      failedQuestionId: null
    };
    await persistStateAndArtifacts(state, outputPaths);
  }

  for (const question of selected) {
    if (isCompletedRecord(state.records[question.questionId])) {
      continue;
    }

    const started = normalized.timer();
    try {
      const record = await runQuestion({
        question,
        datasetSha256: dataset.sha256,
        runIsolationKey: runId,
        backend: normalized.backend,
        reader: normalized.reader,
        memoryBoundary: normalized.memoryBoundary,
        retrievalLimit: normalized.retrievalLimit,
        tokenBudget: normalized.tokenBudget
      });
      record.duration_ms = normalizeDuration(normalized.timer() - started);
      state.records[question.questionId] = record;
      state.durationMs = aggregateDuration(state.records, selectedQuestionIds);
      state.failedQuestionId = null;
      await persistStateAndArtifacts(state, outputPaths);
    } catch (error) {
      state.status = "incomplete";
      state.failedQuestionId = question.questionId;
      state.durationMs = aggregateDuration(state.records, selectedQuestionIds);
      await persistStateAndArtifacts(state, outputPaths);
      throw new LongMemEvalRunError(`LongMemEval question ${question.questionId} failed.`, { cause: error });
    }
  }

  const complete = selectedQuestionIds.every((questionId) => isCompletedRecord(state.records[questionId]));
  if (complete && state.status !== "complete") {
    state.status = "complete";
    state.completedAt = normalizeClockValue(normalized.clock(), "clock");
    state.failedQuestionId = null;
    state.durationMs = aggregateDuration(state.records, selectedQuestionIds);
    await persistStateAndArtifacts(state, outputPaths);
  } else if (complete) {
    await materializeArtifacts(state, outputPaths);
  }

  return {
    runId: state.runId,
    status: state.status,
    selectedQuestions: selectedQuestionIds.length,
    completedQuestions: countCompleted(state, selectedQuestionIds),
    outputFiles: { ...LONGMEMEVAL_OUTPUT_FILES }
  };
}

async function runQuestion({
  question,
  datasetSha256,
  runIsolationKey,
  backend,
  reader,
  memoryBoundary,
  retrievalLimit,
  tokenBudget
}) {
  const scope = createQuestionScope(datasetSha256, question.questionId, runIsolationKey);
  const memoryUsageParts = [];
  let retrievedSessionIds = [];
  let readerContextSessionIds = [];
  let readerContextMapping = { complete: true, method: "empty", unknown_memories: 0 };
  let contextText = "";
  let traceIdPresent = false;
  let sessionsAttempted = 0;
  let candidateMemories = 0;
  let ingestionWarningCount = 0;
  let unknownRecalledMemories = 0;

  if (backend === "raw-history") {
    retrievedSessionIds = question.sessions.map((session) => session.id);
    readerContextSessionIds = [...retrievedSessionIds];
    readerContextMapping = { complete: true, method: "raw-history", unknown_memories: 0 };
    contextText = serializeReaderHistory(question.sessions);
  } else if (backend === "handoffbase") {
    const memoryIdToSessionId = new Map();
    const sessionRefToSessionId = new Map();

    for (const session of question.sessions) {
      const sessionRef = createSessionRef(datasetSha256, runIsolationKey, question.questionId, session);
      sessionRefToSessionId.set(sessionRef, session.id);
      const content = serializeSessionForMemory(session, sessionRef);
      const rememberInput = {
        source: "task_note",
        content,
        scopes: { ...scope },
        approval_mode: "active"
      };
      const rememberOutput = await memoryBoundary.memory_remember(rememberInput, {
        idempotency_key: stableHash(
          `remember\0${datasetSha256}\0${runIsolationKey}\0${question.questionId}\0${session.originalIndex}\0${session.id}`
        ),
        session_ref: sessionRef
      });
      validateRememberOutput(rememberOutput);
      sessionsAttempted += 1;
      candidateMemories += rememberOutput.candidate_memories.length;
      ingestionWarningCount += rememberOutput.warnings?.length ?? 0;
      memoryUsageParts.push(normalizeBoundaryUsage(rememberOutput.usage));
      for (const candidate of rememberOutput.candidate_memories) {
        if (typeof candidate.id === "string" && candidate.id.length > 0) {
          memoryIdToSessionId.set(candidate.id, session.id);
        }
      }
    }

    const recallOutput = await memoryBoundary.memory_recall({
      query: question.question,
      scopes: { ...scope },
      limit: retrievalLimit,
      token_budget: tokenBudget
    });
    validateRecallOutput(recallOutput);
    memoryUsageParts.push(normalizeBoundaryUsage(recallOutput.usage));
    traceIdPresent = typeof recallOutput.trace_id === "string" && recallOutput.trace_id.length > 0;
    const mapped = [];
    for (const memory of recallOutput.memories) {
      let sessionId = memoryIdToSessionId.get(memory.id);
      if (sessionId === undefined) {
        const refs = extractSessionRefs(memory.text);
        sessionId = refs.map((ref) => sessionRefToSessionId.get(ref)).find(Boolean);
      }
      if (sessionId === undefined) {
        unknownRecalledMemories += 1;
      } else {
        mapped.push(sessionId);
      }
    }
    retrievedSessionIds = uniqueInOrder(mapped);
    const contextMapping = mapReaderContextSessions(
      recallOutput.context_block,
      recallOutput.memories,
      memoryIdToSessionId,
      sessionRefToSessionId
    );
    readerContextSessionIds = contextMapping.sessionIds;
    readerContextMapping = {
      complete: contextMapping.complete,
      method: "session-marker-or-exact-memory-text",
      unknown_memories: contextMapping.unknownMemories
    };
    contextText = stripSessionMarkers(recallOutput.context_block);
  }

  const readerInput = {
    question: {
      question: question.question,
      question_date: question.questionDate
    },
    context: { text: contextText }
  };
  const readerOutput = await reader.generate(readerInput);
  validateReaderOutput(readerOutput);
  const readerUsage = normalizeReaderUsage(readerOutput.usage, readerInput, readerOutput.hypothesis);
  const memoryUsage = sumUsage(memoryUsageParts);
  const metrics = computeInternalEvidenceMetrics(question, retrievedSessionIds);

  return {
    status: "complete",
    question_id: question.questionId,
    hypothesis: readerOutput.hypothesis,
    duration_ms: 0,
    retrieval: {
      question_id: question.questionId,
      question_type: question.questionType,
      backend,
      retrieved_session_ids: retrievedSessionIds,
      reader_context_session_ids: readerContextSessionIds,
      reader_context_mapping: readerContextMapping,
      evidence_session_ids: uniqueInOrder(question.answerSessionIds),
      trace_id_present: traceIdPresent,
      ingestion: {
        sessions_attempted: sessionsAttempted,
        candidate_memories: candidateMemories,
        warning_count: ingestionWarningCount,
        unknown_recalled_memories: unknownRecalledMemories
      },
      internal_pre_context_retrieval_metrics: metrics,
      reader: {
        model_label: reader.modelLabel,
        token_counters: readerUsage
      },
      memory_boundary_token_counters: memoryUsage
    }
  };
}

export function computeInternalEvidenceMetrics(question, retrievedSessionIds) {
  if (question.isAbstention || question.answerSessionIds.length === 0) {
    return {
      evaluable: false,
      k: retrievedSessionIds.length,
      relevant_retrieved: null,
      precision_at_k: null,
      recall_at_k: null,
      recall_any_at_k: null,
      recall_all_at_k: null,
      ndcg_at_k: null
    };
  }

  const evidence = new Set(question.answerSessionIds);
  const retrieved = uniqueInOrder(retrievedSessionIds);
  const relevances = retrieved.map((sessionId) => evidence.has(sessionId) ? 1 : 0);
  const hits = relevances.reduce((total, value) => total + value, 0);
  const idealHits = Math.min(evidence.size, retrieved.length);
  const dcg = discountedGain(relevances);
  const idealDcg = discountedGain(Array.from({ length: idealHits }, () => 1));

  return {
    evaluable: true,
    k: retrieved.length,
    relevant_retrieved: hits,
    precision_at_k: roundMetric(retrieved.length === 0 ? 0 : hits / retrieved.length),
    recall_at_k: roundMetric(hits / evidence.size),
    recall_any_at_k: hits > 0 ? 1 : 0,
    recall_all_at_k: hits === evidence.size ? 1 : 0,
    ndcg_at_k: roundMetric(idealDcg === 0 ? 0 : dcg / idealDcg)
  };
}

export function serializeReaderHistory(sessions) {
  return sessions.map((session) => {
    const turns = session.turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
    return `Date: ${session.timestamp}\n${turns}`;
  }).join("\n\n");
}

export function serializeSessionForMemory(session, sessionRef) {
  const turns = session.turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
  return [
    `[longmemeval_session_ref=${sessionRef}]`,
    `Timestamp: ${session.timestamp}`,
    turns
  ].join("\n");
}

function normalizeRunOptions(options) {
  validate(isPlainObject(options), "Run options must be an object.");
  assertLocalDatasetPath(options.datasetPath);
  validateNonEmptyString(options.outputDir, "outputDir");
  validate(LONGMEMEVAL_BACKENDS.includes(options.backend), "backend must be no-memory, raw-history, or handoffbase.");
  validate(isPlainObject(options.reader), "reader must be an object.");
  validateNonEmptyString(options.reader.modelLabel, "reader.modelLabel");
  validate(typeof options.reader.generate === "function", "reader.generate must be a function.");
  if (options.backend === "handoffbase") {
    validate(isPlainObject(options.memoryBoundary), "handoffbase backend requires a memoryBoundary object.");
    validateNonEmptyString(options.memoryBoundary.label, "memoryBoundary.label");
    validate(
      options.memoryBoundary.supportsIdempotency === true,
      "memoryBoundary.supportsIdempotency must be true for resumable handoffbase runs."
    );
    validate(typeof options.memoryBoundary.memory_remember === "function", "memoryBoundary.memory_remember must be a function.");
    validate(typeof options.memoryBoundary.memory_recall === "function", "memoryBoundary.memory_recall must be a function.");
  }
  if (options.limit !== undefined) {
    validate(Number.isSafeInteger(options.limit) && options.limit > 0, "limit must be a positive integer.");
  }
  if (options.questionId !== undefined) {
    validateNonEmptyString(options.questionId, "questionId");
  }
  validate(typeof (options.resume ?? false) === "boolean", "resume must be boolean.");
  validateNonEmptyString(options.commit ?? "unknown", "commit");

  const retrievalLimit = options.retrievalLimit ?? 50;
  const tokenBudget = options.tokenBudget ?? 8000;
  validate(Number.isSafeInteger(retrievalLimit) && retrievalLimit > 0 && retrievalLimit <= 50, "retrievalLimit must be 1..50.");
  validate(Number.isSafeInteger(tokenBudget) && tokenBudget > 0 && tokenBudget <= 8000, "tokenBudget must be 1..8000.");

  return {
    datasetPath: options.datasetPath,
    outputDir: options.outputDir,
    backend: options.backend,
    reader: options.reader,
    memoryBoundary: options.memoryBoundary,
    memoryBoundaryLabel: options.backend === "handoffbase" ? options.memoryBoundary.label : "none",
    questionId: options.questionId,
    limit: options.limit,
    resume: options.resume ?? false,
    commit: options.commit ?? "unknown",
    retrievalLimit,
    tokenBudget,
    clock: options.clock ?? (() => new Date()),
    timer: options.timer ?? (() => performance.now())
  };
}

async function prepareOutputDirectory(outputDir, outputPaths, resume) {
  await mkdir(outputDir, { recursive: true });
  if (resume) {
    validate(await pathExists(outputPaths.state), `--resume requires ${LONGMEMEVAL_OUTPUT_FILES.state}.`);
    return;
  }
  for (const outputPath of Object.values(outputPaths)) {
    validate(!(await pathExists(outputPath)), `Output already exists: ${path.basename(outputPath)}. Use --resume or a new output directory.`);
    validate(!(await pathExists(`${outputPath}.tmp`)), `Temporary output already exists: ${path.basename(outputPath)}.tmp.`);
  }
}

async function readRunState(statePath) {
  try {
    const value = JSON.parse(await readFile(statePath, "utf8"));
    validate(isPlainObject(value), "Resume state must be a JSON object.");
    validate(isPlainObject(value.records), "Resume state records must be an object.");
    validateRunStateStructure(value);
    return value;
  } catch (error) {
    if (error instanceof LongMemEvalValidationError) {
      throw error;
    }
    throw new LongMemEvalValidationError(`Unable to read resume state (${safeErrorCode(error)}).`);
  }
}

function validateRunStateStructure(state) {
  validate(["running", "incomplete", "complete"].includes(state.status), "Resume state status is invalid.");
  validateNonEmptyString(state.commit, "Resume state commit");
  validateNonEmptyString(state.startedAt, "Resume state startedAt");
  validate(Number.isFinite(Date.parse(state.startedAt)), "Resume state startedAt is invalid.");
  validate(
    state.completedAt === null ||
      (typeof state.completedAt === "string" && Number.isFinite(Date.parse(state.completedAt))),
    "Resume state completedAt is invalid."
  );
  validate(Number.isSafeInteger(state.durationMs) && state.durationMs >= 0, "Resume state durationMs is invalid.");
  validate(isPlainObject(state.selection), "Resume state selection must be an object.");
  validate(
    Array.isArray(state.selection.selectedQuestionIds) && state.selection.selectedQuestionIds.length > 0,
    "Resume state selectedQuestionIds must be a non-empty array."
  );
  validate(
    state.selection.selectedQuestionIds.every((questionId) => typeof questionId === "string" && questionId.length > 0),
    "Resume state selectedQuestionIds must contain strings."
  );
  validate(
    new Set(state.selection.selectedQuestionIds).size === state.selection.selectedQuestionIds.length,
    "Resume state selectedQuestionIds must be unique."
  );
  const selectedIds = new Set(state.selection.selectedQuestionIds);
  for (const [questionId, record] of Object.entries(state.records)) {
    validate(selectedIds.has(questionId), "Resume state contains a record outside the selected questions.");
    validate(isPlainObject(record) && record.status === "complete", `Resume state record ${questionId} is invalid.`);
    validate(record.question_id === questionId, `Resume state record ${questionId} has a mismatched question_id.`);
    validateNonEmptyString(record.hypothesis, `Resume state record ${questionId} hypothesis`);
    validate(
      Number.isSafeInteger(record.duration_ms) && record.duration_ms >= 0,
      `Resume state record ${questionId} duration is invalid.`
    );
    validate(isPlainObject(record.retrieval), `Resume state record ${questionId} retrieval is invalid.`);
    validate(
      record.retrieval.question_id === questionId,
      `Resume state record ${questionId} retrieval question_id is invalid.`
    );
    validate(
      Array.isArray(record.retrieval.retrieved_session_ids) &&
        record.retrieval.retrieved_session_ids.every((id) => typeof id === "string"),
      `Resume state record ${questionId} retrieved_session_ids is invalid.`
    );
    validate(
      Array.isArray(record.retrieval.evidence_session_ids) &&
        record.retrieval.evidence_session_ids.every((id) => typeof id === "string"),
      `Resume state record ${questionId} evidence_session_ids is invalid.`
    );
    validate(
      Array.isArray(record.retrieval.reader_context_session_ids) &&
        record.retrieval.reader_context_session_ids.every((id) => typeof id === "string"),
      `Resume state record ${questionId} reader_context_session_ids is invalid.`
    );
    validate(
      isPlainObject(record.retrieval.internal_pre_context_retrieval_metrics),
      `Resume state record ${questionId} retrieval metrics are invalid.`
    );
    validate(
      typeof record.retrieval.internal_pre_context_retrieval_metrics.evaluable === "boolean",
      `Resume state record ${questionId} retrieval evaluable flag is invalid.`
    );
    validate(isPlainObject(record.retrieval.reader), `Resume state record ${questionId} reader is invalid.`);
    validateStoredUsage(
      record.retrieval.reader.token_counters,
      `Resume state record ${questionId} reader token counters`
    );
    validateStoredUsage(
      record.retrieval.memory_boundary_token_counters,
      `Resume state record ${questionId} memory token counters`
    );
  }
  if (state.status === "complete") {
    validate(
      state.selection.selectedQuestionIds.every((questionId) => isCompletedRecord(state.records[questionId])),
      "Complete resume state is missing a completed question record."
    );
    validate(state.completedAt !== null, "Complete resume state must include completedAt.");
  }
  if (state.failedQuestionId !== null) {
    validate(selectedIds.has(state.failedQuestionId), "Resume state failedQuestionId is not selected.");
  }
}

function validateStoredUsage(usage, label) {
  validate(isPlainObject(usage), `${label} must be an object.`);
  for (const field of ["input_tokens", "output_tokens", "total_tokens"]) {
    validate(Number.isSafeInteger(usage[field]) && usage[field] >= 0, `${label}.${field} is invalid.`);
  }
  validate(
    usage.total_tokens === usage.input_tokens + usage.output_tokens,
    `${label}.total_tokens is inconsistent.`
  );
  validate(
    ["reported", "estimated", "unavailable", "mixed"].includes(usage.counting),
    `${label}.counting is invalid.`
  );
}

function assertResumeCompatible(state, expected) {
  const checks = [
    [state.schemaVersion, OUTPUT_SCHEMA_VERSION, "state schema"],
    [state.adapterVersion, expected.adapterVersion, "adapter version"],
    [state.datasetFilename, expected.datasetFilename, "dataset filename"],
    [state.datasetSha256, expected.datasetSha256, "dataset digest"],
    [state.datasetQuestions, expected.datasetQuestions, "dataset question count"],
    [state.backend, expected.backend, "backend"],
    [state.modelLabel, expected.modelLabel, "reader model label"],
    [state.memoryBoundaryLabel, expected.memoryBoundaryLabel, "memory boundary label"],
    [state.retrievalLimit, expected.retrievalLimit, "retrieval limit"],
    [state.tokenBudget, expected.tokenBudget, "token budget"],
    [state.commit, expected.commit, "commit"],
    [state.runId, expected.runId, "run id"]
  ];
  for (const [actual, wanted, label] of checks) {
    validate(actual === wanted, `Resume state ${label} does not match this run.`);
  }
  validate(
    JSON.stringify(state.selection) === JSON.stringify(expected.selection),
    "Resume state selection does not match this run."
  );
}

async function persistStateAndArtifacts(state, outputPaths) {
  await atomicWriteJson(outputPaths.state, state, 0o600);
  await materializeArtifacts(state, outputPaths);
}

async function materializeArtifacts(state, outputPaths) {
  const ids = state.selection.selectedQuestionIds;
  const records = ids.map((questionId) => state.records[questionId]).filter(isCompletedRecord);
  const hypotheses = records.map((record) => JSON.stringify({
    question_id: record.question_id,
    hypothesis: record.hypothesis
  })).join("\n");
  const retrieval = records.map((record) => JSON.stringify(record.retrieval)).join("\n");
  const metadata = buildRunMetadata(state, records);
  const summary = buildSummary(state, records);

  await atomicWriteText(outputPaths.hypotheses, hypotheses.length > 0 ? `${hypotheses}\n` : "", 0o644);
  await atomicWriteText(outputPaths.retrieval, retrieval.length > 0 ? `${retrieval}\n` : "", 0o644);
  await atomicWriteJson(outputPaths.metadata, metadata, 0o644);
  await atomicWriteJson(outputPaths.summary, summary, 0o644);
}

function buildRunMetadata(state, records) {
  const tokenCounters = aggregateTokenCounters(records);
  return {
    schema_version: OUTPUT_SCHEMA_VERSION,
    adapter_version: state.adapterVersion,
    run_id: state.runId,
    commit: state.commit,
    backend: state.backend,
    model_label: state.modelLabel,
    memory_boundary_label: state.memoryBoundaryLabel,
    status: state.status,
    dataset: {
      filename: state.datasetFilename,
      sha256: state.datasetSha256,
      total_questions: state.datasetQuestions,
      selected_questions: state.selection.selectedQuestionIds.length,
      completed_questions: records.length
    },
    selection: {
      question_id: state.selection.questionId,
      limit: state.selection.limit
    },
    retrieval: {
      limit: state.retrievalLimit,
      token_budget: state.tokenBudget
    },
    timing: {
      started_at: state.startedAt,
      completed_at: state.completedAt,
      duration_ms: state.durationMs
    },
    token_counters: tokenCounters,
    outputs: {
      official_hypotheses: LONGMEMEVAL_OUTPUT_FILES.hypotheses,
      internal_retrieval_evidence: LONGMEMEVAL_OUTPUT_FILES.retrieval,
      aggregate_summary: LONGMEMEVAL_OUTPUT_FILES.summary
    },
    evaluation_boundary: {
      official_qa_evaluator_run: false,
      official_qa_score_present: false,
      internal_retrieval_metrics_only: true
    }
  };
}

function buildSummary(state, records) {
  const evaluable = records
    .map((record) => record.retrieval.internal_pre_context_retrieval_metrics)
    .filter((metrics) => metrics.evaluable);
  return {
    schema_version: OUTPUT_SCHEMA_VERSION,
    run_id: state.runId,
    status: state.status,
    backend: state.backend,
    selected_questions: state.selection.selectedQuestionIds.length,
    completed_questions: records.length,
    official_qa_evaluation: {
      run: false,
      score: null,
      hypothesis_file: LONGMEMEVAL_OUTPUT_FILES.hypotheses
    },
    internal_pre_context_retrieval_metrics: {
      label: "Pre-context-pack memory_recall evidence metrics; not reader-context metrics or an official LongMemEval QA score.",
      evaluable_questions: evaluable.length,
      skipped_abstention_or_unlabeled_questions: records.length - evaluable.length,
      mean_precision_at_k: meanMetric(evaluable, "precision_at_k"),
      mean_recall_at_k: meanMetric(evaluable, "recall_at_k"),
      mean_recall_any_at_k: meanMetric(evaluable, "recall_any_at_k"),
      mean_recall_all_at_k: meanMetric(evaluable, "recall_all_at_k"),
      mean_ndcg_at_k: meanMetric(evaluable, "ndcg_at_k")
    },
    token_counters: aggregateTokenCounters(records),
    timing: { duration_ms: state.durationMs }
  };
}

function aggregateTokenCounters(records) {
  const readerParts = records.map((record) => record.retrieval.reader.token_counters);
  const memoryParts = records.map((record) => record.retrieval.memory_boundary_token_counters);
  const reader = sumUsage(readerParts);
  const memoryBoundary = sumUsage(memoryParts);
  return {
    reader,
    memory_boundary: memoryBoundary,
    total_tokens: reader.total_tokens + memoryBoundary.total_tokens
  };
}

function normalizeReaderUsage(usage, input, hypothesis) {
  if (usage === undefined) {
    const inputTokens = estimateTokens(`${input.question.question}\n${input.context.text}`);
    const outputTokens = estimateTokens(hypothesis);
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      counting: "estimated"
    };
  }
  return validateUsage(usage, usage.counting ?? "reported");
}

function normalizeBoundaryUsage(usage) {
  return usage === undefined
    ? { input_tokens: 0, output_tokens: 0, total_tokens: 0, counting: "unavailable" }
    : validateUsage(usage, usage.counting ?? "reported");
}

function validateUsage(usage, counting) {
  validate(isPlainObject(usage), "Token usage must be an object.");
  for (const field of ["input_tokens", "output_tokens", "total_tokens"]) {
    validate(Number.isSafeInteger(usage[field]) && usage[field] >= 0, `Token usage ${field} must be a non-negative integer.`);
  }
  validate(
    usage.total_tokens === usage.input_tokens + usage.output_tokens,
    "Token usage total_tokens must equal input_tokens plus output_tokens."
  );
  validate(["reported", "estimated", "unavailable"].includes(counting), "Token usage counting label is invalid.");
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    counting
  };
}

function sumUsage(parts) {
  const available = parts.length > 0 ? parts : [normalizeBoundaryUsage(undefined)];
  const modes = new Set(available.map((usage) => usage.counting));
  return {
    input_tokens: available.reduce((total, usage) => total + usage.input_tokens, 0),
    output_tokens: available.reduce((total, usage) => total + usage.output_tokens, 0),
    total_tokens: available.reduce((total, usage) => total + usage.total_tokens, 0),
    counting: modes.size === 1 ? [...modes][0] : "mixed"
  };
}

function validateRememberOutput(output) {
  validate(isPlainObject(output), "memory_remember output must be an object.");
  validate(Array.isArray(output.candidate_memories), "memory_remember output must include candidate_memories.");
  if (output.warnings !== undefined) {
    validate(
      Array.isArray(output.warnings) && output.warnings.every((warning) => typeof warning === "string"),
      "memory_remember warnings must be strings."
    );
  }
  for (const candidate of output.candidate_memories) {
    validate(isPlainObject(candidate), "memory_remember candidate entries must be objects.");
  }
}

function validateRecallOutput(output) {
  validate(isPlainObject(output), "memory_recall output must be an object.");
  validate(Array.isArray(output.memories), "memory_recall output must include memories.");
  validate(typeof output.context_block === "string", "memory_recall output must include context_block.");
  validateNonEmptyString(output.trace_id, "memory_recall output trace_id");
  for (const memory of output.memories) {
    validate(isPlainObject(memory), "memory_recall memories must be objects.");
    validateNonEmptyString(memory.id, "memory_recall memory id");
    validate(typeof memory.text === "string", "memory_recall memory text must be a string.");
  }
}

function validateReaderOutput(output) {
  validate(isPlainObject(output), "Reader output must be an object.");
  validateNonEmptyString(output.hypothesis, "Reader output hypothesis");
}

function createSessionRef(datasetSha256, runIsolationKey, questionId, session) {
  return `s_${stableHash(
    `session\0${datasetSha256}\0${runIsolationKey}\0${questionId}\0${session.originalIndex}\0${session.id}`
  ).slice(0, 24)}`;
}

function extractSessionRefs(text) {
  if (typeof text !== "string") {
    return [];
  }
  return [...text.matchAll(SESSION_REF_PATTERN)].map((match) => match[1]);
}

function mapReaderContextSessions(contextBlock, memories, memoryIdToSessionId, sessionRefToSessionId) {
  if (contextBlock.trim().length === 0) {
    return { sessionIds: [], complete: true, unknownMemories: 0 };
  }

  const sessionIds = [];
  let unknownMemories = 0;
  let remainder = contextBlock;
  const matchedTexts = new Set();
  for (const memory of memories) {
    if (memory.text.length === 0 || !contextBlock.includes(memory.text)) {
      continue;
    }
    matchedTexts.add(memory.text);
    const sessionId = memoryIdToSessionId.get(memory.id) ??
      extractSessionRefs(memory.text).map((ref) => sessionRefToSessionId.get(ref)).find(Boolean);
    if (sessionId === undefined) {
      unknownMemories += 1;
    } else {
      sessionIds.push(sessionId);
    }
  }
  for (const ref of extractSessionRefs(contextBlock)) {
    const sessionId = sessionRefToSessionId.get(ref);
    if (sessionId !== undefined) {
      sessionIds.push(sessionId);
    }
  }
  for (const text of [...matchedTexts].sort((left, right) => right.length - left.length)) {
    remainder = remainder.split(text).join("");
  }
  remainder = remainder.replace(/-\s*\[[^\]]+\]\s*/g, "").trim();
  return {
    sessionIds: uniqueInOrder(sessionIds),
    complete: remainder.length === 0 && unknownMemories === 0,
    unknownMemories
  };
}

function stripSessionMarkers(text) {
  return text
    .split("\n")
    .filter((line) => !line.includes("[longmemeval_session_ref="))
    .join("\n")
    .trim();
}

function discountedGain(relevances) {
  return relevances.reduce((total, relevance, index) =>
    total + relevance / Math.log2(index + 2), 0
  );
}

function meanMetric(metrics, field) {
  if (metrics.length === 0) {
    return null;
  }
  return roundMetric(metrics.reduce((total, item) => total + item[field], 0) / metrics.length);
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function aggregateDuration(records, selectedQuestionIds) {
  return selectedQuestionIds.reduce((total, questionId) => {
    const record = records[questionId];
    return total + (isCompletedRecord(record) ? record.duration_ms : 0);
  }, 0);
}

function normalizeDuration(value) {
  validate(Number.isFinite(value) && value >= 0, "Timer must return non-decreasing finite values.");
  return Math.round(value);
}

function normalizeClockValue(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  validate(Number.isFinite(date.getTime()), `${label} must return a valid date.`);
  return date.toISOString();
}

function countCompleted(state, ids) {
  return ids.filter((id) => isCompletedRecord(state.records[id])).length;
}

function isCompletedRecord(record) {
  return isPlainObject(record) && record.status === "complete";
}

function validateDateParts(date, expected, label) {
  validate(
    date.getUTCFullYear() === expected.year &&
      date.getUTCMonth() + 1 === expected.month &&
      date.getUTCDate() === expected.day &&
      date.getUTCHours() === expected.hour &&
      date.getUTCMinutes() === expected.minute &&
      (expected.second === undefined || date.getUTCSeconds() === expected.second),
    `${label} is not a valid calendar timestamp.`
  );
}

function validateNonEmptyString(value, label) {
  validate(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
}

function assertLocalDatasetPath(datasetPath) {
  validateNonEmptyString(datasetPath, "datasetPath");
  validate(!/^[a-z][a-z0-9+.-]*:\/\//i.test(datasetPath), "datasetPath must be a local file path, not a URL.");
}

function validate(condition, message) {
  if (!condition) {
    throw new LongMemEvalValidationError(message);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueInOrder(values) {
  return [...new Set(values)];
}

function estimateTokens(value) {
  return Math.max(0, Math.ceil(value.length / 4));
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/i.test(error.code) ? error.code : "error";
}

async function pathExists(candidate) {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function atomicWriteJson(filename, value, mode) {
  await atomicWriteText(filename, `${JSON.stringify(value, null, 2)}\n`, mode);
}

async function atomicWriteText(filename, value, mode) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, value, { encoding: "utf8", mode });
  await rename(temporary, filename);
}
