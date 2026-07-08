# Architecture Memory

## Current Architecture Direction

首版只做 Remote Streamable HTTP MCP server。所有 host 连接同一个云端 MCP endpoint，例如 `https://api.example.com/mcp`。

## Main Components

- MCP Server Layer: 暴露 tools/resources/prompts。
- Scope Resolver: 解析 user、agent profile、host、project、session、tool scope。
- Memory Orchestrator: 调度抽取、分类、冲突判断、召回、写入和 trace。
- Qwen Cloud Reasoning Layer: hackathon 版本的核心记忆推理 provider。
- Storage Layer: 当前 runtime 默认 in-memory store，Postgres + pgvector schema/store path 已实现但 runtime env wiring 仍是 future work。
- Dashboard: Memory Vault、pending review、trace、edit/delete/export。

## Current MVP Implementation

当前仓库使用 npm workspace:

- 根目录 `src/`: Remote Streamable HTTP MCP server 和 `ContinuityMemoryService`。
- `packages/memory-core`: memory records、lifecycle、validation、sensitive-data rejection/redaction、event log、trace、in-memory store、Postgres/pgvector migration contract、Postgres CRUD/recall/trace/event/embedding/conflict store implementation、provider interface、Qwen/mock providers。
- `apps/dashboard`: Next.js Memory Vault dashboard，默认 mock client boundary；设置 `NEXT_PUBLIC_HANDOFFBASE_DASHBOARD_CLIENT=http` 可调用同源 `/api/dashboard/*` API routes。
- `demo/opportunity-scout`: AI Opportunity Scout seed memories、session flow 和 JSON-RPC examples。
- `examples/`: local/Qwen/remote quickstarts、MCP host config placeholders、HTTP payload walkthroughs、local eval dataset。
- `docs/architecture.md`、`docs/comparison.md`、`docs/memory-lifecycle.md`、`docs/evals.md`、`docs/demo-dashboard.md`: public-facing architecture, positioning, lifecycle, eval, and dashboard demo docs。
- `scripts/run-memory-eval.mjs`: credential-free deterministic memory eval pack runner，exposed as `npm run eval:memory`。

本地 MVP 默认使用 in-memory store 和 `MockMemoryProvider`。设置 Qwen/DashScope env 后由 `QwenMemoryProvider` 通过统一 provider interface 接管 reasoning。

Open-source readiness docs must not change the MCP surface, cloud deployment, or runtime store selection. The public architecture narrative should continue to show Qwen behind `MemoryReasoningProvider`, `InMemoryMemoryStore` as current live/runtime default, and `PostgresMemoryStore` as implemented future persistence path.

## Contract Boundaries

- `packages/memory-core/src/types.ts` 是 memory type、status、source kind 等枚举的 canonical source；MCP schemas 和 SQL migration 必须跟它保持一致。
- Memory、run、trace、event、embedding ids 当前采用 domain text id，而不是强制数据库 uuid。SQL migration 的引用字段和数组也使用 text。
- `memory_recall.trace_id` 和 `continuity_bootstrap.memory_trace_id` 返回最终 context-pack trace。原始 retrieval trace 仍保留，并通过 context-pack trace metadata 的 `retrieval_trace_id` 反链。
- `PostgresMemoryStore` 支持 core CRUD、supersede、embedding upsert、run/trace insert、structured recall、recall event/trace、memory_conflicts CRUD 和 SQL row mapping；默认 server factory 尚未用 env vars 自动选择 Postgres。
- Memory conflicts are first-class records. `memory_remember` persists provider conflicts as `MemoryConflictRecord` rows/records and holds ask_user、merge、supersede candidates as pending instead of silently changing active memories.
- API key auth is enforced at the HTTP MCP boundary when `HANDOFFBASE_AUTH_MODE=api_key`; tool input scopes cannot widen the resolved caller tenant/user/project/agent scope.

## Provider Abstraction

Memory Core 只能依赖 `MemoryReasoningProvider` 接口。比赛版实现 `QwenMemoryProvider`，长期可以增加 OpenAI、Anthropic 或本地模型 provider。

Qwen prompt 构建前必须先经过 provider input sanitizer。sanitizer 会递归清理敏感 key/value、截断大型结构，并复用 sensitive-data redaction，防止 tool logs、headers、cookies、tokens 或 private keys 进入 provider prompt。

## CI Boundary

GitHub Actions 使用 Node 22、`npm ci` 和 `npm run check`。CI 显式清空 `QWEN_API_KEY` 和 `DASHSCOPE_API_KEY`，因此验证路径必须默认走 `MockMemoryProvider`，不能要求真实 Qwen credentials。

## Deployment Boundary

比赛版部署在 Alibaba Cloud。业务层保持标准 HTTP、Postgres/pgvector、Docker/container 形态，避免长期绑定某个云厂商。当前 Docker profile 启动 `node dist/index.js`，`/health` 只暴露 name/version/transport/path/auth/provider/store mode，不暴露密钥或连接串。

## Data Boundary

所有 memory 必须有 type、scope、source、status、confidence、importance、validity、event log。支持 JSON/Markdown export，避免用户数据锁定。
