import { add, assertFiniteNumber, assertVec3, subtract } from "./math.js";
import { analyzePath } from "./path.js";
import { pipePorts } from "./pipe-ports.js";

const method = "mep.route-with-clips";
const rounded = length => Number(length.toFixed(4));

// Older generator documents stored the translated clip path and the original
// start port. Their difference recovers even a custom offset after a pipe edit.
function legacyBindings(spec) {
  if (spec.metrics?.method !== method) return;
  const generated = spec.nodes.filter(node => node?.metadata?.generatedBy === method);
  const clips = new Map(generated.filter(node => node.repetition?.type === "path")
    .map(node => [node.metadata.supportsRoute, node]));
  const pipes = generated.filter(node => node.geometry?.type === "tube-along");
  if (!pipes.length) return;
  return pipes.map(node => {
    const clip = clips.get(node.id);
    const start = spec.anchors?.[`${node.id}-start`];
    if (clip && !clip.parent && start?.node === node.id && start.kind === "route-start" &&
        Array.isArray(start.position) && Array.isArray(clip.repetition.points?.[0])) {
      return { node: node.id, clip: clip.id, clipOffset: subtract(clip.repetition.points[0], start.position) };
    }
    return { node: node.id };
  });
}

function throwIssue(path, message, nodeId) {
  throw Object.assign(new Error(`${path}: ${message}`), { code: "ROUTE_BINDING_INVALID", path, nodeId });
}

export function resolveMepRouteBindings(spec, report = throwIssue) {
  if (!Array.isArray(spec?.nodes)) return spec;
  const legacy = spec.routeBindings === undefined;
  const bindings = legacy ? legacyBindings(spec) : spec.routeBindings;
  if (bindings === undefined) return spec;
  if (!Array.isArray(bindings)) {
    report("/routeBindings", "Expected an array of route bindings");
    return spec;
  }
  const nodes = [...spec.nodes];
  const indices = new Map(nodes.map((node, i) => [node?.id, i]));
  const routes = new Map(), clipIds = new Set();
  let length = 0;
  for (const [i, binding] of bindings.entries()) {
    const path = "/routeBindings/" + i;
    const id = binding?.node;
    const index = indices.get(id);
    const pipe = nodes[index];
    if (typeof id !== "string" || pipe?.geometry?.type !== "tube-along" || pipe.repetition || routes.has(id)) {
      report(path + "/node", "Expected a unique, non-repeated tube-along node", id);
      continue;
    }
    let analysis, ports;
    try {
      analysis = analyzePath(pipe.geometry.points);
      assertFiniteNumber(analysis.totalLength, "centerline length");
    } catch (error) {
      report(`/nodes/${index}/geometry/points`, error.message, id);
      continue;
    }
    try {
      const radius = assertFiniteNumber(pipe.geometry.radius, "radius", { min: 0, exclusiveMin: true });
      ports = pipePorts(analysis.points, analysis.segments, assertFiniteNumber(radius * 2, "outside diameter"));
    } catch (error) {
      report(`/nodes/${index}/geometry/radius`, error.message, id);
      continue;
    }
    routes.set(id, ports);
    length += analysis.totalLength;
    nodes[index] = { ...pipe, metadata: { ...pipe.metadata, centerlineLength: rounded(analysis.totalLength) } };
    if (binding.clip === undefined) continue;
    const clipIndex = indices.get(binding.clip);
    const clip = nodes[clipIndex];
    if (typeof binding.clip !== "string" || clip?.repetition?.type !== "path" || clipIds.has(clip.id) ||
        (clip.parent !== id && !(legacy && !clip.parent))) {
      report(path + "/clip", "Expected a distinct path repetition parented to the route node", id);
      continue;
    }
    clipIds.add(clip.id);
    try {
      const offset = assertVec3(binding.clipOffset, "clipOffset");
      nodes[clipIndex] = {
        ...clip, parent: id,
        repetition: { ...clip.repetition, points: analysis.points.map(point => add(point, offset)) },
        metadata: { ...clip.metadata, supportsRoute: id, clipSpacing: clip.repetition.spacing },
      };
    } catch (error) {
      report(path + "/clipOffset", error.message, id);
    }
  }
  const anchors = spec.anchors && !Array.isArray(spec.anchors) && typeof spec.anchors === "object"
    ? Object.fromEntries(Object.entries(spec.anchors).map(([name, anchor]) => {
      const ports = routes.get(anchor?.node);
      const port = anchor?.kind === "route-start" ? ports?.start : anchor?.kind === "route-end" ? ports?.end : undefined;
      return [name, port ? { ...anchor, ...port, kind: anchor.kind } : anchor];
    }))
    : spec.anchors;
  return {
    ...spec, routeBindings: bindings, nodes, anchors,
    metrics: { ...spec.metrics, routeCount: routes.size, totalPipeLength: { ...spec.metrics?.totalPipeLength, value: rounded(length), unit: "m" } },
  };
}
