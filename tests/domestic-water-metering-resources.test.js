import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;
const sweeps = model => model.nodes.filter(item => item.geometry.type === "sweep");

test("the meter unions, relief port, and service branch have actual bores", async t => {
  const meter = core.build(await document("opposed-probe-inline-ultrasonic-water-meter"));
  const meterRay = sweepRay(t, sweeps(meter));
  assert.equal(meterRay([-0.1, 0.007, 0], [1, 0, 0]).length, 0);
  assert.ok(meterRay([-0.1, 0.017, 0], [1, 0, 0]).length > 0);
  const backflow = core.build(await document("relief-port-dual-check-backflow-preventer"));
  const reliefRay = sweepRay(t, sweeps(backflow));
  assert.ok(reliefRay([0.153, -0.08, 0], [0, 1, 0])[0].point.y > 0.03);
  assert.ok(reliefRay([0.168, -0.08, 0], [0, 1, 0])[0].point.y <= -0.03);
  const tee = core.build(await document("straight-service-tee-with-twenty-millimeter-branch"));
  const teeRay = sweepRay(t, sweeps(tee));
  assert.equal(teeRay([-0.1, 0, 0], [1, 0, 0]).length, 0);
  assert.ok(teeRay([0.04, 0.10, 0], [0, -1, 0])[0].point.y < 0);
});

test("the hot water return probe inserts into its blind pocket and the service cup withdraws independently", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/domestic-water-metering-and-hot-water-return.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(relation => relation.connected).length, 52);
  const cup = await document("drop-pot-inline-basket-strainer");
  const initial = core.build(cup);
  const find = (model, id) => model.nodes.find(item => item.metadata.compositionNodeId === id);
  const [animation] = cup.parameters.animations;
  const group = cup.parameters.nodes.find(item => item.id === animation.target);
  group.transform.position = group.transform.position.map((value, axis) => value + animation.to[axis]);
  const open = core.build(cup);
  assert.deepEqual(open.anchors.local, initial.anchors.local);
  assert.ok(Math.abs(find(open, "screen-foot").transform.position[1] - find(initial, "screen-foot").transform.position[1] + 0.089) < 1e-12);
  const main = scene.instances.find(item => item.id === "auto-vent");
  main.parameters.anchors.inlet.outsideDiameter = 0.026;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "auto-vent#inlet"],
  ]);
});
