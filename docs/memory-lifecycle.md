# Memory Lifecycle

HandoffBase treats memory as a governed lifecycle, not just text appended to a prompt.

## Create Or Extract

Agents create memory candidates through:

- `memory_remember`: extracts memories from user corrections, task notes, or agent observations.
- `memory_reflect`: extracts lessons from a completed run, including procedure, failure, decision, and outcome memories.

Users do not need to manually fill a database. The agent can propose memory, and the user or dashboard can govern what becomes active.

## Use

Agents use memory through:

- `continuity_bootstrap`: builds a compact context pack at the beginning of a session.
- `memory_recall`: retrieves memories for a specific task, query, and scope.

Context packs are budgeted. Memories may be selected, ignored, or excluded.

## Inspect

Users and hosts inspect memory through:

- `memory_trace`,
- `memory://traces/{trace_id}`,
- `memory://vault/pending`,
- `memory://vault/conflicts`,
- the Memory Vault dashboard prototype.

Trace records explain which memories were used, ignored, or excluded and why.

## Govern

Memory statuses include:

- `pending`: proposed memory awaiting approval or review.
- `active`: approved/current memory.
- `rejected`: candidate rejected before activation.
- `expired`: memory no longer valid by time.
- `superseded`: replaced by a newer memory.
- `invalidated`: marked no longer trustworthy.
- `archived`: retained but inactive.
- `deleted`: removed by lifecycle action.

Users and dashboards govern records through:

- `memory_update`: edit text, type, confidence, importance, validity, or status.
- `memory_forget`: invalidate, archive, expire, or hard-delete.

## Conflicts

Conflict records compare a candidate memory with existing memories. They can mark:

- contradiction,
- supersedes,
- duplicate,
- scope overlap,
- no conflict.

Recommended actions include accept, merge, supersede, ask user, keep both, reject, or ignore. This prevents silent overwrites when new Qwen/agent-extracted memories conflict with older state.

## Traceability

Trace records connect a recall or bootstrap operation to:

- selected memory ids,
- ignored memory ids,
- selection reasons,
- compact context pack,
- run/query metadata.

This is what lets a user ask, "Why did the agent behave this way?" without reading raw model prompts.

## Current Implementation Notes

The live deployment currently uses an in-memory store. `PostgresMemoryStore` and the SQL migration path exist, but runtime `STORE_MODE=postgres` wiring is future work.
