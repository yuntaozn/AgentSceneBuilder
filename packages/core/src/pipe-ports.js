import { normalizeVector, subtract } from "./math.js";

export function pipePorts(points, segments, outsideDiameter) {
  // Use the cleaned segments to avoid zero tangents at duplicate endpoints.
  const first = segments[0];
  return {
    start: { position: points[0], direction: normalizeVector(subtract(first.start, first.end)), directionSource: "path", kind: "pipe-port", outsideDiameter },
    end: { position: points.at(-1), direction: normalizeVector(segments.at(-1).delta), directionSource: "path", kind: "pipe-port", outsideDiameter },
  };
}
