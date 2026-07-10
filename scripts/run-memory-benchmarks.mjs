#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runnerFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(runnerFile), "..");
const benchmarkRoot = path.join(rootDir, "examples/benchmarks");
const allowedFamilies = new Set(["long-memory", "conflicts", "cross-host-handoff"]);
const allowedMetrics = new Set([
  "action_correct",
  "answer_correct",
  "conflict_action_correct",
  "conflict_created",
  "evidence_precision_at_k",
  "evidence_recall_at_k",
  "excluded_memory_correct",
  "forget_correct",
  "ignored_memory_correct",
  "scope_isolation_correct",
  "token_budget_respected",
  "trace_id_present",
  "update_correct",
  "used_memory_correct"
]);
const allowedExpectationKeys = new Set([
  "absentMemoryIds",
  "answerIncludes",
  "candidateStatus",
  "candidateSupersedesMemoryIds",
  "candidateText",
  "conflictStatus",
  "conflictType",
  "contextExcludes",
  "contextExcludesAny",
  "contextIncludes",
  "excludedMemoryIds",
  "existingStatus",
  "existingSupersededBy",
  "ignoredMemoryIds",
  "memoryIdsAbsent",
  "memoryIdsAbsentOrContextExcluded",
  "memoryIdsPresent",
  "openConflictCount",
  "recommendedAction",
  "status",
  "traceExcludedMemoryIds",
  "traceId",
  "traceIdPresent",
  "traceIgnoredMemoryIds",
  "traceUsedMemoryIds",
  "usedMemoryIds",
  "vaultConflictsCount"
]);
const allowedConflictResolutionActions = new Set([
  "accept_candidate",
  "reject_candidate",
  "supersede_existing",
  "merge",
  "keep_both",
  "dismiss_conflict"
]);
const handoffBaseBaselineId = "handoffbase-memory-context";
const noMemoryBaselineId = "no-memory";

const baselineDefinitions = Object.freeze([
  Object.freeze({
    id: noMemoryBaselineId,
    description: "No persistent memory, context pack, trace, or governance capability.",
    execute: runNoMemoryBenchmarkCase
  }),
  Object.freeze({
    id: handoffBaseBaselineId,
    description: "HandoffBase local in-memory store, deterministic fixture provider, and governed context path.",
    execute: runHandoffBaseBenchmarkCase
  })
]);

const baselineRegistry = new Map(baselineDefinitions.map((definition) => [definition.id, definition]));

export const IMPLEMENTED_BASELINES = Object.freeze(
  baselineDefinitions.map(({ id, description }) => Object.freeze({ id, description }))
);

let benchmarkRuntimePromise;
let InMemoryMemoryStore;
let MockMemoryProvider;
let ContinuityMemoryService;
let enumSets;

export async function main(args = process.argv.slice(2), io = defaultIo()) {
  const options = parseCliOptions(args);

  if (process.env.HANDOFFBASE_BENCH_SKIP_BUILD !== "1") {
    ensureLocalBuild();
  }

  const report = await runBenchmarkSuite(options.fixturePaths);
  if (options.json) {
    io.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report, io.write);
  }
  return report.summary.harness.ok ? 0 : 1;
}

async function runBenchmarkSuite(explicitFixturePaths = []) {
  const usesExplicitFixtures = explicitFixturePaths.length > 0;
  const fixtureFiles = usesExplicitFixtures
    ? [...new Set(explicitFixturePaths.map((fixturePath) => path.resolve(fixturePath)))].sort()
    : await findFixtureFiles();
  const results = [];
  const errors = [];
  let runtimeReady = false;

  if (fixtureFiles.length === 0) {
    errors.push({
      family: null,
      fixture: null,
      message: "No benchmark fixture files found; the regression suite cannot pass empty."
    });
  } else {
    try {
      await loadBenchmarkRuntime();
      runtimeReady = true;
    } catch (error) {
      errors.push({
        family: null,
        fixture: null,
        message: `Failed to load the local benchmark runtime: ${safeErrorMessage(error)}`
      });
    }
  }

  for (const fixtureFile of runtimeReady ? fixtureFiles : []) {
    try {
      const fixture = normalizeFixture(await readFixture(fixtureFile));
      validateFixture(fixture, fixtureFile, { enforceFamilyDirectory: !usesExplicitFixtures });

      for (const testCase of fixture.cases) {
        for (const baselineId of testCase.baselines) {
          results.push(await runBenchmarkCase(fixture, testCase, baselineId));
        }
      }
    } catch (error) {
      errors.push({
        family: path.basename(path.dirname(fixtureFile)),
        fixture: path.relative(rootDir, fixtureFile),
        message: safeErrorMessage(error)
      });
    }
  }

  for (const definition of IMPLEMENTED_BASELINES) {
    if (!results.some((result) => result.baseline === definition.id)) {
      errors.push({
        family: null,
        fixture: null,
        message: `Implemented baseline ${definition.id} was not executed by any fixture.`
      });
    }
  }

  const summary = summarize(results, errors);
  return {
    schemaVersion: 1,
    suite: "handoffbase-memory-regression",
    mode: "deterministic-local",
    implementedBaselines: IMPLEMENTED_BASELINES,
    fixtureCaseCount: countFixtureCases(results),
    baselineExecutionCount: results.length,
    results: results.map(toReportResult),
    errors,
    summary
  };
}

async function findFixtureFiles() {
  let entries;
  try {
    entries = await readdir(benchmarkRoot, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fixturePath = path.join(benchmarkRoot, entry.name, "cases.json");
    try {
      await access(fixturePath, constants.R_OK);
      files.push(fixturePath);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function readFixture(fixturePath) {
  const text = await readFile(fixturePath, "utf8");
  return JSON.parse(text);
}

function validateFixture(fixture, fixturePath, { enforceFamilyDirectory = true } = {}) {
  assert(isObject(fixture), `${shortPath(fixturePath)} must contain a JSON object.`);
  assertAllowed(fixture.family, allowedFamilies, `${shortPath(fixturePath)} uses an unsupported fixture family.`);
  if (enforceFamilyDirectory) {
    assert(
      fixture.family === path.basename(path.dirname(fixturePath)),
      `${shortPath(fixturePath)} family must match its directory name.`
    );
  }
  assert(typeof fixture.description === "string", `${shortPath(fixturePath)} must include description.`);
  assertValidDate(fixture.fixedNow, `${shortPath(fixturePath)} fixedNow must be an ISO date string.`);
  assert(isObject(fixture.defaultScope), `${shortPath(fixturePath)} must include defaultScope.`);
  normalizeCoreScope(fixture.defaultScope, `${shortPath(fixturePath)} defaultScope`);
  assert(Array.isArray(fixture.cases), `${shortPath(fixturePath)} cases must be an array.`);
  assert(fixture.cases.length > 0, `${shortPath(fixturePath)} cases must not be empty.`);
  const caseIds = fixture.cases.map((testCase) => testCase?.id);
  assert(new Set(caseIds).size === caseIds.length, `${shortPath(fixturePath)} case ids must be unique.`);

  for (const memory of fixture.seedMemories ?? []) {
    validateSeedMemory(memory, fixture.defaultScope, `${shortPath(fixturePath)} seedMemories`);
  }

  for (const testCase of fixture.cases) {
    validateCase(testCase, fixture);
  }
}

function normalizeFixture(fixture) {
  if (!isObject(fixture)) {
    return fixture;
  }
  return {
    ...fixture,
    seedMemories: fixture.seedMemories ?? [],
    cases: Array.isArray(fixture.cases)
      ? fixture.cases.map((testCase) => normalizeCase(testCase))
      : fixture.cases
  };
}

function normalizeCase(testCase) {
  if (!isObject(testCase)) {
    return testCase;
  }
  const caseExpected = normalizeExpect(testCase.expected ?? {});
  return {
    ...testCase,
    name: testCase.name ?? testCase.description ?? testCase.id,
    seedMemories: testCase.seedMemories ?? [],
    steps: Array.isArray(testCase.steps)
      ? testCase.steps.map((step) => normalizeStep(step, caseExpected))
      : testCase.steps
  };
}

function normalizeStep(step, caseExpected) {
  if (!isObject(step)) {
    return step;
  }
  const op = normalizeOperation(step.op ?? step.operation);
  const input = isObject(step.input) ? step.input : {};
  const expect = normalizeExpect(step.expect ?? step.expected ?? caseExpected);

  if (op === "recall") {
    return removeUndefined({
      ...step,
      op,
      query: step.query ?? input.query,
      types: step.types ?? input.types,
      limit: step.limit ?? input.limit,
      tokenBudget: step.tokenBudget ?? input.tokenBudget,
      scopes: step.scopes ?? step.scope ?? input.scopes ?? input.scope,
      expect
    });
  }

  if (op === "bootstrap") {
    return removeUndefined({
      ...step,
      op,
      host: step.host ?? input.host,
      sessionId: step.sessionId ?? input.sessionId,
      taskHint: step.taskHint ?? input.taskHint,
      tokenBudget: step.tokenBudget ?? input.tokenBudget,
      scope: step.scope ?? input.scope ?? input.scopes,
      expect
    });
  }

  if (op === "forget") {
    return removeUndefined({
      ...step,
      op,
      memoryId: step.memoryId ?? input.memoryId,
      mode: step.mode ?? input.mode,
      reason: step.reason ?? input.reason,
      expect
    });
  }

  if (op === "resolveConflict") {
    return removeUndefined({
      ...step,
      op,
      conflictId: step.conflictId ?? input.conflictId ?? input.conflict_id,
      action: step.action ?? input.action,
      mergedText: step.mergedText ?? input.mergedText ?? input.merged_text,
      reason: step.reason ?? input.reason,
      expect
    });
  }

  return {
    ...step,
    op,
    expect
  };
}

function normalizeOperation(operation) {
  if (operation === "memory_recall") return "recall";
  if (operation === "continuity_bootstrap") return "bootstrap";
  if (operation === "memory_forget") return "forget";
  if (operation === "memory_resolve_conflict") return "resolveConflict";
  return operation;
}

function normalizeExpect(expect) {
  if (!isObject(expect)) {
    return expect;
  }
  for (const key of Object.keys(expect)) {
    assert(allowedExpectationKeys.has(key), `Unsupported benchmark expectation key ${key}.`);
  }
  const traceIdPresent = expect.traceIdPresent ?? (expect.traceId === "present" ? true : undefined);
  const contextExcludes = expect.contextExcludes !== undefined || expect.contextExcludesAny !== undefined
    ? [...(expect.contextExcludes ?? []), ...(expect.contextExcludesAny ?? [])]
    : undefined;
  return removeUndefined({
    traceIdPresent,
    memoryIdsPresent: expect.memoryIdsPresent,
    memoryIdsAbsent: expect.memoryIdsAbsent ?? expect.absentMemoryIds,
    contextIncludes: expect.contextIncludes ?? expect.answerIncludes,
    contextExcludes,
    traceUsedMemoryIds: expect.traceUsedMemoryIds ?? expect.usedMemoryIds,
    traceIgnoredMemoryIds: expect.traceIgnoredMemoryIds ?? expect.ignoredMemoryIds,
    traceExcludedMemoryIds: expect.traceExcludedMemoryIds ?? expect.excludedMemoryIds,
    memoryIdsAbsentOrContextExcluded: expect.memoryIdsAbsentOrContextExcluded,
    status: expect.status,
    candidateStatus: expect.candidateStatus,
    candidateSupersedesMemoryIds: expect.candidateSupersedesMemoryIds,
    candidateText: expect.candidateText,
    conflictStatus: expect.conflictStatus,
    openConflictCount: expect.openConflictCount,
    conflictType: expect.conflictType,
    existingStatus: expect.existingStatus,
    existingSupersededBy: expect.existingSupersededBy,
    recommendedAction: expect.recommendedAction,
    vaultConflictsCount: expect.vaultConflictsCount
  });
}

function validateCase(testCase, fixture) {
  const label = `${fixture.family}/${testCase?.id ?? "<missing-id>"}`;
  assert(isObject(testCase), `${fixture.family} case must be an object.`);
  assert(typeof testCase.id === "string" && testCase.id.length > 0, `${label} must include id.`);
  assert(typeof testCase.name === "string" && testCase.name.length > 0, `${label} must include name.`);
  assert(Array.isArray(testCase.metrics), `${label} metrics must be an array.`);
  assert(testCase.metrics.length > 0, `${label} metrics must not be empty.`);
  assert(new Set(testCase.metrics).size === testCase.metrics.length, `${label} metrics must be unique.`);
  assert(Array.isArray(testCase.baselines), `${label} baselines must be an array.`);
  assert(testCase.baselines.length > 0, `${label} baselines must not be empty.`);
  assert(new Set(testCase.baselines).size === testCase.baselines.length, `${label} baselines must be unique.`);
  assert(isObject(testCase.baselineExpectations), `${label} must include baselineExpectations.`);
  assert(Array.isArray(testCase.seedMemories), `${label} seedMemories must be an array.`);
  assert(Array.isArray(testCase.steps), `${label} steps must be an array.`);
  assert(testCase.steps.length > 0, `${label} steps must not be empty.`);

  for (const metric of testCase.metrics) {
    assert(
      typeof metric === "string" && allowedMetrics.has(metric),
      `${label} uses unsupported metric ${String(metric)}.`
    );
  }

  const expectationIds = Object.keys(testCase.baselineExpectations).sort();
  const baselineIds = [...testCase.baselines].sort();
  assert(
    JSON.stringify(expectationIds) === JSON.stringify(baselineIds),
    `${label} baselineExpectations keys must exactly match baselines.`
  );

  for (const baselineId of testCase.baselines) {
    assert(baselineRegistry.has(baselineId), `${label} uses unimplemented baseline ${baselineId}.`);
    const expectation = testCase.baselineExpectations[baselineId];
    assert(isObject(expectation), `${label} baseline ${baselineId} expectation must be an object.`);
    assert(
      Object.keys(expectation).length === 1 && Object.hasOwn(expectation, "pass"),
      `${label} baseline ${baselineId} expectation supports only pass.`
    );
    assert(typeof expectation.pass === "boolean", `${label} baseline ${baselineId} expectation must include boolean pass.`);
    if (baselineId === handoffBaseBaselineId) {
      assert(expectation.pass === true, `${label} cannot mark the HandoffBase baseline as an expected failure.`);
    }
  }

  for (const memory of testCase.seedMemories) {
    validateSeedMemory(memory, fixture.defaultScope, `${label} seedMemories`);
  }

  for (const [index, step] of testCase.steps.entries()) {
    validateStep(step, `${label} step ${index + 1}`);
  }
}

function validateSeedMemory(memory, defaultScope, label) {
  assert(isObject(memory), `${label} entries must be objects.`);
  assert(typeof memory.id === "string" && memory.id.length > 0, `${label} entries must include id.`);
  assertAllowed(memory.type, enumSets.types, `${label} memory ${memory.id} uses an unsupported type.`);
  assert(typeof memory.canonicalText === "string" && memory.canonicalText.length > 0, `${label} memory ${memory.id} needs text.`);
  assertAllowed(memory.status ?? "active", enumSets.statuses, `${label} memory ${memory.id} uses an unsupported status.`);
  assertAllowed(memory.sourceKind ?? "manual_import", enumSets.sourceKinds, `${label} memory ${memory.id} uses an unsupported source kind.`);
  normalizeCoreScope({ ...defaultScope, ...(memory.scope ?? {}) }, `${label} memory ${memory.id} scope`);
}

function validateStep(step, label) {
  assert(isObject(step), `${label} must be an object.`);
  assert(typeof step.op === "string" && step.op.length > 0, `${label} must include op.`);
  if (step.op === "recall") {
    assert(typeof step.query === "string" && step.query.length > 0, `${label} recall must include query.`);
    validateExpectObject(step.expect, label);
    return;
  }
  if (step.op === "bootstrap") {
    assert(typeof step.host === "string" && step.host.length > 0, `${label} bootstrap must include host.`);
    validateExpectObject(step.expect, label);
    return;
  }
  if (step.op === "forget") {
    assert(typeof step.memoryId === "string" && step.memoryId.length > 0, `${label} forget must include memoryId.`);
    assert(typeof step.mode === "string" && step.mode.length > 0, `${label} forget must include mode.`);
    assert(typeof step.reason === "string" && step.reason.length > 0, `${label} forget must include reason.`);
    validateExpectObject(step.expect, label);
    return;
  }
  if (step.op === "conflictRemember") {
    assert(typeof step.source === "string" && step.source.length > 0, `${label} conflictRemember must include source.`);
    assert(typeof step.content === "string" && step.content.length > 0, `${label} conflictRemember must include content.`);
    assert(isObject(step.candidate), `${label} conflictRemember must include candidate.`);
    assertAllowed(step.candidate.type, enumSets.types, `${label} conflictRemember candidate uses an unsupported type.`);
    assertAllowed(step.candidate.status ?? "pending", enumSets.statuses, `${label} conflictRemember candidate uses an unsupported status.`);
    assert(isObject(step.conflict), `${label} conflictRemember must include conflict.`);
    assertAllowed(step.conflict.conflictType, enumSets.conflictTypes, `${label} conflictRemember uses an unsupported conflict type.`);
    assertAllowed(step.conflict.recommendedAction, enumSets.conflictActions, `${label} conflictRemember uses an unsupported action.`);
    validateExpectObject(step.expect, label);
    return;
  }
  if (step.op === "resolveConflict") {
    assert(typeof step.conflictId === "string" && step.conflictId.length > 0, `${label} resolveConflict must include conflictId.`);
    assertAllowed(step.action, allowedConflictResolutionActions, `${label} resolveConflict uses an unsupported action.`);
    assert(typeof step.reason === "string" && step.reason.length > 0, `${label} resolveConflict must include reason.`);
    if (step.action === "merge") {
      assert(typeof step.mergedText === "string" && step.mergedText.length > 0, `${label} merge must include mergedText.`);
    }
    validateExpectObject(step.expect, label);
    assert(typeof step.expect.conflictStatus === "string", `${label} resolveConflict must expect conflictStatus.`);
    return;
  }
  throw new Error(`${label} uses unsupported op ${step.op}.`);
}

function validateExpectObject(expect, label) {
  assert(isObject(expect), `${label} must include expect.`);
  assert(Object.keys(expect).length > 0, `${label} expect must not be empty.`);

  for (const key of [
    "memoryIdsPresent",
    "memoryIdsAbsent",
    "memoryIdsAbsentOrContextExcluded",
    "contextIncludes",
    "contextExcludes",
    "traceUsedMemoryIds",
    "traceIgnoredMemoryIds",
    "traceExcludedMemoryIds",
    "candidateSupersedesMemoryIds"
  ]) {
    if (expect[key] !== undefined) {
      assert(
        Array.isArray(expect[key]) && expect[key].every((value) => typeof value === "string"),
        `${label} expect.${key} must be an array of strings.`
      );
    }
  }

  if (expect.traceIdPresent !== undefined) {
    assert(typeof expect.traceIdPresent === "boolean", `${label} expect.traceIdPresent must be boolean.`);
  }
  for (const key of ["openConflictCount", "vaultConflictsCount"]) {
    if (expect[key] !== undefined) {
      assert(Number.isInteger(expect[key]) && expect[key] >= 0, `${label} expect.${key} must be a non-negative integer.`);
    }
  }
  for (const key of ["status", "candidateStatus", "candidateText", "conflictStatus", "conflictType", "existingStatus", "recommendedAction"]) {
    if (expect[key] !== undefined) {
      assert(typeof expect[key] === "string" && expect[key].length > 0, `${label} expect.${key} must be a string.`);
    }
  }
  if (expect.existingSupersededBy !== undefined) {
    assert(
      expect.existingSupersededBy === null ||
        (typeof expect.existingSupersededBy === "string" && expect.existingSupersededBy.length > 0),
      `${label} expect.existingSupersededBy must be a string or null.`
    );
  }
}

async function runBenchmarkCase(fixture, testCase, baselineId) {
  const expectedPass = testCase.baselineExpectations[baselineId].pass;
  let observedPass = false;
  let failure = null;
  let executionError = null;

  try {
    await baselineRegistry.get(baselineId).execute(fixture, testCase);
    observedPass = true;
  } catch (error) {
    if (error instanceof BenchmarkAssertionError) {
      failure = safeErrorMessage(error);
    } else {
      executionError = safeErrorMessage(error);
    }
  }

  return {
    baseline: baselineId,
    family: fixture.family,
    id: testCase.id,
    name: testCase.name,
    metrics: [...testCase.metrics],
    observedPass,
    expectedPass,
    expectationMatched: executionError === null && observedPass === expectedPass,
    failure,
    executionError
  };
}

async function runHandoffBaseBenchmarkCase(fixture, testCase) {
  const fixedNow = new Date(fixture.fixedNow);
  const defaultScope = normalizeCoreScope(fixture.defaultScope, `${fixture.family}/${testCase.id} defaultScope`);
  const store = new InMemoryMemoryStore({ clock: () => fixedNow });
  const provider = createBenchmarkFixtureProvider(MockMemoryProvider, testCase.steps);
  const service = new ContinuityMemoryService({
    store,
    provider,
    seedDemoMemories: false
  });

  await seedStore(store, defaultScope, fixedNow, fixture.seedMemories ?? []);
  await seedStore(store, defaultScope, fixedNow, testCase.seedMemories);
  await runCaseSteps({
    fixture,
    testCase,
    baselineId: handoffBaseBaselineId,
    service,
    store,
    defaultScope,
    fixedNow
  });
}

async function runNoMemoryBenchmarkCase(fixture, testCase) {
  const fixedNow = new Date(fixture.fixedNow);
  const defaultScope = normalizeCoreScope(fixture.defaultScope, `${fixture.family}/${testCase.id} defaultScope`);
  const { service, store } = createNoMemoryRuntime();
  await runCaseSteps({
    fixture,
    testCase,
    baselineId: noMemoryBaselineId,
    service,
    store,
    defaultScope,
    fixedNow,
    collectAssertionFailures: true
  });
}

async function runCaseSteps({
  fixture,
  testCase,
  baselineId,
  service,
  store,
  defaultScope,
  fixedNow,
  collectAssertionFailures = false
}) {
  const assertionFailures = [];
  const state = {
    conflictIds: new Map(),
    memoryIds: new Map()
  };
  for (const [index, step] of testCase.steps.entries()) {
    try {
      await runStep({
        service,
        store,
        baselineId,
        defaultScope,
        fixedNow,
        state,
        step,
        label: `${fixture.family}/${testCase.id} step ${index + 1}`
      });
    } catch (error) {
      if (!collectAssertionFailures || !(error instanceof BenchmarkAssertionError)) {
        throw error;
      }
      assertionFailures.push(error);
    }
  }

  if (assertionFailures.length > 0) {
    throw assertionFailures[0];
  }
}

function createNoMemoryRuntime() {
  const emptyContextPack = () => ({
    user: [],
    procedures: [],
    project: [],
    tool_memory: [],
    failure_memory: []
  });

  return {
    service: {
      async recall() {
        return { memories: [], context_block: "", trace_id: "" };
      },
      async continuityBootstrap() {
        return { context_pack: emptyContextPack(), memory_trace_id: "", suggested_next_tools: [] };
      },
      async forget() {
        return { status: "absent" };
      },
      async remember() {
        return { candidate_memories: [], warnings: ["no_memory_baseline"] };
      },
      async resolveConflict(input) {
        return {
          conflict_id: input.conflict_id,
          action: input.action,
          conflict_status: "absent",
          event_ids: [],
          resolved_at: ""
        };
      },
      async trace() {
        return { used_memories: [], ignored_memories: [], excluded_memories: [] };
      },
      async readResource() {
        return { text: JSON.stringify({ count: 0, conflicts: [] }) };
      }
    },
    store: {
      async listConflicts() {
        return [];
      }
    }
  };
}

function assertNoMemoryRecallContract(baselineId, output, label) {
  if (baselineId !== noMemoryBaselineId) return;
  assert(Array.isArray(output.memories) && output.memories.length === 0, `${label} no-memory executor returned memories.`);
  assert(output.context_block === "", `${label} no-memory executor returned context.`);
  assert(output.trace_id === "", `${label} no-memory executor returned a trace.`);
}

function assertNoMemoryBootstrapContract(baselineId, output, label) {
  if (baselineId !== noMemoryBaselineId) return;
  assert(flattenContextPack(output.context_pack) === "", `${label} no-memory executor returned bootstrap context.`);
  assert(output.memory_trace_id === "", `${label} no-memory executor returned a bootstrap trace.`);
}

function assertNoMemoryForgetContract(baselineId, output, label) {
  if (baselineId !== noMemoryBaselineId) return;
  assert(output.status === "absent", `${label} no-memory executor mutated forget state.`);
}

function assertNoMemoryRememberContract(baselineId, output, label) {
  if (baselineId !== noMemoryBaselineId) return;
  assert(
    Array.isArray(output.candidate_memories) && output.candidate_memories.length === 0,
    `${label} no-memory executor created a memory candidate.`
  );
}

function assertNoMemoryResolveContract(baselineId, output, label) {
  if (baselineId !== noMemoryBaselineId) return;
  assert(output.conflict_status === "absent", `${label} no-memory executor resolved a conflict.`);
  assert(Array.isArray(output.event_ids) && output.event_ids.length === 0, `${label} no-memory executor emitted events.`);
}

async function seedStore(store, defaultScope, fixedNow, memories) {
  for (const memory of memories) {
    const input = toCreateMemoryInput(memory, defaultScope);
    const needsSupersedePatch = memory.status === "superseded" && typeof memory.supersededBy === "string";
    if (needsSupersedePatch) {
      input.status = "active";
    }

    const result = await store.addMemory(input, {
      actor: { type: "system", id: "benchmark_seed" },
      reason: "Seed deterministic memory benchmark fixture.",
      now: fixedNow
    });

    if (needsSupersedePatch) {
      await store.updateMemory(result.memory.id, { status: "superseded", supersededBy: memory.supersededBy }, {
        actor: { type: "system", id: "benchmark_seed" },
        reason: "Mark deterministic benchmark seed as superseded.",
        now: fixedNow
      });
    }
  }
}

async function runStep(context) {
  if (context.step.op === "recall") {
    await runRecallStep(context);
    return;
  }
  if (context.step.op === "bootstrap") {
    await runBootstrapStep(context);
    return;
  }
  if (context.step.op === "forget") {
    await runForgetStep(context);
    return;
  }
  if (context.step.op === "conflictRemember") {
    await runConflictRememberStep(context);
    return;
  }
  if (context.step.op === "resolveConflict") {
    await runResolveConflictStep(context);
    return;
  }
  throw new Error(`${context.label} uses unsupported op.`);
}

async function runRecallStep({ service, baselineId, defaultScope, step, label }) {
  const scope = mergeCoreScope(defaultScope, step.scopes ?? {}, `${label} recall scope`);
  const output = await service.recall({
    query: step.query,
    scopes: toToolScope(scope),
    types: step.types,
    limit: step.limit,
    token_budget: step.tokenBudget
  });
  assertNoMemoryRecallContract(baselineId, output, label);

  const expect = step.expect;
  const recalledIds = output.memories.map((memory) => memory.id);
  assertIdsPresent(recalledIds, expect.memoryIdsPresent, `${label} recalled memory`);
  assertIdsAbsent(recalledIds, expect.memoryIdsAbsent, `${label} recalled memory`);
  assertIdsAbsentOrContextExcluded(output.memories, output.context_block, expect.memoryIdsAbsentOrContextExcluded, `${label} recalled memory`);
  assertTextIncludes(output.context_block, expect.contextIncludes, `${label} context`);
  assertTextExcludes(output.context_block, expect.contextExcludes, `${label} context`);

  if (expect.traceIdPresent === true) {
    assertNonEmptyString(output.trace_id, `${label} should return a trace id.`);
  }
  await assertTraceExpectations(service, output.trace_id, expect, label);
}

async function runBootstrapStep({ service, baselineId, defaultScope, step, label }) {
  const scope = mergeCoreScope(defaultScope, step.scope ?? {}, `${label} bootstrap scope`);
  const output = await service.continuityBootstrap({
    host: step.host,
    agent_profile: scope.agentProfileId,
    user_id: scope.userId,
    project: scope.projectId ? { id: scope.projectId } : undefined,
    session_id: step.sessionId,
    task_hint: step.taskHint,
    token_budget: step.tokenBudget
  }, benchmarkContext(scope, step.host));
  assertNoMemoryBootstrapContract(baselineId, output, label);

  const contextText = flattenContextPack(output.context_pack);
  const expect = step.expect;
  assertTextIncludes(contextText, expect.contextIncludes, `${label} context`);
  assertTextExcludes(contextText, expect.contextExcludes, `${label} context`);

  if (expect.traceIdPresent === true) {
    assertNonEmptyString(output.memory_trace_id, `${label} should return a trace id.`);
  }
  await assertTraceExpectations(service, output.memory_trace_id, expect, label);
}

async function runForgetStep({ service, baselineId, step, label }) {
  const output = await service.forget({
    memory_id: step.memoryId,
    mode: step.mode,
    reason: step.reason
  });
  assertNoMemoryForgetContract(baselineId, output, label);

  if (step.expect.status !== undefined) {
    benchmarkAssert(output.status === step.expect.status, `${label} forgot memory status mismatch.`);
  }
}

async function runConflictRememberStep({ service, store, baselineId, defaultScope, state, step, label }) {
  const scope = mergeCoreScope(
    defaultScope,
    step.scopes ?? step.scope ?? step.candidate.scope ?? {},
    `${label} conflict scope`
  );
  const remembered = await service.remember({
    source: step.source,
    content: step.content,
    scopes: toToolScope(scope),
    approval_mode: step.approvalMode
  });
  assertNoMemoryRememberContract(baselineId, remembered, label);
  const [candidate] = remembered.candidate_memories;

  benchmarkAssert(candidate, `${label} should create a candidate memory.`);
  if (typeof candidate.id === "string") {
    state.memoryIds.set(step.candidate.id, candidate.id);
    state.memoryIds.set(step.conflict.candidateMemoryId, candidate.id);
  }
  if (step.expect.candidateStatus !== undefined) {
    benchmarkAssert(candidate.status === step.expect.candidateStatus, `${label} candidate status mismatch.`);
  }

  const conflicts = await store.listConflicts({ statuses: ["open"] });
  const createdConflict = conflicts.find(
    (conflict) =>
      conflict.candidateMemoryId === candidate.id &&
      conflict.existingMemoryId === resolveMemoryAlias(state, step.conflict.existingMemoryId)
  );
  if (createdConflict && typeof step.conflict.id === "string") {
    state.conflictIds.set(step.conflict.id, createdConflict.id);
  }
  if (step.expect.openConflictCount !== undefined) {
    benchmarkAssert(conflicts.length === step.expect.openConflictCount, `${label} open conflict count mismatch.`);
  }

  const expectsOpenConflicts = step.expect.openConflictCount === undefined || step.expect.openConflictCount > 0;

  if (expectsOpenConflicts && step.expect.conflictType !== undefined) {
    benchmarkAssert(conflicts.some((conflict) => conflict.conflictType === step.expect.conflictType), `${label} conflict type mismatch.`);
  }

  if (expectsOpenConflicts && step.expect.recommendedAction !== undefined) {
    benchmarkAssert(
      conflicts.some((conflict) => conflict.recommendedAction === step.expect.recommendedAction),
      `${label} recommended conflict action mismatch.`
    );
  }

  if (step.expect.vaultConflictsCount !== undefined) {
    const resource = await service.readResource({
      name: "vault-conflicts",
      uri: "memory://vault/conflicts",
      variables: {}
    });
    const payload = JSON.parse(resource.text);
    benchmarkAssert(payload.count === step.expect.vaultConflictsCount, `${label} vault conflict count mismatch.`);
  }
}

async function runResolveConflictStep({ service, store, baselineId, defaultScope, state, step, label }) {
  const conflictId = state.conflictIds.get(step.conflictId) ?? step.conflictId;
  const output = await service.resolveConflict({
    conflict_id: conflictId,
    action: step.action,
    merged_text: step.mergedText,
    reason: step.reason
  }, benchmarkContext(defaultScope));
  assertNoMemoryResolveContract(baselineId, output, label);

  const expect = step.expect;
  if (expect.conflictStatus !== undefined) {
    benchmarkAssert(output.conflict_status === expect.conflictStatus, `${label} conflict status mismatch.`);
  }
  if (expect.candidateStatus !== undefined) {
    benchmarkAssert(output.candidate_memory?.status === expect.candidateStatus, `${label} candidate status mismatch.`);
  }
  if (expect.existingStatus !== undefined) {
    benchmarkAssert(output.existing_memory?.status === expect.existingStatus, `${label} existing status mismatch.`);
  }
  if (expect.candidateText !== undefined) {
    benchmarkAssert(output.candidate_memory?.text === expect.candidateText, `${label} candidate text mismatch.`);
  }
  if (expect.candidateSupersedesMemoryIds !== undefined) {
    assertExactIds(
      output.candidate_memory?.supersedes,
      expect.candidateSupersedesMemoryIds.map((memoryId) => resolveMemoryAlias(state, memoryId)),
      `${label} candidate supersedes`
    );
  }
  if (expect.existingSupersededBy !== undefined) {
    const expectedSupersededBy = expect.existingSupersededBy === null
      ? null
      : resolveMemoryAlias(state, expect.existingSupersededBy);
    benchmarkAssert(
      (output.existing_memory?.superseded_by ?? null) === expectedSupersededBy,
      `${label} existing superseded_by mismatch.`
    );
  }

  const persistedConflict = await store.getConflict(conflictId);
  benchmarkAssert(persistedConflict?.status === expect.conflictStatus, `${label} persisted conflict status mismatch.`);
  benchmarkAssert(persistedConflict?.resolution?.action === step.action, `${label} persisted conflict action mismatch.`);

  const candidate = output.candidate_memory?.id
    ? await store.getMemory(output.candidate_memory.id)
    : undefined;
  const existing = output.existing_memory?.id
    ? await store.getMemory(output.existing_memory.id)
    : undefined;
  if (expect.candidateStatus !== undefined) {
    benchmarkAssert(candidate?.status === expect.candidateStatus, `${label} persisted candidate status mismatch.`);
  }
  if (expect.existingStatus !== undefined) {
    benchmarkAssert(existing?.status === expect.existingStatus, `${label} persisted existing status mismatch.`);
  }
  if (expect.candidateText !== undefined) {
    benchmarkAssert(candidate?.canonicalText === expect.candidateText, `${label} persisted candidate text mismatch.`);
  }
  if (expect.candidateSupersedesMemoryIds !== undefined) {
    assertExactIds(
      candidate?.supersedes,
      expect.candidateSupersedesMemoryIds.map((memoryId) => resolveMemoryAlias(state, memoryId)),
      `${label} persisted candidate supersedes`
    );
  }
  if (expect.existingSupersededBy !== undefined) {
    const expectedSupersededBy = expect.existingSupersededBy === null
      ? null
      : resolveMemoryAlias(state, expect.existingSupersededBy);
    benchmarkAssert(
      (existing?.supersededBy ?? null) === expectedSupersededBy,
      `${label} persisted existing supersededBy mismatch.`
    );
  }

  if (expect.openConflictCount !== undefined) {
    const openConflicts = await store.listConflicts({ statuses: ["open"] });
    benchmarkAssert(openConflicts.length === expect.openConflictCount, `${label} open conflict count mismatch.`);
  }
  if (expect.vaultConflictsCount !== undefined) {
    const resource = await service.readResource({
      name: "vault-conflicts",
      uri: "memory://vault/conflicts",
      variables: {}
    });
    const payload = JSON.parse(resource.text);
    benchmarkAssert(payload.count === expect.vaultConflictsCount, `${label} vault conflict count mismatch.`);
  }
}

function resolveMemoryAlias(state, memoryId) {
  return state.memoryIds.get(memoryId) ?? memoryId;
}

function assertExactIds(actualIds, expectedIds, label) {
  benchmarkAssert(Array.isArray(actualIds), `${label} must be an array.`);
  benchmarkAssert(
    JSON.stringify([...actualIds].sort()) === JSON.stringify([...expectedIds].sort()),
    `${label} ids mismatch.`
  );
}

async function assertTraceExpectations(service, traceId, expect, label) {
  const needsTrace =
    expect.traceUsedMemoryIds !== undefined ||
    expect.traceIgnoredMemoryIds !== undefined ||
    expect.traceExcludedMemoryIds !== undefined;

  if (!needsTrace) {
    return;
  }

  assertNonEmptyString(traceId, `${label} needs a trace id for trace assertions.`);
  const trace = await service.trace({ trace_id: traceId });
  const usedIds = trace.used_memories.map((memory) => memory.memory_id);
  const ignoredIds = trace.ignored_memories.map((memory) => memory.memory_id);
  const excludedIds = trace.excluded_memories.map((memory) => memory.memory_id);

  assertIdsExpectation(usedIds, expect.traceUsedMemoryIds, `${label} used trace memory`);
  assertIdsExpectation(ignoredIds, expect.traceIgnoredMemoryIds, `${label} ignored trace memory`);
  assertIdsExpectation(excludedIds, expect.traceExcludedMemoryIds, `${label} excluded trace memory`);
}

function createBenchmarkFixtureProvider(MockProviderClass, steps) {
  const mock = new MockProviderClass();
  const conflictPlansByContent = new Map();
  const conflictPlansByCanonicalText = new Map();

  for (const step of steps.filter((item) => item.op === "conflictRemember")) {
    conflictPlansByContent.set(step.content, step);
    conflictPlansByCanonicalText.set(step.candidate.canonicalText, step);
  }

  return {
    classifyMemory: (input) => mock.classifyMemory(input),
    buildContextPack: (input) => mock.buildContextPack(input),
    reflectRun: (input) => mock.reflectRun(input),
    explainMemoryUsage: (input) => mock.explainMemoryUsage(input),
    async extractMemories(input) {
      const plan = conflictPlansByContent.get(input.content);
      if (!plan) {
        return mock.extractMemories(input);
      }
      return [toFixtureCandidate(plan, input)];
    },
    async detectConflicts(input) {
      const plan = conflictPlansByCanonicalText.get(input.candidate.canonicalText);
      if (!plan) {
        return mock.detectConflicts(input);
      }
      if (plan.conflict.conflictType === "none") {
        return {
          conflicts: [],
          recommendedAction: plan.conflict.recommendedAction,
          reason: plan.conflict.reason ?? "Synthetic benchmark candidate should not create an open conflict."
        };
      }
      return {
        conflicts: [
          {
            existingMemoryId: plan.conflict.existingMemoryId,
            conflictType: plan.conflict.conflictType,
            severity: plan.conflict.severity ?? "medium",
            reason: plan.conflict.reason ?? "Synthetic benchmark conflict.",
            suggestedAction: plan.conflict.recommendedAction,
            confidence: plan.conflict.confidence ?? 0.9
          }
        ],
        recommendedAction: plan.conflict.recommendedAction,
        reason: plan.conflict.reason ?? "Synthetic benchmark conflict requires review."
      };
    }
  };
}

function toFixtureCandidate(plan, input) {
  return {
    type: plan.candidate.type,
    canonicalText: plan.candidate.canonicalText,
    scope: input.scopes,
    validity: {
      status: "current",
      validFrom: plan.candidate.validFrom,
      validUntil: plan.candidate.validUntil
    },
    confidence: plan.candidate.confidence ?? 0.8,
    importance: plan.candidate.importance ?? 0.7,
    status: plan.conflict.conflictType === "none" && plan.conflict.recommendedAction === "reject"
      ? "rejected"
      : plan.candidate.status ?? input.approvalMode ?? "pending",
    sourceKind: input.sourceKind,
    sourceTrust: input.sourceTrust ?? "user_direct",
    rawSource: plan.content,
    evidence: [plan.content.slice(0, 160)],
    tags: ["benchmark"],
    safety: {
      decision: "allow",
      sensitive: false,
      untrustedExternal: false,
      reasons: [],
      redactions: []
    },
    rationale: "Deterministic benchmark fixture generated a candidate memory.",
    metadata: {
      benchmark_case: true
    }
  };
}

function toCreateMemoryInput(memory, defaultScope) {
  return {
    id: memory.id,
    scope: mergeCoreScope(defaultScope, memory.scope ?? {}, `seed memory ${memory.id} scope`),
    type: memory.type,
    canonicalText: memory.canonicalText,
    sourceKind: memory.sourceKind ?? "manual_import",
    status: memory.status ?? "active",
    confidence: memory.confidence ?? 0.8,
    importance: memory.importance ?? 0.5,
    metadata: memory.metadata ?? {},
    validFrom: memory.validFrom,
    validUntil: memory.validUntil,
    supersedes: memory.supersedes ?? []
  };
}

function mergeCoreScope(base, override, label) {
  return normalizeCoreScope({ ...base, ...normalizeScopeAliases(override) }, label);
}

function normalizeCoreScope(scope, label) {
  const normalized = normalizeScopeAliases(scope);
  assert(typeof normalized.tenantId === "string" && normalized.tenantId.length > 0, `${label} must include tenantId.`);
  assert(typeof normalized.userId === "string" && normalized.userId.length > 0, `${label} must include userId.`);
  return {
    tenantId: normalized.tenantId,
    userId: normalized.userId,
    agentProfileId: normalized.agentProfileId,
    projectId: normalized.projectId,
    hostId: normalized.hostId,
    sessionId: normalized.sessionId,
    toolId: normalized.toolId
  };
}

function normalizeScopeAliases(scope) {
  const source = isObject(scope) ? scope : {};
  return removeUndefined({
    tenantId: source.tenantId ?? source.tenant_id,
    userId: source.userId ?? source.user_id,
    agentProfileId: source.agentProfileId ?? source.agent_profile_id,
    projectId: source.projectId ?? source.project_id,
    hostId: source.hostId ?? source.host_id,
    sessionId: source.sessionId ?? source.session_id,
    toolId: source.toolId ?? source.tool_id
  });
}

function toToolScope(scope) {
  return removeUndefined({
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    agent_profile_id: scope.agentProfileId,
    project_id: scope.projectId,
    host_id: scope.hostId,
    session_id: scope.sessionId,
    tool_id: scope.toolId
  });
}

function benchmarkContext(scope, actorId = "memory-benchmark") {
  return {
    caller: {
      tenantId: scope.tenantId,
      userId: scope.userId,
      actorType: "mcp_host",
      actorId,
      authMode: "api_key"
    }
  };
}

function flattenContextPack(contextPack) {
  return [
    ...(contextPack.user ?? []),
    ...(contextPack.procedures ?? []),
    ...(contextPack.project ?? []),
    ...(contextPack.tool_memory ?? []),
    ...(contextPack.failure_memory ?? [])
  ].join("\n");
}

function summarize(caseResults, fixtureErrors) {
  const perBaseline = {};

  for (const definition of IMPLEMENTED_BASELINES) {
    const results = caseResults.filter((result) => result.baseline === definition.id);
    if (results.length === 0) {
      continue;
    }
    perBaseline[definition.id] = summarizeBaseline(results);
  }

  const executionErrors = caseResults.filter((result) => result.executionError !== null).length;
  const expectationMismatches = caseResults.filter((result) => !result.expectationMatched).length;
  const conformant = caseResults.filter((result) => result.expectationMatched).length;

  return {
    harness: {
      ok: fixtureErrors.length === 0 && executionErrors === 0 && expectationMismatches === 0,
      executions: caseResults.length,
      conformant,
      nonconformant: caseResults.length - conformant,
      executionErrors,
      fixtureErrors: fixtureErrors.length,
      expectationMismatches
    },
    perBaseline,
    handoffbaseDeltaOverNoMemory: compareBaselines(caseResults)
  };
}

function summarizeBaseline(results) {
  const perFamily = {};
  const perMetric = {};

  for (const result of results) {
    incrementObservedCount(perFamily, result.family, result.observedPass);
    for (const metric of result.metrics) {
      incrementObservedCount(perMetric, metric, result.observedPass);
    }
  }

  const passed = results.filter((result) => result.observedPass).length;
  const matched = results.filter((result) => result.expectationMatched).length;
  return {
    cases: withRate({ passed, total: results.length }),
    expectationConformance: withRate({ passed: matched, total: results.length }),
    executionErrors: results.filter((result) => result.executionError !== null).length,
    perFamily: sortCountObject(perFamily),
    perMetric: sortCountObject(perMetric)
  };
}

function compareBaselines(caseResults) {
  const noMemoryResults = new Map(
    caseResults
      .filter((result) => result.baseline === noMemoryBaselineId)
      .map((result) => [caseResultKey(result), result])
  );
  const handoffBaseResults = new Map(
    caseResults
      .filter((result) => result.baseline === handoffBaseBaselineId)
      .map((result) => [caseResultKey(result), result])
  );
  const sharedKeys = [...noMemoryResults.keys()]
    .filter((key) => handoffBaseResults.has(key))
    .sort();

  const caseCounts = {
    total: sharedKeys.length,
    noMemoryPassed: 0,
    handoffbasePassed: 0
  };
  const metricCounts = {
    total: 0,
    noMemoryPassed: 0,
    handoffbasePassed: 0
  };
  const perMetric = {};

  for (const key of sharedKeys) {
    const noMemory = noMemoryResults.get(key);
    const handoffBase = handoffBaseResults.get(key);
    if (noMemory.observedPass) caseCounts.noMemoryPassed += 1;
    if (handoffBase.observedPass) caseCounts.handoffbasePassed += 1;

    const sharedMetrics = noMemory.metrics
      .filter((metric) => handoffBase.metrics.includes(metric))
      .sort();
    for (const metric of sharedMetrics) {
      const count = perMetric[metric] ?? { total: 0, noMemoryPassed: 0, handoffbasePassed: 0 };
      count.total += 1;
      metricCounts.total += 1;
      if (noMemory.observedPass) {
        count.noMemoryPassed += 1;
        metricCounts.noMemoryPassed += 1;
      }
      if (handoffBase.observedPass) {
        count.handoffbasePassed += 1;
        metricCounts.handoffbasePassed += 1;
      }
      perMetric[metric] = count;
    }
  }

  return {
    comparisonCoverage: {
      sharedCases: sharedKeys.length,
      sharedMetricTaggedCases: metricCounts.total
    },
    cases: withComparisonDelta(caseCounts),
    metricTaggedCases: withComparisonDelta(metricCounts),
    perMetric: Object.fromEntries(
      Object.entries(perMetric)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([metric, count]) => [metric, withComparisonDelta(count)])
    )
  };
}

function withComparisonDelta(count) {
  const noMemoryRate = rate(count.noMemoryPassed, count.total);
  const handoffbaseRate = rate(count.handoffbasePassed, count.total);
  return {
    ...count,
    passedDelta: count.handoffbasePassed - count.noMemoryPassed,
    noMemoryRate,
    handoffbaseRate,
    passRateDelta: handoffbaseRate === null || noMemoryRate === null
      ? null
      : handoffbaseRate - noMemoryRate
  };
}

function incrementObservedCount(counts, key, passed) {
  const count = counts[key] ?? { passed: 0, total: 0 };
  count.total += 1;
  if (passed) count.passed += 1;
  counts[key] = count;
}

function sortCountObject(counts) {
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => [key, withRate(count)])
  );
}

function withRate(count) {
  return { ...count, rate: rate(count.passed, count.total) };
}

function rate(passed, total) {
  return total === 0 ? null : passed / total;
}

function caseResultKey(result) {
  return `${result.family}/${result.id}`;
}

function countFixtureCases(results) {
  return new Set(results.map(caseResultKey)).size;
}

function toReportResult(result) {
  return {
    baseline: result.baseline,
    family: result.family,
    caseId: result.id,
    name: result.name,
    metrics: result.metrics,
    observedPass: result.observedPass,
    expectedPass: result.expectedPass,
    expectationMatched: result.expectationMatched,
    failure: result.failure,
    executionError: result.executionError
  };
}

function printHumanReport(report, write) {
  for (const result of report.results) {
    const score = result.observedPass ? "PASS" : "MISS";
    const conformance = result.expectationMatched ? "MATCH" : "MISMATCH";
    const detail = result.executionError ?? result.failure;
    write(`${conformance} ${result.baseline}/${result.family}/${result.caseId} - ${score} - ${result.name}${detail ? ` - ${detail}` : ""}\n`);
  }

  for (const error of report.errors) {
    write(`ERROR ${error.fixture ?? "benchmark-suite"} - ${error.message}\n`);
  }

  write("Comparative summary:\n");
  for (const definition of IMPLEMENTED_BASELINES) {
    const summary = report.summary.perBaseline[definition.id];
    if (!summary) continue;
    write(`Baseline ${definition.id}: ${summary.cases.passed}/${summary.cases.total} observed case passes; ${summary.expectationConformance.passed}/${summary.expectationConformance.total} expectations matched.\n`);
    write("Per-family observed pass counts:\n");
    printPassCounts(summary.perFamily, write);
    write("Per-metric-tagged case pass counts:\n");
    printPassCounts(summary.perMetric, write);
  }

  const delta = report.summary.handoffbaseDeltaOverNoMemory;
  write(`HandoffBase delta over no-memory (${delta.comparisonCoverage.sharedCases} shared cases; ${delta.comparisonCoverage.sharedMetricTaggedCases} shared metric-tagged case cells):\n`);
  write(`- cases: ${formatSigned(delta.cases.passedDelta)} passes (${formatPercentagePoints(delta.cases.passRateDelta)})\n`);
  write(`- metric-tagged cases: ${formatSigned(delta.metricTaggedCases.passedDelta)} passes (${formatPercentagePoints(delta.metricTaggedCases.passRateDelta)})\n`);
  write("Per-metric HandoffBase deltas:\n");
  for (const [metric, count] of Object.entries(delta.perMetric)) {
    write(`- ${metric}: ${formatSigned(count.passedDelta)}/${count.total} (${formatPercentagePoints(count.passRateDelta)})\n`);
  }

  const harness = report.summary.harness;
  write(`Harness: ${harness.ok ? "PASS" : "FAIL"}; ${harness.conformant}/${harness.executions} executions matched expectations; ${harness.executionErrors} execution errors; ${harness.fixtureErrors} fixture errors.\n`);
}

function printPassCounts(counts, write) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    write("- none: 0/0\n");
    return;
  }
  for (const [name, count] of entries) {
    write(`- ${name}: ${count.passed}/${count.total}\n`);
  }
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function formatPercentagePoints(value) {
  if (value === null) return "n/a";
  return `${formatSigned(Number((value * 100).toFixed(2)))} pp`;
}

function assertIdsExpectation(actualIds, expectedIds, label) {
  if (expectedIds === undefined) {
    return;
  }
  if (expectedIds.length === 0) {
    benchmarkAssert(actualIds.length === 0, `${label} should be empty.`);
    return;
  }
  assertIdsPresent(actualIds, expectedIds, label);
}

function assertIdsPresent(actualIds, expectedIds, label) {
  for (const expectedId of expectedIds ?? []) {
    benchmarkAssert(actualIds.includes(expectedId), `${label} is missing an expected id.`);
  }
}

function assertIdsAbsent(actualIds, absentIds, label) {
  for (const absentId of absentIds ?? []) {
    benchmarkAssert(!actualIds.includes(absentId), `${label} includes an excluded id.`);
  }
}

export function assertIdsAbsentOrContextExcluded(memories, contextBlock, memoryIds, label) {
  for (const memoryId of memoryIds ?? []) {
    const memory = memories.find((item) => item.id === memoryId);
    if (!memory) {
      continue;
    }
    assert(typeof memory.text === "string", `${label} ${memoryId} summary must expose text.`);
    benchmarkAssert(!contextBlock.includes(memory.text), `${label} ${memoryId} should be absent or excluded from context.`);
  }
}

function assertTextIncludes(value, fragments, label) {
  for (const fragment of fragments ?? []) {
    benchmarkAssert(value.includes(fragment), `${label} is missing an expected text fragment.`);
  }
}

function assertTextExcludes(value, fragments, label) {
  for (const fragment of fragments ?? []) {
    benchmarkAssert(!value.includes(fragment), `${label} includes an excluded text fragment.`);
  }
}

function assertAllowed(value, allowed, message) {
  assert(typeof value === "string" && allowed.has(value), message);
}

function assertValidDate(value, message) {
  assert(typeof value === "string" && !Number.isNaN(new Date(value).getTime()), message);
}

function assertNonEmptyString(value, message) {
  benchmarkAssert(typeof value === "string" && value.length > 0, message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function benchmarkAssert(condition, message) {
  if (!condition) {
    throw new BenchmarkAssertionError(message);
  }
}

class BenchmarkAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "BenchmarkAssertionError";
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function shortPath(filePath) {
  return path.relative(rootDir, filePath);
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown benchmark failure.";
}

function parseCliOptions(args) {
  const options = { json: false, fixturePaths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--fixture") {
      const fixturePath = args[index + 1];
      if (!fixturePath || fixturePath.startsWith("--")) {
        throw new Error("Benchmark runner option --fixture requires a JSON file path.");
      }
      options.fixturePaths.push(fixturePath);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported benchmark runner option: ${arg}`);
  }
  return options;
}

function defaultIo() {
  return {
    write(value) {
      process.stdout.write(value);
    }
  };
}

async function loadBenchmarkRuntime() {
  if (!benchmarkRuntimePromise) {
    benchmarkRuntimePromise = Promise.all([
      import(pathToFileURL(path.join(rootDir, "packages/memory-core/dist/index.js")).href),
      import(pathToFileURL(path.join(rootDir, "dist/services/continuity-memory-service.js")).href)
    ]).then(([core, serviceModule]) => {
      InMemoryMemoryStore = core.InMemoryMemoryStore;
      MockMemoryProvider = core.MockMemoryProvider;
      ContinuityMemoryService = serviceModule.ContinuityMemoryService;
      enumSets = {
        conflictActions: new Set(core.MEMORY_CONFLICT_RECOMMENDED_ACTIONS),
        conflictTypes: new Set(core.MEMORY_CONFLICT_TYPES),
        sourceKinds: new Set(core.MEMORY_SOURCE_KINDS),
        statuses: new Set(core.MEMORY_STATUSES),
        types: new Set(core.MEMORY_TYPES)
      };
    });
  }
  await benchmarkRuntimePromise;
}

function ensureLocalBuild() {
  runBuildCommand(["run", "build", "--workspace", "@handoffbase/memory-core"]);
  runBuildCommand(["run", "build:server"]);
}

function runBuildCommand(args) {
  try {
    execFileSync("npm", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    if (error.stdout) process.stderr.write(String(error.stdout));
    if (error.stderr) process.stderr.write(String(error.stderr));
    throw new Error(`Failed to run npm ${args.join(" ")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === runnerFile) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`Benchmark runner error: ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
