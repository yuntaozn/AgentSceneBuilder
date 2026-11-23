import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const model = async name => (await readJson(`../registry/components/site/${name}/manifest.json`)).editor.document;
const sweeps = build => build.nodes.filter(node => node.geometry.type === "sweep");

test("induction loop is recessed in the road and all four vertical hump anchor holes open", async t => {
  const loop = sweepRay(t, sweeps(core.build(await model("pavement-induction-loop-cut-slot-and-wire-coupon"))));
  assert.ok(loop([0.546, 0.2, 0], [0, -1, 0])[0].point.y < -0.020);
  assert.ok(loop([0.500, 0.2, 0], [0, -1, 0])[0].point.y > -0.001);
  const hump = sweepRay(t, sweeps(core.build(await model("interlocking-modular-rubber-speed-hump-middle-section"))));
  for (const x of [-0.051, 0.051]) for (const z of [-0.167, 0.167]) {
    assert.equal(hump([x, 0.2, z], [0, -1, 0]).length, 0);
  }
  assert.ok(hump([0, 0.2, 0.03], [0, -1, 0]).length > 0);
});

test("the raised barrier carries its end cap and reflectors around the fixed pivot", async () => {
  const arm = await model("breakaway-hinged-parking-barrier-arm-with-reflector-bands");
  const closed = core.build(arm);
  const [animation] = arm.parameters.animations;
  arm.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const raised = core.build(arm);
  const position = (state, id) => state.nodes.find(node => node.metadata.compositionNodeId === id).transform.position;
  assert.deepEqual(raised.anchors.local.pivot, closed.anchors.local.pivot);
  assert.ok(position(raised, "rubber-safe-tip")[1] > position(closed, "rubber-safe-tip")[1] + 1.7);
  assert.ok(position(raised, "reflector-11")[1] > 1.2);
});

test("parking, accessible signage and charge bay check 36 connections", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/parking-access-slow-streets-and-ev-bays.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(item => item.connected).length, 36);
  scene.instances.find(item => item.id === "accessibility-sign").transform.position[1] += 0.012;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "accessibility-sign#mountA"],
    ["SCENE_CONNECTION_GAP", "accessibility-sign#mountB"],
  ]);
});
