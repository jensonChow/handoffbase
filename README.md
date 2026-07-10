# HandoffBase

Open memory handoff for AI agents.

HandoffBase is an MCP-native memory layer that lets AI agents preserve, inspect,
and hand off user preferences, project context, procedures, failures, decisions,
and traces across sessions, hosts, and projects.

It is built as a Remote Streamable HTTP MCP server, with Qwen-backed memory
reasoning behind a provider interface, a traceable memory lifecycle, and a
Memory Vault dashboard prototype for review and governance.

Current status: runnable infrastructure MVP. Local and CI paths use
`InMemoryMemoryStore` and `MockMemoryProvider` by default. A Postgres runtime is
available behind explicit `STORE_MODE=postgres`, `DATABASE_URL`, and migration
steps. The historical Alibaba Cloud proof is Qwen-backed and authenticated, but
used `storeMode=in-memory`; it is a deployment proof, not a production SaaS
service.

## Why HandoffBase

Modern AI agents are useful, but continuity is fragmented:

- New sessions forget corrections, tool experience, and prior outcomes.
- Repository files such as `AGENTS.md` or `CLAUDE.md` help inside one project,
  but do not provide portable cross-host user memory.
- Codex, Claude Code, Cursor, and custom agents each have their own context
  surface.
- Users need a way to inspect, approve, update, forget, and trace the memories
  that influence agent behavior.

HandoffBase treats memory as shared infrastructure. Agents connect through MCP,
call explicit memory tools, read `memory://` resources, and return auditable
trace ids instead of silently stuffing old chat history into prompts.

## Core Idea

```text
Codex / Claude Code / Cursor / custom MCP host
        |
        | Remote Streamable HTTP MCP
        v
HandoffBase MCP server
        |
        +--> MemoryReasoningProvider
        |       +--> QwenMemoryProvider
        |       +--> MockMemoryProvider
        |
        +--> MemoryStore
        |       +--> In-memory default
        |       +--> Postgres + pgvector runtime
        |
        +--> Memory Vault same-origin server backend
```

Every connected agent can:

- bootstrap a new session with the right continuity context,
- recall relevant long-term memories for a task,
- remember new durable facts, procedures, preferences, and failures,
- reflect on completed runs,
- update, supersede, expire, or forget outdated memories,
- resolve governed conflicts with explicit lifecycle actions,
- explain which memories were used, ignored, or excluded.

## What Is Implemented

| Area | Current implementation |
| --- | --- |
| MCP transport | Remote Streamable HTTP server at `/mcp` |
| MCP surface | 8 tools, 9 `memory://` resources, and 4 reusable prompts |
| Memory core | `@handoffbase/memory-core` with records, scopes, lifecycle, events, traces, validation, and sensitive-data rejection |
| Providers | `MemoryReasoningProvider`, `QwenMemoryProvider`, and deterministic `MockMemoryProvider` |
| Store | Credential-free in-memory default; opt-in `PostgresMemoryStore` runtime selected by `STORE_MODE=postgres` after an explicit migration |
| Dashboard | Next.js Memory Vault with same-origin server APIs by default; it follows the MCP runtime's `STORE_MODE`/`DATABASE_URL`, while mock mode is explicit |
| Demo | Deterministic AI Opportunity Scout flow and JSON-RPC/HTTP example payloads |
| Product proof | Comparative 17-case memory benchmark, cleaned-format LongMemEval adapter with tiny fixture, and real HTTP/MCP cross-host E2E |
| Deployment proof | Alibaba Cloud ECS + Docker proof with API-key auth, Qwen provider mode, and in-memory store mode |

## Quickstart

Requires Node.js 22 or newer.

```bash
npm install
npm run check
npm run dev:server
```

The local MCP server listens at:

```text
http://127.0.0.1:3000/mcp
```

If port 3000 is already in use:

```bash
PORT=3333 npm run dev:server
```

Call a local tool with the included Opportunity Scout payload:

```bash
MCP_ENDPOINT=http://127.0.0.1:3333/mcp npm run mcp:call -- memory_recall examples/http/payloads/memory-recall-rank-opportunities.json
```

Useful commands:

```bash
npm run smoke
npm run test
npm run dashboard:dev
npm run demo:flow
npm run demo:jsonrpc
npm run eval:memory
npm run bench:memory
npm run bench:longmemeval:tiny
npm run e2e:cross-host
```

`npm run check` is the CI-parity command. It typechecks, builds the server and
workspaces, runs deterministic unit/integration gates, the MCP registration
smoke test, the local eval and comparative benchmark, the LongMemEval tiny
fixture, the real HTTP/MCP cross-host E2E, the Markdown relative-link check, and
the tracked-file secret scan. It must pass without Qwen credentials, a
database, Docker, or network access.

`npm run bench:memory` runs the deterministic local benchmark-inspired memory
fixture subset without Qwen credentials or network access. Its recorded
comparative result is HandoffBase 17/17 versus no-memory 0/17, with 34/34
expectation conformance. This is not an official benchmark score.

## Qwen Setup

Local development works without cloud credentials by using `MockMemoryProvider`.
To exercise the Qwen-backed path:

```bash
cp .env.example .env.local
```

Then set one of these credentials in your local or cloud environment:

- `QWEN_API_KEY`
- `DASHSCOPE_API_KEY`

Optional Qwen/DashScope settings:

- `QWEN_BASE_URL` or `DASHSCOPE_BASE_URL`
- `QWEN_MODEL` or `DASHSCOPE_MODEL`
- `QWEN_TIMEOUT_MS`

Never commit `.env.*` files. Keep Qwen keys, DashScope keys, HandoffBase API
keys, database URLs, cloud credentials, cookies, and auth headers in local or
cloud secret configuration only.

Qwen is used for the reasoning-heavy memory work:

- extracting durable memories from conversations, run summaries, and tool notes,
- classifying type, scope, importance, and validity,
- detecting conflicts with existing memory,
- building token-budgeted context packs,
- reflecting on completed agent runs,
- explaining memory usage traces.

The memory core remains provider-agnostic. Qwen-specific logic lives behind
`QwenMemoryProvider`; the default local/test path remains mock-provider
compatible.

## Postgres Runtime

No database is required for the default local or CI path. To use durable
storage, provide a Postgres database with the vector extension available,
apply the schema explicitly, and then select the runtime:

```bash
DATABASE_URL=<postgres-url> npm run db:migrate
STORE_MODE=postgres DATABASE_URL=<postgres-url> npm run dev:server
```

`STORE_MODE=postgres` fails fast if `DATABASE_URL` is missing. Migration is
never run implicitly at server startup. `POSTGRES_URL` is not a runtime alias;
use `DATABASE_URL`.

If Docker and the Compose plugin are available, the repository also provides a
disposable local persistence harness. It creates an isolated pgvector
container, applies the migration, writes a memory, restarts Postgres, recalls
the memory, and removes the container and volume:

```bash
npm run test:postgres:restart
```

This Docker-only harness is intentionally outside `npm run check` so the safe
CI path stays credential-free and database-free. Docker was unavailable in the
current integration environment, so this command has not been reported as
passed here.

## Connect Via MCP

HandoffBase is remote-first. MCP hosts should connect to the Streamable HTTP
endpoint exposed by the server:

```text
http://127.0.0.1:3000/mcp
```

For deployed environments, put HTTPS and API-key auth in front of the service
before using it with real data. Remote clients can authenticate with either a
bearer token or `X-Handoffbase-Api-Key`; keep the key value in the host's secret
configuration, not in tracked project files.

The MCP server exposes tools for memory actions, resources for readable vault
views, and prompts for memory-aware workflows. Local stdio is intentionally not
the MVP path because the product value comes from one shared memory layer across
hosts and sessions.

## Remote MCP Validation

The repo includes a remote validator:

```bash
npm run mcp:validate-remote
```

Before running it, set `MCP_ENDPOINT` to a deployed `/mcp` URL and set
`MCP_AUTH_TOKEN` in your shell or secret manager. Do not paste token values into
tracked files or command logs.

The validator checks:

- `GET /health` reports `authMode=api_key`, `providerMode=qwen`, and
  `storeMode=in-memory`,
- MCP `tools/list` returns the registered tools,
- authenticated `memory_recall` returns memories and a trace id,
- authenticated `memory_remember` exercises the Qwen-backed provider path.

The current deployment evidence is recorded in
[`docs/deployment/alibaba-cloud-proof.md`](docs/deployment/alibaba-cloud-proof.md).
It is a temporary Alibaba Cloud ECS proof using public HTTP, not a production
TLS endpoint or managed SaaS service.

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `continuity_bootstrap` | Build a compact continuity context pack for a new session. |
| `memory_recall` | Recall relevant memories for a task, query, and scope. |
| `memory_remember` | Create durable memory candidates from corrections, notes, or observations. |
| `memory_reflect` | Reflect on a completed agent run and propose durable memories. |
| `memory_update` | Edit, merge, or supersede an existing memory record. |
| `memory_forget` | Invalidate, archive, expire, or delete an existing memory record. |
| `memory_trace` | Explain which memories were used, ignored, or excluded. |
| `memory_resolve_conflict` | Apply an authorized conflict decision and persist its lifecycle and audit effects. |

## MCP Resources

| Resource | Purpose |
| --- | --- |
| `memory://users/{user_id}/profile` | Readable continuity profile for a user. |
| `memory://agents/{agent_profile_id}/procedures` | Procedure memories scoped to an agent profile. |
| `memory://agents/{agent_profile_id}/failures` | Failure memories scoped to an agent profile. |
| `memory://projects/{project_id}/facts` | Project fact memories. |
| `memory://projects/{project_id}/tool-notes` | Tool memories scoped to a project. |
| `memory://runs/{run_id}/summary` | Summary for a remembered agent run. |
| `memory://traces/{trace_id}` | Trace detail for memory selection and exclusion. |
| `memory://vault/pending` | Pending memory candidates awaiting review. |
| `memory://vault/conflicts` | Memory conflicts awaiting resolution. |

## MCP Prompts

| Prompt | Purpose |
| --- | --- |
| `memory-aware-start` | Start a session by bootstrapping continuity context before acting. |
| `post-run-reflection` | Review a completed run and identify durable memories. |
| `memory-review` | Guide pending memory review decisions. |
| `conflict-resolution` | Resolve conflicts between existing and proposed memories. |

## Memory Lifecycle

| Stage | What happens |
| --- | --- |
| Remember | `memory_remember` extracts candidate memories from explicit notes, corrections, or observations. |
| Review | Candidates can remain `pending` for user or dashboard review before activation. |
| Recall | `memory_recall` retrieves scoped, valid memories and returns a trace id. |
| Bootstrap | `continuity_bootstrap` builds a token-budgeted context pack for a new host/session. |
| Reflect | `memory_reflect` turns run outcomes into procedure, decision, tool, failure, or outcome memories. |
| Trace | `memory_trace` and `memory://traces/{trace_id}` explain selected, ignored, and excluded memories. |
| Resolve | `memory_resolve_conflict` accepts or rejects a candidate, supersedes an existing memory, merges, keeps both, or dismisses the conflict. |
| Update | `memory_update` edits, merges, or supersedes stale or conflicting memories. |
| Forget | `memory_forget` invalidates, archives, expires, or deletes memory records. |

Memory types currently modeled:

```text
identity
user_preference
procedure
project_fact
tool_memory
decision_memory
failure_memory
outcome_memory
negative_preference
skill
```

## Inspection And Governance

HandoffBase is designed so users and operators can see how memory affects
answers:

- `memory_trace` explains which memories were used, ignored, or excluded.
- `memory://traces/{trace_id}` exposes trace details through MCP resources.
- `memory://vault/pending` exposes pending memory candidates.
- `memory://vault/conflicts` exposes open conflict records.
- The Memory Vault dashboard shows vault, pending review, trace, and
  conflict-review views through same-origin server API routes by default.
- In `STORE_MODE=postgres`, its server backend uses the same `DATABASE_URL` as
  the MCP runtime and requires private tenant/user scope before opening the
  vault. `HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock` selects fixture-only mock mode.

This is not only retrieval. The memory lifecycle is meant to be governed:
pending approval, conflict review, supersession, expiry, deletion, and trace
inspection are first-class behaviors.

## Architecture

```mermaid
flowchart LR
  Host["MCP host"] --> Server["HandoffBase MCP server"]
  Server --> Tools["Memory tools/resources/prompts"]
  Tools --> Service["Memory service layer"]
  Service --> Provider["MemoryReasoningProvider"]
  Provider --> Qwen["QwenMemoryProvider"]
  Provider --> Mock["MockMemoryProvider"]
  Service --> Store["MemoryStore"]
  Store --> Memory["In-memory default"]
  Store --> Postgres["Postgres + pgvector runtime"]
  Dashboard["Memory Vault dashboard"] --> API["Same-origin dashboard API"]
  API --> Store
```

More detail:

- [Architecture](docs/architecture.md)
- [Architecture diagram](docs/assets/architecture.mmd)
- [Memory lifecycle](docs/memory-lifecycle.md)
- [Technical design](docs/technical-design.md)
- [Comparison](docs/comparison.md)
- [Effect claims](docs/effect.md)
- [Eval pack](docs/evals.md)
- [Benchmark strategy](docs/benchmarks.md)
- [Recorded local benchmark results](docs/benchmark-results.md)
- [LongMemEval adapter](benchmarks/longmemeval/README.md)
- [Cross-host E2E proof](docs/workstreams/cross-host-e2e.md)
- [Product completeness](docs/product-completeness.md)
- [Product workflows](docs/product-workflows.md)
- [Dashboard demo](docs/demo-dashboard.md)
- [Deployment notes](docs/deployment.md)
- [Alibaba Cloud deployment proof](docs/deployment/alibaba-cloud-proof.md)
- [Alibaba ECS relaunch runbook](docs/deployment/relaunch-runbook.md)
- [Development and public-readiness checklist](docs/dev-materials-checklist.md)
- [Devpost submission copy](docs/submission/devpost-copy.md)
- [Devpost architecture notes](docs/submission/architecture-for-devpost.md)
- [Submission testing instructions](docs/submission/testing-instructions.md)
- [Submission checklist](docs/submission/submission-checklist.md)
- [Video recording shot list](docs/submission/recording-shot-list.md)
- [Final public-readiness checklist](docs/submission/final-public-readiness.md)
- [Current handoff](docs/handoff.md)

## Examples And Demo

- [Examples overview](examples/README.md)
- [MCP host config examples](examples/mcp/README.md)
- [HTTP examples](examples/http/README.md)
- [Quickstart: remember preference](examples/quickstart/remember-preference.md)
- [Quickstart: recall memory](examples/quickstart/recall-memory.md)
- [Quickstart: trace memory](examples/quickstart/trace-memory.md)
- [Quickstart: bootstrap session](examples/quickstart/bootstrap-session.md)
- [Memory eval fixture](examples/evals/opportunity-scout-memory-eval.json)
- [AI Opportunity Scout demo flow](demo/opportunity-scout/demo-flow.md)
- [HTTP JSON-RPC examples](examples/http/opportunity-scout.http)
- `examples/http/payloads/*` for direct MCP tool payloads
- `npm run demo:flow` for an offline narration
- `npm run demo:jsonrpc` for JSON-RPC request examples
- `npm run eval:memory` for the deterministic local memory eval pack
- `npm run bench:memory` for the 17-case comparative local benchmark
- `npm run bench:longmemeval:tiny` for the synthetic three-backend adapter gate
- `npm run e2e:cross-host` for real Express/HTTP/MCP cross-host continuity
- `npm run demo:cross-host` for the human-readable version of that scenario
- `npm run dashboard:dev` for the local Memory Vault dashboard prototype

The demo shows a user teaching an opportunity-scouting agent their hackathon
preferences, a later session recalling those preferences, a failure reflection
creating a future guardrail, and another host receiving the same scoped memory
through MCP.

## Comparison

HandoffBase is not positioned as universally better than existing memory
systems. The current goal is narrower: MCP-native, traceable, governed memory
handoff across agents and hosts.

See [docs/comparison.md](docs/comparison.md) for the longer positioning note.

| Project | Strong fit | HandoffBase difference |
| --- | --- | --- |
| [Mem0](https://docs.mem0.ai/introduction) | Universal memory layer, hosted/open-source memory, agent plugins, framework integrations. | HandoffBase is Remote MCP first: tools, resources, prompts, trace ids, and user-governed memory vault resources are the product surface. |
| [Zep](https://help.getzep.com/overview) | Enterprise-scale agent memory with temporal graph/context infrastructure. | HandoffBase is a lighter MCP-native handoff layer; the current MVP does not claim graph-scale enterprise retrieval. |
| [Letta](https://docs.letta.com/) | Memory-first agent runtime with agents, tools, blocks, channels, and app/server surfaces. | HandoffBase does not require migrating to a new agent runtime; it sits beside existing MCP hosts. |
| [LangMem](https://langchain-ai.github.io/langmem/) | LangGraph/LangChain-oriented memory primitives, background managers, and memory tools. | HandoffBase is host-agnostic infrastructure exposed as a Remote Streamable HTTP MCP service. |

## Eval Awareness

The repo includes deterministic product-proof checks rather than an official
leaderboard claim:

- MCP registration smoke test,
- memory-core lifecycle, validation, sanitizer, and Postgres contract tests,
- auth and server route tests,
- dashboard API tests,
- a local eval pack at [docs/evals.md](docs/evals.md),
- a comparative synthetic benchmark with recorded HandoffBase 17/17 versus
  no-memory 0/17 and 34/34 expectation conformance,
- a real loopback HTTP/MCP cross-host scenario, and
- a cleaned-format LongMemEval adapter with a synthetic tiny fixture, explicit
  deterministic/Qwen modes, and official-evaluator-compatible hypotheses.

The official LongMemEval dataset was not downloaded or vendored, the full
credentialed run has not been completed, no paid judge was invoked, and no
official LongMemEval score exists. See
[the LongMemEval adapter guide](benchmarks/longmemeval/README.md) for the exact
manual boundary.

## Current Limitations

- The live Alibaba Cloud proof is Qwen-backed but uses `storeMode=in-memory`.
- Postgres runtime wiring and migration exist, but no durable cloud deployment
  has been provisioned or validated; the default remains in-memory.
- The public ECS proof uses HTTP on a demo endpoint; production use should add
  TLS, domain routing, hardened auth, durable storage, monitoring, and a managed
  deployment path.
- The Memory Vault dashboard has a real server-backed path, but it is not a
  hardened production admin console.
- The comparative benchmark and LongMemEval tiny fixture are deterministic and
  synthetic; neither is an official benchmark score.
- No full official LongMemEval run or paid official QA evaluation has been
  completed.

## License

MIT. See [LICENSE](LICENSE).
