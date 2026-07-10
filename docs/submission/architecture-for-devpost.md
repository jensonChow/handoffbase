# Architecture For Devpost

HandoffBase is a Remote Streamable HTTP MCP memory layer for AI agents. Codex,
Claude Code, Cursor, and custom MCP hosts connect to one `/mcp` endpoint, call
memory tools, read `memory://` resources, and receive trace ids for the memory
context that shaped a run.

The current implementation is intentionally honest in scope. The backend proof
ran on Alibaba Cloud ECS with Docker, API-key auth, Qwen-backed reasoning, and
the in-memory demo store. The ECS instance has since been stopped to reduce
cost, so the proof should be treated as validated deployment evidence, not as a
currently online production endpoint.

## Diagram

Source: [docs/assets/architecture.mmd](../assets/architecture.mmd)

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
    Feedback["Memory feedback records"]
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
  Core --> Feedback

  Dashboard --> DashboardAPI
  DashboardAPI -->|caller-bound mutations| Service
  DashboardAPI -->|caller-scoped snapshots| Store
  Dashboard --> Pending
  Dashboard --> ConflictReview
  Dashboard --> TraceView

  ECS -. "validated deployment proof; instance currently stopped" .-> Endpoint
  ECS --> Limits
```

## Qwen Role

Qwen powers the reasoning-heavy parts of the hackathon architecture behind the
`MemoryReasoningProvider` boundary. The concrete adapter is
`QwenMemoryProvider`; local development and CI can use `MockMemoryProvider`
without credentials.

Qwen is used for:

- extracting durable memories from conversations, run summaries, and task notes
- classifying memory type, scope, importance, confidence, and validity
- detecting conflicts with existing memory
- packing relevant memories into token-budgeted context
- reflecting on completed runs
- explaining trace decisions for selected, ignored, and excluded memories

Qwen-specific code stays behind the provider adapter so Memory Core remains
provider-agnostic.

## Alibaba Cloud Role

Alibaba Cloud is the deployment proof for the backend. The project has evidence
of an ECS instance running the Dockerized HandoffBase server with `/health`, MCP
`tools/list`, authenticated `memory_recall`, and Qwen-backed
`memory_remember` validation.

The proof demonstrates ECS + Docker backend deployment. It does not claim a
managed SaaS stack, durable cloud database, TLS endpoint, load balancer, domain,
or managed gateway.

## Current Store

The live proof used `storeMode=in-memory`. `InMemoryMemoryStore` is therefore
the current live demo store, and data should not be described as durable across
process restarts.

`PostgresMemoryStore`, the pgvector migration, `STORE_MODE=postgres`, and the
`DATABASE_URL` runtime adapter are implemented. Migration is explicit through
`npm run db:migrate`; in-memory remains the credential-free default. HandoffBase
should not claim Postgres-backed live persistence until a dedicated database is
provisioned and validated in an approved deployment.

## Dashboard

The Memory Vault dashboard is a governance UI. It is meant to show
how users and operators inspect memory, review pending candidates, inspect
trace decisions, and resolve conflicts instead of letting agent memory mutate
silently.

The browser uses same-origin server APIs by default. An API-key sign-in creates
a signed HttpOnly caller session; mutation routes then call the same
`ContinuityMemoryService` governance boundary as MCP, while direct store access
is limited to caller-scoped snapshots and audit reads. The backend follows the
MCP runtime's `STORE_MODE` and `DATABASE_URL`, and Postgres mode disables demo
seeding. It is not yet a production admin console.

## Current Limitations

- The ECS proof is currently stopped to reduce cost; do not assume the endpoint
  is online.
- The deployed proof used public HTTP on an IP address.
- No TLS certificate, custom domain, load balancer, or managed gateway is part
  of the current proof.
- Runtime storage for the live proof is in-memory.
- Postgres/pgvector is opt-in and has not been validated in the live Alibaba
  proof; the default runtime remains in-memory.
- The Memory Vault dashboard is server-backed but not production hardened.
- HandoffBase should not be described as production SaaS ready.

## Render Instructions

No Mermaid export CLI is included in this repository. To create a submission
image without adding dependencies:

1. Open [docs/assets/architecture.mmd](../assets/architecture.mmd).
2. Paste the source into Mermaid Live Editor, or preview the Mermaid block in
   GitHub Markdown.
3. Export SVG or PNG from the preview.
4. Confirm the exported image contains no console output, browser session data,
   credentials, auth headers, API keys, database URLs, coupon/voucher codes, or
   cloud account details.
