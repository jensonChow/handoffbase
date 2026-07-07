# Deployment

handoffbase is deployable as a standard Node.js HTTP service exposing:

- `/health` for safe runtime metadata.
- `/mcp` by default for Remote Streamable HTTP MCP.

The production image does not bake secrets into the filesystem. Pass Qwen credentials, API key auth config, and future database values through environment variables or the cloud provider secret manager.

## Local Production Check

Build and run the compiled server without Docker:

```sh
npm run build
npm run start:server
```

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
  -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e MCP_PATH=/mcp \
  handoffbase
```

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
| `DASHSCOPE_BASE_URL` | No | Optional alias for base URL when `QWEN_BASE_URL` is absent. |
| `DASHSCOPE_MODEL` | No | Optional alias for model when `QWEN_MODEL` is absent. |
| `HANDOFFBASE_AUTH_MODE` | No | `disabled` by default. Set to `api_key` to require bearer or `X-Handoffbase-Api-Key` on MCP POST requests. |
| `HANDOFFBASE_API_KEYS_JSON` | Required when using multi-key `api_key` auth | JSON object keyed by API key with tenant/user and optional actor/scope restrictions. |
| `HANDOFFBASE_API_KEY` / `HANDOFFBASE_TENANT_ID` / `HANDOFFBASE_USER_ID` | Alternative for single-key `api_key` auth | Simpler local/deployment fallback. Optional actor and allowed-scope vars are documented in `.env.example`. |
| `DATABASE_URL` / `POSTGRES_URL` | Future runtime wiring | `PostgresMemoryStore` now supports core CRUD, recall, traces, events, embeddings, and conflicts, but the default server factory still uses the in-memory MVP store. |
| `STORE_MODE` | Future runtime wiring | Placeholder for selecting a durable store. Current default runtime reports `in-memory`. |

## Alibaba Cloud Notes

The current production shape can run on ECS, ACK, or another Alibaba Cloud container target:

1. Build the image with Node 22 and push it to a private Container Registry repository.
2. Configure `HOST=0.0.0.0`, `PORT`, and `MCP_PATH` on the service.
3. Store `QWEN_API_KEY` or `DASHSCOPE_API_KEY` in Alibaba Cloud secret or environment configuration, not in git or the image.
4. Put HTTPS in front of the service through a load balancer, ingress, or API gateway before sharing the MCP endpoint.
5. Use `HANDOFFBASE_AUTH_MODE=api_key` and store API key mappings as cloud secrets before exposing non-demo data.
6. Keep the in-memory MVP path for demo deployment unless a later runtime selection branch wires `PostgresMemoryStore` to `DATABASE_URL` or `POSTGRES_URL`.

For submission evidence, capture the running service, `/health`, an MCP initialize/tools-list request, and a redacted Qwen provider call when Qwen credentials are configured.
