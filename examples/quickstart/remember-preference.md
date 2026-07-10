# Quickstart: Remember a Preference

Use `memory_remember` when the user teaches the agent a durable preference,
procedure, correction, or project fact.

## Start Local Mock Mode

```bash
npm ci
npm run dev:server
```

Local mock mode does not require Qwen or DashScope credentials.

## Optional Qwen-Backed Mode

```bash
cp .env.example .env.local
```

Set one backend provider key in `.env.local`:

```text
QWEN_API_KEY=
```

or:

```text
DASHSCOPE_API_KEY=
```

Never commit `.env.*` files.

The root server launcher loads `.env.local` automatically when it exists and
never prints its values.

## Call The Tool

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_remember examples/http/payloads/memory-remember-preferences.json
```

For a remote server, use a HandoffBase API key:

```bash
export MCP_ENDPOINT=https://your-handoffbase.example.com/mcp
export MCP_AUTH_TOKEN=
npm run mcp:call -- memory_remember examples/http/payloads/memory-remember-preferences.json
```

Set `MCP_AUTH_TOKEN` to your HandoffBase API key only in your shell or secret
manager.

## Expected Shape

The response should include:

```json
{
  "candidate_memories": [
    {
      "type": "user_preference",
      "text": "..."
    }
  ]
}
```

Candidate memories may be returned as `pending` when review is required.
