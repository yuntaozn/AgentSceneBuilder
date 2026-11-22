import { assertFiniteNumber, assertVec3, length, nearlyEqual, normalizeTransform, subtract, transformBounds, transformPoint } from "./math.js";
import { componentGeometryBounds } from "./component.js";
import { anchorReference, rebuildAtTransform, resolveAnchor } from "./scene.js";
import { createDefaultRegistry } from "./default-registry.js";
import { connectionImpactConflicts, previewConnectionImpact } from "./proposal-connections.js";
import { checkProposalVector, proposalField, readDistributionPlacements, readProposalChanges } from "./proposal-input.js";

const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const PLACEMENT_TOLERANCE = 1e-9;

function axisIndex(axis) {
  if (typeof axis !== "string" || !Object.hasOwn(AXIS_INDEX, axis)) throw new TypeError("axis must be x, y, or z");
  return AXIS_INDEX[axis];
}

function buildsMap(scene) {
  return new Map(scene.instances.map((build) => [build.instance.id, build]));
}

function getBuild(builds, id) {
  const build = builds.get(id);
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
  const bounded = [];
  const skippedInstanceIds = [];
  for (const build of scene.instances) {
    if (build.bounds) bounded.push(build);
    else skippedInstanceIds.push(build.instance.id);
  }
  const pairs = [];
  for (let left = 0; left < bounded.length; left += 1) {
    for (let right = left + 1; right < bounded.length; right += 1) {
      const a = bounded[left];
      const b = bounded[right];
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
    skippedInstanceIds,
    pairCount: pairs.length,
    collisions: pairs.filter((pair) => pair.intersecting).length,
    contacts: pairs.filter((pair) => pair.touching).length,
    pairs,
    limitations: ["AABB analysis is conservative for rotated or concave geometry and is not mesh collision detection."],
  };
}

function measureAlignment(reference, expected, actual) {
  assertVec3(actual, "projected world anchor");
  return { reference, space: "world", unit: "meter", expected, actual,
    gap: length(subtract(actual, expected)), tolerancePerAxis: PLACEMENT_TOLERANCE };
}

function reachesTarget({ actual, expected }) {
  return actual.every((value, axis) => nearlyEqual(value, expected[axis], PLACEMENT_TOLERANCE));
}

export function proposeAnchorAlignment(scene, request, registry) {
  if (!request || typeof request !== "object") throw new TypeError("alignment request must be an object");
  const map = buildsMap(scene);
  const moving = getBuild(map, request.instanceId);
  const sourceReference = request.source ?? `${request.instanceId}#${request.sourceAnchor}`;
  const { instanceId, anchorId } = anchorReference(sourceReference, "alignment source");
  if (instanceId !== request.instanceId) throw new Error(`Alignment source ${sourceReference} must belong to moving instance ${request.instanceId}`);
  const source = resolveAnchor(map, sourceReference);
  const fixedPoint = request.targetPoint != null;
  const target = fixedPoint ? assertVec3(request.targetPoint, "targetPoint") : resolveAnchor(map, request.target);
  if (!fixedPoint && anchorReference(request.target, "alignment target").instanceId === instanceId &&
      source.some((value, axis) => value !== target[axis])) {
    throw new Error("Moving an instance cannot align two distinct positions on that same instance");
  }
  const currentTransform = moving.instance.transform;
  const local = moving.anchors.local[anchorId];
  const offset = transformPoint(local, { rotation: currentTransform.rotation, scale: currentTransform.scale });
  // Solve in the target frame so a large old translation cannot swallow a small local offset.
  const proposedTransform = {
    ...currentTransform,
    position: target.map((value, axis) => source[axis] === value ? currentTransform.position[axis] : value - offset[axis]),
  };
  const delta = assertVec3(subtract(proposedTransform.position, currentTransform.position), "alignment translation");
  const distance = assertFiniteNumber(length(delta), "alignment distance");
  const projected = new Map();
  let actual;
  if (registry) {
    projected.set(instanceId, sameTransform(currentTransform, proposedTransform) ? moving
      : rebuildAtTransform(registry, moving, proposedTransform));
    actual = resolveAnchor(projected, sourceReference);
  } else {
    actual = transformPoint(local, proposedTransform);
  }
  const alignmentResult = measureAlignment(sourceReference, target, actual);
  if (!reachesTarget(alignmentResult)) {
    throw Object.assign(new Error(`Translation leaves ${sourceReference} outside the target tolerance`),
      { code: "SCENE_ALIGNMENT_TARGET_MISSED", measurement: alignmentResult });
  }
  return {
    kind: "changeset-proposal",
    intent: "align-anchors",
    alignmentAnchors: {
      source: { reference: sourceReference, position: [...local] },
      target: { ...(fixedPoint ? {} : { reference: request.target }), position: [...target] },
    },
    summary: `Translate ${request.instanceId} so ${sourceReference} aligns with ${fixedPoint ? "target point" : request.target}.`,
    facts: {
      source,
      target,
      translation: delta,
      distance,
      alignmentResult,
      rotationPreserved: true,
      scalePreserved: true,
      connectionImpact: previewConnectionImpact(scene, map, new Map([[instanceId, proposedTransform]]), registry, projected),
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

function rigidBoundsAt(build, transform) {
  if (build.localBounds && transform.rotation.every(angle => angle === 0)) return transformBounds(build.localBounds, transform);
  return componentGeometryBounds(build.nodes, transform).bounds;
}

function distributionTargetMissed(message, measurement) {
  return Object.assign(new Error(message), { code: "SCENE_DISTRIBUTION_TARGET_MISSED", measurement });
}

function projectPlacement(build, min, axis, registry) {
  const index = AXIS_INDEX[axis];
  const before = build.instance.transform;
  const position = [...before.position];
  const after = { ...before, position };
  let offsets = build.bounds;
  let projected = build;
  if (min !== build.bounds.min[index]) {
    // Solve for the translation before adding the instance's old world coordinate.
    position[index] = 0;
    if (before.position[index] !== 0) offsets = rigidBoundsAt(build, after);
    position[index] = assertFiniteNumber(min - offsets.min[index], "distribution translation");
    projected = registry ? rebuildAtTransform(registry, build, after) : { bounds: rigidBoundsAt(build, after) };
  }
  const size = assertFiniteNumber(offsets.size[index], "distribution size");
  const expected = { min, max: assertFiniteNumber(min + size, "distribution upper bound"), size };
  const bounds = projected.bounds;
  const actual = bounds && { min: bounds.min[index], max: bounds.max[index], size: bounds.size[index] };
  if (!actual || !nearlyEqual(actual.min, min) || !nearlyEqual(actual.max, expected.max) || !nearlyEqual(actual.size, size)) {
    throw distributionTargetMissed(`Translation misses the requested bounds for ${build.instance.id}`, {
      kind: "bounds", instanceId: build.instance.id, axis, space: "world", unit: "meter", tolerance: PLACEMENT_TOLERANCE, expected, actual,
    });
  }
  return { after, projected, size };
}

function measureDistributionGaps(ids, builds, axis, gap) {
  const index = AXIS_INDEX[axis];
  const measurements = [];
  for (let i = 1; i < ids.length; i++) {
    const fromInstanceId = ids[i - 1], toInstanceId = ids[i];
    const left = builds.get(fromInstanceId), right = builds.get(toInstanceId);
    if (!left || !right) continue; // An unavailable placement already has its own conflict.
    const actual = right.bounds.min[index] - left.bounds.max[index];
    measurements.push({ kind: "gap", fromInstanceId, toInstanceId, axis, space: "world", unit: "meter",
      expected: gap, actual, tolerance: PLACEMENT_TOLERANCE });
  }
  return measurements;
}

export function proposeLinearDistribution(scene, request, registry) {
  if (!request || !Array.isArray(request.instanceIds) || request.instanceIds.length < 2) {
    throw new TypeError("distribution request requires at least two instanceIds");
  }
  if (new Set(request.instanceIds).size !== request.instanceIds.length) throw new TypeError("distribution requires distinct instanceIds");
  const axis = request.axis ?? "x";
  const index = axisIndex(axis);
  const gap = assertFiniteNumber(request.gap ?? 0, "gap", { min: 0 });
  const map = buildsMap(scene);
  const builds = request.instanceIds.map((id) => getBuild(map, id));
  const missing = builds.filter(build => !build.bounds).map(build => build.instance.id);
  if (missing.length) {
    throw Object.assign(new Error(`Cannot distribute instances without geometry bounds: ${missing.join(", ")}`),
      { code: "SCENE_BOUNDS_MISSING", instanceIds: missing });
  }
  const start = request.start ?? Math.min(...builds.map((build) => build.bounds.min[index]));
  assertFiniteNumber(start, "start");
  let end;
  const changes = [];
  const placements = [];
  const transforms = new Map();
  const projected = new Map();
  for (const build of builds) {
    const min = end === undefined ? start : assertFiniteNumber(end + gap, "next distribution lower bound");
    const placement = projectPlacement(build, min, axis, registry);
    const instanceId = build.instance.id;
    const before = build.instance.transform;
    const { after } = placement;
    if (after.position[index] !== before.position[index]) transforms.set(instanceId, after);
    projected.set(instanceId, placement.projected);
    changes.push({ operation: "update-instance-transform", instanceId, before, after });
    placements.push({ instanceId, proposedMin: min, size: placement.size });
    end = placement.projected.bounds.max[index];
  }
  const gapMeasurements = measureDistributionGaps(request.instanceIds, projected, axis, gap);
  const missed = gapMeasurements.find(m => !nearlyEqual(m.actual, m.expected, m.tolerance));
  if (missed) throw distributionTargetMissed(`Translation misses the requested gap between ${missed.fromInstanceId} and ${missed.toInstanceId}`, missed);
  return {
    kind: "changeset-proposal",
    intent: "linear-distribution",
    summary: `Distribute ${builds.length} instances along ${request.axis ?? "x"} with gap ${gap}.`,
    facts: { axis, start, gap, end, placements, gapMeasurements,
      connectionImpact: previewConnectionImpact(scene, map, transforms, registry, projected) },
    changes,
    applied: false,
  };
}

// Geometry and joint checks share one build per instance in each pose.
function cachedBuilds(instances, indices, registry) {
  const cache = new Map();
  return {
    get(id) {
      const index = indices.get(id);
      if (index === undefined || index < 0) throw new Error(`Missing or ambiguous instance: ${id}`);
      if (!cache.has(id)) cache.set(id, registry.build(instances[index]));
      return cache.get(id);
    },
  };
}

function alignmentConflicts(indices, proposal, changesByInstance, unavailablePoses, buildAt) {
  const { alignmentAnchors } = proposal;
  if (alignmentAnchors == null) return [proposalField("/alignmentAnchors", "alignment-references-missing",
    "Regenerate the alignment proposal to capture both anchors", changesByInstance.keys().next().value)];
  const conflicts = [];
  const world = {};
  let alignmentIndex = Infinity;
  let sourceOwner;
  for (const role of ["source", "target"]) {
    const field = `/alignmentAnchors/${role}`;
    if (!alignmentAnchors[role] || typeof alignmentAnchors[role] !== "object" || Array.isArray(alignmentAnchors[role])) {
      conflicts.push(proposalField(field, "alignment-references-missing", `Expected an alignment ${role} record`));
      continue;
    }
    const { reference, position } = alignmentAnchors[role];
    const fixedPoint = role === "target" && reference === undefined;
    let anchor;
    if (!fixedPoint) {
      try { anchor = anchorReference(reference, role); }
      catch (error) { conflicts.push(proposalField(field + "/reference", "anchor-reference-invalid", error.message)); }
    }
    const validPosition = checkProposalVector(position, field + "/position", (path, message) =>
      conflicts.push(proposalField(path, "anchor-position-invalid", message, anchor?.instanceId)));
    if (!anchor) {
      if (fixedPoint && validPosition) world.target = position;
      continue;
    }
    const { instanceId, anchorId } = anchor;
    const steps = changesByInstance.get(instanceId) ?? [];
    if (role === "source") {
      sourceOwner = instanceId;
      // Alignment is the first transform of the source. A caller may append further edits.
      alignmentIndex = steps[0]?.index ?? Infinity;
    }
    const expected = position;
    const index = indices.get(instanceId);
    const context = { role, instanceId, reference, expected, space: role === "source" ? "local" : "world" };
    if (index === undefined || index === -1) {
      conflicts.push({ ...context, path: "/instances", reason: index === undefined ? "instance-missing" : "instance-ambiguous" });
      continue;
    }
    if (!validPosition || !Array.isArray(proposal.changes)) continue;
    const poseAvailable = !unavailablePoses.has(instanceId);
    if (!poseAvailable && !steps[0]?.expected) continue;
    const path = `/instances/${index}`;
    try {
      const original = buildAt(instanceId, steps[0]?.expected);
      const anchors = original.anchors[context.space];
      if (!Object.hasOwn(anchors, anchorId)) {
        conflicts.push({ ...context, path, reason: "anchor-missing" });
        continue;
      }
      const actual = anchors[anchorId];
      if (!actual.every((value, axis) => nearlyEqual(value, expected[axis], PLACEMENT_TOLERANCE))) {
        conflicts.push({ ...context, path, reason: "anchor-moved", actual });
        continue;
      }
      if (!poseAvailable) continue;
      const step = steps.findLast(step => step.index <= alignmentIndex);
      if (step && !step.proposed) continue;
      const aligned = step ? buildAt(instanceId, step.proposed) : original;
      if (!Object.hasOwn(aligned.anchors.world, anchorId)) {
        conflicts.push({ role, instanceId, reference, path, space: "world", reason: "anchor-missing" });
        continue;
      }
      world[role] = assertVec3(aligned.anchors.world[anchorId], reference);
    } catch (error) {
      conflicts.push({ ...context, path, reason: "anchor-unavailable", message: error.message });
    }
  }
  if (!conflicts.length && world.source && world.target) {
    const sourceRef = alignmentAnchors.source.reference;
    const measurement = measureAlignment(sourceRef, world.target, world.source);
    if (!reachesTarget(measurement)) {
      conflicts.push({ instanceId: sourceOwner, path: `/instances/${indices.get(sourceOwner)}`, reference: sourceRef,
        reason: "alignment-target-missed", measurement });
    }
  }
  return conflicts;
}

function distributionBoundsConflict(instanceId, index, axis, placement, builds) {
  const context = { instanceId, path: `/instances/${index}`, axis };
  if (!placement) {
    return { ...context, reason: "distribution-bounds-missing", message: "Regenerate the proposal to capture the axis and placement range" };
  }

  // Both sides use the proposed transform, including when the caller retries a completed placement.
  const expected = { min: placement.proposedMin, max: placement.proposedMin + placement.size };
  let bounds;
  try { bounds = builds.get(instanceId).bounds; }
  catch (error) { return { ...context, reason: "bounds-unavailable", expected, message: error.message }; }
  if (!bounds) return { ...context, reason: "bounds-missing", expected };
  const coordinate = AXIS_INDEX[axis];
  const actual = { min: bounds.min[coordinate], max: bounds.max[coordinate] };
  const actualSize = bounds.size[coordinate];
  const sizeChanged = !nearlyEqual(actualSize, placement.size, PLACEMENT_TOLERANCE);
  if (!nearlyEqual(actual.min, expected.min) || !nearlyEqual(actual.max, expected.max) || sizeChanged) {
    return { ...context, reason: "bounds-changed", expected, actual,
      ...(sizeChanged ? { expectedSize: placement.size, actualSize } : {}) };
  }
  return null;
}

export function applyChangesetProposal(document, proposal, registry) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw proposalConflictError([proposalField("", "proposal-invalid", "Expected a changeset proposal object")]);
  }
  const conflicts = [];
  if (proposal.kind !== "changeset-proposal") conflicts.push(proposalField("/kind", "proposal-kind-invalid", "Expected changeset-proposal"));
  const clone = structuredClone(document);
  const indices = new Map();
  for (const [index, instance] of clone.instances.entries()) {
    indices.set(instance.id, indices.has(instance.id) ? -1 : index);
  }
  const unavailablePoses = new Set();
  const changesByInstance = readProposalChanges(proposal.changes, conflicts);
  const alignment = proposal.intent === "align-anchors";
  const distribution = proposal.intent === "linear-distribution";
  if (alignment || distribution) registry ??= createDefaultRegistry();
  const currentBuilds = cachedBuilds(document.instances, indices, registry);
  const stagedBuilds = cachedBuilds(clone.instances, indices, registry);
  const layout = distribution ? readDistributionPlacements(proposal.facts?.placements, conflicts) : undefined;
  const axis = proposal.facts?.axis;
  const validAxis = typeof axis === "string" && Object.hasOwn(AXIS_INDEX, axis);
  const checkBounds = layout && validAxis && Array.isArray(proposal.facts?.placements) && Array.isArray(proposal.changes);
  if (layout) {
    if (!validAxis) conflicts.push(proposalField("/facts/axis", "distribution-bounds-missing", "Expected x, y, or z"));
    // A retry may omit a completed change. Its placement still determines the next gap.
    for (const id of layout.placements.keys()) if (!changesByInstance.has(id)) changesByInstance.set(id, []);
  }
  let changed = false;
  const moved = new Set();
  const verifiedPlacements = new Map();
  for (const [instanceId, steps] of changesByInstance) {
    const index = indices.get(instanceId);
    if (index === undefined || index === -1) {
      conflicts.push({ instanceId, path: "/instances", reason: index === undefined ? "instance-missing" : "instance-ambiguous" });
      for (const step of steps) conflicts.push(...step.beforeConflicts);
      unavailablePoses.add(instanceId);
      continue;
    }
    const instance = clone.instances[index];
    const path = `/instances/${index}/transform`;
    let actual;
    try {
      const transform = instance.transform;
      if (transform !== undefined && (!transform || typeof transform !== "object" || Array.isArray(transform))) {
        throw new TypeError("Expected a transform object");
      }
      actual = normalizeTransform(transform);
    } catch (error) {
      const field = (error.field ?? "transform").replaceAll(".", "/").replace(/\[(\d+)\]/g, "/$1");
      conflicts.push({ instanceId, path: `/instances/${index}/${field}`, reason: "transform-invalid", message: error.message });
      for (const step of steps) conflicts.push(...step.beforeConflicts);
      unavailablePoses.add(instanceId);
      continue;
    }
    const initial = actual;
    // A saved or retried scene can already be at an intermediate or final step.
    const completed = steps.findLastIndex(step => step.proposed && sameTransform(actual, step.proposed));
    for (const { change, proposed, expected, beforeConflicts } of steps.slice(completed + 1)) {
      if (beforeConflicts.length) {
        const pose = unavailablePoses.has(instanceId) ? {} : { actual, proposed };
        for (const issue of beforeConflicts) conflicts.push({ ...issue, scenePath: path, ...pose });
        unavailablePoses.add(instanceId);
      }
      if (!proposed) unavailablePoses.add(instanceId);
      if (unavailablePoses.has(instanceId)) continue;
      if (!sameTransform(actual, expected)) {
        conflicts.push({ instanceId, path, reason: "transform-changed", expected, actual, proposed });
        unavailablePoses.add(instanceId);
        continue;
      }
      instance.transform = structuredClone(change.after);
      actual = proposed;
      changed = true;
    }
    if (unavailablePoses.has(instanceId)) continue;
    if (checkBounds && layout.placements.get(instanceId) !== null) {
      const conflict = distributionBoundsConflict(instanceId, index, axis, layout.placements.get(instanceId), stagedBuilds);
      if (conflict) {
        conflicts.push(conflict);
        if (conflict.reason === "bounds-unavailable") unavailablePoses.add(instanceId);
      } else verifiedPlacements.set(instanceId, stagedBuilds.get(instanceId));
    }
    if (!sameTransform(initial, actual)) moved.add(instanceId);
  }
  if (layout && layout.order.length > 1) {
    const { gap } = proposal.facts;
    if (!Number.isFinite(gap) || gap < 0) {
      conflicts.push(proposalField("/facts/gap", "distribution-gap-missing", "Expected a finite non-negative gap"));
    } else if (validAxis) {
      for (const measurement of measureDistributionGaps(layout.order, verifiedPlacements, axis, gap)) {
        if (nearlyEqual(measurement.actual, gap, measurement.tolerance)) continue;
        const instanceId = measurement.toInstanceId;
        conflicts.push({ instanceId, path: `/instances/${indices.get(instanceId)}`, reason: "distribution-gap-missed", measurement });
      }
    }
  }
  if (alignment) {
    const buildAt = (id, transform) => {
      const index = indices.get(id);
      const original = document.instances[index];
      if (transform == null) return currentBuilds.get(id);
      const pose = normalizeTransform(transform);
      if (!unavailablePoses.has(id)) {
        if (sameTransform(pose, normalizeTransform(original.transform))) return currentBuilds.get(id);
        if (sameTransform(pose, normalizeTransform(clone.instances[index].transform))) return stagedBuilds.get(id);
      }
      return registry.build({ ...original, transform: pose });
    };
    conflicts.push(...alignmentConflicts(indices, proposal, changesByInstance, unavailablePoses, buildAt));
  }
  if (alignment || distribution) {
    conflicts.push(...connectionImpactConflicts(document, proposal, {
      moved, targets: changesByInstance, currentBuilds, stagedBuilds, unavailablePoses,
    }));
  }
  if (conflicts.length) throw proposalConflictError(conflicts);
  if (changed) {
    if (proposal.applied) throw new Error("proposal is already marked as applied");
    clone.revision = (document.revision ?? 0) + 1;
  }
  return clone;
}

function proposalConflictError(conflicts) {
  const ids = [...new Set(conflicts.map(c => c.instanceId).filter(Boolean))];
  const message = ids.length ? `Scene proposal conflicts with ${ids.join(", ")}` : "Invalid scene proposal";
  return Object.assign(new Error(message), { code: "SCENE_PROPOSAL_CONFLICT", conflicts });
}

function sameTransform(a, b) {
  return ["position", "rotation", "scale"].every(key => a[key].every((value, axis) => value === b[key][axis]));
}
