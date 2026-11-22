# CompositionSpec 0.3

`CompositionSpec` 是面向 Agent 的声明式数字建模输入。它描述“由什么组成、如何重复、在哪里连接”，而不是指定 Three.js、GLTF 或其他输出格式。

## 最小示例

```json
{
  "id": "frame-01",
  "component": "core.composition",
  "parameters": {
    "nodes": [
      {
        "id": "stud",
        "semanticType": "framing.stud",
        "geometry": { "type": "box", "size": [0.1, 3, 0.1] },
        "repetition": {
          "type": "linear",
          "count": 4,
          "start": [0, 1.5, 0],
          "step": [0.6, 0, 0]
        }
      }
    ],
    "anchors": {
      "mount": {
        "position": [0, 0, 0],
        "kind": "mount",
        "direction": [0, -1, 0]
      }
    }
  }
}
```

当前支持 `box`、`sphere`、`cylinder`、`cone`、`torus`、`cylinder-between`、`tapered-cylinder-between`、`lofted-surface` 和 `tube-along` 等与渲染器无关的几何描述。球体使用 `radius`，圆柱和圆锥使用 `radius`、`height`，圆环使用 `majorRadius`、`tubeRadius`。`cylinder-between` 使用 `start`、`end` 和 `radius` 表达两点之间的等粗杆件；`tapered-cylinder-between` 使用 `start`、`end`、`startRadius` 和 `endRadius` 表达根部到末端半径变化的杆件，适合锥化支杆、吊索、工具握柄、喷嘴、支腿等精细化建模。`lofted-surface` 使用多层截面生成低多边形外壳，每层截面至少包含 `center`、`radiusX` 和 `radiusZ`，编译后也可带 `axisX`、`axisZ` 表达被层级矩阵变换后的截面方向；它适合设备外罩、管件变径、风管过渡、车辆/机械罩壳等需要轮廓过渡的构件。编译结果会展开为稳定节点 ID，但同时保留 repetition 原型和生成参数，避免丢失建模意图。

## 空间重复

- `linear`：使用 `count`、`start` 和三维 `step`。
- `grid`：使用 `[x, y, z]` 数量及 `stepX`、`stepY`、`stepZ` 三个方向向量。方向向量不必与世界坐标轴重合。
- `radial`：使用 `center`、`axis`、`radius`、`count`、起始角和扫掠角。
- `path`：使用折线路径、间距和首尾偏移；每个结果携带路径距离、所在分段和切向量。

内核展开位置但不自动决定实例朝向，因为“面向切线”“面向圆心”或“保持世界朝向”取决于构件语义。后续朝向协议会显式表达这种选择。

现在可以在节点上显式声明朝向策略：

```json
{
  "orientation": {
    "mode": "tangent",
    "localAxis": [0, 1, 0]
  }
}
```

支持 `fixed`、`tangent`、`radial-outward` 和 `radial-inward`。`localAxis` 表示构件自身哪根轴需要对准目标方向。

## 局部层级与 pivot

节点可以通过 `parent` 建立局部变换层级。无 `geometry` 的节点可作为纯变换组：

```json
{
  "nodes": [
    {
      "id": "hinge",
      "transform": { "rotation": [0, 0, 1.5707963267948966] }
    },
    {
      "id": "arm",
      "parent": "hinge",
      "pivot": [1, 0, 0],
      "transform": {
        "position": [2, 0, 0],
        "rotation": [0, 0, 0.5]
      },
      "geometry": { "type": "box", "size": [2, 0.2, 0.2] }
    }
  ]
}
```

节点变换按父级到子级组合。pivot 位于节点局部坐标中，旋转和缩放围绕 pivot 发生。循环父子关系会被拒绝。

anchor 可以使用 `node` 绑定到节点，其位置和方向会继承完整节点变换。绑定重复节点时使用稳定 occurrence selector：

```json
{
  "anchors": {
    "third-stud-top": {
      "node": "stud",
      "occurrence": { "index": 2 },
      "position": [0, 1.5, 0]
    },
    "grid-cell": {
      "node": "tile",
      "occurrence": { "gridIndex": [3, 0, 2] },
      "position": [0, 0, 0]
    },
    "hanger-at-6m": {
      "node": "hanger",
      "occurrence": { "pathDistance": 6, "tolerance": 0.001 },
      "position": [0, 0, 0]
    }
  }
}
```

构建结果返回如 `stud[2]` 的 `occurrenceRef`，避免依赖渲染器对象顺序。

## Attachment contract

场景可以使用 `attachments` 描述构件间连接：

```json
{
  "attachments": [
    {
      "id": "joint-01",
      "from": "pipe-a#end",
      "to": "pipe-b#start",
      "contract": {
        "contact": "socket",
        "gapTolerance": 0.002,
        "embed": 0.01,
        "required": true,
        "direction": "opposed",
        "angularTolerance": 0.17453292519943295
      }
    }
  ]
}
```

- `contact` 保存连接语义，当前不限定枚举，便于后续增加面接触、轴接触和支承关系。
- `gapTolerance` 是允许的剩余间隙。
- `embed` 是连接允许吸收的嵌入或搭接距离。
- `required` 决定失败时产生错误还是警告。
- `direction` 可为 `any`、`aligned` 或 `opposed`。
- `angularTolerance` 使用弧度，默认 10°。

内核计算 `effectiveGap = max(0, gap - embed)`。它只返回连接事实，不会擅自移动构件。

## 外观、动画和文本标注

外观属于数字模型的可选表达层，不替代材质语义：

```json
{
  "material": "steel.galvanized",
  "appearance": { "color": "#8fb5c2", "opacity": 0.85 }
}
```

简单动画保留目标、属性、起止值和时长：

旋转动画可使用 `space: "local"` 表示各实例自转，或使用 `space: "group"` 表示所有展开实例绕自动计算的共同中心旋转；也可以通过 `pivot: [x, y, z]` 显式指定中心点。重复组件未声明 `space` 时，编辑器默认使用 `group`。

```json
{
  "animations": [
    {
      "id": "move-panel",
      "target": "panel",
      "property": "position",
      "from": [0, 0, 0],
      "to": [1, 0, 0],
      "duration": 1.5,
      "loop": true
    }
  ]
}
```

`annotations` 保存与渲染器无关的画布文字事实，包括稳定 ID、文本、三维位置和颜色。更复杂的字体与排版属于适配器。

## 灯光组件

可操作灯光与几何使用同一个 `nodes` 数组。灯光节点使用 `kind: "light"` 和 `light` 描述，同样支持 `transform`、`parent`、稳定 ID 和动画目标。

```json
{
  "id": "key-light",
  "kind": "light",
  "semanticType": "scene.light.point",
  "light": { "type": "point", "color": "#fff1d6", "intensity": 90, "distance": 18 },
  "transform": { "position": [3.8, 5.2, 4.2], "rotation": [0, 0, 0], "scale": [1, 1, 1] }
}
```

`point`、`directional` 和 `spot` 是当前支持的类型。方向光和聚光灯沿节点局部 `-Z` 轴照射。`parameters.lighting` 只保留场景级环境预设和总开关，不再存放可操作灯光列表。灯光节点不参与模型几何包围尺寸计算。

## 当前边界

- 四种重复方式已经是一等数据，并支持显式朝向策略。
- anchor 的 `kind` 和 `direction` 已保留，连接可验证方向；口径和截面兼容性尚未实现。
- 0.2 暂不允许重复节点作为其他节点的父级；anchor 已可按索引、网格索引或路径距离绑定重复实例。
- `cylinder-between`、`tapered-cylinder-between`、`lofted-surface` 和 `tube-along` 的节点级非均匀缩放尚不改变半径/截面尺寸；需要变径或变截面时应直接修改几何参数。
