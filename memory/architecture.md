# Architecture Memory

## Current Architecture Direction

首版只做 Remote Streamable HTTP MCP server。所有 host 连接同一个云端 MCP endpoint，例如 `https://api.example.com/mcp`。

## Main Components

- MCP Server Layer: 暴露 tools/resources/prompts。
- Scope Resolver: 解析 user、agent profile、host、project、session、tool scope。
- Memory Orchestrator: 调度抽取、分类、冲突判断、召回、写入和 trace。
- Qwen Cloud Reasoning Layer: hackathon 版本的核心记忆推理 provider。
- Storage Layer: runtime 默认 credential-free in-memory store；设置 `STORE_MODE=postgres` 和 server-only `DATABASE_URL` 后使用 `PostgresMemoryStore`。迁移必须通过显式 `npm run db:migrate` 执行，startup 不自动迁移；migration ledger 按文件记录 SHA-256 checksum，并以 transaction advisory lock 串行化应用。
- Dashboard: Memory Vault、pending/conflict review、trace feedback、edit/lifecycle/delete/export、Audit & Deletion History。浏览器默认调用 same-origin API；API-key 模式先把 HandoffBase key 换成签名 HttpOnly session，再从当前 key mapping 恢复 caller。所有 mutation 经 caller-bound `ContinuityMemoryService`，只读 snapshot/audit 才直接使用 caller-scoped store。`HANDOFFBASE_DASHBOARD_*` 只能收窄 caller grant，不能建立身份。

## Current MVP Implementation

当前仓库使用 npm workspace:

- 根目录 `src/`: Remote Streamable HTTP MCP server 和 `ContinuityMemoryService`。
- `packages/memory-core`: memory records、lifecycle、feedback、validation、sensitive-data rejection/redaction、event log、trace、in-memory store、Postgres/pgvector migration contract、Postgres CRUD/recall/trace/event/embedding/conflict/feedback store implementation、provider interface、Qwen/mock providers。
- `apps/dashboard`: Next.js Memory Vault dashboard。浏览器默认调用同源 `/api/dashboard/*`；只有显式 `HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock` 才使用 mock demo。API backend 默认 server in-memory；Postgres 模式使用与 MCP runtime 相同的数据库并标记为 shared persistent store。生产环境在 auth disabled 时 fail closed，state-changing routes 还要求 exact same-origin `Origin`。
- `demo/opportunity-scout`: AI Opportunity Scout seed memories、session flow 和 JSON-RPC examples。
- `examples/`: local/Qwen/remote quickstarts、MCP host config placeholders、HTTP payload walkthroughs、local eval dataset。
- `docs/architecture.md`、`docs/comparison.md`、`docs/memory-lifecycle.md`、`docs/evals.md`、`docs/demo-dashboard.md`: public-facing architecture, positioning, lifecycle, eval, and dashboard demo docs。
- `scripts/run-memory-eval.mjs`: credential-free deterministic memory eval pack runner，exposed as `npm run eval:memory`。
- `scripts/run-memory-benchmarks.mjs`: comparative no-memory / HandoffBase deterministic regression harness，包含 conflict resolution lifecycle assertions。
- `scripts/feedback-fixture-to-benchmark.mjs`: 将 sanitized unhelpful correction fixture 转为独立、deterministic synthetic benchmark file；要求显式 `--public-safe-confirmed`，拒绝 UUID、未知 identity/scope 字段和 sensitive content，不修改 tracked suite。
- `benchmarks/longmemeval/`: cleaned LongMemEval-format adapter、tiny synthetic fixture、deterministic reader 和显式 opt-in Qwen reader/provider seam；adapter output 与 official evaluator output 严格分离。
- `scripts/e2e/cross-host-scenario.mjs`: 使用 official MCP SDK client 和真实 loopback Streamable HTTP server 的 deterministic cross-host E2E。

本地 MVP 默认使用 in-memory store 和 `MockMemoryProvider`。设置 Qwen/DashScope env 后由 `QwenMemoryProvider` 通过统一 provider interface 接管 reasoning。

Public architecture narrative must distinguish code capability from deployment proof: Qwen remains behind `MemoryReasoningProvider`; in-memory remains the safe local/CI default and the historical Alibaba live-proof store; Postgres is now a selectable local/runtime code path but has not been validated as the Alibaba production store.

## Contract Boundaries

- `packages/memory-core/src/types.ts` 是 memory type、status、source kind 等枚举的 canonical source；MCP schemas 和 SQL migration 必须跟它保持一致。
- Memory、run、trace、event、embedding ids 当前采用 domain text id，而不是强制数据库 uuid。SQL migration 的引用字段和数组也使用 text。
- `memory_recall.trace_id` 和 `continuity_bootstrap.memory_trace_id` 返回最终 context-pack trace。原始 retrieval trace 仍保留，并通过 context-pack trace metadata 的 `retrieval_trace_id` 反链。
- `PostgresMemoryStore` 支持 core CRUD、supersede、embedding upsert、run/trace insert、structured recall、recall event/trace、memory_conflicts CRUD 和 SQL row mapping；server runtime factory 已通过 `STORE_MODE`/`DATABASE_URL` 选择它，并在 shutdown 时关闭 pool。
- Memory conflicts are first-class records. `memory_remember` persists provider conflicts as `MemoryConflictRecord` rows/records and holds ask_user、merge、supersede candidates as pending instead of silently changing active memories.
- `memory_resolve_conflict` 通过 typed `MemoryService` boundary 执行 accept/reject/supersede/merge/keep-both/dismiss，并保留 scope/source/audit/supersession links。当前跨 memory + conflict 的串行化仍是 process-local；Postgres multi-process atomic resolution 仍未实现。
- API key auth is enforced at the HTTP MCP boundary when `HANDOFFBASE_AUTH_MODE=api_key`; tool input scopes cannot widen the resolved caller tenant/user/project/agent scope. API-key 查表只接受 config map 的 own property（`Object.hasOwn` + null-prototype map），并要求解析出的 caller 具备非空 string tenant/user，否则 401——否则 `Bearer constructor`/`__proto__`/`toString`/`valueOf` 等 `Object.prototype` 成员名会绕过 invalid-key 检查，变成 tenant/user=undefined、match-all 的 caller（已修复的跨租户越权，commit `fb2adfd`）。
- `PostgresMemoryStore` 的 list/recall 必须与 in-memory reference 语义一致：默认 `listMemories` 排除 effective-expired（含显式 `status=expired`，不只是 validity-expired）；defined-but-empty 的 types/statuses/signals/conflictTypes allowlist 表示 match-nothing 而非 no-filter；pgvector 距离按 `vector_dims` 守卫，query embedding 维度不匹配时退回 0，而不是让整次 recall 抛错。
- `memory_feedback` 可针对 memory、trace 或二者记录 helpful/unhelpful；unhelpful correction 创建 pending `user_correction` memory，并返回不含真实 id/scope value 的 regression fixture。Postgres correction + feedback 使用同一 store transaction；feedback target、recall trace 和 conflict link 在写入时加锁/重验，避免与 hard delete 竞态重新持久化已删除内容。
- `hard_delete` 物理删除 memory 与 embedding，同时在同一 store mutation 中脱敏历史 event/trace/conflict/feedback 内容；保留的 delete event 只含稳定 id、scope、actor/time/status 等安全 tombstone。Dashboard 的全局 audit view 仍能显示该 tombstone。
- 内置 InMemory/Postgres stores 的 correction + feedback 是单一 unit-of-work。第三方 custom `MemoryStore` 若没有实现 optional atomic feedback method，service 只能做普通异常补偿；该 fallback 不具 process-crash atomicity 或 idempotency key。
- Postgres recall 为保证 lifecycle/delete 一致性，会对本次 selected + ignored references 按 id 一次性 `FOR NO KEY UPDATE` 并用 fresh row 重验。当前 ignored query 无上限，因此大 vault 下存在 O(n) lock amplification；production 优化应改成有限相关样本或汇总 trace，而不是弱化一致性锁。

## Semantic Recall (Embeddings)

- `packages/memory-core/src/embeddings/` 定义 `EmbeddingProvider` 接口（`embed(texts)`、`model`、`dimensions`）加 `cosineSimilarity`，并实现 `QwenEmbeddingProvider`（DashScope OpenAI-compatible `/embeddings`，默认 `text-embedding-v4` @ 1536 维，匹配 `memory_embeddings.embedding vector(1536)` 列，免 migration）和 deterministic `MockEmbeddingProvider`（离线/CI）。
- `ContinuityMemoryService` 在 write（`remember`/`reflect`）和 recall（`recall`/`continuity_bootstrap`）时做 best-effort embed：embedding 失败绝不让写入失败。In-memory store 在 lexical 分数上叠加 `SEMANTIC_RECALL_WEIGHT * max(0, cosine)`；Postgres recall 的 pgvector 项现为 `greatest(0, 1 - (e.embedding <=> $n::vector))`（2026-07-14 起与 in-memory 的 max(0, cosine) 完全对齐），并用 `vector_dims(e.embedding) <> queryDim` 的 CASE 短路守卫，维度不匹配时得 0，与 in-memory `cosineSimilarity`（长度不匹配返回 0）对齐。
- **统一 recall ranking（2026-07-14）**：两个 store 用同一公式 = 共享 prior（`retentionScore`：importance*2.0 + confidence*0.5 + min(useCount,20)*0.01 + recency + bounded feedback ±0.6）+ 共享 lexical（`lexicalRecallScore`，`keywordScoreSql` 的 TS 孪生）+ semantic cosine，tiebreak 用 `compareRecallRank`（Postgres ORDER BY 的镜像）。helpful/unhelpful feedback 通过 `feedbackReinforcement`（0.15/net，cap ±4，swing ±0.6）read-time 聚合进 recall 与 capacity eviction；context pack 在 `enforceTokenBudget` 处按 normalized rendered-line **精确**去重（lowercase + 折叠空白，trace reason 区分 provider-skip / server-trim / exact-duplicate）——pre-merge 对抗式 review 证实模糊 Jaccard 会静默丢弃仅差一个数字或否定词的不同事实，故改为精确匹配。Postgres keyword 用 `position()`（非 LIKE，避免 `_` 通配符与 in-memory `includes` 分歧），recall ORDER BY 末尾补 `m.id asc` 与 `compareRecallRank` 对齐。详见 memory/decisions.md 2026-07-14。
- 默认 **OFF**：有 Qwen/DashScope credential 时自动启用 Qwen embeddings，否则退回 lexical，所以 credential-free CI 与 deterministic 17/17 benchmark 逐字不变。`HANDOFFBASE_EMBEDDINGS=mock|off` 可强制覆盖。runtime 通过 `embeddingMode`（qwen/mock/none）在 `getRuntimeInfo()` 与 `/health` 暴露当前模式。

## Provider Abstraction

Memory Core 只能依赖 `MemoryReasoningProvider` 接口。比赛版实现 `QwenMemoryProvider`，长期可以增加 OpenAI、Anthropic 或本地模型 provider。

Qwen prompt 构建前必须先经过 provider input sanitizer。sanitizer 会递归清理敏感 key/value、截断大型结构，并复用 sensitive-data redaction，防止 tool logs、headers、cookies、tokens 或 private keys 进入 provider prompt。

写入 memory 的文本走 `assessMemorySafety`/`rejectSensitiveText` 的正则脱敏/拒绝：credential/token pattern 必须覆盖 JSON-quoted key（`"password":"…"`，key 与 `:` 间有引号），phone pattern 必须收紧为真实电话形态，不能把 ISO 日期（`2024-01-15`）或点分版本号误脱敏成 `[REDACTED_PHONE]`（commit `fb2adfd`）。

## Runtime Readiness Boundary

- `GET /health` 只做无副作用 liveness/config metadata，不访问 Postgres 或 Qwen。
- `GET /ready` 做真实 dependency readiness：Postgres 查询当前 `memories` 和 `memory_feedback` schema；Qwen 模式调用一次 1-token chat completion，并默认缓存五分钟、合并 concurrent cache miss。
- `api_key` 模式下 `/ready` 使用与 `/mcp` 相同的认证。默认 loopback local server 可在 auth-disabled 时做 Qwen probe，保证本地 onboarding 可自证；non-loopback（包括显式 insecure demo override）的 Qwen + auth-disabled 会在付费 provider call 前 fail closed。
- auth-disabled server 默认只能绑定 loopback；非 loopback 必须使用 `api_key`，或仅在明确隔离 demo 中设置 `HANDOFFBASE_ALLOW_INSECURE_REMOTE=1`。

## CI Boundary

GitHub Actions 使用 Node 22、`npm ci` 和 `npm run check`。`check` 包含 type/build、9-tool smoke、unit/runtime/dashboard tests、local eval、comparative benchmark、LongMemEval tiny matrix、cross-host E2E、Markdown link 和 tracked-secret gates。CI 显式清空 Qwen credentials，所有这些路径必须默认使用 mock/in-memory 且不需要 Docker 或网络。

## Deployment Boundary

比赛版部署在 Alibaba Cloud。业务层保持标准 HTTP、Postgres/pgvector、Docker/container 形态，避免长期绑定某个云厂商。当前 Docker profile 启动 `node dist/index.js`；`/health` 只暴露 name/version/transport/path/auth/provider/store/embedding mode，`/ready` 只暴露 dependency status metadata，二者都不暴露密钥、连接串或 provider response body。

## Data Boundary

所有 memory 必须有 type、scope、source、status、confidence、importance、validity、event log。支持 JSON/Markdown export，避免用户数据锁定。
