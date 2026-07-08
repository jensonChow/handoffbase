# Testing Instructions

These instructions are safe for judges and contributors. They use local mock
mode by default and do not require real Qwen credentials, Alibaba Cloud access,
or a live remote endpoint.

## Local Testing

Use Node.js 22 or newer.

```bash
npm install
npm run check
npm run eval:memory
npm run smoke
npm run dashboard:dev
```

What each command covers:

- `npm run check` runs the CI-parity validation path, including typecheck,
  build, MCP registration smoke, memory-core tests, auth tests, server tests,
  and dashboard tests.
- `npm run eval:memory` runs the deterministic AI Opportunity Scout memory eval
  pack. It uses local modules, the in-memory store, and a deterministic provider
  path. It does not call Qwen or a remote endpoint.
- `npm run smoke` validates MCP registration locally.
- `npm run dashboard:dev` starts the HandoffBase Memory Vault dashboard
  prototype for vault, trace, pending-review, and conflict-review demos.

## Qwen-Backed Local Mode

Local development works without Qwen credentials. To test the Qwen-backed path
with your own key, create a local ignored env file:

```bash
cp .env.example .env.local
```

Then set one backend provider key in `.env.local` or in your shell:

- `QWEN_API_KEY`
- `DASHSCOPE_API_KEY`

Do not commit `.env.*` files. Do not share Qwen keys with judges, MCP hosts, or
public docs. Qwen and DashScope credentials stay on the backend only.

## Remote Deployment Testing

The Alibaba Cloud ECS endpoint may be paused to control pay-as-you-go cost. Do
not assume the public endpoint is online until it has been restarted and
revalidated.

Once the deployment is reactivated, judges can validate the remote MCP service
with temporary HandoffBase access credentials:

```bash
MCP_ENDPOINT=<deployed-mcp-url>
MCP_AUTH_TOKEN=<temporary-handoffbase-demo-key>
npm run mcp:validate-remote
```

The remote validator checks:

- `/health`
- MCP `tools/list`
- authenticated `memory_recall`
- authenticated Qwen-backed `memory_remember`

The Qwen API key is never shared with judges. The HandoffBase API key is
separate from the Qwen key; it only protects the HandoffBase MCP endpoint and
can be rotated after testing. Do not include a real endpoint auth token in
tracked files, screenshots, or public comments.

The redacted deployment proof lives in
[`docs/deployment/alibaba-cloud-proof.md`](../deployment/alibaba-cloud-proof.md).
It records non-secret evidence for the Alibaba Cloud ECS + Docker deployment,
including `/health`, MCP discovery, `memory_recall`, and Qwen-backed
`memory_remember`.

## Current Runtime Truth

The deployment proof uses:

```text
authMode=api_key
providerMode=qwen
storeMode=in-memory
```

That means the proof is Qwen-backed and API-key protected, but the runtime store
is the in-memory demo store. It is not durable production storage. Durable
Postgres runtime wiring is future work.

## Secret Rules

- Never commit `.env.*` files.
- Never paste Qwen, DashScope, HandoffBase, cloud, database, cookie, or auth
  header values into tracked files.
- Use placeholders in docs and public commands.
- Keep temporary HandoffBase demo keys separate from Qwen provider keys.
- Rotate or delete temporary demo access after judging.
