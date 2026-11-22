import {
  assertFiniteNumber,
  assertVec3,
  boxBounds,
  length,
  midpoint,
  pointsBounds,
  subtract,
  transformBoundsMatrix,
} from "./math.js";

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

export function geometryBounds(node) {
  const geometry = node.geometry;
  if (geometry.type === "box") {
    if (node.matrix) return transformBoundsMatrix(boxBounds([0, 0, 0], geometry.size), node.matrix);
    return boxBounds(node.transform.position, geometry.size);
  }
  if (["sphere", "cylinder", "cone", "torus"].includes(geometry.type)) {
    const size=geometry.type==="sphere"?[geometry.radius*2,geometry.radius*2,geometry.radius*2]:geometry.type==="torus"?[(geometry.majorRadius+geometry.tubeRadius)*2,geometry.tubeRadius*2,(geometry.majorRadius+geometry.tubeRadius)*2]:[geometry.radius*2,geometry.height,geometry.radius*2];
    if(node.matrix)return transformBoundsMatrix(boxBounds([0,0,0],size),node.matrix);
    return boxBounds(node.transform.position,size);
  }
  if (geometry.type === "cylinder-between") return pointsBounds([geometry.start, geometry.end], geometry.radius);
  if (geometry.type === "tapered-cylinder-between") return pointsBounds([geometry.start, geometry.end], Math.max(geometry.startRadius, geometry.endRadius));
  if (geometry.type === "lofted-surface") {
    const points = geometry.sections.flatMap((section) => {
      const axisX = section.axisX ?? [section.radiusX, 0, 0];
      const axisZ = section.axisZ ?? [0, 0, section.radiusZ];
      if (Array.isArray(section.profile)) {
        return section.profile.map(([x, z]) => [
          section.center[0] + axisX[0] * x + axisZ[0] * z,
          section.center[1] + axisX[1] * x + axisZ[1] * z,
          section.center[2] + axisX[2] * x + axisZ[2] * z,
        ]);
      }
      return [
        [section.center[0] + axisX[0], section.center[1] + axisX[1], section.center[2] + axisX[2]],
        [section.center[0] - axisX[0], section.center[1] - axisX[1], section.center[2] - axisX[2]],
        [section.center[0] + axisZ[0], section.center[1] + axisZ[1], section.center[2] + axisZ[2]],
        [section.center[0] - axisZ[0], section.center[1] - axisZ[1], section.center[2] - axisZ[2]],
      ];
    });
    return pointsBounds(points, 0);
  }
  if (geometry.type === "tube-along") return pointsBounds(geometry.points, geometry.radius);
  throw new Error(`Unsupported geometry type for bounds: ${geometry.type}`);
}
