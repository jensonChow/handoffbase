# Memory Benchmark Fixtures

This directory is reserved for deterministic, benchmark-inspired HandoffBase memory fixtures.

The runner is local by default:

- It does not report an official benchmark score.
- It does not call Qwen, DashScope, remote MCP endpoints, Alibaba Cloud, or any network resource.
- It does not read `.env.*` files.
- It uses synthetic JSON fixtures and local builds of `@handoffbase/memory-core` plus `ContinuityMemoryService`.

Run it with:

```bash
npm run bench:memory
```

The runner reads fixture files at:

```text
examples/benchmarks/*/cases.json
```

Supported fixture families:

- `long-memory`: benchmark-inspired long-horizon recall, update, and stale-memory cases.
- `conflicts`: contradiction, duplicate, supersede, merge, and review-governance cases.
- `cross-host-handoff`: host/session handoff cases that exercise `continuity_bootstrap`, scoped memory, and trace ids.

Each case declares the baseline executors that actually run and a
`baselineExpectations` contract. The implemented executors are:

- `no-memory`: no persistent memory, context pack, trace, or governance
  capability.
- `handoffbase-memory-context`: the current deterministic HandoffBase path
  through `InMemoryMemoryStore`, `MockMemoryProvider`, and
  `ContinuityMemoryService`.

All 17 cases execute both implemented baselines. For conflict cases the
no-memory executor produces no candidate or governance state and records an
expected miss; it does not fabricate a conflict-resolution result.
`raw-history` and `naive-vector-rag` remain unimplemented extension points and
have no reported results.

For machine-readable output, run the script directly so npm build banners do
not precede the JSON document:

```bash
node scripts/run-memory-benchmarks.mjs --json
```

The JSON schema is deterministic: it omits timestamps, durations, generated
trace ids, and absolute paths. Missing fixtures are a configuration failure;
the regression harness cannot pass an empty suite.

See [schema-notes.md](schema-notes.md) for the fixture shape. Current public result status is tracked in [../../docs/benchmark-results.md](../../docs/benchmark-results.md).
