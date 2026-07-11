# MCP Interface Memory

## Transport

首版只支持 Remote Streamable HTTP。Local stdio 不在 MVP 范围内，后续可做 thin wrapper 转发到远程 MCP endpoint。

当前实现使用 official MCP TypeScript SDK，默认 endpoint 为 `http://127.0.0.1:3000/mcp`。`/health` 是无副作用 liveness；`/ready` 才做 Postgres schema 与 Qwen provider readiness probe。

## Core Tools

- `continuity_bootstrap`: 新 session 开始时生成 context pack。
- `memory_recall`: 按当前任务召回相关记忆。
- `memory_remember`: 从用户 correction、任务记录或 agent observation 生成候选记忆。
- `memory_reflect`: 对一次 agent run 做复盘，沉淀 procedure/tool/failure/decision/outcome memory。
- `memory_update`: 编辑、合并或 supersede 旧记忆。
- `memory_forget`: 删除、失效或归档记忆。
- `memory_trace`: 解释某次回答使用、忽略或排除的记忆。
- `memory_resolve_conflict`: 对 open conflict 执行显式、授权、可审计的 resolution。
- `memory_feedback`: 对 memory、trace 或二者记录 helpful/unhelpful；unhelpful 可带 correction，生成 pending correction memory 与 sanitized regression fixture。

当前实现已注册以上 9 个 tools，并使用 Zod schemas 定义 input/output。`memory_resolve_conflict` 支持 `accept_candidate`、`reject_candidate`、`supersede_existing`、`merge`、`keep_both` 和 `dismiss_conflict`；`merge` 必须提供 `merged_text`。所有动作必须保留 linked memory 的 scope/source/provenance 和 audit/supersession links。

tool contract 未变（仍是 9/9/4），但 recall 行为增强：启用 embeddings 时 `memory_recall` / `continuity_bootstrap` 在 lexical 分数上叠加 semantic cosine（见 [[architecture]] Semantic Recall）。当前 runtime provider/store/embedding 模式通过 `getRuntimeInfo()` 与 `/health` 的 `embeddingMode`（qwen/mock/none）暴露。注意 `memory_update` 的 `supersede_conflicting` 是被诚实标注的 no-op，真正 supersede 走 `memory_resolve_conflict`。`memory_update` 的 patch 也不接受把 status 设为保留终态 `deleted`/`superseded`（返回明确错误）：`deleted` 必须走 `memory_forget` mode `hard_delete` 才能触发脱敏 tombstone，`superseded` 必须走 supersede/`memory_resolve_conflict`——否则 `deleted` 会保留原文绕过 hard-delete 脱敏，`superseded` 会因缺 `supersededBy` 抛 raw validation error（commit `fb2adfd`）。

`memory_feedback` input contract:

- 至少提供 `memory_id` 或 `trace_id`；两者同时提供时必须属于兼容 scope。
- `signal` 只能是 `helpful` 或 `unhelpful`。
- `correction` 只允许用于 `unhelpful`，并先经过 credential rejection、PII redaction 和 public-safe fixture shaping。
- correction 作为 `sourceKind=user_correction`、`status=pending` 的 memory 进入治理队列，不会直接激活。
- output 返回 `feedback_id`、target ids、signal/time、可选 pending correction summary 和 regression fixture。fixture 只保留 scope dimension 名，不保留 caller scope value 或真实 record id。
- runnable benchmark conversion 仍需人类确认 `--public-safe-confirmed`；产品反馈不会自动改写 tracked benchmark 数据集。

Authenticated HTTP 通过 typed `MemoryService.resolveConflict` 和 caller-bound wrapper 传递 scope，不再借用 `memory_update` private dispatch。Conflict vault 会逐条过滤同 tenant 下其他 user 无权读取的记录。

`hard_delete` 的输出 status 仍为 `deleted`，但 storage 语义是真实物理删除，不是把 row 留在 `status=deleted`。系统先脱敏所有关联 event/trace/conflict/feedback，再删除 memory/embedding；安全 delete tombstone 继续可审计。

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
