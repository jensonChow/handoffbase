# Decision Memory

## 2026-07-06

- Decision: Project direction is handoffbase.
- Rationale: The core problem is cross-agent, cross-session, cross-project continuity rather than another standalone agent app.
- Status: active.

## 2026-07-06

- Decision: Do not build a full agent runtime or Letta clone.
- Rationale: Letta already owns the memory-first agent runtime position; this project should be agent-agnostic infrastructure exposed through MCP.
- Status: active.

## 2026-07-07

- Decision: MVP is Remote Streamable HTTP only.
- Rationale: Remote MCP best matches cloud-shared memory, Alibaba Cloud deployment proof, and cross-host continuity. Local stdio is useful later but not required for first submission.
- Status: active.

## 2026-07-07

- Decision: Qwen Cloud is the first and primary memory reasoning provider for the hackathon, but memory core must be provider-agnostic.
- Rationale: The competition requires deep Qwen Cloud usage, while long-term product development should avoid Qwen-only lock-in.
- Status: active.

## 2026-07-07

- Decision: The integrated local MVP uses an npm workspace with a root MCP server, `packages/memory-core`, `apps/dashboard`, and deterministic AI Opportunity Scout demo fixtures.
- Rationale: This lets parallel worktree outputs compile together while preserving provider abstraction, local smoke tests, and dashboard/demo independence before Postgres and live Alibaba deployment are wired.
- Status: active.

## 2026-07-07

- Decision: Memory ids, run ids, trace ids, event ids, and SQL reference arrays use domain text ids for the MVP contract instead of forcing uuid columns.
- Rationale: Existing seed/demo ids and MCP trace/resource ids are semantic strings; keeping SQL ids as text avoids schema/runtime mismatch while Postgres persistence is still a scaffold.
- Status: active.

## 2026-07-07

- Decision: `memory_recall.trace_id` and `continuity_bootstrap.memory_trace_id` identify the final context-pack trace, not the raw retrieval trace.
- Rationale: `memory_trace` should explain exactly what the host received in the token-budgeted context pack, including provider-selected and provider-ignored memories. The raw retrieval trace remains linked through `metadata.retrieval_trace_id`.
- Status: active.

## 2026-07-07

- Decision: Qwen provider input must be sanitized before prompt construction, and CI/local validation must not require Qwen credentials.
- Rationale: Agent/tool payloads may contain tokens, cookies, private keys, or oversized logs. Sanitizing before `buildProviderPrompt` protects provider calls, while mock-default CI keeps checks deterministic and secret-free.
- Status: active.

## 2026-07-07

- Decision: Memory conflicts are first-class governance records instead of a pending-memory filtered view.
- Rationale: Provider conflict detection needs durable review state for contradictions, duplicates, supersedes, and scope overlaps; candidate memories that require ask_user, merge, or supersede review should remain pending until an explicit resolution.
- Status: active.

## 2026-07-07

- Decision: The deployable server exposes safe health metadata, optional API key auth, and an in-memory default store while keeping Postgres available behind `PostgresMemoryStore`.
- Rationale: The hackathon demo needs a Docker-ready Remote Streamable HTTP server that can run without secrets, while auth scope guards and Postgres persistence can be enabled or wired without changing MCP tool/resource contracts.
- Status: active.

## 2026-07-07

- Decision: Hackathon setup evidence lives in a committed non-secret `docs/dev-materials-checklist.md`, while real Qwen and HandoffBase auth values stay only in ignored `.env.*` files.
- Rationale: The project needs reproducible development/deployment readiness notes without exposing API keys, database URLs, tokens, or one-time Model Studio secrets.
- Status: active.

## 2026-07-07

- Decision: The first Alibaba Cloud deployment target should be ECS + Docker, with paid provisioning and Postgres/pgvector deferred until explicitly approved.
- Rationale: The current MCP server is a long-running Node.js HTTP service with a production Dockerfile, while ACK adds unnecessary Kubernetes overhead and Postgres still needs runtime store-selection wiring plus target-service pgvector verification.
- Status: active.

## 2026-07-07

- Decision: The hackathon deployment proof uses a single pay-as-you-go Alibaba Cloud ECS instance running Docker, with API-key auth, Qwen provider mode, and the default in-memory store.
- Rationale: The user approved the minimal ECS + Docker path for demo proof, and live validation passed without adding ACR, ACK, Function Compute, Postgres/RDS, a load balancer, a domain, or TLS. Extra paid resources remain out of scope until separately approved.
- Status: active.

## 2026-07-08

- Decision: Star-readiness integration should add open-source polish as docs/examples/eval/dashboard/README artifacts without changing MCP tool names, resource URIs, prompt names, cloud deployment, or Postgres runtime wiring.
- Rationale: The five source worktree branches were reconciled into `main` by restoring their stronger docs/examples/eval/dashboard/README content, then recording branch ancestry with merge commits. This preserved the deployed Qwen-backed in-memory proof and existing hackathon functionality.
- Status: active.
