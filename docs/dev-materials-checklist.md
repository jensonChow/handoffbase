# Development Materials Checklist

Last updated: 2026-07-07T13:00:19Z

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
| `QWEN_BASE_URL` or `DASHSCOPE_BASE_URL` | prepared | Workspace-specific Beijing OpenAI-compatible base URL is configured locally. |
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
- Login status: authenticated on 2026-07-07T12:47:09Z
- Workspace/business space: default business space
- Workspace ID: `ws-63cnyz4i0wtfd0im`
- API host: `ws-63cnyz4i0wtfd0im.cn-beijing.maas.aliyuncs.com`
- API key label/description: `handoffbase-hackathon-dev`
- API key status: created and stored locally
- Model: `qwen-plus`
- Local storage: `.env.hackathon.local`
- Official key guidance: API keys should be stored in environment variables and must not be exposed
- Official one-time-display warning: new Model Studio API keys may only show the full secret once after creation
- Official OpenAI-compatible base URL guidance:
  - Beijing: `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
  - Singapore: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
  - US Virginia: `https://dashscope-us.aliyuncs.com/compatible-mode/v1`
  - Configured local base URL: `https://ws-63cnyz4i0wtfd0im.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

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
- Actor ID: `hackathon-dev`
- Secret storage: `.env.hackathon.local`
- Secret value: not recorded

## Local Validation

Status: passed for mock-provider, Qwen-config health, and live Qwen-backed MCP validation

Validation to run:

- `npm run check`: passed on 2026-07-07T13:00:19Z
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

## Alibaba Cloud Deployment Readiness

Status: inspected from repo and console service menu; provisioning pending approval

Recommended minimal path: ECS + Docker

Reasoning:

- The repository already has a production `Dockerfile`.
- The server is a normal long-running Node.js HTTP service exposing `/health`
  and `/mcp`.
- ECS + Docker is the simplest target for a hackathon demo without changing the
  app architecture.
- Container Registry can be added when pushing images remotely, but it is not
  required for local Docker validation.
- ACK adds Kubernetes overhead that is not needed for the current MVP.
- Function Compute custom container may be viable, but the MCP Streamable HTTP
  service shape is simpler to operate first on ECS.
- Local Docker validation is not available in this workstation session because
  the `docker` command is not installed.

Resources to create only after approval:

- Region: prefer same region as Qwen key, currently `cn-beijing` if the account
  remains in Beijing.
- ECS instance suitable for Node 22 Docker runtime.
- Security group allowing HTTPS ingress through a proxy/load balancer, or a
  temporary locked-down demo port if explicitly approved.
- Optional Container Registry namespace/repository: `handoffbase`.
- Optional domain, certificate, or load balancer for HTTPS.

Cloud secret/env values required:

- `HOST=0.0.0.0`
- `PORT=3000`
- `MCP_PATH=/mcp`
- `HANDOFFBASE_AUTH_MODE=api_key`
- `HANDOFFBASE_API_KEY` or `HANDOFFBASE_API_KEYS_JSON`
- `QWEN_API_KEY` or `DASHSCOPE_API_KEY`
- `QWEN_BASE_URL` or `DASHSCOPE_BASE_URL`
- `QWEN_MODEL=qwen-plus`
- `QWEN_TIMEOUT_MS=30000`

Blocking items:

- Explicit approval required before creating paid compute, public endpoints,
  registries with billable storage/egress, load balancers, databases, or paid
  model API usage.

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

Status: local and remote CI status inspected

- Repository: `jensonChow/handoffbase`
- Current branch: `main`
- Current commit: `1badb71`
- Workflow file: `.github/workflows/ci.yml`
- GitHub Actions enabled: yes
- Allowed actions setting: `all`
- CI trigger: `push`, `pull_request`
- Runtime: Node 22
- Install command: `npm ci`
- Check command: `npm run check`
- Workflow status: `CI` active
- Latest run for current commit: success
- Latest run URL: `https://github.com/jensonChow/handoffbase/actions/runs/28864020800`
- Current local check result: `npm run check` passed on 2026-07-07T13:00:19Z

Possible GitHub Actions secrets needed later:

- `QWEN_API_KEY` or `DASHSCOPE_API_KEY`
- `HANDOFFBASE_API_KEY` or `HANDOFFBASE_API_KEYS_JSON`
- Alibaba Container Registry username/password or access token, if using ACR
- Deployment host/user/key or deploy token, if automated deployment is added

Do not add GitHub Actions secrets until explicitly approved.

## Blocking Questions

Status: waiting for user approval

- Do you approve any Alibaba Cloud paid provisioning for deployment, such as
  ECS, public endpoints, Container Registry storage/egress, load balancer,
  certificate/domain, or Postgres/RDS resources?

## Final Safety Checks

Status: completed

- `git status`: only `docs/dev-materials-checklist.md` is untracked from this task.
- `.env.hackathon.local` ignore check: matched `.gitignore` rule `.env.*`.
- `.env.hackathon.local` tracked check: not tracked by git.
- Local server state after validation: stopped; `127.0.0.1:3333` is not accepting connections.
- Clipboard cleanup: cleared after copying the one-time Qwen API key into `.env.hackathon.local`.
- Tracked-file secret scan: no generated local secrets found.
- Scanner notes: existing memory-core tests intentionally contain redacted/fake
  credential patterns to verify sanitizer behavior; no values from
  `.env.hackathon.local` were printed or committed.
