# 数字模型库

`registry` 是 AgentSceneBuilder 面向使用者和 Agent 的开源内容源。网站、编辑器和工具读取同一批条目；它不是下载式网格素材目录。

条目分为 `component`、`method` 和 `composition`。其中 `composition` 在网站中称为“完整模型”：它主要表达一个由多个构件组成、具有明确对象边界的完整物体或完整系统，而不是随意摆放的演示场景。每个条目使用独立目录与 `manifest.json`，贡献者可复制同类条目后提交 Pull Request。

当前示例条目必须能够由 Core 数字几何独立生成，不接受把 GLB/GLTF 文件作为模型本体。未来即使加入外部表现资源，也只能作为可选适配层，不能替代参数、结构和语义定义。

完整模型只表达对象本身：车辆不附带运输货物，吊机不附带被吊构件，仪器不附带施工环境。锚点连接、阵列、路径等可复用逻辑归入 `method`；货物、作业对象和环境由使用者在编辑器中另行组合，避免课件场景边界污染数字模型边界。

## 面向 Agent 的条目说明

条目可以包含可选 `ai` 字段，用来告诉 Agent 这个条目应该如何被使用，而不是只描述它“看起来是什么”。

推荐字段：

- `intent`：该条目真正沉淀的能力或结构意图。
- `useWhen`：适合调用的任务情境。
- `avoidWhen`：不适合使用、需要 Agent 自行决策或需要更高阶能力的情境。
- `editableParts`：建议 Agent 优先修改的构件、参数或路径。
- `qualityChecks`：使用后应验证的结构条件。
- `commonVariants`：常见变体，不要求写成唯一标准。

构建 `registry/registry.json` 时，脚本会为每个条目生成 `agent` 上下文，合并手写 `ai` 与可推导结构信息，包括参数名、锚点、节点数量、几何类型和重复原型。Agent 应优先读取 `agent.intent`、`agent.useWhen` 和 `agent.qualityChecks`，再决定是否直接使用、改造或只把条目作为参考。

运行 `npm run registry:check` 校验清单并生成 `registry/registry.json`。稳定 ID 不应随目录或标题改变；破坏性协议修改需要提升条目主版本。
