import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the ventilation row in a roll-up shutter is clear of the plain slats", async t => {
  const roller = registry.build(await doc("vented-rolling-shutter-door"));
  const height = 1.0425;
  const slats = roller.nodes.filter(node => ["slat", "upper-slat"].includes(node.metadata.compositionNodeId));
  assert.ok(slats.every(node => Math.abs(node.transform.position[1] - height) > node.geometry.size[1] / 2));
  const grille = roller.nodes.find(node => node.metadata.compositionNodeId === "vent");
  const ray = sweepRay(t, [grille]);
  assert.equal(ray([-1.011, height, 1], [0, 0, -1]).length, 0);
});

test("rotating the hinge wing leaves its fixed plate and center pin in place", async () => {
  const hinge = await doc("three-knuckle-door-butt-hinge");
  const closed = registry.build(hinge).anchors.local;
  const [animation] = hinge.parameters.animations;
  hinge.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const open = registry.build(hinge).anchors.local;
  assert.deepEqual(open.frame, closed.frame);
  assert.deepEqual(open.axis, closed.axis);
  assert.ok(open.leaf[2] > 0.02);
});

test("the door scene checks 22 joints and reports all affected slide-track interfaces", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/door-and-window-hardware-details.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 22);
  scene.instances.find(item => item.id === "slide-track").transform.position[1] += 0.03;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ to }) => to), [
    "slide-track#mount", "sliding-leaf#first-wheel", "sliding-leaf#second-wheel",
  ]);
});
