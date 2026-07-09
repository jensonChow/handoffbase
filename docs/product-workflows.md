# Product Workflows

This document describes how HandoffBase closes the product loop for users and
MCP hosts. It is intentionally about concrete workflows: what the user or agent
does, which MCP tool or resource is involved, what HandoffBase records, and how
later behavior improves.

HandoffBase is not a hidden chat-log store. The product loop is:

1. Capture a durable memory candidate from work.
2. Review or govern that candidate when needed.
3. Bootstrap or recall scoped memory in a later session.
4. Use trace records to explain what affected the context pack.
5. Update, supersede, or forget stale memory so future behavior changes.

The current runnable MVP proves this loop with Remote Streamable HTTP MCP tools,
Qwen-backed or mock-provider reasoning, lifecycle records, trace records,
conflict records, and a Memory Vault dashboard prototype. The current live proof
still uses an in-memory runtime store, so durable production persistence is a
future runtime milestone.

## Workflow 1: Capture Durable Memory

Capture starts when normal work produces a durable signal. The signal can be:

- a user correction, such as "Do not recommend events unless eligibility and
  timezone are verified";
- a task note, such as "For this project, run the repo-wide check before handoff";
- a run reflection, such as "The deployment failed because the public endpoint
  changed after the stopped instance was restarted."

The MCP host chooses the capture tool:

- Use `memory_remember` for an explicit correction, preference, procedure,
  project fact, or tool note observed during the session.
- Use `memory_reflect` after an agent run to turn outcomes, decisions, tool
  lessons, failures, and procedures into candidate memories.

The reasoning provider then extracts candidate memories. In Qwen-backed mode,
Qwen performs extraction and classification behind the
`MemoryReasoningProvider` interface. In local or test mode, the mock/manual
provider path produces deterministic candidates without cloud credentials.

Each candidate must become a structured memory record before it can influence
future behavior. The important fields are:

- `type`: for example `user_preference`, `procedure`, `project_fact`,
  `tool_memory`, `decision_memory`, `failure_memory`, or `outcome_memory`;
- `scope`: the tenant, user, project, host, agent profile, session, or tool
  boundary where the memory is valid;
- `status`: usually `pending` until review, or `active` when immediately usable;
- `confidence`: how strongly the provider believes this is durable memory;
- `importance`: how strongly future sessions should prefer the memory.

HandoffBase records source metadata and audit events with the candidate. It
should reject or redact sensitive material before durable persistence. If the
candidate has low confidence, sensitive scope, or a conflict with an existing
memory, it stays `pending` for governance instead of silently changing future
agent behavior.

Product result: the user teaches the agent once, and later sessions can inherit
the correction without copying chat history or editing host-specific files.

## Workflow 2: Review And Govern Memory

Review is the control plane between "the agent noticed something" and "future
agents should act on it."

Pending candidates are visible through:

- the Memory Vault dashboard prototype, especially its pending-review view;
- `memory://vault/pending` for MCP-readable pending memory candidates.

Conflict records are visible through:

- the Memory Vault conflict-review view;
- `memory://vault/conflicts` for MCP-readable open conflict records.

A review flow should show the candidate text, memory type, scope, source,
status, confidence, importance, existing related memories, and the provider's
reasoning summary. For conflicts, it should show the conflict type, severity,
recommended action, candidate memory, existing memory, and resolution metadata.

The user or reviewer can resolve candidates with concrete governance actions:

- approve: make the candidate `active`;
- reject: mark the candidate `rejected` so it does not enter normal recall;
- supersede: make the new memory replace an older memory while preserving audit
  history;
- merge: combine a candidate and existing memory into a clearer replacement;
- keep both: preserve both memories when the conflict is only apparent because
  scopes, time windows, or contexts differ.

`memory_update` applies edits, merges, and supersession. `memory_forget` removes
or retires memory that should not affect future behavior. Trace and event records
make the review action inspectable later.

Product result: memory becomes governed user data, not automatic prompt stuffing.
The user can see what is pending, resolve contradictions, and decide what should
guide future sessions.

## Workflow 3: Bootstrap A New Session

A new MCP host should call `continuity_bootstrap` near the start of a session,
before it makes project or user-specific assumptions.

The host supplies the current user, host, agent profile, project, session, and
task hint. HandoffBase uses that scope to retrieve valid memories and asks the
provider to build a compact context pack.

The response includes:

- a scoped context pack with relevant user, procedure, project, tool, failure,
  decision, or outcome memories;
- `memory_trace_id`, which points to the final context-pack trace;
- suggested next memory tools, such as task-specific recall or post-run
  reflection.

The host injects the context pack into its normal working context. The agent can
then start the session already aware of durable preferences, project facts,
known failures, and prior decisions.

Product result: cross-session continuity is visible immediately. A host that did
not participate in the original session can still behave like it inherited the
user's approved memory, as long as the scope allows it.

## Workflow 4: Recall For A Task

`memory_recall` is the task-specific retrieval loop. The host calls it when the
agent is about to answer or act and needs continuity for a concrete task.

The response includes:

- relevant memory records;
- a `context_block` the host can place near the task prompt;
- `trace_id`, which identifies the final context-pack trace for this recall.

The agent should use the returned memory to change behavior, not merely restate
it. Examples:

- An opportunity-ranking agent checks deadline, timezone, and eligibility before
  recommending an event because a procedure memory says those fields are
  required.
- A developer handoff agent runs the expected local validation before summarizing
  work because a project procedure memory says that is the handoff standard.
- A deployment helper refuses to assume a stopped public endpoint is still live
  because a failure memory says the IP can change after restart.

Product result: memory is measured by behavioral improvement. The agent answers
with fewer repeated corrections, fewer stale assumptions, and better project
continuity.

## Workflow 5: Trace And Trust

Every bootstrap or recall should return a trace id so the host, user, or
operator can inspect memory influence.

Trace inspection uses:

- `memory_trace` for a tool response;
- `memory://traces/{trace_id}` for the raw MCP resource view.

The trace explains:

- used memories: records that made it into the final context pack;
- ignored memories: retrieved records that were not selected, often because of a
  token budget, lower relevance, or provider packing decision;
- excluded memories: records blocked by lifecycle, scope, sensitivity, expiry,
  supersession, invalidation, archive, or deletion rules.

Trace records should also expose token-budget context. A tight budget can cause a
valid memory to be retrieved but ignored. That is different from a memory being
excluded because it is out of scope or no longer valid.

Product result: the user can ask "why did the agent act this way?" and get an
audit trail instead of guessing which old context was injected.

## Workflow 6: Update Or Forget

Memory must keep changing when the user's preferences, project facts, or
procedures change.

Use `memory_update` when:

- a memory is mostly right but needs clearer wording;
- two memories should be merged;
- a newer memory should supersede an older one;
- a project fact changed and the old fact should remain only as history.

Use `memory_forget` when:

- the memory is no longer wanted;
- the memory is no longer true;
- the memory is too sensitive to keep;
- the memory is outside the scope where it should have been stored;
- the user wants it invalidated, archived, expired, or deleted.

After update or forget, future bootstrap and recall paths should stop using the
old memory. If the record is retained for audit, traces should explain that it
was excluded because it is superseded, invalidated, archived, expired, or
deleted.

Product result: the user can correct the memory layer itself. A bad memory does
not have to keep poisoning future sessions.

## Workflow 7: Cross-Host Handoff

Cross-host handoff is the core product promise.

1. Host A captures a memory with `memory_remember` or `memory_reflect`.
2. The candidate is approved or otherwise becomes active within a specific
   scope.
3. Host B connects to the same remote MCP server and calls
   `continuity_bootstrap`.
4. Host B receives the allowed context pack and uses it to change behavior.
5. Host B returns a trace id so the user can inspect what crossed the boundary.

Scope controls what crosses the boundary:

- user-scoped preferences can follow the user across approved hosts;
- agent-profile procedures can follow a specific class of agent;
- project-scoped facts should follow only that project;
- host-specific or tool-specific notes should not appear in unrelated hosts;
- invalidated, superseded, archived, expired, or deleted memories should not
  influence normal recall.

Host C in another project should not receive project-scoped memory from Host A's
project. If Host C calls bootstrap or recall, its trace should show that those
records were excluded by scope or never considered for that request.

Product result: a user can move between Codex, Claude Code, Cursor, or a custom
MCP host without turning every project memory into global memory.

## Demo Workflows

### AI Opportunity Scout

1. The user teaches the scout that credibility, founder network, AI Agent,
   MemoryAgent, and persistent-memory opportunities matter more than prize money
   alone.
2. The host calls `memory_remember`.
3. HandoffBase creates preference and procedure candidates, including the
   procedure to verify deadline, timezone, official rules, and eligibility before
   ranking opportunities.
4. In a later session, the host calls `continuity_bootstrap` and then
   `memory_recall` before ranking events.
5. The agent ranks opportunities with the remembered criteria and leaves
   unverified live facts pending until primary-source verification.
6. If the agent recommends an ineligible event, the user correction triggers
   `memory_reflect`, creating a failure memory and reinforced procedure.
7. A trace shows which preference, procedure, and failure memories shaped the
   answer.

What improves: the scout stops treating every opportunity as a generic prize
comparison and starts applying the user's criteria and verification procedure.

### Developer Project Handoff

1. A user or agent records that a repository expects a specific local validation
   command, handoff format, and docs-only boundary for a task class.
2. The host calls `memory_remember` for explicit instructions or
   `memory_reflect` after a completed run.
3. The candidate is scoped to the project, not globally to every project.
4. A later developer-agent session calls `continuity_bootstrap`.
5. The agent receives the project procedure, validates the right local checks,
   and reports branch, commit, changed files, and validation outcomes in the
   expected format.
6. Another project does not receive that project-scoped procedure.

What improves: handoff behavior becomes repeatable without requiring each new
session to rediscover local conventions.

### Cloud Deployment Gotcha And Cost Guardrail Handoff

1. A deployment session records a gotcha, such as "a stopped demo endpoint may
   need revalidation before anyone claims it is online" or "do not create new
   paid cloud resources without explicit approval."
2. The host calls `memory_reflect` after the deployment or cost-control run.
3. HandoffBase stores a failure, procedure, or decision memory with narrow
   project/deployment scope.
4. A later deployment helper calls `memory_recall` before suggesting validation
   or relaunch steps.
5. The helper avoids unsafe assumptions, asks for approval before paid actions,
   keeps secrets out of tracked files, and treats historical proof as historical
   until revalidated.
6. The trace explains that the cost guardrail and deployment gotcha were used for
   that recommendation.

What improves: operational lessons survive into later sessions while staying
bounded to the deployment context where they are relevant.

### Conflict Correction Flow

1. Existing memory says the user prioritizes prize money for hackathons.
2. The user later says they now prioritize credentials, founder network, and
   startup resources.
3. The host calls `memory_remember`.
4. The provider detects a supersede or contradiction conflict.
5. HandoffBase keeps the candidate pending and writes a conflict record instead
   of silently overwriting the old memory.
6. The user reviews the conflict through Memory Vault or
   `memory://vault/conflicts`.
7. The user chooses supersede, merge, reject, or keep both.
8. Future recall uses the resolved active memory and trace excludes the old
   memory if it was superseded.

What improves: corrections do not depend on recency alone. The user governs how
memory evolves.

## Product Workflow Gaps

The current product loop is implemented enough to demonstrate the workflow, but
some pieces should stay framed as future work:

- The Memory Vault dashboard is a prototype. It shows vault, pending review,
  trace inspection, edit/delete, and conflict review flows, but it is not a full
  production admin console.
- The live runtime store is currently in-memory. `PostgresMemoryStore` and the
  SQL migration path exist, but durable runtime store selection and deployment
  wiring are future work.
- Cross-host examples need stronger quickstarts. The repo has local, remote,
  HTTP, and bootstrap examples, but the front-page product story would benefit
  from a clearer Host A to Host B to Host C walkthrough with scope assertions.
- Benchmarks should decide which workflows become front-page claims. The current
  eval pack is deterministic, local, credential-free, and useful for regression
  coverage, but it is not an official benchmark score.
- Workflow claims should be tied to behavior. The strongest future proof is not
  "memory was retrieved"; it is "the agent made a better decision because the
  right memory was captured, governed, recalled, traced, and updated."
