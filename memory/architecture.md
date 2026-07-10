# Architecture Memory

## Current Architecture Direction

首版只做 Remote Streamable HTTP MCP server。所有 host 连接同一个云端 MCP endpoint，例如 `https://api.example.com/mcp`。

## Main Components

- MCP Server Layer: 暴露 tools/resources/prompts。
- Scope Resolver: 解析 user、agent profile、host、project、session、tool scope。
- Memory Orchestrator: 调度抽取、分类、冲突判断、召回、写入和 trace。
- Qwen Cloud Reasoning Layer: hackathon 版本的核心记忆推理 provider。
- Storage Layer: runtime 默认 credential-free in-memory store；设置 `STORE_MODE=postgres` 和 server-only `DATABASE_URL` 后使用 `PostgresMemoryStore`。迁移必须通过显式 `npm run db:migrate` 执行，startup 不自动迁移。
- Dashboard: Memory Vault、pending review、trace、edit/delete/export。浏览器默认调用 same-origin API；server 端与 MCP runtime 读取同一 `STORE_MODE`/`DATABASE_URL`，Postgres 模式还必须配置显式 tenant/user scope。

## Current MVP Implementation

当前仓库使用 npm workspace:

- 根目录 `src/`: Remote Streamable HTTP MCP server 和 `ContinuityMemoryService`。
- `packages/memory-core`: memory records、lifecycle、validation、sensitive-data rejection/redaction、event log、trace、in-memory store、Postgres/pgvector migration contract、Postgres CRUD/recall/trace/event/embedding/conflict store implementation、provider interface、Qwen/mock providers。
- `apps/dashboard`: Next.js Memory Vault dashboard。浏览器默认调用同源 `/api/dashboard/*`；只有显式 `HANDOFFBASE_DASHBOARD_CLIENT_MODE=mock` 才使用 mock demo。API backend 默认 server in-memory；Postgres 模式使用与 MCP runtime 相同的数据库并标记为 shared persistent store。
- `demo/opportunity-scout`: AI Opportunity Scout seed memories、session flow 和 JSON-RPC examples。
- `examples/`: local/Qwen/remote quickstarts、MCP host config placeholders、HTTP payload walkthroughs、local eval dataset。
- `docs/architecture.md`、`docs/comparison.md`、`docs/memory-lifecycle.md`、`docs/evals.md`、`docs/demo-dashboard.md`: public-facing architecture, positioning, lifecycle, eval, and dashboard demo docs。
- `scripts/run-memory-eval.mjs`: credential-free deterministic memory eval pack runner，exposed as `npm run eval:memory`。
- `scripts/run-memory-benchmarks.mjs`: comparative no-memory / HandoffBase deterministic regression harness，包含 conflict resolution lifecycle assertions。
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
- API key auth is enforced at the HTTP MCP boundary when `HANDOFFBASE_AUTH_MODE=api_key`; tool input scopes cannot widen the resolved caller tenant/user/project/agent scope.

## Provider Abstraction

Memory Core 只能依赖 `MemoryReasoningProvider` 接口。比赛版实现 `QwenMemoryProvider`，长期可以增加 OpenAI、Anthropic 或本地模型 provider。

Qwen prompt 构建前必须先经过 provider input sanitizer。sanitizer 会递归清理敏感 key/value、截断大型结构，并复用 sensitive-data redaction，防止 tool logs、headers、cookies、tokens 或 private keys 进入 provider prompt。

## CI Boundary

GitHub Actions 使用 Node 22、`npm ci` 和 `npm run check`。`check` 包含 type/build、8-tool smoke、unit/runtime/dashboard tests、local eval、comparative benchmark、LongMemEval tiny matrix、cross-host E2E、Markdown link 和 tracked-secret gates。CI 显式清空 Qwen credentials，所有这些路径必须默认使用 mock/in-memory 且不需要 Docker 或网络。

## Deployment Boundary

比赛版部署在 Alibaba Cloud。业务层保持标准 HTTP、Postgres/pgvector、Docker/container 形态，避免长期绑定某个云厂商。当前 Docker profile 启动 `node dist/index.js`，`/health` 只暴露 name/version/transport/path/auth/provider/store mode，不暴露密钥或连接串。

## Data Boundary

所有 memory 必须有 type、scope、source、status、confidence、importance、validity、event log。支持 JSON/Markdown export，避免用户数据锁定。
