# 核心愿景与边界

## 背景

建筑、机电、施工、设备、教学等专业场景中，经常需要三维表达。

传统工具如 Revit、Blender、SketchUp 能力很强，但它们主要面向人类专业人员。AI Agent 想稳定调用这些工具，会遇到环境复杂、操作链长、反馈不稳定、验证困难等问题。

Web 端 Three.js 很适合课件和交互演示，但如果让 AI 直接写 Three.js 代码，往往会产生不可维护、不可续改、不可验证的大文件。

AgentSceneBuilder 的目标是在专业 3D 工具和直接写代码之间，建立一层 AI 更容易使用的轻量场景搭建方法。

## 核心愿景

让 AI 可以像搭积木一样搭建 3D 教学和工程演示场景，同时保留 Three.js 的网页发布能力。

```text
AI 不直接写复杂 Three.js
AI 操作结构化场景
系统负责渲染、导出、验证和证据回传
AI 根据证据继续调整
```

## 核心价值

1. 降低 AI 构建 3D 场景的难度。
2. 让场景产物可续改，而不是一次性代码。
3. 让每一步修改都有结构证据和视觉证据。
4. 让教学课件、施工演示和工程说明可以快速生成网页交互版本。
5. 让同一能力可以被 YuntaoCode、Codex、CLI、CI 和其他 Agent 工具调用。

## 不是模板库

模板可以存在，但模板不是核心。

核心应是 Scene Document 和 Command API。模板只是由这些基础能力组合出来的起点。

如果只做模板，灵活度会很快到顶。AgentSceneBuilder 要保留扩展空间，让 AI 可以持续添加对象、修改结构、调整步骤、检查结果。

## 不是 3D 引擎

AgentSceneBuilder 不研究底层渲染管线，不直接实现 WebGL / WebGPU 引擎。

Three.js 是第一渲染实现。未来如有需要，可以增加其他渲染适配器，但当前价值重点在 AI 可操作的场景表达和验证。

## 与 YuntaoCode 的关系

AgentSceneBuilder 应作为 YuntaoCode 外部的垂直能力孵化项目。

YuntaoCode 负责 Task Runtime、上下文、能力调度、证据和执行记录。

AgentSceneBuilder 负责 3D 场景搭建能力本身。

两者优先通过 Skill + CLI 对接；HTTP 只服务人类界面或静态预览，Capability Provider 只做宿主侧封装。
