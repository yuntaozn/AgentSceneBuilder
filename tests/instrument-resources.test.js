import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/instrument/${name}/manifest.json`)).editor.document;

test("the displacement probe moves its contact point independently of its reference foot", async () => {
  const instrument = await doc("contact-displacement-gauge");
  const [stroke] = instrument.parameters.animations;
  const fixed = registry.build(instrument).anchors.local;
  const slider = instrument.parameters.nodes.find(node => node.id === stroke.target);
  slider.transform.position = stroke.to;
  const moved = registry.build(instrument).anchors.local;
  assert.deepEqual(moved.reference, fixed.reference);
  assert.deepEqual(moved["signal-out"], fixed["signal-out"]);
  assert.ok(Math.abs(moved.tip[1] - fixed.tip[1] - 0.035) < 1e-9);
});

test("embedded temperature points follow the same repeat as their probe housings", async () => {
  const instrument = await doc("three-depth-temperature-string");
  instrument.parameters.nodes.find(node => node.id === "probe").repetition.step = [0, -0.32, 0];
  const { local } = registry.build(instrument).anchors;
  assert.deepEqual(local.shallow, [0, -0.2, 0]);
  assert.deepEqual(local.middle, [0, -0.52, 0]);
  assert.ok(Math.abs(local.deep[1] + 0.84) < 1e-9);
});

test("the instrumented bay checks 23 assembled links, including independent measurement directions", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/instrumented-structure-bay.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 23);
  const gauge = scene.instances.find(item => item.id === "strain");
  gauge.parameters.anchors["measure-axis"].direction = [-1, 0, 0];
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [["SCENE_CONNECTION_DIRECTION", "strain#measure-axis"]]);
});
