import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("the guide rail updates its end splice and head references when dimensions change", async () => {
  const rail = await document("elevator-t-guide-rail-section");
  const geometry = rail.parameters.nodes[0].geometry;
  Object.assign(geometry, { length: 2.3, bladeDepth: 0.075, spliceInset: 0.08 });
  const built = registry.build(rail);
  assert.deepEqual(built.anchors.local.end, [0, 2.3, 0]);
  assert.deepEqual(built.anchors.local["splice-end"], [0, 2.3 - 0.08, 0]);
  assert.deepEqual(built.anchors.local.guide, [0, 1.15, 0.075 + 0.013]);
});

test("both sill guides are real recesses and the sliding guide shoe has an open throat", async t => {
  const sill = registry.build(await document("double-groove-elevator-landing-sill"));
  const sillRay = sweepRay(t, sill.nodes.filter(node => node.geometry.type === "sweep"));
  for (const name of ["first-guide", "second-guide", "top"]) {
    const point = sill.anchors.local[name];
    const contact = sillRay([0, 1, point[2]], [0, -1, 0])[0];
    assert.ok(Math.abs(contact.point.y - point[1]) < 1e-7);
  }
  const shoe = registry.build(await document("lined-elevator-sliding-guide-shoe"));
  const shoeRay = sweepRay(t, shoe.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(shoeRay([0, -1, -0.025], [0, 1, 0]).length, 0);
  assert.ok(shoeRay([0.05, -1, -0.025], [0, 1, 0]).length > 0);
});

test("moving a telescoping leaf preserves the installation datums and the other leaf", async () => {
  const door = await document("two-leaf-telescoping-elevator-landing-door");
  const before = registry.build(door);
  const [animation] = door.parameters.animations;
  assert.deepEqual(animation.from, [0, 0, 0]);
  const target = door.parameters.nodes.find(node => node.id === animation.target);
  target.transform.position = target.transform.position.map((value, index) => value + animation.to[index]);
  const after = registry.build(door);
  const placement = (compiled, id) => compiled.nodes.find(node => node.metadata.compositionNodeId === id).transform.position;
  assert.deepEqual(after.anchors.local, before.anchors.local);
  assert.deepEqual(placement(after, "outer-leaf-panel"), placement(before, "outer-leaf-panel"));
  assert.equal(placement(after, "inner-leaf-panel")[0], placement(before, "inner-leaf-panel")[0] - 0.505);
});

test("the shaft sample checks 63 relationships including rail splices and door guides", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/elevator-shaft-guide-and-landing-assembly.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 63);
  scene.instances.find(item => item.id === "landing-sill").transform.position[1] += 0.01;
  const issues = checkScene(scene, registry).issues;
  for (const target of ["landing-sill#support-left", "landing-sill#support-right", "landing-door#first-guide", "landing-door#second-guide"]) {
    assert.ok(issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === target));
  }
});
