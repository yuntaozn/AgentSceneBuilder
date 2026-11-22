import { geometryBounds, instanceGeometryBounds } from "./geometry.js";
import { normalizeTransform, transformDirection, transformPoint } from "./math.js";

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

export function registerGeneratedId(ids, id, instanceId) {
  if (!id.startsWith(`${instanceId}.`)) throw new Error(`Generated node id must be scoped by instance id: ${id}`);
  if (ids.has(id)) throw new Error(`Duplicate generated node id: ${id}`);
  ids.add(id);
}

export function worldAnchorDefinition(definition, transform) {
  const world = { ...definition, position: transformPoint(definition.position, transform) };
  if (definition.direction) {
    const collapsedTangent = definition.directionSource === "path" && definition.direction.every(
      (value, axis) => value * (transform?.scale?.[axis] ?? 1) === 0,
    );
    world.direction = collapsedTangent ? null : transformDirection(definition.direction, transform);
  }
  return world;
}

export function componentGeometryBounds(nodes, transform) {
  const entries = nodes.filter(node => node.kind === "geometry").map(node => ({ node, bounds: geometryBounds(node) }));
  return instanceGeometryBounds(entries, transform);
}

function finalizeBuild(definition, instance, result) {
  if (!result || !Array.isArray(result.nodes)) throw new TypeError(`${definition.id} build must return nodes`);
  const ids = new Set();
  for (const node of result.nodes) {
    registerGeneratedId(ids, node.id, instance.id);
  }
  const instanceTransform = normalizeTransform(instance.transform);
  const { localBounds, bounds } = componentGeometryBounds(result.nodes, instanceTransform);
  const anchorDefinitions = Object.fromEntries(Object.entries(result.anchors ?? {}).map(([id, value]) => {
    const definition = Array.isArray(value) ? { position: value } : value;
    if (!definition || typeof definition !== "object") throw new TypeError(`anchor ${id} must be a vec3 or descriptor`);
    return [id, { ...definition, position: definition.position }];
  }));
  const localAnchors = Object.fromEntries(
    Object.entries(anchorDefinitions).map(([id, definition]) => [id, definition.position]),
  );
  const worldAnchorDefinitions = Object.fromEntries(Object.entries(anchorDefinitions).map(([id, definition]) =>
    [id, worldAnchorDefinition(definition, instanceTransform)]));
  const worldAnchors = Object.fromEntries(Object.entries(worldAnchorDefinitions).map(([id, definition]) => [id, definition.position]));
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
    bounds,
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
