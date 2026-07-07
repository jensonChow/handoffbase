# Alibaba Cloud Deployment Checklist

This is a proof checklist, not a claim that the service is already deployed.

## Target Shape

- Remote Streamable HTTP MCP endpoint, for example `https://<domain>/mcp`.
- Node.js service running the official MCP TypeScript SDK transport.
- Qwen Cloud configured through `QwenMemoryProvider`.
- Postgres with pgvector for structured memory and semantic retrieval.
- Event log enabled for memory add, update, delete, recall, bootstrap, and reflect operations.
- Optional dashboard route for Memory Vault and trace review.

## Environment

Required runtime variables:

```text
MCP_ENDPOINT=https://<deployed-domain>/mcp
QWEN_API_KEY=<configured-in-cloud-secret-manager>
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
DATABASE_URL=<postgres-connection-string>
```

Security expectations:

- Store `QWEN_API_KEY` and `DATABASE_URL` in Alibaba Cloud secret or environment configuration, not in git.
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
