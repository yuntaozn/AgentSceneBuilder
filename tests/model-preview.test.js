import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultRegistry } from "../packages/core/src/index.js";
import { modelDocumentFor, modelPreviewBuild, modelPreviewNodes } from "../apps/shared/model-preview.js";

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

test("the catalog studio preview preserves model bounds and keeps the source editable", () => {
  const entry = {
    kind: "component",
    editor: {
      node: { id: "key-light", geometry: { type: "box", size: [2, 1, 3] } },
    },
  };
  const core = createDefaultRegistry();
  const original = modelPreviewBuild(entry, core);
  const studio = modelPreviewBuild(entry, core, { studioLighting: true });
  assert.deepEqual(studio.bounds, original.bounds);
  assert.deepEqual(studio.nodes.filter(node => node.kind === "light").map(node => node.metadata.compositionNodeId), [
    "key-light-2", "fill-light", "local-light",
  ]);
  assert.deepEqual(modelDocumentFor(entry).parameters.nodes, [entry.editor.node]);
});
