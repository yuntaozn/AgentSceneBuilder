# AI 接入设计

AgentSceneBuilder 第一优先级是给 AI 使用。

人类界面可以存在，但不是核心入口。

## 接入形态

### CLI

适合 Codex、CI、本地脚本和普通命令行 Agent。

CLI 是当前最重要的 Agent 调用入口。约定：

- stdout 只输出一个 JSON 对象；
- 成功返回 `{ "ok": true, ... }`；
- 失败返回 `{ "ok": false, "error": ... }` 并使用非 0 退出码；
- proposal 只表达建议，不自动替 Agent 做领域决策。

首选入口：

```bash
node packages/cli/src/agentscene.mjs component list
node packages/cli/src/agentscene.mjs component describe core.composition
node packages/cli/src/agentscene.mjs component build examples/digital-modeling/independent-foundation.json
node packages/cli/src/agentscene.mjs scene build examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene analyze-spatial examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene propose-align examples/digital-modeling/alignment-source.json examples/digital-modeling/proposals/align-pipes.json
node packages/cli/src/agentscene.mjs path analyze examples/digital-modeling/paths/analyze-water-pipe.json
```

兼容入口：

```bash
node scripts/model.mjs component list
```

只读探针：

```bash
python scripts/agentscene.py catalog search "pipe support"
python scripts/agentscene.py catalog list
python scripts/agentscene.py scene validate examples/basic-building/scene.json
```

### Skill / Plugin

适合 Codex、YuntaoCode 等宿主 Agent。

Skill 负责说明“什么时候使用 AgentSceneBuilder、怎样调用 CLI、哪些结果必须人工或 Agent 审阅”。Plugin 只负责安装、发现、版本和权限边界，不引入额外本地服务协议。

Codex 插件骨架见 `docs/host-plugin-packaging.md`。当前项目根目录可以作为插件根，`.codex-plugin/plugin.json` 提供插件身份，`skills/agentscene-builder/SKILL.md` 作为很薄的 wrapper，真实使用规则仍以仓库根部 `SKILL.md` 为准。

### HTTP

适合人类使用的网站、模型库和可视化编辑器。HTTP 是静态 Web 或应用层部署方式，不作为 Agent 首要调用协议。

### YuntaoCode Provider

YuntaoCode 可以把 AgentSceneBuilder 作为外部 Capability Provider 使用。

YuntaoCode 仍负责：

- 任务上下文
- 用户确认
- 工具执行记录
- Run Evidence
- 最终总结

AgentSceneBuilder 只负责：

- 数字模型和 CompositionSpec 构建；
- 模型库条目检索与复用建议；
- 空间、路径、重复、锚点和连接计算；
- 可审阅的 proposal；
- 静态 Web 编辑器/模型库的人类查看与调参入口。

## AI 使用策略

推荐给 AI 的工作方式：

1. 读取用户目标和当前项目结构。
2. 搜索 registry，并读取候选条目的 `agent` 上下文。
3. 使用 CompositionSpec 表达模型结构。
4. 使用 CLI 构建、查询、测量或生成空间 proposal。
5. 审阅 proposal 后再决定是否应用。
6. 需要人类查看时，打开静态模型库或 Editor。
7. 将有复用价值的模型或方法沉淀回 registry。

## 避免的问题

- 不让 AI 直接重写全部场景代码作为默认路径。
- 不把当前产品路线过早转向 MCP 或长驻服务。
- 不把单个教学模板当作系统唯一入口。
- 不把截图失败直接解释成任务失败；截图只是证据之一。
