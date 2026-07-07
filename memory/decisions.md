# Decision Memory

## 2026-07-06

- Decision: Project direction is Agent Continuity MCP Server.
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
