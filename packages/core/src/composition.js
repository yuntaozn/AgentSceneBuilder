import { box, cone, cylinder, cylinderBetween, loftedSurface, sphere, sweep, taperedCylinderBetween, torus, tubeAlong } from "./geometry.js";
import {
  add,
  alignVectorMatrix,
  assertFiniteNumber,
  assertVec3,
  identityMatrix,
  multiplyMatrices,
  normalizeVector,
  scale,
  subtract,
  transformMatrix,
  transformDirectionMatrix,
  transformPointMatrix,
  transformVectorMatrix,
  translationMatrix,
} from "./math.js";
import { samplePath } from "./path.js";
import { resolveMepRouteBindings } from "./mep-route-bindings.js";
import { resolvePoseControls } from "./pose-controls.js";
import { checkMonitoring } from "./monitoring.js";
import { checkLocalAttachments } from "./connection-check.js";
import { worldAnchorDefinition } from "./component.js";
import { architecturalSweep } from "./architectural-geometry.js";
import { rectangularDuctSweep } from "./rectangular-duct.js";
import { structuralSweep } from "./structural-geometry.js";
import { siteSweep } from "./site-geometry.js";
import { roofSweep } from "./roof-geometry.js";
import { roundPipeSweep } from "./round-pipe-geometry.js";
import { masonrySweep } from "./masonry-geometry.js";
import { drywallSweep } from "./drywall-geometry.js";
import { precastSweep } from "./precast-geometry.js";

export const COMPOSITION_SPEC_VERSION = "0.3";

function requiredString(value, name) {
  if (typeof value !== "string" || !value) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

export function parametricSweep(geometry) {
  return rectangularDuctSweep(geometry) ?? roundPipeSweep(geometry) ?? architecturalSweep(geometry) ?? structuralSweep(geometry) ??
    siteSweep(geometry) ?? roofSweep(geometry) ?? masonrySweep(geometry) ?? drywallSweep(geometry) ?? precastSweep(geometry);
}

export function compileGeometry(node, id, matrix) {
  const geometry = node.geometry;
  if (!geometry || typeof geometry !== "object") throw new TypeError(`${node.id}.geometry must be an object`);
  const common = { id, material: node.material, appearance: node.appearance, semanticType: node.semanticType, metadata: node.metadata };
  if (geometry.type === "sweep") return sweep({ ...geometry, ...common, matrix });
  const sectionSweep = parametricSweep(geometry);
  if (sectionSweep) return sweep({ ...sectionSweep, ...common, matrix });
  if (geometry.type === "box") {
    return box({ ...common, size: geometry.size, position: transformPointMatrix([0, 0, 0], matrix), matrix });
  }
  if (geometry.type === "sphere") return sphere({ ...common, radius: geometry.radius, segments: geometry.segments, position: transformPointMatrix([0,0,0],matrix), matrix });
  if (geometry.type === "cylinder") return cylinder({ ...common, radius: geometry.radius, height: geometry.height, radialSegments: geometry.radialSegments, position: transformPointMatrix([0,0,0],matrix), matrix });
  if (geometry.type === "cone") return cone({ ...common, radius: geometry.radius, height: geometry.height, radialSegments: geometry.radialSegments, position: transformPointMatrix([0,0,0],matrix), matrix });
  if (geometry.type === "torus") return torus({ ...common, majorRadius: geometry.majorRadius, tubeRadius: geometry.tubeRadius, radialSegments: geometry.radialSegments, tubularSegments: geometry.tubularSegments, position: transformPointMatrix([0,0,0],matrix), matrix });
  if (geometry.type === "cylinder-between") {
    return cylinderBetween({
      ...common,
      start: transformPointMatrix(geometry.start, matrix, "start"),
      end: transformPointMatrix(geometry.end, matrix, "end"),
      radius: geometry.radius,
      radialSegments: geometry.radialSegments,
    });
  }
  if (geometry.type === "tapered-cylinder-between") {
    return taperedCylinderBetween({
      ...common,
      start: transformPointMatrix(geometry.start, matrix, "start"),
      end: transformPointMatrix(geometry.end, matrix, "end"),
      startRadius: geometry.startRadius,
      endRadius: geometry.endRadius,
      radialSegments: geometry.radialSegments,
    });
  }
  if (geometry.type === "lofted-surface") {
    if (!Array.isArray(geometry.sections)) throw Object.assign(new TypeError("Expected an array of loft sections"), { field: "sections" });
    return loftedSurface({
      ...common,
      sections: geometry.sections.map((section, i) => {
        const center = transformPointMatrix(section?.center, matrix, `sections[${i}].center`);
        const axisX = section.axisX ?? [section.radiusX, 0, 0];
        const axisZ = section.axisZ ?? [0, 0, section.radiusZ];
        return {
          ...section,
          center,
          axisX: transformVectorMatrix(axisX, matrix),
          axisZ: transformVectorMatrix(axisZ, matrix),
        };
      }),
      radialSegments: geometry.radialSegments,
      capStart: geometry.capStart,
      capEnd: geometry.capEnd,
    });
  }
  if (geometry.type === "tube-along") {
    if (!Array.isArray(geometry.points)) throw Object.assign(new TypeError("Expected an array of tube points"), { field: "points" });
    return tubeAlong({
      ...common,
      points: geometry.points.map((point, i) => transformPointMatrix(point, matrix, `points[${i}]`)),
      radius: geometry.radius,
      radialSegments: geometry.radialSegments,
    });
  }
  throw Object.assign(new Error(`Unsupported composition geometry type: ${geometry.type}`), { field: "type" });
}

export function linearRepetition({ count, step, start = [0, 0, 0] }) {
  const safeCount = assertFiniteNumber(count, "repetition.count", { min: 1 });
  if (!Number.isInteger(safeCount)) throw new TypeError("repetition.count must be an integer");
  const safeStep = assertVec3(step, "repetition.step");
  const safeStart = assertVec3(start, "repetition.start");
  return Array.from({ length: safeCount }, (_, index) => ({ index, offset: add(safeStart, scale(safeStep, index)) }));
}

export function gridRepetition({ count, stepX = [0, 0, 0], stepY = [0, 0, 0], stepZ = [0, 0, 0], start = [0, 0, 0] }) {
  if (!Array.isArray(count) || count.length !== 3) throw new TypeError("repetition.count must be [x, y, z]");
  const counts = count.map((value, axis) => {
    const safe = assertFiniteNumber(value, `repetition.count[${axis}]`, { min: 1 });
    if (!Number.isInteger(safe)) throw new TypeError(`repetition.count[${axis}] must be an integer`);
    return safe;
  });
  const steps = [assertVec3(stepX, "repetition.stepX"), assertVec3(stepY, "repetition.stepY"), assertVec3(stepZ, "repetition.stepZ")];
  const origin = assertVec3(start, "repetition.start");
  const result = [];
  for (let z = 0; z < counts[2]; z += 1) for (let y = 0; y < counts[1]; y += 1) for (let x = 0; x < counts[0]; x += 1) {
    result.push({ index: result.length, gridIndex: [x, y, z], offset: add(add(add(origin, scale(steps[0], x)), scale(steps[1], y)), scale(steps[2], z)) });
  }
  return result;
}

export function radialRepetition({ count, center = [0, 0, 0], radius, axis = "y", startAngle = 0, sweepAngle = Math.PI * 2, includeEnd = false }) {
  const safeCount = assertFiniteNumber(count, "repetition.count", { min: 1 });
  if (!Number.isInteger(safeCount)) throw new TypeError("repetition.count must be an integer");
  const safeCenter = assertVec3(center, "repetition.center");
  const safeRadius = assertFiniteNumber(radius, "repetition.radius", { min: 0 });
  if (!["x", "y", "z"].includes(axis)) throw new TypeError("repetition.axis must be x, y, or z");
  const divisor = includeEnd && safeCount > 1 ? safeCount - 1 : safeCount;
  return Array.from({ length: safeCount }, (_, index) => {
    const angle = startAngle + sweepAngle * index / divisor;
    const planar = [Math.cos(angle) * safeRadius, Math.sin(angle) * safeRadius];
    const radial = axis === "x" ? [0, planar[0], planar[1]] : axis === "y" ? [planar[0], 0, planar[1]] : [planar[0], planar[1], 0];
    return { index, angle, radial, offset: add(safeCenter, radial) };
  });
}

export function pathRepetition({ points, spacing, startOffset = 0, endOffset = 0, includeEnd = false }) {
  return samplePath(points, { spacing, startOffset, endOffset, includeEnd }).samples.map((sample) => ({
    index: sample.index,
    offset: sample.position,
    pathDistance: sample.distance,
    segmentIndex: sample.segmentIndex,
    tangent: sample.tangent,
  }));
}

export function occurrences(repetition) {
  if (repetition === undefined) return [{ index: null, offset: [0, 0, 0] }];
  if (!repetition || typeof repetition !== "object") throw new TypeError("repetition must be an object");
  if (repetition.type === "linear") return linearRepetition(repetition);
  if (repetition.type === "grid") return gridRepetition(repetition);
  if (repetition.type === "radial") return radialRepetition(repetition);
  if (repetition.type === "path") return pathRepetition(repetition);
  throw Object.assign(new Error(`Unsupported repetition type: ${repetition.type}`), { field: "type" });
}

export function orientationMatrix(orientation, occurrence) {
  if (!orientation || orientation.mode === "fixed") return identityMatrix();
  const localAxis = orientation.localAxis ?? [0, 1, 0];
  if (orientation.mode === "tangent") {
    if (!occurrence.tangent) throw new Error("tangent orientation requires path repetition");
    return alignVectorMatrix(localAxis, occurrence.tangent);
  }
  if (orientation.mode === "radial-outward" || orientation.mode === "radial-inward") {
    if (!occurrence.radial) throw new Error("radial orientation requires radial repetition");
    const target = orientation.mode === "radial-inward" ? scale(occurrence.radial, -1) : occurrence.radial;
    return alignVectorMatrix(localAxis, target);
  }
  throw new Error(`Unsupported orientation mode: ${orientation.mode}`);
}

function occurrenceId(instanceId, nodeId, index, count) {
  const base = `${instanceId}.${nodeId}`;
  if (index === null) return base;
  const width = Math.max(3, String(Math.max(0, count - 1)).length);
  return `${base}.${String(index).padStart(width, "0")}`;
}

export function selectOccurrence(nodeId, placements, selector) {
  const normalized = typeof selector === "number" ? { index: selector } : selector;
  if (!normalized || typeof normalized !== "object") throw new TypeError(`Anchor on repeated node ${nodeId} requires an occurrence selector`);
  let found;
  if (normalized.index !== undefined) found = placements.find((item) => item.occurrence.index === normalized.index);
  else if (normalized.gridIndex) found = placements.find((item) =>
    item.occurrence.gridIndex?.every((value, axis) => value === normalized.gridIndex[axis]));
  else if (normalized.pathDistance !== undefined) {
    const tolerance = normalized.tolerance ?? 1e-6;
    found = placements.find((item) => Math.abs(item.occurrence.pathDistance - normalized.pathDistance) <= tolerance);
  }
  if (!found) throw new Error(`Occurrence does not exist for node ${nodeId}: ${JSON.stringify(selector)}`);
  return found;
}

export function* hierarchyIssues(nodes, nodesById, ambiguous = new Set()) {
  for (const node of nodes) {
    if (!node.parent) continue;
    if (ambiguous.has(node.parent)) yield [node, "PARENT_AMBIGUOUS", `Parent ID is duplicated: ${node.parent}`];
    else if (!nodesById.has(node.parent)) yield [node, "PARENT_MISSING", `Parent node does not exist: ${node.parent}`];
    else if (nodesById.get(node.parent).repetition) yield [node, "PARENT_REPEATED", `Repeated node cannot be a parent: ${node.parent}`];
  }
  const visited = new Set();
  for (const id of nodesById.keys()) {
    const chain = new Set();
    let current = id;
    while (nodesById.has(current) && !ambiguous.has(current) && !visited.has(current)) {
      if (chain.has(current)) {
        const members = [...chain];
        const cycle = members.slice(members.indexOf(current));
        const reason = `Composition hierarchy contains a cycle: ${[...cycle, current].join(" -> ")}`;
        for (const member of cycle) yield [nodesById.get(member), "PARENT_CYCLE", reason];
        break;
      }
      chain.add(current);
      current = nodesById.get(current).parent;
    }
    for (const member of chain) visited.add(member);
  }
}

export function validateLight(light) {
  if (!["point", "directional", "spot"].includes(light.type)) throw new Error(`Unsupported light type: ${light.type}`);
}

export function compileCompositionSpec(spec, { instanceId = spec?.id, transform, includeSource = false } = {}) {
  spec = resolveMepRouteBindings(spec);
  const result = compile(resolvePoseControls(spec), instanceId);
  if (includeSource) result.parameters = spec;
  if (spec.monitoring !== undefined) {
    checkMonitoring(spec, name => {
      if (!Object.hasOwn(result.anchors, name)) return;
      const anchor = result.anchors[name];
      return worldAnchorDefinition(Array.isArray(anchor) ? { position: anchor } : anchor, transform);
    }, (path, message, nodeId) => {
      throw Object.assign(new Error(`${path}: ${message}`), { code: "MONITORING_INVALID", path, nodeId });
    });
  }
  if (spec.attachments !== undefined) {
    const warnings = [];
    checkLocalAttachments(spec, "", name => {
      const anchor = result.anchors[name];
      return worldAnchorDefinition(Array.isArray(anchor) ? { position: anchor } : anchor, transform);
    }, (code, path, message, context) => {
      if (context?.level !== "warning") throw Object.assign(new Error(`${path}: ${message}`), { code, path, ...context });
      warnings.push({ code, path, message, ...context });
    });
    if (warnings.length) result.warnings = [...result.warnings, ...warnings];
  }
  return result;
}

// The checker needs successful outputs for final ID, bounds and world-anchor validation.
export function compileForDiagnostics(spec, instanceId, onIssue) {
  return compile(spec, instanceId, onIssue);
}

function geometryAnchor(definition, geometry) {
  if (definition.position !== undefined) throw new Error("Use either position or onGeometry for an anchor");
  const placement = definition.onGeometry;
  if (placement?.type === "box" && geometry?.type === "box") {
    const fraction = assertVec3(placement.fraction, "box fraction");
    if (fraction.some(value => Math.abs(value) > 0.5)) throw new Error("Box fractions must be between -0.5 and 0.5");
    return { position: fraction.map((value, axis) => value * geometry.size[axis]) };
  }
  if (placement?.type === "sweep-end" && ["sweep", "rectangular-duct"].includes(geometry?.type)) {
    const { end } = placement;
    if (end !== "start" && end !== "end") throw new Error("A sweep end must be start or end");
    const points = geometry.points;
    const [position, neighbor] = end === "start" ? [points[0], points[1]] : [points.at(-1), points.at(-2)];
    return { position, direction: definition.direction ?? normalizeVector(subtract(position, neighbor), "sweep end direction") };
  }
  if (placement?.type === "feature") {
    const anchors = parametricSweep(geometry)?.anchors;
    if (!anchors || !Object.hasOwn(anchors, placement.name)) throw new Error("Expected a named feature on the node geometry");
    const anchor = anchors[placement.name];
    return definition.direction === undefined ? anchor : { ...anchor, direction: definition.direction };
  }
  throw new Error("Expected a box, sweep-end or feature anchor on matching node geometry");
}

function compile(spec, instanceId, onIssue) {
  if (!spec || typeof spec !== "object") throw new TypeError("composition spec must be an object");
  requiredString(instanceId, "composition instanceId");
  if (!Array.isArray(spec.nodes)) throw new TypeError("composition spec nodes must be an array");
  const nodesById = new Map();
  for (const [index, node] of spec.nodes.entries()) {
    if (!node || typeof node !== "object") throw new TypeError(`nodes[${index}] must be an object`);
    requiredString(node.id, `nodes[${index}].id`);
    if (nodesById.has(node.id)) throw new Error(`Duplicate composition node id: ${node.id}`);
    nodesById.set(node.id, node);
  }
  const hierarchyError = hierarchyIssues(nodesById.values(), nodesById).next();
  if (!hierarchyError.done) throw new Error(hierarchyError.value[2]);

  const logicalMatrices = new Map();
  function logicalMatrix(node) {
    if (logicalMatrices.has(node.id)) return logicalMatrices.get(node.id);
    const parentMatrix = node.parent ? logicalMatrix(nodesById.get(node.parent)) : identityMatrix();
    const localTransform = { ...(node.transform ?? {}), position: node.transform?.position ?? node.position ?? [0, 0, 0] };
    const matrix = multiplyMatrices(parentMatrix, transformMatrix(localTransform, node.pivot));
    logicalMatrices.set(node.id, matrix);
    return matrix;
  }

  const nodes = []; const repetitions = []; const occurrencePlacements = new Map();
  for (const [nodeIndex, node] of spec.nodes.entries()) {
    const expanded = occurrences(node.repetition);
    if (node.repetition) repetitions.push({ prototypeId: node.id, ...node.repetition, orientation: node.orientation ?? { mode: "fixed" }, occurrenceCount: expanded.length });
    const placements = expanded.map((occurrence) => ({
      occurrence,
      matrix: multiplyMatrices(
        logicalMatrix(node),
        multiplyMatrices(translationMatrix(occurrence.offset), orientationMatrix(node.orientation, occurrence)),
      ),
    }));
    occurrencePlacements.set(node.id, placements);
    if (node.light) {
      validateLight(node.light);
      for (const { occurrence, matrix } of placements) {
        nodes.push({
          id: occurrenceId(instanceId, node.id, occurrence.index, expanded.length),
          kind: "light",
          semanticType: node.semanticType ?? `scene.light.${node.light.type}`,
          light: structuredClone(node.light),
          transform: { position: transformPointMatrix([0,0,0],matrix), rotation: node.transform?.rotation ?? [0,0,0], scale: node.transform?.scale ?? [1,1,1] },
          matrix,
          parent: node.parent ?? null,
          pivot: node.pivot ?? [0,0,0],
          metadata: { ...node.metadata, compositionNodeId: node.id, ...(occurrence.index===null?{}:{repetitionIndex:occurrence.index}), occurrenceRef: occurrence.index===null?node.id:`${node.id}[${occurrence.index}]` },
        });
      }
      continue;
    }
    if (!node.geometry) continue;
    for (const { occurrence, matrix } of placements) {
      let compiled;
      try {
        compiled = compileGeometry(node, occurrenceId(instanceId, node.id, occurrence.index, expanded.length), matrix);
      } catch (error) {
        if (!onIssue) throw error;
        onIssue("GEOMETRY_INVALID", ["nodes", nodeIndex, "geometry"], error.message, node.id);
        break;
      }
      compiled.parent = node.parent ?? null;
      compiled.pivot = node.pivot ?? [0, 0, 0];
      compiled.metadata = {
        ...compiled.metadata,
        compositionNodeId: node.id,
        ...(occurrence.index === null ? {} : { repetitionIndex: occurrence.index }),
        ...(occurrence.gridIndex ? { gridIndex: occurrence.gridIndex } : {}),
        ...(occurrence.pathDistance === undefined ? {} : { pathDistance: occurrence.pathDistance, segmentIndex: occurrence.segmentIndex, tangent: occurrence.tangent }),
        ...(occurrence.angle === undefined ? {} : { radialAngle: occurrence.angle }),
        orientationMode: node.orientation?.mode ?? "fixed",
        occurrenceRef: occurrence.index === null ? node.id : `${node.id}[${occurrence.index}]`,
      };
      nodes.push(compiled);
    }
  }

  const anchors = Object.fromEntries(Object.entries(spec.anchors ?? {}).map(([id, value]) => {
    let definition = Array.isArray(value) ? { position: value } : value;
    if (!definition?.node) {
      if (definition?.onGeometry !== undefined) throw new Error(`Anchor ${id} requires a node for onGeometry`);
      return [id, value];
    }
    const owner = nodesById.get(definition.node);
    if (!owner) throw new Error(`Anchor ${id} refers to unknown node: ${definition.node}`);
    if (definition.onGeometry !== undefined) {
      try {
        const local = geometryAnchor(definition, owner.geometry);
        const { onGeometry, ...fields } = definition;
        definition = { ...fields, ...local };
      } catch (error) {
        if (!onIssue) throw error;
        onIssue("ANCHOR_GEOMETRY_INVALID", ["anchors", id, "onGeometry"], error.message, owner.id);
        return null;
      }
    }
    const selected = owner.repetition
      ? selectOccurrence(owner.id, occurrencePlacements.get(owner.id), definition.occurrence)
      : occurrencePlacements.get(owner.id)[0];
    const ownerMatrix = selected.matrix;
    let position, direction;
    try {
      position = transformPointMatrix(definition.position, ownerMatrix);
      if (definition.direction) direction = transformDirectionMatrix(definition.direction, ownerMatrix);
    } catch (error) {
      if (!onIssue) throw error;
      onIssue("ANCHOR_TRANSFORM_INVALID", ["anchors", id, position ? "direction" : "position"], error.message, owner.id);
      return null;
    }
    return [id, {
      ...definition,
      position,
      ...(direction ? { direction } : {}),
      ...(owner.repetition ? { occurrenceRef: `${owner.id}[${selected.occurrence.index}]` } : {}),
    }];
  }).filter(entry => entry !== null));

  return {
    contractVersion: COMPOSITION_SPEC_VERSION,
    parameters: spec.parameters ?? {},
    nodes,
    anchors,
    attachments: spec.attachments ?? [],
    relations: spec.relations ?? [],
    repetitions,
    metrics: spec.metrics ?? {},
    warnings: spec.warnings ?? [],
    animations: spec.animations ?? [],
    annotations: spec.annotations ?? [],
  };
}
