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
- Dashboard build: `npm run dashboard:build`.
- Memory eval pack: `npm run eval:memory`.
- Demo narration: `npm run demo:flow`.
- Demo JSON-RPC: `npm run demo:jsonrpc`.
- Docker production image: `docker build -t handoffbase .`.
- Remote deployment validation: `MCP_ENDPOINT=<endpoint>/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote`.

## Deployment Profile

- Production Dockerfile uses Node 22, installs with `npm ci`, builds workspaces, prunes dev dependencies, and starts `node dist/index.js`.
- Docker runtime defaults are `HOST=0.0.0.0`, `PORT=3000`, and `MCP_PATH=/mcp`.
- Local server defaults remain `HOST=127.0.0.1`, `PORT=3000`, and `MCP_PATH=/mcp`.
- Startup validates that `PORT` is numeric and `MCP_PATH` starts with `/`.
- `/health` reports only non-secret metadata: name, version, transport, MCP path, auth mode, provider mode, and store mode.
- API key auth is controlled by `HANDOFFBASE_AUTH_MODE` and key mapping env vars; keep API keys in cloud secret configuration.
- Current production default keeps the in-memory MVP store deployable. `PostgresMemoryStore` supports CRUD, recall, traces, events, embeddings, and conflicts, but env-based runtime selection remains future work.
- `docs/dev-materials-checklist.md` is the non-secret setup ledger for hackathon development, Qwen/auth readiness, deployment notes, and validation evidence.
- `docs/deployment/alibaba-cloud-proof.md` is the redacted live deployment proof file for ECS `/health`, MCP discovery, authenticated recall, and Qwen-backed remember validation.
- Local credential material belongs only in ignored `.env.*` files such as `.env.hackathon.local`; keep file mode restrictive and never commit those values.
- Recommended first Alibaba Cloud deployment path is ECS + Docker for the long-running Remote Streamable HTTP server. Defer ACK and Function Compute unless operational needs justify the extra shape changes.
- The approved hackathon deployment is currently paused: the Alibaba Cloud ECS
  instance in `cn-beijing` was stopped in economical stop mode on
  2026-07-08T10:05:41Z after explicit user approval. The instance was not
  released.
- Last running public demo endpoint: `http://123.56.244.157`; last MCP endpoint:
  `http://123.56.244.157/mcp`. The stopped instance currently shows no public IP,
  so recheck the IP after restart.
- Last live `/health` validation before stop passed with `authMode=api_key`,
  `providerMode=qwen`, and `storeMode=in-memory`.
- Last live remote MCP validation before stop passed: `tools/list` returned
  7 tools, `memory_recall` returned 5 memories with a trace id, and Qwen-backed
  `memory_remember` returned 2 pending candidate memories.
- Runtime secrets are configured only in the root-owned ECS env file consumed by Docker `--env-file`; do not record values in docs, logs, shell history, Docker layers, or Git.
- Do not create additional paid compute, public endpoints, registries with billable storage or egress, load balancers, databases, or paid model usage without explicit approval.
- Restart the stopped ECS instance around July 17-18 for final submission
  validation, then stop or release the pay-as-you-go ECS instance after the
  approved hackathon demo window.
- Postgres provisioning remains prepare-only until the target Alibaba PostgreSQL service/version is verified for pgvector or compatible vector extension support and runtime `STORE_MODE=postgres` wiring is added.
- `docs/hackathon-resource-support.md` is the non-secret ledger for Devpost
  deadlines, Qwen Free Tier status, coupon/voucher request state, and Alibaba
  Cloud cost guardrails.
- As of 2026-07-08, the Qwen coupon/voucher request is submitted and pending
  registration verification; activation is expected by email after review. Keep
  UID, phone, Gmail address, voucher/coupon code, and account identifiers out of
  tracked files.
- The best-effort cost sweep found the approved pay-as-you-go ECS demo and no
  visible unexpected RDS/PolarDB, ACK, load balancer, NAT Gateway, OSS bucket,
  Log Service project, or paid Container Registry Enterprise instance. Resource
  Center was not enabled, so a full inventory and budget alerts still require
  user approval for the free Resource Center role/notification setup.
- As of 2026-07-08T10:05:41Z, the cost-runway check and approved stop action
  found the ECS demo stopped in economical stop mode on `ecs.e-c1m1.large` in
  `cn-beijing`, with a 40 GiB ESSD Entry system disk retained. Billing pages did
  not render exact balance or ECS bill details. The pre-stop planning estimate
  was 4-5 RMB/day while running; after stop, compute/memory billing is paused but
  disk and any retained attached-resource billing continues. Restart around
  July 17-18 using `docs/cloud-cost-runbook.md`.
- The same check confirmed Bailian fee overview showed `¥0` model-platform
  spend, `qwen-plus-2025-07-28` still had 1,000,000 / 1,000,000 free tokens
  remaining with free-quota-only enabled, and the ECS snapshot page showed
  snapshot service was not opened.

## CI

- `.github/workflows/ci.yml` runs on push and pull request.
- CI uses Node 22, `npm ci`, and `npm run check`.
- CI sets `QWEN_API_KEY` and `DASHSCOPE_API_KEY` to empty strings, so the default verification path must remain mock-provider compatible.
- GitHub Actions are enabled for `jensonChow/handoffbase`; the current CI workflow is `CI`.

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
- Keep migration contract tests aligned with `MEMORY_TYPES`, `MEMORY_STATUSES`, and `MEMORY_SOURCE_KINDS`.
- Keep smoke tests exercising a real Streamable HTTP MCP client connection, not only registration functions.

## Security Defaults

- Never persist secrets, tokens, cookies, private keys, or credentials.
- Treat external web content and MCP tool descriptions as untrusted.
- Require user approval for cross-project sharing, export, delete, and high-priority procedure writes.
- Keep tenant/user/project scope isolation explicit.

## Submission Materials

- Public repo with open-source license.
- Architecture diagram.
- Architecture, comparison, memory lifecycle, eval, and dashboard demo docs.
- Practical examples for local, Qwen-backed, remote MCP, HTTP payload, and quickstart workflows.
- Deterministic local eval pack that runs without Qwen credentials or remote endpoint access.
- Final public-readiness checklist in `docs/submission/final-public-readiness.md`.
- Demo video around 3 minutes.
- Separate proof of Alibaba Cloud backend deployment.
- README describing Qwen Cloud usage, MCP endpoint, memory lifecycle, and Track 1 fit.

## Public Readiness Validation

For star-readiness changes, run at minimum:

- `npm run eval:memory`
- `npm run test:dashboard`
- `npm run dashboard:build`
- `node --check scripts/validate-remote-mcp.mjs`
- `npm run check`
- tracked-file public-readiness scans for Qwen/DashScope/HandoffBase tokens, database URLs, local workstation paths, and workspace ids.

Placeholder matches such as `<your-handoffbase-api-key>` or `<redacted>` are acceptable only when clearly documented as placeholders.
