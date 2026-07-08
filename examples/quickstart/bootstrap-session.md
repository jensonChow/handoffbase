# Quickstart: Bootstrap A Session

Use `continuity_bootstrap` when a new agent session starts and needs a compact continuity context pack.

```bash
npm run dev:server
```

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp \
npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
```

Expected behavior:

- returns a grouped context pack,
- returns `memory_trace_id`,
- suggests follow-up memory tools.

Use a placeholder token only when documenting remote auth:

```bash
MCP_ENDPOINT=https://your-handoffbase.example.com/mcp \
MCP_AUTH_TOKEN=<your-handoffbase-api-key> \
npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
```
