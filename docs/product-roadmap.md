# 产品路线

路线图围绕 AI 大模型通过 Agent 检索、组合和验证数字模型的工作流展开。当前基线由数字建模内核、模型库、Skill 和 CLI 构成，静态 Web 用于预览与复核。

## Stage 0：定位和边界

目标是建立面向 AI 大模型的数字建模基础设施，明确宿主 Agent、模型协议和各显示适配器的职责。

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

目标是沉淀 Agent 可独立检索、计算和组合的参数化构件与单体模型，再用场景案例检验复用价值。

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

目标是为 Agent 产出的模型提供可视化复核和调参。编辑后的模型可继续由 CLI 检查和构建。

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

## 用课件场景验证模型复用

1. **机电综合管线。** 先用一个梁下局部开间拼出风管、桥架和管线支架。补矩形风管直段、弯头与阀门操作包络，让 CLI 报告碰撞、净距和调整前后的结果。距离阈值由示例输入给出。
2. **装配式墙板。** 在已有墙板和吊机上补可参数化斜撑、吊索与灌浆套筒。用吊点、支撑点和安装面锚点验证定位，给安装缝和注浆孔保留可引用的几何位置。
3. **结构测点。** 用现有梁、柱、板搭两层框架，再补应变片、位移计和安装支架。测点记录统一使用构件 ID、安装面锚点和测轴方向，供检测与温控课件复用。
4. **工序观察。** 先在独立基础或地坪分层上验证可重放的显隐状态与剖面定位。课件可以用稳定的模型 ID 引用这些状态，再配置讲解、问答和验收记录。
