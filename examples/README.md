# HandoffBase Examples

These examples show local development, Qwen-backed mode, remote validation, MCP host snippets, and safe HTTP/JSON-RPC payloads.

All values are placeholders. Do not put real Qwen, DashScope, HandoffBase, database, cookie, or cloud credentials in tracked files.

## Local Mock Mode

```bash
npm install
npm run check
npm run dev:server
npm run smoke
```

Local mode works without Qwen credentials. The server uses `MockMemoryProvider` unless `QWEN_API_KEY` or `DASHSCOPE_API_KEY` is set.

## Qwen-Backed Backend Mode

```bash
cp .env.example .env.local
```

Set one backend model key in your ignored `.env.local`:

```bash
QWEN_API_KEY=<your-qwen-api-key>
# or
DASHSCOPE_API_KEY=<your-dashscope-api-key>
```

Never commit `.env.*`.

HandoffBase API keys and Qwen/DashScope keys have different jobs:

- HandoffBase API key: protects the MCP endpoint.
- Qwen/DashScope key: stays on the backend and powers memory reasoning.

## Remote Validation

```bash
MCP_ENDPOINT=https://your-handoffbase.example.com/mcp \
MCP_AUTH_TOKEN=<your-handoffbase-api-key> \
npm run mcp:validate-remote
```

The remote validator checks `/health`, `tools/list`, `memory_recall`, and `memory_remember`.

## More Examples

- [MCP host config examples](mcp/README.md)
- [HTTP / JSON-RPC examples](http/README.md)
- [Bootstrap a session](quickstart/bootstrap-session.md)
- [Recall memory](quickstart/recall-memory.md)
- [Remember a preference](quickstart/remember-preference.md)
- [Trace memory usage](quickstart/trace-memory.md)
