const EPSILON = 1e-9;

export function assertFiniteNumber(value, name, { min = -Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (exclusiveMin ? value <= min : value < min) {
    const operator = exclusiveMin ? ">" : ">=";
    throw new RangeError(`${name} must be ${operator} ${min}`);
  }
  return value;
}

export function assertVec3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${name} must contain exactly three numbers`);
  }
  return value.map((item, index) => assertFiniteNumber(item, `${name}[${index}]`));
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(vector, scalar) {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

export function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalizeVector(value, name = "vector") {
  const vector = assertVec3(value, name);
  const magnitude = length(vector);
  if (magnitude === 0) throw new RangeError(`${name} must not be zero`);
  return scale(vector, 1 / magnitude);
}

export function midpoint(a, b) {
  return scale(add(a, b), 0.5);
}

export function createBounds(min, max) {
  const safeMin = assertVec3(min, "bounds.min");
  const safeMax = assertVec3(max, "bounds.max");
  return {
    min: safeMin,
    max: safeMax,
    size: subtract(safeMax, safeMin),
    center: midpoint(safeMin, safeMax),
  };
}

export function unionBounds(boundsList) {
  const values = boundsList.filter(Boolean);
  if (values.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const bounds of values) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return createBounds(min, max);
}

export function boxBounds(center, size) {
  const half = scale(size, 0.5);
  return createBounds(subtract(center, half), add(center, half));
}

export function pointsBounds(points, padding = 0) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new TypeError("points must contain at least one vec3");
  }
  const values = points.map((point, index) => assertVec3(point, `points[${index}]`));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of values) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis] - padding);
      max[axis] = Math.max(max[axis], point[axis] + padding);
    }
  }
  return createBounds(min, max);
}

export function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += length(subtract(points[index], points[index - 1]));
  }
  return total;
}

export function nearlyEqual(a, b, tolerance = EPSILON) {
  return Math.abs(a - b) <= tolerance;
}

export function normalizeTransform(value = {}) {
  return {
    position: assertVec3(value.position ?? [0, 0, 0], "transform.position"),
    rotation: assertVec3(value.rotation ?? [0, 0, 0], "transform.rotation"),
    scale: assertVec3(value.scale ?? [1, 1, 1], "transform.scale"),
  };
}

// Applies scale, then intrinsic XYZ Euler rotation, then translation.
export function transformPoint(point, transformValue = {}) {
  const [px, py, pz] = assertVec3(point, "point");
  const { position, rotation, scale: scaleValue } = normalizeTransform(transformValue);
  let x = px * scaleValue[0];
  let y = py * scaleValue[1];
  let z = pz * scaleValue[2];

  const [rx, ry, rz] = rotation;
  const cosX = Math.cos(rx); const sinX = Math.sin(rx);
  [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];
  const cosY = Math.cos(ry); const sinY = Math.sin(ry);
  [x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY];
  const cosZ = Math.cos(rz); const sinZ = Math.sin(rz);
  [x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ];
  return [x + position[0], y + position[1], z + position[2]];
}

export function transformDirection(direction, transformValue = {}) {
  const origin = transformPoint([0, 0, 0], transformValue);
  const endpoint = transformPoint(direction, transformValue);
  return normalizeVector(subtract(endpoint, origin), "direction");
}

export function transformBounds(bounds, transformValue = {}) {
  if (!bounds) return null;
  const corners = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        corners.push(transformPoint([x, y, z], transformValue));
      }
    }
  }
  return pointsBounds(corners);
}

export function identityMatrix() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

export function multiplyMatrices(a, b) {
  return a.map((row, i) => row.map((_, j) =>
    row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}

export function translationMatrix(value) {
  const [x, y, z] = assertVec3(value, "translation");
  return [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
}

export function transformMatrix(value = {}, pivotValue = [0, 0, 0]) {
  const { position, rotation, scale: scaleValue } = normalizeTransform(value);
  const pivot = assertVec3(pivotValue, "pivot");
  const [rx, ry, rz] = rotation;
  const [sx, sy, sz] = scaleValue;
  const cx = Math.cos(rx); const sxr = Math.sin(rx);
  const cy = Math.cos(ry); const syr = Math.sin(ry);
  const cz = Math.cos(rz); const szr = Math.sin(rz);
  const scaleMatrix = [[sx, 0, 0, 0], [0, sy, 0, 0], [0, 0, sz, 0], [0, 0, 0, 1]];
  const rotateX = [[1, 0, 0, 0], [0, cx, -sxr, 0], [0, sxr, cx, 0], [0, 0, 0, 1]];
  const rotateY = [[cy, 0, syr, 0], [0, 1, 0, 0], [-syr, 0, cy, 0], [0, 0, 0, 1]];
  const rotateZ = [[cz, -szr, 0, 0], [szr, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  let matrix = multiplyMatrices(rotateX, scaleMatrix);
  matrix = multiplyMatrices(rotateY, matrix);
  matrix = multiplyMatrices(rotateZ, matrix);
  matrix = multiplyMatrices(translationMatrix(pivot), multiplyMatrices(matrix, translationMatrix(scale(pivot, -1))));
  return multiplyMatrices(translationMatrix(position), matrix);
}

export function transformPointMatrix(pointValue, matrix) {
  const [x, y, z] = assertVec3(pointValue, "point");
  return [
    matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
    matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
    matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
  ];
}

export function transformDirectionMatrix(directionValue, matrix) {
  const [x, y, z] = assertVec3(directionValue, "direction");
  return normalizeVector([
    matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
    matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
    matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z,
  ], "direction");
}

export function transformBoundsMatrix(bounds, matrix) {
  const corners = [];
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
    corners.push(transformPointMatrix([x, y, z], matrix));
  }
  return pointsBounds(corners);
}

export function alignVectorMatrix(fromValue, toValue) {
  const from = normalizeVector(fromValue, "orientation.localAxis");
  const to = normalizeVector(toValue, "orientation target");
  const cosine = Math.max(-1, Math.min(1, dot(from, to)));
  if (cosine > 1 - EPSILON) return identityMatrix();
  let axis = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]];
  if (cosine < -1 + EPSILON) {
    const helper = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    axis = normalizeVector([from[1] * helper[2] - from[2] * helper[1], from[2] * helper[0] - from[0] * helper[2], from[0] * helper[1] - from[1] * helper[0]], "orientation axis");
  } else axis = normalizeVector(axis, "orientation axis");
  const [x, y, z] = axis;
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const one = 1 - cosine;
  return [
    [cosine + x * x * one, x * y * one - z * sine, x * z * one + y * sine, 0],
    [y * x * one + z * sine, cosine + y * y * one, y * z * one - x * sine, 0],
    [z * x * one - y * sine, z * y * one + x * sine, cosine + z * z * one, 0],
    [0, 0, 0, 1],
  ];
}
