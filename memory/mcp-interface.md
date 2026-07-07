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

当前实现已注册以上 7 个 tools，并使用 Zod schemas 定义 input/output。`memory_remember`、`memory_recall`、`memory_reflect`、`memory_update`、`memory_forget` 会写入 in-memory store 的 event/trace 基础记录。

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

## Prompt Workflows

- `memory-aware-start`
- `post-run-reflection`
- `memory-review`
- `conflict-resolution`
