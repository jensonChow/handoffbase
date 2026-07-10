# HandoffBase Examples

These examples show how to run HandoffBase locally, connect an MCP host, and
exercise the core continuity tools with safe placeholder values.

The current MVP exposes a Remote Streamable HTTP MCP server. Local development
still runs that HTTP server on your machine; it does not require local stdio
transport.

## Local Development Mode

Local mock mode works without Qwen or DashScope credentials:

```bash
npm ci
npm run check
npm run dev:server
npm run smoke
```

The default MCP endpoint is:

```text
http://127.0.0.1:3000/mcp
```

If port `3000` is busy, start the server on another port:

```bash
PORT=3333 npm run dev:server
```

Then point examples at the matching endpoint:

```bash
MCP_ENDPOINT=http://127.0.0.1:3333/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

## Qwen-Backed Mode

Qwen-backed mode requires a backend key. It is optional for local development;
without `QWEN_API_KEY` or `DASHSCOPE_API_KEY`, HandoffBase uses
`MockMemoryProvider`.

```bash
cp .env.example .env.local
```

Edit `.env.local` locally and set one backend provider key. Leave tracked
examples blank:

```text
QWEN_API_KEY=
```

or:

```text
DASHSCOPE_API_KEY=
```

Never commit `.env.*` files.

`npm run dev:server` and `npm run start:server` automatically pass `.env.local`
to Node when it exists; otherwise they use the inherited shell environment.

HandoffBase API keys and Qwen/DashScope keys are different:

- A HandoffBase API key protects the MCP endpoint.
- A Qwen or DashScope key stays only on the backend and lets the server call the
  memory reasoning provider.
- MCP hosts should never receive the Qwen or DashScope key.

## Remote Validation Mode

Use this only against a deployment that you control:

```bash
export MCP_ENDPOINT=https://your-handoffbase.example.com/mcp
export MCP_AUTH_TOKEN=
npm run mcp:validate-remote
```

The generic validator checks `/health`, requires `/ready` to return HTTP 200,
checks the exact current tool manifest, and exercises `memory_recall` and
`memory_remember` without fixing one runtime-mode combination. Add
`MCP_VALIDATION_PROFILE=alibaba-demo` for the documented
Qwen/API-key/in-memory proof, or use `EXPECTED_AUTH_MODE`,
`EXPECTED_PROVIDER_MODE`, and `EXPECTED_STORE_MODE`. It reads the HandoffBase
auth token from `MCP_AUTH_TOKEN`; set that value only in your shell or secret
manager, and do not put real tokens into tracked files.

For the redacted live deployment proof, see
[`docs/deployment/alibaba-cloud-proof.md`](../docs/deployment/alibaba-cloud-proof.md).

## Example Areas

- [`mcp/`](mcp/) has canonical Codex `config.toml` examples for local and
  Bearer-authenticated remote servers.
- [`http/`](http/) has JSON-RPC and direct HTTP examples.
- [`quickstart/remember-preference.md`](quickstart/remember-preference.md)
  stores a durable preference candidate.
- [`quickstart/recall-memory.md`](quickstart/recall-memory.md) retrieves
  relevant memories and a trace id.
- [`quickstart/trace-memory.md`](quickstart/trace-memory.md) explains which
  memories were used or excluded.
- [`quickstart/bootstrap-session.md`](quickstart/bootstrap-session.md) builds a
  compact context pack for a fresh session.
