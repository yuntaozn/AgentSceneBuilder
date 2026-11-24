# AI 接入设计

AgentSceneBuilder 是面向 AI 大模型的数字建模基础设施。宿主 Agent 理解任务和约束，通过 Skill 找到合适的建模能力，调用 CLI 构建和检查模型，并根据结构化结果修正输入。静态模型库和编辑器提供可视化复核与调参界面。

## 接入形态

### CLI

CLI 是 Codex、YuntaoCode 等宿主中的 Agent 调用本项目的主要入口，也可供 CI 和脚本调用。

- stdout 只输出一个 JSON 对象；
- 成功返回 `{ "ok": true, ... }`；
- 失败返回 `ok: false` 并退出 2。检查命令通过 `issues` 提供批量诊断，其他命令的执行错误通常通过 `error` 返回；
- proposal 提供可审阅的候选变更，由 Agent 或宿主决定是否应用。

从仓库根目录运行下列命令可直接获取 JSON 输出。

```bash
node packages/cli/src/agentscene.mjs component list
node packages/cli/src/agentscene.mjs component describe core.composition
node packages/cli/src/agentscene.mjs registry search --domain equipment --kind composition 无人机
node packages/cli/src/agentscene.mjs composition check registry/compositions/dual-spectrum-inspection-drone/manifest.json
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

### 静态 Web 复核

HTTP 用于提供静态模型库和编辑器页面。浏览器中的预览和调参读取与 Agent 一致的模型数据，便于复核结构、外观和参数。

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
- 使用同一份模型数据的浏览器复核与调参界面。

## AI 使用策略

推荐给 AI 的工作方式：

1. 读取用户目标和当前项目结构。
2. 用 `registry search` 搜索条目。按结果的 `manifestPath` 读取模型源清单，并在 `registry/registry.json` 中读取该条目的 `agent` 上下文。
3. 优先复用独立构件或单体模型，再用 CompositionSpec 或场景实例表达组合。
4. 运行 CLI 检查，根据 `issues[].path` 修正输入并复查，然后构建、查询、测量或生成空间 proposal。
5. 审阅 proposal 后再决定是否应用。需要可视化核对时，打开静态模型库或编辑器。
6. 将模型源稿与检查结果交给宿主，供后续任务继续使用。
7. 将有复用价值的模型或方法沉淀回 registry。

## 避免的问题

- 不让 AI 直接重写全部场景代码作为默认路径。
- 不把当前产品路线过早转向 MCP 或长驻服务。
- 不把单个教学模板当作系统唯一入口。
- 不把截图失败直接解释成任务失败；截图只是证据之一。
