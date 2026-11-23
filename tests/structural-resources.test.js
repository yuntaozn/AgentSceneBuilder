import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/structure/${name}/manifest.json`)).editor.document;

test("steel profiles retain hollow cores and update bearing anchors with section and span", async t => {
  const beam = await doc("steel-i-beam");
  const shape = beam.parameters.nodes[0].geometry;
  Object.assign(shape, { length: 4.2, sectionHeight: 0.32 });
  const built = registry.build(beam);
  assert.deepEqual(built.anchors.local["bearing-end"], [4.2, -0.16, 0]);
  assert.deepEqual(built.bounds.size, [4.2, 0.32, 0.16]);
  const hits = sweepRay(t, built.nodes);
  assert.equal(hits([-1, 0, 0.06], [1, 0, 0]).length, 0);
  assert.ok(hits([-1, 0, 0.001], [1, 0, 0]).length > 0);
  for (const name of ["rectangular-steel-tube", "round-steel-tube"]) {
    const tube = registry.build(await doc(name));
    const ray = sweepRay(t, tube.nodes);
    assert.equal(ray([-1, 0, 0], [1, 0, 0]).length, 0, name);
    assert.ok(ray([0.5, 0, 0], [0, 0, 1]).length > 0, name);
  }
  shape.flangeThickness = 0.17;
  assert.equal(checkComposition(beam).issues[0].path, "/parameters/nodes/0/geometry/flangeThickness");
});

test("each column base plate bolt position lies inside a real hole", async t => {
  const plate = await doc("bolted-base-plate");
  const shape = plate.parameters.nodes[0].geometry;
  const built = registry.build(plate);
  assert.equal(built.nodes[0].geometry.holes.length, 4);
  const hits = sweepRay(t, built.nodes);
  for (const [key, [x, , z]] of Object.entries(built.anchors.local)) {
    if (key.startsWith("bolt-")) assert.equal(hits([x, 1, z], [0, -1, 0]).length, 0, key);
  }
  assert.ok(hits([0, 1, 0], [0, -1, 0]).length > 0);
  shape.holeDiameter = 0.16;
  assert.equal(checkComposition(plate).issues[0].path, "/parameters/nodes/0/geometry/holeDiameter");
});

test("the steel bay checks pile caps, anchor bolts and column bearings together", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/steel-bay-and-piles.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 18);
  const bolt = scene.instances.find(instance => instance.id === "anchor-front-left");
  bolt.transform.position[0] += 0.05;
  const issues = checkScene(scene, registry).issues;
  assert.ok(issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === "anchor-front-left#seat"));
});
