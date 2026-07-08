# HandoffBase Architecture

HandoffBase is an MCP-native memory handoff layer. It gives multiple AI hosts a shared memory control plane without requiring those hosts to adopt one agent runtime.

## Current Shape

- MCP hosts: Codex, Claude Code, Cursor, and custom MCP hosts.
- Transport: Remote Streamable HTTP MCP server.
- Server endpoint: `/mcp`.
- Health endpoint: `/health`.
- Reasoning boundary: `MemoryReasoningProvider`.
- Hackathon provider: `QwenMemoryProvider`.
- Local deterministic provider: `MockMemoryProvider`.
- Store boundary: `MemoryStore`.
- Current live store: `InMemoryMemoryStore`.
- Implemented future path: `PostgresMemoryStore`.
- Dashboard: Memory Vault governance prototype.
- Deployment proof: Alibaba Cloud ECS + Docker.

The current live deployment is documented in [docs/deployment/alibaba-cloud-proof.md](deployment/alibaba-cloud-proof.md). Its `/health` proof reports:

```json
{
  "authMode": "api_key",
  "providerMode": "qwen",
  "storeMode": "in-memory"
}
```

That means the deployed proof exercises Qwen-backed memory reasoning, while the runtime store is still the in-memory MVP store.

## Components

### MCP Hosts

Codex, Claude Code, Cursor, or any MCP-capable host can discover HandoffBase tools, resources, and prompts. Hosts call the same tool names regardless of the local agent environment.

### MCP Server

The server registers:

- seven tools: `continuity_bootstrap`, `memory_recall`, `memory_remember`, `memory_reflect`, `memory_update`, `memory_forget`, and `memory_trace`;
- nine `memory://` resources;
- four reusable memory workflow prompts.

The server layer stays thin. Memory behavior lives behind service, provider, and store interfaces.

### Memory Reasoning Provider

`MemoryReasoningProvider` is the provider boundary for extraction, classification, conflict detection, context-pack building, run reflection, and trace explanations.

`QwenMemoryProvider` is the hackathon provider. It uses Qwen Cloud through an OpenAI-compatible chat completions endpoint and structured-output validation.

`MockMemoryProvider` is the local and CI path. It keeps tests and examples credential-free.

### Memory Core

`packages/memory-core` owns the domain model:

- memory records and scopes,
- memory statuses and lifecycle helpers,
- memory events,
- trace records,
- conflict records,
- sensitive-content rejection,
- `MemoryStore`,
- in-memory and Postgres store implementations.

### Memory Store

`InMemoryMemoryStore` is the current live runtime default. It supports local development, demo flows, trace records, conflict records, and dashboard data without external infrastructure.

`PostgresMemoryStore` exists as an implemented persistence path, with migration files under `packages/memory-core/migrations`. Runtime `STORE_MODE=postgres` wiring is still future work and should not be implied as active in the live deployment.

### Trace And Conflict Governance

Every recall/bootstrap can produce a trace with selected and ignored memories plus a compact context pack. `memory_trace` and `memory://traces/{trace_id}` make those decisions inspectable.

Conflict records compare candidate memories with existing memories. They prevent silent overwrites and give dashboards or users a place to resolve supersede, merge, duplicate, and scope-overlap decisions.

### Memory Vault Dashboard

The dashboard prototype makes the governance layer visible:

- all memories by type, scope, status, confidence, and importance,
- pending Qwen/agent-extracted candidates,
- trace views for used, ignored, and excluded memories,
- conflict review showing candidate versus existing memory.

The dashboard defaults to mock data and does not depend on the remote ECS endpoint.

## Diagram

See [docs/assets/architecture.mmd](assets/architecture.mmd).

## Current Limitations

- The live demo uses `InMemoryMemoryStore`.
- `PostgresMemoryStore` is implemented but not wired as the runtime default.
- The public ECS proof uses HTTP on an IP address, not production TLS.
- The dashboard is a local governance prototype.
- The project is in open-source/star-readiness mode, not a full managed SaaS mode.
