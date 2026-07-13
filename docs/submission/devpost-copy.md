# Devpost Copy

## Project Name

HandoffBase

## Track

Track 1: MemoryAgent

## One-Liner

Open memory handoff for AI agents.

## Short Description

HandoffBase is an MCP-native memory handoff layer that lets AI agents carry
governed continuity across sessions, hosts, projects, and tools. It uses Qwen
Cloud for memory extraction, conflict detection, context packing, reflection,
and trace explanation, then exposes the result through Remote Streamable HTTP
MCP tools, resources, and prompts. The current open-source MVP includes a
Qwen-backed Alibaba Cloud ECS deployment proof, deterministic comparative and
cross-host product gates, a cleaned-format LongMemEval adapter, and a
server-backed Memory Vault dashboard for review and governance.

## Long Description

AI agents are becoming useful collaborators, but their memory is still
fragmented. A user can spend weeks teaching one coding agent how they prefer
handoffs, what tools are brittle, which project decisions are settled, and which
mistakes should not repeat. Then a new session, a different host, or a different
project starts cold. Repo-local files help, but they do not give users a shared,
inspectable, cross-host memory layer.

HandoffBase is a small open-source answer to that gap. It is an MCP-native
memory handoff layer for AI agents. Codex, Claude Code, Cursor, or any custom
MCP host can connect to the same Remote Streamable HTTP server and use explicit
memory tools instead of relying on hidden chat history. Agents can bootstrap a
new session with relevant continuity, recall task-specific memory, remember new
durable facts or procedures, reflect on completed runs, update stale memory,
forget unwanted memory, and inspect why a memory was used.

Qwen Cloud is central to the hackathon version. HandoffBase uses Qwen-backed
reasoning behind a provider interface to extract durable memories from user
corrections, task notes, and run summaries; classify type, scope, confidence,
importance, and validity; detect contradictions with existing memory; build
token-budgeted context packs; reflect on completed agent runs; and explain
which memories were selected, ignored, or excluded. The product stays
provider-agnostic at the memory-core boundary, but Qwen is the first real
reasoning provider and powers the cloud validation path.

The memory model is intentionally more governed than ordinary retrieval.
HandoffBase tracks typed memory records, lifecycle status, scope, events, runs,
traces, feedback, and conflict records. If a candidate memory contradicts an existing
preference, it can remain pending and create a conflict record instead of
silently overwriting the older fact. If a context pack uses or ignores memory,
the host receives a trace id. Users and operators can later ask what shaped the
agent's context and why, mark the result helpful or unhelpful, and route a
correction through pending review. That makes memory auditable and iterative,
not just convenient.

The current implementation is a runnable MVP. The MCP server exposes nine
tools, nine `memory://` resources, and four reusable prompts. The memory core
includes validation, sensitive-data rejection, trace/feedback/conflict records,
physical hard delete with content-redacted audit tombstones, an in-memory
default, and an explicit Postgres/pgvector runtime after migration.
The local developer path uses a deterministic
`MockMemoryProvider`, so contributors can run checks without Qwen credentials or
paid cloud access. The repository also includes a deterministic AI Opportunity
Scout eval pack that exercises recall, bootstrap traces, token-budget behavior,
candidate creation, controlled conflicts, and forgetting.

HandoffBase also includes a Memory Vault dashboard. API-key sign-in creates a
signed HttpOnly caller session, production state-changing requests require
same origin, and mutation routes use the same service governance boundary as MCP. Postgres
mode can share the MCP runtime database. The dashboard shows vault records,
deletion audit, pending review, trace feedback, and all six conflict actions for
a demo scenario where an opportunity-scouting agent learns a user's hackathon
preferences and later applies them across sessions. The dashboard is not a full
production admin console yet, but it demonstrates the user-facing governance
loop that makes memory trustworthy.

Alibaba Cloud is the live judging deployment. HandoffBase runs on one prepaid
Alibaba Cloud International ECS instance in Singapore with Docker, Caddy HTTPS,
Postgres/pgvector, API-key auth, Qwen reasoning, and Qwen embeddings. Strict
public-hostname validation covered `/health`, authenticated `/ready`, the exact
nine-tool MCP manifest, `memory_recall`, and Qwen-backed `memory_remember` with
persisted pending candidates. An exact memory remained after an application
restart, proving that the deployed store survives process restarts.

The honest limitation is that HandoffBase is not yet a production SaaS memory
platform. The live Postgres database and Caddy TLS state are on one ECS host;
the verified logical backup is off-server, but it is not a managed backup
service. The hostname is a free `sslip.io` address, monitoring is minimal, and
no full official benchmark run or official score exists. The point of the
project is narrower and concrete:
make memory portable, traceable, governed, and accessible through MCP, so agents
can behave like long-term collaborators without forcing users into one runtime.

## What It Does

- Exposes a Remote Streamable HTTP MCP server for agent memory handoff.
- Lets hosts call `continuity_bootstrap`, `memory_recall`, `memory_remember`,
  `memory_reflect`, `memory_update`, `memory_forget`, `memory_trace`, and
  `memory_resolve_conflict`.
- Provides `memory://` resources for user profiles, agent procedures, project
  facts, tool notes, run summaries, traces, pending candidates, and conflicts.
- Builds scoped, token-budgeted context packs for new sessions.
- Records trace ids so users can inspect selected, ignored, and excluded memory.
- Creates conflict records instead of silently overwriting durable memory.
- Provides a Memory Vault dashboard prototype for vault, pending-review, trace,
  and conflict-review flows.
- Includes deterministic local examples and evals that run without credentials.

## How It Uses Qwen Cloud

- `QwenMemoryProvider` is the first real reasoning provider behind the
  `MemoryReasoningProvider` boundary.
- Qwen extracts durable memory candidates from conversations, tool notes, and
  run summaries.
- Qwen classifies memory type, scope, importance, confidence, and validity.
- Qwen detects duplicates, contradictions, supersede cases, and scope overlap.
- Qwen builds token-budgeted context packs for bootstrap and recall.
- Qwen reflects on completed runs to produce future procedures, decisions,
  failures, and outcome memories.
- Qwen explains memory trace decisions so users can audit context selection.
- Provider input is sanitized before prompt construction, and local CI remains
  credential-free through `MockMemoryProvider`.

## How It Uses Alibaba Cloud

- The deployment proof runs HandoffBase on Alibaba Cloud ECS with Docker.
- The current deployment is on Alibaba Cloud International in Singapore and
  exposes an authenticated Remote Streamable HTTP MCP endpoint through HTTPS.
- The live runtime uses Postgres/pgvector for durable memory and embeddings;
  restart validation proved that an exact memory survived an app restart.
- Qwen Cloud International powers both reasoning and embeddings through the
  deployed backend.
- The proof intentionally keeps runtime secrets in cloud/ECS secret
  configuration and records only redacted, non-secret evidence in the repo.
- The prepaid subscription covers the judging window, auto-renewal is disabled,
  and Model Studio Free Quota Only is enabled for both deployed model rows.

## Why It Matters

Agent memory should not be hidden inside one chat session, one editor, one
runtime, or one vendor integration. Users need memory that can move with them,
but they also need to inspect, correct, forget, and audit that memory. HandoffBase
makes memory a shared MCP service with explicit tools and governance records, so
continuity becomes portable infrastructure rather than accidental prompt state.

## Difference From Ordinary RAG Or Vector DB Memory

RAG and vector databases answer "which chunks are semantically relevant?"
HandoffBase answers a broader agent-continuity question:

- Who created this memory?
- Which user, project, agent profile, host, or tool scope does it belong to?
- Is it pending, active, expired, superseded, invalidated, archived, or deleted?
- Did it conflict with existing memory?
- Which memories influenced a specific context pack?
- Can the user update, forget, or audit it?

Retrieval is one part of HandoffBase. Lifecycle, traceability, conflict handling,
and governance are first-class.

## Difference From Memory Providers And Agent Runtimes

### Mem0

Mem0 is a strong general memory API and managed/open-source memory layer.
HandoffBase's narrower difference is that MCP is the primary product contract:
tools, resources, prompts, trace ids, and vault governance are built for
cross-host handoff from the start.

### Zep

Zep is strong for enterprise agent memory and temporal graph-backed context.
HandoffBase does not claim graph-scale enterprise retrieval. It is a lighter
MCP-native handoff layer focused on inspectable context packs, provider
boundaries, and open-source deployability.

### Letta

Letta is a memory-first agent runtime. HandoffBase does not ask users to migrate
into a new runtime. It sits beside existing MCP hosts and gives them shared
memory infrastructure.

### LangMem

LangMem is a LangGraph/LangChain-oriented memory toolkit. HandoffBase is not a
framework-specific library; it exposes memory as a networked MCP surface that
multiple hosts can use.

## What Is Implemented Now

- Remote Streamable HTTP MCP server at `/mcp`.
- Nine MCP tools, nine `memory://` resources, and four prompts.
- `@handoffbase/memory-core` with records, lifecycle statuses, traces, events,
  feedback/conflict records, validation, physical hard delete, and
  sensitive-data rejection.
- Governed helpful/unhelpful feedback, pending corrections, and explicit
  feedback-fixture conversion into runnable benchmark regressions.
- `QwenMemoryProvider`, `MockMemoryProvider`, and the provider boundary.
- In-memory runtime store by default for credential-free local development.
- `PostgresMemoryStore`, explicit migration, and the deployed Postgres/pgvector
  runtime.
- API-key auth for the deployed server path.
- Authenticated, same-origin, service-governed Memory Vault dashboard with
  explicit mock mode.
- AI Opportunity Scout demo and example JSON-RPC/HTTP payloads.
- Deterministic local eval pack.
- Alibaba Cloud ECS + Docker deployment proof.

## Current Limitations

- The current Alibaba Cloud proof uses `storeMode=postgres` and
  `embeddingMode=qwen`; the credential-free local default remains in-memory.
- Postgres and Caddy TLS state are on one ECS host. A verified logical backup is
  off-server, but there is no managed multi-zone database or backup service.
- The public ECS proof uses a free `sslip.io` HTTPS hostname, not a custom
  product domain, load balancer, or fully monitored production platform.
- The Memory Vault dashboard is a prototype.
- The local comparison and LongMemEval tiny fixture are deterministic and
  synthetic; no full official run or official score exists.
- The live endpoint requires a temporary HandoffBase access token, which must
  be supplied privately to judges and rotated after judging.

## Future Roadmap

- Add a managed multi-zone Postgres-compatible deployment with verified vector
  support and managed backups.
- Add production hardening: custom-domain TLS, monitoring, rotation, rate
  limiting, and operational runbooks.
- Expand benchmark integrations for long-term conversational memory,
  multi-session recall, conflict handling, forgetting, and active memory use.
- Improve Memory Vault review workflows for approvals, merges, supersession,
  deletion, and audit exports.
- Add more MCP host examples for Codex, Claude Code, Cursor, and custom hosts.
- Support broader provider choices while keeping Qwen first for the hackathon
  submission.

## Tech Stack

- TypeScript
- Node.js 22
- Official MCP TypeScript SDK
- Express adapter with Remote Streamable HTTP transport
- Qwen Cloud through `QwenMemoryProvider`
- `@handoffbase/memory-core`
- In-memory store for credential-free local development
- Postgres/pgvector storage with explicit migration in the live ECS runtime
- Next.js Memory Vault dashboard with same-origin server APIs
- Docker
- Alibaba Cloud ECS

## Open-Source And Community Angle

HandoffBase is designed to be inspectable and runnable by contributors. Local
checks, examples, and the deterministic eval pack work without cloud keys. The
repository documents architecture, comparison, lifecycle, evaluation, dashboard
demo, deployment proof, and cost posture without committing secrets. The goal is
to give the MCP community a small, understandable memory control plane that can
be extended without locking users into one agent runtime.

## Suggested Tags And Keywords

- MemoryAgent
- MCP
- Remote MCP
- agent memory
- AI agent continuity
- cross-session memory
- cross-agent handoff
- Qwen Cloud
- Alibaba Cloud ECS
- memory governance
- traceable memory
- conflict detection
- context packing
- open source
- TypeScript
- Next.js
