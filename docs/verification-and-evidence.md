# 验证与证据设计

> 本文记录早期 Scene Document 的证据设计。当前 Agent 通过 [CLI 检查与诊断](../packages/cli/README.md) 获取结构化验证结果。

AgentSceneBuilder 必须把验证作为核心能力，而不是最后补一个截图按钮。

AI 做 3D 场景最容易出现的问题不是完全不会生成，而是生成后不知道是否真的符合目标。

## 证据类型

### 1. 结构证据

从 Scene Document 直接得到。

- object_count
- object_ids
- object_types
- materials
- cameras
- steps
- missing_references
- changed_objects

### 2. 运行证据

从渲染和导出过程得到。

- html_export_path
- screenshot_path
- render_time_ms
- console_errors
- asset_missing_errors
- viewport_size

### 3. 视觉证据

从截图和视觉检查得到。

- screenshot_path
- image_size
- is_blank
- dominant_colors
- visible_object_estimate
- optional_vision_review

### 4. 教学证据

从场景语义和步骤得到。

- has_teaching_steps
- has_labels
- has_camera_for_each_step
- has_highlighted_targets
- has_interactions

## 证据返回示例

```json
{
  "scene_summary": "场景包含 1 个二层建筑组件、4 个外墙保温板、3 个教学标注和 4 个步骤。",
  "changed_objects": ["building_01", "panel_01", "label_01"],
  "screenshot_path": "artifacts/preview-step-02.png",
  "console_errors": [],
  "warnings": [
    "step_04 没有设置 camera，已使用默认相机。"
  ]
}
```

## 验证原则

1. 不用系统替 AI 判断最终任务是否完成。
2. 系统提供事实证据，让 AI 自己决定是否继续修正。
3. 视觉验证优先作为证据，不作为隐藏拦截。
4. 所有导出和截图都应可追溯到一次命令。
5. 证据优先采用 AI 大模型可消费的结构化格式，浏览器可据此提供可视化复核。
