import { add, assertFiniteNumber, assertVec3 } from "./math.js";
import { analyzePath } from "./path.js";

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

function routeRadius(route) {
  const system = routeSystem(route);
  return assertFiniteNumber(route.radius ?? DEFAULT_ROUTE_RADII[system] ?? 0.045, `${route.id ?? "route"}.radius`, { min: 0, exclusiveMin: true });
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

function normalizeRoute(route, index) {
  if (!route || typeof route !== "object") throw new TypeError(`routes[${index}] must be an object`);
  const id = stableId(route.id, `route-${index + 1}`);
  const analysis = analyzePath(route.points);
  return {
    ...route,
    id,
    points: analysis.points,
    analysis,
    system: routeSystem(route),
    radius: routeRadius({ ...route, id }),
  };
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

export function generateMepRouteWithClips(request = {}) {
  const id = stableId(request.id, "mep-route-with-clips");
  const defaultClipSpacing = assertFiniteNumber(request.defaultClipSpacing ?? 0.7, "defaultClipSpacing", { min: 0, exclusiveMin: true });
  const routes = (request.routes ?? defaultRoughInRoutes()).map(normalizeRoute);
  const nodes = [];
  const anchors = {};
  const routeFacts = [];

  for (const route of routes) {
    const clipSpacing = assertFiniteNumber(route.clipSpacing ?? defaultClipSpacing, `${route.id}.clipSpacing`, { min: 0, exclusiveMin: true });
    const clipStartOffset = assertFiniteNumber(route.clipStartOffset ?? 0.16, `${route.id}.clipStartOffset`, { min: 0 });
    const clipEndOffset = assertFiniteNumber(route.clipEndOffset ?? 0.16, `${route.id}.clipEndOffset`, { min: 0 });
    const clipOffset = assertVec3(route.clipOffset ?? [0, Math.max(route.radius + 0.035, 0.08), 0], `${route.id}.clipOffset`);
    const clipPath = route.points.map(point => add(point, clipOffset));
    const clipSize = route.clipSize ?? [
      Math.max(route.radius * 3.2, 0.12),
      Math.max(route.radius * 1.2, 0.045),
      Math.max(route.radius * 4.6, 0.16),
    ];

    nodes.push({
      id: route.id,
      semanticType: routeSemanticType(route),
      geometry: { type: "tube-along", points: route.points, radius: route.radius, radialSegments: route.radialSegments ?? 28 },
      appearance: { color: routeColor(route), opacity: route.opacity ?? 1 },
      metadata: {
        system: route.system,
        generatedBy: "mep.route-with-clips",
        centerlineLength: Number(route.analysis.totalLength.toFixed(4)),
      },
    });

    if (route.generateClips !== false) {
      nodes.push({
        id: `${route.id}-clip`,
        semanticType: "mep.pipe-clip",
        geometry: { type: "box", size: clipSize },
        repetition: {
          type: "path",
          points: clipPath,
          spacing: clipSpacing,
          startOffset: clipStartOffset,
          endOffset: clipEndOffset,
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

    anchors[`${route.id}-start`] = { node: route.id, position: route.points[0], direction: [0, 0, -1], kind: "route-start" };
    anchors[`${route.id}-end`] = { node: route.id, position: route.points.at(-1), direction: [0, 0, 1], kind: "route-end" };
    routeFacts.push({
      id: route.id,
      system: route.system,
      length: route.analysis.totalLength,
      bendCount: route.analysis.bendCount,
      clipSpacing,
      clipPrototypeId: route.generateClips === false ? null : `${route.id}-clip`,
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
      parameters: {
        nodes,
        anchors,
        metrics: {
          method: "mep.route-with-clips",
          routeCount: routes.length,
          totalPipeLength: { value: Number(totalLength.toFixed(4)), unit: "m" },
          clipPolicy: "path repetition is preserved so agents can edit a route without losing the support rule",
        },
      },
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
