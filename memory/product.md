# Product Memory

## Positioning

handoffbase 是一个 MCP-native 的 Agent 连续性层。它通过远程 MCP server 为 Codex、Claude Code、Cursor、自研 Agent 等提供可迁移、可审计、可治理的长期记忆。

## Core Problem

当前 agent 的记忆通常被 session、project、host 或厂商生态切开。用户在一个 agent/session/project 中反复教会的偏好、流程、工具经验和失败教训，无法稳定迁移到另一个 agent/session/project。

## Product Goal

让不同 Agent 在不同 session、项目和 host 中表现得像同一个长期协作者，持续继承用户偏好、工作流程、工具经验、项目事实、失败教训和决策结果。

## Non Goals

- 不做完整 agent runtime。
- 不替代 Codex、Claude Code、Cursor 或 Letta。
- 不默认保存完整聊天记录。
- 不把 hard enforcement 规则只放进 memory；强约束仍应落在 host 配置、权限、hooks 或项目文档中。

## Hackathon Demo Focus

首个 demo agent 是 AI Opportunity Scout，用于展示 agent 如何跨 session 记住用户参加 AI hackathon 的目标、筛选偏好、工具经验和失败教训。

## Open Source Readiness

2026-07-08 起，项目进入 open-source/star-readiness 阶段。README、LICENSE、examples、architecture/comparison/lifecycle/eval/dashboard docs 的目标是让 HandoffBase 看起来像高质量开源基础设施项目，而不是只像一次 hackathon 实现记录。

公开定位必须保持克制：HandoffBase 是 MCP-native memory handoff layer，不声称全面替代 Mem0、Zep、Letta、LangMem 或成熟 managed memory 平台。比较文档应强调不同定位：跨 host MCP handoff、可追踪 context pack、冲突治理、用户可审计控制。

当前 README 的主 tagline 是 “Open memory handoff for AI agents.”，并且必须诚实区分：historical Alibaba live proof 是 Qwen-backed、`storeMode=in-memory`；当前代码已有 selectable Postgres runtime，但没有完成 Alibaba durable deployment proof。

## Effect Proof First

2026-07-09 起，产品叙事从包装优先转向效果证明优先。README、demo、dashboard、submission copy 和 open-source polish 都必须服务于一个更核心的产品价值：HandoffBase 如何通过可治理、可追踪、可更新、可遗忘、可冲突处理的 working memory，让后续 session、host 和 project 中的 agent 做出更正确、更一致、更少重复犯错的行为。公开材料应优先连接到 benchmark/eval-aware 指标、确定性回归包、负例测试和当前实现边界，而不是先追求营销包装。

当前 proof layer 包含 deterministic comparative subset（no-memory 与 HandoffBase）、真实 loopback HTTP/MCP cross-host E2E，以及 cleaned LongMemEval-format adapter/tiny fixture。它们证明 local regression 和 integration behavior，不构成 official benchmark score。只有完成 full official dataset run、official evaluator 和结果记录后才能公开 official score。

当前产品完整性边界：HandoffBase 是 functional open-source memory infrastructure MVP，不是 production SaaS。代码支持 8-tool MCP、authorized conflict resolution、selectable Postgres runtime、server-backed dashboard、comparative/tiny/e2e product gates；credential-free default 仍是 mock + in-memory。Alibaba ECS proof 是 historical deployment proof and may be stopped for cost control；其 live truth 仍为 `storeMode=in-memory`。Managed durable deployment、TLS/domain/LB/monitoring、backup/restore 和 multi-process conflict atomicity 仍是 future work。

## Submission Readiness

2026-07-09 起，项目有一套面向 Devpost 的 submission-readiness docs-only package。核心材料在 `docs/submission/`：Devpost copy、testing instructions、submission checklist、main demo script、Alibaba proof video script、recording shot list、architecture-for-devpost、final public-readiness checklist。

Submission copy 必须继续强调 Track 1: MemoryAgent、Qwen-backed memory reasoning、Remote Streamable HTTP MCP、Memory Vault governance、Alibaba ECS proof、local deterministic eval pack，以及当前限制。不能声称 ECS endpoint 当前在线、不能声称 production SaaS readiness、不能声称 benchmark score、不能声称 live store 已经 durable。
