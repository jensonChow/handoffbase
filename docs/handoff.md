# Current Handoff

Updated: 2026-07-11 (engine strengthening: capacity-bounded strategic forgetting +
strict token-budget enforcement, both Track-1 judged capabilities)

## Outcome

This session strengthened the memory engine itself — the two capabilities Track 1
explicitly judges and the engine did not have: **strategic forgetting**
(`memory_forget` mode `enforce_capacity`) and **recall within a limited context
window** (server-side hard `token_budget` enforcement). Both deferred LOW
correctness findings were closed on the way (`reflect` over-reporting invalidated
ids; `recall` `limit<=0` store parity). The 9/9/4 tool contract and the pinned
17-case benchmark suite are deliberately unchanged. No dataset download, no paid
Qwen/OpenAI call, no cloud mutation or Docker restart, no repo-visibility change.

Design method: a multi-agent Workflow (5 code-mapping readers → 3 independent
designs under minimal-diff / algorithmic-rigor / judge-appeal lenses → scored
synthesis) produced the file-by-file plan before any code was written.

## What Shipped

### Strategic forgetting — `memory_forget` mode `enforce_capacity`

- **A fifth forget mode, not a tenth tool.** The 9/9/4 manifest is untouched
  (~30 sites assert it, including the stopped ECS validator's 9-tool check).
- **Retention policy = recall ranking.** New shared pure helpers in
  `packages/memory-core/src/lifecycle.ts`: `retentionScore` (exactly the
  non-query projection of the Postgres recall score:
  `importance*2.0 + confidence*0.5 + min(useCount,20)*0.01 + hyperbolic recency`)
  and `compareRetentionForEviction` (deterministic total order: score →
  lastUsedAt → useCount → updatedAt → createdAt → id). One ordering governs
  recall priority and forgetting priority: what recall ranks last is what
  capacity pressure evicts first.
- **Governed, reversible, explainable.** Capacity bounds the TOTAL active count
  in scope; `protected_types` only controls eligibility (best-effort when
  protected alone exceed capacity). `dry_run: true` returns the full eviction
  plan (ids + retention scores) with zero mutation/events/traces. Apply archives
  (never deletes) each victim under mutation locks with per-victim re-fetch/skip
  (racing a per-memory forget yields exactly one mutation, no double event), one
  governance event per eviction (actor = authenticated caller; sweep provenance
  in the reason's `[capacity N: retention S, rank i/N]` marker), plus an
  aggregate `capacity_sweep` trace (selected = retained, ignored = evicted,
  per-victim reasons) — `memory_trace` can now explain forgetting.
- **Auth inherited, not re-implemented.** The sweep composes `listMemories` +
  `updateMemory` through the existing scope guards; wrong tenant/user/project
  callers are rejected and other users' over-capacity memories are never counted
  or touched (tested).
- Schema: `memory_forget` input gains optional `scopes`/`capacity`/`dry_run`/
  `protected_types` with `superRefine` cross-field rules enforced at the MCP
  boundary (full-schema registration, `memory_resolve_conflict` precedent) AND
  re-parsed defensively in the service; output gains optional `capacity`/
  `retained_count`/`dry_run`/`trace_id`/`evicted_memories`.

### Limited context window — strict server-side token budget

- New exported `enforceTokenBudget(pack, budget)` in
  `continuity-memory-service.ts`, applied at the single `buildContextPack` choke
  point covering BOTH tools (`memory_recall`, `continuity_bootstrap`) and BOTH
  providers: greedy skip-and-continue over the rendered `- [type] text` lines,
  so `estimated_tokens <= token_budget` holds **by construction** (measured on
  the actual joined artifact — fixes the mock's uncounted `- [type] ` prefix
  gap). The caller-effective budget always overrides the provider echo, so a
  Qwen response echoing a bogus `token_budget` cannot bypass it.
- Trimmed memories land on the context-pack trace as ignored with reason
  `Trimmed to fit the token budget of N tokens.` — deliberately distinct from
  the provider's own `Skipped to fit the token budget.`, so traces distinguish
  provider-skip from server-trim. Outputs gain optional `token_budget` /
  `estimated_tokens`. Honesty label: chars/4 heuristic estimator over rendered
  context lines, not an official tokenizer.

### Both deferred LOW bugs closed

- `reflect` now reports only actually-invalidated ids (hallucinated/stale
  provider ids no longer appear in `invalidated_memories`; regression-tested
  with a stub provider suggesting one real + one hallucinated id).
- `normalizeRecallLimit` moved verbatim from `postgres-store.ts` into shared
  `lifecycle.ts`; the in-memory store now throws byte-identically to Postgres
  for limit `0` / `-1` / `1.5` (previously `slice(0,-1)` silently returned n-1
  results). One source of truth = permanent parity.

### Proof layer (credential-free, deterministic)

- New benchmark family `capacity-pressure` — deliberately stored as
  `examples/benchmarks/capacity-pressure/capacity-pressure.fixture.json` (NOT
  `cases.json`: the runner auto-discovers `*/cases.json`, which would have
  silently grown the pinned suite). Runs only via `--fixture`; two cases
  (capacity eviction incl. cross-user isolation; budget trim with hand-computed
  25-token budget where the mock selects two memories but only one rendered
  line fits). Double-run asserted byte-identical in `test/benchmark-runner.test.mjs`;
  the pinned 17/34/43 assertions are untouched and still pass.
- Two new eval cases (`capacity-eviction` incl. dry-run zero-mutation +
  per-eviction event ids + `capacity_sweep` trace + archived-not-deleted;
  `budget-trim-partial` incl. `estimated_tokens <= token_budget` + trim reason
  on the trace) on isolated stores — eval now **10/10**.
- `ContinuityMemoryService` gained an injectable `clock` option; benchmark and
  eval runners inject the fixture's `fixedNow`, making determinism structural.
- Runner wiring: `allowedFamilies` +`capacity-pressure`; forget steps carry
  `capacity`/`dryRun`/`scopes`; `validateStep` enforces the mode-conditional
  contract; `runForgetStep` builds mode-shaped input and honors
  `traceIdPresent`; no new metric slugs or expectation keys.

### Adversarial review round (post-implementation)

A 4-finder → 2-skeptic-per-finding review of the diff (several findings verified
by executable repro against dist) confirmed 5 distinct defects the green suite
missed; all fixed same-session with 5 regression tests (see memory/decisions.md
2026-07-11 for full detail): (HIGH) restricted-caller sweep aborted mid-loop on
broader-scope memories with committed partial evictions and no trace; (MED) a
narrowed sweep could archive user-wide memories other projects still recall —
both fixed by upfront eviction eligibility (scope-narrowness + caller authority,
identical for dry-run and apply; broader memories count toward capacity but are
never evictable); (MED) race-skipped victims were mis-reported as retained —
now tracked, excluded from retained_count, traced as skipped; (MED) capacity
archives now carry `expectedStatus:"active"` so cross-process Postgres races
lose gracefully; (LOW×2) `scopes` schema description now matches its validation
("rejected", not "ignored"); `enforceTokenBudget` dedupes ids a provider echoes
in both lists (server outcome wins).

## Validation

Full `npm run check` (Qwen credentials cleared) green end to end: memory-core
**57** (54+3), auth **10**, runtime **26**, server **99** (82+17), dashboard
**33**, memory eval **10/10** (8+2), comparative benchmark HandoffBase 17/17 vs
no-memory 0/17 (34/34, byte-stable), capacity-pressure fixture 4/4 conformant +
byte-identical double run, LongMemEval tiny 9/9, cross-host E2E 1/1, markdown
links, tracked-secret scan.

New tests: retention scoring/eviction-order pure tests + store limit parity
(memory-core); enforce_capacity happy path / no-op / dry-run / protected_types /
auth matrix + cross-user isolation / superRefine rejections / concurrency race /
broader-scope eligibility (restricted + unrestricted callers) / race-skip
accounting / expectedStatus precondition skip; strict budget (mock trim + trace
reason, Qwen-echo-0 bypass attempt, bootstrap accounting, `enforceTokenBudget`
unit incl. skip-and-continue + empty-stays-empty + both-lists dedupe); reflect
over-report regression; capacity-pressure `--fixture` block.

## Product-Completeness Verdict (code-grounded, 2026-07-11)

- **Credible hackathon submission: YES, stronger** — both explicit Track-1 asks
  (strategic forgetting, limited context window) are now real, governed,
  deterministic engine capabilities with credential-free proofs, not roadmap
  items.
- **Star / adoptable OSS repo: CLOSER** — unchanged gaps: README hero + badges +
  raster screenshot, real Qwen run, cold-vs-warm artifact.
- **Production: NO** — unchanged; in-memory default, ECS stopped, no durable
  cloud Postgres/TLS/backup/rate-limit. (Not claimed.)

## Parallel opportunity — CockroachDB × AWS hackathon (researched 2026-07-12)

A second hackathon is a strong thematic fit and worth a parallel entry: the
"CockroachDB × AWS Hackathon — Build with Agentic Memory" (Cockroach Labs + AWS,
`cockroachdb-ai.devpost.com`). Submission window **June 30 → August 18, 2026** —
about four weeks AFTER the Qwen deadline (Jul 20), so the two run sequentially,
not simultaneously. Prize $8,750. Requires **≥2 CockroachDB tools** (Cloud
Managed MCP Server · Distributed Vector Indexing · ccloud CLI · Agent Skills) and
**≥1 AWS service** (Bedrock/Lambda/ECS/S3/…), meaningfully integrated. Judged on
Agentic Memory Design · Technical Implementation · Real-World Impact · Production
Readiness · Creativity & Originality — HandoffBase (an agentic-memory MCP server
with vector recall) fits this even more directly than the Qwen track.

Eligibility (verified against both events' `/rules`): dual participation is
allowed — no exclusivity clause on either side, and Devpost has no platform-wide
ban. The CockroachDB event requires projects "newly created … during the
Submission Period"; this repo's first commit is **2026-07-07**, inside that
window (and inside the Qwen window), so **HandoffBase itself qualifies — no
separate/"sibling" repo is needed for originality**. Good-faith: disclose it as a
dual-hackathon project and let the CockroachDB + AWS integration be the fresh,
event-specific work.

Technical delta (verified against primary CockroachDB docs +
`packages/memory-core/migrations/0001_memory_core.sql`): CockroachDB is pg-wire
compatible (node-pg connects; port 26257) and has a NATIVE `VECTOR` type using
the same operators as pgvector (`<=>` cosine, `<->` L2, `<#>` inner product).
Vector indexing = C-SPANN via `CREATE VECTOR INDEX`, needs **v25.2+**. The only
real deltas are two migration lines: (1) drop `create extension if not exists
vector;` (CRDB has `VECTOR` natively, not the pgvector extension); (2) swap
`create index … using ivfflat (embedding vector_cosine_ops)` → CockroachDB
`CREATE VECTOR INDEX`. Everything else ports as-is (`<=>` recall, `vector(1536)`,
`for update`/`for no key update`, `on conflict do update`, `jsonb`/`text[]`/
`unnest`/`returning`; no triggers or stored procs to trip PG-compat gaps). So a
`STORE_MODE=cockroach` adapter is a ~1-day job, not a rewrite — and it satisfies
one required tool (Distributed Vector Indexing); the Cloud Managed MCP Server or
ccloud CLI covers the second. The clouds collide (can't run one instance on both
Alibaba and AWS), but the swappable provider/store boundaries mean two
deployments from one core.

Recommended sequence: ship Qwen by Jul 20, then build the `STORE_MODE=cockroach`
adapter + AWS deploy in the Jul 20 → Aug 18 gap (doing it in-window strengthens
the "built during the submission period" story). Not started — deferred until
after the Qwen submission unless the owner asks to de-risk early.

## Remaining Work

Star-OSS gaps (no keys needed):

1. README hero + badges + a real raster screenshot or GIF of the v2 dashboard.
2. No reproducible path uses real Qwen (semantic recall wired but never run live).
3. No cold-vs-warm learning-curve artifact.
4. (Optional stretch) Dashboard capacity-sweep panel — evictions already surface
   in the activity feed via their governance events.

Deferred store-parity follow-ups (documented in memory/decisions.md, deliberately
untouched — behavior-changing on the recall-ordering surface): Postgres recall
weights 2.0/0.5 vs in-memory 1.0/0.25; in-memory lacks recency/useCount recall
terms; Postgres vector term unclamped vs in-memory clamp-at-0; selection-reason
wording for whitespace-only queries.

Owner-only / ops:

- **Owner confirmed (2026-07-11): Alibaba Cloud + Qwen will be resumed before
  final submission.** Rebuild ECS from current HEAD (do NOT restart the stale
  `b565210` image — 7 tools, fails `mcp:validate-remote`'s 9-tool assertion);
  public IP changes on relaunch (no elastic IP) so swap every doc reference to
  `123.56.244.157` and regenerate a dated validator proof; decide `storeMode`
  at relaunch (Postgres + migration would finally make durable persistence
  real; in-memory re-proves only the model path).
- Make the GitHub repo public; add the URL to Devpost under Track 1.
- Record the two demo videos (scripts in `docs/submission/`) — the forgetting
  demo arc is now real: seed over capacity → dry-run plan → apply → audit
  events + `capacity_sweep` trace in the dashboard.
- Real LongMemEval run: download LongMemEval-S + export `DASHSCOPE_API_KEY`
  (+ `OPENAI_API_KEY` for the gpt-4o judge), then `bench:longmemeval:compare`.

Production follow-ups (unchanged): cross-record Postgres unit of work for
multi-memory conflict resolution; process-crash-atomic feedback for third-party
stores; bounded ignored-lock sample in Postgres recall; durable cloud Postgres +
TLS/monitoring/backup/rate-limiting.

## Next Priority

The engine now covers the Track-1 asks. Highest-value remaining moves:
README hero + badges + a real screenshot of the v2 dashboard, then the owner-run
real-Qwen artifact (relaunch + validator proof, or a LongMemEval subset run).
Downstream (after Qwen, Jul 20 → Aug 18): the CockroachDB × AWS entry — see
"Parallel opportunity" above; a ~1-day `STORE_MODE=cockroach` adapter + AWS
deploy, deferred until the Qwen submission is in.

Do not claim an official benchmark score, durable cloud proof, live public
endpoint, or production SaaS readiness. Keep every judge labeled
`official_qa_evaluator: false`. Do not make the repo public, run paid
Qwen/OpenAI, download the official dataset, mutate cloud, or restart Docker
without the required inputs/authorization.

## Next Session Prompt

```text
Read agent.md, all memory/*.md, docs/handoff.md, README.md, package.json, and
(for the engine) packages/memory-core/src/lifecycle.ts +
src/services/continuity-memory-service.ts + src/schemas.ts before changing
behavior.

Current: HEAD on main is the strategic-forgetting + token-budget engine session
(after the dashboard v2 redesign 48f4ad8/8fc64fc). memory_forget gained an
enforce_capacity mode (retention score = non-query projection of recall
ranking; archive-only, dry-run-first, per-eviction events + capacity_sweep
trace); token_budget on recall/bootstrap is now a server-side hard constraint
(enforceTokenBudget; estimated_tokens <= token_budget by construction); both
LOW bugs closed (reflect over-report, recall limit<=0 parity via shared
normalizeRecallLimit). Proofs: capacity-pressure --fixture family (pinned
17/34/43 untouched), eval 10/10, server tests 94, memory-core 57.

Preserve: the nine-tool 9/9/4 contract; the pinned 17-case suite byte-stable
(capacity-pressure stays --fixture-only, never cases.json); embeddings
default-off; every benchmark score labeled official_qa_evaluator:false; honest
historical Alibaba proof; archive-only capacity eviction (hard delete stays
manual); the caller-effective token budget must always override provider echo.

Owner has confirmed Alibaba Cloud + Qwen will be resumed before final submit:
rebuild from HEAD (never restart the 7-tool b565210 image), expect a new public
IP, regenerate the validator proof, and decide storeMode (Postgres would make
durable persistence real).

Highest-value next work: README hero+badges + real dashboard screenshot, then
the owner-run real-Qwen artifact. Do not make the repo public, run paid
Qwen/OpenAI, or mutate cloud without authorization.
```
