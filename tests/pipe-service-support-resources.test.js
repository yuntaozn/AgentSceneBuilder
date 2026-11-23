import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const build = async name => core.build((await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document);
const nodesById = (model, pattern) => model.nodes.filter(item => pattern.test(item.metadata.compositionNodeId));

test("the mounting slots and spring nut holes are open through the stock", async t => {
  const channel = await build("lipped-slotted-service-strut-channel");
  const webRay = sweepRay(t, nodesById(channel, /^slotted-web$/));
  assert.equal(webRay([0.16, -0.1, 0], [0, 1, 0]).length, 0);
  assert.equal(webRay([-0.24, -0.1, 0], [0, 1, 0]).length, 0);
  assert.ok(webRay([0.123, -0.1, 0], [0, 1, 0]).length > 0);
  const nut = await build("captured-spring-nut-for-lipped-strut");
  const boltRay = sweepRay(t, nodesById(nut, /^(threaded-block|bridge-washer)$/));
  assert.equal(boltRay([0, 0.04, 0], [0, -1, 0]).length, 0);
  assert.ok(boltRay([0.01, 0.04, 0], [0, -1, 0]).length > 0);
});

test("the modular seal and slab sleeve keep the carrier path open", async t => {
  const seal = await build("bolted-modular-annular-wall-seal");
  const sealRay = sweepRay(t, nodesById(seal, /^(compression-ring|gasket-link)/));
  assert.equal(sealRay([-0.2, 0.025, 0], [1, 0, 0]).length, 0);
  assert.ok(sealRay([-0.2, 0, -0.068], [1, 0, 0]).length > 0);
  assert.equal(sealRay([-0.2, 0, -0.08], [1, 0, 0]).length, 0);
  const sleeve = await build("cast-in-raised-slab-sleeve-with-seal-lip");
  const sleeveRay = sweepRay(t, nodesById(sleeve, /.+/));
  assert.equal(sleeveRay([0.047, -0.4, 0], [0, 1, 0]).length, 0);
  assert.ok(sleeveRay([0.063, -0.4, 0], [0, 1, 0]).length > 0);
});

test("service support scene checks all joints and catches a shifted pipe shoe", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/pipe-strut-support-and-penetration-details.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(relation => relation.connected).length, 43);
  scene.instances.find(instance => instance.id === "fixed-shoe").transform.position[1] += 0.03;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "fixed-shoe#base"],
    ["SCENE_CONNECTION_GAP", "shoe-supported-supply#fixed-shoe"],
  ]);
});
