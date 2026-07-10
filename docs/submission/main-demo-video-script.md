# Main Demo Video Script

Target runtime: about 3 minutes.

Purpose: show HandoffBase as open memory handoff for AI agents: MCP-native,
Qwen-backed, traceable, and governed. The demo should feel like infrastructure,
not a closed agent runtime.

## Pre-Recording Setup

Open these views before recording:

- Local HandoffBase Memory Vault dashboard.
- `README.md`.
- `demo/opportunity-scout/demo-flow.md`.
- `docs/demo-dashboard.md`.
- `docs/deployment/alibaba-cloud-proof.md`.
- A terminal at the repository root.

Safe local commands to have ready:

```bash
npm run demo:flow
npm run eval:memory
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
```

Do not open `.env.*`. Do not show real API keys, auth tokens, cookies, payment
pages, UID, phone number, coupon/voucher codes, database URLs, or cloud secret
values.

## 0:00-0:20 Problem

Visuals:

- Start on `README.md` tagline: "Open memory handoff for AI agents."
- Cut to the AI Opportunity Scout demo flow.
- Optional overlay: Codex, Claude Code, Cursor, custom MCP host.

Voiceover:

> AI agents are useful, but their continuity is fragmented. A user teaches one
> session their preferences, corrections, tool experience, and project context,
> then a new host or a new session starts from zero. HandoffBase fixes that by
> treating memory as shared, inspectable infrastructure instead of hidden chat
> history.

## 0:20-0:45 What HandoffBase Is

Visuals:

- Show README system diagram or `docs/architecture.md`.
- Point at Remote Streamable HTTP MCP, `MemoryReasoningProvider`,
  `QwenMemoryProvider`, store boundary, and Memory Vault dashboard.

Voiceover:

> HandoffBase is an MCP-native memory handoff layer for AI agents. Agents call a
> Remote Streamable HTTP MCP server, discover memory tools and resources, and
> receive auditable trace ids. Qwen powers the reasoning-heavy memory work behind
> a provider boundary, while the memory core stays provider-agnostic.

On-screen proof points:

- 9 MCP tools.
- 9 `memory://` resources.
- 4 memory-aware prompts.
- Qwen-backed extraction and reasoning path.
- Memory Vault governance prototype.

## 0:45-1:20 Remember

Visuals:

- Show `demo/opportunity-scout/demo-flow.md`, Session 1.
- Run or show output from:

```bash
npm run demo:flow
```

- Optional local MCP call:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_remember examples/http/payloads/memory-remember-preferences.json
```

Voiceover:

> In the demo, the user teaches an AI Opportunity Scout what matters: AI agent
> and persistent-memory products, credibility, founder network, and startup
> resources. The agent also learns a procedure: before recommending an event,
> verify deadline, timezone, and eligibility. In the Qwen-backed path,
> `memory_remember` extracts these as candidate memories instead of burying the
> lesson in a transcript.

Callouts:

- Candidate user preference.
- Candidate procedure.
- Pending review when governance is required.
- No full raw chat log needs to become the product surface.

## 1:20-1:55 Recall And Bootstrap

Visuals:

- Show Session 2 and Session 4 in the demo flow.
- Run or show local output from:

```bash
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- continuity_bootstrap examples/http/payloads/continuity-bootstrap-opportunity-scout.json
MCP_ENDPOINT=http://127.0.0.1:3000/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Voiceover:

> In a new session, or even a different MCP host, the agent can bootstrap a
> compact context pack and recall scoped memories for the task. The Opportunity
> Scout now ranks opportunities using the user's remembered preference,
> verification procedure, and failure guardrails.

Callouts:

- `continuity_bootstrap` returns a context pack.
- `memory_recall` returns relevant memories plus a trace id.
- The handoff is cross-session and cross-host through MCP, not a vendor-specific
  agent runtime.

## 1:55-2:25 Trace And Governance

Visuals:

- Open HandoffBase Memory Vault dashboard.
- Show Memory Trace.
- Show Pending Review.
- Show Resolve Memory Conflicts.

Voiceover:

> Memory should not silently control an agent. HandoffBase records which memories
> were used, ignored, or excluded, and exposes that through `memory_trace` and
> `memory://traces/{trace_id}`. The Memory Vault dashboard shows pending
> Qwen-extracted candidate memories and conflicts, so users can approve,
> invalidate, delete, or supersede memory instead of letting it drift invisibly.

Callouts:

- Used memories.
- Ignored memories and reasons.
- Excluded superseded memory.
- Pending Qwen-extracted candidates.
- Candidate versus existing memory conflict.
- Conflict type, severity, and recommended action.

## 2:25-2:45 Alibaba Cloud And Qwen Proof

Visuals:

- Show `docs/deployment/alibaba-cloud-proof.md`.
- Show the non-secret `/health` JSON proof in the doc.
- Optional: show `memory/qwen-cloud.md` Qwen-backed operation summary.

Voiceover:

> The backend was deployed on Alibaba Cloud ECS as a Dockerized Remote MCP
> server. The live validation previously showed API-key auth, `providerMode=qwen`,
> and `storeMode=in-memory`. The ECS instance is currently stopped to control
> cost, so the endpoint should be restarted and revalidated before final
> submission footage if a live terminal proof is needed.

Do not say the live endpoint is currently online unless it has been restarted
and revalidated during the recording window.

## 2:45-3:00 Wrap

Visuals:

- Return to README tagline or architecture diagram.
- End on Memory Vault dashboard with trace, pending review, and conflict review
  visible.

Voiceover:

> HandoffBase lets different agents behave like the same long-term collaborator.
> It gives them shared memory through MCP, Qwen-backed reasoning, traceable
> context packs, and user-governed memory lifecycle controls.

Final title card:

```text
HandoffBase
Open memory handoff for AI agents
MCP-native | Qwen-backed | Traceable | Governed
```
