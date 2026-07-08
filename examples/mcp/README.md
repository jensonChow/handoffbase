# MCP Host Examples

HandoffBase exposes a Remote Streamable HTTP MCP server. The snippets in this folder are placeholders and may need adaptation for a specific MCP host.

## Remote Server

See [remote-server-config.example.json](remote-server-config.example.json).

Use this shape when HandoffBase is already deployed:

```json
{
  "servers": {
    "handoffbase": {
      "url": "https://your-handoffbase.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-handoffbase-api-key>"
      }
    }
  }
}
```

The HandoffBase API key protects the MCP endpoint. Qwen/DashScope keys stay on the backend and should never be configured in MCP host clients.

## Local Server

See [local-server-config.example.json](local-server-config.example.json).

Start the server locally:

```bash
npm run dev:server
```

Then point your MCP host at:

```text
http://127.0.0.1:3000/mcp
```

If you enable local API-key auth, use a placeholder in docs and load the real value from local secret storage.

## Tools To Try

- `continuity_bootstrap`
- `memory_recall`
- `memory_remember`
- `memory_trace`
