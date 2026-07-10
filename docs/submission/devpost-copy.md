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
traces, and conflict records. If a candidate memory contradicts an existing
preference, it can remain pending and create a conflict record instead of
silently overwriting the older fact. If a context pack uses or ignores memory,
the host receives a trace id. Users and operators can later ask what shaped the
agent's context and why. That makes memory auditable, not just convenient.

The current implementation is a runnable MVP. The MCP server exposes eight
tools, nine `memory://` resources, and four reusable prompts. The memory core
includes validation, sensitive-data rejection, trace records, conflict records,
an in-memory default, and an explicit Postgres/pgvector runtime after migration.
The local developer path uses a deterministic
`MockMemoryProvider`, so contributors can run checks without Qwen credentials or
paid cloud access. The repository also includes a deterministic AI Opportunity
Scout eval pack that exercises recall, bootstrap traces, token-budget behavior,
candidate creation, controlled conflicts, and forgetting.

HandoffBase also includes a Memory Vault dashboard. Same-origin server APIs are
the default, and Postgres mode can share the MCP runtime database under an
explicit private tenant/user scope. The dashboard
shows vault records, pending review, trace inspection, and conflict review for a
demo scenario where an opportunity-scouting agent learns a user's hackathon
preferences and later applies them across sessions. The dashboard is not a full
production admin console yet, but it demonstrates the user-facing governance
loop that makes memory trustworthy.

Alibaba Cloud is used for deployment proof. The project has been validated on a
single ECS instance running Docker with API-key auth, Qwen provider mode, and an
in-memory runtime store. The proof covered `/health`, MCP `tools/list`,
authenticated `memory_recall`, and Qwen-backed `memory_remember`. The instance
may be paused to control cost, so the repository records non-secret proof and
revalidation instructions rather than assuming the public endpoint is always
online.

The honest limitation is that HandoffBase is not yet a production SaaS memory
platform. The historical live proof uses `storeMode=in-memory`; durable cloud
Postgres deployment, managed hardening, TLS, monitoring, and a full official
benchmark run are future work. The point of the project is narrower and concrete:
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
- The deployed proof validated API-key auth, Qwen provider mode, and the Remote
  Streamable HTTP MCP endpoint.
- The proof intentionally keeps runtime secrets in cloud/ECS secret
  configuration and records only redacted, non-secret evidence in the repo.
- The current ECS instance may be stopped in economical mode to control cost;
  judges can test after the endpoint is reactivated and revalidated.
- The proof uses the in-memory runtime store, not durable production storage.

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
- Eight MCP tools, nine `memory://` resources, and four prompts.
- `@handoffbase/memory-core` with records, lifecycle statuses, traces, events,
  conflict records, validation, and sensitive-data rejection.
- `QwenMemoryProvider`, `MockMemoryProvider`, and the provider boundary.
- In-memory runtime store by default.
- `PostgresMemoryStore`, explicit migration, and opt-in runtime selection.
- API-key auth for the deployed server path.
- Same-origin server-backed Memory Vault dashboard with explicit mock mode.
- AI Opportunity Scout demo and example JSON-RPC/HTTP payloads.
- Deterministic local eval pack.
- Alibaba Cloud ECS + Docker deployment proof.

## Current Limitations

- The current Alibaba Cloud proof is Qwen-backed but uses `storeMode=in-memory`.
- Postgres runtime selection is opt-in and has not been deployed to a durable
  cloud database; the default remains in-memory.
- The public ECS proof is a minimal HTTP demo endpoint, not a production TLS
  service with a domain, load balancer, monitoring, and managed persistence.
- The Memory Vault dashboard is a prototype.
- The local comparison and LongMemEval tiny fixture are deterministic and
  synthetic; no full official run or official score exists.
- The ECS endpoint may be stopped or restarted around submission windows to
  control pay-as-you-go cost.

## Future Roadmap

- Validate the implemented `STORE_MODE=postgres` path against an approved
  durable database service with verified vector-extension support.
- Add managed deployment hardening: TLS, domain routing, monitoring, rotation,
  and operational runbooks.
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
- In-memory store for the current runtime proof
- Postgres/pgvector storage with explicit migration and opt-in runtime selection
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
