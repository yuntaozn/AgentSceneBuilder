import { add, cross, dot, length, normalizeVector, scale, subtract } from "./math.js";

const units = new Map([["strain", "με"], ["displacement", "mm"], ["acceleration", "m/s²"], ["tilt", "°"]]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const nonnegative = value => Number.isFinite(value) && value >= 0;
const positive = value => Number.isFinite(value) && value > 0;

export function checkMonitoring(spec, getAnchor, report) {
  const monitoring = spec.monitoring;
  if (monitoring === undefined) return;
  const root = "/monitoring";
  if (!object(monitoring)) {
    report(root, "Expected a monitoring case object");
    return;
  }
  const nodes = new Map((Array.isArray(spec.nodes) ? spec.nodes : []).filter(object).map(node => [node.id, node]));
  const moving = new Set();
  for (const field of ["id", "label"]) {
    if (!text(monitoring[field])) report(root + "/" + field, "Expected a non-empty string");
  }
  if (!positive(monitoring.stepSeconds) || monitoring.stepSeconds < 0.05 ||
      !Number.isFinite(monitoring.stepSeconds * 120)) report(root + "/stepSeconds", "Expected a finite sample interval of at least 0.05 s");
  if (!Array.isArray(monitoring.loadRatios) || monitoring.loadRatios.length < 3 || monitoring.loadRatios.length > 121) {
    report(root + "/loadRatios", "Expected 3 to 121 load samples");
  } else {
    monitoring.loadRatios.forEach((value, index) => {
      if (!nonnegative(value) || value > 1 || (index === 0 && value !== 0)) {
        report(root + "/loadRatios/" + index, index === 0 ? "The first sample must start at zero load" : "Expected a load ratio between 0 and 1");
      }
    });
  }
  const displayScale = monitoring.displayScale ?? 1;
  if (!positive(displayScale) || displayScale > 20) report(root + "/displayScale", "Expected a display scale greater than 0 and at most 20");
  if (!Array.isArray(monitoring.motions) || !monitoring.motions.length) {
    report(root + "/motions", "Expected at least one full-load motion");
  } else {
    for (const [index, motion] of monitoring.motions.entries()) {
      const path = root + "/motions/" + index;
      const node = nodes.get(motion?.node);
      if (!object(motion) || !node || moving.has(motion.node)) {
        report(path + (object(motion) ? "/node" : ""), "Expected a unique existing motion node", motion?.node);
        continue;
      }
      moving.add(node.id);
      const fields = ["position", "rotation", "pathOffsets"].filter(field => Object.hasOwn(motion, field));
      if (!fields.length) report(path, "Expected a position, rotation or sweep path offset", node.id);
      for (const field of fields) {
        const value = motion[field];
        const valid = field === "pathOffsets"
          ? node.geometry?.type === "sweep" && Array.isArray(value) &&
            value.length === node.geometry.points?.length && value.every(vector)
          : vector(value);
        if (!valid) report(path + "/" + field, field === "pathOffsets"
          ? "Expected one finite offset vector per sweep path point"
          : "Expected a finite xyz offset vector", node.id);
      }
    }
  }
  if (!Array.isArray(monitoring.points) || !monitoring.points.length || monitoring.points.length > 64) {
    report(root + "/points", "Expected 1 to 64 measurement points");
    return;
  }
  const names = new Set();
  const sharesMotion = anchor => {
    const visited = new Set();
    for (let id = anchor.node; id && !visited.has(id); id = nodes.get(id)?.parent) {
      if (moving.has(id)) return true;
      visited.add(id);
    }
    return false;
  };
  for (const [index, point] of monitoring.points.entries()) {
    const path = root + "/points/" + index;
    if (!object(point)) {
      report(path, "Expected a measurement point object");
      continue;
    }
    if (!text(point.id) || names.has(point.id)) report(path + "/id", "Expected a unique non-empty measurement point ID");
    else names.add(point.id);
    if (!text(point.label)) report(path + "/label", "Expected a non-empty string");
    if (!units.has(point.kind)) report(path + "/kind", "Expected strain, displacement, acceleration or tilt");
    if (point.member !== undefined && !nodes.has(point.member)) report(path + "/member", "Expected an existing measured member node");
    function anchor(field, { direction = false, node = true } = {}) {
      const value = text(point[field]) ? getAnchor(point[field]) : undefined;
      if (!value || node && !value.node || direction && !value.direction) {
        report(path + "/" + field, `Expected an existing ${direction ? "directional " : ""}anchor${node ? " attached to a node" : ""}`);
        return;
      }
      return value;
    }
    const sensor = anchor("sensor", { direction: true });
    const target = anchor("target", { direction: true });
    const tolerance = point.mountTolerance ?? 0.002;
    if (!nonnegative(tolerance)) report(path + "/mountTolerance", "Expected a finite non-negative mounting tolerance in metres");
    if (sensor && target) {
      if (length(subtract(sensor.position, target.position)) > tolerance) {
        report(path + "/sensor", "Sensor anchor is outside the target mounting tolerance", sensor.node);
      }
      if (dot(sensor.direction, target.direction) < Math.cos(Math.PI / 36)) {
        report(path + "/sensor", "Measurement axis differs from the target direction by more than 5°", sensor.node);
      }
    }
    if (point.kind === "strain" && !Number.isFinite(point.fullLoadValue)) {
      report(path + "/fullLoadValue", "Expected a finite full-load strain in microstrain");
    }
    if (point.kind === "displacement") {
      const reference = anchor("reference");
      if (reference && (sharesMotion(reference) || reference.node === target?.node)) {
        report(path + "/reference", "The displacement reference must have an independent fixed frame", reference.node);
      }
    }
    if (point.kind === "tilt") {
      const orientation = anchor("orientation", { direction: true });
      if (sensor && orientation && Math.abs(dot(sensor.direction, orientation.direction)) > 1e-6) {
        report(path + "/orientation", "The orientation anchor must be perpendicular to the rotation axis", orientation.node);
      }
    }
    if (!positive(point.limit)) report(path + "/limit", "Expected a positive absolute alarm limit");
    if (!nonnegative(point.holdSeconds)) report(path + "/holdSeconds", "Expected a finite non-negative hold time");
  }
}

// Build the selected pose from the authored source each time. Display exaggeration
// belongs to the preview only and never modifies the numerical analysis.
export function monitoringFrameDocument(document, ratio, { display = false } = {}) {
  if (!nonnegative(ratio) || ratio > 1) throw new RangeError("Expected a load ratio between 0 and 1");
  if (!document.parameters?.monitoring) throw new Error("This composition has no monitoring case");
  const { monitoring, ...parameters } = document.parameters;
  if (ratio === 0) return { ...document, parameters };
  const amount = ratio * (display ? monitoring.displayScale ?? 1 : 1);
  const motions = new Map(monitoring.motions.map(motion => [motion.node, motion]));
  const nodes = parameters.nodes.map(node => {
    const motion = motions.get(node.id);
    if (!motion) return node;
    const transform = { ...node.transform };
    for (const field of ["position", "rotation"]) {
      if (motion[field]) {
        const source = transform[field] ?? (field === "position" ? node.position : null) ?? [0, 0, 0];
        transform[field] = add(source, scale(motion[field], amount));
      }
    }
    const geometry = motion.pathOffsets ? {
      ...node.geometry,
      points: node.geometry.points.map((point, index) => add(point, scale(motion.pathOffsets[index], amount))),
    } : node.geometry;
    return { ...node, transform, ...(geometry ? { geometry } : {}) };
  });
  return { ...document, parameters: { ...parameters, nodes } };
}

export function analyzeMonitoring(document, registry, { pointId, baseline = registry.build(document) } = {}) {
  const monitoring = document.parameters?.monitoring;
  if (!monitoring) throw new Error("This composition has no monitoring case");
  const { id, label, loadRatios, stepSeconds, displayScale = 1 } = monitoring;
  const points = pointId === undefined ? monitoring.points : monitoring.points.filter(point => point.id === pointId);
  if (!points.length) throw new Error(`Unknown measurement point: ${pointId}`);
  const builds = new Map([[0, baseline.anchors.worldDefinitions]]);
  const frames = loadRatios.map((loadRatio, index) => {
    if (!builds.has(loadRatio)) {
      builds.set(loadRatio, registry.build(monitoringFrameDocument(document, loadRatio)).anchors.worldDefinitions);
    }
    return { timeSeconds: index * stepSeconds, loadRatio, anchors: builds.get(loadRatio) };
  });
  const initial = frames[0].anchors;
  const alarms = [];
  const series = points.map(point => {
    const { id, label, kind, sensor, target, reference, orientation, limit, holdSeconds, fullLoadValue } = point;
    const { position, direction: axis, node: sensorNode } = initial[sensor];
    function readValue(frame, index) {
      if (kind === "strain") return fullLoadValue * frame.loadRatio;
      if (kind === "tilt") {
        const base = initial[orientation].direction, next = frame.anchors[orientation].direction;
        return Math.atan2(dot(axis, cross(base, next)), dot(base, next)) * 180 / Math.PI;
      }
      if (kind === "displacement") {
        const current = subtract(frame.anchors[target].position, frame.anchors[reference].position);
        const zero = subtract(initial[target].position, initial[reference].position);
        return dot(subtract(current, zero), axis) * 1000;
      }
      if (index === 0 || index === frames.length - 1) return null;
      const previous = frames[index - 1].anchors[target].position;
      const current = frame.anchors[target].position;
      const next = frames[index + 1].anchors[target].position;
      return dot(add(subtract(previous, current), subtract(next, current)), axis) / stepSeconds / stepSeconds;
    }
    let aboveSince, active = false;
    const samples = frames.map((frame, index) => {
      const value = readValue(frame, index);
      if (value !== null && !Number.isFinite(value)) throw new RangeError(`Non-finite measurement for ${id} at sample ${index}`);
      const above = value !== null && Math.abs(value) > limit;
      aboveSince = above ? aboveSince ?? index : undefined;
      const elapsedSeconds = above ? (index - aboveSince) * stepSeconds : 0;
      const alarm = above && elapsedSeconds + Number.EPSILON * Math.max(1, holdSeconds) >= holdSeconds;
      if (alarm && !active) alarms.push({ pointId: id, sampleIndex: index, timeSeconds: frame.timeSeconds,
        firstAboveSeconds: frames[aboveSince].timeSeconds, value, unit: units.get(kind), limit, holdSeconds });
      active = alarm;
      return { timeSeconds: frame.timeSeconds, value, state: value === null ? "unavailable" : alarm ? "alarm" : above ? "above-limit" : "normal" };
    });
    return { pointId: id, label, kind, unit: units.get(kind), sensor, target, ...(reference ? { reference } : {}),
      sensorNode, targetNode: point.member ?? initial[target].node, position, axis, limit, holdSeconds, samples };
  });
  alarms.sort((a, b) => a.sampleIndex - b.sampleIndex || a.pointId.localeCompare(b.pointId, "en"));
  return { kind: "monitoring-analysis", caseId: id, label, stepSeconds, displayScale,
    frames: frames.map(({ timeSeconds, loadRatio }) => ({ timeSeconds, loadRatio })), series, alarms };
}
