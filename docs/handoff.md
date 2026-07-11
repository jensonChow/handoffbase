# Current Handoff

Updated: 2026-07-10 (end of Qwen-semantic-recall + benchmark-harness + dashboard-fix session)

## Outcome

This session shipped five commits to `main` (all CI-green) that close the two
highest-leverage "path to win" gaps (Qwen invisible; no benchmark harness) and
fix a real flagship-UI bug found during a product-completeness assessment. No
dataset was downloaded, no paid Qwen/OpenAI call was made, no cloud mutation,
Docker restart, or repo-visibility change was performed.

Commits (newest first):

- `a5943c8` fix(dashboard): bind global fetch so the Memory Vault works in a browser
- `de24716` feat(bench): OpenAI GPT-4o reader and judge for LongMemEval
- `f3554a2` feat(bench): one-command LongMemEval comparison orchestrator
- `4c1dea6` feat(bench): LongMemEval QA scorer + Qwen semantic recall in the loop
- `eff14d8` feat: Qwen-backed semantic recall via embedding provider

`HEAD = origin/main = a5943c8`, working tree clean, latest CI run `success`.

## What The Product Is Now

HandoffBase is an MCP-native, cross-session/cross-host memory-handoff layer:
9 tools, 9 `memory://` resources, 4 prompts over one Remote Streamable HTTP
`/mcp` endpoint, a caller-scoped `ContinuityMemoryService`, governed lifecycle
(pending/supersede/expire/hard-delete+tombstone/conflict/feedback), an
authenticated Next.js Memory Vault, and selectable in-memory or Postgres/pgvector
storage. Reasoning is isolated behind `MemoryReasoningProvider` (Qwen or Mock).

New this session:

- **Semantic recall.** `packages/memory-core/src/embeddings/` adds an
  `EmbeddingProvider` (`QwenEmbeddingProvider`, default `text-embedding-v4` @
  1536 dims to match the `vector(1536)` column; deterministic
  `MockEmbeddingProvider`) + `cosineSimilarity`. The service embeds on write
  (`remember`/`reflect`) and on query (`recall`/`continuity_bootstrap`),
  best-effort so an embedding failure never fails a write. In-memory store
  blends cosine into ranking; Postgres pgvector recall receives the query
  embedding via `MemoryRecallQuery.queryEmbedding`. **Default OFF** (Qwen when
  credentials exist, else lexical; `HANDOFFBASE_EMBEDDINGS=mock|off` overrides),
  so the deterministic 17/17 benchmark and credential-free CI are unchanged.
  `embeddingMode` (qwen/mock/none) is surfaced in `getRuntimeInfo()` and `/health`.
- **LongMemEval QA scorer + orchestrator.** The adapter already emitted
  `hypotheses.jsonl`; now `benchmarks/longmemeval/scorer.mjs`
  (`npm run bench:longmemeval:score`) judges them into overall / per-type /
  answered-vs-abstention accuracy, and `compare.mjs`
  (`npm run bench:longmemeval:compare`) runs all backends + scores + writes a
  markdown comparison table under the output dir (never a tracked doc). Judges:
  `deterministic` (CI), `qwen` (qwen-max), `openai` (gpt-4o). `--reader openai`
  and `--embeddings off|mock|qwen` are also wired. Every artifact is stamped
  `official_qa_evaluator: false`.
- **Dashboard browser fix.** The browser client stored a bare `fetch` reference
  and called it as a method → "Illegal invocation" in a real browser on the
  default server-in-memory path; Node tolerated it so all tests + CI were green
  over it. Fixed + regression-tested; **verified live in a browser** (Memory
  Vault renders with seeded data, all tabs, no console errors).

It remains a functional open-source memory-infrastructure MVP, not production
SaaS. The historical Alibaba proof is still `authMode=api_key` /
`providerMode=qwen` / `storeMode=in-memory` and predates the current build.

## Product-Completeness Verdict (code-grounded, 2026-07-10)

- **Credible hackathon submission: YES** — core loop real and passing, cross-host
  continuity proven over the wire, memory-on-vs-off benchmark, demoable offline.
- **Star / adoptable OSS repo: NOT YET** — see gaps below.
- **Production: NO** — in-memory default with no demonstrated restart-survival,
  Postgres only tested vs a fake client, no rate-limit/backup/TLS, ECS stopped.
  (Honestly not claimed.)

## Validation

Final `npm run check`, with Qwen credentials cleared: passed end to end. Suite
totals: memory-core 46, auth 9, runtime 26, server 79, dashboard 33, memory eval
8/8, comparative benchmark HandoffBase 17/17 vs no-memory 0/17 (34/34
expectations), LongMemEval tiny 9/9 (official-evaluator=not-run), cross-host E2E
1/1, markdown links pass, tracked-secret scan pass. Live dashboard render
confirmed in a browser (default `server_in_memory` HTTP mode). No paid Qwen/OpenAI
call; the embedding/reader/judge HTTP paths are unit-tested with injected fetch.

## Benchmark Truth

The canonical local comparative result is unchanged and remains synthetic
deterministic regression evidence, not an official score: HandoffBase 17/17,
no-memory 0/17, 34/34 expectations. The new LongMemEval scorer/orchestrator can
produce a real, comparable QA number, but **the real headline run has not been
done** — it needs the owner to (1) download LongMemEval-S (500 questions, ~115k
tokens each) and (2) export `DASHSCOPE_API_KEY` (and `OPENAI_API_KEY` for the
gpt-4o judge). Sourced cost (`BENCHMARK-COST.md`, kept outside the repo): full
500×3 ≈ $7 (no ceiling) to $30 (with the full-context ceiling); gpt-4o judge adds
only ~$0.01/question; the free 1M Qwen tokens cover ~1.7%; the real constraint is
wall-clock (~26k API calls). Recommended: prove on a stratified ~100–150 subset,
headline config `--reader qwen --embeddings qwen --judge openai`, ceiling on a
subset only.

## Remaining Work

Star-OSS gaps (no API keys needed, highest adoption leverage):

1. Zero visual/adoption assets — no README hero, screenshot, GIF, badges,
   `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`. (A live dashboard screenshot was
   captured this session and can seed this.)
2. No connect recipe for Claude Code (`claude mcp add --transport http …`) or
   Cursor (`.cursor/mcp.json`); `examples/mcp/` ships Codex only.
3. No reproducible path uses real Qwen — everything defaults to mock; semantic
   recall is wired but never run live.
4. "Does it learn" has no cold-vs-warm learning-curve artifact; 17/17-vs-0/17 is
   a structural floor, not a measured quality delta.

Ops / owner-only:

- Make the GitHub repo public (history secret-scan was clean this session across
  all 636 blobs / 89 commits / 24 branches; `.env.hackathon.local` never
  committed). Add the URL to Devpost under Track 1.
- Record the two demo videos (main ~3 min + Alibaba proof ~60s); scripts exist
  in `docs/submission/`.
- If a live endpoint is required: rebuild ECS from current HEAD (do NOT restart
  the stale image `b565210` — it exposes 7 tools and would fail
  `mcp:validate-remote`, which asserts the current 9-tool manifest); revalidate.
- Real LongMemEval run (see Benchmark Truth).

Production follow-ups (unchanged from prior handoff): cross-record Postgres unit
of work for multi-memory conflict resolution; process-crash-atomic feedback for
third-party stores; bounded ignored-lock sample in Postgres recall; durable cloud
Postgres + TLS/monitoring/backup/rate-limiting.

## Next Priority

Recommended next step is the **adoption layer** (README hero rewrite + commit the
dashboard screenshot + badges + `CONTRIBUTING.md` + Claude Code/Cursor connect
recipes) — the biggest lever on "star OSS," needs no credentials — then **one
real-signal artifact** (a live-embedding semantic-recall run OR a cold-vs-warm
learning demo) to move the headline claim from asserted to demonstrated.

Do not claim an official benchmark score, durable cloud proof, live public
endpoint, or production SaaS readiness from current local evidence. Keep the
judge labeled as a non-official independent reimplementation.

## Next Session Prompt

```text
Read agent.md, all memory/*.md files, docs/handoff.md, README.md,
docs/product-completeness.md, docs/benchmarks.md, package.json, src/http.ts,
src/services/continuity-memory-service.ts, packages/memory-core/src/embeddings/,
packages/memory-core/src/in-memory-store.ts, benchmarks/longmemeval/, and
apps/dashboard/src/lib/memory-client.ts before changing product behavior.

Current: HEAD a5943c8 on main, clean, CI green. Semantic recall (Qwen
embeddings, default off), LongMemEval scorer + compare orchestrator (+gpt-4o
judge/reader), and a verified dashboard browser fix all landed this session.

Preserve: the nine-tool contract; embeddings default-off so the deterministic
17/17 + credential-free CI never change; every benchmark score labeled
`official_qa_evaluator: false` (independent reimpl, not the official GPT-4o
evaluator); honest historical Alibaba proof; credential-free mock/in-memory
defaults. Do not run paid Qwen/OpenAI, download the official dataset, mutate
cloud, restart Docker, or change repo visibility without the required
inputs/authorization.

Highest-value next work: the adoption layer (README hero, dashboard screenshot,
badges, CONTRIBUTING, Claude Code/Cursor connect recipes) and one real-signal
artifact (live-embedding recall or cold-vs-warm learning demo).
```
