import { assertVec3 } from "./math.js";

const axes = new Map([["x", 0], ["y", 1], ["z", 2]]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function throwIssue(path, message, nodeId) {
  throw Object.assign(new Error(`${path}: ${message}`), { code: "POSE_CONTROL_INVALID", path, nodeId });
}

export function resolvePoseControls(spec, report = throwIssue) {
  if (!Array.isArray(spec?.nodes) || spec.poseControls === undefined) return spec;
  if (!Array.isArray(spec.poseControls)) {
    report("/poseControls", "Expected an array of pose controls");
    return spec;
  }
  if (!spec.poseControls.length) return spec;

  const nodes = [...spec.nodes];
  const indices = new Map();
  nodes.forEach((node, index) => {
    if (typeof node?.id === "string") indices.set(node.id, indices.has(node.id) ? -1 : index);
  });
  const ids = new Set(), targets = new Set();
  for (const [index, control] of spec.poseControls.entries()) {
    const path = `/poseControls/${index}`;
    if (!isObject(control)) {
      report(path, "Expected a pose control object");
      continue;
    }
    const { id, label, unit, value, min, max } = control;
    if (typeof id !== "string" || !id.trim() || ids.has(id)) report(path + "/id", "Expected a unique non-empty control ID");
    else ids.add(id);
    for (const [field, text] of [["label", label], ["unit", unit]]) {
      if (text !== undefined && (typeof text !== "string" || !text.trim())) report(path + "/" + field, "Expected a non-empty string");
    }
    const validMin = Number.isFinite(min);
    const validMax = Number.isFinite(max) && (!validMin || max >= min);
    const validValue = Number.isFinite(value) && (!validMin || value >= min) && (!validMax || value <= max);
    if (!validMin) report(path + "/min", "Expected a finite lower bound");
    if (!validMax) report(path + "/max", "Expected a finite upper bound greater than or equal to min");
    if (!validValue) report(path + "/value", "Expected a finite value within the declared range");
    if (!Array.isArray(control.targets) || !control.targets.length) {
      report(path + "/targets", "Expected at least one pose target");
      continue;
    }

    for (const [targetIndex, target] of control.targets.entries()) {
      const targetPath = `${path}/targets/${targetIndex}`;
      if (!isObject(target)) {
        report(targetPath, "Expected a pose target object");
        continue;
      }
      const { node: nodeId, property, axis, factor = 1 } = target;
      const nodeIndex = indices.get(nodeId);
      const node = nodes[nodeIndex];
      const validProperty = property === "position" || property === "rotation";
      const axisIndex = axes.get(axis);
      const validFactor = Number.isFinite(factor) && factor !== 0;
      if (!node) report(targetPath + "/node", "Expected an existing, unambiguous target node", nodeId);
      if (!validProperty) report(targetPath + "/property", "Expected position or rotation", nodeId);
      if (axisIndex === undefined) report(targetPath + "/axis", "Expected x, y or z", nodeId);
      if (!validFactor) report(targetPath + "/factor", "Expected a finite non-zero multiplier", nodeId);
      if (!node || !validProperty || axisIndex === undefined || !validFactor) continue;

      const key = `${nodeIndex}/${property}/${axis}`;
      if (targets.has(key)) {
        report(targetPath, "This node, property and axis are already controlled", nodeId);
        continue;
      }
      targets.add(key);
      if (!validMin || !validMax || !validValue || (node.transform !== undefined && !isObject(node.transform))) continue;
      const base = node.transform?.[property] ?? (property === "position" ? node.position : undefined) ?? [0, 0, 0];
      // Leave malformed authored transforms for the standard transform diagnostics.
      let vector;
      try { vector = assertVec3(base, property); } catch { continue; }
      vector[axisIndex] += value * factor;
      if (!Number.isFinite(vector[axisIndex])) {
        report(targetPath + "/factor", "The resulting transform component must be finite", nodeId);
        continue;
      }
      nodes[nodeIndex] = { ...node, transform: { ...node.transform, [property]: vector } };
    }
  }
  return { ...spec, nodes };
}
