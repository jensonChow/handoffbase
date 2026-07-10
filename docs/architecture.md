# HandoffBase Architecture

HandoffBase is an MCP-native memory handoff layer for AI agents. It is not an
agent runtime, a generic vector store wrapper, or a project-local note file. Its
job is to expose durable memory operations through MCP so different hosts can
share the same governed continuity layer without changing their own runtimes.

The current project is in product-proof integration mode. The default path is
still intentionally narrow and credential-free: Remote Streamable HTTP MCP,
`MockMemoryProvider`, and an in-memory store. Postgres runtime selection,
explicit migration, server-backed dashboard access, conflict resolution, and a
real HTTP/MCP cross-host proof are implemented. The separate Alibaba Cloud ECS
record remains historical Qwen/API-key/in-memory proof; the instance was later
stopped to reduce cost.

## System Shape

```mermaid
flowchart LR
  subgraph Hosts["MCP hosts"]
    Codex["Codex"]
    Claude["Claude Code"]
    Cursor["Cursor"]
    Custom["Custom MCP host"]
  end

  subgraph Remote["Remote Streamable HTTP MCP"]
    Endpoint["/mcp endpoint"]
  end

  subgraph ServerLayer["HandoffBase MCP server"]
    Surface["MCP tools<br/>memory:// resources<br/>memory prompts"]
    Service["Memory service layer"]
  end

  subgraph ProviderLayer["Reasoning provider boundary"]
    ProviderBoundary["MemoryReasoningProvider"]
    QwenProvider["QwenMemoryProvider"]
    MockProvider["MockMemoryProvider"]
  end

  subgraph CoreLayer["Memory core"]
    Core["Records, lifecycle,<br/>validation, scopes"]
    Store["MemoryStore"]
    InMemory["InMemoryMemoryStore<br/>credential-free default"]
    Postgres["PostgresMemoryStore + pgvector<br/>opt-in runtime"]
    Events["Memory events"]
    Trace["Memory traces"]
    Conflicts["Memory conflict records"]
  end

  subgraph DashboardLayer["Memory Vault dashboard"]
    Dashboard["Governance UI"]
    DashboardAPI["Same-origin server API"]
    Pending["Pending review"]
    ConflictReview["Conflict review"]
    TraceView["Trace view"]
  end

  subgraph CloudProof["Alibaba Cloud deployment proof"]
    ECS["ECS + Docker backend proof"]
    Limits["Public HTTP IP proof<br/>no TLS, LB, domain, or managed gateway"]
  end

  Codex --> Endpoint
  Claude --> Endpoint
  Cursor --> Endpoint
  Custom --> Endpoint
  Endpoint --> Surface
  Surface --> Service

  Service --> ProviderBoundary
  ProviderBoundary --> QwenProvider
  ProviderBoundary --> MockProvider
  QwenProvider --> QwenCloud["Qwen Cloud"]

  Service --> Core
  Core --> Store
  Store --> InMemory
  Store --> Postgres
  Core --> Events
  Core --> Trace
  Core --> Conflicts

  Dashboard --> DashboardAPI
  DashboardAPI -->|same MemoryStore selection| Store
  Dashboard --> Pending
  Dashboard --> ConflictReview
  Dashboard --> TraceView

  ECS -. "validated deployment proof; instance currently stopped" .-> Endpoint
  ECS --> Limits
```

The standalone Mermaid source lives in
[`docs/assets/architecture.mmd`](assets/architecture.mmd).

## Host Boundary

HandoffBase is designed for hosts that can speak MCP:

- Codex
- Claude Code
- Cursor
- custom MCP hosts

Hosts do not need to adopt a new agent runtime. They connect to the HandoffBase
MCP endpoint, discover tools/resources/prompts, and call memory operations during
normal agent work.

The first version is remote-only. Local stdio transport is not part of the MVP
because the product value is a shared cloud memory layer across sessions,
projects, hosts, and devices.

## MCP Server Boundary

The MCP server exposes a Remote Streamable HTTP endpoint at `/mcp`. The current
manifest contains eight tools, nine `memory://` resources, and four prompts.
Tool names, resource URIs, and prompt names are part of the public interface and
should not change without an explicit compatibility decision.

The eighth tool, `memory_resolve_conflict`, applies an authorized decision to a
first-class conflict record. It supports accepting or rejecting the candidate,
superseding the existing memory, merging canonical text, keeping both memories,
or dismissing the conflict, with scope checks and audit events.

The server layer stays thin. It resolves caller scope, enforces auth/scope
guards, validates tool inputs, and delegates memory behavior to the service and
core packages.

## Reasoning Boundary

Qwen Cloud powers reasoning-heavy memory operations in the hackathon version:

- extracting durable memories from user corrections, task notes, and run output
- classifying memory type, scope, confidence, importance, and validity
- detecting conflicts between candidate and existing memories
- building token-budgeted context packs
- reflecting on completed runs
- explaining why memories were selected or ignored

Qwen is isolated behind the `MemoryReasoningProvider` boundary. The concrete
adapter is `QwenMemoryProvider`; the local and CI-safe path is
`MockMemoryProvider`. This keeps Memory Core provider-agnostic and prevents MCP
handlers from calling Qwen directly.

Provider input is sanitized before prompt construction. The sanitizer redacts or
rejects obvious secrets and truncates oversized structures so raw tool logs,
headers, cookies, private keys, and credential-like values do not become prompt
payloads.

## Memory Core Boundary

`packages/memory-core` is the provider-neutral domain package. It defines:

- memory types and lifecycle statuses
- scoped `MemoryRecord` objects
- `MemoryStore`
- events
- runs
- traces
- embeddings
- conflict records
- validation and sensitive-data checks

The core durable object is canonical memory text with metadata. Raw source is
optional; HandoffBase should not persist full raw chat logs by default.

## Store Boundary

`MemoryStore` is the storage interface used by the service layer.

`InMemoryMemoryStore` is the default store. It keeps local development and CI
credential-free, deterministic, and free of external services. Stored memories
do not survive a process restart.

`PostgresMemoryStore` is an implemented path in `packages/memory-core`. It
supports core CRUD, recall, traces, events, embeddings, and conflicts, and the
repository includes a Postgres/pgvector migration. `STORE_MODE=postgres`
selects it for the MCP server and requires `DATABASE_URL`; operators must first
run `DATABASE_URL=<postgres-url> npm run db:migrate`. Startup never migrates a
database implicitly. The implementation provides a durable runtime path, but no
production cloud database has been provisioned or validated.

## Trace Governance

Recall is not a black box. `continuity_bootstrap` and `memory_recall` return a
trace id for the final context pack that the host receives. `memory_trace` and
`memory://traces/{trace_id}` expose which memories were selected, ignored, or
excluded and why.

This matters because a memory system can silently shape agent behavior. Trace
records make context selection inspectable and give users a way to audit why an
agent carried a lesson forward.

## Conflict Governance

Conflict records are first-class governance records. When Qwen detects a
contradiction, duplicate, supersede candidate, or scope overlap, HandoffBase can
hold the candidate as `pending` and write a conflict record instead of silently
overwriting active memory.

This supports review flows such as:

- ask the user before replacing an important preference
- merge two overlapping procedure memories
- supersede stale facts explicitly
- keep both memories when scopes are different
- reject unsafe or low-confidence candidates

`memory_resolve_conflict` closes that governance loop. The service authorizes
the caller against both linked memories, applies lifecycle mutations with
auditable provenance, persists the terminal conflict state, serializes
competing decisions, and compensates partial mutations if persistence fails.

The important property is not that HandoffBase always knows the right answer. It
is that changes to durable memory are reviewable rather than invisible.

## Memory Vault Dashboard

The Memory Vault dashboard is a Next.js interface for inspecting and governing
memory. The browser uses same-origin dashboard API routes by default. The
server-side backend follows the same `STORE_MODE` and `DATABASE_URL` as the MCP
runtime: in-memory mode seeds demo data, while Postgres mode disables demo
seeding and reads the shared durable store.

Postgres dashboard mode fails closed unless private server-side
`HANDOFFBASE_DASHBOARD_TENANT_ID` and `HANDOFFBASE_DASHBOARD_USER_ID` values are
set; optional agent, project, and host values narrow that scope. None of those
scope values are exposed through `NEXT_PUBLIC_*`. Set
`HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock` only for the isolated fixture demo.

## Live Deployment Proof

The deployed proof is recorded in
[`docs/deployment/alibaba-cloud-proof.md`](deployment/alibaba-cloud-proof.md).
It shows a single Alibaba Cloud ECS instance running the Dockerized server.

Historical `/health` proof from 2026-07-07:

```text
authMode=api_key
providerMode=qwen
storeMode=in-memory
```

That historical image returned the then-current seven-tool MCP surface and
validated discovery, `memory_recall`, and Qwen-backed `memory_remember`. It
predates the integrated eighth tool and Postgres wiring, so a future relaunch
must rebuild and revalidate the current image before making current-runtime
claims.

The ECS instance has since been stopped to reduce cost. Treat the deployment
record as proof that validation passed, not as a guarantee that the public
endpoint is currently online.

## Current Limitations

- Runtime storage was in-memory on the historical live proof; the integrated
  Postgres path has not been deployed to cloud infrastructure.
- The public ECS endpoint is HTTP on an IP address, without domain, TLS, load
  balancer, or managed gateway.
- The dashboard is server-backed by default but is not a hardened production
  admin console.
- HandoffBase should not claim to be more mature or more production-ready than
  established managed memory platforms.

These limits are part of the architecture story. HandoffBase is serious
infrastructure because the boundaries are explicit: MCP interface, reasoning
provider, memory core, storage adapter, trace records, conflict records, and user
governance.
