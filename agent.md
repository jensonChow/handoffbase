必须先读取本文件，再按需读取 `memory/README.md` 和相关 `memory/*.md` 后再改动项目。
必须把长期规则只写入本文件，且本文件不得超过 50 行。
必须让本文件只包含“必须”或“严禁”类型的规则。
必须把产品定位、架构、MCP 接口、部署、运营和历史决策分别维护在 `memory/` 下。
必须在修改项目方向、架构、接口、部署或重要取舍后同步更新 `memory/`。
必须让 `memory/README.md` 维护记忆索引和各文件职责。
必须优先遵循 `memory/decisions.md` 中最新仍有效的产品和技术决策。
必须保持项目首版为 Remote Streamable HTTP MCP server。
必须保持 Qwen Cloud 为 hackathon 版本的核心 memory reasoning provider。
必须通过 provider adapter 保持长期架构可替换模型供应商。
必须默认把用户记忆设计为可审计、可编辑、可删除、可导出。
必须把敏感信息、密钥、token、cookie 和私人凭据排除在持久记忆之外。
必须用结构化 schema 定义 MCP tools、memory records、trace 和 event log。
必须让所有持久 memory 写入具备来源、scope、状态和审计事件。
必须在推荐或演示方案中体现跨 session、跨 host、过期遗忘和有限上下文召回。
严禁把本项目做成完整 agent runtime 或 Letta clone。
严禁把业务逻辑写死为 Qwen-only 或 Alibaba-only。
严禁把 local stdio 作为首版必需范围。
严禁把完整聊天记录默认保存为长期记忆。
严禁把未经确认的外部网页内容直接写入 procedure memory。
严禁在没有更新对应 memory 文件的情况下改变关键技术取舍。
