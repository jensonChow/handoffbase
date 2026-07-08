# Quickstart: Recall Memory

Use `memory_recall` when a task needs relevant user, project, procedure, tool, or failure memories.

```bash
npm run dev:server
```

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp \
npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Expected behavior:

- returns matching memories,
- returns a compact `context_block`,
- returns `trace_id` for inspection.

The local default path is credential-free and uses `MockMemoryProvider`.
