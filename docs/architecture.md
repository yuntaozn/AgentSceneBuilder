# 架构

AI 大模型通过宿主 Agent 调用 Skill 和 CLI。宿主提供任务与上下文，Core 根据结构化输入计算模型并返回结果，供 Agent 检查和修正。

## 总体结构

```text
Codex / YuntaoCode / 其他 Agent
                │
           Skill / CLI
                │
AgentSceneBuilder Core
      ├─ Composition compiler
      ├─ Geometry descriptors
      ├─ Spatial methods
      ├─ Path methods
      ├─ Method result contract
      ├─ Anchor / Attachment
      ├─ Metrics / Query
      └─ Changeset proposals
                │
       Geometry / Scene Graph
                │
    Renderer and Format Adapters
```

## 事实来源

源数据由三部分组成：

1. Component definition：可复用参数化构件能力。
2. CompositionSpec：当前模型的声明式组成和生成规则。
3. Scene document：多个构件实例、世界变换和跨构件关系。

展开后的 Three.js 对象、GLB、截图或网页都不是源数据。它们可以丢弃并由源数据重新生成。

## Core

Core 负责确定性、可测试且跨宿主复用的计算：

- 基础几何描述及包围盒；
- 参数化构件注册和构建；
- 构件组合与稳定 ID；
- 线性、网格、径向、沿路径重复；
- 路径分析和候选生成；
- anchor 坐标变换；
- attachment 的空间兼容检查；
- 距离、接触、相交、数量和工程量；
- 不自动应用的空间 changeset proposal。

Core 不负责 UI、课程步骤、材质拟真、具体渲染器或某个行业的最终判断。

领域方法（例如 MEP、施工、检测）可以由 core 包导出，但概念上位于通用内核之上。它们应复用通用几何、路径、重复、锚点和方法返回契约，而不是把行业脚本直接写成不可复用流程。

## Component 与 Composition

基础通用构件应当少而稳定。行业构件优先表达为基础能力的参数化组合；只有重复出现、具有明确约束和计算价值的组合，才提升为注册构件。

`core.composition` 是 Agent 的低成本入口。Agent 可以提交纯 JSON，在不新增代码的情况下获得稳定节点、包围盒、锚点、重复系统和查询结果。

## Spatial methods

空间方法按其返回值分为四类：

- 事实：距离、边界、路径长度、坡度、切向、连接兼容性。
- 候选：正交路径等多个可解释方案，保持 `selected: null`。
- Proposal：对齐、分布等可审查变更，不直接修改输入。
- Generated composition：按参数生成可编辑 CompositionSpec，并保留路径、重复、锚点和语义。

领域规则由 Agent 或扩展能力决定；内核不应把“可计算”误写成“唯一正确方案”。

方法返回值遵循 [Core Method Contract](core-method-contract.md)。Agent 可以据此判断结果是事实、候选、proposal，还是可导入编辑器的生成模型。

## Adapters

- Skill：告诉宿主 Agent 何时及如何使用内核。
- CLI：本地、确定性、便于任何 Agent 调用。
- Plugin：只做宿主侧安装、发现和权限边界，不承载核心逻辑。
- Renderer/Exporter：把几何图转换为 Three.js、网页、CAD、BIM 或其他格式。

CLI 封装重复计算，并将结构化结果交回 Agent。经 Skill、宿主插件或包直接接入时，使用同一套模型协议。

## Web 渲染分层

编辑器实行“一份数字模型，多个显示适配器”：

- `@agentscene/core` 只输出 renderer-neutral geometry graph，不依赖 Three.js。
- `@agentscene/adapter-three` 把 geometry graph 转换为 GPU 场景，重复构件使用 `InstancedMesh` 合并绘制。
- Three.js 代码作为独立 chunk 按需加载，不进入编辑器首屏主包。
- Canvas 渲染器保留为轻量回退和现有操纵器的交互层。
- 各显示适配器共享 CompositionSpec 中的参数、锚点、父子关系和动画数据。

Three.js 在复核界面中渲染 Core 构建的几何图。Agent 继续以 CompositionSpec 作为可编辑源稿。
