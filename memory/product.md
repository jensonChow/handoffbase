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
