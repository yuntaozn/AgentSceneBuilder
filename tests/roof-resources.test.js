import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("a corrugated panel's center anchors track the actual crest and trough", async t => {
  const panel = await doc("corrugated-roof-panel");
  const shape = panel.parameters.nodes[0].geometry;
  Object.assign(shape, { rise: 0, corrugationCount: 5 });
  const crest = registry.build(panel);
  const hit = sweepRay(t, crest.nodes)([0, 1, shape.run / 2], [0, -1, 0])[0];
  assert.ok(Math.abs(hit.point.y - shape.ribHeight) < 1e-6);
  assert.deepEqual(crest.anchors.local["surface-center"], [0, shape.ribHeight, shape.run / 2]);
  shape.corrugationCount = 6;
  const trough = registry.build(panel);
  assert.deepEqual(trough.anchors.local["underside-center"], [0, -shape.thickness, shape.run / 2]);
  shape.corrugationCount = 6.5;
  assert.equal(checkComposition(panel).issues[0].path, "/parameters/nodes/0/geometry/corrugationCount");
});

test("roof support and opposing profile normals remain connected on both gable slopes", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/timber-gable-roof.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 27);
  const deck = scene.instances.find(instance => instance.id === "rear-deck");
  deck.parameters.nodes[0].geometry.thickness += 0.05;
  assert.ok(checkScene(scene, registry).issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === "rear-deck#underside-center"));
});

test("vent curb and weather hood keep a clear central airway up to the cover", async t => {
  const curb = registry.build(await doc("rectangular-vent-curb"));
  assert.equal(sweepRay(t, curb.nodes)([0, -1, 0], [0, 1, 0]).length, 0);
  const hood = registry.build(await doc("raised-vent-weather-hood"));
  const [cover] = sweepRay(t, hood.nodes)([0, -1, 0], [0, 1, 0]);
  assert.ok(Math.abs(cover.point.y - 0.495) < 1e-6);
});
