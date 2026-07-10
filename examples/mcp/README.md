# Codex MCP Host Examples

HandoffBase exposes MCP over Streamable HTTP at `/mcp`. These examples use
Codex's canonical `config.toml` format, shared by the Codex CLI, IDE extension,
and ChatGPT desktop app. Add the table to `~/.codex/config.toml` or to a trusted
project's `.codex/config.toml`, then restart the Codex client.

See the official [Codex MCP configuration documentation](https://developers.openai.com/codex/mcp)
for the full option reference.

## Local Server

Start the local HandoffBase server:

```bash
npm run dev:server
```

Copy [`codex-local.config.toml`](codex-local.config.toml) into the Codex config:

```toml
[mcp_servers.handoffbase_local]
url = "http://127.0.0.1:3000/mcp"
required = true
startup_timeout_sec = 10
tool_timeout_sec = 60
```

Local auth is disabled by default. Run `codex mcp list` or use `/mcp` in Codex
after restarting to confirm that `handoffbase_local` connected.

## Remote Server With Bearer Auth

Export a temporary HandoffBase access token in the environment that starts
Codex. This is a HandoffBase MCP token, not a Qwen or DashScope key:

```bash
export HANDOFFBASE_MCP_TOKEN=<temporary-handoffbase-access-token>
```

Copy [`codex-remote.config.toml`](codex-remote.config.toml), replace its example
HTTPS URL with the deployed `/mcp` endpoint, and restart Codex:

```toml
[mcp_servers.handoffbase_remote]
url = "https://handoffbase.example.com/mcp"
bearer_token_env_var = "HANDOFFBASE_MCP_TOKEN"
required = true
startup_timeout_sec = 20
tool_timeout_sec = 60
```

`bearer_token_env_var` makes Codex send
`Authorization: Bearer <token-from-HANDOFFBASE_MCP_TOKEN>` without storing the
value in `config.toml`. HandoffBase also accepts `X-Handoffbase-Api-Key`; Codex
can source that alternative header from the same environment variable with:

```toml
env_http_headers = { "X-Handoffbase-Api-Key" = "HANDOFFBASE_MCP_TOKEN" }
```

Use either Bearer auth or the explicit header, not both. Keep Qwen and DashScope
credentials on the HandoffBase backend only.

## Tools To Try

Start with the continuity loop:

- `continuity_bootstrap`
- `memory_recall`
- `memory_remember`
- `memory_trace`

The [quickstart walkthroughs](../quickstart/) contain payloads and expected
response fields for those tools.
