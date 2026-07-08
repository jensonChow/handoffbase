# HandoffBase

Open memory handoff for AI agents.

HandoffBase is an MCP-native memory layer that lets AI agents preserve, inspect, and hand off user preferences, project context, procedures, failures, and traces across sessions, hosts, and projects.

It is built for the missing layer between agent runtimes: Codex, Claude Code, Cursor, and custom MCP hosts can all call the same memory interface instead of trapping useful context inside one local session.

## Why HandoffBase

Modern agents can reason well inside one conversation, but continuity is fragmented:

- user preferences and corrections are lost between sessions,
- project files such as `AGENTS.md` or `CLAUDE.md` only help inside one repo,
- every host has its own memory shape,
- users rarely get a clear trace of which memories affected an answer,
- old or conflicting memories can silently pollute future work.

HandoffBase exposes memory as a Remote Streamable HTTP MCP server. Agents can remember, recall, bootstrap, reflect, trace, update, and forget through one portable interface, while users keep a reviewable Memory Vault.

## Core Idea

```text
MCP hosts
  Codex / Claude Code / Cursor / custom agents
        |
        | Remote Streamable HTTP MCP
        v
HandoffBase MCP server
        |
        +-- MemoryReasoningProvider
        |     +-- QwenMemoryProvider for hackathon memory reasoning
        |     +-- MockMemoryProvider for local deterministic development
        |
        +-- MemoryStore
              +-- InMemoryMemoryStore for current live demo/runtime default
              +-- PostgresMemoryStore implemented as future runtime wiring path
```

Qwen Cloud powers the reasoning-heavy memory operations in the hackathon path: extraction, classification, conflict detection, context-pack building, reflection, and trace explanations. The memory core remains provider-agnostic behind `MemoryReasoningProvider`.

## Features

- MCP-native memory handoff through Remote Streamable HTTP at `/mcp`.
- Seven MCP tools for bootstrap, recall, remember, reflect, update, forget, and trace.
- Nine `memory://` resources for user, agent, project, run, trace, pending, and conflict views.
- Qwen-backed memory reasoning through `QwenMemoryProvider`.
- Deterministic local mock mode that runs without Qwen credentials.
- Memory lifecycle status model: pending, active, invalidated, expired, superseded, archived, deleted.
- Traceable context packs that show used, ignored, and excluded memories.
- Conflict records so new memories do not silently overwrite older ones.
- Memory Vault dashboard prototype for local governance demos.
- Alibaba Cloud ECS deployment proof for the current Qwen-backed live path.

## Quickstart

```bash
npm install
npm run check
npm run dev:server
```

The local server listens on:

```text
http://127.0.0.1:3000/mcp
```

If port `3000` is already in use:

```bash
PORT=3333 npm run dev:server
```

Smoke-test MCP registration:

```bash
npm run smoke
```

Useful commands:

```bash
npm run build
npm run build:server
npm run test
npm run test:dashboard
npm run dashboard:build
npm run eval:memory
npm run demo:flow
npm run demo:jsonrpc
```

`npm run check` is the local CI-parity command. It typechecks, builds, runs the MCP registration smoke test, auth/scope tests, server route tests, memory-core tests, and dashboard API tests.

## Qwen Setup

Local development uses `MockMemoryProvider` by default. To run Qwen-backed mode, keep credentials only in an ignored environment file:

```bash
cp .env.example .env.local
```

Set one backend model key:

```bash
QWEN_API_KEY=<your-qwen-api-key>
# or
DASHSCOPE_API_KEY=<your-dashscope-api-key>
```

Never commit `.env.*` files.

HandoffBase API keys and Qwen/DashScope keys are separate:

- HandoffBase API keys protect the MCP endpoint when `HANDOFFBASE_AUTH_MODE=api_key`.
- Qwen/DashScope keys stay only on the backend and are never sent to MCP clients.

## Remote Validation

For a deployed backend, use the validator with placeholders:

```bash
MCP_ENDPOINT=https://your-handoffbase.example.com/mcp \
MCP_AUTH_TOKEN=<your-handoffbase-api-key> \
npm run mcp:validate-remote
```

The current Alibaba Cloud proof is recorded in [docs/deployment/alibaba-cloud-proof.md](docs/deployment/alibaba-cloud-proof.md). It is a temporary deployment proof, not a production SaaS endpoint. The proof shows `authMode=api_key`, `providerMode=qwen`, and `storeMode=in-memory`.

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `continuity_bootstrap` | Build a compact context pack at the start of a session. |
| `memory_recall` | Retrieve relevant memories for a task, query, and scope. |
| `memory_remember` | Extract durable memory candidates from corrections, notes, or observations. |
| `memory_reflect` | Reflect on a completed run and propose durable memories. |
| `memory_update` | Edit, merge, or supersede an existing memory record. |
| `memory_forget` | Invalidate, archive, expire, or delete an existing memory record. |
| `memory_trace` | Explain which memories were used, ignored, or excluded. |

## MCP Resources

```text
memory://users/{user_id}/profile
memory://agents/{agent_profile_id}/procedures
memory://agents/{agent_profile_id}/failures
memory://projects/{project_id}/facts
memory://projects/{project_id}/tool-notes
memory://runs/{run_id}/summary
memory://traces/{trace_id}
memory://vault/pending
memory://vault/conflicts
```

## Memory Lifecycle

Agents create memory through `memory_remember` and `memory_reflect`. Agents use memory through `continuity_bootstrap` and `memory_recall`. Users and dashboards inspect memory through `memory_trace`, trace resources, pending resources, conflict resources, and the Memory Vault dashboard.

Governance is explicit:

- new extraction can stay `pending`,
- approved memories become `active`,
- stale memories can become `expired`, `invalidated`, `superseded`, `archived`, or `deleted`,
- conflict records hold candidate-versus-existing memory decisions for review,
- trace records show why a memory was used or ignored.

See [docs/memory-lifecycle.md](docs/memory-lifecycle.md).

## Dashboard

The Memory Vault dashboard is a local governance prototype. It runs in mock mode by default and does not depend on the live Alibaba ECS endpoint.

```bash
npm run dashboard:dev
```

Build it with:

```bash
npm run dashboard:build
```

See [docs/demo-dashboard.md](docs/demo-dashboard.md).

## Examples

- [examples/README.md](examples/README.md): local, Qwen-backed, and remote usage paths.
- [examples/mcp/README.md](examples/mcp/README.md): MCP host config snippets with placeholders.
- [examples/http/README.md](examples/http/README.md): safe JSON-RPC examples and payload files.
- [examples/quickstart/bootstrap-session.md](examples/quickstart/bootstrap-session.md)
- [examples/quickstart/recall-memory.md](examples/quickstart/recall-memory.md)
- [examples/quickstart/remember-preference.md](examples/quickstart/remember-preference.md)
- [examples/quickstart/trace-memory.md](examples/quickstart/trace-memory.md)

## Architecture And Positioning

- [docs/architecture.md](docs/architecture.md): current architecture and deployment shape.
- [docs/assets/architecture.mmd](docs/assets/architecture.mmd): Mermaid architecture diagram.
- [docs/comparison.md](docs/comparison.md): respectful comparison with Mem0, Zep, Letta, LangMem, repo-local memory files, and generic RAG/vector DBs.
- [docs/evals.md](docs/evals.md): benchmark-aware eval positioning and local eval pack.

HandoffBase is not a managed-memory replacement for every use case. It is an open-source, MCP-native memory handoff layer focused on cross-agent continuity, traceable context packs, conflict governance, and user control.

## Current Status

Implemented now:

- Remote Streamable HTTP MCP server at `/mcp`.
- Seven tools, nine resources, and four prompts.
- `packages/memory-core` with lifecycle, events, traces, conflict records, safety validation, in-memory store, and Postgres store implementation.
- `QwenMemoryProvider` and `MockMemoryProvider` behind `MemoryReasoningProvider`.
- Local dashboard prototype with mock/default mode and HTTP API route mode.
- Remote validator at `scripts/validate-remote-mcp.mjs`, exposed as `npm run mcp:validate-remote`.
- Alibaba Cloud ECS proof showing Qwen-backed operation with in-memory store.

Limitations:

- The live deployment currently uses `InMemoryMemoryStore`.
- `PostgresMemoryStore` exists, but runtime `STORE_MODE=postgres` wiring is future work.
- The public ECS demo proof uses an HTTP IP endpoint, not production TLS.
- The dashboard is a governance prototype, not a hosted production control plane.
- The eval pack is a small deterministic local suite, not an official benchmark score.

## License

MIT. See [LICENSE](LICENSE).
