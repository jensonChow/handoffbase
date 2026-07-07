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
