import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("firestop model has a physical pipe passage and cabinet animation leaves the connection fixed", async t => {
  const collar = registry.build(await doc("split-firestop-pipe-collar"));
  const ray = sweepRay(t, collar.nodes);
  assert.equal(ray([0, 0, -1], [0, 0, 1]).length, 0);
  assert.ok(ray([0.069, 0.019, -1], [0, 0, 1]).length > 0);
  const cabinet = await doc("hinged-fire-hose-service-cabinet");
  const closed = registry.build(cabinet);
  const [animation] = cabinet.parameters.animations;
  cabinet.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const open = registry.build(cabinet);
  assert.deepEqual(open.anchors.local, closed.anchors.local);
  assert.ok(open.nodes.find(node => node.metadata.compositionNodeId === "door-window").transform.position[2] > 0.52);
});

test("the fire-service sample checks 19 joints and a sprinkler connection reports diameter errors", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/fire-service-and-egress-modeling.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 19);
  scene.instances.find(item => item.id === "drop-nipple").parameters.nodes[0].geometry.outsideDiameter = 0.031;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "drop-nipple#start"],
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "recessed-sprinkler#inlet"],
  ]);
});
