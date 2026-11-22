import { add, assertFiniteNumber, length, subtract } from "./math.js";
import { resolveAnchor } from "./scene.js";

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

function axisIndex(axis) {
  if (!(axis in AXIS_INDEX)) throw new TypeError("axis must be x, y, or z");
  return AXIS_INDEX[axis];
}

function buildsMap(scene) {
  return new Map(scene.instances.map((build) => [build.instance.id, build]));
}

function getBuild(scene, id) {
  const build = scene.instances.find((item) => item.instance.id === id);
  if (!build) throw new Error(`Scene instance does not exist: ${id}`);
  return build;
}

export function analyzeBoundsPair(a, b, tolerance = 1e-9) {
  assertFiniteNumber(tolerance, "tolerance", { min: 0 });
  const gaps = [0, 0, 0];
  const overlaps = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    gaps[axis] = Math.max(0, a.min[axis] - b.max[axis], b.min[axis] - a.max[axis]);
    overlaps[axis] = Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
  }
  const distance = length(gaps);
  const separated = gaps.some((value) => value > tolerance);
  const touching = !separated && overlaps.some((value) => Math.abs(value) <= tolerance);
  const intersecting = !separated && !touching;
  return {
    state: separated ? "separated" : touching ? "touching" : "intersecting",
    distance,
    axisGaps: { x: gaps[0], y: gaps[1], z: gaps[2] },
    overlapSize: {
      x: Math.max(0, overlaps[0]),
      y: Math.max(0, overlaps[1]),
      z: Math.max(0, overlaps[2]),
    },
    intersecting,
    touching,
  };
}

export function analyzeSceneSpatial(scene, { tolerance = 1e-9 } = {}) {
  const pairs = [];
  for (let left = 0; left < scene.instances.length; left += 1) {
    for (let right = left + 1; right < scene.instances.length; right += 1) {
      const a = scene.instances[left];
      const b = scene.instances[right];
      pairs.push({
        a: a.instance.id,
        b: b.instance.id,
        ...analyzeBoundsPair(a.bounds, b.bounds, tolerance),
        method: "world-axis-aligned-bounds",
      });
    }
  }
  return {
    kind: "spatial-analysis",
    instanceCount: scene.instances.length,
    pairCount: pairs.length,
    collisions: pairs.filter((pair) => pair.intersecting).length,
    contacts: pairs.filter((pair) => pair.touching).length,
    pairs,
    limitations: ["AABB analysis is conservative for rotated or concave geometry and is not mesh collision detection."],
  };
}

export function proposeAnchorAlignment(scene, request) {
  if (!request || typeof request !== "object") throw new TypeError("alignment request must be an object");
  const moving = getBuild(scene, request.instanceId);
  const map = buildsMap(scene);
  const sourceReference = request.source ?? `${request.instanceId}#${request.sourceAnchor}`;
  const source = resolveAnchor(map, sourceReference);
  const target = request.targetPoint ?? resolveAnchor(map, request.target);
  const delta = subtract(target, source);
  const currentTransform = moving.instance.transform;
  const proposedTransform = {
    ...currentTransform,
    position: add(currentTransform.position, delta),
  };
  return {
    kind: "changeset-proposal",
    intent: "align-anchors",
    summary: `Translate ${request.instanceId} so ${sourceReference} aligns with ${request.target ?? "target point"}.`,
    facts: {
      source,
      target,
      translation: delta,
      distance: length(delta),
      rotationPreserved: true,
      scalePreserved: true,
    },
    changes: [{
      operation: "update-instance-transform",
      instanceId: request.instanceId,
      before: currentTransform,
      after: proposedTransform,
    }],
    applied: false,
  };
}

export function proposeLinearDistribution(scene, request) {
  if (!request || !Array.isArray(request.instanceIds) || request.instanceIds.length < 2) {
    throw new TypeError("distribution request requires at least two instanceIds");
  }
  const index = axisIndex(request.axis ?? "x");
  const gap = assertFiniteNumber(request.gap ?? 0, "gap", { min: 0 });
  const builds = request.instanceIds.map((id) => getBuild(scene, id));
  const start = request.start ?? Math.min(...builds.map((build) => build.bounds.min[index]));
  assertFiniteNumber(start, "start");
  let cursor = start;
  const changes = [];
  const placements = [];
  for (const build of builds) {
    const currentMin = build.bounds.min[index];
    const delta = cursor - currentMin;
    const before = build.instance.transform;
    const position = [...before.position];
    position[index] += delta;
    const after = { ...before, position };
    changes.push({ operation: "update-instance-transform", instanceId: build.instance.id, before, after });
    placements.push({ instanceId: build.instance.id, proposedMin: cursor, size: build.bounds.size[index] });
    cursor += build.bounds.size[index] + gap;
  }
  return {
    kind: "changeset-proposal",
    intent: "linear-distribution",
    summary: `Distribute ${builds.length} instances along ${request.axis ?? "x"} with gap ${gap}.`,
    facts: { axis: request.axis ?? "x", start, gap, end: cursor - gap, placements },
    changes,
    applied: false,
  };
}

export function applyChangesetProposal(document, proposal) {
  if (!proposal || proposal.kind !== "changeset-proposal") throw new TypeError("expected a changeset proposal");
  if (proposal.applied) throw new Error("proposal is already marked as applied");
  const clone = structuredClone(document);
  const instances = new Map(clone.instances.map((instance) => [instance.id, instance]));
  for (const change of proposal.changes) {
    if (change.operation !== "update-instance-transform") throw new Error(`Unsupported changeset operation: ${change.operation}`);
    const instance = instances.get(change.instanceId);
    if (!instance) throw new Error(`Changeset instance does not exist: ${change.instanceId}`);
    instance.transform = structuredClone(change.after);
  }
  clone.revision = (document.revision ?? 0) + 1;
  return clone;
}
