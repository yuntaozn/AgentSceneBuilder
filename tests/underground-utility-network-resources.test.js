import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/site/${name}/manifest.json`)).editor.document;
const sweeps = model => model.nodes.filter(item => item.geometry.type === "sweep");

test("vault cores and the cable bank preserve independent through paths", async t => {
  const vaultRay = sweepRay(t, sweeps(core.build(await document("rectangular-precast-underground-service-vault-with-cored-ends"))));
  assert.equal(vaultRay([-1, 0.195, 0], [1, 0, 0]).length, 0);
  assert.ok(vaultRay([-1, 0.195, 0.16], [1, 0, 0]).length > 0);
  const ductRay = sweepRay(t, sweeps(core.build(await document("interlocking-four-way-cable-duct-bank-spacer"))));
  for (const y of [-0.077, 0.077]) for (const z of [-0.088, 0.088]) {
    assert.equal(ductRay([-0.12, y, z], [1, 0, 0]).length, 0);
  }
  assert.ok(ductRay([-0.12, 0, 0], [1, 0, 0]).length > 0);
});

test("the side channel joins the main invert and the tap saddle has a real branch bore", async t => {
  const invertRay = sweepRay(t, sweeps(core.build(await document("three-way-manhole-invert-side-channel-cutaway"))));
  assert.equal(invertRay([-0.52, 0, 0], [1, 0, 0]).length, 0);
  const side = invertRay([-0.034, 0, 0.52], [0, 0, -1]);
  assert.ok(side[0].point.z < 0);
  const tapRay = sweepRay(t, sweeps(core.build(await document("mechanical-tapping-saddle-with-real-side-outlet"))));
  assert.ok(tapRay([0, 0.20, 0], [0, -1, 0])[0].point.y < 0);
  assert.ok(tapRay([0, 0.20, 0.03], [0, -1, 0])[0].point.y > 0.14);
});

test("the outfall gate opens forwards while the pipe inlet remains still", async () => {
  const flap = await document("hinged-outfall-flap-gate-with-round-body");
  const initial = core.build(flap);
  const [animation] = flap.parameters.animations;
  const getDisc = model => model.nodes.find(item => item.metadata.compositionNodeId === "gate-disc");
  flap.parameters.nodes.find(item => item.id === animation.target).transform.rotation = animation.to;
  const open = core.build(flap);
  assert.deepEqual(open.anchors.local, initial.anchors.local);
  assert.ok(getDisc(open).transform.position[0] > getDisc(initial).transform.position[0] + 0.05);
});

test("the underground utility example enforces pipe sizes and insertion depths across 44 joints", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/underground-vault-pipe-joints-and-duct-bank.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  const { relations } = composeScene(scene, core);
  assert.equal(relations.filter(relation => relation.connected).length, 44);
  assert.equal(relations.filter(relation => relation.contract.embed >= 0.03).length, 8);
  scene.instances.find(item => item.id === "small-side-branch").parameters.nodes[0].geometry.outsideDiameter = 0.075;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "small-side-branch#start"],
  ]);
});
