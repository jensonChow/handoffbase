# HandoffBase Compared With Other Memory Approaches

This document explains positioning, not a benchmark. The goal is to show why
HandoffBase is different without claiming that it is universally better.

HandoffBase is best described as an MCP-native memory handoff layer: a remote MCP
server that lets Codex, Claude Code, Cursor, and custom MCP hosts share governed
memory through tools, resources, prompts, traces, and conflict records.

## Summary

| Approach | Public positioning | Good fit | How HandoffBase differs |
| --- | --- | --- | --- |
| Mem0 | Memory as an API / managed memory layer | Add long-term memory to apps and agents through hosted APIs, SDKs, integrations, and MCP plugins | HandoffBase puts MCP at the center of the product contract and focuses on cross-agent handoff, traceable context packs, conflict governance, and an open-source control plane |
| Zep | Temporal graph / enterprise agent memory | Build and serve context from temporal user/business graphs at enterprise scale | HandoffBase is not trying to be an enterprise temporal graph lake; it is a smaller MCP-native handoff layer with explicit memory lifecycle and host interoperability |
| Letta | Memory-first agent runtime | Use a stateful agent runtime where the agent has memory, tools, conversations, and memory self-editing | HandoffBase does not replace the host agent runtime; it plugs into existing agents as shared memory infrastructure |
| LangMem | LangGraph memory toolkit | Add memory tools, background memory managers, and prompt optimization inside LangGraph applications | HandoffBase is not a LangGraph library; it exposes memory as a networked MCP surface for multiple hosts |
| Repo-local memory files | Project-local text memory | Keep repo guidance in files such as `AGENTS.md`, `CLAUDE.md`, or local memory docs | HandoffBase complements repo files with cross-project, cross-host memory, lifecycle statuses, trace records, and user-governed updates |
| Generic RAG/vector DBs | Document retrieval | Search documents or chunks by semantic similarity and feed them into prompts | HandoffBase treats memory as governed agent continuity: extraction, scope, lifecycle, conflict records, context packing, and traceability |

## Mem0

Mem0 is strong when the problem is adding memory to an application or agent
through a hosted memory API, SDKs, and broad integrations. Its public docs also
describe MCP and coding-agent integrations.

HandoffBase should not position itself as "Mem0, but better." The sharper claim
is narrower: HandoffBase is MCP-native infrastructure where tools, resources,
and prompts are the primary interface, not a secondary integration. The design
emphasizes cross-agent handoff, context-pack traces, conflict review, and
open-source deployment control.

## Zep

Zep is positioned around enterprise agent memory, temporal knowledge graphs, and
serving token-efficient context from governed graph-backed context.

HandoffBase should respect that category. It is not a temporal graph database or
enterprise memory lake. Its differentiation is that it exposes memory handoff as
an MCP control plane and keeps the reasoning provider, memory core, and storage
adapter boundaries small enough for an open-source project to inspect and run.

## Letta

Letta is a memory-first agent runtime. It is a good fit when the user wants to
operate inside a stateful agent with its own memory, conversations, and memory
editing loop.

HandoffBase takes a different route. It does not ask the user to move into a new
runtime. It lets existing hosts call a shared memory service over MCP, then
return to their normal workflows.

## LangMem

LangMem is a toolkit for adding memory behavior to LangGraph applications. It
provides primitives and tools for memory extraction, search, management, and
background processing inside that ecosystem.

HandoffBase is not a framework-specific memory toolkit. It is a deployed MCP
server surface with host-neutral memory operations. A LangGraph agent could be a
client, but HandoffBase does not require LangGraph.

## Repo-Local Memory Files

Files such as `AGENTS.md`, `CLAUDE.md`, project handoff docs, and repo-local
memory files are useful. They are simple, inspectable, and versionable. They are
often the right place for project-specific conventions.

They are also local by default. They do not automatically solve cross-host user
continuity, lifecycle state, conflict review, or traceable context selection.
HandoffBase can preserve the value of repo files while giving agents a shared
memory layer above individual repositories.

## Generic RAG And Vector Databases

RAG and vector databases are valuable retrieval infrastructure. They answer a
different question: "Which documents or chunks are semantically relevant?"

Agent memory needs additional governance:

- Who or what created this memory?
- Which user, project, host, agent profile, or tool scope does it belong to?
- Is it pending, active, expired, superseded, invalidated, archived, or deleted?
- Did it conflict with an existing memory?
- Which memories influenced a specific context pack?
- Can the user update, forget, or audit it?

HandoffBase uses retrieval as one part of memory, not the whole product.

## What HandoffBase Should Claim

- MCP-native memory handoff layer.
- Cross-agent and cross-host continuity.
- Traceable context packs.
- First-class conflict records.
- Qwen-backed memory reasoning behind a provider boundary.
- Open-source memory control plane with clear storage and provider adapters.
- Current live proof with `providerMode=qwen`, `authMode=api_key`,
  `storeMode=postgres`, and `embeddingMode=qwen`.

## What HandoffBase Should Not Claim Yet

- Not a replacement for all managed memory platforms.
- Not more production-ready than mature hosted systems.
- Not a managed multi-zone Postgres deployment or production SaaS yet.
- Not an enterprise graph memory platform.
- Not a full agent runtime.
- Not a generic vector database.

## Public Reference Points

The comparison above was checked against these public docs:

- Mem0 docs: <https://docs.mem0.ai/>
- Zep docs: <https://help.getzep.com/overview>
- Letta memory docs: <https://docs.letta.com/letta-agent/memory>
- LangMem docs: <https://langchain-ai.github.io/langmem/>
