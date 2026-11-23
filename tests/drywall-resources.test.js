import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the stud and track retain voids and the gypsum edge is recessed", async t => {
  const stud = await doc("lipped-c-drywall-stud");
  const profile = registry.build(stud);
  const studRay = sweepRay(t, profile.nodes);
  assert.equal(studRay([0, -0.1, 0], [0, 1, 0]).length, 0);
  assert.ok(studRay([-0.0192, -0.1, 0], [0, 1, 0]).length > 0);
  stud.parameters.nodes[0].geometry.lipLength = 0.041;
  assert.equal(checkComposition(stud).issues[0].path, "/parameters/nodes/0/geometry/lipLength");

  const track = registry.build(await doc("u-profile-drywall-track"));
  const [trackSeat] = sweepRay(t, track.nodes)([1.2, 1, 0], [0, -1, 0]);
  assert.ok(Math.abs(trackSeat.point.y - track.anchors.local["stud-seat"][1]) < 1e-6);

  const board = registry.build(await doc("taper-edge-gypsum-board"));
  const boardRay = sweepRay(t, board.nodes);
  const front = x => boardRay([x, 1.3, 1], [0, 0, -1])[0].point.z;
  assert.ok(front(0) - front(0.59) > 0.0015);
});

test("the wall and suspended ceiling fixture aligns 25 links and both affected sides of moved furring", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/drywall-and-suspended-ceiling.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 25);
  scene.instances.find(item => item.id === "furring").transform.position[2] += 0.025;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ to }) => to), ["furring#base", "acoustic-board#mount"]);
});
