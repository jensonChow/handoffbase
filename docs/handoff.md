# Current Handoff

Updated: 2026-07-09T13:10:00Z

## Completed This Session

- Created `codex/benchmark-runner` from the latest `origin/main` after
  `git fetch --all --prune`.
- Confirmed `origin/main` contains:
  - `docs/effect.md`
  - `docs/benchmarks.md`
  - `docs/product-completeness.md`
  - `docs/product-workflows.md`
- Added `scripts/run-memory-benchmarks.mjs`, the first deterministic memory
  benchmark runner.
- Added `npm run bench:memory`.
- Added benchmark fixture docs:
  - `examples/benchmarks/README.md`
  - `examples/benchmarks/schema-notes.md`
- Added placeholder result status in `docs/benchmark-results.md`.
- Updated `memory/operations.md` with the new benchmark command and validation
  expectation.
- Preserved the existing MCP surface, runtime store selection, Qwen provider
  wiring, Postgres runtime wiring, cloud deployment state, and repository
  visibility.

## Benchmark Runner State

- The runner is deterministic, credential-free, network-free, and CI-safe by
  default.
- It does not read `.env.*` files.
- Direct script runs build `@handoffbase/memory-core` and the server unless
  `HANDOFFBASE_BENCH_SKIP_BUILD=1`.
- The npm script builds first and then runs the script with
  `HANDOFFBASE_BENCH_SKIP_BUILD=1`.
- The runner imports local builds from:
  - `packages/memory-core/dist/index.js`
  - `dist/services/continuity-memory-service.js`
- Runtime execution uses:
  - `InMemoryMemoryStore`
  - `MockMemoryProvider`
  - `ContinuityMemoryService`
- Fixture discovery is `examples/benchmarks/*/cases.json`.
- Supported fixture families:
  - `long-memory`
  - `conflicts`
  - `cross-host-handoff`
- Supported step operations:
  - `recall`
  - `bootstrap`
  - `forget`
  - `conflictRemember`
- When no fixture files exist, the runner exits successfully and prints:
  `No benchmark fixture files found.`
- Actual benchmark fixtures and official result claims are not included yet.

## Validation This Session

- `node --check scripts/run-memory-benchmarks.mjs`: passed.
- `npm run bench:memory`: passed; no benchmark fixture files are present yet.
- `npm run eval:memory`: passed 8/8 deterministic memory eval cases.
- `npm run check`: passed, including typecheck, build, smoke registration,
  memory-core tests, auth tests, server tests, and dashboard tests.
- `git diff --check`: passed.
- Markdown relative-link check: passed for 45 tracked Markdown files.
- Tracked-file secret/public scan: passed for 136 tracked non-env text files;
  skipped 1 `.env.*` tracked path without reading contents and reviewed 19
  intentional placeholder/test hits.

Remaining before handoff is considered publish-complete:

- commit
- `git push -u origin HEAD`

## Current Product State

- HandoffBase remains a functional open-source memory infrastructure MVP, not a
  production SaaS product.
- The current live/runtime proof remains `storeMode=in-memory`; Postgres runtime
  wiring is still future work.
- The Alibaba ECS proof remains historical deployment proof and may be stopped
  for cost control. Do not restart ECS or run remote validation without explicit
  approval and safe shell-provided credentials.
- HandoffBase can now say it has a deterministic benchmark runner, but it still
  must not claim official benchmark results or scores.

## Git State

- Branch: `codex/benchmark-runner`
- Commit target: `bench: add deterministic memory benchmark runner`
- Push target: `git push -u origin HEAD`
- Repository visibility was not changed.

## Next Session Prompt

```text
Continue from branch codex/benchmark-runner.

Read agent.md, memory/README.md, memory/product.md,
memory/architecture.md, memory/operations.md, memory/decisions.md,
docs/handoff.md, docs/effect.md, docs/benchmarks.md, docs/evals.md,
docs/product-completeness.md, scripts/run-memory-eval.mjs, package.json,
examples/evals/opportunity-scout-memory-eval.json, and
packages/memory-core/src/types.ts first.

Preserve MCP tool names, resource URIs, prompt names, runtime behavior,
Postgres runtime wiring, repository visibility, cloud state, and secret-handling
rules.

Finish validation, commit, and push only if all required local checks and scans
pass. Do not read `.env.*`, restart ECS, trigger cloud cost, or run remote
validation.
```
