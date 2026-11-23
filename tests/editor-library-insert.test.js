import test from "node:test";
import assert from "node:assert/strict";
import { buildRegistry } from "../scripts/registry.mjs";
import { canInsertLibraryGroup, insertLibraryGroup } from "../apps/editor/library-insert.js";
import { checkComposition, createDefaultRegistry } from "../packages/core/src/index.js";

const builder = createDefaultRegistry();
const box = id => ({ id, geometry: { type: "box", size: [1, 1, 1] } });
const composition = (id, parameters) => ({ id, component: "core.composition", parameters });

test("adding a library group scopes IDs and keeps internal connections after repeated insertions", async () => {
  const catalog = await buildRegistry();
  const source = catalog.entries.find(entry => entry.id === "spatial.anchor-attachment").editor.document;
  source.transform = { position: [3, 0, 0] };
  const scene = composition("untouched-scene", {
    nodes: [box(source.id), box(`${source.id}-2.fixed-pipe`)],
    anchors: { [`${source.id}-2.fixed-outlet`]: [0, 0, 0] },
  });
  const before = structuredClone(scene);
  const sourceBefore = structuredClone(source);
  const first = insertLibraryGroup(scene, source);
  const second = insertLibraryGroup(first.document, source);
  assert.equal(second.document.id, scene.id);
  assert.deepEqual(scene, before);
  assert.deepEqual(source, sourceBefore);
  assert.equal(first.groupId, `${source.id}-2`);
  assert.equal(second.groupId, `${source.id}-3`);
  const [firstJoint, secondJoint] = second.document.parameters.attachments;
  assert.equal(firstJoint.from, `${first.groupId}.fixed-outlet-2`);
  assert.equal(secondJoint.from, `${second.groupId}.fixed-outlet`);
  assert.equal(second.document.parameters.anchors[firstJoint.from].node, `${first.groupId}.fixed-pipe-2`);
  assert.equal(second.document.parameters.anchors[secondJoint.to].node, `${second.groupId}.moving-pipe`);
  const built = builder.build(second.document);
  assert.deepEqual(built.anchors.local[firstJoint.from], [3, 1, 0]);
  assert.deepEqual(built.anchors.local[secondJoint.from], [3, 1, 0]);
  assert.deepEqual(checkComposition(second.document), { ok: true, issues: [] });
});

test("group transforms move free anchors and preserve descendant animation and route references", () => {
  const pipe = { id: "pipe", geometry: { type: "tube-along", points: [[0, 0, 0], [2, 0, 0]], radius: 0.1 } };
  const clip = { ...box("clip"), parent: "pipe", metadata: { supportsRoute: "pipe" },
    repetition: { type: "path", points: pipe.geometry.points, spacing: 0.5 } };
  const source = composition("supported-route", {
    nodes: [pipe, clip],
    anchors: { origin: [0, 0, 0], out: { node: "pipe", position: [0, 0, 0], kind: "route-end" } },
    routeBindings: [{ node: "pipe", clip: "clip", clipOffset: [0, 0.1, 0] }],
    animations: [{ id: "demo-motion", target: "clip", property: "rotation", from: [0, 0, 0], to: [0, 1, 0], duration: 1 }],
  });
  const { document, groupId } = insertLibraryGroup(composition("scene", { nodes: [] }), source);
  const [group, newPipe, newClip] = document.parameters.nodes;
  group.transform = { position: [10, 0, 0] };
  assert.equal(newClip.parent, newPipe.id);
  assert.equal(newClip.metadata.supportsRoute, newPipe.id);
  assert.equal(document.parameters.animations[0].target, newClip.id);
  assert.equal(document.parameters.routeBindings[0].clip, newClip.id);
  assert.equal(document.parameters.anchors[`${groupId}.origin`].node, groupId);
  const built = builder.build(document);
  assert.deepEqual(built.anchors.local[`${groupId}.origin`], [10, 0, 0]);
  assert.deepEqual(built.anchors.local[`${groupId}.out`], [12, 0, 0]);
});

test("every public library model offered as a group builds in an existing composition", async () => {
  const catalog = await buildRegistry();
  const entries = catalog.entries.filter(entry => entry.visibility !== "internal" && canInsertLibraryGroup(entry.editor?.document));
  assert.ok(entries.some(entry => entry.id === "prefab.insulated-wall-panel"));
  assert.ok(entries.some(entry => entry.id === "mep.pipe-support-layout"));
  for (const entry of entries) {
    const target = composition("host", { nodes: [box("existing")] });
    const { document } = insertLibraryGroup(target, entry.editor.document);
    assert.doesNotThrow(() => builder.build(document), entry.id);
  }
  const standalone = catalog.entries.find(entry => entry.id === "electronics.desktop-tower").editor.document;
  assert.equal(canInsertLibraryGroup(standalone), false);
  assert.throws(() => insertLibraryGroup(composition("host", { nodes: [] }), standalone), /requires its own scene/);
});
