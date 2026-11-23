import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/structure/${name}/manifest.json`)).editor.document;

test("the running head and rail foot have separate bearing surfaces and update with the span", async t => {
  const rail = await document("overhead-crane-runway-rail-section");
  const initial = registry.build(rail);
  const ray = sweepRay(t, initial.nodes);
  assert.ok(Math.abs(ray([1.07, 1, 0.015], [0, -1, 0])[0].point.y - 0.092) < 1e-7);
  assert.ok(Math.abs(ray([1.07, 1, 0.048], [0, -1, 0])[0].point.y - 0.014) < 1e-7);
  rail.parameters.nodes[0].geometry.length = 2.82;
  assert.deepEqual(registry.build(rail).anchors.local["running-head"], [1.41, 0.092, 0]);

  const wheel = registry.build(await document("double-flanged-crane-wheel-with-axle-bore"));
  const wheelRay = sweepRay(t, wheel.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(wheelRay([0, 0, -1], [0, 0, 1]).length, 0);
  assert.ok(wheelRay([0.04, 0, -1], [0, 0, 1]).length > 0);
});

test("a hook latch turns independently of the forging and suspension", async () => {
  const hook = await document("rotary-safety-latch-crane-hook");
  const [animation] = hook.parameters.animations;
  const before = registry.build(hook);
  hook.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const after = registry.build(hook);
  const get = (model, id) => model.nodes.find(node => node.metadata.compositionNodeId === id);
  assert.deepEqual(after.anchors.local, before.anchors.local);
  assert.deepEqual(get(after, "hook-steel-bend"), get(before, "hook-steel-bend"));
  assert.ok(get(after, "retainer").geometry.end[0] < get(before, "retainer").geometry.end[0]);
});

test("the runway sample checks 51 contacts and detects a displaced wheel at both interfaces", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/overhead-crane-runway-and-lifting-details.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 51);
  scene.instances.find(item => item.id === "near-wheel-0").transform.position[1] += 0.01;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "near-wheel-0#tread"],
    ["SCENE_CONNECTION_GAP", "near-wheel-0#face"],
  ]);
});
