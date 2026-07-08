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

当前 README 的主 tagline 是 “Open memory handoff for AI agents.”，并且必须诚实说明 live proof 是 Qwen-backed、storeMode 仍为 in-memory，Postgres runtime wiring 是 future work。
