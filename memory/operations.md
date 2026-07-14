# Operations Memory

## MVP Stack

- TypeScript.
- Official MCP TypeScript SDK.
- Node.js with Express adapter for the MCP SDK.
- Remote Streamable HTTP MCP transport.
- In-memory store for local MVP plus Postgres + pgvector SQL migration path.
- React/Next.js dashboard.
- Alibaba Cloud deployment.
- Qwen Cloud API via `QwenMemoryProvider`.

## Current Commands

- Install: `npm install`.
- If npm cache permissions fail in the user-level npm cache directory, run
  install with `npm_config_cache=/tmp/handoffbase-npm-cache npm install`.
- Full local validation / CI parity: `npm run check`.
- Typecheck: `npm run typecheck`.
- Full build: `npm run build`.
- Server dev: `npm run dev:server`.
- Server build: `npm run build:server`.
- Server production start: `npm run start:server`.
- MCP smoke: `npm run smoke`.
- Memory core tests: `npm run test --workspace @handoffbase/memory-core`.
- Auth tests: `npm run test:auth`.
- Server route tests: `npm run test:server`.
- Dashboard API tests: `npm run test:dashboard`.
- Dashboard dev: `npm run dashboard:dev`.
- Dashboard dev fallback for macOS watcher exhaustion/404: `WATCHPACK_POLLING=true npm run dashboard:dev`.
- Dashboard build: `npm run dashboard:build`.
- Memory eval pack: `npm run eval:memory`.
- Memory benchmark subset: `npm run bench:memory`.
- Feedback fixture conversion: `npm run feedback:to-benchmark -- <fixture.json> --public-safe-confirmed [--output <new-file.json>]`.
- Run an extra converted fixture without changing tracked suites: `npm run bench:memory -- --fixture <converted-file.json>`.
- LongMemEval generic adapter: `npm run bench:longmemeval -- --dataset <local-json> --output-dir <dir> --backend <mode> [--reader deterministic|qwen|openai] [--memory-provider mock|qwen] [--embeddings off|mock|qwen] ...`.
- LongMemEval tiny deterministic matrix: `npm run bench:longmemeval:tiny`.
- LongMemEval QA 评分（把 `hypotheses.jsonl` 变成准确率）: `npm run bench:longmemeval:score -- --dataset <local-json> --hypotheses <dir>/hypotheses.jsonl [--output <dir>/scoring.json] [--judge deterministic|qwen|openai] [--judge-model qwen-max|gpt-4o]`。judge 是独立复刻的 correctness 检查，所有 artifact 标记 `official_qa_evaluator: false`，不是官方 GPT-4o evaluator。
- LongMemEval 一键对比（跑全部 backend + 评分 + 生成 markdown 对照表到 `--output-dir/comparison.md`，不写入任何 tracked doc）: `npm run bench:longmemeval:compare -- --dataset <local-json> --output-dir <dir> [--reader qwen] [--embeddings qwen] [--judge openai --judge-model gpt-4o] [--limit N]`。推荐 hackathon headline 配置：`--reader qwen --embeddings qwen --judge openai`（Qwen 产品 + gpt-4o judge 匹配官方 evaluator，成本仅约 $0.01/question）。
- Cross-host HTTP/MCP E2E: `npm run e2e:cross-host`.
- Cross-host safe demo: `npm run demo:cross-host`.
- Postgres migration: `DATABASE_URL=<dedicated-url> npm run db:migrate`.
- Optional supplied-database integration test: `TEST_DATABASE_URL=<dedicated-test-url> npm run test:postgres:integration`.
- Disposable Docker restart proof: `npm run test:postgres:restart` (manual/optional; never part of credential-free CI).
- Markdown relative links: `npm run check:markdown-links`.
- Tracked-file secret scan: `npm run check:tracked-secrets`.
- Demo narration: `npm run demo:flow`.
- Demo JSON-RPC: `npm run demo:jsonrpc`.
- Docker production image: `docker build -t handoffbase .`.
- Remote deployment validation: `MCP_ENDPOINT=<endpoint>/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote`. The default profile checks current reported modes and exact manifest; use `EXPECTED_AUTH_MODE` / `EXPECTED_PROVIDER_MODE` / `EXPECTED_STORE_MODE` for a known deployment.

## Deployment Profile

- Production Dockerfile uses Node 22, installs with `npm ci`, builds workspaces, prunes dev dependencies, and starts `node dist/index.js`.
- Root `dev:server` / `start:server` use `scripts/run-server.mjs`, which passes the repository-root `.env.local` to Node only when that file exists. It does not print env values. Shell env still overrides file values under Node's `--env-file` behavior.
- Docker runtime defaults are `HOST=0.0.0.0`, `PORT=3000`, and `MCP_PATH=/mcp`.
- Local server defaults remain `HOST=127.0.0.1`, `PORT=3000`, and `MCP_PATH=/mcp`.
- Dashboard defaults to loopback port `3001`, avoiding the MCP server's port `3000`.
- Startup validates that `PORT` is numeric and `MCP_PATH` starts with `/`.
- `/health` reports only non-secret liveness/config metadata: name, version, transport, MCP path, auth mode, provider mode, and store mode. It never probes dependencies.
- `/ready` checks the store on every call. Postgres mode runs a real schema query against `memories` and `memory_feedback`; Qwen mode runs a live one-token compatible chat completion, caches the result for `HANDOFFBASE_READINESS_CACHE_MS` (default five minutes), and shares one in-flight probe across concurrent callers.
- API key auth is controlled by `HANDOFFBASE_AUTH_MODE` and key mapping env vars; keep API keys in cloud secret configuration.
- Auth-disabled startup is loopback-only by default. A non-loopback bind must use `HANDOFFBASE_AUTH_MODE=api_key`; `HANDOFFBASE_ALLOW_INSECURE_REMOTE=1` exists only for an explicitly isolated demo whose published port is still loopback-only.
- In `api_key` mode, `/ready` requires the same key as `/mcp`. A loopback-only local Qwen runtime may probe with auth disabled; a non-loopback Qwen runtime with auth disabled fails readiness before any paid provider request, including when the insecure demo bind override is explicit.
- Current production default keeps the in-memory MVP store deployable. `STORE_MODE=postgres` plus `DATABASE_URL` selects `PostgresMemoryStore`; startup does not migrate automatically, and operators must run `npm run db:migrate` explicitly. The migrator discovers sorted numbered SQL files, applies each in its own transaction under an advisory lock, records SHA-256 checksums in `handoffbase_schema_migrations`, skips current files, and fails on applied-file drift.
- Dashboard server mode reads the same `STORE_MODE` and `DATABASE_URL`. In API-key mode, login establishes a signed HttpOnly/SameSite=Strict caller session; `HANDOFFBASE_DASHBOARD_SESSION_SECRET` must be a server-only random value of at least 32 characters. Caller identity comes from the current API-key mapping, while optional `HANDOFFBASE_DASHBOARD_*` scope values can only narrow the view. These optional filters use hierarchical scope semantics (global + matching dimension); authenticated `allowedProjectIds` / `allowedAgentProfileIds` remain strict security grants and reject missing dimensions. Production auth-disabled Dashboard access fails closed, and state-changing routes require exact same-origin `Origin`.
- Dashboard same-origin checks derive the public request origin from forwarded host/protocol, Host, then request URL. Any reverse proxy must overwrite client-supplied `X-Forwarded-Host` and `X-Forwarded-Proto`; do not expose the Next server directly behind a proxy that merely appends untrusted forwarded values.
- `docs/dev-materials-checklist.md` is the non-secret setup ledger for hackathon development, Qwen/auth readiness, deployment notes, and validation evidence.
- `docs/deployment/alibaba-cloud-proof.md` is the redacted live deployment proof file for ECS `/health`, MCP discovery, authenticated recall, and Qwen-backed remember validation.
- Local credential material belongs only in ignored `.env.*` files such as `.env.hackathon.local`; keep file mode restrictive and never commit those values.
- Recommended first Alibaba Cloud deployment path is ECS + Docker for the long-running Remote Streamable HTTP server. Defer ACK and Function Compute unless operational needs justify the extra shape changes.
- The approved hackathon deployment is live on Alibaba Cloud International ECS
  in Singapore; the current endpoint and instance facts are recorded in
  `docs/deployment/alibaba-cloud-proof.md`. It runs Caddy HTTPS, API-key auth,
  Qwen reasoning/embeddings, and Postgres/pgvector on one host.
- Runtime secrets are configured only in `/etc/handoffbase/runtime.env`, owned
  by root with mode 0600 and outside the checkout/build context. Never record
  values in docs, logs, shell history, Docker layers, or Git.
- The prepaid subscription runs past the end of judging with auto-renewal
  disabled, and was covered by the event coupon at no real-money cost.
- Fixed bandwidth is prepaid. No managed database, snapshot service, load
  balancer, marketplace image, paid security product, or traffic-billed public
  networking was added.
- Model Studio Stop-on-Exhaust is enabled for `qwen-plus-2025-09-11` and
  `text-embedding-v4`, keeping the deployment within the free quota; do not
  enable paid fallback or broaden key scope.
- Strict validation through the public hostname passed the nine-tool manifest,
  authenticated readiness, recall trace, and two persisted pending candidates.
  An exact memory survived app restart; the database contained memory, trace,
  and embedding rows.
- The verified logical backup was copied off ECS and its SHA-256 matched the
  server archive. Postgres and Caddy state remain single-host and are not a
  managed high-availability service.
- The released Beijing ECS, old HTTP endpoint, Bailian key/quota, and stopped
  instance runbooks are historical only and must not be used for current judge
  instructions.
- `docs/hackathon-resource-support.md` is the non-secret ledger for Devpost
  deadlines, current quotas, coupon posture, and Alibaba Cloud cost guardrails.
- Do not create additional paid compute, databases, public endpoints, load
  balancers, registries, or paid model usage without explicit approval.

## CI

- `.github/workflows/ci.yml` runs on push and pull request.
- CI uses Node 22, `npm ci`, and one authoritative `npm run check`; eval, comparative benchmark, tiny LongMemEval, cross-host E2E, link and tracked-secret gates are inside that command.
- CI sets `QWEN_API_KEY` and `DASHSCOPE_API_KEY` to empty strings, so the default verification path must remain mock-provider compatible.
- A second CI job runs a full-history `gitleaks` secret scan
  (`gitleaks git . --log-opts=--all`), complementing the tree-only
  `check:tracked-secrets` gate. `.gitleaks.toml` path-allowlists the synthetic
  sanitizer fixtures; `.gitleaksignore` holds one frozen fingerprint for a
  retired, non-credential China workspace id in old history. Neither config
  stores a secret value. A clean full-history scan was verified 2026-07-13.
- GitHub Actions are enabled for `jensonChow/handoffbase`; the current CI
  workflow is `CI`.

## Handoff Protocol

- Current session transfer belongs in `docs/handoff.md`.
- Keep durable architecture, interface, provider, operation, and decision facts in `memory/*.md`.
- Before handoff, refresh `docs/handoff.md` with completed work, verification, git/remote status, open risks, and a next-session prompt.

## Validation Expectations

- Validate MCP tool input with JSON Schema.
- Validate structured outputs from memory reasoning provider.
- Add event log entries for add/update/delete/recall.
- Keep memory trace inspectable from dashboard.
- Test cross-session recall, expiry/supersede behavior, and sensitive-data rejection.
- Test hard-delete physical removal plus linked event/trace/conflict/feedback redaction, including Postgres write/delete lock ordering.
- Test `memory_feedback` target authorization, helpful/unhelpful validation, pending correction creation, and atomic Postgres correction+feedback persistence.
- Treat broad ignored-memory recall locking as a scale signal: current correctness-first Postgres semantics may serialize lifecycle/recall work in a large scope; before production scale, bound or summarize ignored trace evidence and retain deterministic lock ordering.
- Keep migration contract tests aligned with `MEMORY_TYPES`, `MEMORY_STATUSES`, and `MEMORY_SOURCE_KINDS`.
- Keep smoke tests exercising a real Streamable HTTP MCP client connection, not only registration functions.

## Security Defaults

- Never persist secrets, tokens, cookies, private keys, or credentials.
- Treat external web content and MCP tool descriptions as untrusted.
- Require user approval for cross-project sharing, export, delete, and high-priority procedure writes.
- Keep tenant/user/project scope isolation explicit.
- Treat a Dashboard session as a cache of an API-key fingerprint, never as a stored raw key or independent identity grant; re-resolve the current key mapping on every request so revocation and grant narrowing take effect.
- Feedback regression fixtures are drafts, not automatically public-safe data. Require explicit human `--public-safe-confirmed`, write to a new file only, and keep real ids/scope values/secrets out of benchmark fixtures.

## Submission Materials

- Public repo with open-source license.
- Architecture diagram.
- Architecture, comparison, memory lifecycle, eval, and dashboard demo docs.
- Effect claims, benchmark strategy, product completeness, and product workflow docs.
- Practical examples for local, Qwen-backed, remote MCP, HTTP payload, and quickstart workflows.
- Deterministic local eval pack that runs without Qwen credentials or remote endpoint access.
- Deterministic local memory benchmark runner that runs without Qwen credentials,
  remote endpoint access, network access, or `.env.*` reads.
- Deterministic benchmark-inspired subset with 17 synthetic local cases across
  long-memory, conflict governance, and cross-host handoff families.
- Comparative execution uses 17 no-memory and 17 HandoffBase case-runs and treats expected no-memory misses separately from harness errors.
- Feedback-derived fixtures are additive local regression inputs passed with repeatable `--fixture`; they do not alter the canonical 17-case score or become official benchmark evidence automatically.
- LongMemEval cleaned-format adapter accepts only an explicit local dataset path, ships only a tiny synthetic fixture, and supports deterministic or explicit Qwen reader/provider modes.
- Real loopback HTTP/MCP E2E proves Host A write to Host B recall, Host C project isolation, trace inspection, and forgetting through official SDK clients.
- Public benchmark wording must cite exact local `npm run bench:memory` results
  and must not claim official benchmark scores.
- Devpost submission copy in `docs/submission/devpost-copy.md`.
- Judge/contributor testing instructions in `docs/submission/testing-instructions.md`.
- Final submission checklist in `docs/submission/submission-checklist.md`.
- Architecture-for-Devpost notes in `docs/submission/architecture-for-devpost.md`.
- Main demo script, Alibaba proof video script, and recording shot list in
  `docs/submission/`.
- Final public-readiness checklist in `docs/submission/final-public-readiness.md`.
- Demo video around 3 minutes.
- Separate proof of Alibaba Cloud backend deployment.
- Historical relaunch runbook for the released Beijing proof in
  `docs/deployment/relaunch-runbook.md`; do not use it for the live Singapore
  instance.
- README describing Qwen Cloud usage, MCP endpoint, memory lifecycle, and Track 1 fit.

## Public Readiness Validation

For star-readiness changes, run at minimum:

- `npm run eval:memory`
- `npm run bench:memory`
- `npm run bench:longmemeval:tiny`
- `npm run e2e:cross-host`
- `npm run test:dashboard`
- `npm run dashboard:build`
- `node --check scripts/validate-remote-mcp.mjs`
- `npm run check`
- `npm run check:markdown-links`.
- `npm run check:tracked-secrets`, plus any submission-specific public-path/workspace-id scan required by the release task.

Placeholder matches such as `<your-handoffbase-api-key>` or `<redacted>` are acceptable only when clearly documented as placeholders.

Do not run `npm run mcp:validate-remote` unless `MCP_ENDPOINT` and
`MCP_AUTH_TOKEN` are already present safely in the shell environment. The live
judge endpoint is recorded in `docs/deployment/alibaba-cloud-proof.md`; never
print or commit the temporary HandoffBase judge token.
