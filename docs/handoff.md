# Current Handoff

Updated: 2026-07-10 (later "focus on the product" session — product correctness
review + fixes, then the adoption layer)

## Outcome

This session did an adversarially-verified correctness review of the actual
product code and fixed everything that survived, then shipped a credential-free
adoption layer. Two commits landed on `main` **locally** (HEAD `cf36ddf`), which
is **2 commits ahead of `origin/main` (`61edd32`) and has NOT been pushed**.
Working tree clean; `npm run check` green end to end. No dataset download, no
paid Qwen/OpenAI call, no cloud mutation, Docker restart, repo-visibility, or
push was performed.

Commits (newest first):

- `cf36ddf` docs: add adoption layer (connect recipes, community health, vault visual)
- `fb2adfd` fix(security): close api-key auth bypass and verified store/service bugs

## What Shipped

### `fb2adfd` — 1 HIGH security bug + 9 verified correctness bugs (with 12 tests)

Method: a 2-phase Workflow (6 finders across service/stores/lifecycle/embeddings/
MCP-auth → 2 independent skeptics per finding, refute-by-default). 16 raw findings
→ 10 confirmed (2/2 votes) → all fixed. Each fix has a credential-free regression
test traced to fail without it.

- **Cross-tenant auth bypass (HIGH).** `src/auth/request.ts` looked callers up
  with `config.apiKeys[apiKey]` on a plain (prototyped) object, so
  `Bearer constructor` / `__proto__` / `toString` / `valueOf` resolved to a
  truthy `Object.prototype` member → a caller with `tenantId`/`userId` undefined,
  which `scopeMatches` treats as "match everything" → any unauthenticated request
  could read **every tenant's** memories in `api_key` mode. Fixed with
  `Object.hasOwn` + a null-prototype `apiKeys` map (`src/auth/config.ts`) +
  tenant/user validation. Proven at runtime.
- **Sanitizer fail-open (MED).** credential/token redaction now matches
  JSON-quoted keys (`{"password":"…"}`, quote between key and `:`), in both
  `reasoning/structured-output.ts` and `sensitive.ts`.
- **Sanitizer over-redaction (MED).** the phone regex no longer eats ISO dates
  (`2024-01-15`) or dotted version strings into `[REDACTED_PHONE]`.
- **Postgres parity (MED ×3).** default `listMemories` now hides explicit
  `status='expired'` rows (effective-status, matching in-memory); a defined-but-
  empty `types/statuses/signals/conflictTypes` array matches nothing (not
  everything) across the list builders; the pgvector distance is guarded by
  `vector_dims` so a wrong-dimension query embedding degrades to 0 instead of
  aborting the recall transaction.
- **Service (MED ×2 + LOW ×1).** feedback scope-compat uses narrowing semantics
  so a session/tool-scoped memory can be paired with a run; `continuity_bootstrap`
  respects a token budget too small for any memory (was dumping every recalled
  memory); `memory_update` rejects the reserved `deleted`/`superseded` statuses
  (would bypass hard-delete redaction / throw a raw validation 500).

Two LOW findings deliberately deferred: `reflect` over-reports `invalidated_memories`
ids it did not actually invalidate; `recall` `limit<=0` throws in Postgres but is
coerced in-memory.

### `cf36ddf` — adoption layer (credential-free)

- `examples/mcp/`: README rewritten for Codex + Claude Code + Cursor; added
  `claude-code.mcp.json` (`.mcp.json`, `type:"http"`) and `cursor-mcp.json`
  (`.cursor/mcp.json`). Tokens stay in env vars via `${VAR}` expansion.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`,
  `.github/PULL_REQUEST_TEMPLATE.md`. Security reports route to GitHub private
  advisories; no personal email is published.
- `docs/assets/memory-vault.svg`: a theme-accurate Memory Vault visual built from
  the real seeded `server_in_memory` demo state (verified live at `:3001`). It is
  a hand-built SVG, **not** a raster screenshot — no headless browser was
  available to capture a committable PNG.

## Validation

Final `npm run check` (Qwen credentials cleared) passed end to end:
memory-core **54**, auth **10**, runtime 26, server **82**, dashboard 33, memory
eval 8/8, comparative benchmark HandoffBase 17/17 vs no-memory 0/17, LongMemEval
tiny 9/9 (`official_qa_evaluator=not-run`), cross-host E2E 1/1, markdown links
pass (54 files / 73 links), tracked-secret scan pass. 12 new regression tests
added (auth prototype-pollution; JSON-quoted-secret + date-preservation
sanitizer; Postgres list-builder + vector-dim-guard; feedback session-scope;
bootstrap budget; `memory_update` reserved-status). No paid Qwen/OpenAI call.

## Product-Completeness Verdict (code-grounded, 2026-07-10)

- **Credible hackathon submission: YES** — unchanged, now with a hardened auth
  boundary and real store-parity test coverage.
- **Star / adoptable OSS repo: CLOSER** — connect recipes + community-health
  files landed; still missing README hero + badges + a real raster screenshot/GIF.
- **Production: NO** — unchanged; still in-memory default, ECS stopped, no
  durable cloud Postgres/TLS/backup/rate-limit. (Not claimed.)

## Remaining Work

Star-OSS gaps (no keys needed):

1. README hero + badges (License/CI/Node/MCP) + a real raster screenshot or GIF
   (couldn't produce a committable PNG in-agent — no headless Chrome; the SVG is
   the stand-in). `CONTRIBUTING`/`CoC`/`SECURITY` and Claude Code/Cursor recipes
   are now DONE.
2. No reproducible path uses real Qwen (semantic recall wired but never run live).
3. No cold-vs-warm learning-curve artifact.
4. The two deferred LOW correctness findings above.

Owner-only / ops:

- **Push** `main` to origin (2 local commits ahead; this session did not push).
- Make the GitHub repo public; add the URL to Devpost under Track 1.
- Record the two demo videos (scripts in `docs/submission/`).
- Real LongMemEval run: download LongMemEval-S + export `DASHSCOPE_API_KEY`
  (+ `OPENAI_API_KEY` for the gpt-4o judge), then `bench:longmemeval:compare`.
- If a live endpoint is required: rebuild ECS from current HEAD (do NOT restart
  the stale `b565210` image — it exposes 7 tools and fails `mcp:validate-remote`'s
  9-tool assertion); revalidate.

Production follow-ups (unchanged): cross-record Postgres unit of work for
multi-memory conflict resolution; process-crash-atomic feedback for third-party
stores; bounded ignored-lock sample in Postgres recall; durable cloud Postgres +
TLS/monitoring/backup/rate-limiting.

## Next Priority

The biggest remaining product move is **capacity-bounded strategic forgetting**
(the explicit Track-1 ask, and a genuinely new capability) — bound a scope's
active memory footprint and demonstrate governed eviction + recall within a
limited context window. Otherwise: README hero + badges + a real screenshot, then
one real-signal artifact (live-embedding recall or cold-vs-warm learning).

Do not claim an official benchmark score, durable cloud proof, live public
endpoint, or production SaaS readiness. Keep every judge labeled
`official_qa_evaluator: false`. Do not push, make the repo public, run paid
Qwen/OpenAI, download the official dataset, mutate cloud, or restart Docker
without the required inputs/authorization.

## Next Session Prompt

```text
Read agent.md, all memory/*.md, docs/handoff.md, README.md, package.json,
src/auth/request.ts, src/auth/config.ts, src/services/continuity-memory-service.ts,
packages/memory-core/src/postgres-store.ts, and
packages/memory-core/src/reasoning/structured-output.ts before changing product
behavior.

Current: HEAD cf36ddf on main, clean, CI green — but 2 commits AHEAD of origin
and NOT pushed. This session closed a real HIGH cross-tenant api-key auth bypass
(prototype-chain lookup) + 9 verified store/service correctness bugs (12 new
regression tests, fb2adfd) and shipped the connect-recipe/community-file adoption
layer (cf36ddf).

Preserve: the nine-tool contract; embeddings default-off so the deterministic
17/17 + credential-free CI never change; every benchmark score labeled
official_qa_evaluator:false; honest historical Alibaba proof; credential-free
mock/in-memory defaults; the new invariants now under test (own-property api-key
lookup, JSON-quoted-secret redaction, date-safe phone redaction, Postgres↔in-memory
list/recall parity, memory_update reserved-status guard).

Highest-value next work: capacity-bounded strategic forgetting (Track-1 ask), OR
README hero+badges + a real screenshot, plus one real-signal artifact. Do not
push, make the repo public, run paid Qwen/OpenAI, or mutate cloud without
authorization.
```
