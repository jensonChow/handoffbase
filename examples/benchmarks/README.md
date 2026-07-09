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

When no fixture files are present, the command exits successfully and prints:

```text
No benchmark fixture files found.
```

See [schema-notes.md](schema-notes.md) for the fixture shape. Current public result status is tracked in [../../docs/benchmark-results.md](../../docs/benchmark-results.md).
