# Project Memory Index

本目录保存 handoffbase 的长期项目记忆。根部 `agent.md` 只保存必须/严禁规则；这里保存可展开的背景、要求、决策和实现约束。

## Files

- `product.md`: 产品定位、目标用户、核心痛点、非目标。
- `architecture.md`: 系统架构、模块边界、storage/provider/deployment 约束。
- `mcp-interface.md`: MCP tools/resources/prompts 的接口记忆。
- `qwen-cloud.md`: Qwen Cloud 与 Alibaba Cloud 的比赛版使用规则。
- `operations.md`: 开发、部署、验证、提交材料和安全操作记忆。
- `decisions.md`: 按时间记录仍有效的关键决策。

Session-scoped transfer notes live in `docs/handoff.md`; do not duplicate short-term handoff state into durable memory files.

Public-facing product, effect, benchmark, and workflow docs live under `docs/`; do not create durable memory files for those docs unless they change product, architecture, operation, or decision facts.

## Update Rules

- 修改产品方向、架构、接口、部署或比赛策略后，同步更新对应 memory 文件。
- 新增长期决策时，追加到 `decisions.md`，并在相关主题文件中反映当前状态。
- 过期或被替代的记忆不要删除到无法追踪；在 `decisions.md` 标记 superseded。
- 临时任务进度不进入长期 memory，除非它改变了产品或技术事实。
