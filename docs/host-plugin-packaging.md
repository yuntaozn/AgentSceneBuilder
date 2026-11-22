# Host Plugin Packaging

AgentSceneBuilder 当前的宿主接入路线是：

```text
Codex / YuntaoCode / 其他宿主 Agent
        ↓
Plugin manifest（安装、发现、权限边界）
        ↓
Skill（使用原则、触发条件、注意事项）
        ↓
CLI（确定性数字建模、空间方法、模型库检查）
        ↓
Core / Registry / Editor / Library
```

这条线不包含 MCP，也不要求长驻本地服务。插件不是运行时内核，只是宿主识别和分发 AgentSceneBuilder 的包装层。

## 当前 Codex 插件骨架

项目根目录现在可以作为插件根：

```text
AgentSceneBuilder/
  .codex-plugin/plugin.json
  skills/agentscene-builder/SKILL.md
  SKILL.md
  agents/openai.yaml
  packages/cli/src/agentscene.mjs
  registry/
  apps/editor/
  apps/library/
```

`skills/agentscene-builder/SKILL.md` 是很薄的插件 wrapper。它只负责让插件系统发现 skill，然后要求 Agent 继续读取仓库根部的 `SKILL.md`。这样可以避免维护两份真实 skill 说明。

## Codex 最小能力边界

Codex 插件应提供：

- 插件身份：`.codex-plugin/plugin.json`；
- Skill 入口：`skills/agentscene-builder/SKILL.md`；
- 权威说明：仓库根部 `SKILL.md`；
- 本地 CLI：`node packages/cli/src/agentscene.mjs ...`；
- 兼容入口：`node scripts/model.mjs ...`；
- 人类查看入口：`apps/library` 和 `apps/editor` 静态页面。

Codex 插件不应提供：

- `.mcp.json`；
- 后台常驻服务；
- 自动替 Agent 应用空间 proposal 的工具；
- 依赖 GLB/GLTF 作为唯一事实来源的流程。

## YuntaoCode 接入建议

如果 YuntaoCode 支持 skill 目录，优先直接读取仓库根部 `SKILL.md`，并把项目根目录作为工作目录调用 CLI。

如果 YuntaoCode 支持插件 manifest，可将 `.codex-plugin/plugin.json` 作为字段映射参考：

| Codex 字段 | YuntaoCode 可映射含义 |
| --- | --- |
| `name` | 能力包 ID |
| `description` | 能力包描述 |
| `skills` | skill 入口目录 |
| `interface.displayName` | UI 显示名称 |
| `interface.shortDescription` | UI 简述 |
| `interface.defaultPrompt` | 示例提示 |

YuntaoCode 侧仍负责任务上下文、用户确认、执行记录和最终总结。AgentSceneBuilder 只负责数字模型、空间方法、模型库、CLI 检查和人类查看/编辑入口。

## 验证命令

```powershell
npm.cmd run agentscene -- --help
node packages/cli/src/agentscene.mjs component list
node packages/cli/src/agentscene.mjs path analyze examples/digital-modeling/paths/analyze-water-pipe.json
node --test tests/*.test.js
```

Codex 插件 manifest 也应通过 plugin validator：

```powershell
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" .
```

## 下一步

下一轮可以做 repo-local marketplace 或个人 marketplace 安装流，但这一步应单独确认，因为它会写入宿主插件市场配置，而不只是修改项目本身。
