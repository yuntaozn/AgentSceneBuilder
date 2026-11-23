import { assertFiniteNumber } from "./math.js";

function rectangle(halfWidth, halfHeight) {
  return [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]];
}

export function rectangularDuctSweep(geometry) {
  if (geometry?.type !== "rectangular-duct") return;
  const positive = { min: 0, exclusiveMin: true };
  const halfWidth = assertFiniteNumber(geometry.sectionWidth, "sectionWidth", positive) / 2;
  const halfHeight = assertFiniteNumber(geometry.sectionHeight, "sectionHeight", positive) / 2;
  const thickness = assertFiniteNumber(geometry.thickness, "thickness", positive);
  const insideWidth = halfWidth - thickness, insideHeight = halfHeight - thickness;
  if (insideWidth <= 0 || insideHeight <= 0 || insideWidth === halfWidth || insideHeight === halfHeight) {
    throw Object.assign(new RangeError("Duct thickness must leave an opening inside the section"), { field: "thickness" });
  }
  return {
    points: geometry.points, up: geometry.up, closedProfile: true,
    profile: rectangle(halfWidth, halfHeight), holes: [rectangle(insideWidth, insideHeight)],
  };
}
