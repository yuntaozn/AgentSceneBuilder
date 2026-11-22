import { add, assertFiniteNumber, assertVec3 } from "./math.js";
import { analyzePath, pathSamplingEnd } from "./path.js";
import { resolveMepRouteBindings } from "./mep-route-bindings.js";

const DEFAULT_ROUTE_COLORS = {
  "cold-water": "#54a8ff",
  "hot-water": "#ff746c",
  "strong-electric": "#f5c84b",
  "weak-electric": "#71d3a8",
  drain: "#8d98a4",
  conduit: "#c8f24d",
};

const DEFAULT_ROUTE_RADII = {
  "cold-water": 0.055,
  "hot-water": 0.055,
  "strong-electric": 0.045,
  "weak-electric": 0.04,
  drain: 0.05,
  conduit: 0.04,
};

function stableId(value, fallback) {
  if (typeof value === "string" && /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(value)) return value;
  return fallback;
}

function routeSystem(route) {
  return typeof route.system === "string" && route.system ? route.system : "conduit";
}

function routeColor(route) {
  return route.color ?? DEFAULT_ROUTE_COLORS[routeSystem(route)] ?? "#c8f24d";
}

function routeSemanticType(route) {
  const system = routeSystem(route);
  if (system === "cold-water") return "mep.water.cold";
  if (system === "hot-water") return "mep.water.hot";
  if (system === "strong-electric") return "mep.electrical.strong";
  if (system === "weak-electric") return "mep.electrical.weak";
  if (system === "drain") return "mep.drain.pipe";
  return "mep.conduit";
}

function routeIssue(path, message, routeId, details) {
  return {
    code: "MEP_ROUTE_INVALID", path, message: routeId ? `${routeId}: ${message}` : message,
    ...(routeId ? { routeId } : {}), ...details,
  };
}

function routeFieldReader(issues, base, id) {
  return (field, validate, details) => {
    try { return validate(); }
    catch (error) { issues.push(routeIssue(base + "/" + field, error.message, id, details)); }
  };
}

function readRouteVector(read, field, value, limits) {
  const label = field.replace(/\/(\d+)/g, "[$1]");
  if (!Array.isArray(value) || value.length !== 3) return read(field, () => assertVec3(value, label));
  const vector = Array.from(value, (coordinate, axis) =>
    read(field + "/" + axis, () => assertFiniteNumber(coordinate, `${label}[${axis}]`, limits)));
  if (!vector.includes(undefined)) return vector;
}

function readCenterline(read, points) {
  if (!Array.isArray(points) || points.length < 2) {
    read("points", () => analyzePath(points));
    if (!Array.isArray(points)) return;
  }
  const checked = Array.from(points, (point, index) => readRouteVector(read, "points/" + index, point));
  if (checked.length < 2 || checked.includes(undefined)) return;
  return read("points", () => {
    const analysis = analyzePath(checked);
    assertFiniteNumber(analysis.totalLength, "centerline length");
    return analysis;
  });
}

function readRouteClip(route, read, analysis, radius) {
  const startOffset = read("clipStartOffset", () => assertFiniteNumber(route.clipStartOffset ?? 0.16, "clipStartOffset", { min: 0 }));
  const endOffset = read("clipEndOffset", () => assertFiniteNumber(route.clipEndOffset ?? 0.16, "clipEndOffset", { min: 0 }));
  let samplingEnd;
  if (analysis && startOffset !== undefined && endOffset !== undefined) {
    const length = analysis.totalLength;
    samplingEnd = read("clipEndOffset", () => pathSamplingEnd(length, startOffset, endOffset), { length, startOffset, endOffset });
  }

  let offset, size;
  if (route.clipOffset != null || radius !== undefined) {
    offset = readRouteVector(read, "clipOffset", route.clipOffset ?? [0, Math.max(radius + 0.035, 0.08), 0]);
  }
  if (analysis && offset) {
    // Translation can round distinct centerline points to the same coordinate.
    read("clipOffset", () => {
      const shifted = analyzePath(analysis.points.map(point => add(point, offset)));
      if (samplingEnd !== undefined) pathSamplingEnd(shifted.totalLength, startOffset, endOffset);
    });
  }
  if (route.clipSize != null || radius !== undefined) {
    size = readRouteVector(read, "clipSize", route.clipSize ?? [
      Math.max(radius * 3.2, 0.12), Math.max(radius * 1.2, 0.045), Math.max(radius * 4.6, 0.16),
    ], { min: 0, exclusiveMin: true });
  }
  return { startOffset, endOffset, offset, size };
}

function allocateId(base, used) {
  let id = base;
  for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function defaultRoughInRoutes() {
  return [
    {
      id: "cold-water",
      system: "cold-water",
      points: [[-2.8, 0.35, -1.4], [-2.8, 2.1, -1.4], [-2.15, 2.55, -0.75], [2.8, 2.55, -0.75]],
      clipSpacing: 0.72,
    },
    {
      id: "hot-water",
      system: "hot-water",
      points: [[-2.2, 0.35, -1.4], [-2.2, 2.05, -1.4], [-1.55, 2.45, -0.15], [2.8, 2.45, -0.15]],
      clipSpacing: 0.72,
    },
    {
      id: "strong-electric",
      system: "strong-electric",
      points: [[-3.15, 0.5, 1.25], [-3.15, 2.05, 1.25], [-2.35, 2.65, 0.75], [2.65, 2.65, 0.75]],
      clipSpacing: 0.68,
    },
    {
      id: "weak-electric",
      system: "weak-electric",
      points: [[-2.7, 0.5, 1.58], [-2.7, 2, 1.58], [-1.65, 2.78, 1.18], [2.65, 2.78, 1.18]],
      clipSpacing: 0.68,
    },
    {
      id: "floor-drain",
      system: "drain",
      points: [[-1.25, 0.08, -2.1], [0.75, 0.06, -2.0], [2.6, 0.035, -1.45], [3.75, 0.015, -0.85]],
      clipSpacing: 0.95,
      clipOffset: [0, 0.09, 0],
    },
  ];
}

function readRouteRequest(request, issues) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    issues.push(routeIssue("", "Expected a route request object"));
    return;
  }
  const readRoot = routeFieldReader(issues, "");
  const defaultClipSpacing = readRoot("defaultClipSpacing", () =>
    assertFiniteNumber(request.defaultClipSpacing ?? 0.7, "defaultClipSpacing", { min: 0, exclusiveMin: true }));
  const routes = request.routes ?? defaultRoughInRoutes();
  if (!Array.isArray(routes)) {
    issues.push(routeIssue("/routes", "Expected an array of routes"));
    return;
  }
  const explicitIds = new Map();
  const ids = Array.from(routes, (route, index) => {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      issues.push(routeIssue(`/routes/${index}`, "Expected a route object"));
      return null;
    }
    const id = stableId(route.id);
    if (id && explicitIds.has(id)) {
      const firstPath = `/routes/${explicitIds.get(id)}/id`;
      issues.push(routeIssue(`/routes/${index}/id`, `Duplicate route ID, first used at ${firstPath}`, id, { firstPath }));
    } else if (id) explicitIds.set(id, index);
    return id;
  });
  const reserved = new Set(explicitIds.keys());
  return ids.map((id, index) => {
    if (id === null) return;
    id ??= allocateId(`route-${index + 1}`, reserved);
    const input = routes[index];
    const route = { ...input, id, system: routeSystem(input) };
    const read = routeFieldReader(issues, `/routes/${index}`, id);
    const analysis = readCenterline(read, route.points);
    const radius = read("radius", () => {
      const value = assertFiniteNumber(route.radius ?? DEFAULT_ROUTE_RADII[route.system] ?? 0.045, "radius", { min: 0, exclusiveMin: true });
      assertFiniteNumber(value * 2, "outside diameter");
      return value;
    });
    const radialSegments = read("radialSegments", () => {
      const count = assertFiniteNumber(route.radialSegments ?? 28, "radialSegments", { min: 3 });
      if (!Number.isInteger(count)) throw new RangeError("radialSegments must be an integer");
      return count;
    });
    const clipSpacing = route.clipSpacing == null ? defaultClipSpacing : read("clipSpacing", () =>
      assertFiniteNumber(route.clipSpacing, "clipSpacing", { min: 0, exclusiveMin: true }));
    const clip = route.generateClips === false ? null : readRouteClip(route, read, analysis, radius);
    return { ...route, analysis, radius, radialSegments, clipSpacing, clip };
  });
}

export function generateMepRouteWithClips(request = {}) {
  const issues = [];
  const routes = readRouteRequest(request, issues);
  if (issues.length) {
    const { code, message, ...details } = issues[0];
    throw Object.assign(new Error(message), { code, details, issues });
  }
  const id = stableId(request.id, "mep-route-with-clips");
  const reserved = new Set(routes.map(route => route.id));
  // Repetitions emit <prototype>.<zero-padded index>. Reserve those namespaces
  // even if the current path is too short to reach a particular index yet.
  for (const { id } of routes) if (/\.\d{3,}$/.test(id)) reserved.add(id.slice(0, id.lastIndexOf(".")));
  const nodes = [];
  const anchors = {};
  const routeBindings = [];
  const routeFacts = [];

  for (const route of routes) {
    const { analysis, radialSegments, clipSpacing, clip } = route;
    const binding = { node: route.id };
    routeBindings.push(binding);

    nodes.push({
      id: route.id,
      semanticType: routeSemanticType(route),
      geometry: { type: "tube-along", points: analysis.points, radius: route.radius, radialSegments },
      appearance: { color: routeColor(route), opacity: route.opacity ?? 1 },
      metadata: {
        system: route.system,
        generatedBy: "mep.route-with-clips",
      },
    });

    if (clip) {
      binding.clip = allocateId(`${route.id}-clip`, reserved);
      binding.clipOffset = clip.offset;
      nodes.push({
        id: binding.clip,
        parent: route.id,
        semanticType: "mep.pipe-clip",
        geometry: { type: "box", size: clip.size },
        repetition: {
          type: "path",
          spacing: clipSpacing,
          startOffset: clip.startOffset,
          endOffset: clip.endOffset,
          includeEnd: route.includeClipEnd ?? true,
        },
        orientation: { mode: "tangent", localAxis: [1, 0, 0] },
        appearance: { color: route.clipColor ?? "#d8e1e6", opacity: route.clipOpacity ?? 1 },
        metadata: {
          system: route.system,
          generatedBy: "mep.route-with-clips",
          supportsRoute: route.id,
          clipSpacing,
        },
      });
    }

    anchors[`${route.id}-start`] = { node: route.id, kind: "route-start" };
    anchors[`${route.id}-end`] = { node: route.id, kind: "route-end" };
    routeFacts.push({
      id: route.id,
      system: route.system,
      length: analysis.totalLength,
      bendCount: analysis.bendCount,
      clipSpacing,
      clipPrototypeId: binding.clip ?? null,
    });
  }

  const totalLength = routeFacts.reduce((sum, route) => sum + route.length, 0);
  return {
    kind: "mep-route-with-clips",
    method: "mep.route-with-clips",
    routeCount: routes.length,
    totalLength,
    routes: routeFacts,
    composition: {
      id,
      component: "core.composition",
      parameters: resolveMepRouteBindings({
        nodes, anchors, routeBindings,
        metrics: {
          method: "mep.route-with-clips",
          clipPolicy: "path repetition is preserved so agents can edit a route without losing the support rule",
        },
      }),
    },
  };
}

export function analyzeDrainSlope(points, { minSlope = 0.005, maxSlope = 0.03, flowDirection = "forward", tolerance = 1e-9 } = {}) {
  const minimum = assertFiniteNumber(minSlope, "minSlope", { min: 0 });
  const maximum = assertFiniteNumber(maxSlope, "maxSlope", { min: minimum });
  if (!["forward", "reverse"].includes(flowDirection)) throw new TypeError("flowDirection must be forward or reverse");
  const analysis = analyzePath(points, { tolerance });
  const factor = flowDirection === "forward" ? 1 : -1;
  let totalHorizontal = 0;
  let totalFall = 0;
  const segments = analysis.segments.map((segment) => {
    const horizontal = Math.hypot(segment.delta[0], segment.delta[2]);
    const fall = factor * (segment.start[1] - segment.end[1]);
    const slope = horizontal > tolerance ? fall / horizontal : null;
    let status = "not-graded";
    if (slope !== null) {
      if (slope < 0) status = "reverse-fall";
      else if (slope < minimum) status = "too-flat";
      else if (slope > maximum) status = "too-steep";
      else status = "ok";
      totalHorizontal += horizontal;
      totalFall += fall;
    }
    return {
      index: segment.index,
      start: segment.start,
      end: segment.end,
      horizontal,
      fall,
      slope,
      percent: slope === null ? null : slope * 100,
      status,
    };
  });
  const averageSlope = totalHorizontal > tolerance ? totalFall / totalHorizontal : null;
  const issues = segments
    .filter(segment => !["ok", "not-graded"].includes(segment.status))
    .map(segment => ({
      code: `DRAIN_SLOPE_${segment.status.toUpperCase().replaceAll("-", "_")}`,
      segmentIndex: segment.index,
      message: `Drain segment ${segment.index} is ${segment.status}.`,
    }));
  return {
    kind: "mep-drain-slope-check",
    method: "mep.drain-slope-check",
    minSlope: minimum,
    maxSlope: maximum,
    flowDirection,
    totalHorizontal,
    totalFall,
    averageSlope,
    ok: issues.length === 0 && segments.some(segment => segment.status === "ok"),
    segments,
    issues,
  };
}

export function generateMepPressureTestLoop(request = {}) {
  const id = stableId(request.id, "mep-pressure-test-loop");
  const hotPort = assertVec3(request.hotPort ?? [-1.6, 0.78, -0.35], "hotPort");
  const coldPort = assertVec3(request.coldPort ?? [-1.6, 0.78, -1], "coldPort");
  const pumpPosition = assertVec3(request.pumpPosition ?? [0.65, 0.2, -0.65], "pumpPosition");
  const bucketPosition = assertVec3(request.bucketPosition ?? [1.7, 0.43, -0.8], "bucketPosition");
  const gaugePosition = assertVec3(request.gaugePosition ?? [pumpPosition[0], pumpPosition[1] + 0.62, pumpPosition[2] + 0.38], "gaugePosition");
  const coldHose = request.coldHose ?? [
    [bucketPosition[0], bucketPosition[1] + 0.45, bucketPosition[2]],
    [pumpPosition[0] + 0.6, pumpPosition[1] + 0.45, pumpPosition[2] - 0.05],
    [pumpPosition[0], pumpPosition[1] + 0.24, pumpPosition[2]],
    coldPort,
  ];
  const hotHose = request.hotHose ?? [
    [pumpPosition[0], pumpPosition[1] + 0.24, pumpPosition[2]],
    [(pumpPosition[0] + hotPort[0]) / 2, pumpPosition[1] + 0.45, (pumpPosition[2] + hotPort[2]) / 2],
    hotPort,
  ];
  const coldAnalysis = analyzePath(coldHose);
  const hotAnalysis = analyzePath(hotHose);
  const targetPressure = assertFiniteNumber(request.targetPressureMpa ?? 0.8, "targetPressureMpa", { min: 0 });
  const holdMinutes = assertFiniteNumber(request.holdMinutes ?? 30, "holdMinutes", { min: 0 });

  const composition = {
    id,
    component: "core.composition",
    parameters: {
      nodes: [
        { id: "bucket", semanticType: "equipment.water-bucket", geometry: { type: "cylinder", radius: 0.52, height: 0.86, radialSegments: 32 }, transform: { position: bucketPosition }, appearance: { color: "#59646b", opacity: 1 } },
        { id: "pump", semanticType: "equipment.pressure-pump", geometry: { type: "box", size: [0.9, 0.32, 0.58] }, transform: { position: pumpPosition }, appearance: { color: "#d6a83e", opacity: 1 } },
        { id: "cold-hose", semanticType: "mep.pressure-test.hose.cold", geometry: { type: "tube-along", points: coldHose, radius: 0.03, radialSegments: 18 }, appearance: { color: "#54a8ff", opacity: 1 } },
        { id: "hot-hose", semanticType: "mep.pressure-test.hose.hot", geometry: { type: "tube-along", points: hotHose, radius: 0.026, radialSegments: 18 }, appearance: { color: "#ff746c", opacity: 1 } },
        { id: "gauge-face", semanticType: "instrument.pressure-gauge", geometry: { type: "cylinder", radius: 0.25, height: 0.06, radialSegments: 40 }, transform: { position: gaugePosition, rotation: [1.5708, 0, 0] }, appearance: { color: "#e8edf0", opacity: 1 } },
        { id: "gauge-rim", semanticType: "instrument.pressure-gauge.rim", geometry: { type: "torus", majorRadius: 0.25, tubeRadius: 0.025, radialSegments: 12, tubularSegments: 40 }, transform: { position: [gaugePosition[0], gaugePosition[1], gaugePosition[2] + 0.035], rotation: [1.5708, 0, 0] }, appearance: { color: "#8d9ba3", opacity: 1 } },
        { id: "gauge-needle", semanticType: "instrument.pressure-gauge.needle", geometry: { type: "box", size: [0.025, 0.2, 0.018] }, transform: { position: [gaugePosition[0] + 0.04, gaugePosition[1] + 0.06, gaugePosition[2] + 0.07], rotation: [0, 0, -0.55] }, appearance: { color: "#e05252", opacity: 1 } },
        { id: "cold-adapter", semanticType: "mep.pressure-test.adapter", geometry: { type: "cylinder-between", start: [coldPort[0], coldPort[1] - 0.08, coldPort[2]], end: [coldPort[0], coldPort[1] + 0.08, coldPort[2]], radius: 0.055, radialSegments: 20 }, appearance: { color: "#91a2ad", opacity: 1 } },
        { id: "hot-adapter", semanticType: "mep.pressure-test.adapter", geometry: { type: "cylinder-between", start: [hotPort[0], hotPort[1] - 0.08, hotPort[2]], end: [hotPort[0], hotPort[1] + 0.08, hotPort[2]], radius: 0.055, radialSegments: 20 }, appearance: { color: "#91a2ad", opacity: 1 } },
      ],
      anchors: {
        "cold-port": { node: "cold-hose", position: coldPort, direction: [-1, 0, 0], kind: "pipe-port" },
        "hot-port": { node: "hot-hose", position: hotPort, direction: [-1, 0, 0], kind: "pipe-port" },
        "gauge-read": { node: "gauge-face", position: gaugePosition, direction: [0, 0, 1], kind: "inspection-point" },
      },
      metrics: {
        method: "mep.pressure-test-loop",
        targetPressureMpa: targetPressure,
        holdMinutes,
        hoseLength: { value: Number((coldAnalysis.totalLength + hotAnalysis.totalLength).toFixed(4)), unit: "m" },
      },
      annotations: [
        { id: "pressure-target", text: `目标压力 ${targetPressure} MPa / 保压 ${holdMinutes} min`, position: [gaugePosition[0], gaugePosition[1] + 0.45, gaugePosition[2] + 0.15] },
      ],
    },
  };

  return {
    kind: "mep-pressure-test-loop",
    method: "mep.pressure-test-loop",
    targetPressureMpa: targetPressure,
    holdMinutes,
    hoseLength: coldAnalysis.totalLength + hotAnalysis.totalLength,
    ports: { hotPort, coldPort },
    composition,
  };
}
