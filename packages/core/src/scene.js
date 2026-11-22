import { createBounds, dot, length, normalizeTransform, subtract, unionBounds } from "./math.js";

function anchorReference(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be an anchor reference string`);
  const marker = value.lastIndexOf("#");
  if (marker <= 0 || marker === value.length - 1) {
    throw new TypeError(`${name} must use instance-id#anchor-id syntax`);
  }
  return { instanceId: value.slice(0, marker), anchorId: value.slice(marker + 1) };
}

export function resolveAnchor(buildsById, reference) {
  const { instanceId, anchorId } = anchorReference(reference, "anchor reference");
  const build = buildsById.get(instanceId);
  if (!build) throw new Error(`Anchor instance does not exist: ${instanceId}`);
  const point = build.anchors.world[anchorId];
  if (!point) throw new Error(`Anchor does not exist: ${reference}`);
  return point;
}

export function resolveAnchorDefinition(buildsById, reference) {
  const { instanceId, anchorId } = anchorReference(reference, "anchor reference");
  const build = buildsById.get(instanceId);
  if (!build) throw new Error(`Anchor instance does not exist: ${instanceId}`);
  const definition = build.anchors.worldDefinitions?.[anchorId];
  if (!definition) throw new Error(`Anchor does not exist: ${reference}`);
  return definition;
}

export function translationToAlignAnchors(sourcePoint, targetPoint) {
  return subtract(targetPoint, sourcePoint);
}

function resolveConnection(relation, buildsById, location) {
  const fromDefinition = resolveAnchorDefinition(buildsById, relation.from);
  const toDefinition = resolveAnchorDefinition(buildsById, relation.to);
  const from = fromDefinition.position;
  const to = toDefinition.position;
  const gap = length(subtract(to, from));
  const contract = relation.contract ?? {};
  const tolerance = contract.gapTolerance ?? relation.tolerance ?? 1e-6;
  const embed = contract.embed ?? 0;
  if (typeof tolerance !== "number" || tolerance < 0) throw new RangeError(`${location} gapTolerance must be >= 0`);
  if (typeof embed !== "number" || embed < 0) throw new RangeError(`${location} embed must be >= 0`);
  const effectiveGap = Math.max(0, gap - embed);
  const directionMode = contract.direction ?? "any";
  if (!["any", "aligned", "opposed"].includes(directionMode)) throw new TypeError(`${location}.direction must be any, aligned, or opposed`);
  const angularTolerance = contract.angularTolerance ?? Math.PI / 18;
  if (typeof angularTolerance !== "number" || angularTolerance < 0 || angularTolerance > Math.PI) {
    throw new RangeError(`${location}.angularTolerance must be between 0 and PI`);
  }
  const directionsAvailable = Boolean(fromDefinition.direction && toDefinition.direction);
  const directionDot = directionsAvailable ? dot(fromDefinition.direction, toDefinition.direction) : null;
  const directionCompatible = directionMode === "any" ? true
    : !directionsAvailable ? false
      : directionMode === "aligned" ? directionDot >= Math.cos(angularTolerance)
        : directionDot <= -Math.cos(angularTolerance);
  const positionCompatible = effectiveGap <= tolerance;
  return {
    ...relation,
    contract: {
      contact: contract.contact ?? "point",
      gapTolerance: tolerance,
      embed,
      required: contract.required ?? relation.required ?? true,
      direction: directionMode,
      angularTolerance,
    },
    fromPoint: from,
    toPoint: to,
    gap,
    effectiveGap,
    positionCompatible,
    directionsAvailable,
    directionDot,
    directionCompatible,
    connected: positionCompatible && directionCompatible,
  };
}

export function composeScene(document, registry) {
  if (!document || typeof document !== "object") throw new TypeError("scene document must be an object");
  if (!Array.isArray(document.instances)) throw new TypeError("scene instances must be an array");
  const builds = [];
  const buildsById = new Map();
  for (const instance of document.instances) {
    if (buildsById.has(instance.id)) throw new Error(`Duplicate scene instance id: ${instance.id}`);
    const build = registry.build({ ...instance, transform: normalizeTransform(instance.transform) });
    builds.push(build);
    buildsById.set(instance.id, build);
  }

  const relations = [];
  const issues = [];
  const declaredRelations = [
    ...(document.relations ?? []),
    ...(document.attachments ?? []).map((attachment) => ({ type: "attachment", ...attachment })),
  ];
  for (const [index, relation] of declaredRelations.entries()) {
    if (!relation || typeof relation !== "object") throw new TypeError(`relations[${index}] must be an object`);
    if (relation.type === "connects" || relation.type === "attachment") {
      const resolved = resolveConnection(relation, buildsById, `relations[${index}].contract`);
      relations.push(resolved);
      if (!resolved.connected) {
        const reason = !resolved.positionCompatible
          ? `effective gap ${resolved.effectiveGap} exceeds ${resolved.contract.gapTolerance}`
          : `anchor directions do not satisfy ${resolved.contract.direction}`;
        issues.push({
          level: resolved.contract.required ? "error" : "warning",
          code: "SCENE_CONNECTION_GAP",
          message: `Connection ${relation.from} -> ${relation.to} failed: ${reason}`,
          location: `relations[${index}]`,
        });
      }
    } else {
      relations.push({ ...relation });
    }
  }

  const bounds = unionBounds(builds.map((build) => build.bounds));
  return {
    contractVersion: "0.1",
    metadata: document.metadata ?? {},
    instances: builds,
    bounds: bounds ?? createBounds([0, 0, 0], [0, 0, 0]),
    relations,
    issues,
    ok: !issues.some((item) => item.level === "error"),
  };
}

function matches(value, expected) {
  if (expected === undefined) return true;
  if (Array.isArray(value)) return value.includes(expected);
  return value === expected;
}

export function queryScene(scene, query = {}) {
  const results = [];
  for (const build of scene.instances) {
    if (!matches(build.instance.component, query.component)) continue;
    if (query.instanceId && build.instance.id !== query.instanceId) continue;
    if (!query.semanticType && !query.nodeIdPrefix) {
      results.push({ kind: "instance", instance: build.instance, bounds: build.bounds, anchors: build.anchors.world, metrics: build.metrics });
      continue;
    }
    for (const node of build.nodes) {
      if (!matches(node.semanticType, query.semanticType)) continue;
      if (query.nodeIdPrefix && !node.id.startsWith(query.nodeIdPrefix)) continue;
      results.push({ kind: "node", instanceId: build.instance.id, node });
    }
  }
  return results;
}
