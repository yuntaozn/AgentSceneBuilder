import { compileCompositionSpec } from "../composition.js";

export const compositionComponent = {
  id: "core.composition",
  version: "0.3.0",
  title: "Declarative geometry composition",
  description: "Compile renderer-neutral geometry nodes, anchors, attachments, and repetition systems from data.",
  tags: ["core", "composition", "declarative", "parametric"],
  parameters: {
    nodes: { type: "array", required: true },
    anchors: { type: "object", required: false },
    attachments: { type: "array", required: false },
  },
  build({ instanceId, parameters }) {
    const result = compileCompositionSpec(parameters, { instanceId });
    return { ...result, parameters };
  },
};
