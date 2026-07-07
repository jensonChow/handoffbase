# Alibaba Cloud Deployment Proof

Status: live validation passed.

This file records non-secret proof for the minimal Alibaba Cloud ECS + Docker deployment. It intentionally omits API keys, authorization headers, workspace-specific secret values, database URLs, and cloud access credentials.

## Deployment

- Alibaba Cloud service used: ECS
- Region: `cn-beijing` / North China 2 (Beijing)
- Instance ID: `i-2ze79rc2xe68zx1xeahu`
- Deployment shape: single ECS instance running Docker
- Public endpoint: `http://123.56.244.157`
- MCP endpoint: `http://123.56.244.157/mcp`
- Source commit: `b565210`
- Image tag: `handoffbase:b565210-20260707T160422Z`
- Build source: Git archive of the tracked repository source at `b565210`
- Runtime secret location: root-owned ECS environment file loaded into Docker with `--env-file`; values are not recorded here

## Runtime Env Summary

- `HOST=0.0.0.0`
- `PORT=3000`
- `MCP_PATH=/mcp`
- `HANDOFFBASE_AUTH_MODE=api_key`
- `HANDOFFBASE_API_KEY`: configured only as a cloud env/secret value
- `HANDOFFBASE_TENANT_ID=demo-tenant`
- `HANDOFFBASE_USER_ID=demo-user`
- `HANDOFFBASE_ACTOR_ID=hackathon-demo`
- `QWEN_API_KEY`: configured only as a cloud env/secret value
- `QWEN_MODEL=qwen-plus`
- `QWEN_TIMEOUT_MS=30000`
- `QWEN_BASE_URL`: configured only as a cloud env/secret value because it is workspace-specific

## Health Evidence

Validated with `GET /health` against the live public endpoint on 2026-07-07T16:25:23Z.

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

## MCP Validation Summary

Validated with the auth token supplied only from the local shell environment:

```sh
MCP_ENDPOINT=http://123.56.244.157/mcp MCP_AUTH_TOKEN=<redacted> npm run mcp:validate-remote
```

Safe validation output:

- `tools/list`: 7 tools returned: `continuity_bootstrap`, `memory_forget`, `memory_recall`, `memory_reflect`, `memory_remember`, `memory_trace`, `memory_update`
- `memory_recall`: returned 5 memories and a trace id
- `memory_remember`: returned 2 candidate memories with status `pending`

## Qwen-Backed Operation Summary

- `/health` reported `providerMode: "qwen"`.
- Authenticated `memory_remember` completed against the live `/mcp` endpoint and returned two pending candidate memories.
- The operation exercised the Qwen-backed provider path; the deployment would have been rejected if `/health` reported `providerMode: "mock"`.

## Known Limitations

- The default runtime store remains `in-memory`; Postgres was not provisioned and is not required for this deployment proof.
- No database URL is configured for this minimal ECS + Docker path.
- The demo endpoint is public HTTP on the ECS IP address. No domain, TLS certificate, load balancer, or managed gateway was added.
- The security group opens SSH for Workbench access and HTTP port 80 for the demo endpoint; no extra application ports were opened.
- Docker Hub pull for the Node base image timed out from the ECS network, so `node:22-slim` was pre-tagged locally on the ECS host from an alternate registry mirror while keeping the repository Dockerfile unchanged.

## Timestamp

- Template created: 2026-07-07
- Live proof timestamp: 2026-07-07T16:26:43Z
