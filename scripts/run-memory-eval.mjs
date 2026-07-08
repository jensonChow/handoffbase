#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(rootDir, "examples/evals/opportunity-scout-memory-eval.json");
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

if (process.env.HANDOFFBASE_EVAL_SKIP_BUILD !== "1") {
  ensureLocalBuild();
}

const core = await import(pathToFileURL(path.join(rootDir, "packages/memory-core/dist/index.js")).href);
const serviceModule = await import(pathToFileURL(path.join(rootDir, "dist/services/continuity-memory-service.js")).href);

const { InMemoryMemoryStore, MockMemoryProvider } = core;
const { ContinuityMemoryService } = serviceModule;

const fixedNow = new Date(dataset.fixedNow);
const scope = dataset.scope.core;
const toolScopes = dataset.scope.tool;
const project = dataset.scope.project;
const results = [];

const store = new InMemoryMemoryStore({ clock: () => fixedNow });
await seedStore(store, dataset.seedMemories);
const service = new ContinuityMemoryService({
  store,
  provider: new MockMemoryProvider(),
  seedDemoMemories: false
});

const handlers = {
  "preference-recall": runRecallCase,
  "procedure-recall": runRecallCase,
  "failure-recall": runRecallCase,
  "bootstrap-trace": runBootstrapTraceCase,
  "token-budget-ignored": runTokenBudgetCase,
  "remember-candidate": runRememberCandidateCase,
  "controlled-conflict": runControlledConflictCase,
  "forget-invalidation": runForgetInvalidationCase
};

for (const testCase of dataset.cases) {
  const handler = handlers[testCase.id];
  if (!handler) {
    results.push({ id: testCase.id, name: testCase.name, ok: false, error: `No handler for case ${testCase.id}` });
    continue;
  }

  try {
    await handler(testCase);
    results.push({ id: testCase.id, name: testCase.name, ok: true });
  } catch (error) {
    results.push({ id: testCase.id, name: testCase.name, ok: false, error: error.message });
  }
}

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  const suffix = result.ok ? "" : ` - ${result.error}`;
  console.log(`${status} ${result.id} - ${result.name}${suffix}`);
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

if (failed > 0) {
  console.error(`HandoffBase memory eval failed: ${passed}/${results.length} cases passed.`);
  process.exit(1);
}

console.log(`HandoffBase memory eval passed: ${passed}/${results.length} cases.`);

async function seedStore(memoryStore, memories) {
  for (const memory of memories) {
    await memoryStore.addMemory(toCreateMemoryInput(memory), {
      actor: { type: "system", id: "eval_seed" },
      reason: "Seed local memory eval fixture.",
      now: fixedNow
    });
  }
}

async function runRecallCase(testCase) {
  const output = await service.recall({
    query: testCase.input.query,
    scopes: toolScopes,
    types: testCase.input.types,
    limit: testCase.input.limit,
    token_budget: testCase.input.tokenBudget
  });

  for (const memoryId of testCase.expected.memoryIds) {
    assertMemoryPresent(output.memories, memoryId);
  }
  for (const fragment of testCase.expected.textIncludes) {
    assertIncludes(output.context_block, fragment, `${testCase.id} context block should include "${fragment}"`);
  }
  assertNonEmptyString(output.trace_id, `${testCase.id} should return trace_id`);
}

async function runBootstrapTraceCase(testCase) {
  const output = await service.continuityBootstrap({
    host: testCase.input.host,
    agent_profile: scope.agentProfileId,
    user_id: scope.userId,
    project,
    session_id: testCase.input.sessionId,
    task_hint: testCase.input.taskHint,
    token_budget: testCase.input.tokenBudget
  }, evalContext());

  assertNonEmptyString(output.memory_trace_id, "continuity_bootstrap should return memory_trace_id");
  const trace = await service.trace({ trace_id: output.memory_trace_id }, evalContext());
  assert(
    trace.used_memories.length >= testCase.expected.minUsedMemories,
    `bootstrap trace should include at least ${testCase.expected.minUsedMemories} used memories`
  );
}

async function runTokenBudgetCase(testCase) {
  const output = await service.recall({
    query: testCase.input.query,
    scopes: toolScopes,
    limit: testCase.input.limit,
    token_budget: testCase.input.tokenBudget
  });
  const trace = await service.trace({ trace_id: output.trace_id });

  assert(
    trace.ignored_memories.length >= testCase.expected.minIgnoredMemories,
    `token budget case should ignore at least ${testCase.expected.minIgnoredMemories} memories`
  );
  if (testCase.expected.emptyContextBlock) {
    assert(output.context_block.length === 0, "token budget case should produce an empty context block");
  }
}

async function runRememberCandidateCase(testCase) {
  const output = await service.remember({
    source: testCase.input.source,
    content: testCase.input.content,
    scopes: toolScopes,
    approval_mode: testCase.input.approvalMode
  });

  assert(
    output.candidate_memories.length === testCase.expected.candidateCount,
    `remember should create ${testCase.expected.candidateCount} candidate memories`
  );
  const [candidate] = output.candidate_memories;
  assert(candidate.status === testCase.expected.status, `remember candidate status should be ${testCase.expected.status}`);
  assert(candidate.type === testCase.expected.type, `remember candidate type should be ${testCase.expected.type}`);
  assertNonEmptyString(candidate.id, "remember candidate should include persisted memory id");
  const persisted = await store.getMemory(candidate.id);
  assert(Boolean(persisted), "remember candidate should be persisted in the store");
}

async function runControlledConflictCase(testCase) {
  const conflictStore = new InMemoryMemoryStore({ clock: () => fixedNow });
  await conflictStore.addMemory(
    {
      id: testCase.input.existingMemoryId,
      scope,
      type: "user_preference",
      canonicalText: testCase.input.existingText,
      sourceKind: "user_statement",
      status: "active",
      confidence: 0.88,
      importance: 0.8,
      metadata: { evalSeed: true }
    },
    {
      actor: { type: "system", id: "eval_seed" },
      reason: "Seed controlled conflict fixture.",
      now: fixedNow
    }
  );

  const conflictService = new ContinuityMemoryService({
    store: conflictStore,
    provider: createConflictProvider(testCase),
    seedDemoMemories: false
  });

  const remembered = await conflictService.remember({
    source: testCase.input.source,
    content: testCase.input.content,
    scopes: toolScopes,
    approval_mode: testCase.input.approvalMode
  });
  const [candidate] = remembered.candidate_memories;

  assert(candidate, "controlled conflict should create a candidate memory");
  assert(candidate.status === testCase.expected.candidateStatus, `conflict candidate should be ${testCase.expected.candidateStatus}`);

  const conflicts = await conflictStore.listConflicts({ statuses: ["open"] });
  assert(conflicts.length === testCase.expected.openConflictCount, "controlled conflict should create one open conflict");
  assert(conflicts[0].conflictType === testCase.expected.conflictType, `conflict type should be ${testCase.expected.conflictType}`);
  assert(
    conflicts[0].recommendedAction === testCase.expected.recommendedAction,
    `recommended action should be ${testCase.expected.recommendedAction}`
  );

  const resource = await conflictService.readResource({
    name: "vault-conflicts",
    uri: "memory://vault/conflicts",
    variables: {}
  });
  const payload = JSON.parse(resource.text);
  assert(payload.count === testCase.expected.openConflictCount, "vault conflict resource should expose the open conflict");
}

async function runForgetInvalidationCase(testCase) {
  const output = await service.forget({
    memory_id: testCase.input.memoryId,
    mode: testCase.input.mode,
    reason: testCase.input.reason
  });
  assert(output.status === testCase.expected.status, `forgotten memory status should be ${testCase.expected.status}`);

  const recall = await service.recall({
    query: testCase.input.query,
    scopes: {
      ...toolScopes,
      project_id: testCase.input.projectId
    },
    types: ["project_fact", "decision_memory"],
    limit: 8,
    token_budget: 700
  });
  assert(
    !recall.memories.some((memory) => memory.id === testCase.expected.notRecalledMemoryId),
    "invalidated memory should not be recalled"
  );
}

function createConflictProvider(testCase) {
  const mock = new MockMemoryProvider();
  return {
    classifyMemory: (input) => mock.classifyMemory(input),
    buildContextPack: (input) => mock.buildContextPack(input),
    reflectRun: (input) => mock.reflectRun(input),
    explainMemoryUsage: (input) => mock.explainMemoryUsage(input),
    async extractMemories(input) {
      return [
        {
          type: "user_preference",
          canonicalText: input.content,
          scope,
          validity: { status: "current" },
          confidence: 0.92,
          importance: 0.86,
          status: testCase.input.approvalMode,
          sourceKind: "user_correction",
          sourceTrust: "user_direct",
          rawSource: input.content,
          evidence: [input.content],
          tags: ["eval"],
          safety: {
            decision: "allow",
            sensitive: false,
            untrustedExternal: false,
            reasons: [],
            redactions: []
          },
          rationale: "Deterministic eval provider generated a preference correction."
        }
      ];
    },
    async detectConflicts() {
      return {
        conflicts: [
          {
            existingMemoryId: testCase.input.existingMemoryId,
            conflictType: testCase.expected.conflictType,
            severity: "high",
            reason: "The candidate reverses the previous ranking preference.",
            suggestedAction: testCase.expected.recommendedAction,
            confidence: 0.94
          }
        ],
        recommendedAction: testCase.expected.recommendedAction,
        reason: "User-visible preference conflict requires review."
      };
    }
  };
}

function toCreateMemoryInput(memory) {
  return {
    id: memory.id,
    scope: {
      ...scope,
      ...(memory.scope ?? {})
    },
    type: memory.type,
    canonicalText: memory.canonicalText,
    rawSource: memory.rawSource,
    sourceKind: memory.sourceKind,
    status: memory.status,
    confidence: memory.confidence,
    importance: memory.importance,
    validFrom: memory.validFrom,
    validUntil: memory.validUntil,
    metadata: memory.metadata ?? {}
  };
}

function evalContext() {
  return {
    caller: {
      tenantId: scope.tenantId,
      userId: scope.userId,
      actorType: "mcp_host",
      actorId: "memory-eval",
      authMode: "api_key"
    }
  };
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

function assertMemoryPresent(memories, memoryId) {
  assert(memories.some((memory) => memory.id === memoryId), `expected memory ${memoryId} to be recalled`);
}

function assertIncludes(value, fragment, message) {
  assert(value.includes(fragment), message);
}

function assertNonEmptyString(value, message) {
  assert(typeof value === "string" && value.length > 0, message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
