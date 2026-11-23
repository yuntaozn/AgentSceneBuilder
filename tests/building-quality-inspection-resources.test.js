import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async (folder, name) => (await readJson(`../registry/components/${folder}/${name}/manifest.json`)).editor.document;

test("the debonded tile specimen and the floor annular cut have real gaps", async t => {
  const facade = registry.build(await document("construction", "localized-debonded-facade-tile-cutaway-coupon"));
  const adhesive = facade.nodes.find(node => node.metadata.compositionNodeId === "adhesive-with-internal-gap");
  const voidRay = sweepRay(t, [adhesive]);
  assert.equal(voidRay([0.059, 0.280, 1], [0, 0, -1]).length, 0);
  assert.ok(voidRay([0.2, 0.280, 1], [0, 0, -1]).length > 0);

  const floor = registry.build(await document("instrument", "annular-cut-floor-adhesion-test-coupon"));
  const finish = floor.nodes.find(node => node.metadata.compositionNodeId === "surface-with-isolated-field");
  const floorRay = sweepRay(t, [finish]);
  assert.equal(floorRay([0.044, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(floorRay([0.06, 1, 0], [0, -1, 0]).length > 0);
});

test("gimbal rotation moves both lens datums and crack-slide motion moves only its right tab", async () => {
  const head = await document("instrument", "dual-spectrum-inspection-gimbal-camera-head");
  const upright = registry.build(head);
  const tilt = head.parameters.animations.find(animation => animation.target === "pitch-base");
  head.parameters.nodes.find(node => node.id === tilt.target).transform.rotation = tilt.to;
  const lowered = registry.build(head);
  assert.deepEqual(upright.anchors.local.mount, lowered.anchors.local.mount);
  for (const name of ["rgb-view", "ir-view"]) {
    assert.ok(lowered.anchors.local[name][1] < upright.anchors.local[name][1] - 0.02);
  }

  const card = await document("instrument", "sliding-dual-plate-crack-displacement-monitor");
  const initial = registry.build(card);
  const [slide] = card.parameters.animations;
  card.parameters.nodes.find(node => node.id === slide.target).transform.position = slide.to;
  const moved = registry.build(card);
  assert.deepEqual(initial.anchors.local["wall-left"], moved.anchors.local["wall-left"]);
  assert.equal(moved.anchors.local["wall-right"][0], initial.anchors.local["wall-right"][0] + 0.013);
});

test("the inspection scene checks 33 relationships and reports both misaligned dolly interfaces", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/floor-adhesion-and-facade-inspection-coupons.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 33);
  scene.instances.find(item => item.id === "steel-dolly").transform.position[0] += 0.01;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "steel-dolly#surface"],
    ["SCENE_CONNECTION_GAP", "mechanical-pull-head#dolly"],
  ]);
});
