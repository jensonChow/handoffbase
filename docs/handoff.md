# Current Handoff

Updated: 2026-07-10T12:51:15Z

## Outcome

The product-completeness remediation is implemented in the working tree. The
user-listed P0/P1 issues are closed:

- Dashboard authentication and caller isolation,
- disabled Conflict actions and lifecycle bypasses,
- ambiguous hard-delete/audit semantics,
- the missing product feedback-to-regression loop, and
- unreliable local/remote onboarding and readiness checks.

The final security/semantics review found no remaining P0/P1 blocker among
those issues. No commit, push, pull request, merge, cloud mutation, real Qwen
request, or real database mutation was performed.

## What The Product Is Now

HandoffBase is an MCP-native, cross-session and cross-host memory handoff layer
for AI agents. Hosts connect to one Remote Streamable HTTP `/mcp` endpoint. A
caller-scoped `ContinuityMemoryService` coordinates provider reasoning,
lifecycle governance, conflict resolution, feedback, traces, and a selectable
in-memory or Postgres store.

The current surface is:

- 9 tools, including `memory_resolve_conflict` and `memory_feedback`,
- 9 `memory://` resources,
- 4 reusable prompts,
- a Next.js Memory Vault for vault/pending/trace/conflict/feedback/delete-audit
  workflows, and
- deterministic eval, comparative benchmark, LongMemEval-format, and real
  loopback cross-host gates.

The product is a functional open-source memory-infrastructure MVP, not a
production SaaS. The historical Alibaba proof remains
`authMode=api_key` / `providerMode=qwen` / `storeMode=in-memory` and predates
the current nine-tool build.

## Implemented

### Dashboard authentication and governance

- Added API-key sign-in that issues an HMAC-signed, HttpOnly,
  SameSite=Strict session cookie. The cookie stores only a key fingerprint and
  expiry, not the raw key, caller identity, or scope grant.
- Every request resolves the fingerprint against the current API-key mapping,
  so key revocation and grant narrowing apply to existing sessions.
- Production Dashboard access fails closed when auth is disabled.
- Production mutations require exact same-origin `Origin`. The effective
  origin supports direct Host and reverse-proxy forwarded host/protocol; proxy
  docs require forwarded headers to be overwritten, not trusted from clients.
- Caller tenant/user comes only from the auth mapping. Optional
  `HANDOFFBASE_DASHBOARD_*` values narrow the view and never establish identity.
- Strict `allowedProjectIds` / `allowedAgentProfileIds` grants reject missing or
  out-of-grant dimensions, including legacy unscoped trace/context/feedback and
  deletion tombstones.
- All Dashboard writes now use a caller-bound `ContinuityMemoryService`; direct
  Store access remains only for caller-scoped snapshots/audit reads.
- Generic Edit cannot change lifecycle status. Pending approval uses an atomic
  `expected_status=pending` precondition and returns recoverable 409 on a race.
- Conflict actions now support all six service actions, require audit reason,
  require merged text for merge, and return a safe 409 when an action is not
  applicable to the current lifecycle state.
- The UI now includes Trace feedback and a global Audit / Deletion History.

### Physical hard delete and concurrency

- `hard_delete` physically removes the memory row and embedding instead of
  retaining a hidden `status=deleted` row.
- Linked event, trace, conflict, and feedback content is redacted. The retained
  delete event is a caller-scoped tombstone containing stable identity/scope,
  actor/time, status, and no deleted text/context/reason fixture.
- Dashboard snapshots retain the authorized deletion tombstone after the
  memory disappears.
- Postgres delete/write races are closed: feedback, recall, addTrace,
  addConflict, and resolveConflict lock and revalidate referenced records in a
  consistent transaction order. Delete-first makes the later reference write
  fail; reference-write-first makes delete wait and then redact it.
- Postgres recall locks selected/ignored references in sorted order with
  `FOR NO KEY UPDATE`, then revalidates fresh scope/type/lifecycle state before
  touch/trace/event persistence. A changed selected memory aborts with zero
  writes; an ignored memory that became recallable is omitted from ignored
  evidence.

### Feedback-to-regression loop

- Added typed ninth tool `memory_feedback` for memory, trace, or combined
  helpful/unhelpful feedback.
- Unhelpful feedback may create a governed pending `user_correction` memory.
  Built-in InMemory/Postgres stores persist correction + feedback as one unit;
  Postgres uses one transaction and rolls both back on failure.
- Feedback target scope is caller-authorized. Corrections and fixture fields
  reject credentials and redact detected email/phone content.
- The output regression draft excludes real record ids and scope values.
- Added `npm run feedback:to-benchmark`, explicit
  `--public-safe-confirmed`, no-overwrite output, CLI help, and repeatable
  `bench:memory -- --fixture` inputs. The converter rejects helpful-only,
  uncorrected, identified, unknown-field, UUID, and sensitive drafts.
- Feedback-derived cases are additive local regressions and do not mutate the
  canonical 17-case suite or become an official benchmark score automatically.

### Onboarding, readiness, and migrations

- Root server commands use `scripts/run-server.mjs`, which passes root
  `.env.local` to Node only when the file exists and never prints values.
- MCP remains on loopback port 3000; Dashboard defaults to loopback port 3001.
- Added exact current Codex TOML examples for local and remote Bearer-token MCP
  registration. Removed obsolete generic JSON host placeholders.
- `/health` remains side-effect-free liveness/config metadata.
- `/ready` runs a real current-schema Postgres query and a live one-token Qwen
  compatible completion probe. Qwen results are cached and concurrent misses
  share one in-flight call.
- API-key deployments authenticate `/ready`. Loopback local Qwen may probe with
  auth disabled; non-loopback auth-disabled Qwen, including the explicit demo
  bind override, fails before a model call.
- Auth-disabled servers bind loopback only by default. Non-loopback requires
  API-key auth or the explicit isolated-demo override.
- Remote validation is generic by default, checks `/health`, `/ready`, and the
  exact current manifest, and supports explicit expected-mode variables or the
  historical Alibaba profile.
- Postgres migrations are sorted per-file transactions under an advisory lock,
  recorded in `handoffbase_schema_migrations` with SHA-256 checksums, skipped
  when current, and rejected on applied-file drift.
- Dashboard dev uses port 3001. On this macOS environment, default Watchpack hit
  `EMFILE`; the verified fallback
  `WATCHPACK_POLLING=true npm run dashboard:dev` returned 200 for `/` and the
  Dashboard API.

### Documentation and project memory

- README, architecture diagrams, product completeness, lifecycle, workflows,
  effect, Dashboard demo, deployment, examples, and submission copy now match
  the authenticated nine-tool product.
- Durable product/architecture/interface/operations/decision memory has been
  refreshed in `memory/*.md`.
- Historical seven-tool ECS and eight-tool Product Proof evidence remains
  explicitly historical instead of being rewritten as current proof.

## Final Validation

Final `npm run check`, with both Qwen credential variables explicitly cleared:
passed end to end.

- TypeScript/workspace/server typecheck: passed.
- Production builds: passed, including all Dashboard pages and seven API route
  groups under Next.js 16.2.10 Turbopack.
- MCP smoke: 9 tools, 9 resources, 4 prompts.
- Memory core: 41/41 passed.
- Auth: 9/9 passed.
- Runtime/config/readiness/migration/pg-client: 24/24 passed.
- Server aggregate: 67/67 passed.
- Dashboard API/client/session/component: 32/32 passed.
- Deterministic memory eval: 8/8 passed.
- Comparative benchmark: HandoffBase 17/17; no-memory 0/17 expected misses;
  34/34 expectation conformance; 0 execution or fixture errors.
- LongMemEval tiny: 9/9 question-runs; deterministic reader, mock provider;
  official evaluator not run.
- Real loopback cross-host HTTP/MCP E2E: 1/1 passed.
- Markdown links: 54 tracked Markdown files, 71 relative links, passed.
- Secret scan: 176 tracked files plus 16 untracked candidates, 192 text files,
  passed. The scanner now handles unstaged deletions by reading index content
  and also scans unignored untracked candidates.
- `git diff --check`: passed.

Optional integration:

- `npm run test:postgres:integration`: exited successfully with its one test
  safely skipped because `TEST_DATABASE_URL` was not supplied.
- Docker is not installed, so `npm run test:postgres:restart` was not run.
- No real Qwen readiness call was made; fake-fetch tests cover request, cache,
  singleflight, auth, and non-leaking failure behavior.

Production HTTP smoke used only synthetic local credentials and an ephemeral
in-memory store:

- homepage 200,
- `127.0.0.1` API-key login 200,
- authenticated snapshot 200,
- inapplicable Conflict action 409,
- applicable `supersede_existing` 200,
- unhelpful Trace feedback + correction 201,
- hard delete 204,
- final snapshot: deleted memory absent, one feedback persisted, conflict
  closed, one safe deletion tombstone, deleted text absent.

The in-app Browser backend could not attach to the local page, so no visual
screenshot is claimed. Production HTTP smoke, 32 Dashboard tests, and the
production build are the UI/runtime evidence. The first default dev attempt
also proved the documented `EMFILE` failure; polling fallback then returned
200 for both page and API.

## Benchmark Truth

The canonical local comparative result remains:

- HandoffBase: 17/17 observed passes,
- no-memory: 0/17 expected capability misses,
- 34/34 expectations matched,
- 43/43 shared metric-tagged cells for HandoffBase versus 0/43 no-memory.

This is deterministic synthetic regression evidence, not an official
LongMemEval or leaderboard score. No official dataset, credentialed full run,
or official evaluator was used in this session.

## Remaining Production Boundaries

These are follow-up production enhancements, not unresolved items from the
user-listed audit:

1. The full multi-memory Conflict action is still coordinated by a
   process-local service lock rather than one cross-record Postgres unit of work
   across every memory mutation and the conflict record.
2. A third-party custom `MemoryStore` that does not implement the optional
   atomic feedback method receives ordinary-error compensation, but not
   process-crash atomicity or an idempotency key. Built-in stores are atomic.
3. Postgres recall currently locks all ignored records returned by the unbounded
   ignored query. Correctness is preserved, but a large vault can create O(n)
   lock amplification; production should retain only a bounded relevant sample
   or summarized ignored evidence.
4. No validated durable cloud Postgres deployment, TLS/domain/LB, monitoring,
   backup/restore, rate limiting, or production key/session administration
   exists yet.

## Git State

- Current branch: `main`.
- HEAD: `90119218a7d804f66fcd2c45d2411b09f828ed1f`.
- `origin/main` is still aligned to that same commit.
- The remediation is an uncommitted working-tree change set; no files were
  staged, committed, pushed, merged, or published.
- The working tree intentionally contains modified, deleted obsolete host JSON
  examples, and new implementation/test/TOML files for this remediation.

## Next Priority

The next product loop should be:

1. review the working-tree diff and commit it intentionally,
2. collect public-safe real user failures through `memory_feedback`,
3. convert only reviewed drafts into additive benchmark fixtures,
4. iterate product behavior against those regressions, and
5. plan an explicitly approved full official benchmark/evaluator run and a
   durable deployment proof separately.

Do not claim an official score, durable cloud proof, live public endpoint, or
production SaaS readiness from the current local evidence.

## Next Session Prompt

```text
Read agent.md, all memory/*.md files, docs/handoff.md, README.md,
docs/architecture.md, docs/product-completeness.md, docs/product-workflows.md,
docs/memory-lifecycle.md, docs/benchmarks.md, docs/benchmark-results.md,
docs/deployment.md, package.json, src/http.ts, src/readiness.ts,
src/services/continuity-memory-service.ts, packages/memory-core/src/storage.ts,
packages/memory-core/src/postgres-store.ts, apps/dashboard/src/lib/server/,
and apps/dashboard/src/components/memory-vault-dashboard.tsx before changing
product behavior.

Preserve: the nine-tool contract; caller-derived Dashboard identity; signed
fingerprint-only sessions; caller-bound service mutations; physical hard
delete plus safe tombstone; atomic built-in feedback correction; the
feedback-to-regression public-safe review gate; credential-free mock/in-memory
defaults; honest historical Alibaba proof; and synthetic-vs-official benchmark
wording. Do not run paid Qwen, official evaluator, cloud mutation, Docker
restart, commit, push, or merge without the required inputs/authorization.
```
