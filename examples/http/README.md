# HTTP / JSON-RPC Examples

This folder contains safe local payloads for HandoffBase MCP tools.

Start a local server:

```bash
npm run dev:server
```

Call a tool through the helper:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp \
npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

If API-key auth is enabled:

```bash
MCP_ENDPOINT=https://your-handoffbase.example.com/mcp \
MCP_AUTH_TOKEN=<your-handoffbase-api-key> \
npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Payloads:

- [payloads/continuity-bootstrap-opportunity-scout.json](payloads/continuity-bootstrap-opportunity-scout.json)
- [payloads/memory-recall-rank-opportunities.json](payloads/memory-recall-rank-opportunities.json)
- [payloads/memory-remember-preferences.json](payloads/memory-remember-preferences.json)
- [payloads/memory-reflect-eligibility-failure.json](payloads/memory-reflect-eligibility-failure.json)

The `.http` file [opportunity-scout.http](opportunity-scout.http) is for local/manual exploration. Keep tokens and real endpoints out of tracked examples.
