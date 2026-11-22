# Core Method Contract

AgentSceneBuilder 的方法层负责把复杂、重复、易错的空间计算变成稳定的结构化结果。方法可以来自通用内核，也可以来自 MEP、施工、检测等领域扩展，但它们必须遵守同一返回契约。

这个契约的目标不是限制方法能力，而是让 Codex、YuntaoCode 和其他 Agent 能判断结果应该如何使用、是否需要审阅、能否直接导入编辑器。

## 四类方法输出

### 1. Facts

Facts 只返回事实，不修改输入，也不替 Agent 做选择。

适合：

- 路径长度、坡度、弯点、切向；
- 包围盒、距离、接触、相交；
- 数量、面积、体积、工程量；
- 检测公式和风险指标。

要求：

- 返回对象必须包含稳定 `kind` 或 `method`；
- 不包含可直接应用的 `changes`；
- 不包含默认选中的候选项。

示例：

```json
{
  "kind": "mep-drain-slope-check",
  "method": "mep.drain-slope-check",
  "ok": true,
  "segments": [],
  "issues": []
}
```

### 2. Candidates

Candidates 返回多个可解释候选，但不替 Agent 选择。

适合：

- 正交路径候选；
- 避障路径候选；
- 多种排列/分布候选；
- 多种连接或接口适配候选。

要求：

- 返回 `candidates` 数组；
- 默认 `selected` 必须为 `null`；
- 如果上层 Agent 或用户选择某个候选，应在外层记录选择来源，而不是让方法静默决定。

示例：

```json
{
  "kind": "path-candidates",
  "candidates": [],
  "selected": null
}
```

### 3. Proposal

Proposal 返回可审阅变更，不直接修改输入。

适合：

- 锚点对齐；
- 多对象分布；
- 局部姿态/枢轴调整；
- 自动修正建议。

要求：

- 返回 `facts` 和 `changes`；
- `applied` 不得为 `true`；
- 调用方必须审阅后再通过 apply 函数应用；
- proposal 必须能解释“改了什么”和“为什么这么建议”。

示例：

```json
{
  "intent": "anchor-alignment",
  "facts": { "translation": [1, 0, 0] },
  "changes": [],
  "applied": false
}
```

### 4. Generated composition

Generated composition 生成可编辑 CompositionSpec。

适合：

- 按路径生成管线和管卡；
- 生成打压测试回路；
- 生成钢筋网、模板、支撑、构件阵列；
- 从参数生成一个完整对象或系统。

要求：

- 返回 `composition.component === "core.composition"`；
- `composition.parameters.nodes` 必须存在；
- 返回结果必须能说明生成方法，可以在顶层 `method` 或 `composition.parameters.metrics.method` 中声明；
- 生成结果仍应保留路径、重复、锚点和语义，不应只输出失去生成意图的展开几何。

示例：

```json
{
  "kind": "mep-route-with-clips",
  "method": "mep.route-with-clips",
  "composition": {
    "id": "route",
    "component": "core.composition",
    "parameters": {
      "nodes": []
    }
  }
}
```

## Contract helper

`@agentscene/core` 提供轻量检查工具：

```js
import { methodResultContract } from "@agentscene/core";

const contract = methodResultContract(result, {
  expectedType: "generated-composition"
});
```

返回：

```json
{
  "kind": "method-result-contract",
  "outputType": "generated-composition",
  "ok": true,
  "reviewRequired": false,
  "mutatesInput": false,
  "issues": []
}
```

`reviewRequired` 的默认含义：

- `facts`：通常不需要审阅，可直接作为事实使用；
- `candidates`：需要 Agent 或用户选择；
- `proposal`：必须审阅后应用；
- `generated-composition`：可直接编译/导入，但仍建议根据领域语义检查。

## Core 与领域方法边界

通用内核负责：

- 几何、路径、重复、变换；
- anchor、attachment、bounds、query；
- facts / candidates / proposal / generated composition 的通用契约；
- 不依赖行业规范的确定性计算。

领域方法负责：

- 把行业对象映射到通用内核能力；
- 保留参数、锚点、语义和可检查事实；
- 暴露可审阅的领域指标，比如排水坡度、打压参数、温控风险、拉拔强度。

领域方法不应：

- 静默替 Agent 做没有唯一答案的专业决策；
- 把一次性课件步骤、UI 流程或渲染效果写进 core；
- 只输出漂亮但不可编辑、不可检查的网格结果。

## 新方法进入内核或领域包的判据

一项方法适合沉淀，需要至少满足多数条件：

- 多个任务会重复使用；
- Agent 临时手写容易出错；
- 输入输出能结构化；
- 结果可以测试；
- 能保留生成意图；
- 不绑定 Three.js、GLB 或某个网页；
- 不替代必要的人类/Agent 决策。

如果一个能力只是一套展示镜头、页面步骤或艺术表现，它应放在应用层，而不是方法内核。
