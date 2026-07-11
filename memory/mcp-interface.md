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
- `memory_forget`: 删除、失效或归档记忆；`enforce_capacity` mode 做 scoped strategic-forgetting sweep。
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

`memory_forget` modes（tool contract 仍是 9/9/4，`enforce_capacity` 是第 5 个 mode，不是新 tool）:

- 逐条 modes：`invalidate` / `archive` / `expire` / `hard_delete`，必须带 `memory_id`。
- `enforce_capacity`：capacity-bounded strategic forgetting sweep。必须带 `capacity`（禁止 `memory_id`），可选 `scopes`、`dry_run`、`protected_types`（这四个字段对 per-memory modes 是硬校验错误，不是被忽略——schema description 与 superRefine 一致）。engine 按 `retentionScore`（正是 Postgres recall ranking 的 non-query 投影：importance*2.0 + confidence*0.5 + capped useCount + hyperbolic recency——recall 排最后的就是 capacity 压力下最先被 evict 的）选 victims，把超出 capacity 的最低 retention actives 归档（archive-only，可逆；hard delete 仍是显式人工动作）。capacity 约束的是 total active 数；**eviction eligibility 由三个条件共同决定，且 dry-run 与 apply 用完全相同的判定**：(1) type 不在 `protected_types`；(2) memory scope 至少与 sweep scope 一样窄（sweep 命名的每个 optional dimension，memory 必须 defined 且相等——project-scoped sweep 永远不会归档其他 project 还在 recall 的 user-wide memory；broader memories 计入 capacity 但不可 evict）；(3) caller 对该 memory 的 scope 有 mutation authority（restricted API key 遇到 broader memory 是 ineligible，不是 mid-loop 抛错）。若 ineligible 独自超 capacity，sweep 尽力而为。`dry_run` 返回完整 eviction plan（带 retention_score）但零 mutation/零 event/零 trace。apply 时每条 eviction 有自己的 governance event（reason 带 capacity/retention/rank 标记，actor 归属 authenticated caller），并写一条 aggregate `capacity_sweep` trace（selected=retained、ignored=evicted+skipped、per-victim selectionReasons、metadata 含 evicted_count/skipped_count/ineligible_count），`memory_trace` 因此能解释 forgetting。output 新增 optional `capacity`/`retained_count`/`dry_run`/`trace_id`/`evicted_memories`。并发上 victims 在 mutation lock 下逐条 re-fetch，非 active 即 skip，且 archive 带 `expectedStatus:"active"`（`MemoryMutationPreconditionError` 视为 skip）——单进程 race 与共享 Postgres 的跨进程 race 都只有一个 mutation 赢、无 double event；被 skip 的 victim 不计入 retained_count、trace 里以 `Skipped by the capacity sweep` reason 标注，绝不谎报为 "Retained"。

Token budget（limited context window）：`memory_recall` / `continuity_bootstrap` 的 `token_budget` 现在是 server-side 硬约束：`enforceTokenBudget` 在 service 层对 provider 返回的 context pack 按 rendered `- [type] text` 行做 greedy skip-and-continue 重量测，`estimated_tokens <= token_budget` 按构造成立，provider echo 假 budget 也绕不过（caller-effective budget 永远覆盖 echo）。被 trim 的 memory 进 context-pack trace 的 ignored，reason 是 `Trimmed to fit the token budget of N tokens.`（与 provider 自己的 `Skipped to fit the token budget.` 区分，trace 可分辨 provider-skip vs server-trim）。两个 tool 的 output 新增 optional `token_budget` / `estimated_tokens`。诚实标注：budget 用 chars/4 启发式 estimator 量 rendered context 行，不是 official tokenizer。

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
