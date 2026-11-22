# 产品路线

路线图只描述近期可验证的构建顺序，不做过度愿景。当前基线是“数字建模内核 + 模型库 + Skill + CLI + 静态 Web 查看/编辑”，不走 MCP 或长驻本地服务路线。

## Stage 0：定位和边界

目标：明确 AgentSceneBuilder 不是课件模板、Three.js 封装或 GLB/GLTF 模型库，而是面向 Agent 的数字建模内核。

产物：

- README；
- `SKILL.md`；
- `docs/product-positioning-v3.md`；
- `docs/architecture.md`；
- `docs/ai-integration.md`。

## Stage 1：Core / CompositionSpec

目标：让 Agent 可以用结构化数据表达模型，而不是重复手写底层三维计算。

最小能力：

- `core.composition`；
- 基础几何描述；
- 父子变换、pivot、重复系统；
- anchor / attachment；
- bounds、query、metrics；
- path 和 spatial proposal。

## Stage 2：开放数字模型库

目标：沉淀可被 Agent 复用、可被人查看和编辑的数字模型条目。

最小能力：

- registry manifest；
- 生成式 `agent` 上下文；
- 完整物体模型；
- 空间方法条目；
- 模型库网站预览、复制、带入 Editor。

## Stage 3：Skill + CLI Packaging

目标：让 Codex、YuntaoCode 等宿主能稳定理解并调用本项目。

最小能力：

- 精简且准确的 `SKILL.md`；
- `agents/openai.yaml`；
- `@agentscene/cli` 包；
- `agentscene` bin；
- 机器可读 JSON 输出；
- 非 0 失败退出码；
- 兼容旧入口 `scripts/model.mjs`；
- CLI 合约测试。

## Stage 4：Web Editor / Library

目标：给人类提供查看、复制、调参和轻编辑入口。

最小能力：

- 静态模型库网站；
- 编辑器导入/导出 CompositionSpec；
- 结构树、属性面板、灯光、基础构件、文本/标签；
- 自动适配视口；
- 与 CLI/Core 使用同一数据协议。

## Stage 5：Renderer / Format Adapters

目标：把 renderer-neutral geometry graph 转换为可视化或外部格式。

当前优先级：

- Three.js 作为 Web 端显示适配器；
- Canvas 作为轻量回退；
- CAD/BIM/文件格式适配只在协议稳定后推进。

## Stage 6：Host Plugin Packaging

目标：在 Skill + CLI 稳定后，为 Codex、YuntaoCode 等宿主提供安装封装。

最小能力：

- 插件 manifest；
- 权限和版本边界；
- 内置 Skill wrapper；
- 调用本地 CLI；
- 新 Agent 首次使用的端到端验证任务。

当前已具备项目根级 `.codex-plugin/plugin.json` 和 `skills/agentscene-builder/SKILL.md`。下一步再决定是否创建 marketplace 安装流。
