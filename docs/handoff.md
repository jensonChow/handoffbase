# Current Handoff

Updated: 2026-07-07

## Completed This Session

- Integrated the second batch of detached Codex worktree diffs into `main` in the requested order:
  `codex/auth-tenant-scope-guard`, `codex/postgres-store-crud-events`,
  `codex/postgres-recall-hybrid`, `codex/conflict-entity-vault`,
  `codex/dashboard-api-live`, and `codex/deployment-profile`.
- Added HTTP MCP API key auth with `Authorization: Bearer` and
  `X-Handoffbase-Api-Key`, disabled-by-default local mode, caller context
  propagation, and scope guards for recall/write/update/forget/resource reads.
- Upgraded `PostgresMemoryStore` from scaffold to core CRUD, supersede,
  embedding upsert, run/trace insert, structured recall, recall trace/event,
  and memory conflict persistence/query/resolve support.
- Added first-class `MemoryConflictRecord` domain types, validation, lifecycle,
  in-memory store support, SQL migration contract, and `memory://vault/conflicts`
  backed by real conflict records.
- Kept context-pack trace v2 semantics intact: `memory_recall.trace_id` and
  `continuity_bootstrap.memory_trace_id` identify final context-pack traces that
  link retrieval traces through `metadata.retrieval_trace_id`.
- Added live local dashboard API routes:
  `GET /api/dashboard/memory`, `PATCH /api/dashboard/memories/:id`,
  `POST /api/dashboard/memories/:id/approve`,
  `POST /api/dashboard/memories/:id/invalidate`, and
  `DELETE /api/dashboard/memories/:id`.
- Added dashboard API tests, auth tests, server route tests, and expanded
  memory-core tests for Postgres CRUD/recall/conflicts and migration contracts.
- Added Docker production profile, `.dockerignore`, `docs/deployment.md`, safe
  `/health` metadata, config validation, and `dist/index.js` production start
  layout.
- Refreshed README, `.env.example`, deployment docs, and project memory docs for
  the integrated state.

## Verification

- `npm run check` passed.
- `npm run dashboard:build` passed and produced the dashboard page plus dynamic
  `/api/dashboard/*` routes.
- `npm run test:memory-core` passed with 28 tests.
- `npm run smoke` passed and verifies `/health` plus registered MCP
  tools/resources/prompts and trace v2 behavior.
- `npm run test:auth` passed with 5 tests.
- `npm run test:server` passed with 1 test.
- `npm run test:dashboard` passed with 2 tests.
- `npm run start:server` was started from compiled `dist/index.js` with
  `PORT=0`; `/health` returned safe metadata and the process was stopped.
- `git diff --check` passed.

## Git State

- Branch: `main`.
- This handoff is part of the second-batch integration commit requested at the
  end of the session. After push, `main` should be aligned with `origin/main`;
  verify with `git status --short --branch`.
- The requested source branch refs were not present locally or remotely; their
  work existed as detached Codex worktree diffs under `/Users/jenson/.codex/worktrees/*/HandoffBase`.
- Untracked new paths include `Dockerfile`, `.dockerignore`,
  `docs/deployment.md`, `src/auth/`, `src/config.ts`, root `test/` and
  `tests/`, dashboard API routes/server helpers/tests.

## Open Risks

- Default runtime store remains in-memory. `PostgresMemoryStore` is implemented
  and tested, but env-based server wiring for `DATABASE_URL` / `POSTGRES_URL`
  is still future work.
- Qwen provider was not exercised with real credentials; local and CI-style
  validation used mock/default secret-free paths.
- Alibaba Cloud deployment has not been performed or externally verified.
- Dashboard API currently uses an in-memory dashboard backend seeded for local
  operation; real multi-tenant dashboard auth/storage integration remains future
  work.
- `npm install` from the previous handoff reported two moderate vulnerabilities;
  no audit fix was applied in this integration.

## Next Session Prompt

```text
Read agent.md, memory/README.md, memory/decisions.md, and docs/handoff.md first.

Continue from main with the uncommitted second-batch integration diff.

Priorities:
1. Review and commit the integrated diff when ready.
2. Wire `PostgresMemoryStore` into the runtime factory behind `STORE_MODE` and
   `DATABASE_URL` / `POSTGRES_URL` if persistent deployment is needed.
3. Add dashboard auth/storage integration before exposing real user memory data.
4. Configure and smoke-test `QwenMemoryProvider` with real Qwen/DashScope
   credentials outside CI.
5. Deploy to Alibaba Cloud, capture `/health`, MCP tools/list, dashboard/API,
   and redacted Qwen evidence, then update the deployment checklist.
```
