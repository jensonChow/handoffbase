# Architecture Memory

## Current Architecture Direction

首版只做 Remote Streamable HTTP MCP server。所有 host 连接同一个云端 MCP endpoint，例如 `https://api.example.com/mcp`。

## Main Components

- MCP Server Layer: 暴露 tools/resources/prompts。
- Scope Resolver: 解析 user、agent profile、host、project、session、tool scope。
- Memory Orchestrator: 调度抽取、分类、冲突判断、召回、写入和 trace。
- Qwen Cloud Reasoning Layer: hackathon 版本的核心记忆推理 provider。
- Storage Layer: Postgres + pgvector + event log。
- Dashboard: Memory Vault、pending review、trace、edit/delete/export。

## Current MVP Implementation

当前仓库使用 npm workspace:

- 根目录 `src/`: Remote Streamable HTTP MCP server 和 `ContinuityMemoryService`。
- `packages/memory-core`: memory records、lifecycle、validation、sensitive-data rejection/redaction、event log、trace、in-memory store、Postgres/pgvector migration contract、Postgres row-mapping scaffold、provider interface、Qwen/mock providers。
- `apps/dashboard`: Next.js Memory Vault dashboard，当前通过默认 mock client boundary 展示 vault、pending、edit/delete、trace、conflicts；HTTP client scaffold 需要显式 `mode: "http"` 才启用。
- `demo/opportunity-scout`: AI Opportunity Scout seed memories、session flow 和 JSON-RPC examples。

本地 MVP 默认使用 in-memory store 和 `MockMemoryProvider`。设置 Qwen/DashScope env 后由 `QwenMemoryProvider` 通过统一 provider interface 接管 reasoning。

## Contract Boundaries

- `packages/memory-core/src/types.ts` 是 memory type、status、source kind 等枚举的 canonical source；MCP schemas 和 SQL migration 必须跟它保持一致。
- Memory、run、trace、event、embedding ids 当前采用 domain text id，而不是强制数据库 uuid。SQL migration 的引用字段和数组也使用 text。
- `memory_recall.trace_id` 和 `continuity_bootstrap.memory_trace_id` 返回最终 context-pack trace。原始 retrieval trace 仍保留，并通过 context-pack trace metadata 的 `retrieval_trace_id` 反链。
- `PostgresMemoryStore` 目前是设计切片：支持 SQL row mapping、read/list query building 和测试；mutation、recall、embedding upsert、run/trace insert 仍显式未实现，不能当成生产持久 store。

## Provider Abstraction

Memory Core 只能依赖 `MemoryReasoningProvider` 接口。比赛版实现 `QwenMemoryProvider`，长期可以增加 OpenAI、Anthropic 或本地模型 provider。

Qwen prompt 构建前必须先经过 provider input sanitizer。sanitizer 会递归清理敏感 key/value、截断大型结构，并复用 sensitive-data redaction，防止 tool logs、headers、cookies、tokens 或 private keys 进入 provider prompt。

## CI Boundary

GitHub Actions 使用 Node 22、`npm ci` 和 `npm run check`。CI 显式清空 `QWEN_API_KEY` 和 `DASHSCOPE_API_KEY`，因此验证路径必须默认走 `MockMemoryProvider`，不能要求真实 Qwen credentials。

## Deployment Boundary

比赛版部署在 Alibaba Cloud。业务层保持标准 HTTP、Postgres/pgvector、Docker/container 形态，避免长期绑定某个云厂商。

## Data Boundary

所有 memory 必须有 type、scope、source、status、confidence、importance、validity、event log。支持 JSON/Markdown export，避免用户数据锁定。
