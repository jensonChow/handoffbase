# Quickstart: Remember A Preference

Use `memory_remember` when the user corrects the agent or gives a durable preference.

```bash
npm run dev:server
```

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp \
npm run mcp:call -- memory_remember examples/http/payloads/memory-remember-preferences.json
```

Expected behavior:

- extracts candidate memories,
- keeps candidates `pending` unless the request asks for active approval mode,
- records conflict metadata when applicable.

In Qwen-backed mode, the backend uses `QwenMemoryProvider`; MCP clients still only call HandoffBase and never receive Qwen/DashScope keys.
