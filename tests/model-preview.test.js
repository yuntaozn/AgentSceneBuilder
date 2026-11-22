import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultRegistry } from "../packages/core/src/index.js";
import { modelDocumentFor, modelPreviewNodes } from "../apps/shared/model-preview.js";

test("turns a registry component into an editable preview composition", () => {
  const entry = {
    id: "demo.box",
    kind: "component",
    version: "1.0.0",
    capabilities: ["geometry"],
    editor: {
      node: {
        id: "box",
        semanticType: "generic.solid",
        geometry: { type: "box", size: [2, 1, 3] },
        transform: { position: [1, .5, -2], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }
    }
  };

  const documentValue = modelDocumentFor(entry);
  const nodes = modelPreviewNodes(entry, createDefaultRegistry());

  assert.equal(documentValue.component, "core.composition");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].geometry.type, "box");
  assert.deepEqual(entry.editor.node.transform.position, [1, .5, -2]);
});

test("returns an empty geometry preview for a data-only spatial method", () => {
  const entry = {
    id: "space.method",
    kind: "method",
    version: "1.0.0",
    capabilities: ["layout"],
    parameters: { spacing: { type: "number" } }
  };

  assert.deepEqual(modelPreviewNodes(entry, createDefaultRegistry()), []);
});
