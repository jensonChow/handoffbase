# Conflict Governance Benchmark Fixtures

These fixtures define a small MemConflict-style governance benchmark-inspired
set for HandoffBase. They are not official MemConflict data, do not vendor the
MemConflict benchmark, and must not be reported as an official benchmark score.

The fixture in [`cases.json`](cases.json) is synthetic and public-safe. It tests
whether HandoffBase treats memory disagreements as governed review state instead
of silently overwriting active memory. The cases cover pending review,
contradiction handling, duplicate merge recommendations, project-scope overlap,
rejecting placeholder credential-shaped content, stale-fact review, and
`memory://vault/conflicts` expectations.

Expected conflict types, severities, recommended actions, and statuses use the
canonical enums from
[`packages/memory-core/src/types.ts`](../../../packages/memory-core/src/types.ts).
The action set intentionally includes `keep_both` for project-scoped overlap
cases, because keeping both memories can be correct when scopes differ.

These fixtures have no Qwen, DashScope, remote MCP endpoint, database, ECS, or
cloud dependency. They are docs/fixtures only. A benchmark runner is still
required to execute the cases and score the expected metrics described in
[`docs/benchmarks.md`](../../../docs/benchmarks.md).
