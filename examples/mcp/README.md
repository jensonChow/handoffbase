# MCP Host Examples

HandoffBase exposes MCP over Streamable HTTP at `/mcp`. Any MCP host that speaks
Streamable HTTP can connect to it. These examples cover **Codex**, **Claude
Code**, and **Cursor** with a local server and an authenticated remote server.

Start the local server first:

```bash
npm run dev:server
```

The default endpoint is `http://127.0.0.1:3000/mcp`. Local auth is disabled by
default, so the local recipes need no token.

> **Tokens stay out of tracked files.** For remote servers, keep the HandoffBase
> access token in an environment variable and let the host read it. The examples
> below never write a token into config. This is a HandoffBase MCP token, not a
> Qwen or DashScope key.

```bash
export HANDOFFBASE_MCP_TOKEN=<temporary-handoffbase-access-token>
```

HandoffBase accepts either `Authorization: Bearer <token>` or
`X-Handoffbase-Api-Key: <token>`. Use one, not both.

---

## Codex

Codex uses a `config.toml` table, shared by the Codex CLI, IDE extension, and
ChatGPT desktop app. Add the table to `~/.codex/config.toml` or a trusted
project's `.codex/config.toml`, then restart the Codex client. See the official
[Codex MCP configuration docs](https://developers.openai.com/codex/mcp).

**Local** — copy [`codex-local.config.toml`](codex-local.config.toml):

```toml
[mcp_servers.handoffbase_local]
url = "http://127.0.0.1:3000/mcp"
required = true
startup_timeout_sec = 10
tool_timeout_sec = 60
```

**Remote with Bearer auth** — copy [`codex-remote.config.toml`](codex-remote.config.toml)
and replace the example URL with your deployed `/mcp` endpoint:

```toml
[mcp_servers.handoffbase_remote]
url = "https://handoffbase.example.com/mcp"
bearer_token_env_var = "HANDOFFBASE_MCP_TOKEN"
required = true
startup_timeout_sec = 20
tool_timeout_sec = 60
```

`bearer_token_env_var` makes Codex send `Authorization: Bearer <token>` without
storing the value in `config.toml`. To use the custom header instead:

```toml
env_http_headers = { "X-Handoffbase-Api-Key" = "HANDOFFBASE_MCP_TOKEN" }
```

Run `codex mcp list` or use `/mcp` in Codex after restarting to confirm the
connection.

---

## Claude Code

Claude Code adds Streamable HTTP servers with `claude mcp add --transport http`.
See the official [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).

**Local:**

```bash
claude mcp add --transport http handoffbase http://127.0.0.1:3000/mcp
```

**Remote with Bearer auth** (`--scope project` shares it via a repo `.mcp.json`;
omit it for a private, machine-local server):

```bash
claude mcp add --transport http handoffbase https://handoffbase.example.com/mcp \
  --scope project \
  --header "Authorization: Bearer ${HANDOFFBASE_MCP_TOKEN}"
```

Use `--header "X-Handoffbase-Api-Key: ${HANDOFFBASE_MCP_TOKEN}"` for the custom
header instead.

For a project-scoped setup you can commit the config shape (not the token)
directly. Copy [`claude-code.mcp.json`](claude-code.mcp.json) to `.mcp.json` at
your repo root — Claude Code expands `${HANDOFFBASE_MCP_TOKEN}` from the
environment, so no secret is written to the file:

```json
{
  "mcpServers": {
    "handoffbase": {
      "type": "http",
      "url": "https://handoffbase.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${HANDOFFBASE_MCP_TOKEN}"
      }
    }
  }
}
```

Verify with `claude mcp list`, `claude mcp get handoffbase`, or `/mcp` inside a
session.

---

## Cursor

Cursor reads MCP servers from `.cursor/mcp.json` in a project (or
`~/.cursor/mcp.json` globally). See the official
[Cursor MCP docs](https://docs.cursor.com/context/mcp). Cursor infers Streamable
HTTP / SSE transport from a `url` server entry.

**Local** — create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "handoffbase": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

**Remote with Bearer auth** — copy [`cursor-mcp.json`](cursor-mcp.json) to
`.cursor/mcp.json` and set `HANDOFFBASE_MCP_TOKEN` in your environment:

```json
{
  "mcpServers": {
    "handoffbase": {
      "url": "https://handoffbase.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${HANDOFFBASE_MCP_TOKEN}"
      }
    }
  }
}
```

Open **Cursor Settings → MCP** to confirm `handoffbase` shows a connected status
and its tools are listed.

---

## Tools To Try

Once connected, start with the continuity loop:

- `continuity_bootstrap`
- `memory_recall`
- `memory_remember`
- `memory_trace`

The [quickstart walkthroughs](../quickstart/) contain payloads and expected
response fields for those tools. Keep Qwen and DashScope credentials on the
HandoffBase backend only — hosts never need them.
