# Command API 设计

> 状态：历史 Scene Document 草案。当前 Agent 接入以 `SKILL.md` + `packages/cli` + CompositionSpec 为准；本文只保留为早期命令式接口思路，不作为近期实现承诺。

Command API 曾是 AI 调用 AgentSceneBuilder 的早期设想入口。

AI 应优先提交结构化命令，而不是直接重写整份 Three.js 代码。

## 命令格式

```json
{
  "command": "add_object",
  "scene": "scene.json",
  "arguments": {},
  "request_evidence": true
}
```

## 返回格式

```json
{
  "ok": true,
  "command": "add_object",
  "changed": ["wall_01"],
  "evidence": {
    "scene_summary": "场景包含 1 个墙体对象。",
    "object_count": 1,
    "warnings": []
  }
}
```

## 核心命令

### create_scene

创建新场景。

参数：

- title
- domain
- units
- language

### add_object

添加基础对象。

参数：

- id
- type
- name
- position
- rotation
- scale
- size
- material
- tags
- teaching

### add_component

添加组件对象。

参数：

- component
- params
- position
- tags

### update_object

更新对象属性。

参数：

- id
- patch

### remove_object

删除对象。

参数：

- id
- cascade

### add_label

添加教学标注。

参数：

- text
- target
- position
- style

### add_arrow

添加箭头或流程指示。

参数：

- from
- to
- label
- style

### add_step

添加教学步骤。

参数：

- title
- description
- camera
- show
- hide
- highlight
- animations

### set_camera

设置或更新相机。

参数：

- id
- type
- position
- target
- fov

### validate_scene

验证场景结构。

检查内容：

- id 是否唯一
- target 是否存在
- material 是否存在
- step 引用是否有效
- 对象尺寸是否缺失
- 是否存在空场景

### render_preview

渲染预览并返回截图证据。

参数：

- camera
- step
- width
- height

### export_html

导出可运行网页。

参数：

- output_dir
- include_assets
- default_step

## 设计边界

Command API 只验证协议和场景一致性，不替 AI 决定任务语义。

例如用户要做“外墙保温板施工流程”，系统不应该硬编码判断它必须走哪个模板。AI 可以选择从空场景搭建，也可以使用建筑组件，再逐步验证。
