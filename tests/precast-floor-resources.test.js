import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/structure/${name}/manifest.json`)).editor.document;

test("precast hollow-core bores are open and their descriptors stay in sync with dimensions", async t => {
  const slab = await doc("precast-hollow-core-slab");
  const output = registry.build(slab);
  const ray = sweepRay(t, output.nodes);
  for (const z of [-0.27, -0.09, 0.09, 0.27]) {
    assert.equal(ray([-1, 0.0925, z], [1, 0, 0]).length, 0);
  }
  assert.ok(ray([-1, 0.0925, 0], [1, 0, 0]).length > 0);

  const geometry = slab.parameters.nodes[0].geometry;
  Object.assign(geometry, { width: 0.96, length: 3.1, voidCount: 5, bearingInset: 0.15 });
  const resized = registry.build(slab);
  assert.equal(resized.nodes[0].geometry.holes.length, 5);
  assert.equal(resized.anchors.local["bearing-start"][0], 0.15);
  assert.equal(resized.anchors.local["bearing-end"][0], 3.1 - 0.15);
  assert.equal(resized.anchors.local["key-near"][2], 0.48);
  geometry.voidDiameter = 0.19;
  assert.ok(checkComposition(slab).issues.some(issue => issue.path === "/parameters/nodes/0/geometry/voidDiameter"));
});

test("dapped beam cutaways and the concrete topping match their corresponding supports", async t => {
  const beam = registry.build(await doc("precast-dapped-end-beam"));
  const beamRay = sweepRay(t, beam.nodes);
  assert.equal(beamRay([0.10, 0.10, -1], [0, 0, 1]).length, 0);
  assert.ok(beamRay([0.27, 0.10, -1], [0, 0, 1]).length > 0);
  assert.equal(beam.anchors.local["bearing-start"][1], 0.145);

  const deck = registry.build(await doc("ribbed-composite-deck-sheet"));
  const topping = registry.build(await doc("ribbed-concrete-topping-for-metal-deck"));
  const firstCrown = deck.anchors.local["crown-first"][2];
  const sheetRay = sweepRay(t, deck.nodes);
  const concreteRay = sweepRay(t, topping.nodes);
  for (const z of [firstCrown, 0, -firstCrown]) {
    const sheetTop = sheetRay([0.8, 0.10, z], [0, -1, 0])[0].point.y;
    const concreteBottom = concreteRay([0.8, -0.10, z], [0, 1, 0])[0].point.y;
    assert.ok(Math.abs(sheetTop - concreteBottom) < 1e-7);
  }
});

test("the precast example checks its 62 joints and detects two broken bearing contacts", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/precast-hollow-core-double-tee-and-metal-deck.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 62);
  scene.instances.find(item => item.id === "beam-end-pad-end").transform.position[1] += 0.01;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "beam-end-pad-end#base"],
    ["SCENE_CONNECTION_GAP", "dapped-beam#bearing-end"],
  ]);
});
