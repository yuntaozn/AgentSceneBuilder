import { assertFiniteNumber, assertVec3, normalizeVector, subtract } from "./math.js";

function circle(radius) {
  return Array.from({ length: 32 }, (_, i) => {
    const angle = i * Math.PI / 16;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

export function roundPipeSweep(geometry) {
  if (geometry?.type !== "hollow-round-pipe") return;
  const positive = { min: 0, exclusiveMin: true };
  const outsideDiameter = assertFiniteNumber(geometry.outsideDiameter, "outsideDiameter", positive);
  const radius = outsideDiameter / 2;
  const thickness = assertFiniteNumber(geometry.thickness, "thickness", positive);
  const inside = radius - thickness;
  if (inside <= 0 || inside === radius) {
    throw Object.assign(new RangeError("Pipe wall thickness must leave an open bore"), { field: "thickness" });
  }
  if (!Array.isArray(geometry.points) || geometry.points.length < 2) {
    throw Object.assign(new TypeError("An open pipe needs at least two path points"), { field: "points" });
  }
  const points = geometry.points.map((point, index) => assertVec3(point, `points[${index}]`));
  const port = (position, next) => ({
    position,
    direction: normalizeVector(subtract(position, next), "points"),
    outsideDiameter,
    kind: "pipe-port",
  });
  return {
    points, up: geometry.up, closedProfile: true, profile: circle(radius), holes: [circle(inside)],
    anchors: { start: port(points[0], points[1]), end: port(points.at(-1), points.at(-2)) },
  };
}
