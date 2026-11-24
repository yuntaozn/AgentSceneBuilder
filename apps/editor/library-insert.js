const groupFields = new Set(["nodes", "anchors", "routeBindings", "poseControls", "attachments", "animations"]);

export function insertableComponentParameters(item) {
  const document = item.editor?.document;
  const parameters = document?.parameters;
  const node = parameters?.nodes?.[0];
  if (item.kind !== "component" || document?.component !== "core.composition" || document.transform ||
      parameters?.nodes?.length !== 1 || !node || node.parent ||
      Object.keys(parameters).some(key => key !== "nodes" && key !== "anchors")) return;
  if (Object.values(parameters.anchors ?? {}).every(anchor => anchor?.node === node.id)) return parameters;
}

export function canInsertLibraryGroup(model) {
  const parameters = model?.parameters;
  const animations = parameters?.animations ?? [];
  return model?.component === "core.composition" && typeof model.id === "string" && model.id.length > 0 &&
    Array.isArray(parameters?.nodes) && parameters.nodes.length > 0 &&
    Object.keys(parameters).every(key => groupFields.has(key)) &&
    Array.isArray(animations) && animations.every(animation => animation && animation.pivot === undefined);
}

export function allocateModelId(base, used) {
  let id = base;
  for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function requiredReference(ids, id) {
  const name = ids.get(id);
  if (!name) throw new Error(`Unknown library model reference: ${id}`);
  return name;
}

export function insertLibraryGroup(scene, model) {
  if (!canInsertLibraryGroup(model)) throw new Error("This library model requires its own scene");
  const current = scene.parameters;
  const inserted = structuredClone(model.parameters);
  const nodeIds = new Set(current.nodes.map(node => node.id));
  const groupId = allocateModelId(model.id, nodeIds);
  const names = new Map(inserted.nodes.map(node => [node.id, allocateModelId(`${groupId}.${node.id}`, nodeIds)]));
  if (names.size !== inserted.nodes.length) throw new Error("Duplicate library model node ID");
  const nodes = inserted.nodes.map(node => ({
    ...node,
    id: names.get(node.id),
    parent: node.parent ? requiredReference(names, node.parent) : groupId,
    ...(names.has(node.metadata?.supportsRoute) ? { metadata: { ...node.metadata, supportsRoute: names.get(node.metadata.supportsRoute) } } : {}),
  }));
  const group = { id: groupId, semanticType: "core.group", ...(model.transform ? { transform: structuredClone(model.transform) } : {}) };
  const parameters = { ...current, nodes: [...current.nodes, group, ...nodes] };

  const anchorNames = new Map();
  if (inserted.anchors) {
    const used = new Set(Object.keys(current.anchors ?? {}));
    const anchors = Object.entries(inserted.anchors).map(([name, value]) => {
      const id = allocateModelId(`${groupId}.${name}`, used);
      anchorNames.set(name, id);
      const anchor = Array.isArray(value) ? { position: value } : value;
      return [id, { ...anchor, node: anchor.node ? requiredReference(names, anchor.node) : groupId }];
    });
    parameters.anchors = { ...current.anchors, ...Object.fromEntries(anchors) };
  }
  if (inserted.routeBindings) {
    parameters.routeBindings = [...(current.routeBindings ?? []), ...inserted.routeBindings.map(binding => ({
      ...binding,
      node: requiredReference(names, binding.node),
      ...(binding.clip !== undefined ? { clip: requiredReference(names, binding.clip) } : {}),
    }))];
  }
  if (inserted.poseControls) {
    const used = new Set((current.poseControls ?? []).map(control => control.id));
    parameters.poseControls = [...(current.poseControls ?? []), ...inserted.poseControls.map(control => ({
      ...control,
      id: allocateModelId(`${groupId}.${control.id}`, used),
      targets: control.targets.map(target => ({ ...target, node: requiredReference(names, target.node) })),
    }))];
  }
  if (inserted.attachments) {
    const used = new Set((current.attachments ?? []).map(attachment => attachment.id));
    parameters.attachments = [...(current.attachments ?? []), ...inserted.attachments.map(attachment => ({
      ...attachment,
      from: requiredReference(anchorNames, attachment.from),
      to: requiredReference(anchorNames, attachment.to),
      ...(attachment.id ? { id: allocateModelId(`${groupId}.${attachment.id}`, used) } : {}),
    }))];
  }
  if (inserted.animations) {
    const used = new Set((current.animations ?? []).map(animation => animation.id));
    parameters.animations = [...(current.animations ?? []), ...inserted.animations.map(animation => ({
      ...animation,
      id: allocateModelId(`${groupId}.${animation.id}`, used),
      target: requiredReference(names, animation.target),
    }))];
  }
  return { document: { ...scene, parameters }, groupId, anchorNames };
}
