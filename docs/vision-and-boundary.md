# 核心愿景与边界

## 背景

建筑、机电、施工、设备和教学任务需要能反复使用和验证的三维结构。AI 大模型通过 Agent 执行这些任务时，需要稳定的模型语义、可调用的空间计算，以及能定位原始字段的诊断。

## 核心愿景

为 AI 大模型提供结构化数字建模基础设施。Agent 可查找独立模型、以参数和连接定义场景，并用可计算的结果验证模型是否满足任务。

```text
宿主 Agent 理解目标与约束
Agent 经 Skill 和 CLI 检索、组合、检查模型
Core 返回结构化几何、空间事实和诊断
Agent 根据结果修正 CompositionSpec
需要时通过网页预览与复核
```

## 核心价值

1. Agent 可以复用构件、单体模型和空间方法。
2. 模型保持可编辑的结构、语义和生成规则。
3. CLI 提供机器可读的检查结果，浏览器可辅助复核。
4. 教学、施工和工程案例验证模型在不同任务中的组合方式。
5. YuntaoCode、Codex、CLI 和 CI 可调用同一套建模能力。

## 模型与场景案例

CompositionSpec 表达模型事实和生成规则，注册表提供可复用的构件、方法与完整模型。场景案例在这些资源之上组合对象和环境，便于 Agent 验证接口、测量和模型复用。现行协议与接入方式见 [CompositionSpec](composition-spec.md) 和 [AI 接入设计](ai-integration.md)。

## 显示适配

Core 构建与渲染器无关的几何图。Three.js 和 Canvas 为网页提供预览和可视化复核。

## 与 YuntaoCode 的关系

AgentSceneBuilder 应作为 YuntaoCode 外部的垂直能力孵化项目。

YuntaoCode 负责 Task Runtime、上下文、能力调度、证据和执行记录。

AgentSceneBuilder 负责 3D 场景搭建能力本身。

两个项目通过 Skill 和 CLI 对接。HTTP 提供静态浏览器界面，Capability Provider 负责宿主侧封装。
