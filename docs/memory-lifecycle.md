# Memory Lifecycle

HandoffBase users do not have to manually fill a database. Agents create memory
candidates while doing normal work, and users govern the result through MCP
tools, resources, traces, conflicts, and the Memory Vault dashboard.

The lifecycle has five loops:

1. Extract memory from work.
2. Use memory in future sessions.
3. Inspect why memory was used.
4. Govern updates and conflicts.
5. Forget or retire stale memory.

## 1. Extract Memory

Agents create memory through two MCP tools:

- `memory_remember`
- `memory_reflect`

`memory_remember` is used when a user correction, explicit instruction, task
note, or agent observation contains durable information. It asks the reasoning
provider to extract candidate memories, classify them, assign confidence and
importance, and detect conflicts.

`memory_reflect` is used after a run. It turns task outcomes, decisions, tool
lessons, failures, and procedures into candidate memories that can improve later
sessions.

Candidates can start as `pending` instead of immediately becoming `active`. That
is intentional: durable memory should be reviewable when confidence is low,
scope is sensitive, or a conflict exists.

## 2. Use Memory

Agents use memory through:

- `continuity_bootstrap`
- `memory_recall`

`continuity_bootstrap` is called near the start of a session. It builds a compact
context pack for the current user, host, agent profile, project, session, and
task hint. This is the handoff moment: a new session can start with relevant
preferences, procedures, project facts, tool lessons, decisions, and failure
memories.

`memory_recall` retrieves memory for a specific question or task. It returns
matched memories, a context block, and a trace id for audit.

Both paths filter memory through scope and lifecycle. By default, recall should
favor active, valid memories and avoid stale, invalidated, superseded, archived,
or deleted records.

## 3. Inspect Memory Use

Users and hosts can inspect memory use through:

- `memory_trace`
- `memory://traces/{trace_id}`
- `memory://vault/pending`
- `memory://vault/conflicts`

`memory_trace` explains which memories were used, ignored, or excluded for a
context pack. The `memory://traces/{trace_id}` resource exposes the same trace
through the resource surface.

`memory://vault/pending` lists candidate memories awaiting review.

`memory://vault/conflicts` lists conflict records awaiting resolution.

Trace records make memory behavior auditable. They prevent the system from
quietly injecting context with no explanation.

## 4. Govern Memory

Users and agents govern memory with:

- `memory_update`
- `memory_forget`
- `memory_resolve_conflict`
- conflict records
- trace records
- Memory Vault review flows

`memory_update` edits, merges, or supersedes existing memories. It is the right
tool when a preference changes, a project fact needs correction, or a procedure
should replace an older procedure.

`memory_forget` invalidates, archives, expires, or deletes a memory. It is the
right tool when a memory is no longer wanted, no longer true, out of scope, or
too sensitive to keep.

`memory_resolve_conflict` applies an authorized terminal decision to a conflict:
accept or reject the candidate, supersede the existing memory, merge canonical
text, keep both active, or dismiss the conflict. It scope-checks both linked
memories and records lifecycle/audit effects.

The core lifecycle statuses are:

| Status | Meaning |
| --- | --- |
| `pending` | Candidate exists but needs review before normal recall. |
| `active` | Memory is approved or usable in recall. |
| `invalidated` | Memory is known to be wrong or should no longer guide agents. |
| `expired` | Memory aged out or passed its validity window. |
| `superseded` | Memory was replaced by a newer memory. |
| `archived` | Memory is retained for history but not normal recall. |
| `deleted` | Memory was removed from normal use and should not be recalled. |
| `rejected` | Candidate was rejected before becoming usable memory. |

The implementation also tracks events for add, update, delete, recall,
supersede, expire, approve, and reject operations.

## 5. Resolve Conflicts

Conflict records prevent silent overwrites.

When the reasoning provider sees a contradiction, duplicate, supersede
candidate, or scope overlap, HandoffBase can write a `MemoryConflictRecord`
instead of mutating active memory automatically. The candidate can remain
`pending` until a user or review flow resolves it.

Conflict records include:

- candidate memory id
- existing memory id
- conflict type
- severity
- recommended action
- status
- reason
- confidence
- resolution metadata

Recommended actions can include accepting, ignoring, merging, superseding,
asking the user, keeping both memories, or rejecting the candidate. Once the
decision is explicit, `memory_resolve_conflict` persists the actual terminal
state rather than leaving resolution as dashboard-only intent.

This is the difference between memory as storage and memory as governance. A
storage-only system might overwrite a preference because the newest sentence
looks more relevant. HandoffBase records the disagreement so a user can decide.

## End-To-End Flow

1. A user corrects an agent: "Before recommending hackathons, verify deadline,
   eligibility, and timezone."
2. The host calls `memory_remember`.
3. Qwen-backed reasoning extracts a procedure memory behind the
   `MemoryReasoningProvider` boundary.
4. HandoffBase stores the candidate in `MemoryStore`, usually as `pending` or
   `active` depending on approval mode and conflict state.
5. If it conflicts with an existing procedure, HandoffBase writes a conflict
   record rather than silently replacing the old one.
6. In a later session, the host calls `continuity_bootstrap`.
7. HandoffBase recalls scoped, valid memories, asks the provider to build a
   token-budgeted context pack, and writes a trace.
8. The host receives the context pack and trace id.
9. The user can inspect the trace, approve or edit pending candidates, resolve
   conflicts, update stale memory, or forget memory entirely.

## Current Runtime State

The historical Alibaba Cloud ECS proof reported:

```text
authMode=api_key
providerMode=qwen
storeMode=in-memory
```

That image used Qwen-backed reasoning, API-key access, and the in-memory demo
store. Current code also supports explicit `STORE_MODE=postgres` plus
`DATABASE_URL` after `npm run db:migrate`; the dashboard follows the same store
selection. No durable cloud database was provisioned, and the Docker restart
harness was not run in this integration environment.
