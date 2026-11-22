import { tubeAlong } from "../geometry.js";
import { assertFiniteNumber, assertVec3 } from "../math.js";
import { analyzePath } from "../path.js";
import { pipePorts } from "../pipe-ports.js";
import { readComponentParameters } from "../component-parameters.js";

export const pipeRun = {
  id: "mep.pipe-run",
  version: "0.1.0",
  title: "Parametric pipe run",
  description: "Build a pipe from a dimensioned 3D path while preserving endpoints, length, diameter, and system semantics.",
  tags: ["mep", "pipe", "path", "water", "drainage", "parametric"],
  parameters: {
    path: { type: "array", items: "vec3", minItems: 2, unit: "meter" },
    diameter: { type: "number", unit: "meter" },
    system: { type: "string", default: "generic" },
    material: { type: "string", default: "pipe.generic" }
  },
  build({ instanceId, parameters: input }) {
    const { path, diameter, pathAnalysis } = readComponentParameters(read => {
      const path = read("path", () => {
        if (!Array.isArray(input.path) || input.path.length < 2) throw new TypeError("path must contain at least two vec3 points");
        return input.path.map((point, i) => read(`path[${i}]`, () => assertVec3(point, `path[${i}]`)));
      });
      const diameter = read("diameter", () => assertFiniteNumber(input.diameter, "diameter", { min: 0, exclusiveMin: true }));
      const pathAnalysis = path?.every(Boolean) ? read("path", () => analyzePath(path)) : undefined;
      return { path, diameter, pathAnalysis };
    });
    const system = typeof input.system === "string" && input.system ? input.system : "generic";
    const material = typeof input.material === "string" && input.material ? input.material : `pipe.${system}`;
    const parameters = { path, diameter, system, material };
    const nodeId = `${instanceId}.body`;
    const routeLength = pathAnalysis.totalLength;
    return {
      parameters,
      nodes: [tubeAlong({
        id: nodeId,
        points: path,
        radius: diameter / 2,
        material,
        semanticType: "mep.pipe",
        metadata: { system },
      })],
      anchors: pipePorts(path, pathAnalysis.segments, diameter),
      metrics: {
        centerlineLength: { value: routeLength, unit: "meter" },
        outsideDiameter: { value: diameter, unit: "meter" },
        approximateOuterVolume: { value: Math.PI * (diameter / 2) ** 2 * routeLength, unit: "cubic-meter" },
        segmentCount: path.length - 1,
        bendCount: pathAnalysis.bendCount,
        horizontalLength: { value: pathAnalysis.horizontalLength, unit: "meter" },
        verticalLength: { value: pathAnalysis.verticalLength, unit: "meter" },
        orthogonal: pathAnalysis.orthogonal,
        segments: pathAnalysis.segments.map(({ index, length: segmentLength, axis, slope }) => ({ index, length: segmentLength, axis, slope })),
      },
      relations: [],
    };
  },
};
