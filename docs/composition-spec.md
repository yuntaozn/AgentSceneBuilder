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

场景通过 `attachments` 描述构件间连接，端点写作 `实例ID#锚点名`。组合模型也可以在 `parameters.attachments` 中声明内部连接，`from` 和 `to` 直接填写本模型 `parameters.anchors` 中的名称。两种写法均可省略 `type`，显式值可以是 `attachment` 或 `connects`。其他连接形式如承插可在 `contract.contact` 中描述。

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
        "angularTolerance": 0.17453292519943295,
        "outsideDiameter": "equal"
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
- `outsideDiameter` 默认为 `any`。`equal` 要求两端声明正数外径，且差值在 `diameterTolerance` 以内。尺寸和公差均以米为单位，公差默认 `0.000001`。比较的是端口声明的工程尺寸，模型缩放只作用于空间坐标与方向。

内核计算 `effectiveGap = max(0, gap - embed)`。`mep.pipe-run` 和 `mep route-with-clips` 生成的端口带有外径，起点方向沿首段向外，终点方向沿末段向外。对于弯管，两个方向分别取自各自端部。变径件可以在每个锚点声明不同的 `outsideDiameter`。

三项容差都包含边界。50 mm 和 49 mm 的端口在 1 mm 外径容差下可以连接，50 mm 和 48.99 mm 的端口会报告超限。位置和外径按米比较，端口方向使用世界坐标下的单位向量。`angle` 是两个向量间的实际夹角，`deviation` 是相对连接要求的角度偏差，两者均用弧度表示。例如完全相对的端口在 `opposed` 模式下夹角为 π、偏差为 0。

在 `scene build` 的 JSON 中，读取 `scene.ok` 判断场景是否满足所有必需连接。每条关系在 `scene.relations` 中返回结果。选择外径检查时，`outsideDiameterCheck` 包含两端外径 `from`、`to`、绝对差 `difference`、单位和 `compatible`。缺少有效尺寸时，以 `null` 表示未知值。`scene.issues` 可同时返回间隙（`SCENE_CONNECTION_GAP`）、方向（`SCENE_CONNECTION_DIRECTION`）、外径不符（`SCENE_CONNECTION_DIAMETER_MISMATCH`）或外径缺失（`SCENE_CONNECTION_DIAMETER_UNAVAILABLE`）的问题。

```powershell
npm run agentscene -- scene check examples/digital-modeling/mep/pipe-reducer-connection.json
npm run agentscene -- composition check registry/methods/anchor-attachment/manifest.json
npm run agentscene -- scene build examples/digital-modeling/mep/pipe-reducer-connection.json
```

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

## 管线中心线与管卡

`mep route-with-clips` 在生成的 `parameters` 中写入管线绑定。例如：

```json
{ "routeBindings": [{ "node": "cold", "clip": "cold-clip", "clipOffset": [0, 0.08, 0] }] }
```

编辑 `cold.geometry.points` 和 `radius` 后，检查器与编译器用当前几何更新该节点的 `route-start`、`route-end` 锚点，包括端点位置、向外切线和外径。每条绑定的局部中心线长度按米计入 `metrics.totalPipeLength`。没有管卡的管线只需填写 `node`。

管卡的 `parent` 指向管线。用 `clipOffset` 调整采样路径相对中心线的局部偏移，用管卡的 `repetition.spacing`、`startOffset`、`endOffset` 和 `includeEnd` 控制排布。构建结果的 `instance.parameters` 和编辑器导出的 JSON 都包含更新后的锚点和采样路径。旧版生成文件可根据生成器标记、起点锚点和已有管卡路径恢复原偏移。

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

## 折线路径截面扫掠

`geometry.type = "sweep"` 将二维截面沿开放三维折线扫掠。长度单位为米。

- `points` 给出依序经过的局部坐标点。转弯处采用斜接。相邻点须不同；原路折返或截面过宽导致相邻斜接重叠时，编译器会报告对应线段。
- `profile` 给出简单轮廓的 `[u, v]` 顶点。默认生成开放薄面。`closedProfile: true` 会连接首尾轮廓顶点，并在路径两端封口。闭合轮廓至少三个点，末尾省略重复的起点。用有内外壁的凹多边形可以表示有厚度的 U 形槽。
- `up` 定义首段截面的高度方向，默认取局部 Y，首段竖直时取 Z。显式设置的方向要与首段非平行。宽度正方向为高度方向叉乘前进方向，后续截面随路径转向。节点和父级矩阵作用于完整截面和路径。

在模型库中打开“U 形电缆桥架 · 水平弯头”，可直接改截面宽高或拖动路径点。宽高按截面原点等比例缩放对应轴上的所有顶点；要单独控制壁厚，可在源 JSON 中编辑 `profile`。折弯半径、闭合路径和非相邻线段的全局碰撞检查均不在此几何类型的范围内。

```powershell
npm run agentscene -- component build registry/compositions/cable-tray-elbow/manifest.json
```

## 当前边界

- 四种重复方式已经是一等数据，并支持显式朝向策略。
- 连接可检查端口朝向和圆管外径。其他截面形状、壁厚和连接制式仍需单独核对。
- 0.2 暂不允许重复节点作为其他节点的父级；anchor 已可按索引、网格索引或路径距离绑定重复实例。
- `lofted-surface` 的截面轴随层级矩阵变换。圆形和椭圆形截面按各坐标轴上的投影计算包围盒，因此旋转和非均匀缩放后的截面仍在盒内。
- `sphere` 的包围盒由变换后的球面决定。`torus` 的中心圆位于局部 XZ 平面，包围盒同时计入中心圆与管壁半径在各轴上的投影。两者的范围均与渲染分段数无关。`sweep` 使用各截面顶点经过节点层级和实例变换后的坐标。
- `cylinder-between`、`tapered-cylinder-between` 和 `tube-along` 的半径由几何参数给出。修改节点级半径时，直接编辑对应参数。
- 圆柱、圆锥、两点间杆件和折线管段的包围盒使用端面在各坐标轴上的投影。变径段的起点、终点分别使用各自的半径。实例旋转或非均匀缩放时，端面随实例一起变换。折线中的连续重复点保留在几何数据中，有长度的管段决定其范围。所有点都重合的 `tube-along` 沿用局部 XZ 平面上的零高度圆盘。
