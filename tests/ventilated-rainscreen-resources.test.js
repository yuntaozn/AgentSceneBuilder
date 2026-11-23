import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const model = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;
const sweeps = build => build.nodes.filter(node => node.geometry.type === "sweep");

test("stone anchor pockets are blind while the terracotta cells and ventilation slots pass through", async t => {
  const stone = sweepRay(t, sweeps(core.build(await model("grooved-backed-dry-hung-stone-facade-panel"))));
  assert.ok(stone([-0.244, 0.191, -0.08], [0, 0, 1])[0].point.z > 0.02);
  assert.ok(stone([-0.210, 0.191, -0.08], [0, 0, 1])[0].point.z < 0.001);
  const tile = sweepRay(t, sweeps(core.build(await model("open-cell-terracotta-rainscreen-tile-with-hidden-clip-grooves"))));
  for (const y of [-0.112, -0.038, 0.038, 0.112]) {
    assert.equal(tile([-0.58, y, 0.023], [1, 0, 0]).length, 0);
  }
  assert.ok(tile([-0.58, 0, 0.023], [1, 0, 0]).length > 0);
  const vents = sweepRay(t, sweeps(core.build(await model("slotted-bottom-vent-insect-screen-for-rainscreen-cavity"))));
  assert.equal(vents([-0.39, 0.018, 0.1], [0, 0, -1]).length, 0);
  assert.ok(vents([-0.36, 0.018, 0.1], [0, 0, -1]).length > 0);
});

test("the anti-lift spring tab can move while the rear face stays fixed", async () => {
  const document = await model("spring-anti-lift-retainer-clip-for-hollow-terracotta-facade-tile");
  const before = core.build(document);
  const [animation] = document.parameters.animations;
  document.parameters.nodes.find(node => node.id === animation.target).transform.position = animation.to;
  const after = core.build(document);
  const position = build => build.nodes.find(node => node.metadata.compositionNodeId === "elastic-folded-tongue").matrix[1][3];
  assert.deepEqual(after.anchors.local.rail, before.anchors.local.rail);
  assert.ok(Math.abs(position(before) - position(after) - 0.010) < 1e-9);
});

test("rainscreen sample checks 41 connections and detects a shifted stone anchor", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/ventilated-rainscreen-stone-terracotta-and-window.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(relation => relation.connected).length, 41);
  scene.instances.find(item => item.id === "stone-anchor-1").transform.position[0] += 0.012;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "stone-anchor-1#rail"],
    ["SCENE_CONNECTION_GAP", "stone-faced-spandrel#anchor-a"],
  ]);
});
