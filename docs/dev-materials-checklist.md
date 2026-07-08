# Development Materials Checklist

Last updated: 2026-07-08T04:45:39Z

This file is the non-secret setup ledger for HandoffBase hackathon development,
local validation, and deployment readiness. Do not add API keys, database URLs,
cloud credentials, cookies, tokens, or other secret values here.

## Local Environment

Status: prepared

- Local secret file: `.env.hackathon.local`
- Git ignore status: covered by `.gitignore` rule `.env.*`
- File mode: `600`
- HandoffBase auth secret: generated and stored locally only
- Node.js: `v22.14.0`
- npm: `10.9.2`
- Dependency install: `node_modules/` already present

## Required Environment Variables

| Variable | Status | Notes |
| --- | --- | --- |
| `HOST` | prepared | Local value set to `127.0.0.1`. Docker should use `0.0.0.0`. |
| `PORT` | prepared | Local hackathon file uses `3333` to avoid the default `3000`. |
| `MCP_PATH` | prepared | `/mcp`. Must start with `/`. |
| `QWEN_API_KEY` or `DASHSCOPE_API_KEY` | prepared | `QWEN_API_KEY` is stored only in `.env.hackathon.local`. |
| `QWEN_BASE_URL` or `DASHSCOPE_BASE_URL` | prepared | OpenAI-compatible base URL is configured only in `.env.hackathon.local`; public docs use the generic host pattern. |
| `QWEN_MODEL` or `DASHSCOPE_MODEL` | prepared | `qwen-plus`. |
| `QWEN_TIMEOUT_MS` | prepared | `30000`. |
| `HANDOFFBASE_AUTH_MODE` | prepared | `api_key`. |
| `HANDOFFBASE_API_KEYS_JSON` | not used locally | Single-key env path is simpler for local hackathon testing. |
| `HANDOFFBASE_API_KEY` | prepared | Strong local random value stored only in `.env.hackathon.local`. |
| `HANDOFFBASE_TENANT_ID` | prepared | `demo-tenant`. |
| `HANDOFFBASE_USER_ID` | prepared | `demo-user`. |
| `HANDOFFBASE_ACTOR_ID` | prepared | `hackathon-dev`. |
| `DATABASE_URL` / `POSTGRES_URL` | future optional | Do not configure until Postgres is provisioned and runtime store selection is wired. |
| `STORE_MODE` | future optional | Current runtime still reports `in-memory`. |
| `NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_CLIENT` | prepared | `mock`. Set to `http` for local Next.js API route testing. |
| `NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_API_BASE_URL` | optional | Blank unless dashboard API is hosted on another origin. |

## Qwen / DashScope Material

Status: prepared locally; live model-call validation passed

- Console inspected: Alibaba Cloud Model Studio / Bailian
- Console URL inspected: `https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key`
- Region observed in console: `cn-beijing` / North China 2 (Beijing)
- Console access: authenticated locally when the key was created; account/session details are not committed
- Workspace/business space: selected locally; exact workspace metadata is not committed
- Workspace ID: stored locally only / redacted from public docs
- API host pattern: `https://{WORKSPACE_ID}.{REGION}.maas.aliyuncs.com/compatible-mode/v1`
- API key label/description: `handoffbase-hackathon-dev`
- API key status: created and stored locally
- Model: `qwen-plus`
- Local storage: `.env.hackathon.local`
- Official key guidance: API keys should be stored in environment variables and must not be exposed
- Official one-time-display warning: new Model Studio API keys may only show the full secret once after creation
- Official OpenAI-compatible base URL guidance:
  - Beijing: `https://{WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
  - Singapore: `https://{WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
  - US Virginia: `https://dashscope-us.aliyuncs.com/compatible-mode/v1`
  - Configured local base URL: stored in `.env.hackathon.local` only

Next manual steps:

1. After the hackathon, rotate or delete the dedicated development key.
2. If future live Qwen validation fails, inspect only redacted error output and rotate/reset the key if needed.

References:

- https://help.aliyun.com/zh/model-studio/get-api-key
- https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions

## HandoffBase Remote Auth Material

Status: prepared

- Auth mode: `api_key`
- Tenant ID: `demo-tenant`
- User ID: `demo-user`
- Local actor ID: `hackathon-dev`
- Cloud actor ID: `hackathon-demo`
- Secret storage: `.env.hackathon.local`
- Secret value: not recorded

## Local Validation

Status: passed for mock-provider, Qwen-config health, and live Qwen-backed MCP validation

Validation to run:

- `npm run check`: passed on 2026-07-07T13:00:19Z
- `npm run check`: passed on 2026-07-07T14:36:36Z after adding the remote validation helper and pending proof template
- `node --check scripts/validate-remote-mcp.mjs`: passed on 2026-07-07T14:36:36Z
- `npm run mcp:validate-remote`: passed on 2026-07-07T16:26Z against the Alibaba Cloud ECS endpoint
- Start local server with `.env.hackathon.local`: passed
- `GET /health`: passed
- MCP tool call with local auth header: passed
- Compiled production server start with `.env.hackathon.local`: passed on 2026-07-07T12:47:09Z
- Qwen-config `/health` mode check: passed; `providerMode` reported `qwen`
- Live Qwen-backed MCP tool call: passed on 2026-07-07T12:57:26Z

Observed safe `/health` fields:

```json
{
  "ok": true,
  "name": "handoffbase-mcp-server",
  "version": "0.1.0",
  "transport": "streamable-http",
  "mcpPath": "/mcp",
  "authMode": "api_key",
  "providerMode": "qwen",
  "storeMode": "in-memory"
}
```

Authenticated MCP call:

- Tool: `memory_recall`
- Payload: `examples/http/payloads/memory-recall-rank-opportunities.json`
- HTTP status: `200 OK`
- Result: returned seeded demo memories and a trace id
- Secret handling: auth key was referenced through `MCP_AUTH_TOKEN`; value was not printed

Compiled production MCP validation:

- Command path: `npm run start:server`
- Tool: `continuity_bootstrap`
- Payload: `examples/http/payloads/continuity-bootstrap-opportunity-scout.json`
- HTTP status: `200 OK`
- Result: returned a context pack and a trace id
- Secret handling: auth key was referenced through `MCP_AUTH_TOKEN`; value was not printed

Live Qwen-backed MCP validation:

- Command path: `npm run start:server`
- Tool: `memory_remember`
- Payload: `examples/http/payloads/memory-remember-preferences.json`
- HTTP status: `200 OK`
- Result: Qwen returned two pending candidate memories
- Secret handling: Qwen key and local auth key were loaded only from
  `.env.hackathon.local`; values were not printed

Remote ECS MCP validation:

- Command path: `npm run mcp:validate-remote`
- Endpoint: `http://123.56.244.157/mcp`
- Authentication: auth token supplied only through `MCP_AUTH_TOKEN`
- `GET /health`: reported `authMode=api_key`, `providerMode=qwen`, and
  `storeMode=in-memory`
- `tools/list`: returned 7 tools
- `memory_recall`: returned 5 memories and a trace id
- `memory_remember`: returned 2 pending candidate memories through the
  Qwen-backed provider path
- Secret handling: HandoffBase auth and Qwen values were not printed or written
  to tracked files

## Alibaba Cloud Deployment Readiness

Status: deployed and validated on Alibaba Cloud ECS

Selected minimal path: ECS + Docker

Reasoning:

- The repository already has a production `Dockerfile`.
- The server is a normal long-running Node.js HTTP service exposing `/health`
  and `/mcp`.
- ECS + Docker is the simplest target for a hackathon demo without changing the
  app architecture.
- Container Registry, ACK, Function Compute, load balancers, domains,
  certificates, and databases were not added for this minimal proof.
- Docker validation was completed on the ECS host because Docker is not
  installed on this workstation.
- Alibaba Cloud Workbench was used for ECS shell access; no Alibaba CLI config
  is stored in this repository.
- `docs/deployment/alibaba-cloud-proof.md` records the redacted live proof.
- `docs/hackathon-resource-support.md` records non-secret hackathon resource
  status, including Devpost deadlines, Qwen free-quota status, coupon/voucher
  uncertainty, and Alibaba Cloud cost guardrails.
- `npm run mcp:validate-remote` validates `/health`, `tools/list`,
  authenticated `memory_recall`, and Qwen-backed `memory_remember` against a
  deployed endpoint using `MCP_ENDPOINT` and an auth token supplied only through
  the shell environment.

Created resources:

- Region: `cn-beijing` / North China 2 (Beijing)
- ECS instance ID: `i-2ze79rc2xe68zx1xeahu`
- Instance shape: 2 vCPU / 2 GiB pay-as-you-go ECS
- OS: Ubuntu 24.04 64-bit security-hardened image
- Public endpoint: `http://123.56.244.157`
- MCP endpoint: `http://123.56.244.157/mcp`
- Docker image tag: `handoffbase:b565210-20260707T160422Z`
- Security group: HTTP port 80 for the demo endpoint and SSH for Workbench
  access

Cloud secret/env values configured:

- `HOST=0.0.0.0`
- `PORT=3000`
- `MCP_PATH=/mcp`
- `HANDOFFBASE_AUTH_MODE=api_key`
- `HANDOFFBASE_API_KEY`
- `HANDOFFBASE_TENANT_ID=demo-tenant`
- `HANDOFFBASE_USER_ID=demo-user`
- `HANDOFFBASE_ACTOR_ID=hackathon-demo`
- `QWEN_API_KEY`
- `QWEN_BASE_URL`
- `QWEN_MODEL=qwen-plus`
- `QWEN_TIMEOUT_MS=30000`

Known limits:

- Runtime secrets are stored only in the root-owned ECS env file consumed by
  Docker `--env-file`; values are not recorded here.
- The endpoint is plain HTTP on a public IP. No domain, TLS certificate, load
  balancer, or managed gateway is configured.
- Docker Hub base-image pull timed out from ECS, so `node:22-slim` was
  pre-tagged on the ECS host from an alternate registry mirror while keeping
  the repository Dockerfile unchanged.
- The pay-as-you-go ECS instance should be stopped or released after the
  approved hackathon demo window.
- Do not create additional paid compute, public endpoints, registries with
  billable storage/egress, load balancers, databases, or paid model API usage
  outside the explicitly approved ECS + Docker path.

## Optional Postgres Readiness

Status: prepare only

- Runtime code: `PostgresMemoryStore` exists in `packages/memory-core`.
- Default server factory: still uses `InMemoryMemoryStore`.
- Deployment docs: mark `DATABASE_URL`, `POSTGRES_URL`, and `STORE_MODE` as
  future runtime wiring.
- Candidate services to inspect after approval/login:
  - ApsaraDB RDS for PostgreSQL
  - PolarDB for PostgreSQL
  - AnalyticDB PostgreSQL only if operationally justified
- Required capability: pgvector or compatible vector extension support.
- pgvector support status: not verified from an official target-service/version
  document in this run; verify the selected Alibaba PostgreSQL service and
  engine version support before provisioning.
- Env vars needed later: `DATABASE_URL` or `POSTGRES_URL`, plus
  `STORE_MODE=postgres` only after runtime wiring supports it.

No database has been created and no database URL has been stored.

## GitHub / CI Readiness

Status: local CI setup documented; remote CI should be rechecked before submission

- Repository: `jensonChow/handoffbase`
- Current branch: `main`
- Deployment image source commit: `b565210`
- Workflow file: `.github/workflows/ci.yml`
- GitHub Actions enabled: yes
- Allowed actions setting: `all`
- CI trigger: `push`, `pull_request`
- Runtime: Node 22
- Install command: `npm ci`
- Check command: `npm run check`
- Workflow status: `CI` active
- Latest run for current commit: check the GitHub Actions tab before submission
- Latest CI status should be checked from the GitHub Actions tab before submission.
- Current local check result: `npm run check` passed on 2026-07-07T16:29Z

Possible GitHub Actions secrets needed later:

- `QWEN_API_KEY` or `DASHSCOPE_API_KEY`
- `HANDOFFBASE_API_KEY` or `HANDOFFBASE_API_KEYS_JSON`
- Alibaba Container Registry username/password or access token, if using ACR
- Deployment host/user/key or deploy token, if automated deployment is added

Do not add GitHub Actions secrets until explicitly approved.

## Blocking Questions

Status: none for the approved ECS + Docker deployment

- Re-run the remote validator before demo/submission if the ECS instance has
  been restarted.
- Stop or release the pay-as-you-go ECS instance after the approved hackathon
  demo window.
- Keep secrets in cloud environment/secret configuration only; do not paste
  Qwen keys, HandoffBase API keys, cloud access keys, cookies, or auth headers
  into tracked files, chat, screenshots, or logs.

## Final Safety Checks

Status: refreshed for public-readiness review

- `.env.hackathon.local` ignore check: should match `.gitignore` rule `.env.*`;
  do not print or commit the file contents.
- `.env.hackathon.local` tracked check: must remain untracked by git.
- Local server state after validation: stop any temporary server before handoff.
- Clipboard cleanup: clear any one-time credential copied during local setup.
- Tracked-file public-readiness scan: passed on 2026-07-07T14:36:36Z.
  Remaining `maas.aliyuncs.com` matches are intentional placeholder host
  patterns, not workspace-specific API hosts.
- Changed-file secret scan for the proof template and remote validator passed
  on 2026-07-07T14:36:36Z.
- Final local verification: `npm run check` passed on 2026-07-07T16:29Z.
- Scanner notes: existing memory-core tests may intentionally contain
  redacted/fake credential patterns to verify sanitizer behavior; no values from
  `.env.hackathon.local` should be printed or committed.
