# AI Opportunity Scout Demo Flow

This demo shows Agent Continuity MCP Server as a portable memory layer for an opportunity-scouting agent. The flow is intentionally deterministic so the final MCP server can be tested without relying on live external websites during judging.

## Demo Data

- Seed memories: `demo/opportunity-scout/seed-memories.json`
- Session scripts: `demo/opportunity-scout/sessions/*.json`
- Offline narration: `npm run demo:flow`
- JSON-RPC request dump: `npm run demo:jsonrpc`

## Session 1: Remember Preferences

User teaches the scout:

> I want to join AI hackathons that help my credibility and founder network. Prefer AI Agent, MemoryAgent, and persistent-memory products. Before recommending anything, check the deadline, timezone, and whether China or Hong Kong participants are eligible.

Expected MCP call:

- `memory_remember`

Expected candidate memories:

- Preference for AI Agent / MemoryAgent hackathons.
- Preference for credential, network, and founder resources.
- Procedure to verify deadline, timezone, and eligibility before ranking.

## Session 2: Bootstrap And Rank

Fresh session asks:

> Rank Qwen, TRAE, and CockroachDB opportunities for this MVP.

Expected MCP calls:

- `continuity_bootstrap`
- `memory_recall`

Expected answer:

- Qwen Cloud Track 1 / MemoryAgent is P0 only after official deadline and eligibility verification.
- TRAE is P1 if official materials confirm strong developer-agent workflow and network value.
- CockroachDB is P2 or watchlist unless database/backend resources directly improve the build.
- Any live deadline, timezone, and eligibility field stays pending until primary-source verification.

## Session 3: Reflect On Failure

User correction:

> This event is not eligible for China or Hong Kong participants. Do not recommend events like this again unless I ask for a watchlist.

Expected MCP call:

- `memory_reflect`

Expected result:

- Failure memory for region or eligibility mistakes.
- Reinforced procedure that region/eligibility mismatch is a hard disqualifier for recommendations.

## Session 4: Cross-Host Continuity

Simulate another MCP host, such as Claude Code, calling the same remote MCP endpoint.

Expected MCP call:

- `continuity_bootstrap` with `host = "claude-code"`

Expected result:

- The second host receives the same preference, procedure, failure, and decision memories within the user-authorized scope.
- The output demonstrates cross-session and cross-host continuity without copying host-specific memory files.

## Judge Notes

- This fixture does not assert live deadlines or eligibility for Qwen, TRAE, or CockroachDB opportunities.
- The demo proves how memory affects ranking, verification behavior, and failure avoidance.
- The live server integration should write an auditable event for each remember, recall, reflect, and bootstrap operation.
