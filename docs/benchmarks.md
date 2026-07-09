# Benchmark Strategy

HandoffBase should prove memory effect, not generic LLM ability. The benchmark
strategy is to isolate what changes when an agent receives governed,
traceable, scoped memory from HandoffBase instead of no memory, raw history, or
naive recall.

This document is a plan. The first implementation should be a
benchmark-aware, benchmark-inspired subset, not an official leaderboard run.
It should extend the current deterministic eval posture in
[`docs/evals.md`](evals.md) and keep the default contributor path
credential-free.

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

## First-stage Benchmark Plan

### LongMemEval-style subset

Purpose: test durable memory and answer quality across long or separated
interactions.

Include cases for:

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
- Optional Qwen-backed manual mode that uses the same fixtures but reports as
  manual proof, not official LongMemEval score.

### MemConflict-style governance eval

Purpose: test whether HandoffBase handles conflicting memory as governed state,
not silent overwrite.

Include cases for:

- Conflict detection when a candidate contradicts an active memory.
- Pending review records for `ask_user`, `merge`, and `supersede`
  recommendations.
- Correct resolution behavior for `supersede`, `merge`, `keep_both`, and
  `reject`.
- Distractor memories that should not be treated as conflicts.
- Trace and resource inspection through pending/conflict vault surfaces.

The score should separate answer correctness from governance correctness. A
correct answer without the expected conflict record is still a benchmark
failure for HandoffBase.

### HandoffBase cross-host handoff eval

Purpose: test the product-specific claim that memory can move across MCP hosts
and sessions without copying raw chat history.

Include cases for:

- Host A writes or reflects a durable memory.
- Host B bootstraps a later session and receives the expected context pack.
- Project-scoped memory appears only for the matching project.
- Agent-profile procedure memory appears for the matching agent profile.
- Trace ids are present and resolve to used, ignored, and excluded memories.
- Sensitive or out-of-scope memories remain excluded.

This is the benchmark that should make HandoffBase distinct from a generic RAG
demo: it exercises MCP-native handoff, scoped governance, and traceable context
packing.

## Later-stage Benchmark Plan

After the first deterministic subset is stable, add broader benchmark-inspired
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

## Required Baselines

Every benchmark case should run comparable scenarios across these baselines:

| Baseline | What it proves |
| --- | --- |
| `no-memory` | The task is genuinely memory-dependent and fails or abstains without prior state. |
| `raw-history` | Stuffing prior transcript into context is not the same as governed, scoped memory. |
| `naive-recall` or `naive-vector-rag` | Simple retrieval can find text but may miss update, conflict, trace, or scope rules. |
| `handoffbase-memory-context` | HandoffBase supplies selected memory context plus trace and governance metadata. |

The first deterministic runner can implement `no-memory` and
`handoffbase-memory-context` first, then add `raw-history` and
`naive-vector-rag` once fixture adapters exist.

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
| `conflict_action_correct` | Conflict recommendation or resolution is `ask_user`, `supersede`, `merge`, `keep_both`, or `reject` as expected. |
| `forget_correct` | Forgotten, expired, archived, deleted, or invalidated memories stop influencing recall. |
| `update_correct` | Newer corrections, merges, and supersessions produce the expected active memory state. |
| `scope_isolation_correct` | Tenant, user, project, host, and agent-profile boundaries are preserved. |
| `token_budget_respected` | Context pack stays within the requested token budget and records ignored memories. |

Result summaries should include both aggregate pass rate and per-metric counts.
Do not collapse governance failures into a single answer score.

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

The runner currently asserts deterministic local behavior against
`ContinuityMemoryService`, `InMemoryMemoryStore`, and `MockMemoryProvider`. It
supports fixture branches that use either the runner-native `op`/`expect` shape
or the public fixture `operation`/`input`/`expected` shape. It passes a
synthetic API-key caller context for bootstrap cases so tenant/user scope
matches the seeded fixture data without using real credentials.

Recorded local result summary lives in
[`docs/benchmark-results.md`](benchmark-results.md). These results are
benchmark-inspired local regression results, not official benchmark scores.

## Runner Architecture

The benchmark runner should preserve the current safe local eval pattern:

- Default mode is deterministic, credential-free, network-free, and suitable for
  CI and contributors.
- Default mode uses synthetic benchmark fixtures and local services; it must not
  read `.env.*`, call Qwen, call a remote MCP endpoint, or require cloud
  resources.
- Optional Qwen-backed manual proof mode may run the same fixture families with
  Qwen reasoning, but output must be labeled as manual proof.
- Fixtures live under `examples/benchmarks/`.
- The runner is `scripts/run-memory-benchmarks.mjs`.
- The npm script is `bench:memory`.
- Output is compact pass/fail lines plus aggregate, per-family, and per-metric
  pass counts suitable for safe docs summaries after review.

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

Until full external benchmark adapters exist, use these boundaries:

- Say "benchmark-aware" or "benchmark-inspired deterministic subset."
- Do not claim an official LongMemEval, MemConflict, Mem2ActBench,
  LongMemEval-V2, MemEvoBench, or other leaderboard score.
- Do not claim production durability while the live proof remains
  `storeMode=in-memory`.
- Do not claim superiority over all memory platforms.
- Do not imply that benchmark fixtures contain real user data or vendored
  external benchmark datasets.
- Do not use benchmark claims in README, Devpost, or demo narration unless the
  deterministic subset exists and the exact validation output is available.

Acceptable public phrasing:

> HandoffBase includes deterministic, benchmark-inspired memory evals that test
> recall, updates, conflicts, forgetting, traceability, token budgets, and
> cross-host MCP handoff.

## Recommended First Implementation

Start with a small JSON fixture schema:

```json
{
  "id": "cross-host-procedure-handoff",
  "family": "cross-host-handoff",
  "seedMemories": [],
  "steps": [],
  "baselines": ["no-memory", "handoffbase-memory-context"],
  "expected": {
    "metrics": {
      "answer_correct": true,
      "trace_id_present": true,
      "scope_isolation_correct": true
    }
  }
}
```

The first implementation should:

- Use deterministic assertions against memory ids, statuses, trace ids, context
  blocks, conflict records, and final answer/action fields.
- Require no Qwen key, HandoffBase token, remote endpoint, database, ECS
  restart, or paid cloud dependency.
- Reuse `ContinuityMemoryService`, `InMemoryMemoryStore`, and
  `MockMemoryProvider` before adding adapters.
- Keep all fixture data synthetic and public-safe.
- Print a compact result summary plus a safe Markdown table.
- Treat missing traces, wrong conflict state, stale-memory reuse, or scope leaks
  as failures even when the final answer text looks plausible.

## References

- [LongMemEval](https://arxiv.org/abs/2410.10813)
- [MemConflict](https://arxiv.org/abs/2605.20926)
- [Mem2ActBench](https://arxiv.org/abs/2601.19935)
- [LongMemEval-V2](https://arxiv.org/abs/2605.12493)
- [MemEvoBench](https://arxiv.org/abs/2604.15774)
