import {
  add,
  assertFiniteNumber,
  assertVec3,
  boxBounds,
  createBounds,
  cross,
  identityMatrix,
  length,
  midpoint,
  multiplyMatrices,
  pointsBounds,
  subtract,
  transformBounds,
  transformBoundsMatrix,
  transformMatrix,
  transformPointMatrix,
  transformVectorMatrix,
  unionBounds,
} from "./math.js";
import { sweepGeometry } from "./sweep.js";

const nodeSpaceTypes = new Set(["box", "cylinder", "cone", "sphere", "torus", "sweep"]);
const roundPaths = new Set(["cylinder-between", "tapered-cylinder-between", "tube-along"]);

function transform(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return {
    position: assertVec3(position, "position"),
    rotation: assertVec3(rotation, "rotation"),
    scale: assertVec3(scale, "scale"),
  };
}

function geometryNode({ id, geometry, position, rotation, scale, matrix, material, appearance, semanticType, metadata = {} }) {
  if (!id || typeof id !== "string") throw new TypeError("geometry node id must be a non-empty string");
  return {
    id,
    kind: "geometry",
    semanticType,
    geometry,
    transform: transform(position, rotation, scale),
    ...(matrix ? { matrix } : {}),
    material,
    appearance: appearance ?? {},
    metadata,
  };
}

export function box({ id, size, position = [0, 0, 0], rotation, scale, matrix, material, appearance, semanticType, metadata }) {
  const safeSize = assertVec3(size, "size");
  safeSize.forEach((value, index) => assertFiniteNumber(value, `size[${index}]`, { min: 0, exclusiveMin: true }));
  const safePosition = assertVec3(position, "position");
  return geometryNode({
    id,
    geometry: { type: "box", size: safeSize },
    position: safePosition,
    rotation,
    scale,
    matrix,
    material,
    appearance,
    semanticType,
    metadata,
  });
}

function solidPrimitive({ id, type, geometry, position = [0, 0, 0], rotation, scale, matrix, material, appearance, semanticType, metadata }) {
  return geometryNode({ id, geometry: { type, ...geometry }, position: assertVec3(position, "position"), rotation, scale, matrix, material, appearance, semanticType, metadata });
}

export function sphere({ id, radius, position, rotation, scale, matrix, segments = 24, material, appearance, semanticType, metadata }) {
  return solidPrimitive({ id, type: "sphere", geometry: { radius: assertFiniteNumber(radius, "radius", { min: 0, exclusiveMin: true }), segments }, position, rotation, scale, matrix, material, appearance, semanticType, metadata });
}

export function cylinder({ id, radius, height, position, rotation, scale, matrix, radialSegments = 24, material, appearance, semanticType, metadata }) {
  return solidPrimitive({ id, type: "cylinder", geometry: { radius: assertFiniteNumber(radius, "radius", { min: 0, exclusiveMin: true }), height: assertFiniteNumber(height, "height", { min: 0, exclusiveMin: true }), radialSegments }, position, rotation, scale, matrix, material, appearance, semanticType, metadata });
}

export function cone({ id, radius, height, position, rotation, scale, matrix, radialSegments = 24, material, appearance, semanticType, metadata }) {
  return solidPrimitive({ id, type: "cone", geometry: { radius: assertFiniteNumber(radius, "radius", { min: 0, exclusiveMin: true }), height: assertFiniteNumber(height, "height", { min: 0, exclusiveMin: true }), radialSegments }, position, rotation, scale, matrix, material, appearance, semanticType, metadata });
}

export function torus({ id, majorRadius, tubeRadius, position, rotation, scale, matrix, radialSegments = 32, tubularSegments = 12, material, appearance, semanticType, metadata }) {
  const safeMajor = assertFiniteNumber(majorRadius, "majorRadius", { min: 0, exclusiveMin: true });
  const safeTube = assertFiniteNumber(tubeRadius, "tubeRadius", { min: 0, exclusiveMin: true });
  return solidPrimitive({ id, type: "torus", geometry: { majorRadius: safeMajor, tubeRadius: safeTube, radialSegments, tubularSegments }, position, rotation, scale, matrix, material, appearance, semanticType, metadata });
}

export function cylinderBetween({ id, start, end, radius, radialSegments = 16, material, appearance, semanticType, metadata }) {
  const safeStart = assertVec3(start, "start");
  const safeEnd = assertVec3(end, "end");
  const safeRadius = assertFiniteNumber(radius, "radius", { min: 0, exclusiveMin: true });
  const segmentLength = length(subtract(safeEnd, safeStart));
  if (segmentLength === 0) throw new RangeError("cylinder start and end must differ");
  return geometryNode({
    id,
    geometry: {
      type: "cylinder-between",
      start: safeStart,
      end: safeEnd,
      radius: safeRadius,
      radialSegments,
    },
    position: midpoint(safeStart, safeEnd),
    material,
    appearance,
    semanticType,
    metadata,
  });
}

export function taperedCylinderBetween({ id, start, end, startRadius, endRadius, radialSegments = 16, material, appearance, semanticType, metadata }) {
  const safeStart = assertVec3(start, "start");
  const safeEnd = assertVec3(end, "end");
  const safeStartRadius = assertFiniteNumber(startRadius, "startRadius", { min: 0, exclusiveMin: true });
  const safeEndRadius = assertFiniteNumber(endRadius, "endRadius", { min: 0, exclusiveMin: true });
  const segmentLength = length(subtract(safeEnd, safeStart));
  if (segmentLength === 0) throw new RangeError("tapered cylinder start and end must differ");
  return geometryNode({
    id,
    geometry: {
      type: "tapered-cylinder-between",
      start: safeStart,
      end: safeEnd,
      startRadius: safeStartRadius,
      endRadius: safeEndRadius,
      radialSegments,
    },
    position: midpoint(safeStart, safeEnd),
    material,
    appearance,
    semanticType,
    metadata,
  });
}

function normalizedLoftSection(section, index) {
  if (!section || typeof section !== "object") throw new TypeError(`sections[${index}] must be an object`);
  const center = assertVec3(section.center, `sections[${index}].center`);
  const hasAxisX = Array.isArray(section.axisX);
  const hasAxisZ = Array.isArray(section.axisZ);
  const axisX = hasAxisX ? assertVec3(section.axisX, `sections[${index}].axisX`) : [assertFiniteNumber(section.radiusX, `sections[${index}].radiusX`, { min: 0, exclusiveMin: true }), 0, 0];
  const axisZ = hasAxisZ ? assertVec3(section.axisZ, `sections[${index}].axisZ`) : [0, 0, assertFiniteNumber(section.radiusZ, `sections[${index}].radiusZ`, { min: 0, exclusiveMin: true })];
  const radiusX = length(axisX);
  const radiusZ = length(axisZ);
  if (radiusX === 0 || radiusZ === 0) throw new RangeError(`sections[${index}] axes must have non-zero length`);
  const profile = section.profile === undefined ? undefined : normalizedSectionProfile(section.profile, index);
  return {
    ...(section.id ? { id: section.id } : {}),
    center,
    radiusX,
    radiusZ,
    axisX,
    axisZ,
    ...(profile ? { profile } : {}),
    ...(section.role ? { role: section.role } : {}),
  };
}

function normalizedSectionProfile(profile, sectionIndex) {
  if (!Array.isArray(profile) || profile.length < 3) throw new TypeError(`sections[${sectionIndex}].profile must contain at least three [x,z] points`);
  return profile.map((point, pointIndex) => {
    if (!Array.isArray(point) || point.length !== 2) throw new TypeError(`sections[${sectionIndex}].profile[${pointIndex}] must be [x,z]`);
    return point.map((value, axis) => assertFiniteNumber(value, `sections[${sectionIndex}].profile[${pointIndex}][${axis}]`));
  });
}

export function loftedSurface({ id, sections, radialSegments = 8, capStart = true, capEnd = true, material, appearance, semanticType, metadata }) {
  if (!Array.isArray(sections) || sections.length < 2) throw new TypeError("lofted surface sections must contain at least two section definitions");
  const safeSegments = assertFiniteNumber(radialSegments, "radialSegments", { min: 3 });
  if (!Number.isInteger(safeSegments)) throw new TypeError("radialSegments must be an integer");
  const safeSections = sections.map(normalizedLoftSection);
  return geometryNode({
    id,
    geometry: {
      type: "lofted-surface",
      sections: safeSections,
      radialSegments: safeSegments,
      capStart,
      capEnd,
    },
    position: midpoint(safeSections[0].center, safeSections[safeSections.length - 1].center),
    material,
    appearance,
    semanticType,
    metadata,
  });
}

export function tubeAlong({ id, points, radius, radialSegments = 12, material, appearance, semanticType, metadata }) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("tube points must contain at least two positions");
  const safePoints = points.map((point, index) => assertVec3(point, `points[${index}]`));
  const safeRadius = assertFiniteNumber(radius, "radius", { min: 0, exclusiveMin: true });
  return geometryNode({
    id,
    geometry: { type: "tube-along", points: safePoints, radius: safeRadius, radialSegments },
    material,
    appearance,
    semanticType,
    metadata,
  });
}

export function sweep({ id, profile, holes, points, up, closedProfile, position, rotation, scale, matrix, material, appearance, semanticType, metadata }) {
  return geometryNode({
    id, material, appearance, semanticType, metadata, position, rotation, scale,
    matrix: matrix ?? transformMatrix({ position, rotation, scale }),
    geometry: sweepGeometry({ profile, holes, points, up, closedProfile }),
  });
}

export function geometryBounds(node) {
  const geometry = node.geometry;
  if (nodeSpaceTypes.has(geometry.type)) return nodeSpaceBounds(node);
  if (roundPaths.has(geometry.type)) return roundPathBounds(geometry);
  if (geometry.type === "lofted-surface") return loftBounds(geometry);
  throw new Error(`Unsupported geometry type for bounds: ${geometry.type}`);
}

function nodeSpaceBounds(node, instanceMatrix) {
  const geometry = node.geometry;
  const nodeMatrix = node.matrix ?? transformMatrix(node.transform);
  const matrix = instanceMatrix ? multiplyMatrices(instanceMatrix, nodeMatrix) : nodeMatrix;
  if (geometry.type === "box") return transformBoundsMatrix(boxBounds([0, 0, 0], geometry.size), matrix);
  if (geometry.type === "sweep") {
    return pointsBounds(geometry.rings.flatMap(ring => ring.map(point => transformPointMatrix(point, matrix))));
  }
  if (geometry.type === "sphere" || geometry.type === "torus") {
    const isRing = geometry.type === "torus";
    const radius = isRing ? geometry.tubeRadius : geometry.radius;
    const axes = matrix.slice(0, 3);
    const center = axes.map(row => row[3]);
    const extent = axes.map(([x, y, z]) => {
      // A torus adds the projection of its XZ centerline circle to that of its round tube.
      const centerline = isRing ? Math.hypot(geometry.majorRadius * x, geometry.majorRadius * z) : 0;
      return centerline + Math.hypot(radius * x, radius * y, radius * z);
    });
    return createBounds(subtract(center, extent), add(center, extent));
  }
  const halfHeight = geometry.height / 2;
  return flatEndedBounds([[0, -halfHeight, 0], [0, halfHeight, 0]], geometry.radius,
    geometry.type === "cone" ? 0 : geometry.radius, matrix);
}

function roundPathBounds(geometry, matrix) {
  return flatEndedBounds(geometry.points ?? [geometry.start, geometry.end],
    geometry.startRadius ?? geometry.radius, geometry.endRadius ?? geometry.radius, matrix);
}

function flatEndedBounds(points, startRadius, endRadius, matrix) {
  const rows = matrix ?? identityMatrix();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  function includeSegment(start, end, normal) {
    const a = matrix ? transformPointMatrix(start, matrix) : start;
    const b = matrix ? transformPointMatrix(end, matrix) : end;
    for (let axis = 0; axis < 3; axis++) {
      // The support of a unit end disk along this matrix row is |row × normal|.
      const projection = length(cross(rows[axis], normal));
      const extentA = startRadius * projection, extentB = endRadius * projection;
      min[axis] = Math.min(min[axis], a[axis] - extentA, b[axis] - extentB);
      max[axis] = Math.max(max[axis], a[axis] + extentA, b[axis] + extentB);
    }
  }
  let hasSegment = false;
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i];
    let delta = subtract(end, start);
    // Keep the normal well-defined for very short segments or widely separated endpoints.
    if (!delta.every(Number.isFinite)) delta = end.map((value, axis) => value / 2 - start[axis] / 2);
    const largest = Math.max(Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2]));
    if (largest === 0) continue;
    const direction = delta.map(value => value / largest);
    const magnitude = length(direction);
    includeSegment(start, end, direction.map(value => value / magnitude));
    hasSegment = true;
  }
  // A fully collapsed tube is rendered as a zero-height Y-axis cylinder.
  if (!hasSegment) includeSegment(points[0], points[0], [0, 1, 0]);
  return createBounds(min, max);
}

function loftBounds(geometry, matrix) {
  const points = geometry.sections.flatMap((section, index) => {
    let { center, axisX = [section.radiusX, 0, 0], axisZ = [0, 0, section.radiusZ] } = section;
    if (matrix) {
      center = transformPointMatrix(center, matrix);
      axisX = transformVectorMatrix(axisX, matrix);
      axisZ = transformVectorMatrix(axisZ, matrix);
    }
    if (Array.isArray(section.profile)) {
      const vertices = section.profile.map(([x, z]) =>
        center.map((c, k) => c + axisX[k] * x + axisZ[k] * z));
      if ((index === 0 && geometry.capStart !== false) ||
          (index === geometry.sections.length - 1 && geometry.capEnd !== false)) vertices.push(center);
      return vertices;
    }
    // Along each coordinate, a*cos(t) + b*sin(t) attains ±hypot(a,b).
    const extent = axisX.map((a, k) => Math.hypot(a, axisZ[k]));
    return [center.map((c, k) => c - extent[k]), center.map((c, k) => c + extent[k])];
  });
  return pointsBounds(points);
}

export function instanceGeometryBounds(entries, transform) {
  const localBounds = unionBounds(entries.map(entry => entry.bounds));
  // Translation and axis-aligned scale preserve the extrema of the local union.
  if (!transform?.rotation?.some(angle => angle !== 0)) return { localBounds, bounds: transformBounds(localBounds, transform) };

  const matrix = transformMatrix(transform);
  const worldBounds = entries.map(entry => {
    if (entry.node && nodeSpaceTypes.has(entry.node.geometry.type)) return nodeSpaceBounds(entry.node, matrix);
    const geometry = entry.node?.geometry ?? entry.geometry; // Also accept older { geometry, bounds } entries.
    if (roundPaths.has(geometry.type)) return roundPathBounds(geometry, matrix);
    if (geometry.type === "lofted-surface") return loftBounds(geometry, matrix);
    return transformBoundsMatrix(entry.bounds, matrix);
  });
  return { localBounds, bounds: unionBounds(worldBounds) };
}
