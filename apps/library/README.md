# 模型库静态网站

模型库为 AI 大模型提供可复用的数字模型。Agent 通过 `registry search` 获取条目，浏览器用同一注册表提供预览、复制和可视化复核。大模型通过 Skill 和 CLI 的接入方式见[接入说明](../../docs/ai-integration.md)。

该站点从 `registry/registry.json` 构建索引，显示预览或打开详情时才从 `chunks/` 加载模型数据。在仓库根目录执行 `node apps/editor/server.mjs`，然后访问 `http://127.0.0.1:4173/apps/library/`。也可以用其他静态服务器提供仓库根目录。

搜索和筛选覆盖整个模型库，每页显示 24 项。进入可视区域的模型卡片与详情共用编辑器的 GPU 渲染器，浏览器无法启用 WebGL 时使用 Canvas 预览。

构件与组合条目提供交互式模型预览、CompositionSpec 代码查看和复制。点击“在编辑器中打开并继续编辑”会通过同源浏览器存储传递完整文档，编辑器载入后仍可修改结构、路径、材质、动画和参数。

网站必须从仓库根目录提供，确保 `/apps/library/` 与 `/apps/editor/` 同源；不要分别在两个子目录启动不同端口，否则浏览器无法安全传递模型。

浏览器脚本由仓库根目录的 `npm run build:library` 生成。条目源文件保存在 `registry/` 下。
