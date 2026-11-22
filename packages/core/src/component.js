import { geometryBounds } from "./geometry.js";
import { normalizeTransform, transformBounds, transformDirection, transformPoint, unionBounds } from "./math.js";

export const COMPONENT_CONTRACT_VERSION = "0.1";

export class ComponentRegistry {
  #definitions = new Map();

  register(definition) {
    validateDefinition(definition);
    if (this.#definitions.has(definition.id)) {
      throw new Error(`Component already registered: ${definition.id}`);
    }
    this.#definitions.set(definition.id, definition);
    return this;
  }

  list() {
    return [...this.#definitions.values()].map(({ build, ...metadata }) => metadata);
  }

  describe(id) {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`Unknown component: ${id}`);
    const { build, ...metadata } = definition;
    return metadata;
  }

  build(instance) {
    if (!instance || typeof instance !== "object") throw new TypeError("component instance must be an object");
    if (!instance.id || typeof instance.id !== "string") throw new TypeError("component instance requires a stable id");
    const definition = this.#definitions.get(instance.component);
    if (!definition) throw new Error(`Unknown component: ${instance.component}`);
    const result = definition.build({
      instanceId: instance.id,
      parameters: instance.parameters ?? {},
      transform: normalizeTransform(instance.transform),
    });
    return finalizeBuild(definition, instance, result);
  }
}

function validateDefinition(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("component definition must be an object");
  for (const field of ["id", "version", "title"]) {
    if (!definition[field] || typeof definition[field] !== "string") throw new TypeError(`component definition requires ${field}`);
  }
  if (typeof definition.build !== "function") throw new TypeError("component definition requires a build function");
}

function finalizeBuild(definition, instance, result) {
  if (!result || !Array.isArray(result.nodes)) throw new TypeError(`${definition.id} build must return nodes`);
  const ids = new Set();
  for (const node of result.nodes) {
    if (!node.id.startsWith(`${instance.id}.`)) {
      throw new Error(`Generated node id must be scoped by instance id: ${node.id}`);
    }
    if (ids.has(node.id)) throw new Error(`Duplicate generated node id: ${node.id}`);
    ids.add(node.id);
  }
  const instanceTransform = normalizeTransform(instance.transform);
  const localBounds = unionBounds(result.nodes.filter(node=>node.kind==="geometry").map(geometryBounds));
  const anchorDefinitions = Object.fromEntries(Object.entries(result.anchors ?? {}).map(([id, value]) => {
    const definition = Array.isArray(value) ? { position: value } : value;
    if (!definition || typeof definition !== "object") throw new TypeError(`anchor ${id} must be a vec3 or descriptor`);
    return [id, { ...definition, position: definition.position }];
  }));
  const localAnchors = Object.fromEntries(
    Object.entries(anchorDefinitions).map(([id, definition]) => [id, definition.position]),
  );
  const worldAnchors = Object.fromEntries(
    Object.entries(localAnchors).map(([id, point]) => [id, transformPoint(point, instanceTransform)]),
  );
  const worldAnchorDefinitions = Object.fromEntries(Object.entries(anchorDefinitions).map(([id, definition]) => [id, {
    ...definition,
    position: worldAnchors[id],
    ...(definition.direction ? { direction: transformDirection(definition.direction, instanceTransform) } : {}),
  }]));
  return {
    contractVersion: COMPONENT_CONTRACT_VERSION,
    instance: {
      id: instance.id,
      component: definition.id,
      componentVersion: definition.version,
      parameters: result.parameters,
      transform: instanceTransform,
    },
    nodes: result.nodes,
    localBounds,
    bounds: transformBounds(localBounds, instanceTransform),
    anchors: {
      local: localAnchors,
      world: worldAnchors,
      definitions: anchorDefinitions,
      worldDefinitions: worldAnchorDefinitions,
    },
    metrics: result.metrics ?? {},
    relations: result.relations ?? [],
    attachments: result.attachments ?? [],
    repetitions: result.repetitions ?? [],
    animations: result.animations ?? [],
    annotations: result.annotations ?? [],
    warnings: result.warnings ?? [],
  };
}
