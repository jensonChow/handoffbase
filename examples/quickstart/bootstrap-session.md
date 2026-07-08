# Quickstart: Bootstrap a Session

Use `continuity_bootstrap` at the start of a new agent session. It returns a
compact context pack for the current user, host, agent profile, project, and
task.

## Start Local Mock Mode

```bash
npm install
npm run dev:server
```

## Call The Tool

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
```

For a remote server, add a HandoffBase endpoint and API key:

```bash
export MCP_ENDPOINT=https://your-handoffbase.example.com/mcp
export MCP_AUTH_TOKEN=
npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
```

Set `MCP_AUTH_TOKEN` to your HandoffBase API key only in your shell or secret
manager.

## Expected Shape

The response should include:

```json
{
  "context_pack": {
    "user": [],
    "procedures": [],
    "project": [],
    "tool_memory": [],
    "failure_memory": []
  },
  "memory_trace_id": "...",
  "suggested_next_tools": ["memory_recall", "memory_reflect"]
}
```

Use `memory_trace` with `memory_trace_id` when you need to inspect memory
selection decisions.
