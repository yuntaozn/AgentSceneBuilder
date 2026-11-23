import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/site/${name}/manifest.json`)).editor.document;

test("the road crown connects to two lower edges and the V gutter is open from above", async t => {
  const road = await doc("crowned-asphalt-road-segment");
  road.parameters.nodes[0].geometry.crownHeight = 0.094;
  const built = registry.build(road);
  const cast = sweepRay(t, built.nodes);
  const top = z => cast([2.4, 1, z], [0, -1, 0])[0].point.y;
  assert.ok(Math.abs(top(0) - 0.094) < 1e-6);
  assert.ok(top(1.4) > top(2.89));
  assert.ok(Math.abs(top(1.4) - top(-1.4)) < 1e-9);
  assert.deepEqual(built.anchors.local["edge-positive-z"], [2.4, 0, 2.9]);
  const gutter = registry.build(await doc("shallow-v-roadside-gutter"));
  assert.ok(Math.abs(sweepRay(t, gutter.nodes)([1.2, 1, 0], [0, -1, 0])[0].point.y + 0.054) < 1e-6);

  const wall = await doc("cantilever-l-retaining-wall");
  wall.parameters.nodes[0].geometry.capThickness = 0.30;
  assert.equal(checkComposition(wall).issues[0].path, "/parameters/nodes/0/geometry/capThickness");
});

test("the civil scene checks 19 joints and reports mismatched crowns between sections", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/roadside-crossing-retaining-stormwater.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 19);
  scene.instances.find(item => item.id === "road-east").parameters.nodes[0].geometry.crownHeight = 0.098;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [["SCENE_CONNECTION_GAP", "road-east#start"]]);
});
