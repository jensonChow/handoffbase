# Quickstart: Recall Memory

Use `memory_recall` when an agent needs task-specific continuity context before
answering or acting.

## Start Local Mock Mode

```bash
npm install
npm run dev:server
```

## Call The Tool

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

For a remote server, add a HandoffBase endpoint and API key:

```bash
export MCP_ENDPOINT=https://your-handoffbase.example.com/mcp
export MCP_AUTH_TOKEN=
npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Set `MCP_AUTH_TOKEN` to your HandoffBase API key only in your shell or secret
manager.

## Expected Shape

The response should include:

```json
{
  "memories": [],
  "context_block": "...",
  "trace_id": "..."
}
```

Save the `trace_id` if you want to inspect why memories were included or
excluded with `memory_trace`.
