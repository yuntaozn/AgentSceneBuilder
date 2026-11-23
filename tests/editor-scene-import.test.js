import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { checkSourceDraft, diagnosticRange } from "../apps/editor/diagnostic-range.js";
import { checkEditableScene, importEditableScene } from "../apps/editor/scene-import.js";

const registry = createDefaultRegistry();
const document = (id, nodeId, position) => ({
  id, component: "core.composition", transform: { position }, parameters: {
    nodes: [{ id: nodeId, geometry: { type: "box", size: [1, 1, 1] } }],
    anchors: { mount: [0, 0, 0] },
  },
});

test("scene import scopes colliding dotted IDs and preserves instances, ports and the connection", () => {
  const scene = { id: "paired", title: "Paired", metadata: { example: true },
    instances: [document("pair", "left", [2, 0, 1]), document("pair.left", "right", [2, 0, 1])],
    relations: [{ id: "joined", type: "connects", from: "pair#mount", to: "pair.left#mount" }],
  };
  const before = structuredClone(scene);
  assert.deepEqual(checkEditableScene(scene, registry), { ok: true, issues: [] });
  const result = importEditableScene(scene);
  assert.deepEqual(scene, before);
  assert.equal(result.title, "Paired");
  assert.deepEqual(result.metadata, { example: true });
  assert.deepEqual(result.parameters.nodes.filter(node => !node.parent).map(node => node.id), ["pair", "pair.left-2"]);
  const [joint] = result.parameters.attachments;
  assert.equal(joint.id, "joined");
  assert.equal(joint.to, "pair.left-2.mount");
  assert.deepEqual(registry.build(result).anchors.local[joint.to], [2, 0, 1]);
  assert.deepEqual(checkComposition(result), { ok: true, issues: [] });
});

test("a real assembly keeps attachments, animations and bounds through editable import", async () => {
  const file = new URL("../examples/digital-modeling/mep/basin-and-shower-fixture-assembly.json", import.meta.url);
  const scene = JSON.parse(await readFile(file, "utf8"));
  const original = composeScene(scene, registry);
  const editable = importEditableScene(scene);
  const built = registry.build(editable);
  assert.equal(editable.parameters.attachments.length, original.relations.length);
  assert.ok(editable.parameters.animations.some(animation => animation.target === "fold-seat.seat-pivot"));
  assert.equal(built.nodes.length, original.instances.reduce((total, instance) => total + instance.nodes.length, 0));
  assert.ok(built.bounds.size.every((value, i) => Math.abs(value - original.bounds.size[i]) < 1e-9));
});

test("scene drafts locate bad joints and explain unsupported primitive generators", () => {
  const text = JSON.stringify({ id: "invalid", instances: [
    document("first", "block", [0, 0, 0]),
    { id: "pipe", component: "mep.pipe-run", parameters: { points: [[0, 0, 0], [1, 0, 0]], radius: 0.05 } },
  ],
  attachments: [{ from: "first#mount", to: "missing#mount" }],
  }, null, 2);
  const { issues } = checkSourceDraft(text, { registry });
  const missing = issues.find(issue => issue.code === "SCENE_INSTANCE_MISSING");
  assert.equal(missing.path, "/attachments/0/to");
  const { offset, length } = diagnosticRange(text, missing);
  assert.equal(text.slice(offset, offset + length), '"missing#mount"');
  assert.ok(issues.some(issue => issue.code === "EDITOR_SCENE_INSTANCE_UNSUPPORTED" && issue.path === "/instances/1/component"));
});
