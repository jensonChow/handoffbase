# Deployment

handoffbase is deployable as a standard Node.js HTTP service exposing:

- `/health` for liveness and safe configured-mode metadata.
- `/ready` for live store/provider dependency readiness.
- `/mcp` by default for Remote Streamable HTTP MCP.

The production image does not bake secrets into the filesystem. Pass Qwen
credentials, API-key auth config, and database values through environment
variables or the cloud provider secret manager.

## Local Production Check

Build and run the compiled server without Docker:

```sh
npm run build
npm run start:server
```

Both root server commands automatically pass `.env.local` to Node when the file
exists. Without that file they use the inherited shell or cloud environment.
The launcher does not print environment values, and container deployments should
continue to inject secrets through their runtime configuration.

The server uses these defaults outside Docker:

```text
HOST=127.0.0.1
PORT=3000
MCP_PATH=/mcp
```

`PORT` must be a whole number from 0 to 65535. `MCP_PATH` must start with `/`.

## Docker

Build the production image:

```sh
docker build -t handoffbase .
```

Run the server locally:

```sh
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e MCP_PATH=/mcp \
  -e HANDOFFBASE_ALLOW_INSECURE_REMOTE=1 \
  handoffbase
```

The insecure override is acceptable only in this loopback-published local demo.
A non-loopback bind otherwise fails startup unless
`HANDOFFBASE_AUTH_MODE=api_key`; do not use the override on a shared host or
public deployment.

Check the container:

```sh
curl http://127.0.0.1:3000/health
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Expected `/health` fields are safe to expose to deployment monitors:

```json
{
  "ok": true,
  "name": "handoffbase-mcp-server",
  "version": "0.1.0",
  "transport": "streamable-http",
  "mcpPath": "/mcp",
  "authMode": "disabled",
  "providerMode": "mock",
  "storeMode": "in-memory"
}
```

When Qwen credentials are present, `providerMode` reports `qwen`. When `HANDOFFBASE_AUTH_MODE=api_key`, `authMode` reports `api_key`. The health response never returns API keys, tokens, connection strings, or credential values.

`GET /health` does not contact dependencies. Before routing traffic, call
`GET /ready`: the store check runs every time and Postgres mode runs a real
schema query that verifies the connection and current migrated `memories` and
`memory_feedback` tables. Qwen mode performs a live one-token completion probe
on the first request, then caches that result for five minutes by default so
polling cannot repeatedly consume model quota; concurrent cache misses share one
in-flight probe. In `api_key` mode, `/ready` requires the same API-key header as
`/mcp`. The loopback-only local server may probe Qwen with auth disabled so
local onboarding can verify its provider; a Qwen-backed non-loopback runtime
with auth disabled, including the explicit insecure demo override, returns a
fail-closed readiness error before any model request. Readiness output contains
status metadata only, not the provider response body.

## Environment Variables

| Variable | Required now | Notes |
| --- | --- | --- |
| `HOST` | No | Bind host. Docker defaults to `0.0.0.0`; local dev defaults to `127.0.0.1`. |
| `PORT` | No | HTTP port. Must be numeric. Defaults to `3000`. |
| `MCP_PATH` | No | MCP Streamable HTTP path. Must start with `/`. Defaults to `/mcp`. |
| `QWEN_API_KEY` | No | Preferred Qwen Cloud credential. If absent, local/demo mode uses `MockMemoryProvider`. |
| `DASHSCOPE_API_KEY` | No | Alias accepted by `QwenMemoryProvider` when `QWEN_API_KEY` is absent. |
| `QWEN_BASE_URL` | No | Defaults to DashScope compatible-mode base URL. |
| `QWEN_MODEL` | No | Defaults to `qwen-plus`. |
| `QWEN_TIMEOUT_MS` | No | Provider request timeout in milliseconds. Defaults to `30000`. |
| `HANDOFFBASE_READINESS_CACHE_MS` | No | Qwen readiness result cache duration. Defaults to `300000` (five minutes). |
| `HANDOFFBASE_READINESS_TIMEOUT_MS` | No | Qwen readiness probe timeout. Defaults to `5000`. |
| `DASHSCOPE_BASE_URL` | No | Optional alias for base URL when `QWEN_BASE_URL` is absent. |
| `DASHSCOPE_MODEL` | No | Optional alias for model when `QWEN_MODEL` is absent. |
| `HANDOFFBASE_AUTH_MODE` | Required for non-loopback binds | `disabled` is allowed only on loopback by default. Set to `api_key` for shared or remote binds. |
| `HANDOFFBASE_ALLOW_INSECURE_REMOTE` | No | Explicit `1` override for an isolated demo whose published port is still loopback-only. Never use for a public deployment. |
| `HANDOFFBASE_API_KEYS_JSON` | Required when using multi-key `api_key` auth | JSON object keyed by API key with tenant/user and optional actor/scope restrictions. |
| `HANDOFFBASE_API_KEY` / `HANDOFFBASE_TENANT_ID` / `HANDOFFBASE_USER_ID` | Alternative for single-key `api_key` auth | Simpler local/deployment fallback. Optional actor and allowed-scope vars are documented in `.env.example`. |
| `STORE_MODE` | No | `in-memory` by default. Set exactly `postgres` to select `PostgresMemoryStore`. |
| `DATABASE_URL` | Required when `STORE_MODE=postgres` | Postgres connection used by the MCP runtime and dashboard server. `POSTGRES_URL` is not a runtime alias. Apply the migration before startup. |
| `HANDOFFBASE_DASHBOARD_CLIENT_MODE` | No | Dashboard browser uses same-origin HTTP APIs by default. Set `mock` only for isolated fixture mode. |
| `HANDOFFBASE_DASHBOARD_SESSION_SECRET` | Required when `HANDOFFBASE_AUTH_MODE=api_key` | Server-only random value of at least 32 characters used to sign the dashboard HttpOnly session cookie. Never commit it or expose it through `NEXT_PUBLIC_*`. |
| `HANDOFFBASE_DASHBOARD_TENANT_ID` / `HANDOFFBASE_DASHBOARD_USER_ID` | No | Optional server-only exact identity constraints. Caller identity comes from the authenticated API-key mapping; these values can only narrow that caller. |
| `HANDOFFBASE_DASHBOARD_AGENT_PROFILE_ID` / `HANDOFFBASE_DASHBOARD_PROJECT_ID` / `HANDOFFBASE_DASHBOARD_HOST_ID` | No | Optional server-only hierarchical view filters that must remain within the authenticated caller grant; they include globally scoped records plus matching dimension records. |

Dashboard tenant/user identity is never accepted from the browser or established
by `HANDOFFBASE_DASHBOARD_*`. In API-key mode it comes from the HandoffBase key
mapping stored in the signed caller session; in disabled local mode it comes
from the built-in demo caller.

Optional project/agent/host Dashboard filters use HandoffBase's hierarchical
scope semantics: a configured project, for example, includes user-global
memories plus memories for that project, while excluding other projects. This is
different from the authenticated caller's `allowedProjectIds` and
`allowedAgentProfileIds` security grant, which rejects records missing the
restricted dimension.

Production mutation CSRF checks compare the browser `Origin` with the effective
request origin derived from `X-Forwarded-Host` / `X-Forwarded-Proto`, then
`Host`, then the request URL. A reverse proxy must overwrite (not append or
trust client-supplied) forwarded host/protocol headers before sending traffic to
the Dashboard.

## Postgres Runtime

Migration is explicit and startup fails closed when Postgres mode lacks a
database URL:

```sh
DATABASE_URL=<postgres-url> npm run db:migrate
STORE_MODE=postgres DATABASE_URL=<postgres-url> npm run start:server
```

The default remains `STORE_MODE=in-memory`, which is the correct credential-free
path for local checks and CI. `npm run test:postgres:integration` uses only an
explicit `TEST_DATABASE_URL` naming a dedicated test database; otherwise that
optional integration case skips.

On a machine with Docker and the Compose plugin, run
`npm run test:postgres:restart` to create a disposable pgvector container,
apply the migration, write a memory, restart Postgres, recall it through a fresh
pool, and tear down the volume. This harness was not executed in the current
integration environment because Docker was unavailable; it must not be
reported as passed until run on a Docker-capable machine.

## Remote Validation Profiles

`npm run mcp:validate-remote` builds the current server manifest, checks
`/health`, requires `/ready` to return HTTP 200, connects to the deployed `/mcp`
endpoint, checks the exact nine-tool surface, then exercises recall and
remember. Its default `generic` profile validates the reported modes without
requiring a specific auth/provider/store combination.

Use explicit expectations for a known deployment:

```sh
EXPECTED_AUTH_MODE=api_key \
EXPECTED_PROVIDER_MODE=qwen \
EXPECTED_STORE_MODE=postgres \
MCP_ENDPOINT=<deployed-mcp-url> \
MCP_AUTH_TOKEN=<temporary-handoffbase-access-token> \
npm run mcp:validate-remote
```

The shortcut `MCP_VALIDATION_PROFILE=alibaba-demo` expects
`api_key`/`qwen`/`in-memory`. Keep `MCP_AUTH_TOKEN` in the shell or secret
manager; the validator redacts URL credentials and never logs the token.
Set `MCP_SKIP_READINESS=1` only for a legacy service that has no `/ready` route;
all other checks still run.

## Alibaba Cloud Notes

The current production shape can run on ECS, ACK, or another Alibaba Cloud container target:

1. Build the image with Node 22 and push it to a private Container Registry repository.
2. Configure `HOST=0.0.0.0`, `PORT`, and `MCP_PATH` on the service.
3. Store `QWEN_API_KEY` or `DASHSCOPE_API_KEY` in Alibaba Cloud secret or environment configuration, not in git or the image.
4. Put HTTPS in front of the service through a load balancer, ingress, or API gateway before sharing the MCP endpoint.
5. Use `HANDOFFBASE_AUTH_MODE=api_key` and store API key mappings as cloud secrets before exposing non-demo data.
6. Keep the in-memory path for a credential-free demo, or explicitly migrate a
   dedicated database and set `STORE_MODE=postgres` plus `DATABASE_URL` for a
   durable deployment. Do not point the disposable test commands at shared or
   production data.

For submission evidence, capture the running service, `/health`, an MCP initialize/tools-list request, and a redacted Qwen provider call when Qwen credentials are configured.
