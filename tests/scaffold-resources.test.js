import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the rosette plate leaves its four main holes and moves its anchors with the repeat", async t => {
  const standard = await doc("ringlock-scaffold-standard");
  const rosette = standard.parameters.nodes.find(node => node.id === "rosette");
  rosette.repetition.step = [0, 0.45, 0];
  const built = registry.build(standard);
  assert.deepEqual(built.anchors.local["ring-5-east"], [0.062, 2, 0]);
  const first = built.nodes.find(node => node.metadata.occurrenceRef === "rosette[0]");
  assert.equal(first.geometry.holes.length, 9);
  const ray = sweepRay(t, [first]);
  assert.equal(ray([0.053, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(ray([0.036, 1, 0], [0, -1, 0]).length > 0);
});

test("swiveling the coupler changes only the direction of the second bore", async () => {
  const source = await doc("swivel-scaffold-tube-coupler");
  const fixed = registry.build(source).anchors.definitions;
  const [animation] = source.parameters.animations;
  source.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const rotated = registry.build(source).anchors.definitions;
  assert.deepEqual(rotated["stationary-axis"], fixed["stationary-axis"]);
  assert.deepEqual(rotated["variable-axis"].position, fixed["variable-axis"].position);
  assert.ok(Math.abs(rotated["variable-axis"].direction[1] - Math.sin(0.55)) < 1e-9);
});

test("the scaffold bay checks 39 joints and a displaced deck support identifies both kinds of affected interfaces", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/temporary-scaffold-and-site-perimeter.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 39);
  scene.instances.find(item => item.id === "crossbar-west").transform.position[1] += 0.035;
  const affected = checkScene(scene, registry).issues.map(issue => issue.to);
  assert.ok(affected.includes("crossbar-west#start"));
  assert.ok(affected.includes("deck-4#near"));
});
