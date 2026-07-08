#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  InMemoryMemoryStore,
  MockMemoryProvider
} from "@handoffbase/memory-core";

const datasetPath = new URL("../examples/evals/opportunity-scout-memory-eval.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

const store = new InMemoryMemoryStore({
  clock: () => new Date("2026-07-08T00:00:00.000Z")
});
const provider = new MockMemoryProvider();
const scope = dataset.scope;

const results = [];

await seedMemories();

await record("preference-recall", async () => {
  const recall = await store.recallMemories({
    scope,
    query: "rank AI hackathons by credentials founder network startup resources",
    types: ["user_preference"],
    limit: 3
  });
  assertIncludes(recall.memories, "credentials");
  assertIncludes(recall.memories, "founder network");
});

await record("procedure-recall", async () => {
  const recall = await store.recallMemories({
    scope,
    query: "verify deadline timezone eligibility official rules",
    types: ["procedure"],
    limit: 3
  });
  assertIncludes(recall.memories, "official rules");
});

await record("failure-recall", async () => {
  const recall = await store.recallMemories({
    scope,
    query: "avoid excluded region events",
    types: ["failure_memory"],
    limit: 3
  });
  assertIncludes(recall.memories, "excludes the user's region");
});

let traceId = "";
await record("trace-created", async () => {
  const recall = await store.recallMemories({
    scope,
    query: "rank Qwen TRAE CockroachDB opportunities",
    limit: 5
  });
  traceId = recall.trace.id;
  assert(typeof traceId === "string" && traceId.length > 0, "trace id should be present");
  assert(recall.trace.selectedMemoryIds.length > 0, "trace should include selected memories");
});

await record("token-budget-ignore", async () => {
  const memories = await store.listMemories({ scope, statuses: ["active"] });
  const context = await provider.buildContextPack({
    query: "bootstrap with tight token budget",
    scopes: scope,
    memories: memories.map(toStoredMemory),
    tokenBudget: 8
  });
  assert(context.ignoredMemories.length > 0, "tight token budget should ignore at least one memory");
});

await record("remember-candidate", async () => {
  const candidates = await provider.extractMemories({
    content:
      "I prefer AI events that improve founder network, credentials, and useful startup resources over prize money.",
    scopes: scope,
    sourceKind: "user_direct",
    sourceTrust: "user_direct",
    approvalMode: "pending",
    now: "2026-07-08T00:00:00.000Z"
  });
  assert(candidates.length > 0, "expected at least one memory candidate");
  assert(candidates[0].status === "pending", "candidate should be pending");
});

await record("conflict-record", async () => {
  const candidate = await store.addMemory({
    id: "eval_candidate_network_preference",
    scope,
    type: "user_preference",
    canonicalText:
      "User prioritizes founder network and credentials above prize money for AI hackathon selection.",
    sourceKind: "user_correction",
    status: "pending",
    confidence: 0.86,
    importance: 0.88,
    metadata: {}
  });
  const conflict = await store.addConflict({
    id: "eval_conflict_prize_money",
    tenantId: scope.tenantId,
    candidateMemoryId: candidate.memory.id,
    existingMemoryId: "eval_old_prize_memory",
    conflictType: "contradiction",
    severity: "medium",
    recommendedAction: "supersede_existing",
    status: "open",
    reason: "New confirmed preference conflicts with older inferred prize-money note.",
    confidence: 0.82,
    metadata: {}
  });
  assert(conflict.status === "open", "conflict should be open");
  assert(conflict.recommendedAction === "supersede_existing", "conflict should recommend superseding existing memory");
});

await record("forget-invalidation", async () => {
  await store.updateMemory(
    "eval_old_prize_memory",
    {
      status: "invalidated",
      validUntil: "2026-07-08T00:00:00.000Z"
    },
    {
      actor: { type: "user", id: "eval" },
      reason: "Invalidated by eval forget case."
    }
  );
  const recall = await store.recallMemories({
    scope,
    query: "prize money",
    types: ["decision_memory"],
    limit: 5
  });
  assert(
    !recall.memories.some((memory) => memory.id === "eval_old_prize_memory"),
    "invalidated memory should not be selected by recall"
  );
});

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.id}${result.message ? ` - ${result.message}` : ""}`);
}

console.log(`HandoffBase memory eval: ${passed}/${results.length} passed.`);

if (failed > 0) {
  process.exit(1);
}

async function seedMemories() {
  await store.addMemory({
    id: "eval_user_pref",
    scope,
    type: "user_preference",
    canonicalText:
      "User prioritizes AI hackathons that improve credentials, founder network, and useful startup resources over prize money alone.",
    sourceKind: "user_correction",
    status: "active",
    confidence: 0.96,
    importance: 0.9,
    metadata: {}
  });
  await store.addMemory({
    id: "eval_procedure",
    scope,
    type: "procedure",
    canonicalText:
      "Before recommending a hackathon, verify registration deadline, timezone, eligibility region, and official rules.",
    sourceKind: "run_reflection",
    status: "active",
    confidence: 0.93,
    importance: 0.88,
    metadata: {}
  });
  await store.addMemory({
    id: "eval_failure",
    scope,
    type: "failure_memory",
    canonicalText:
      "Do not recommend competitions when official eligibility excludes the user's region; verify rules before ranking.",
    sourceKind: "run_reflection",
    status: "active",
    confidence: 0.86,
    importance: 0.82,
    metadata: {}
  });
  await store.addMemory({
    id: "eval_old_prize_memory",
    scope,
    type: "decision_memory",
    canonicalText: "User appears to prioritize hackathon prize money when choosing opportunities.",
    sourceKind: "run_reflection",
    status: "active",
    confidence: 0.55,
    importance: 0.3,
    metadata: {}
  });
}

async function record(id, run) {
  try {
    await run();
    results.push({ id, ok: true });
  } catch (error) {
    results.push({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(memories, text) {
  assert(
    memories.some((memory) => memory.canonicalText.toLowerCase().includes(text.toLowerCase())),
    `expected recalled memories to include "${text}"`
  );
}

function toStoredMemory(memory) {
  return {
    id: memory.id,
    type: memory.type,
    canonicalText: memory.canonicalText,
    scope: memory.scope,
    validity: {
      status: memory.validUntil && memory.validUntil.getTime() <= Date.now() ? "expired" : "current",
      validFrom: memory.validFrom?.toISOString(),
      validUntil: memory.validUntil?.toISOString()
    },
    confidence: memory.confidence,
    importance: memory.importance,
    status: memory.status,
    metadata: memory.metadata
  };
}
