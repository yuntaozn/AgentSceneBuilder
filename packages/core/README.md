# @agentscene/core

供 AI 大模型通过 Agent、CLI 或宿主集成调用的参数化数字建模内核。它将声明式输入转换为与渲染器无关的几何、锚点、测量和诊断结果。

当前提供：

- 参数化构件注册、发现和构建；
- 数据型 `core.composition`；
- box、sphere、cylinder、cone、torus、cylinder-between、tapered-cylinder-between、sweep、lofted-surface、tube-along 几何描述；
- 父子局部变换、pivot 和矩阵组合；
- 线性、三维网格、径向和沿路径重复；
- 固定、路径切向、径向朝内和径向朝外策略；
- anchor、attachment、语义查询和工程量；
- 路径、边界、距离、接触、相交和空间 proposal。

## CompositionSpec 0.3

`core.composition` 允许 Agent 直接提交 JSON 数字模型。矩阵是层级和朝向组合后的权威变换表示；`transform.position` 是便于检查的最终原点位置。渲染适配器应优先读取 `matrix`。

当前不允许重复节点作为其他节点的父级。anchor 已可按索引、网格索引或路径距离绑定重复实例，并返回稳定的 `occurrenceRef`。

Core 不依赖 Three.js、不读取 GLB、不启动浏览器，也不包含教学步骤或页面布局。
