import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;
const byType = model => model.nodes.filter(node => node.geometry.type === "sweep");

test("the mixing inlet and pan drain have physical paths to the corresponding chambers", async t => {
  const mixing = registry.build(await document("top-branch-air-handling-mixing-chamber"));
  const mixingRay = sweepRay(t, byType(mixing));
  assert.equal(mixingRay([0.3525, 1, 0.014], [0, -1, 0]).length, 0);
  assert.ok(mixingRay([0.3525, 1, 0.23], [0, -1, 0])[0].point.y > 0.55);

  const pan = registry.build(await document("sloped-air-handler-condensate-drain-pan"));
  const panRay = sweepRay(t, byType(pan));
  assert.ok(panRay([0, 0.042, 1], [0, 0, -1])[0].point.z < 0.30);
  assert.ok(panRay([0.037, 0.042, 1], [0, 0, -1])[0].point.z > 0.34);
});

test("the filter cartridge is free to slide through its service slot while the air ports stay fixed", async t => {
  const filter = await document("slide-in-pleated-filter-bank-ahu-module");
  const initial = registry.build(filter);
  const node = (model, id) => model.nodes.find(item => item.metadata.compositionNodeId === id);
  const slotRay = sweepRay(t, [node(initial, "service-slot")]);
  assert.equal(slotRay([0.156, 0.311, 1], [0, 0, -1]).length, 0);
  assert.ok(slotRay([0.156, 0.58, 1], [0, 0, -1]).length > 0);
  const [animation] = filter.parameters.animations;
  filter.parameters.nodes.find(item => item.id === animation.target).transform.position = animation.to;
  const slide = registry.build(filter);
  assert.deepEqual(initial.anchors.local, slide.anchors.local);
  assert.equal(node(slide, "extract-handle").transform.position[2], node(initial, "extract-handle").transform.position[2] + 0.30);
});

test("the air-handler sample checks 59 joints and detects a mismatched condensate connection", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/air-handler-filters-coil-fans-and-condensate.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 59);
  scene.instances.find(item => item.id === "pan-drop-link").parameters.nodes[0].geometry.outsideDiameter = 0.045;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "pan-drop-link#start"],
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "clear-trap#inlet"],
  ]);
});
