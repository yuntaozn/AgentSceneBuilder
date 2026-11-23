import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/site/${name}/manifest.json`)).editor.document;

test("the wash manifold has open side branches and the wash deck has a through outlet", async t => {
  const manifold = registry.build(await document("four-port-side-wheel-wash-spray-manifold"));
  const ray = sweepRay(t, manifold.nodes.filter(node => node.geometry.type === "sweep"));
  for (const z of [-0.483, -0.161, 0.161, 0.483]) {
    assert.ok(ray([0.2, 0.273, z], [-1, 0, 0])[0].point.x < 0);
  }
  const grid = registry.build(await document("cross-slotted-construction-wheel-wash-platform"));
  const byId = id => grid.nodes.find(node => node.metadata.compositionNodeId === id);
  const outletRay = sweepRay(t, [byId("open-waste-wall")]);
  assert.equal(outletRay([1, 0.055, 0], [-1, 0, 0]).length, 0);
  assert.ok(outletRay([1, 0.055, 0.06], [-1, 0, 0]).length > 0);
  const treadRay = sweepRay(t, [byId("slotted-wheel-track-0")]);
  assert.equal(treadRay([-0.518, 1, -0.572], [0, -1, 0]).length, 0);
  assert.ok(treadRay([-0.406, 1, -0.572], [0, -1, 0]).length > 0);
});

test("the cable protector opens from its hinge without moving the channels", async () => {
  const model = await document("hinged-three-channel-site-cable-protector");
  const built = registry.build(model);
  const [animation] = model.parameters.animations;
  model.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const opened = registry.build(model);
  const node = (scene, id) => scene.nodes.find(item => item.metadata.compositionNodeId === id);
  assert.deepEqual(built.anchors.local, opened.anchors.local);
  assert.deepEqual(node(built, "rubber-base"), node(opened, "rubber-base"));
  assert.ok(node(opened, "upper-lid").transform.position[1] > node(built, "upper-lid").transform.position[1] + 0.08);
});

test("the site inspection sample checks 54 interfaces and a nozzle mismatch identifies its exact joint", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/site-inspection-washdown-protection-and-services.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 54);
  scene.instances.find(item => item.id === "spray-nozzle-right-3").parameters.anchors.inlet.outsideDiameter = 0.03;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "spray-nozzle-right-3#inlet"],
  ]);
});
