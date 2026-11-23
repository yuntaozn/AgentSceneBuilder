import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("adjustable masonry cores and circular brick holes are true openings", async t => {
  const block = await doc("two-cell-hollow-masonry-block");
  const shape = block.parameters.nodes[0].geometry;
  Object.assign(shape, { length: 0.52, coreCount: 3 });
  const core = registry.build(block);
  assert.equal(core.nodes[0].geometry.holes.length, 3);
  assert.deepEqual(core.anchors.local.end, [0.52, 0, 0]);
  const coreRay = sweepRay(t, core.nodes);
  assert.equal(coreRay([0.26, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(coreRay([0.01, 1, 0], [0, -1, 0]).length > 0);
  shape.webThickness = 0.10;
  assert.equal(checkComposition(block).issues[0].path, "/parameters/nodes/0/geometry/webThickness");

  const brick = registry.build(await doc("perforated-clay-brick"));
  assert.equal(brick.nodes[0].geometry.holes.length, 10);
  const brickRay = sweepRay(t, brick.nodes);
  assert.equal(brickRay([0.04, 1, -0.115 / 6], [0, -1, 0]).length, 0);
  assert.ok(brickRay([0.04, 1, 0], [0, -1, 0]).length > 0);
});

test("a tongue seats into the next block's groove without changing nominal pitch", async t => {
  const block = registry.build(await doc("tongue-groove-block"));
  const ray = sweepRay(t, block.nodes);
  assert.deepEqual(block.anchors.local.end, [0.6, 0, 0]);
  assert.ok(ray([0.615, 1, 0], [0, -1, 0]).length > 0);
  assert.equal(ray([0.015, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(ray([0.015, 1, 0.06], [0, -1, 0]).length > 0);
});

test("masonry assembly checks 33 bonds and reports both sides of a displaced keyed unit", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/masonry-bond-and-lintel-assembly.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 33);
  scene.instances.find(item => item.id === "keyed-block-2").transform.position[0] += 0.03;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ to }) => to), ["keyed-block-2#start", "keyed-block-3#start"]);
});
