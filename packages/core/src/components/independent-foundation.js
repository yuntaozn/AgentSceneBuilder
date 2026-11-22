import { box } from "../geometry.js";
import { assertFiniteNumber } from "../math.js";
import { compileCompositionSpec } from "../composition.js";

function positive(value, fallback, name) {
  return assertFiniteNumber(value ?? fallback, name, { min: 0, exclusiveMin: true });
}

function nonNegative(value, fallback, name) {
  return assertFiniteNumber(value ?? fallback, name, { min: 0 });
}

function positionsAcross(span, cover, spacing) {
  const usable = span - cover * 2;
  if (usable < 0) throw new RangeError("cover cannot exceed half of the foundation dimension");
  const intervals = Math.max(1, Math.ceil(usable / spacing));
  const actualSpacing = usable / intervals;
  return Array.from({ length: intervals + 1 }, (_, index) => -usable / 2 + index * actualSpacing);
}

export const independentFoundation = {
  id: "construction.independent-foundation",
  version: "0.1.0",
  title: "Parametric independent foundation",
  description: "Build a dimensioned pad foundation, optional blinding layer, column starter, and bottom reinforcement grid.",
  tags: ["construction", "foundation", "concrete", "rebar", "parametric"],
  parameters: {
    width: { type: "number", unit: "meter", default: 4 },
    depth: { type: "number", unit: "meter", default: 4 },
    height: { type: "number", unit: "meter", default: 0.8 },
    columnWidth: { type: "number", unit: "meter", default: 0.8 },
    columnDepth: { type: "number", unit: "meter", default: 0.8 },
    columnHeight: { type: "number", unit: "meter", default: 1.5 },
    blindingThickness: { type: "number", unit: "meter", default: 0.1 },
    blindingExtension: { type: "number", unit: "meter", default: 0.1 },
    rebarDiameter: { type: "number", unit: "meter", default: 0.016 },
    rebarSpacing: { type: "number", unit: "meter", default: 0.2 },
    concreteCover: { type: "number", unit: "meter", default: 0.05 }
  },
  build({ instanceId, parameters: input }) {
    const parameters = {
      width: positive(input.width, 4, "width"),
      depth: positive(input.depth, 4, "depth"),
      height: positive(input.height, 0.8, "height"),
      columnWidth: positive(input.columnWidth, 0.8, "columnWidth"),
      columnDepth: positive(input.columnDepth, 0.8, "columnDepth"),
      columnHeight: positive(input.columnHeight, 1.5, "columnHeight"),
      blindingThickness: nonNegative(input.blindingThickness, 0.1, "blindingThickness"),
      blindingExtension: nonNegative(input.blindingExtension, 0.1, "blindingExtension"),
      rebarDiameter: positive(input.rebarDiameter, 0.016, "rebarDiameter"),
      rebarSpacing: positive(input.rebarSpacing, 0.2, "rebarSpacing"),
      concreteCover: nonNegative(input.concreteCover, 0.05, "concreteCover"),
    };
    if (parameters.columnWidth > parameters.width || parameters.columnDepth > parameters.depth) {
      throw new RangeError("column dimensions cannot exceed foundation dimensions");
    }

    const nodes = [];
    if (parameters.blindingThickness > 0) {
      nodes.push(box({
        id: `${instanceId}.blinding`,
        size: [parameters.width + parameters.blindingExtension * 2, parameters.blindingThickness, parameters.depth + parameters.blindingExtension * 2],
        position: [0, parameters.blindingThickness / 2, 0],
        material: "concrete.blinding",
        semanticType: "construction.blinding",
      }));
    }
    const padBottom = parameters.blindingThickness;
    nodes.push(box({
      id: `${instanceId}.pad`,
      size: [parameters.width, parameters.height, parameters.depth],
      position: [0, padBottom + parameters.height / 2, 0],
      material: "concrete.structural",
      semanticType: "construction.foundation-pad",
    }));
    nodes.push(box({
      id: `${instanceId}.column`,
      size: [parameters.columnWidth, parameters.columnHeight, parameters.columnDepth],
      position: [0, padBottom + parameters.height + parameters.columnHeight / 2, 0],
      material: "concrete.structural",
      semanticType: "construction.column-starter",
    }));

    const rebarY = padBottom + parameters.concreteCover + parameters.rebarDiameter / 2;
    const xPositions = positionsAcross(parameters.width, parameters.concreteCover, parameters.rebarSpacing);
    const zPositions = positionsAcross(parameters.depth, parameters.concreteCover, parameters.rebarSpacing);
    const xBarLength = parameters.width - parameters.concreteCover * 2;
    const zBarLength = parameters.depth - parameters.concreteCover * 2;
    const rebarComposition = compileCompositionSpec({
      nodes: [
        {
          id: "rebar.x",
          geometry: {
            type: "cylinder-between",
            start: [-xBarLength / 2, rebarY, 0],
            end: [xBarLength / 2, rebarY, 0],
            radius: parameters.rebarDiameter / 2,
          },
          material: "steel.rebar",
          semanticType: "construction.rebar",
          metadata: { direction: "x" },
          repetition: {
            type: "linear",
            count: zPositions.length,
            start: [0, 0, zPositions[0]],
            step: [0, 0, zPositions.length > 1 ? zPositions[1] - zPositions[0] : 0],
          },
        },
        {
          id: "rebar.z",
          geometry: {
            type: "cylinder-between",
            start: [0, rebarY + parameters.rebarDiameter, -zBarLength / 2],
            end: [0, rebarY + parameters.rebarDiameter, zBarLength / 2],
            radius: parameters.rebarDiameter / 2,
          },
          material: "steel.rebar",
          semanticType: "construction.rebar",
          metadata: { direction: "z" },
          repetition: {
            type: "linear",
            count: xPositions.length,
            start: [xPositions[0], 0, 0],
            step: [xPositions.length > 1 ? xPositions[1] - xPositions[0] : 0, 0, 0],
          },
        },
      ],
    }, { instanceId });
    nodes.push(...rebarComposition.nodes);

    const padVolume = parameters.width * parameters.depth * parameters.height;
    const columnVolume = parameters.columnWidth * parameters.columnDepth * parameters.columnHeight;
    const rebarLength = zPositions.length * xBarLength + xPositions.length * zBarLength;
    return {
      parameters,
      nodes,
      anchors: {
        groundCenter: [0, 0, 0],
        padTopCenter: [0, padBottom + parameters.height, 0],
        columnTopCenter: [0, padBottom + parameters.height + parameters.columnHeight, 0],
      },
      metrics: {
        concreteVolume: { value: padVolume + columnVolume, unit: "cubic-meter" },
        blindingVolume: { value: (parameters.width + parameters.blindingExtension * 2) * (parameters.depth + parameters.blindingExtension * 2) * parameters.blindingThickness, unit: "cubic-meter" },
        rebarCount: xPositions.length + zPositions.length,
        rebarLength: { value: rebarLength, unit: "meter" },
        actualSpacing: {
          x: xBarLength / Math.max(1, xPositions.length - 1),
          z: zBarLength / Math.max(1, zPositions.length - 1),
          unit: "meter",
        },
      },
      repetitions: rebarComposition.repetitions,
      relations: [
        { type: "supports", from: `${instanceId}.pad`, to: `${instanceId}.column` },
        { type: "contains", from: `${instanceId}.pad`, toQuery: `${instanceId}.rebar.*` },
      ],
    };
  },
};
