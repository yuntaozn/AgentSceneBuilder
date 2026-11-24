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

对于绑定到几何节点的锚点，可用 `onGeometry` 根据当前尺寸或路径计算位置。每个锚点使用 `position` 或 `onGeometry` 中的一项。

```json
{
  "beam-end": { "node": "beam", "onGeometry": { "type": "box", "fraction": [0.5, 0, 0] }, "direction": [1, 0, 0] },
  "tray-start": { "node": "tray", "onGeometry": { "type": "sweep-end", "end": "start" } }
}
```

- `box` 的三个 `fraction` 分量对应盒体局部 X、Y、Z 轴，以中心为原点。`-0.5` 和 `0.5` 指向相对的两侧面，`0` 指向中面。修改 `geometry.size` 后，锚点按新尺寸重算。
- `sweep-end` 使用 `sweep` 路径的 `start` 或 `end`。默认方向沿端部切线向外，也可以同普通锚点一样设置局部 `direction`。路径修改后，锚点跟随端点。
- `feature` 使用 `name` 选择楼梯、坡道、楼板、墙体或栏杆的特征点。特征点随模型尺寸更新。
- 这些锚点均继承所属节点和实例的变换。构建结果提供实际坐标，源稿保留 `onGeometry`，便于继续编辑。

## 可编辑的设备姿态

`parameters.poseControls` 可把一个标量映射到一个或多个节点的局部平移、旋转分量。每项声明唯一 `id`、当前 `value`、闭区间 `min` / `max` 和 `targets`，并可声明 `label` 与 `unit`。目标由 `node`、`property`（`position` 或 `rotation`）和 `axis`（`x`、`y` 或 `z`）指定。

```json
{
  "id": "fork-spacing",
  "label": "货叉中心距",
  "unit": "m",
  "value": 0.46,
  "min": 0.3,
  "max": 0.75,
  "targets": [
    { "node": "left-fork", "property": "position", "axis": "z", "factor": -0.5 },
    { "node": "right-fork", "property": "position", "axis": "z", "factor": 0.5 }
  ]
}
```

构建时，Core 将 `value × factor` 加到目标的原始局部变换，默认 `factor` 为 1。平移使用米，旋转使用弧度。以度显示的控制项可以使用 `Math.PI / 180` 对应的数值作为因子。每个节点的同一变换轴可由一个控制项驱动。变换所影响的子节点、锚点和连接会一起重算，导出的文档保留原始局部变换与控制值。

编辑器的「属性」栏提供设备与工具姿态表单。Agent 可直接修改这些值，再运行 `composition check`、`component build`，或在场景实例内改值并运行 `scene check`。将模型作为组加入场景时，控制项及其目标节点会按组分配 ID。

## 单次教学加载与测点记录

`parameters.monitoring` 可在一个完整模型中声明一次加载工况。它包含 `id`、`label`、`stepSeconds`（至少 0.05 秒）、从 0 起始的 `loadRatios`（3 到 121 项）、`motions` 和最多 64 个 `points`。每条运动按节点 ID 指定满载时增量，允许填写局部 `position`、`rotation`，以及对应扫掠路径各点的 `pathOffsets`。每帧将这些增量乘以该帧的荷载比。`displayScale` 仅放大编辑器中的变形。

每个测点使用唯一 `id`，带 `label`、`kind`、`sensor` 和 `target`。后两个字段是带测轴的模型锚点名。零荷载时校验安装位置、测轴方向。可用 `member` 引用实际被测构件，并用 `mountTolerance` 设定安装位置容差（默认 0.002 m）。现场安装与报警阈值由使用者按案例定义。

| 测量类型 | 读数来源 |
|---|---|
| `strain` | 教学满载值 `fullLoadValue` 乘荷载比，单位 με |
| `displacement` | 目标相对独立固定 `reference` 锚点的位移变化，沿测轴投影，单位 mm |
| `acceleration` | 相邻三个样本的目标位移二阶差分，沿测轴投影，单位 m/s²。首末样本无两侧数据，返回 `null` |
| `tilt` | `orientation` 锚点的方向围绕测轴相对初始方向的有符号角，单位 ° |

`limit` 与 `holdSeconds` 定义持续超限。绝对读数连续严格大于阈值达到指定时间时生成报警事件，回到阈值内或缺读时结束该段超限。采样值使用原始变形。模型仍可在编辑器中保存为 CompositionSpec。

使用 `composition monitor <composition.json|manifest.json> [pointId]` 获取机器可读的工况帧、测点位置与方向、分时读数和报警。示例是预设运动与信号的教学算例。

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

组合几何 `hollow-round-pipe` 使用 `points`、`outsideDiameter` 和 `thickness`。断面生成连续管壁和贯通内孔。`onGeometry.type: "feature"` 的 `start` 和 `end` 提供沿各自端部向外的方向以及随几何更新的工程外径。编排变径、三通或承插件时，各接口可声明各自匹配的管材外径。

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

## 楼梯、隔墙与栏杆

`straight-stair` 使用 `stepCount`、`riserHeight`、`treadDepth` 和 `width`。楼梯沿局部 +Z 上升，以起步处为原点，横向以 X=0 居中。踏步数为 1 至 128 的整数，尺寸单位为米。`lower-landing` 和 `upper-landing` 分别定位上下接续点。

`partition-wall`、`door-opening-wall` 和 `window-opening-wall` 均使用 `wallWidth`、`wallHeight`、`thickness`。墙宽沿 X，墙厚沿 Z，底边在 Y=0。`wall-left`、`wall-right` 可用于墙段拼接。

门洞墙与窗洞墙还使用 `openingWidth`、`openingHeight`、`openingOffset`。偏移相对墙中心沿 X 计，洞口两侧和上方须保留墙体。窗洞墙额外使用正数 `sillHeight` 指定窗洞底边的 Y 坐标。`opening-base`、`opening-top` 用于定位洞口底部和顶部中心，`opening-left`、`opening-right` 用于定位洞口底边两侧。

`straight-railing` 使用 `railWidth`、`railHeight`、`thickness`、`memberWidth` 和 `bayCount`。沿 X 分布的开格为 1 至 32 个，宽度相等。`start`、`end` 位于栏杆段底边两端。栏杆位置和尺寸使用米。

`sloped-railing` 增加沿 X 的有符号高差 `rise`。开格随坡形变，栏杆高度保持竖向。底端和高端的 `start`、`end` 以及顶部的 `handrail-start`、`handrail-end` 提供接续位置。

这些几何会构建为可预览的闭合扫掠，源稿保留命名尺寸。编辑器属性面板可直接修改。

## 坡道、开洞楼板与转角墙

- `straight-ramp` 使用 `run`、`rise`、`rampWidth` 和 `deckThickness`。坡道沿 +Z 抬升，厚度沿 Y 向计量。`lower-landing` 和 `upper-landing` 位于坡板上表面的两端。
- `floor-opening-slab` 使用 `slabWidth`、`slabDepth`、`thickness`、`openingWidth`、`openingDepth`、`openingOffsetX` 和 `openingOffsetZ`。板面位于 Y=0，厚度向下。`opening-near` 和 `opening-far` 是洞口沿 Z 的两端，洞口四周须保留楼板。
- `l-corner-wall` 使用 `lengthX`、`lengthZ`、`wallHeight` 和 `thickness`。墙从局部原点沿 +X 与 +Z 延伸，`x-end` 和 `z-end` 位于两个墙端的底边中心。

这些尺寸均以米计，属性面板可直接编辑。以已有楼板作为坡道平台时，可在板顶近边设置方向向外的锚点。

## 窗台、阳台板、雨棚与压顶

- `window-sill` 沿局部 +X 展开，沿 +Z 向外挑出。`sillWidth`、`projection`、`thickness` 和 `fall` 控制找坡，`grooveWidth`、`grooveDepth`、`grooveSetback` 控制底面滴水槽。`mount` 位于根部上边中点。窗洞墙的 `opening-exterior-base` 给出同标高的外墙面锚点。
- `balcony-deck` 使用 `deckWidth`、`projection`、`thickness`、`edgeWidth`、`downstand`。板面在 Y=0，向 +Z 外挑，前边缘包含下挂边梁。`railing-left` 与 `railing-right` 可定位栏杆两端。
- `sloped-cover` 用 `coverWidth`、`projection`、`thickness` 与 `fall` 描述单坡外挑板，`mount` 和 `front` 读取根部、外边的上表面位置。
- `wall-coping` 用 `capLength`、`capWidth`、`edgeHeight` 与 `crownRise` 生成跨墙厚的双坡压顶。`mount` 位于底面中点，两端有同标高的拼接点。

## 钢截面、柱脚底板与基础

- `steel-i-section` 和 `steel-channel-section` 使用 `length`、`sectionWidth`、`sectionHeight`、`webThickness`、`flangeThickness`，沿 +X 展开。`start`、`end` 表示轴向两端，`bearing-start`、`bearing-end` 表示对应的底面支承点。旋转节点可用同一截面组成立柱。
- `steel-angle-section`、`steel-rectangular-tube` 使用 `length`、`sectionWidth`、`sectionHeight` 和 `thickness`。`steel-round-tube` 使用 `length`、`outerDiameter`、`thickness`。两种钢管均有通孔。
- `bolted-base-plate` 使用 `plateWidth`、`plateDepth`、`thickness`、`holeDiameter`、`boltPitchX` 和 `boltPitchZ`。底面在 Y=0，`column-seat` 与四个 `bolt-*` 锚点位于顶面。孔须位于底板内且彼此分离。
- `slotted-splice-plate` 使用 `plateLength`、`plateWidth`、`thickness`、`slotLength`、`slotWidth`、`pitchX` 和 `pitchZ`。四个长圆孔沿局部 X 延伸，顶面的 `slot-*` 锚点随孔距移动。
- `strip-footing` 使用 `length`、`footingWidth`、`footingThickness`、`stemWidth`、`stemHeight`，`top-center` 跟随基础墙顶面。`round-pile` 使用 `length` 和 `diameter`，从 `head` 向局部 -Y 延伸至 `toe`。

场地构件使用沿局部 +X 延伸的截面。下列类型支持 `onGeometry.type: "feature"`。

- `bevelled-curb` 使用 `length`、`width`、`height`、`bevel`。车行侧沿 +Z，`paving-edge` 在另一侧顶缘。
- `rebated-drain-channel` 使用 `length`、`clearWidth`、`depth`、`thickness`、`seatWidth`、`seatDepth`。顶面位于 Y=0，`start` 和 `end` 位于沟底，`grate-seat` 位于格栅承托高度。
- `slotted-drain-grate` 使用 `length`、`width`、`thickness`、`frameWidth`、`barWidth` 和整数 `slotCount`。开槽贯通厚度，`grate-bottom` 对齐沟槽的 `grate-seat`。
- `crowned-road-surface` 使用 `length`、`width`、`thickness` 与 `crownHeight`。两边的 Y 坐标为零，两段拼接使用位于路拱上的端点。
- `l-retaining-wall` 使用 `length`、`wallHeight`、`wallThickness`、`capThickness`、`toeDepth`、`heelDepth`、`footingThickness`。踵板伸向本地 +Z，`wall-top` 和 `base-center` 分别定位顶缘和底板。

`pitched-roof-deck`、`standing-seam-roof-panel` 和 `corrugated-roof-panel` 共用 `panelWidth`、`run`、`rise` 与法向 `thickness`。坡脚位于本地原点，屋脊在 `[0,rise,run]`，`surface-center` 和 `underside-center` 分别贴合上下表面。锁边板可设置 `seamHeight`。波形板使用 `ribHeight` 与整数 `corrugationCount`，中心定位随所处波峰或波谷移动。双坡 `roof-ridge-cap` 使用 `length`、`legWidth`、`fall`、`thickness`，沿 X 伸展，`crest` 位于盖板下表面交线的中点。

`hollow-masonry-block`、`perforated-clay-brick` 和 `tongue-groove-masonry-block` 沿 X 使用 `length` 排列，宽度沿 Z，高度沿 Y。几何定位提供 `start`、`end`、`bottom`、`top` 与 `outer-face`。空心块可调 `webThickness` 和整数 `coreCount`，圆孔砖可调 `holeDiameter`、`columnCount` 和 `rowCount`，企口块可调 `keyWidth`、`keyDepth` 和 `clearance`。企口块的标称长度量到榫肩，拼装时凸榫伸入后续砌块的凹槽。

轻钢与面板几何支持随尺寸更新的 `feature`。竖向 `lipped-drywall-stud` 使用 `length`、`webDepth`、`flangeWidth`、`lipLength`、`thickness`，提供 `foot`、`head`、`front`、`back`。水平 `u-drywall-track` 按 `length`、`trackWidth`、`sideHeight`、`thickness` 生成 `mount` 与 `stud-seat`。 `hat-furring-channel` 使用 `length`、`channelWidth`、`crownWidth`、`standoff`、`thickness` 并提供 `base` 与 `board-seat`。 `tapered-gypsum-sheet` 的两条长边由 `taperWidth`、`taperDepth` 控制，`mount` 保留在板背面。

## 折线路径截面扫掠

`geometry.type = "sweep"` 将二维截面沿开放三维折线扫掠。长度单位为米。

- `points` 给出依序经过的局部坐标点。转弯处采用斜接。相邻点须不同；原路折返或截面过宽导致相邻斜接重叠时，编译器会报告对应线段。
- `profile` 给出简单轮廓的 `[u, v]` 顶点。默认生成开放薄面。`closedProfile: true` 会连接首尾轮廓顶点，并在路径两端封口。闭合轮廓至少三个点，末尾省略重复的起点。用有内外壁的凹多边形可以表示有厚度的 U 形槽。
- 闭合截面可用 `holes` 声明内部孔轮廓。孔须完全位于外轮廓内，且各孔互不接触或包含。两端的端面只覆盖孔以外的材料区域，孔沿路径贯通。
- `up` 定义首段截面的高度方向，默认取局部 Y，首段竖直时取 Z。显式设置的方向要与首段非平行。宽度正方向为高度方向叉乘前进方向，后续截面随路径转向。节点和父级矩阵作用于完整截面和路径。

在模型库中打开“U 形电缆桥架 · 水平弯头”，可直接改截面宽高或拖动路径点。宽高按截面原点等比例缩放对应轴上的所有顶点；要单独控制壁厚，可在源 JSON 中编辑 `profile`。折弯半径、闭合路径和非相邻线段的全局碰撞检查均不在此几何类型的范围内。

```powershell
npm run agentscene -- component build registry/compositions/cable-tray-elbow/manifest.json
```

`rectangular-duct` 使用 `points`、可选的 `up`、外宽 `sectionWidth`、外高 `sectionHeight` 和壁厚 `thickness`。尺寸单位为米。编译器用同心矩形生成外壁和连续空腔，编辑器可调整三项尺寸和路径控制点。`sweep-end` 锚点会随路径更新。

## 当前边界

- 四种重复方式已经是一等数据，并支持显式朝向策略。
- 连接可检查端口朝向和圆管外径。其他截面形状、壁厚和连接制式仍需单独核对。
- 0.2 暂不允许重复节点作为其他节点的父级；anchor 已可按索引、网格索引或路径距离绑定重复实例。
- `lofted-surface` 的截面轴随层级矩阵变换。圆形和椭圆形截面按各坐标轴上的投影计算包围盒，因此旋转和非均匀缩放后的截面仍在盒内。
- `sphere` 的包围盒由变换后的球面决定。`torus` 的中心圆位于局部 XZ 平面，包围盒同时计入中心圆与管壁半径在各轴上的投影。两者的范围均与渲染分段数无关。`sweep` 使用各截面顶点经过节点层级和实例变换后的坐标。
- `cylinder-between`、`tapered-cylinder-between` 和 `tube-along` 的半径由几何参数给出。修改节点级半径时，直接编辑对应参数。
- 圆柱、圆锥、两点间杆件和折线管段的包围盒使用端面在各坐标轴上的投影。变径段的起点、终点分别使用各自的半径。实例旋转或非均匀缩放时，端面随实例一起变换。折线中的连续重复点保留在几何数据中，有长度的管段决定其范围。所有点都重合的 `tube-along` 沿用局部 XZ 平面上的零高度圆盘。
