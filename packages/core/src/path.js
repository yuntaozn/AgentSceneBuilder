import { assertFiniteNumber, assertVec3, length, normalizeVector, subtract } from "./math.js";

const AXES = ["x", "y", "z"];

function cleanPoints(points, tolerance = 1e-9) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("path must contain at least two points");
  const clean = [];
  for (const [index, value] of points.entries()) {
    const point = assertVec3(value, `path[${index}]`);
    if (!clean.length || length(subtract(point, clean.at(-1))) > tolerance) clean.push(point);
  }
  if (clean.length < 2) throw new RangeError("path must contain at least two distinct points");
  return clean;
}

function segmentAxis(delta, tolerance) {
  const active = delta
    .map((value, index) => ({ value: Math.abs(value), axis: AXES[index] }))
    .filter((item) => item.value > tolerance);
  return active.length === 1 ? active[0].axis : null;
}

export function analyzePath(points, { tolerance = 1e-9 } = {}) {
  assertFiniteNumber(tolerance, "tolerance", { min: 0 });
  const path = cleanPoints(points, tolerance);
  const segments = [];
  let totalLength = 0;
  let horizontalLength = 0;
  let verticalLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const delta = subtract(end, start);
    const segmentLength = length(delta);
    const horizontal = Math.hypot(delta[0], delta[2]);
    const axis = segmentAxis(delta, tolerance);
    const slope = horizontal > tolerance ? delta[1] / horizontal : null;
    segments.push({ index: index - 1, start, end, delta, length: segmentLength, axis, slope });
    totalLength += segmentLength;
    horizontalLength += horizontal;
    verticalLength += Math.abs(delta[1]);
  }

  const bends = [];
  for (let index = 1; index < segments.length; index += 1) {
    const before = segments[index - 1].delta;
    const after = segments[index].delta;
    const cosine = Math.max(-1, Math.min(1,
      (before[0] * after[0] + before[1] * after[1] + before[2] * after[2])
      / (length(before) * length(after)),
    ));
    bends.push({
      pointIndex: index,
      point: path[index],
      angleRadians: Math.acos(cosine),
      fromAxis: segments[index - 1].axis,
      toAxis: segments[index].axis,
    });
  }

  return {
    kind: "path-analysis",
    method: "path.analyze",
    points: path,
    segments,
    bends,
    totalLength,
    horizontalLength,
    verticalLength,
    segmentCount: segments.length,
    bendCount: bends.length,
    orthogonal: segments.every((segment) => segment.axis !== null),
    start: path[0],
    end: path.at(-1),
  };
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]));
}

export function orthogonalPathCandidates(startValue, endValue, { preferredOrders } = {}) {
  const start = assertVec3(startValue, "start");
  const end = assertVec3(endValue, "end");
  const changedAxes = AXES.filter((_, index) => start[index] !== end[index]);
  const orders = preferredOrders ?? permutations(changedAxes);
  const seen = new Set();
  const candidates = [];
  for (const order of orders) {
    if (!Array.isArray(order) || order.some((axis) => !changedAxes.includes(axis)) || new Set(order).size !== changedAxes.length) {
      throw new TypeError("each preferred order must contain every changed axis exactly once");
    }
    let current = [...start];
    const points = [[...current]];
    for (const axis of order) {
      const index = AXES.indexOf(axis);
      current = [...current];
      current[index] = end[index];
      points.push(current);
    }
    const key = JSON.stringify(points);
    if (seen.has(key)) continue;
    seen.add(key);
    const analysis = analyzePath(points);
    candidates.push({
      id: `orthogonal-${order.join("") || "same"}`,
      axisOrder: order,
      points,
      totalLength: analysis.totalLength,
      bendCount: analysis.bendCount,
      segmentCount: analysis.segmentCount,
    });
  }
  return {
    kind: "path-candidates",
    start,
    end,
    candidates,
    selected: null,
    limitations: ["Candidates do not account for obstacles, required slopes, bend radii, or domain rules. The agent must select or refine a route."],
  };
}

export function pathSamplingEnd(length, startOffset, endOffset) {
  assertFiniteNumber(length, "path length", { min: 0 });
  const end = length - endOffset;
  // A decimal interval such as 0.1 + 0.2 may exactly fill a 0.3 m path.
  if (startOffset - end > Number.EPSILON * Math.max(length, startOffset, endOffset) * 2) {
    throw Object.assign(new RangeError(`path offsets leave no available sampling length (length ${length}, startOffset ${startOffset}, endOffset ${endOffset})`), { field: "endOffset" });
  }
  return Math.max(startOffset, end);
}

export function samplePath(points, { spacing, startOffset = 0, endOffset = 0, includeEnd = false } = {}) {
  const analysis = analyzePath(points);
  const safeSpacing = assertFiniteNumber(spacing, "spacing", { min: 0, exclusiveMin: true });
  const safeStart = assertFiniteNumber(startOffset, "startOffset", { min: 0 });
  const safeEnd = assertFiniteNumber(endOffset, "endOffset", { min: 0 });
  const availableEnd = pathSamplingEnd(analysis.totalLength, safeStart, safeEnd);
  const distances = [];
  for (let distance = safeStart; distance <= availableEnd + 1e-9; distance += safeSpacing) {
    distances.push(Math.min(distance, availableEnd));
    if (distance >= availableEnd) break;
    if (distance + safeSpacing === distance) throw new RangeError("spacing is too small for this path");
  }
  if (includeEnd && Math.abs(distances.at(-1) - availableEnd) > 1e-9) distances.push(availableEnd);

  const samples = distances.map((distance, sampleIndex) => {
    let traversed = 0;
    for (const segment of analysis.segments) {
      if (distance <= traversed + segment.length + 1e-9) {
        const ratio = segment.length === 0 ? 0 : Math.min(1, Math.max(0, (distance - traversed) / segment.length));
        return {
          index: sampleIndex,
          distance,
          segmentIndex: segment.index,
          position: segment.start.map((value, axis) => value + segment.delta[axis] * ratio),
          tangent: normalizeVector(segment.delta, "path segment"),
        };
      }
      traversed += segment.length;
    }
    const last = analysis.segments.at(-1);
    return { index: sampleIndex, distance, segmentIndex: last.index, position: [...analysis.end], tangent: normalizeVector(last.delta, "path segment") };
  });
  return {
    kind: "path-samples",
    spacing: safeSpacing,
    startOffset: safeStart,
    endOffset: safeEnd,
    pathLength: analysis.totalLength,
    samples,
  };
}
