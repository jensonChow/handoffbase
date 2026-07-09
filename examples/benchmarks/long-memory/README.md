# Long Memory Benchmark Fixtures

This directory contains synthetic LongMemEval-style benchmark-inspired fixtures
for HandoffBase. They are not official LongMemEval data, adapters, scores, or
leaderboard results.

The fixture set is intended for a future deterministic benchmark runner. It
does not execute by itself, call Qwen, start a cloud service, read local
environment files, or require remote MCP access.

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

## Runner Expectations

A future runner should treat these cases as benchmark-inspired deterministic
assertions over memory ids, lifecycle statuses, context text, trace ids, and
metric keys. The intended default path should remain credential-free,
network-free, and suitable for contributors.

See [`docs/benchmarks.md`](../../../docs/benchmarks.md) and
[`docs/evals.md`](../../../docs/evals.md) for the benchmark strategy and current
local eval posture.
