# Quickstart: Trace Memory Usage

Use `memory_trace` after `continuity_bootstrap` or `memory_recall` returns a
trace id. It explains which memories were used, ignored, or excluded.

## Get A Trace Id

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Copy the `trace_id` from the response.

## Call The Tool

```bash
TRACE_ID=<trace-id-from-memory_recall>
printf '{ "trace_id": "%s" }\n' "$TRACE_ID" > /tmp/handoffbase-memory-trace.json
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_trace /tmp/handoffbase-memory-trace.json
```

For a remote server, use the same HandoffBase API key you used for the recall
request:

```bash
TRACE_ID=<trace-id-from-memory_recall>
printf '{ "trace_id": "%s" }\n' "$TRACE_ID" > /tmp/handoffbase-memory-trace.json
export MCP_ENDPOINT=https://your-handoffbase.example.com/mcp
export MCP_AUTH_TOKEN=
npm run mcp:call -- memory_trace /tmp/handoffbase-memory-trace.json
```

Set `MCP_AUTH_TOKEN` to your HandoffBase API key only in your shell or secret
manager.

## Expected Shape

The response should include:

```json
{
  "used_memories": [],
  "ignored_memories": [],
  "excluded_memories": []
}
```

Use this when an agent answer needs an audit trail for memory influence.
