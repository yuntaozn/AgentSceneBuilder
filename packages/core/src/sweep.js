import {
  add, assertFiniteNumber, assertVec3, cross, dot, length, normalizeVector, scale, subtract,
} from "./math.js";

function turn(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function intersects(a, b, c, d) {
  const overlaps = [0, 1].every(axis =>
    Math.max(a[axis], b[axis]) >= Math.min(c[axis], d[axis]) &&
    Math.max(c[axis], d[axis]) >= Math.min(a[axis], b[axis]));
  return overlaps && turn(a, b, c) * turn(a, b, d) <= 0 && turn(c, d, a) * turn(c, d, b) <= 0;
}

function sectionPoints(profile, closed) {
  if (typeof closed !== "boolean") throw new TypeError("closedProfile must be boolean");
  if (!Array.isArray(profile) || profile.length < (closed ? 3 : 2)) {
    throw new RangeError("sweep profile needs at least two points (three for a closed profile)");
  }
  const points = profile.map((point, i) => {
    if (!Array.isArray(point) || point.length !== 2) throw new TypeError(`profile[${i}] must be [u,v]`);
    return point.map((n, j) => assertFiniteNumber(n, `profile[${i}][${j}]`));
  });
  const count = points.length;
  const edges = closed ? count : count - 1;
  for (let i = 0; i < edges; i++) {
    const a = points[i], b = points[(i + 1) % count];
    if (a[0] === b[0] && a[1] === b[1]) throw new RangeError(`zero-length profile edge at ${i}`);
    if (closed || i + 1 < edges) {
      const c = points[(i + 2) % count];
      if (turn(a, b, c) === 0 && (a[0]-b[0])*(c[0]-b[0]) + (a[1]-b[1])*(c[1]-b[1]) > 0) {
        throw new RangeError("sweep profile folds back on itself");
      }
    }
    for (let j = i + 2; j < edges; j++) {
      if (closed && i === 0 && j === edges - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % count])) throw new RangeError("sweep profile intersects itself");
    }
  }
  // Consistent winding gives the side faces outward normals for either input order.
  const area2 = points.reduce((area, p, i) => area + turn(points[0], p, points[(i + 1) % count]), 0);
  return closed && area2 < 0 ? points.reverse() : points;
}

export function sweepGeometry({ profile, points, up, closedProfile = false }) {
  const section = sectionPoints(profile, closedProfile);
  if (!Array.isArray(points) || points.length < 2) throw new RangeError("sweep points must contain at least two positions");
  const path = points.map((p, i) => assertVec3(p, `points[${i}]`));
  if (length(subtract(path[0], path.at(-1))) === 0) throw new RangeError("sweep requires an open path");
  const segments = path.slice(1).map((point, i) => normalizeVector(subtract(point, path[i]), `path segment ${i}`));
  const first = segments[0];
  const initialUp = up === undefined ? (Math.abs(first[1]) < 1 - 1e-10 ? [0, 1, 0] : [0, 0, 1]) : normalizeVector(up, "up");
  let width = cross(initialUp, first);
  if (length(width) < 1e-10) throw new RangeError("sweep up must not be parallel to the first path segment");
  width = normalizeVector(width);
  let height = cross(first, width);

  const rings = path.map((point, i) => {
    const incoming = segments[Math.max(0, i - 1)];
    const outgoing = segments[Math.min(i, segments.length - 1)];
    const sum = add(incoming, outgoing);
    const denominator = 1 + dot(incoming, outgoing);
    if (denominator < 1e-10) throw new RangeError(`sweep path reverses at points[${i}]`);
    // Intersect each section vertex's incoming rail with the corner bisector.
    // The same intersection is on the outgoing rail after minimal frame rotation.
    const railShift = axis => dot(axis, outgoing) / denominator;
    const du = railShift(width), dv = railShift(height);
    const jointWidth = subtract(width, scale(incoming, du));
    const jointHeight = subtract(height, scale(incoming, dv));
    width = subtract(width, scale(sum, du));
    height = subtract(height, scale(sum, dv));
    return section.map(([u, v]) => add(point, add(scale(jointWidth, u), scale(jointHeight, v))));
  });
  for (let i = 0; i < segments.length; i++) {
    if (rings[i].some((p, j) => dot(subtract(rings[i + 1][j], p), segments[i]) <= 0)) {
      throw new RangeError(`sweep section is too large for the bend at segment ${i}`);
    }
  }
  return { type: "sweep", profile: section, points: path, closedProfile, up: initialUp, rings };
}
