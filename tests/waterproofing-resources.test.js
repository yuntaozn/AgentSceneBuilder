import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the wall scupper and hollow waterstop preserve their continuous openings", async t => {
  const scupper = sweepRay(t, registry.build(await doc("parapet-through-scupper")).nodes);
  assert.equal(scupper([0, 0, -1], [0, 0, 1]).length, 0);
  assert.ok(scupper([0.108, 0, -1], [0, 0, 1]).length > 0);
  const waterstop = sweepRay(t, registry.build(await doc("center-bulb-waterstop-strip")).nodes);
  assert.equal(waterstop([-1, 0, 0], [1, 0, 0]).length, 0);
  assert.ok(waterstop([-1, 0.023, 0], [1, 0, 0]).length > 0);
});

test("rainwater assembly checks 15 links and both ends of a misplaced fixing band", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/roof-rainwater-and-waterproofing.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 15);
  scene.instances.find(item => item.id === "wall-band").transform.position[2] += 0.03;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "wall-band#pipe-axis"],
    ["SCENE_CONNECTION_GAP", "wall-band#wall-seat"],
  ]);
});
