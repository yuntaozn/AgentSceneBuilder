# 历史课件对 Editor 的参考价值

参考范围：

- `教学课件/模型编辑器`
- `独立基础施工交互动画课件`
- `水电工艺教学课件`

## 应当吸收

- 三栏工作区：结构、主视图、属性分别保持稳定位置。
- 主视图优先：模型始终占据最大可用区域。
- 双向选择：树选择与视图选择指向同一对象。
- 高频视图操作常驻：适应窗口、网格、透视、重置视角。
- 对象管理闭环：显示、隐藏、隔离、恢复全部。
- 编辑反馈：选中高亮、操作状态、错误信息和可撤销修改。
- 渐进属性：未选中时显示模型摘要，选中后显示对象属性。
- 文件入口：导入、拖放、导出和最近状态应当容易发现。

## 不应照搬

- 以 GLB mesh 层级作为唯一模型结构。
- 颜色、显隐和删除成为主要建模能力。
- 固定施工步骤、答题、时间线和自动播放进入通用 Editor。
- 把相机裁剪面等渲染器参数放在核心属性区。
- 直接修改展开实例而丢失参数化原型和重复规则。

## AgentSceneBuilder 的对应方式

```text
历史 GLB 编辑器                 AgentSceneBuilder Editor
mesh tree                    Composition prototype + occurrence
mesh transform               local transform + parent + pivot
mesh visibility              view-only visibility state
export GLB                   export CompositionSpec / adapter output
direct mesh deletion         changeset against model source
Three.js scene truth         CompositionSpec source truth
```

当前第一轮已吸收工作区、选择、显隐、隔离、聚焦、网格、透视、属性修改、撤销、重置和状态反馈。后续应继续增加原型/实例分层树、参数表单、变换操纵器、锚点可视化和 changeset 审阅。
