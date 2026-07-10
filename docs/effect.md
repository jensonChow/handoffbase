# Effect Claims

HandoffBase's product proof should be judged by behavior, not by packaging. The
question is whether memory changes what a later agent session does: better
decisions, fewer repeated mistakes, clearer evidence, and safer updates across
hosts and projects.

## Root Problem

Agent memory is fragmented by session, host, project, and runtime. A correction
given in one coding session, a preference taught to one assistant, or a failure
learned in one project often disappears when the user starts another session,
switches MCP hosts, changes repositories, or moves between local and deployed
runtime paths.

HandoffBase is not another agent runtime. It is an open memory handoff layer for
agents that already exist. The product surface is a Remote Streamable HTTP MCP
server with memory tools, `memory://` resources, workflow prompts, lifecycle
state, traces, conflicts, and user-governed review flows.

## Primary Effect Claim

HandoffBase lets agents carry forward governed, traceable working memory so
later sessions and different MCP hosts make better task decisions.

This claim has three parts:

- Carry forward: useful memories survive the end of a session and can be handed
  to another host, agent profile, project, or later task through MCP.
- Governed and traceable: memory has scope, status, source, audit events, and
  trace ids; users can inspect, update, supersede, forget, or reject it.
- Better task decisions: memory should change downstream action, not merely be
  stored or restated.

## What "Memory Works" Means

Memory does not work just because text was stored and retrieved. For HandoffBase,
memory works when it changes later behavior in a scoped, current, inspectable,
and controllable way.

A working memory layer should:

- Select the right memory for the current user, project, host, agent profile,
  and task.
- Exclude or downrank irrelevant, stale, invalidated, superseded, unsafe, or
  out-of-scope memory.
- Produce a context pack or recall result that helps the agent answer or act
  more correctly.
- Explain which memories were used, ignored, or excluded.
- Let users mark a memory or trace helpful/unhelpful and route corrections
  through pending review and explicit regression-fixture conversion.
- Let users update, supersede, expire, archive, delete, or reject memory.
- Treat contradictions as conflicts to review, not silent overwrites.
- Refuse to persist sensitive values such as API keys, tokens, cookies, private
  credentials, payment details, and cloud secrets.

## Effect Layers

| Layer | Effect claim | Evidence to collect |
| --- | --- | --- |
| Remember correctly | HandoffBase extracts durable preferences, procedures, facts, failures, decisions, and outcomes without storing unsafe material. | Candidate quality, type/scope correctness, sensitive-data rejection, source and event records. |
| Use memory in future tasks | Later sessions receive memory that changes answer or action quality. | Task outcome comparisons with and without memory, trace ids, used/ignored memory lists. |
| Handoff across hosts, sessions, and projects | Different MCP hosts can bootstrap from the same governed memory layer without moving to a new runtime. | `continuity_bootstrap`, `memory_recall`, `memory://` resources, host-neutral examples. |
| Avoid stale, conflicting, or unsafe memory | Invalidated, superseded, expired, deleted, out-of-scope, sensitive, or contradictory memories do not silently guide behavior. | Lifecycle-status tests, conflict records, negative tests, trace exclusions. |
| Let users inspect and govern memory | Users can review pending memories, inspect traces, submit feedback/corrections, resolve conflicts, update records, and forget memory. | Authenticated Memory Vault views, `memory_trace`, `memory_feedback`, `memory_resolve_conflict`, `memory_update`, `memory_forget`, pending/conflict resources. |

## Behavior-Level Examples

### AI Opportunity Scout

Without governed memory, an opportunity-scouting agent may repeatedly ask the
same preference questions or recommend the wrong event because it forgot the
user's constraints.

With HandoffBase:

- `memory_remember` records that the user prioritizes credentials, founder
  network, and startup resources over prize money alone.
- A procedure memory records that the agent should verify deadline, timezone,
  eligibility region, and official rules before recommending an opportunity.
- A failure memory records that the agent should not recommend events when
  official rules exclude the user's region.
- In a later session, `continuity_bootstrap` or `memory_recall` returns scoped
  memories and a trace id.
- The downstream agent ranks opportunities differently, verifies official rules
  earlier, and can show which memories influenced the recommendation.

The effect is not "the preference text exists." The effect is a later ranking
or recommendation that avoids a known mistake and follows the remembered
verification procedure.

### Developer And Project Handoff

Without memory handoff, a new coding session may rediscover settled decisions,
repeat known deployment mistakes, or accidentally violate cost and security
guardrails.

With HandoffBase, a later agent can recall:

- Settled architecture decisions, such as HandoffBase being an MCP-native memory
  handoff layer rather than a full agent runtime.
- Cloud-cost guardrails, such as not restarting the stopped ECS proof or adding
  paid resources without explicit approval.
- Deployment gotchas, such as the current Alibaba proof being Qwen-backed but
  `storeMode=in-memory`.
- Future-work boundaries, such as Postgres runtime selection, TLS, domain,
  load balancer, managed gateway, monitoring, and production persistence.

The effect is a later development session that stays inside the approved scope,
uses the right validation path, and does not turn a proof artifact into a false
production claim.

### Correction And Update Flow

Memory must evolve when facts change. If a user says a previous preference is no
longer true, HandoffBase should not rely on whichever sentence was most recent
without a record.

A correct update flow is:

1. The host calls `memory_remember` or `memory_update` with the correction.
2. The reasoning provider detects whether the correction duplicates,
   supersedes, contradicts, or refines an existing memory.
3. HandoffBase writes a pending candidate or conflict record when review is
   needed.
4. `memory_update` supersedes or merges the old memory, or `memory_forget`
   invalidates, archives, expires, or physically hard-deletes it.
5. Later `memory_recall` and `continuity_bootstrap` do not use the invalidated
   or superseded record as active guidance; hard-deleted records no longer
   exist in the store.
6. For retained lifecycle history, `memory_trace` explains why the old memory
   was ignored or excluded. Hard delete instead redacts linked historical
   content and leaves only the safe deletion tombstone.

## Metrics

| Metric | Definition |
| --- | --- |
| Answer/action correctness | Whether the downstream agent's final answer or action matches the expected behavior for the task. |
| Evidence recall@k | Of the memories that should influence the task, how many appear in the top k recalled or packed memories. |
| Evidence precision@k | Of the top k recalled or packed memories, how many are actually relevant and safe for the task. |
| Conflict correctness | Whether contradictions, supersedes, duplicates, and scope overlaps are detected and routed to the right resolution path. |
| Update correctness | Whether corrected memory changes later recall and behavior while preserving auditability. |
| Forget correctness | Whether invalidated, expired, archived, deleted, or explicitly forgotten memory stops guiding normal recall. |
| Trace coverage | Whether behavior-changing recall, bootstrap, update, forget, and conflict paths produce inspectable traces or events. |
| Scope isolation | Whether user, tenant, project, host, agent profile, session, and tool scopes prevent cross-contamination. |
| Token efficiency | Whether context packs include high-value memory within token budgets while ignoring low-value memory with reasons. |
| Cross-host consistency | Whether different MCP hosts receive consistent governed memory for the same scoped task. |

These metrics should be used for eval design. A passing local regression pack is
useful evidence, but it is not the same as an official public benchmark score.

## Negative Tests

HandoffBase should include tests or review checks that prove it does not:

- Persist real API keys, HandoffBase tokens, Qwen or DashScope credentials,
  auth headers, cookies, private keys, database URLs, cloud credentials,
  payment values, coupon or voucher codes, private identifiers, or raw account
  details.
- Leak project A memory into project B when scopes differ.
- Leak one user's memory into another user's scope.
- Use invalidated, deleted, expired, archived, or superseded memory as active
  guidance in normal recall.
- Silently overwrite conflicts instead of writing a conflict record or pending
  candidate for review.
- Claim durable live storage when the runtime reports `storeMode=in-memory`.
- Claim a live endpoint is online when the ECS proof may be stopped and has not
  been revalidated.
- Treat raw external web content or tool output as trusted procedure memory
  without confirmation.

## Current Implementation Mapping

| Existing implementation | Effect claim it supports | Current proof boundary |
| --- | --- | --- |
| `continuity_bootstrap` | Starts a new session with a token-budgeted continuity context pack. | Demonstrates handoff mechanics; effect still needs behavior-level evals beyond context delivery. |
| `memory_recall` | Retrieves scoped memory for a task and returns a trace id. | Supports evidence recall and traceability; quality depends on provider/store behavior and test data. |
| `memory_remember` | Extracts candidate memories from corrections, notes, and observations. | Supports memory creation; sensitive-data rejection and review flow remain critical negative tests. |
| `memory_reflect` | Turns run outcomes into durable procedure, tool, failure, decision, or outcome memories. | Supports learning from completed tasks; should be judged by later task improvement. |
| `memory_update` | Edits, merges, or supersedes stale memory. | Supports update correctness and conflict governance. |
| `memory_forget` | Invalidates, archives, expires, or physically hard-deletes memory records. | Supports forget correctness; hard delete also redacts linked historical content while preserving a safe audit tombstone. |
| `memory_trace` and `memory://traces/{trace_id}` | Explain used, ignored, and excluded memories for a context pack. | Supports auditability and trace coverage. |
| `memory_feedback` | Records helpful/unhelpful judgment and can propose a pending correction plus sanitized fixture draft. | Supports a governed feedback loop; fixture conversion still requires explicit human public-safety confirmation. |
| `memory_resolve_conflict` | Applies accept, reject, supersede, merge, keep-both, or dismiss decisions. | Supports authorized, auditable terminal conflict resolution rather than a display-only conflict queue. |
| `memory://vault/pending` | Exposes candidate memories awaiting review. | Supports user governance before activation. |
| `memory://vault/conflicts` | Exposes open memory conflicts with reason and recommended action. | Supports conflict correctness and avoids silent overwrite. |
| Other `memory://` resources | Provide readable scoped views of user, agent, project, run, and tool memory. | Supports host-neutral inspection through MCP resources. |
| MCP prompts | Guide memory-aware start, post-run reflection, memory review, and conflict resolution workflows. | Helps hosts use memory consistently without replacing the host runtime. |
| `QwenMemoryProvider` | Powers reasoning-heavy extraction, classification, conflict detection, reflection, and context packing for the hackathon path. | Qwen sits behind `MemoryReasoningProvider`; local/CI validation must remain credential-free through `MockMemoryProvider`. |
| Lifecycle statuses and event records | Distinguish pending, active, invalidated, expired, superseded, archived, deleted, and rejected outcomes. | Supports currentness, update, forget, and audit metrics; hard-delete does not retain the original memory record. |
| Conflict records | Preserve contradictions, duplicates, supersedes, and scope overlaps for review. | Supports conflict correctness; users or review flows must resolve them. |
| Memory Vault dashboard prototype | Uses API-key-backed signed caller sessions for vault, deletion audit, pending review, trace feedback, and six-action conflict resolution. | Service-governed governance UI with caller-scoped reads; still not a production admin console. |
| Deterministic eval pack | Exercises Opportunity Scout recall, bootstrap traces, token-budget ignored memories, remember candidates, controlled conflicts, and forget invalidation. | Regression/demo pack only; not LoCoMo, LongMemEval, Mem2ActBench, MemBench, MemEvoBench, LifeBench, or an official benchmark score. |
| Alibaba ECS proof | Shows a Remote Streamable HTTP MCP deployment with API-key auth, Qwen provider mode, and in-memory store mode. | Historical deployment proof; ECS may be stopped and must be revalidated before live endpoint claims. It is not production SaaS or durable storage proof. |

## Non-Claims

HandoffBase should not currently claim:

- Production SaaS readiness.
- An official benchmark score.
- Durable live storage in the current runtime path.
- Replacement for all memory platforms, vector databases, graph memory systems,
  or memory-first agent runtimes.
- A currently online ECS endpoint unless it has been restarted and revalidated.
- A finished production dashboard, billing model, tenant admin model, managed
  gateway, TLS/domain setup, monitoring system, or Postgres-backed live service.

## Proof Direction

The next proof layer should compare downstream behavior with and without
HandoffBase memory. The useful artifact is not just a nicer README, dashboard,
or demo script. Packaging should serve eval-backed product value:

- define the task where memory should matter,
- seed or extract governed memories,
- run a later session or host with scoped recall,
- measure answer/action correctness and trace coverage,
- run negative tests for stale, unsafe, conflicting, and out-of-scope memory,
- report the result with current implementation limits.
