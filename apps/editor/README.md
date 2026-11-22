# AgentSceneBuilder Editor

面向人的 CompositionSpec 查看与轻量编辑界面。

Editor 是自包含的纯浏览器应用，没有 Node.js 运行时依赖，也不要求特定 Web 服务器。发布版 `app.bundle.js` 已包含浏览器所需的 Core，因此可以直接把 `apps/editor` 作为静态站点根目录。

可任选一种本地服务器：

```powershell
# 在 apps/editor 目录中任选一种服务器
node apps/editor/server.mjs

# 或
python -m http.server 4173

# 或
live-server

# 或 Nginx、IIS、Caddy、VS Code Live Server 等
```

然后访问对应地址。附带启动器默认使用 `http://127.0.0.1:4173/`。

直接双击 `index.html` 仍不推荐，因为不同浏览器对本地 ES module 有安全限制。

修改 Editor 或 Core 源码后，开发者需执行 `npm run build` 重新生成 `app.bundle.js`；普通使用者不需要构建环境。

## 当前功能

- 展开节点结构树和语义搜索；
- Canvas 等轴测、顶视和前视预览；
- 拖动旋转、滚轮缩放和视图点选；
- 查看几何、层级、pivot、重复引用和空间元数据；
- 构件显隐、原型隔离、透视显示和辅助网格；
- 适应模型范围、视图选择和状态反馈；
- 编辑原型语义、材质标识和局部位置；
- 属性修改、撤销与重做；
- 新建模型、创建盒体、复制和引用安全删除；
- 撤销、重做以及 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl/Cmd+S；
- 编辑 ID、旋转、缩放、盒体尺寸和管状几何半径；
- anchor 在模型视图中可视化；
- 查看和编辑 CompositionSpec JSON；
- 浏览器内重新构建与诊断；
- 导入和导出 JSON。

Editor 不是另一套建模数据。Agent、CLI 和 Editor 共同使用 CompositionSpec 与 Core 构建结果。

完整产品设计见 [`docs/editor-product-design.md`](../../docs/editor-product-design.md)。

## 与历史课件编辑器的关系

当前界面参考了历史项目中已经验证过的三栏工作区、构件树、视图控制、显隐/隔离、聚焦、属性编辑、撤销和状态反馈方式。但编辑对象从 GLB mesh 改为 CompositionSpec 原型和展开实例，因此人的修改仍然保留参数、语义和生成规则。
