# MCP Interface Memory

## Transport

首版只支持 Remote Streamable HTTP。Local stdio 不在 MVP 范围内，后续可做 thin wrapper 转发到远程 MCP endpoint。

当前实现使用 official MCP TypeScript SDK，默认 endpoint 为 `http://127.0.0.1:3000/mcp`，并保留 `/health` HTTP health check。

## Core Tools

- `continuity_bootstrap`: 新 session 开始时生成 context pack。
- `memory_recall`: 按当前任务召回相关记忆。
- `memory_remember`: 从用户 correction、任务记录或 agent observation 生成候选记忆。
- `memory_reflect`: 对一次 agent run 做复盘，沉淀 procedure/tool/failure/decision/outcome memory。
- `memory_update`: 编辑、合并或 supersede 旧记忆。
- `memory_forget`: 删除、失效或归档记忆。
- `memory_trace`: 解释某次回答使用、忽略或排除的记忆。
- `memory_resolve_conflict`: 对 open conflict 执行显式、授权、可审计的 resolution。

当前实现已注册以上 8 个 tools，并使用 Zod schemas 定义 input/output。`memory_resolve_conflict` 支持 `accept_candidate`、`reject_candidate`、`supersede_existing`、`merge`、`keep_both` 和 `dismiss_conflict`；`merge` 必须提供 `merged_text`。所有动作必须保留 linked memory 的 scope/source/provenance 和 audit/supersession links。

Authenticated HTTP 通过 typed `MemoryService.resolveConflict` 和 caller-bound wrapper 传递 scope，不再借用 `memory_update` private dispatch。Conflict vault 会逐条过滤同 tenant 下其他 user 无权读取的记录。

Trace semantics:

- `continuity_bootstrap.memory_trace_id` points to the context-pack trace returned to the host.
- `memory_recall.trace_id` points to the context-pack trace returned to the host.
- The underlying retrieval trace remains inspectable through the context-pack trace metadata field `retrieval_trace_id`.
- `memory_trace` explains used, ignored, and excluded memories from the final context-pack perspective, so tight token budgets can show recalled candidates as provider-ignored rather than used.

## Resource Scheme

使用 `memory://` URI 暴露可读上下文:

- `memory://users/{user_id}/profile`
- `memory://agents/{agent_profile_id}/procedures`
- `memory://agents/{agent_profile_id}/failures`
- `memory://projects/{project_id}/facts`
- `memory://projects/{project_id}/tool-notes`
- `memory://runs/{run_id}/summary`
- `memory://traces/{trace_id}`
- `memory://vault/pending`
- `memory://vault/conflicts`

`memory://traces/{trace_id}` returns raw trace JSON, including context-pack metadata such as token budget, estimated tokens, and retrieval trace linkage when present.

`memory://vault/conflicts` returns open `MemoryConflictRecord` entities, not a filtered pending-memory placeholder. Each item includes the conflict type, severity, recommended action, status, candidate memory summary, and existing memory summary when those linked memories are available.

## Prompt Workflows

- `memory-aware-start`
- `post-run-reflection`
- `memory-review`
- `conflict-resolution`
