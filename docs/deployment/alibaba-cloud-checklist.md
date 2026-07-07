# Alibaba Cloud Deployment Checklist

This is a proof checklist, not a claim that the service is already deployed.

## Target Shape

- Remote Streamable HTTP MCP endpoint, for example `https://<domain>/mcp`.
- Node.js service running the official MCP TypeScript SDK transport.
- Qwen Cloud configured through `QwenMemoryProvider`.
- In-memory MVP store for the current deployable demo; Postgres/pgvector store code is available for follow-up runtime wiring.
- Event log enabled for memory add, update, delete, recall, bootstrap, and reflect operations.
- Optional dashboard route for Memory Vault and trace review.

## Environment

Current container variables:

```text
HOST=0.0.0.0
PORT=3000
MCP_PATH=/mcp
```

Optional Qwen variables:

```text
QWEN_API_KEY=<configured-in-cloud-secret-manager>
DASHSCOPE_API_KEY=<configured-in-cloud-secret-manager>
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_TIMEOUT_MS=30000
```

Optional API key auth variables are `HANDOFFBASE_AUTH_MODE=api_key` plus either `HANDOFFBASE_API_KEYS_JSON` or the single-key `HANDOFFBASE_API_KEY`, `HANDOFFBASE_TENANT_ID`, and `HANDOFFBASE_USER_ID` set. Future Postgres runtime variables are documented in `docs/deployment.md`.

Security expectations:

- Store `QWEN_API_KEY`, `DASHSCOPE_API_KEY`, API keys, and future database URLs in Alibaba Cloud secret or environment configuration, not in git.
- Enable HTTPS before sharing the endpoint.
- Restrict dashboard access before using real user memories.
- Do not seed private credentials, cookies, tokens, or full conversation logs.

## Verification Evidence To Capture

- [ ] Alibaba Cloud service page showing the running backend.
- [ ] Deployment logs showing the server starting and listening for `/mcp`.
- [ ] MCP initialize request and response against the deployed endpoint.
- [ ] `tools/list` response showing the core memory tools.
- [ ] `memory_remember` or seed import event in the event log.
- [ ] `continuity_bootstrap` response showing the AI Opportunity Scout context pack.
- [ ] Qwen Cloud request evidence at the provider boundary, with secrets redacted.
- [ ] Postgres or dashboard evidence showing active seed memories and trace records.

## Smoke Commands

After the server is deployed and `MCP_ENDPOINT` is set:

```sh
npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

For a full walkthrough, replay the requests from `examples/http/opportunity-scout.http` with the deployed endpoint and session id.
