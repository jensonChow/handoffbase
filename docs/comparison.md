# Comparison And Positioning

HandoffBase is different from managed memory APIs, agent runtimes, graph memories, repo-local memory files, and generic retrieval systems. It is not universally better than those projects; it is optimized for MCP-native memory handoff across hosts.

## Short Version

| Option | Primary shape | Where it is strong | How HandoffBase differs |
| --- | --- | --- | --- |
| Mem0 | Memory as an API / managed memory layer | Productized memory API and app integration | HandoffBase is an open MCP server and control plane for cross-agent handoff. |
| Zep | Temporal graph / enterprise agent memory | Graph-structured memory and enterprise retrieval | HandoffBase emphasizes MCP-native tools/resources, traceable context packs, and user-governed handoff. |
| Letta | Memory-first agent runtime | Agents with built-in memory architecture | HandoffBase does not require moving to a new runtime; existing MCP hosts can connect. |
| LangMem | LangGraph memory toolkit | Memory workflows inside LangGraph apps | HandoffBase is host-facing infrastructure through MCP, not only an app-framework toolkit. |
| Repo-local memory files | Project-local text memory | Simple, transparent repo instructions | HandoffBase handles cross-session, cross-host, scoped, traceable, and governed memory. |
| Generic RAG/vector DB | Document retrieval | Search over documents and embeddings | HandoffBase adds lifecycle, conflicts, trace records, memory types, and MCP operations. |

## Mem0

Mem0 is commonly positioned as a memory API or managed memory layer for applications. That is useful when a product wants an external memory service.

HandoffBase instead exposes memory as MCP infrastructure. The goal is not to replace every managed memory product; it is to let Codex, Claude Code, Cursor, and custom MCP hosts share a controlled memory handoff layer with inspectable tools and resources.

## Zep

Zep focuses on temporal graph memory and enterprise-grade agent memory. That is a strong direction for graph-rich, production memory systems.

HandoffBase focuses on open-source MCP control. Its key surface is the MCP contract: memory tools, memory resources, reusable prompts, trace records, and conflict governance that MCP hosts can use directly.

## Letta

Letta is a memory-first agent runtime. It is appropriate when the runtime itself is part of the product architecture.

HandoffBase is not an agent runtime. It lets existing agents keep their own runtime and connect to a shared memory layer through MCP.

## LangMem

LangMem is a toolkit for memory workflows in LangGraph ecosystems. It is valuable when the application is already built around LangGraph.

HandoffBase is framework-neutral from the host perspective. It presents memory as a remote MCP interface instead of a library that must be embedded inside one app framework.

## Repo-Local Memory Files

Files such as `AGENTS.md`, `CLAUDE.md`, or project handoff docs are simple and inspectable. They work well for repo-local conventions.

They are weaker for cross-host continuity, user-level preferences, memory lifecycle, conflict detection, traceability, and deletion/update workflows. HandoffBase complements these files by providing scoped, queryable, governed memory that can follow the user and project across sessions.

## Generic RAG Or Vector Databases

RAG and vector databases retrieve relevant documents. They do not automatically define memory types, user approvals, status transitions, conflict records, trace explanations, or MCP tools.

HandoffBase can use vector storage as part of a future persistent store, but the project is broader than retrieval: it is memory governance and handoff infrastructure.

## HandoffBase Position

HandoffBase is best described as:

- MCP-native memory handoff,
- Qwen-backed memory reasoning for the hackathon path,
- traceable context-pack infrastructure,
- conflict-aware memory governance,
- an open-source control plane for agent continuity.

The current repository is an MVP with a proven Qwen-backed ECS deployment and an in-memory runtime store. Postgres runtime wiring and production-grade hosting remain future work.
