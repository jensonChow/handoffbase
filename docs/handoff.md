# Current Handoff

Updated: 2026-07-10T07:13:53Z

## Completed

Integrated the six Product Proof worker commits on
`codex/product-proof-integration`, in the required order:

1. benchmark baseline foundation (`2bb64bd` -> `736b6e0`)
2. LongMemEval adapter (`f40814b` -> `11fa486`)
3. Postgres runtime (`be94177` -> `f7bd38b`)
4. conflict resolution (`ca5bcfd` -> `aa21c97`)
5. dashboard server mode (`3cc9495` -> `a6e521d`)
6. cross-host E2E (`947f9b1` -> `946676e`)

The cherry-picks had no textual conflicts. Semantic reconciliation completed:

- `memory_resolve_conflict` is the typed eighth MCP tool and preserves caller
  scope through authenticated HTTP.
- The comparative benchmark executes terminal `supersede_existing`, `merge`,
  and `keep_both` lifecycle assertions.
- `STORE_MODE=in-memory` remains the credential-free default.
- `STORE_MODE=postgres` plus `DATABASE_URL` selects `PostgresMemoryStore`;
  migration is explicit through `npm run db:migrate`.
- The dashboard browser defaults to same-origin HTTP. Its server backend uses
  the same `STORE_MODE` and `DATABASE_URL` as the MCP runtime; Postgres mode
  requires private tenant/user scope and disables demo seeding.
- Cross-host E2E asserts the exact 8-tool surface and closes runtime resources
  through the server lifecycle.
- LongMemEval has deterministic and explicit Qwen reader/provider modes. The
  tiny fixture remains mock, in-memory, network-free, and credential-free.
- `npm run check` now owns all safe deterministic CI product gates.
- README, architecture, product completeness, benchmark/eval/testing docs,
  deployment/submission notes, `memory/*.md`, and this handoff match the code.

## Product Proof Results

The local comparative benchmark executed 34 baseline/case pairs:

- HandoffBase: 17/17 observed passes.
- No-memory: 0/17 expected capability misses.
- Expectation conformance: 34/34.
- Execution errors: 0.
- Fixture errors: 0.
- Shared metric-tagged case cells: HandoffBase 43/43, no-memory 0/43.

These are synthetic local regression results, not an official benchmark score.

The LongMemEval tiny matrix completed 9/9 question-runs across `no-memory`,
`raw-history`, and `handoffbase`, using the deterministic reader and mock memory
provider. The official evaluator was not run.

## Validation

Final `npm run check`: passed. It included:

- TypeScript/workspace/server typecheck and production builds: passed.
- Dashboard production build: passed; Next.js generated all app/API routes.
- MCP smoke: 8 tools, 9 resources, 4 prompts.
- Memory core: 28/28 passed.
- Auth: 8/8 passed.
- Runtime/config/migration/pg-client unit tests: 17/17 passed.
- Server aggregate: 44/44 passed, including conflict, benchmark, and
  LongMemEval adapter coverage.
- Dashboard: 14/14 passed.
- `npm run eval:memory`: 8/8 passed.
- `npm run bench:memory`: HandoffBase 17/17, no-memory 0/17 expected,
  conformance 34/34.
- `npm run bench:longmemeval:tiny`: 9/9 question-runs passed.
- `npm run e2e:cross-host`: 1/1 passed.
- Markdown relative links: 54 tracked Markdown files, 68 links, passed.
- Tracked-file secret scan: 176 tracked text files, passed; no real `.env.*`
  files were opened.

Optional Postgres integration:

- `npm run test:postgres:integration`: exited successfully with its one test
  safely skipped because `TEST_DATABASE_URL` was not supplied.
- Docker is not installed on this machine (`docker: command not found`), so
  `npm run test:postgres:restart` was not run. The disposable restart harness
  is implemented but must not be reported as passed until run elsewhere.

The complete deterministic gate was rerun immediately before publication.
After this handoff refresh, whitespace, Markdown-link, tracked-secret, commit,
and local/remote status checks were repeated before the final state was
reported.

## Current Product Boundary

- The repository code supports selectable Postgres persistence, but the
  historical Alibaba ECS proof remains Qwen/API-key/in-memory and predates the
  eighth tool.
- No cloud database, TLS/domain/load balancer, monitoring, or production SaaS
  operations were added.
- Conflict serialization is process-local; there is no cross-process Postgres
  transaction spanning all linked memories and the conflict record.
- The dashboard is server-backed and scoped, but not a hardened production
  admin console.
- The migration has no ledger, and managed Postgres may require explicit
  privilege/support verification for `CREATE EXTENSION vector`.

## Full Credentialed LongMemEval Blockers

Before a full run:

- obtain the official cleaned dataset separately and keep it outside Git;
- securely export `QWEN_API_KEY` or `DASHSCOPE_API_KEY`;
- approve quota, cost, timeout, and exact Qwen model/version;
- choose a fresh output directory and retain adapter metadata;
- pin and run the separate official LongMemEval evaluator, including any judge
  credential/cost, then record its configuration and output.

Later adapter command:

```sh
QWEN_MODEL=qwen-plus npm run bench:longmemeval -- \
  --dataset /absolute/path/to/longmemeval_s_cleaned.json \
  --output-dir /absolute/path/to/longmemeval-qwen-results \
  --backend handoffbase \
  --reader qwen \
  --memory-provider qwen
```

This produces hypotheses and internal retrieval evidence. It does not invoke
the separate official evaluator and does not by itself produce an official
LongMemEval score.

## Git State

- Current branch: `main`.
- Focused integration commit:
  `aedb0bb0e275f76bb264c8684144904914058963`.
- Published integration branch: `origin/codex/product-proof-integration` at
  `aedb0bb0e275f76bb264c8684144904914058963`.
- Main merge commit: `fa83d102963c190e5a639c0180fe58b27bcb1db1`.
- `main` and `origin/main` are aligned at handoff completion. No pull request
  or cloud-infrastructure mutation was performed.

## Next Session Prompt

```text
Read agent.md, every memory/*.md file, docs/handoff.md, README.md,
docs/architecture.md, docs/product-completeness.md, docs/benchmarks.md,
docs/benchmark-results.md, docs/submission/testing-instructions.md,
package.json, src/config.ts, src/runtime/, src/services/memory-service.ts,
src/mcp/manifest.ts, apps/dashboard/src/lib/server/, and
benchmarks/longmemeval/ before changing product behavior.

Preserve the credential-free mock/in-memory default and the honest distinction
between integrated Postgres capability and the historical in-memory Alibaba
proof. Do not run the official LongMemEval dataset, Qwen reader/provider, paid
judge, Docker restart harness, cloud mutation, push, or merge without explicit
authorization and safe external inputs.
```
