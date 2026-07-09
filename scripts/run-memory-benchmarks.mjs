#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRoot = path.join(rootDir, "examples/benchmarks");
const allowedFamilies = new Set(["long-memory", "conflicts", "cross-host-handoff"]);

if (process.env.HANDOFFBASE_BENCH_SKIP_BUILD !== "1") {
  ensureLocalBuild();
}

const fixtureFiles = await findFixtureFiles();

if (fixtureFiles.length === 0) {
  console.log("No benchmark fixture files found.");
  process.exit(0);
}

const core = await import(pathToFileURL(path.join(rootDir, "packages/memory-core/dist/index.js")).href);
const serviceModule = await import(pathToFileURL(path.join(rootDir, "dist/services/continuity-memory-service.js")).href);

const {
  InMemoryMemoryStore,
  MockMemoryProvider,
  MEMORY_CONFLICT_RECOMMENDED_ACTIONS,
  MEMORY_CONFLICT_TYPES,
  MEMORY_SOURCE_KINDS,
  MEMORY_STATUSES,
  MEMORY_TYPES
} = core;
const { ContinuityMemoryService } = serviceModule;

const enumSets = {
  conflictActions: new Set(MEMORY_CONFLICT_RECOMMENDED_ACTIONS),
  conflictTypes: new Set(MEMORY_CONFLICT_TYPES),
  sourceKinds: new Set(MEMORY_SOURCE_KINDS),
  statuses: new Set(MEMORY_STATUSES),
  types: new Set(MEMORY_TYPES)
};

const results = [];

for (const fixtureFile of fixtureFiles) {
  try {
    const fixture = normalizeFixture(await readFixture(fixtureFile));
    validateFixture(fixture, fixtureFile);

    for (const testCase of fixture.cases) {
      const result = await runBenchmarkCase(fixture, testCase);
      results.push(result);
    }
  } catch (error) {
    results.push({
      family: path.basename(path.dirname(fixtureFile)),
      id: path.relative(rootDir, fixtureFile),
      name: "Fixture load",
      metrics: [],
      ok: false,
      error: safeErrorMessage(error)
    });
  }
}

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  const suffix = result.ok ? "" : ` - ${result.error}`;
  console.log(`${status} ${result.family}/${result.id} - ${result.name}${suffix}`);
}

const summary = summarize(results);
printSummary(summary);

if (summary.failed > 0) {
  process.exit(1);
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

function validateFixture(fixture, fixturePath) {
  assert(isObject(fixture), `${shortPath(fixturePath)} must contain a JSON object.`);
  assertAllowed(fixture.family, allowedFamilies, `${shortPath(fixturePath)} uses an unsupported fixture family.`);
  assert(
    fixture.family === path.basename(path.dirname(fixturePath)),
    `${shortPath(fixturePath)} family must match its directory name.`
  );
  assert(typeof fixture.description === "string", `${shortPath(fixturePath)} must include description.`);
  assertValidDate(fixture.fixedNow, `${shortPath(fixturePath)} fixedNow must be an ISO date string.`);
  assert(isObject(fixture.defaultScope), `${shortPath(fixturePath)} must include defaultScope.`);
  normalizeCoreScope(fixture.defaultScope, `${shortPath(fixturePath)} defaultScope`);
  assert(Array.isArray(fixture.cases), `${shortPath(fixturePath)} cases must be an array.`);

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
  return operation;
}

function normalizeExpect(expect) {
  if (!isObject(expect)) {
    return expect;
  }
  const traceIdPresent = expect.traceIdPresent ?? (expect.traceId === "present" ? true : undefined);
  return removeUndefined({
    ...expect,
    traceIdPresent,
    memoryIdsAbsent: expect.memoryIdsAbsent ?? expect.absentMemoryIds,
    contextIncludes: expect.contextIncludes ?? expect.answerIncludes,
    contextExcludes: [...(expect.contextExcludes ?? []), ...(expect.contextExcludesAny ?? [])],
    traceUsedMemoryIds: expect.traceUsedMemoryIds ?? expect.usedMemoryIds,
    traceIgnoredMemoryIds: expect.traceIgnoredMemoryIds ?? expect.ignoredMemoryIds,
    traceExcludedMemoryIds: expect.traceExcludedMemoryIds ?? expect.excludedMemoryIds,
    memoryIdsAbsentOrContextExcluded: expect.memoryIdsAbsentOrContextExcluded
  });
}

function validateCase(testCase, fixture) {
  const label = `${fixture.family}/${testCase?.id ?? "<missing-id>"}`;
  assert(isObject(testCase), `${fixture.family} case must be an object.`);
  assert(typeof testCase.id === "string" && testCase.id.length > 0, `${label} must include id.`);
  assert(typeof testCase.name === "string" && testCase.name.length > 0, `${label} must include name.`);
  assert(Array.isArray(testCase.metrics), `${label} metrics must be an array.`);
  assert(Array.isArray(testCase.seedMemories), `${label} seedMemories must be an array.`);
  assert(Array.isArray(testCase.steps), `${label} steps must be an array.`);

  for (const metric of testCase.metrics) {
    assert(typeof metric === "string" && metric.length > 0, `${label} metrics must contain strings.`);
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
  throw new Error(`${label} uses unsupported op ${step.op}.`);
}

function validateExpectObject(expect, label) {
  assert(isObject(expect), `${label} must include expect.`);
}

async function runBenchmarkCase(fixture, testCase) {
  try {
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

    for (const [index, step] of testCase.steps.entries()) {
      await runStep({
        service,
        store,
        defaultScope,
        fixedNow,
        step,
        label: `${fixture.family}/${testCase.id} step ${index + 1}`
      });
    }

    return {
      family: fixture.family,
      id: testCase.id,
      name: testCase.name,
      metrics: testCase.metrics,
      ok: true
    };
  } catch (error) {
    return {
      family: fixture.family,
      id: testCase.id,
      name: testCase.name,
      metrics: testCase.metrics,
      ok: false,
      error: safeErrorMessage(error)
    };
  }
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
  throw new Error(`${context.label} uses unsupported op.`);
}

async function runRecallStep({ service, defaultScope, step, label }) {
  const scope = mergeCoreScope(defaultScope, step.scopes ?? {}, `${label} recall scope`);
  const output = await service.recall({
    query: step.query,
    scopes: toToolScope(scope),
    types: step.types,
    limit: step.limit,
    token_budget: step.tokenBudget
  });

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

async function runBootstrapStep({ service, defaultScope, step, label }) {
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

  const contextText = flattenContextPack(output.context_pack);
  const expect = step.expect;
  assertTextIncludes(contextText, expect.contextIncludes, `${label} context`);
  assertTextExcludes(contextText, expect.contextExcludes, `${label} context`);

  if (expect.traceIdPresent === true) {
    assertNonEmptyString(output.memory_trace_id, `${label} should return a trace id.`);
  }
  await assertTraceExpectations(service, output.memory_trace_id, expect, label);
}

async function runForgetStep({ service, step, label }) {
  const output = await service.forget({
    memory_id: step.memoryId,
    mode: step.mode,
    reason: step.reason
  });

  if (step.expect.status !== undefined) {
    assert(output.status === step.expect.status, `${label} forgot memory status mismatch.`);
  }
}

async function runConflictRememberStep({ service, store, defaultScope, step, label }) {
  const scope = mergeCoreScope(defaultScope, step.scopes ?? step.scope ?? {}, `${label} conflict scope`);
  const remembered = await service.remember({
    source: step.source,
    content: step.content,
    scopes: toToolScope(scope),
    approval_mode: step.approvalMode
  });
  const [candidate] = remembered.candidate_memories;

  assert(candidate, `${label} should create a candidate memory.`);
  if (step.expect.candidateStatus !== undefined) {
    assert(candidate.status === step.expect.candidateStatus, `${label} candidate status mismatch.`);
  }

  const conflicts = await store.listConflicts({ statuses: ["open"] });
  if (step.expect.openConflictCount !== undefined) {
    assert(conflicts.length === step.expect.openConflictCount, `${label} open conflict count mismatch.`);
  }

  const expectsOpenConflicts = step.expect.openConflictCount === undefined || step.expect.openConflictCount > 0;

  if (expectsOpenConflicts && step.expect.conflictType !== undefined) {
    assert(conflicts.some((conflict) => conflict.conflictType === step.expect.conflictType), `${label} conflict type mismatch.`);
  }

  if (expectsOpenConflicts && step.expect.recommendedAction !== undefined) {
    assert(
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
    assert(payload.count === step.expect.vaultConflictsCount, `${label} vault conflict count mismatch.`);
  }
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
      if (plan.expect.openConflictCount === 0) {
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
    status: plan.expect.openConflictCount === 0 && plan.conflict.recommendedAction === "reject"
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

function summarize(caseResults) {
  const summary = {
    totalCases: caseResults.length,
    passed: caseResults.filter((result) => result.ok).length,
    failed: caseResults.filter((result) => !result.ok).length,
    perFamily: {},
    perMetric: {}
  };

  for (const result of caseResults) {
    const family = summary.perFamily[result.family] ?? { passed: 0, total: 0 };
    family.total += 1;
    if (result.ok) family.passed += 1;
    summary.perFamily[result.family] = family;

    for (const metric of result.metrics) {
      const metricSummary = summary.perMetric[metric] ?? { passed: 0, total: 0 };
      metricSummary.total += 1;
      if (result.ok) metricSummary.passed += 1;
      summary.perMetric[metric] = metricSummary;
    }
  }

  return summary;
}

function printSummary(summary) {
  console.log("Aggregate summary:");
  console.log(`Total cases: ${summary.totalCases}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log("Per-family pass counts:");
  printPassCounts(summary.perFamily);
  console.log("Per-metric pass counts:");
  printPassCounts(summary.perMetric);
}

function printPassCounts(counts) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    console.log("- none: 0/0");
    return;
  }
  for (const [name, count] of entries) {
    console.log(`- ${name}: ${count.passed}/${count.total}`);
  }
}

function assertIdsExpectation(actualIds, expectedIds, label) {
  if (expectedIds === undefined) {
    return;
  }
  if (expectedIds.length === 0) {
    assert(actualIds.length === 0, `${label} should be empty.`);
    return;
  }
  assertIdsPresent(actualIds, expectedIds, label);
}

function assertIdsPresent(actualIds, expectedIds, label) {
  for (const expectedId of expectedIds ?? []) {
    assert(actualIds.includes(expectedId), `${label} is missing an expected id.`);
  }
}

function assertIdsAbsent(actualIds, absentIds, label) {
  for (const absentId of absentIds ?? []) {
    assert(!actualIds.includes(absentId), `${label} includes an excluded id.`);
  }
}

function assertIdsAbsentOrContextExcluded(memories, contextBlock, memoryIds, label) {
  for (const memoryId of memoryIds ?? []) {
    const memory = memories.find((item) => item.id === memoryId);
    assert(
      !memory || !contextBlock.includes(memory.canonicalText),
      `${label} ${memoryId} should be absent or excluded from context.`
    );
  }
}

function assertTextIncludes(value, fragments, label) {
  for (const fragment of fragments ?? []) {
    assert(value.includes(fragment), `${label} is missing an expected text fragment.`);
  }
}

function assertTextExcludes(value, fragments, label) {
  for (const fragment of fragments ?? []) {
    assert(!value.includes(fragment), `${label} includes an excluded text fragment.`);
  }
}

function assertAllowed(value, allowed, message) {
  assert(typeof value === "string" && allowed.has(value), message);
}

function assertValidDate(value, message) {
  assert(typeof value === "string" && !Number.isNaN(new Date(value).getTime()), message);
}

function assertNonEmptyString(value, message) {
  assert(typeof value === "string" && value.length > 0, message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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
