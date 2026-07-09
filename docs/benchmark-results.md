# Benchmark Results

HandoffBase now has a deterministic, benchmark-inspired local memory benchmark
subset. It is public-safe, credential-free, network-free, and runs against
synthetic fixtures through local builds of `@handoffbase/memory-core` and
`ContinuityMemoryService`.

```bash
npm run bench:memory
```

Last local run recorded here: 2026-07-09.

## Result Summary

`npm run bench:memory` passed all deterministic fixture cases:

- Total cases: 17.
- Passed: 17.
- Failed: 0.

Per-family pass counts:

| Family | Passed | Total |
| --- | ---: | ---: |
| `conflicts` | 5 | 5 |
| `cross-host-handoff` | 6 | 6 |
| `long-memory` | 6 | 6 |

Per-metric pass counts:

| Metric | Passed | Total |
| --- | ---: | ---: |
| `answer_correct` | 3 | 3 |
| `conflict_action_correct` | 5 | 5 |
| `conflict_created` | 3 | 3 |
| `evidence_precision_at_k` | 5 | 5 |
| `evidence_recall_at_k` | 2 | 2 |
| `excluded_memory_correct` | 1 | 1 |
| `forget_correct` | 2 | 2 |
| `scope_isolation_correct` | 7 | 7 |
| `token_budget_respected` | 1 | 1 |
| `trace_id_present` | 8 | 8 |
| `update_correct` | 2 | 2 |
| `used_memory_correct` | 6 | 6 |

## Fixture Families

- `long-memory`: synthetic LongMemEval-style durable recall, temporal update,
  forget, token-budget, and out-of-scope evidence cases.
- `conflicts`: synthetic MemConflict-style contradiction, duplicate, `keep_both`,
  reject, and ask-user governance cases.
- `cross-host-handoff`: HandoffBase-specific host-to-host bootstrap, recall,
  scope-isolation, trace, forget, and deployment-gotcha handoff cases.

## Non-Claims

These are deterministic benchmark-inspired local results. They are not official
LongMemEval, MemConflict, Mem2ActBench, LongMemEval-V2, MemEvoBench, LifeBench,
or other leaderboard scores.

The fixtures contain synthetic public-safe data. The command does not read
`.env.*`, call Qwen or DashScope, call a remote MCP endpoint, restart ECS, use a
database URL, or require paid cloud resources.
