# Long Memory Benchmark Fixtures

This directory contains synthetic LongMemEval-style benchmark-inspired fixtures
for HandoffBase. They are not official LongMemEval data, adapters, scores, or
leaderboard results.

The fixture set is executed by `npm run bench:memory` across the `no-memory`
and `handoffbase-memory-context` registry entries. The runner does not call
Qwen, start a cloud service, read local environment files, or require remote
MCP access.

## Files

- `cases.json`: synthetic public-safe cases for long-term memory,
  multi-session recall, temporal updates, forgetting, token-budget behavior, and
  scope isolation.

## Fixture Boundary

All records are synthetic and safe for a public repository:

- No real personal data.
- No real credentials or private identifiers.
- No real endpoint secrets.
- No real public IP addresses.
- No private project or user details.
- No vendored external benchmark dataset.

## Case Coverage

| Case | Capability |
| --- | --- |
| `preference-survives-later-session` | Recalls an active user preference in a later session. |
| `procedure-guides-later-task` | Carries a verification procedure into a later bootstrap context. |
| `project-fact-update-supersedes-old` | Uses a newer active project fact and excludes a superseded fact. |
| `forget-invalidates-stale-memory` | Confirms a memory is recalled, invalidated, then absent. |
| `token-budget-ignores-lower-priority-memory` | Keeps high-importance evidence while excluding lower-priority memories under a tight budget. |
| `out-of-scope-evidence-missing` | Excludes memory from another project scope. |

## Runner Contract

The runner treats these cases as benchmark-inspired deterministic assertions
over memory ids, lifecycle statuses, context text, trace ids, and metric tags.
Each case explicitly expects the no-memory executor to miss the full
memory-dependent oracle and the HandoffBase executor to pass it. Expected
no-memory misses lower its comparative score without failing the harness.

See [`docs/benchmarks.md`](../../../docs/benchmarks.md) and
[`docs/evals.md`](../../../docs/evals.md) for the benchmark strategy and current
local eval posture.
