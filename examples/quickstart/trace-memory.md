# Quickstart: Trace Memory Usage

Use `memory_trace` after `continuity_bootstrap` or `memory_recall` returns a trace id.

1. Run recall:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp \
npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

2. Copy the returned `trace_id` into a `memory_trace` request:

```json
{
  "arguments": {
    "trace_id": "<trace-id-from-recall>"
  }
}
```

3. Call:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp \
npm run mcp:call -- memory_trace /path/to/your-local-trace-payload.json
```

Expected behavior:

- used memories include why they were selected,
- ignored memories include the exclusion reason,
- excluded memories surface policy or lifecycle filtering.

Do not commit local trace payloads that contain private user data.
