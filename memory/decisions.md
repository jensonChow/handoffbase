# Decision Memory

## 2026-07-06

- Decision: Project direction is handoffbase.
- Rationale: The core problem is cross-agent, cross-session, cross-project continuity rather than another standalone agent app.
- Status: active.

## 2026-07-06

- Decision: Do not build a full agent runtime or Letta clone.
- Rationale: Letta already owns the memory-first agent runtime position; this project should be agent-agnostic infrastructure exposed through MCP.
- Status: active.

## 2026-07-07

- Decision: MVP is Remote Streamable HTTP only.
- Rationale: Remote MCP best matches cloud-shared memory, Alibaba Cloud deployment proof, and cross-host continuity. Local stdio is useful later but not required for first submission.
- Status: active.

## 2026-07-07

- Decision: Qwen Cloud is the first and primary memory reasoning provider for the hackathon, but memory core must be provider-agnostic.
- Rationale: The competition requires deep Qwen Cloud usage, while long-term product development should avoid Qwen-only lock-in.
- Status: active.

## 2026-07-07

- Decision: The integrated local MVP uses an npm workspace with a root MCP server, `packages/memory-core`, `apps/dashboard`, and deterministic AI Opportunity Scout demo fixtures.
- Rationale: This lets parallel worktree outputs compile together while preserving provider abstraction, local smoke tests, and dashboard/demo independence before Postgres and live Alibaba deployment are wired.
- Status: active.

## 2026-07-07

- Decision: Memory ids, run ids, trace ids, event ids, and SQL reference arrays use domain text ids for the MVP contract instead of forcing uuid columns.
- Rationale: Existing seed/demo ids and MCP trace/resource ids are semantic strings; keeping SQL ids as text avoids schema/runtime mismatch while Postgres persistence is still a scaffold.
- Status: active.

## 2026-07-07

- Decision: `memory_recall.trace_id` and `continuity_bootstrap.memory_trace_id` identify the final context-pack trace, not the raw retrieval trace.
- Rationale: `memory_trace` should explain exactly what the host received in the token-budgeted context pack, including provider-selected and provider-ignored memories. The raw retrieval trace remains linked through `metadata.retrieval_trace_id`.
- Status: active.

## 2026-07-07

- Decision: Qwen provider input must be sanitized before prompt construction, and CI/local validation must not require Qwen credentials.
- Rationale: Agent/tool payloads may contain tokens, cookies, private keys, or oversized logs. Sanitizing before `buildProviderPrompt` protects provider calls, while mock-default CI keeps checks deterministic and secret-free.
- Status: active.

## 2026-07-07

- Decision: Memory conflicts are first-class governance records instead of a pending-memory filtered view.
- Rationale: Provider conflict detection needs durable review state for contradictions, duplicates, supersedes, and scope overlaps; candidate memories that require ask_user, merge, or supersede review should remain pending until an explicit resolution.
- Status: active.

## 2026-07-07

- Decision: The deployable server exposes safe health metadata, optional API key auth, and an in-memory default store while keeping Postgres available behind `PostgresMemoryStore`.
- Rationale: The hackathon demo needs a Docker-ready Remote Streamable HTTP server that can run without secrets, while auth scope guards and Postgres persistence can be enabled or wired without changing MCP tool/resource contracts.
- Status: active.

## 2026-07-07

- Decision: Hackathon setup evidence lives in a committed non-secret `docs/dev-materials-checklist.md`, while real Qwen and HandoffBase auth values stay only in ignored `.env.*` files.
- Rationale: The project needs reproducible development/deployment readiness notes without exposing API keys, database URLs, tokens, or one-time Model Studio secrets.
- Status: active.

## 2026-07-07

- Decision: The first Alibaba Cloud deployment target should be ECS + Docker, with paid provisioning and Postgres/pgvector deferred until explicitly approved.
- Rationale: The current MCP server is a long-running Node.js HTTP service with a production Dockerfile, while ACK adds unnecessary Kubernetes overhead and Postgres still needs runtime store-selection wiring plus target-service pgvector verification.
- Status: active.

## 2026-07-07

- Decision: The hackathon deployment proof uses a single pay-as-you-go Alibaba Cloud ECS instance running Docker, with API-key auth, Qwen provider mode, and the default in-memory store.
- Rationale: The user approved the minimal ECS + Docker path for demo proof, and live validation passed without adding ACR, ACK, Function Compute, Postgres/RDS, a load balancer, a domain, or TLS. Extra paid resources remain out of scope until separately approved.
- Status: active.

## 2026-07-08

- Decision: Star-readiness integration should add open-source polish as docs/examples/eval/dashboard/README artifacts without changing MCP tool names, resource URIs, prompt names, cloud deployment, or Postgres runtime wiring.
- Rationale: The five source worktree branches were reconciled into `main` by restoring their stronger docs/examples/eval/dashboard/README content, then recording branch ancestry with merge commits. This preserved the deployed Qwen-backed in-memory proof and existing hackathon functionality.
- Status: active.

## 2026-07-09

- Decision: Submission-readiness integration is docs-only and should keep the public story honest: Track 1 MemoryAgent, Qwen-backed reasoning, Alibaba ECS proof, `storeMode=in-memory`, stopped ECS cost posture, and future Postgres/TLS/LB/domain work.
- Rationale: The submission package merged Devpost copy, testing instructions, checklist, video scripts, architecture notes, final public-readiness docs, and an ECS relaunch runbook without changing product behavior, cloud state, MCP names, resource URIs, prompt names, or secret handling.
- Status: active.

## 2026-07-09

- Decision: HandoffBase should prioritize effect proof and product completeness before additional feature expansion.
- Rationale: Core MCP, Qwen, lifecycle, and governance features are enough for the MVP, but benchmark-backed behavior improvement and product workflow clarity are needed to make it credible as long-term open-source infrastructure.
- Status: active.

## 2026-07-10

- Decision: Product Proof integration exposes eight typed MCP tools, with `memory_resolve_conflict` as the explicit authorized conflict lifecycle operation.
- Rationale: Conflict governance is incomplete if callers can only create and inspect conflicts. A typed service boundary preserves caller authorization and makes accept, reject, supersede, merge, keep-both, and dismiss auditable.
- Status: superseded by the nine-tool feedback decision below; the conflict tool remains active.

## 2026-07-10

- Decision: `STORE_MODE=in-memory` remains the credential-free default, while `STORE_MODE=postgres` plus `DATABASE_URL` selects `PostgresMemoryStore`; migration stays an explicit operator command.
- Rationale: CI and first-run contributors need zero credentials, while product proof needs real selectable persistence without surprising production schema mutations on startup.
- Status: active.

## 2026-07-10

- Decision: The dashboard server must follow the same `STORE_MODE` and `DATABASE_URL` as the MCP runtime, and Postgres dashboard access requires explicit private tenant/user scope.
- Rationale: A separately seeded dashboard is not product truth. Shared storage makes dashboard mutations and runtime memories coherent, while explicit scope prevents cross-user visibility.
- Status: superseded by authenticated caller-derived Dashboard scope below; shared storage remains active.

## 2026-07-10

- Decision: `npm run check` owns every credential-free deterministic product gate: core/runtime/dashboard tests, 8-tool smoke, local eval, comparative benchmark, LongMemEval tiny matrix, real loopback cross-host E2E, Markdown links, and tracked-secret scanning.
- Rationale: Contributors and CI should have one authoritative command that proves the integrated product without Qwen credentials, Docker, cloud access, or external datasets.
- Status: superseded only in count by the nine-tool surface below; the one-command gate remains active.

## 2026-07-10

- Decision: The LongMemEval adapter may provide explicit Qwen reader/provider modes, but no official score can be claimed until a full official dataset run and separate official evaluator run are completed and recorded.
- Rationale: Adapter compatibility, internal retrieval metrics, tiny synthetic fixtures, and model-generated hypotheses are different artifacts from an official benchmark score.
- Status: active.

## 2026-07-10

- Decision: The current MCP surface has nine typed tools; `memory_feedback` is the product feedback boundary for helpful/unhelpful judgment, optional pending correction, and sanitized regression-fixture output.
- Rationale: Real product iteration must connect an observed bad memory/trace to a governed correction and a reproducible local regression instead of relying on an operator to rewrite the failure manually.
- Status: active.

## 2026-07-10

- Decision: Dashboard identity must come from the HandoffBase auth caller mapping. The browser receives only a signed HttpOnly session containing a key fingerprint and expiry; optional Dashboard scope env values may narrow but never establish or widen identity.
- Rationale: A deployment-fixed tenant/user is a filter, not authentication. Re-resolving the key mapping per request makes key revocation and grant narrowing immediate, while caller-bound service mutations preserve the same governance semantics as MCP.
- Status: active.

## 2026-07-10

- Decision: `hard_delete` means physical memory/embedding deletion plus transactional redaction of linked historical content, while a minimal safe delete event remains as the audit tombstone.
- Rationale: Hiding a `status=deleted` row is not a hard delete, but erasing the entire audit trail also violates governance. The safe boundary retains stable identity/scope/action metadata without retaining the deleted text, trace context, feedback reason/fixture, or conflict content.
- Status: active.

## 2026-07-10

- Decision: Unhelpful corrections and feedback must be atomic in the Postgres store, and hard-delete races must be closed by locking/revalidating every referenced memory or trace before persisting feedback, recall traces, or conflicts.
- Rationale: Best-effort compensation does not survive process death, and delete/redaction sweeps are incomplete if a concurrent writer can recreate content after the sweep. Store-level transactions and row locks make the deletion promise durable under concurrent requests.
- Status: active.

## 2026-07-10

- Decision: `/health` is side-effect-free liveness, while authenticated `/ready` performs real store/provider dependency checks; auth-disabled non-loopback binding fails closed by default.
- Rationale: Health metadata cannot prove Postgres schema or Qwen availability, and a non-loopback anonymous readiness endpoint must not trigger paid model calls. The loopback-only local trust boundary may probe Qwen for onboarding; separating liveness/readiness keeps operations honest and remote defaults safe.
- Status: active.

## 2026-07-10

- Decision: The explicit Postgres migrator uses a per-file transactional ledger with checksum drift detection and an advisory lock.
- Rationale: Re-running one concatenated migration cannot safely distinguish applied schema versions or concurrent operators. A ledger makes startup-independent migrations repeatable and auditable without mutating schema automatically.
- Status: active.

## 2026-07-10

- Decision: Semantic recall ships behind an `EmbeddingProvider` abstraction (`QwenEmbeddingProvider` default `text-embedding-v4` @ 1536 dims; deterministic `MockEmbeddingProvider`), embedding on write and query, but DEFAULT OFF (Qwen only when credentials exist; `HANDOFFBASE_EMBEDDINGS=mock|off` overrides). Committed `eff14d8`.
- Rationale: Qwen was invisible in every reproducible path (the biggest drag on the Innovation criterion); wiring embeddings makes Qwen the visible engine for retrieval, not only extraction. Default-off keeps the credential-free CI and the deterministic 17/17 benchmark byte-for-byte unchanged, and 1536 dims match the existing `vector(1536)` column so no migration is needed.
- Status: active.

## 2026-07-10

- Decision: A LongMemEval QA scorer (`benchmarks/longmemeval/scorer.mjs`) and one-command comparison orchestrator (`compare.mjs`) were added, with `deterministic` / `qwen` (qwen-max) / `openai` (gpt-4o) judges. Every scoring artifact is stamped `official_qa_evaluator: false`. gpt-4o is offered as the judge specifically because it matches the official evaluator model and costs only ~$0.01/question, making a Qwen-reader run comparable to Zep/Mem0 published numbers. Commits `4c1dea6`, `f3554a2`, `de24716`.
- Rationale: The adapter stopped at `hypotheses.jsonl` with no score; a memory-track submission needs a credible, comparable QA number. Keeping the judge an explicit independent reimplementation (never claimed as the official GPT-4o evaluator) preserves the honesty posture while producing a real number once the owner supplies the dataset + key.
- Status: active. Real headline run still pending owner dataset download + paid credentials.

## 2026-07-10

- Decision: Fixed a real browser defect in the dashboard client — `this.fetcher = options.fetcher ?? fetch` called as `this.fetcher(...)` threw "Illegal invocation" in a browser on the default server-in-memory path; wrapped the fallback in an arrow that calls the global fetch, added a late-binding regression test. Commit `a5943c8`. Verified live: the Memory Vault now renders in a real browser.
- Rationale: Node/undici tolerated the wrong receiver, so all dashboard tests (which always inject a fetcher) and CI stayed green over the defect — the flagship demo was silently broken and had never been rendered in a browser. Tests must now exercise the default `?? fetch` branch.
- Status: active.

## 2026-07-10

- Decision: An adversarially-verified correctness review (6-finder Workflow → 2 skeptics/finding) is a first-class product-hardening pass; its confirmed findings must be fixed with credential-free regression tests before merge. This session fixed a real HIGH cross-tenant auth bypass plus nine store/service correctness bugs, adding 12 regression tests (memory-core 46→54, auth 9→10, server 79→82). Commit `fb2adfd`.
- Rationale: Green tests + green CI proved insufficient (the prior-session browser fetch bug and this session's auth bypass both slipped every existing test). The invariants now enforced by tests: (1) API-key lookup must be own-property + validated tenant/user, so `Object.prototype` member names can never authenticate; (2) sensitive-data redaction must catch JSON-quoted secrets and must not corrupt dates/versions; (3) `PostgresMemoryStore` list/recall must match the in-memory reference (effective-expired filtering, empty-allowlist = match-nothing, pgvector dim-guard); (4) `memory_update` must reject reserved terminal statuses; (5) `continuity_bootstrap` must honor the token budget; (6) feedback scope-compat uses narrowing semantics. Two LOW findings deferred: `reflect` over-reports invalidated ids; `recall` limit≤0 parity vs Postgres.
- Status: active.

- Decision: Ship a credential-free adoption layer — multi-host MCP connect recipes (Codex + Claude Code `claude mcp add --transport http` + Cursor `.cursor/mcp.json`, tokens via `${VAR}` env expansion only), CONTRIBUTING/CODE_OF_CONDUCT/SECURITY + `.github` issue/PR templates (security via GitHub private advisories, no personal email), and a theme-accurate `docs/assets/memory-vault.svg` built from the real seeded vault state. Commit `cf36ddf`.
- Rationale: The engine was adoptable but had zero connect recipes beyond Codex and no community-health files. A committable raster screenshot/GIF was not producible in-agent (no headless Chrome), so an accurate SVG stands in until the owner captures a PNG; the dashboard was verified rendering live at :3001.
- Status: active. Still open: README hero + badges + real raster screenshot/GIF.

## 2026-07-11

- Decision: Strategic forgetting ships as `memory_forget` mode `enforce_capacity`, NOT a tenth tool — the 9/9/4 contract is preserved deliberately (a new tool would ripple through ~30 sites that assert the manifest, including the stopped ECS validator). The eviction policy is a shared pure `retentionScore` in `packages/memory-core/src/lifecycle.ts`: exactly the non-query projection of the Postgres recall ranking (`importance*2.0 + confidence*0.5 + min(useCount,20)*0.01 + 0.05/(1+daysSinceLastUse)`), with `compareRetentionForEviction` as a deterministic total order (score → lastUsedAt → useCount → updatedAt → createdAt → id). Capacity bounds the TOTAL active count; `protected_types` only controls eviction eligibility (protected-over-capacity ⇒ best-effort). Eviction is archive-only (reversible), dry-run-first, one governance event per eviction (actor = authenticated caller, sweep provenance in the reason's `[capacity N: retention S, rank i/N]` marker), plus one aggregate `capacity_sweep` trace (selected=retained, ignored=evicted, per-victim reasons). Composes `listMemories` + `updateMemory` only — no MemoryStore interface change, no migration, dual-store parity/auth/tombstones inherited. `ContinuityMemoryService` gained an injectable `clock` option for deterministic sweeps in fixtures.
- Rationale: Track 1 explicitly judges strategic forgetting; one ordering for recall priority AND forgetting priority is the defensible story ("what recall ranks last is what capacity pressure evicts first") and adds zero new tunable surfaces. Archive-only keeps hard delete a deliberate human act.
- Status: active.

- Decision: `token_budget` on `memory_recall` / `continuity_bootstrap` became a server-side HARD constraint: exported `enforceTokenBudget(pack, budget)` in `continuity-memory-service.ts` re-measures the provider's selection over the rendered `- [type] text` lines (greedy skip-and-continue), so `estimated_tokens <= token_budget` holds by construction for BOTH providers and the caller-effective budget always overrides whatever the provider echoes (a Qwen response echoing `token_budget: 0` cannot bypass it — no `structured-output.ts` edit needed; the service-level override supersedes the model-echo hole). Server-trimmed memories land on the context-pack trace as ignored with reason `Trimmed to fit the token budget of N tokens.` — deliberately distinct from the mock's `Skipped to fit the token budget.` so traces distinguish provider-skip from server-trim. Outputs gained optional `token_budget`/`estimated_tokens`. Honesty label: chars/4 heuristic estimator, not an official tokenizer.
- Rationale: Track 1's second judged capability (recall within a limited context window). The mock measured raw text (uncounted `- [type] ` prefix) and Qwen could over-select; measuring the actual rendered artifact at the single service choke point closes both without touching providers.
- Status: active.

- Decision: Both deferred LOW bugs are closed. (1) `reflect` now reports only actually-invalidated ids (pushes after the store update inside the `if (memory)` guard) — hallucinated/stale provider ids no longer appear in `invalidated_memories`. (2) `normalizeRecallLimit` moved verbatim from `postgres-store.ts` into shared `lifecycle.ts`; `InMemoryMemoryStore.recallMemories` now throws byte-identically to Postgres for limit 0 / -1 / 1.5 (previously `slice(0, -1)` silently returned n-1 results).
- Rationale: The limit bug was a genuine store-parity hole (silent results in-memory vs throw on Postgres); one shared source of truth makes the parity permanent.
- Status: active.

- Decision: The capacity-pressure proof lives OUTSIDE the pinned suite: `examples/benchmarks/capacity-pressure/capacity-pressure.fixture.json` (deliberately not `cases.json`, so default discovery skips it — the runner auto-discovers `*/cases.json`, which would have silently grown the pinned 17/34/43) runs only via `--fixture`, double-run asserted byte-identical in `test/benchmark-runner.test.mjs`. Two eval cases (`capacity-eviction`, `budget-trim-partial`) run on isolated stores with the injected clock, eval now 10/10. Known parity gaps deliberately NOT touched (documented follow-ups, behavior-changing on the crown-jewel recall surface): Postgres recall weights 2.0/0.5 vs in-memory 1.0/0.25, in-memory lacks recency/useCount recall terms, Postgres vector term is unclamped (can go negative) while in-memory clamps at 0, and selection-reason wording differs for whitespace-only queries.
- Rationale: The pinned 17-case suite is the repo's stability contract; new capabilities get their own standalone deterministic proof rather than mutating it.
- Status: active.

- Decision: The adversarial review of the strategic-forgetting diff (4 lens-diverse finders → 2 skeptics per finding, several verified by executable repro against dist) confirmed 5 distinct defects, all fixed same-session with 5 regression tests (server 94→99). (1) HIGH: candidate selection via `scopeMatches` (undefined dims = wildcards) included broader user-wide memories that the per-victim `assertScopedRequestNarrowed` then threw on for restricted callers — mid-sweep abort AFTER earlier archives committed, no `capacity_sweep` trace, permanently wedged enforcement, and dry-run/apply divergence. (2) MEDIUM: a project-scoped sweep from an UNRESTRICTED caller silently archived user-wide memories shared by every other project. Both fixed by one rule — eviction eligibility = not-protected AND memory scope at-least-as-narrow-as sweep scope (`memoryScopeWithinSweepScope`: every sweep-named optional dimension must be defined-and-equal on the memory) AND caller mutation authority (try/catch, ScopeGuardError ⇒ ineligible) — computed upfront and identically for dry-run and apply; broader memories still count toward capacity but are never evictable (best-effort, `ineligible_count` in trace metadata). (3) MEDIUM: race-skipped victims were reported as retained (`retained_count` > capacity; trace claimed "Retained within capacity" about a concurrently-invalidated memory) — skipped victims now tracked explicitly, excluded from retained, traced under ignored with a `Skipped by the capacity sweep` reason + `skipped_count`. (4) MEDIUM: capacity archive had no `expectedStatus` guard, so a cross-process race on shared Postgres could overwrite a concurrent invalidate — archives now carry `expectedStatus:"active"` and treat `MemoryMutationPreconditionError` as a skip. (5) LOW×2: the `scopes` schema description said "ignored for per-memory modes" while superRefine rejects it (description now says "rejected", validation unchanged — silently ignoring `dry_run` on a mutating call would be worse); `enforceTokenBudget` could emit duplicate trace ids when an LLM provider echoes an id in both selected and ignored lists (final ignored list now drops provider entries whose id is retained or server-trimmed — server outcome wins).
- Rationale: The green suite (94 server tests at the time) missed all five: the eligibility bugs need a restricted caller + broader-scope memory combination no test seeded, the accounting bugs need an interleaved race, and the schema/dedupe bugs need adversarial inputs. Same lesson as fb2adfd: adversarially-verified review before merge is the standard for engine changes.
- Status: active.
