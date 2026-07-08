# HTTP and JSON-RPC Examples

HandoffBase MCP runs over Streamable HTTP. MCP hosts and SDK clients normally
manage initialization, session headers, and tool calls for you. These examples
are useful when you want to inspect the raw JSON-RPC shape.

## Helper Script

Start the local server:

```bash
npm run dev:server
```

Call a tool with one of the payload fixtures:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Remote calls use a HandoffBase API key, not a Qwen or DashScope key:

```bash
export MCP_ENDPOINT=https://your-handoffbase.example.com/mcp
export MCP_AUTH_TOKEN=
npm run mcp:call -- memory_remember examples/http/payloads/memory-remember-preferences.json
```

Set `MCP_AUTH_TOKEN` only in your shell or secret manager before running the
remote command.

## Payload Fixtures

- `payloads/continuity-bootstrap-opportunity-scout.json`
- `payloads/memory-recall-rank-opportunities.json`
- `payloads/memory-remember-preferences.json`
- `payloads/memory-reflect-eligibility-failure.json`

Each file contains the `arguments` object for a matching MCP tool call. Values
use demo tenant, user, project, and agent identifiers only.

## Raw JSON-RPC

Initialize a Streamable HTTP session:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp

curl -i -sS "$MCP_ENDPOINT" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "handoffbase-curl-example",
        "version": "0.1.0"
      }
    }
  }'
```

If the response includes an `Mcp-Session-Id` header, pass that value on later
requests. Some manual local calls may work without it, but real MCP clients
should follow the session flow.

List tools:

```bash
curl -sS "$MCP_ENDPOINT" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id-from-initialize-response>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tools-list-1",
    "method": "tools/list",
    "params": {}
  }'
```

Call `memory_recall`:

```bash
curl -sS "$MCP_ENDPOINT" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id-from-initialize-response>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "recall-1",
    "method": "tools/call",
    "params": {
      "name": "memory_recall",
      "arguments": {
        "query": "Rank AI hackathon opportunities for this user.",
        "scopes": {
          "tenant_id": "demo-tenant",
          "user_id": "demo-user",
          "project_id": "ai-opportunity-scout",
          "agent_profile_id": "opportunity-scout",
          "host_id": "codex"
        },
        "types": ["user_preference", "procedure", "failure_memory"],
        "limit": 5,
        "token_budget": 900
      }
    }
  }'
```

For a remote server with API-key auth enabled, add:

```text
Authorization: Bearer <your-handoffbase-api-key>
```

Do not add Qwen or DashScope credentials to client requests.
