import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/structure/${name}/manifest.json`)).editor.document;

test("the CLT floor alternates five timber plies and the rafter's seat is a physical notch", async t => {
  const wood = registry.build(await doc("five-ply-clt-floor-panel"));
  assert.deepEqual(wood.repetitions.map(group => group.occurrenceCount), [6, 18, 6, 18, 6]);
  assert.ok(Math.abs(wood.bounds.size[1] - 0.14) < 1e-9);
  const first = wood.nodes.find(node => node.metadata.compositionNodeId === "ply-1");
  const second = wood.nodes.find(node => node.metadata.compositionNodeId === "ply-2");
  assert.ok(first.geometry.size[0] > first.geometry.size[2]);
  assert.ok(second.geometry.size[2] > second.geometry.size[0]);

  const rafter = registry.build(await doc("birdsmouth-notched-timber-rafter"));
  const cast = sweepRay(t, rafter.nodes);
  const [seat] = cast([0, -1, 0.195], [0, 1, 0]);
  assert.ok(Math.abs(seat.point.y - rafter.anchors.local["wall-plate-seat"][1]) < 1e-6);
});

test("the timber assembly checks 21 joints and both bearing faces of a misplaced shoe", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/timber-floor-and-joint-details.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 21);
  scene.instances.find(item => item.id === "front-left-shoe").transform.position[1] += 0.05;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ to }) => to), ["front-left-shoe#mount", "front-left-post#base-center"]);
});
