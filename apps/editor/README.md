# AgentSceneBuilder Editor

面向人的 CompositionSpec 查看与轻量编辑界面。

Editor 是自包含的纯浏览器应用，没有 Node.js 运行时依赖，也不要求特定 Web 服务器。发布版 `app.bundle.js` 已包含浏览器所需的 Core，因此可以直接把 `apps/editor` 作为静态站点根目录。

可任选一种本地服务器：

```powershell
# 在仓库根目录启动附带的服务器
node apps/editor/server.mjs

# 或在 apps/editor 目录中使用静态服务器
python -m http.server 4173

# 或
live-server

# 或 Nginx、IIS、Caddy、VS Code Live Server 等
```

附带启动器默认在 `http://127.0.0.1:4173/` 打开编辑器。同一服务器上的 `/apps/library/` 可打开模型库并把模型带入编辑器。

直接双击 `index.html` 仍不推荐，因为不同浏览器对本地 ES module 有安全限制。

修改 Editor 或 Core 源码后，在仓库根目录执行 `npm run build:editor` 重新生成 `app.bundle.js` 及 `chunks/` 下的渲染与模型数据分块。在 `apps/editor` 中执行 `npm run build` 会调用同一构建命令。静态部署需保留 `chunks/` 目录。

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
- 模型库中支持组合的条目可选「加入当前场景」，导入的根组可以整体定位，也能展开编辑子节点。每次添加保留该组的局部锚点、内部连接、管线绑定和动画目标，并可作为一次操作撤销。带场景级标注或固定动画枢轴的条目使用「打开完整模型」。已有 JSON 草稿时，可先重新构建再加入模型组。
- 查看和编辑 CompositionSpec JSON；
- 在 JSON 页点击「检查草稿」，可查看当前的语法错误和模型问题，预览保留上次构建的结果。点击行列或字段路径可选中原文。重复声明、歧义引用和父子循环可跳到关联字段，拼错的引用会显示候选值。草稿更改后可重新检查以更新定位。
- 同一对象中重复的 JSON 键会阻止构建。诊断提供重复键及首次声明的位置，也会列出独立的模型问题。处理完诊断后点击「重新构建」可更新预览。
- 「应用标点修复」可一次补齐能确定的逗号和冒号，并移除尾逗号。编辑器会立即检查修复后的草稿，点击「重新构建」可更新预览。草稿仍是修复后的内容时，可以点击「还原本次修复」。
- 「导入 JSON」支持 CompositionSpec、模型清单以及由可编辑 `core.composition` 实例组成的 SceneSpec。拼装场景中的每个实例进入独立根组，跨组锚点连接、尺寸参数和动画随之带入。导出保存为可再次打开的 CompositionSpec。

Editor 不是另一套建模数据。Agent、CLI 和 Editor 共同使用 CompositionSpec 与 Core 构建结果。

完整产品设计见 [`docs/editor-product-design.md`](../../docs/editor-product-design.md)。

## 与历史课件编辑器的关系

当前界面参考了历史项目中已经验证过的三栏工作区、构件树、视图控制、显隐/隔离、聚焦、属性编辑、撤销和状态反馈方式。但编辑对象从 GLB mesh 改为 CompositionSpec 原型和展开实例，因此人的修改仍然保留参数、语义和生成规则。
