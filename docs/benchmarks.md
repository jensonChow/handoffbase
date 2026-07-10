# Benchmark Strategy

HandoffBase should prove memory effect, not generic LLM ability. The benchmark
strategy is to isolate what changes when an agent receives governed,
traceable, scoped memory from HandoffBase instead of no memory, raw history, or
naive recall.

The first benchmark-aware, benchmark-inspired subset is implemented as a local
comparative regression harness. It extends the deterministic eval posture in
[`docs/evals.md`](evals.md), keeps the default contributor path credential-free,
and is not an official leaderboard run.

## Goal

The benchmark plan should demonstrate HandoffBase as a memory handoff layer:

- Long-term memory that survives across sessions.
- Cross-session continuity that helps a new host answer or act with prior
  context.
- Conflict governance for contradictions, stale facts, duplicates, and scope
  overlap.
- Forgetting and update correctness when older memories are invalidated,
  superseded, merged, or rejected.
- Traceability through ids and inspectable records showing which memories were
  used, ignored, or excluded.
- Cross-host handoff through MCP-native tools and resources across hosts,
  projects, and sessions.

The claim to test is not "the underlying model is smart." The claim is:
given the same task, same model mode, and same fixture, HandoffBase memory
context improves the memory-dependent outcome while preserving governance,
scope isolation, and traceability.

## Implemented First Stage

### LongMemEval-style subset

Purpose: test durable memory and answer quality across long or separated
interactions.

The current fixtures cover:

- Long-term user preference and project fact recall.
- Multi-session reasoning where the answer requires combining memories from
  different sessions.
- Temporal updates where a newer correction supersedes an older fact.
- Abstention when required evidence is missing, excluded, stale, or out of
  scope.

Implementation shape:

- Synthetic fixtures under `examples/benchmarks/long-memory/`.
- Deterministic mock mode where the expected memory ids and answer fragments are
  known.
- Qwen is not called by this runner. A future Qwen-backed manual mode must be
  reported separately as manual proof, not as an official LongMemEval score.

### MemConflict-style governance eval

Purpose: test whether HandoffBase handles conflicting memory as governed state,
not silent overwrite.

The current fixtures cover:

- Conflict detection when a candidate contradicts an active memory.
- Pending review records for `ask_user`, `merge`, and `supersede`
  recommendations.
- Authorized terminal resolution for `supersede_existing`, `merge`, and
  `keep_both`, including linked-memory lifecycle and terminal conflict state.
- Distractor memories that should not be treated as conflicts.
- Conflict-vault resource inspection; conflict-trace coverage remains later
  work.

The score should separate answer correctness from governance correctness. A
correct answer without the expected conflict record is still a benchmark
failure for HandoffBase.

### HandoffBase cross-host handoff eval

Purpose: test the product-specific claim that memory can move across MCP hosts
and sessions without copying raw chat history.

The current fixtures cover:

- Host A writes or reflects a durable memory.
- Host B bootstraps a later session and receives the expected context pack.
- Project-scoped memory appears only for the matching project.
- Agent-profile procedure memory appears for the matching agent profile.
- Trace ids are present and resolve to used, ignored, and excluded memories.
- Sensitive or out-of-scope memories remain excluded.

This is the benchmark that should make HandoffBase distinct from a generic RAG
demo: it exercises MCP-native handoff, scoped governance, and traceable context
packing.

The separate `npm run e2e:cross-host` gate exercises the same product claim
over a real loopback Express Streamable HTTP server and official MCP SDK
clients. It asserts API-key auth, Host A writes, Host B recall/bootstrap, Host C
project isolation, trace linkage, and forgetting without calling service/store
methods directly.

## LongMemEval Cleaned-Format Adapter

The repository now includes a reproducible adapter for the official cleaned
LongMemEval JSON shape under [`benchmarks/longmemeval/`](../benchmarks/longmemeval/README.md).
It accepts an explicitly supplied local dataset and emits evaluator-compatible
`hypotheses.jsonl` plus internal retrieval evidence and run metadata.

The safe CI-sized gate is:

```bash
npm run bench:longmemeval:tiny
```

It runs a synthetic three-question fixture through `no-memory`, `raw-history`,
and `handoffbase`, disables network access, uses a deterministic reader and mock
memory provider, removes temporary outputs, and asserts that no official QA
score is present.

The full adapter command is `npm run bench:longmemeval -- ...`. Qwen reader and
memory-provider modes are explicit opt-ins. The adapter never downloads a
dataset, loads `.env.*`, invokes the official paid QA evaluator, or calls a paid
judge by itself. No official dataset was downloaded for this integration, no
full credentialed run has been completed, and no official LongMemEval score
exists.

## Later-stage Benchmark Plan

After the current deterministic proof is stable, add broader benchmark-inspired
coverage:

- Mem2ActBench-style action/tool-use memory: measure whether remembered
  preferences, procedures, and prior state change the selected tool and tool
  arguments, not only the final natural-language answer.
- LongMemEval-V2-style workflow/environment/project memory: measure workflow
  knowledge, project state, environment gotchas, and recurring failure modes
  collected from prior agent trajectories.
- MemEvoBench-style memory evolution and trust tests: inject noisy tool output,
  biased feedback, misleading external content, and repeated corrections to
  verify that memory does not drift into unsafe or false behavior.
- Trust-oriented negative tests: verify that sensitive values, untrusted
  webpages, out-of-scope memories, invalidated memories, and stale conflicts are
  rejected or excluded.

These later stages can use larger fixtures, benchmark adapters, and optional
model-backed judging, but they should remain separate from the default CI path
unless they are deterministic and cost-free.

## Baseline Registry

The runner executes only registered baselines; fixture names are validated and
unknown entries fail instead of being silently skipped.

| Baseline | Status | What it proves |
| --- | --- | --- |
| `no-memory` | Implemented | Runs the common case oracle with no persistence, recalled context, trace, forget state, or conflict-governance capability. |
| `handoffbase-memory-context` | Implemented | Runs local HandoffBase with `InMemoryMemoryStore`, the deterministic fixture provider, `ContinuityMemoryService`, fixed clocks, and seeded memories. |
| `raw-history` | Extension point only | Would test transcript stuffing, but no executor ran and no result is reported. |
| `naive-vector-rag` | Extension point only | Would test ungoverned retrieval, but no executor ran and no result is reported. |

All 17 cases execute both implemented baselines. In conflict cases the
no-memory executor returns no candidate or governance state and therefore
misses the common behavior oracle as expected; it does not fabricate a
conflict-resolution result. The HandoffBase delta uses the exact 17 shared
cases and states its metric-tagged denominator explicitly.

## Required Metrics

Use machine-checkable metric keys so results can be compared across local CI,
manual Qwen proof, and future benchmark adapters.

| Metric | Meaning |
| --- | --- |
| `answer_correct` | Final answer matches expected memory-dependent facts or abstains when required. |
| `action_correct` | Tool choice, tool arguments, or state transition match expected behavior. |
| `evidence_recall_at_k` | Required supporting memories appear in the top-k recalled evidence. |
| `evidence_precision_at_k` | Top-k evidence avoids irrelevant, stale, or out-of-scope memories. |
| `trace_id_present` | Recall, bootstrap, or action result includes an inspectable memory trace id. |
| `used_memory_correct` | Trace used-memory ids match expected supporting evidence. |
| `ignored_memory_correct` | Trace ignored-memory ids match token-budget or ranking expectations. |
| `excluded_memory_correct` | Trace excluded-memory ids match scope, status, sensitivity, or trust rules. |
| `conflict_created` | Conflict cases create the expected conflict record. |
| `conflict_action_correct` | Conflict recommendation is `ask_user`, `supersede`, `merge`, `keep_both`, or `reject` as expected. |
| `forget_correct` | Forgotten, expired, archived, deleted, or invalidated memories stop influencing recall. |
| `update_correct` | Recall honors the fixture's active and superseded memory state. |
| `scope_isolation_correct` | Tenant, user, project, host, and agent-profile boundaries are preserved. |
| `token_budget_respected` | Context pack stays within the requested token budget and records ignored memories. |

Result summaries include aggregate, per-family, and per-metric-tagged case
counts for each baseline. The current schema retains the original case-level
scoring rule: a case's observed pass is counted under every metric tag attached
to that case. These are not independently adjudicated sub-scores. Do not
collapse governance failures into a generic answer-only claim.

## Current Deterministic Subset

The first deterministic benchmark-inspired subset now exists and runs with:

```bash
npm run bench:memory
```

It uses `scripts/run-memory-benchmarks.mjs` and synthetic fixture families under
`examples/benchmarks/`:

- `long-memory`: 6 cases for durable recall, temporal update, forget,
  token-budget behavior, and out-of-scope evidence.
- `conflicts`: 5 cases for contradiction, duplicate/merge, `keep_both`, reject,
  and `ask_user` governance paths.
- `cross-host-handoff`: 6 cases for host-to-host bootstrap, recall,
  agent-profile/project scope isolation, trace ids, forget, and deployment
  gotcha handoff.

The explicit registry executes `no-memory` and
`handoffbase-memory-context`. The HandoffBase executor asserts deterministic
local behavior against `ContinuityMemoryService`, `InMemoryMemoryStore`, and
`MockMemoryProvider`; the no-memory executor produces no durable state,
context, trace, forget state, or governance output. The runner supports either
the native `op`/`expect` shape or the public
`operation`/`input`/`expected` shape. It passes a synthetic API-key caller
context for bootstrap cases so tenant/user scope matches the fixture without
using real credentials.

Each fixture declares `baselineExpectations`. Observed behavior feeds the
comparative score; expectation conformance, fixture validity, and executor
health control the process exit code. An expected no-memory miss therefore
lowers that baseline's score without making CI fail.

Recorded local result summary lives in
[`docs/benchmark-results.md`](benchmark-results.md). These results are
benchmark-inspired local regression results, not official benchmark scores.

## Runner Architecture

The benchmark runner preserves the current safe local eval pattern:

- Default mode is deterministic, credential-free, network-free, and suitable for
  CI and contributors.
- Default mode uses synthetic benchmark fixtures and local services; it must not
  read `.env.*`, call Qwen, call a remote MCP endpoint, or require cloud
  resources.
- No Qwen-backed mode exists in this runner. Any future manual mode must remain
  separate and clearly labeled.
- Fixtures live under `examples/benchmarks/`.
- The runner is `scripts/run-memory-benchmarks.mjs`.
- The npm script is `bench:memory`.
- Human output reports every executed baseline, expectation conformance,
  per-baseline family and metric-tagged totals, and the paired HandoffBase
  delta over no-memory.
- `node scripts/run-memory-benchmarks.mjs --json` emits deterministic schema
  version `1` without timestamps, durations, absolute paths, or generated ids.
- Missing fixtures are a configuration error; an empty regression suite cannot
  pass.

Current directory layout:

```text
examples/benchmarks/
  long-memory/
    cases.json
  conflicts/
    cases.json
  cross-host-handoff/
    cases.json
scripts/run-memory-benchmarks.mjs
```

## Claim Boundaries

Until a full official dataset run and official evaluator run exist, use these
boundaries:

- Say "benchmark-aware" or "benchmark-inspired deterministic subset."
- Do not claim an official LongMemEval, MemConflict, Mem2ActBench,
  LongMemEval-V2, MemEvoBench, or other leaderboard score.
- Do not claim production durability while the live proof remains
  `storeMode=in-memory`.
- Do not claim superiority over all memory platforms.
- Do not imply that benchmark fixtures contain real user data or vendored
  external benchmark datasets.
- Keep the local 17/17 versus 0/17 comparison separate from the LongMemEval
  adapter and from any future official QA score.

Acceptable public phrasing:

> HandoffBase includes deterministic, benchmark-inspired memory evals that test
> recall, updates, conflicts, forgetting, traceability, token budgets, and
> cross-host MCP handoff.

## Fixture And Executor Contract

Each case uses a common behavior oracle plus explicit executed baselines and
expected score outcomes:

```json
{
  "id": "cross-host-procedure-handoff",
  "seedMemories": [],
  "steps": [],
  "baselines": ["no-memory", "handoffbase-memory-context"],
  "baselineExpectations": {
    "no-memory": { "pass": false },
    "handoffbase-memory-context": { "pass": true }
  },
  "metrics": ["answer_correct", "trace_id_present"]
}
```

The runner must:

- Use deterministic assertions against memory ids, statuses, trace ids, context
  blocks, conflict records, and final answer/action fields.
- Require no Qwen key, HandoffBase token, remote endpoint, database, ECS
  restart, or paid cloud dependency.
- Reuse `ContinuityMemoryService`, `InMemoryMemoryStore`, and
  `MockMemoryProvider` for the HandoffBase executor.
- Keep all fixture data synthetic and public-safe.
- Validate that baseline ids are unique, registered, and paired exactly with
  boolean expectations. HandoffBase cannot be declared an expected failure.
- Separate an observed benchmark miss from a fixture error, executor error, or
  expectation mismatch.
- Treat missing traces, wrong conflict state, stale-memory reuse, or scope leaks
  as failures even when the final answer text looks plausible.

## References

- [LongMemEval](https://arxiv.org/abs/2410.10813)
- [MemConflict](https://arxiv.org/abs/2605.20926)
- [Mem2ActBench](https://arxiv.org/abs/2601.19935)
- [LongMemEval-V2](https://arxiv.org/abs/2605.12493)
- [MemEvoBench](https://arxiv.org/abs/2604.15774)
