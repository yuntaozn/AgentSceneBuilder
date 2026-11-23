import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/site/${name}/manifest.json`)).editor.document;

test("tree grate slots and the retention panel cup are open through their modelled contours", async t => {
  const grate = registry.build(await document("split-radial-slot-tree-pit-grating"));
  const ray = sweepRay(t, grate.nodes);
  assert.equal(ray([0, 1, 0.04], [0, -1, 0]).length, 0);
  const angle = 0.255;
  assert.equal(ray([-0.349 * Math.cos(angle), 1, 0.349 * Math.sin(angle)], [0, -1, 0]).length, 0);
  assert.ok(ray([0, 1, 0.478], [0, -1, 0]).length > 0);

  const cups = registry.build(await document("green-roof-drainage-and-retention-cup-mat"));
  const cupRay = sweepRay(t, cups.nodes);
  assert.equal(cupRay([0.045, 1, 0.117], [0, -1, 0]).length, 0);
  assert.ok(cupRay([0.045, 1, 0.131], [0, -1, 0]).length > 0);

  const curb = registry.build(await document("quarter-circle-tree-pit-curb"));
  const [x,, z] = curb.anchors.local.seat;
  assert.ok(Math.abs(Math.hypot(x, z) - 0.475) < 1e-8);
});

test("the drip branch is open to its main and a pop-up stem remains independent of the inlet", async t => {
  const main = registry.build(await document("barbed-drip-irrigation-branch-tee"));
  const ray = sweepRay(t, main.nodes);
  const hits = ray([0.042, 0, 0.1], [0, 0, -1]);
  assert.ok(hits[0].point.z < 0);
  assert.equal(ray([-1, 0, 0], [1, 0, 0]).length, 0);

  const sprinkler = await document("retracting-pop-up-landscape-sprinkler");
  const before = registry.build(sprinkler);
  const [animation] = sprinkler.parameters.animations;
  sprinkler.parameters.nodes.find(node => node.id === animation.target).transform.position = animation.to;
  const after = registry.build(sprinkler);
  assert.deepEqual(after.anchors.local, before.anchors.local);
  const disc = model => model.nodes.find(node => node.metadata.compositionNodeId === "spray-disc").geometry;
  assert.equal(disc(after).end[1] - disc(before).end[1], 0.077);
});

test("the landscape example checks 57 attachments and reports both mismatched ends of a lateral line", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/landscape-tree-pit-green-roof-and-irrigation.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 57);
  scene.instances.find(item => item.id === "tee-to-emitter").parameters.nodes[0].geometry.outsideDiameter = 0.020;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "tee-to-emitter#start"],
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "drip-emitter#start"],
  ]);
});
