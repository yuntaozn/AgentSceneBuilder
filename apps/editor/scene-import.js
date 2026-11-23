import { checkScene, createDefaultRegistry } from "../../packages/core/src/index.js";
import { anchorReference, isConnectionType } from "../../packages/core/src/scene.js";
import { allocateModelId, canInsertLibraryGroup, insertLibraryGroup } from "./library-insert.js";

export function isSceneDocument(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    !Object.hasOwn(value, "component") && Object.hasOwn(value, "instances");
}

export function checkEditableScene(scene, registry = createDefaultRegistry()) {
  const { issues } = checkScene(scene, registry);
  if (Array.isArray(scene?.instances)) {
    for (const [index, instance] of scene.instances.entries()) {
      if (!instance?.id || !instance.component || canInsertLibraryGroup(instance)) continue;
      const missingPrototype = instance.component !== "core.composition";
      const path = `/instances/${index}/${missingPrototype ? "component" : "parameters"}`;
      if (issues.some(issue => issue.level !== "warning" && issue.path === path)) continue;
      issues.push({
        code: "EDITOR_SCENE_INSTANCE_UNSUPPORTED",
        level: "error",
        path,
        instanceId: instance.id,
        message: missingPrototype ? "请先将此实例转换为可编辑的 core.composition" : "此实例的参数需要单独作为 CompositionSpec 打开",
      });
    }
  }
  if (Array.isArray(scene?.relations)) {
    for (const [index, relation] of scene.relations.entries()) {
      if (relation && typeof relation === "object" && !isConnectionType(relation.type)) issues.push({
        code: "EDITOR_SCENE_RELATION_UNSUPPORTED",
        level: "error",
        path: `/relations/${index}/type`,
        message: "拼装场景导入支持 connects 与 attachment 关系",
      });
    }
  }
  return { ok: !issues.some(issue => issue.level !== "warning"), issues };
}

export function importEditableScene(scene) {
  const { id, title, name, description, metadata } = scene;
  let document = {
    id: typeof id === "string" && id ? id : "imported-scene",
    ...(typeof title === "string" ? { title } : {}),
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof description === "string" ? { description } : {}),
    ...(metadata !== undefined ? { metadata: structuredClone(metadata) } : {}),
    component: "core.composition",
    parameters: { nodes: [], anchors: {} },
  };
  const anchorNamesByInstance = new Map();
  for (const instance of scene.instances) {
    const inserted = insertLibraryGroup(document, instance);
    document = inserted.document;
    anchorNamesByInstance.set(instance.id, inserted.anchorNames);
  }
  const resolve = reference => {
    const { instanceId, anchorId } = anchorReference(reference, "anchor reference");
    const result = anchorNamesByInstance.get(instanceId)?.get(anchorId);
    if (result === undefined) throw new Error(`找不到连接端点 ${reference}`);
    return result;
  };
  const connections = [...(scene.relations ?? []), ...(scene.attachments ?? [])];
  if (connections.length) {
    const local = document.parameters.attachments ?? [];
    const usedIds = new Set(local.map(connection => connection.id));
    document.parameters.attachments = [...local, ...connections.map(relation => {
      const { from, to, id, ...fields } = structuredClone(relation);
      return {
        ...fields,
        from: resolve(from), to: resolve(to),
        ...(id ? { id: allocateModelId(id, usedIds) } : {}),
      };
    })];
  }
  return document;
}
