# Integration Checklist

Use this checklist when merging the demo/integration worktree into the server implementation worktree.

## Demo Assets

- [ ] Import `demo/opportunity-scout/seed-memories.json` into the memory store or replay equivalent `memory_remember` / `memory_reflect` calls.
- [ ] Preserve each seed memory's `id`, `type`, `canonical_text`, `source_kind`, `status`, `confidence`, `importance`, `scope`, and `metadata` fields where supported.
- [ ] Write `memory_events` for seed import, remember, recall, reflect, update, and forget operations.
- [ ] Confirm all demo memories remain editable, deletable, exportable, and traceable from the dashboard.

## MCP Endpoint

- [ ] Expose Remote Streamable HTTP at `/mcp` or document the deployed path.
- [ ] Support `initialize`, `tools/list`, and `tools/call` for the core tools used by `examples/http/opportunity-scout.http`.
- [ ] Return a session id for Streamable HTTP clients when required by the MCP SDK.
- [ ] Accept `continuity_bootstrap`, `memory_recall`, `memory_remember`, `memory_reflect`, and `memory_trace` with schema validation.
- [ ] Reject unknown fields or malformed scopes with clear JSON-RPC errors.

## Qwen Provider

- [ ] Implement Qwen Cloud behind `MemoryReasoningProvider` / `QwenMemoryProvider`.
- [ ] Keep Qwen Cloud responsible for extraction, classification, conflict detection, context packing, run reflection, and trace explanation.
- [ ] Keep storage, MCP protocol handling, policy, and dashboard code provider-agnostic.
- [ ] Log provider model, request id if available, and reasoning stage for auditability without storing secrets.

## Opportunity Scout Flow

- [ ] `npm run demo:flow` output matches the intended spoken demo.
- [ ] `npm run demo:jsonrpc` produces valid JSON-RPC request bodies.
- [ ] Session 1 creates pending or active preference/procedure memories.
- [ ] Session 2 bootstrap and recall returns the five seed memories or equivalent generated memories.
- [ ] Session 3 reflection creates or reinforces the region/eligibility failure memory.
- [ ] Session 4 uses a different `host_id` but receives the same authorized user/agent context.

## Final Submission

- [ ] README includes install/run instructions, architecture, Qwen usage, MCP endpoint, memory lifecycle, Track 1 fit, and deployment proof checklist.
- [ ] Add actual Alibaba Cloud endpoint, service screenshots, logs, or console proof only after live verification.
- [ ] Add a short demo video script based on `demo/opportunity-scout/demo-flow.md`.
- [ ] Confirm no durable procedure memory was derived from unverified external website content.
