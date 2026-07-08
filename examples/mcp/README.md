# MCP Host Examples

HandoffBase exposes MCP over Streamable HTTP at `/mcp`. The snippets in this
directory are placeholder configs for MCP hosts that support remote HTTP
servers.

MCP host config formats are not identical. Treat these files as starting points
and adapt the field names to your host's documentation.

## Local Server Config

Start the local server:

```bash
npm run dev:server
```

Then adapt:

```text
examples/mcp/local-server-config.example.json
```

The local example points at:

```text
http://127.0.0.1:3000/mcp
```

Auth is disabled by default for local development and `npm run smoke`.

## Remote Server Config

For a deployed HandoffBase server, adapt:

```text
examples/mcp/remote-server-config.example.json
```

Use placeholders while editing docs or templates:

```text
https://your-handoffbase.example.com/mcp
<your-handoffbase-api-key>
```

The HandoffBase API key protects the MCP endpoint. It is not a Qwen or
DashScope key. Keep Qwen and DashScope credentials on the backend only.

## Tools To Try

These examples focus on the core continuity loop:

- `continuity_bootstrap`
- `memory_recall`
- `memory_remember`
- `memory_trace`

The quickstart walkthroughs in [`../quickstart`](../quickstart/) show the
payloads and expected response fields.
