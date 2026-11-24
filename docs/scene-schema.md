# Scene Document 设计

> 本文记录早期 Scene Document 草案。当前 AI 建模使用 [CompositionSpec](composition-spec.md)。多实例场景及其关系见[架构说明](architecture.md)。

这份草案用结构化数据描述场景，供 AI 和工具读写。

## 最小结构

```json
{
  "version": "0.1",
  "metadata": {
    "title": "外墙保温板施工演示",
    "domain": "construction-teaching",
    "language": "zh-CN"
  },
  "units": "meter",
  "objects": [],
  "materials": [],
  "cameras": [],
  "steps": [],
  "interactions": [],
  "extensions": {}
}
```

## Object

```json
{
  "id": "wall_01",
  "type": "box",
  "name": "外墙基层",
  "position": [0, 1.5, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "size": [6, 3, 0.25],
  "material": "concrete_light",
  "tags": ["building", "wall"],
  "teaching": {
    "label": "外墙基层",
    "description": "用于承载保温层的基层墙体"
  },
  "extensions": {}
}
```

## Component

Component 是更高层的对象组合。

例如一个 two_floor_building 可以展开为楼板、墙体、柱、门窗和屋面等基础对象。

```json
{
  "id": "building_01",
  "type": "component",
  "component": "simple_building",
  "params": {
    "floors": 2,
    "width": 8,
    "depth": 5,
    "floor_height": 3
  },
  "tags": ["building"]
}
```

## Annotation

标注是一等对象，不应只是材质或 DOM 的附属品。

```json
{
  "id": "label_01",
  "type": "label",
  "text": "保温板安装位置",
  "target": "insulation_panel_01",
  "position": [3.5, 2.2, 0.6],
  "style": "teaching_label"
}
```

## Step

Step 描述教学步骤、相机、显隐、强调和动画。

```json
{
  "id": "step_02",
  "title": "粘贴外墙保温板",
  "description": "展示保温板从场外移动到外墙表面的过程",
  "camera": "front_iso",
  "highlight": ["insulation_panel_01"],
  "show": ["wall_01", "insulation_panel_01", "label_01"],
  "animations": [
    {
      "target": "insulation_panel_01",
      "type": "move",
      "from": [0, 1.5, 1.5],
      "to": [0, 1.5, 0.18],
      "duration": 1.2
    }
  ]
}
```

## Extensions

Scene Document 需要保留 extensions 字段。

原因是第一版不可能定义所有教学、建筑、机电、动画和交互需求。扩展字段可以避免早期 schema 过硬。

但核心字段应尽量稳定，避免每个项目都变成完全不同的数据格式。
