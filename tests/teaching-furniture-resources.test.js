import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the worktop cutouts and bench trough drain remain open through their panels", async t => {
  const tabletop = registry.build(await document("rounded-training-worktop-with-cable-grommet"));
  const ray = sweepRay(t, tabletop.nodes);
  const [x,, z] = tabletop.anchors.local["wire-hole"];
  assert.equal(ray([x, 1, z], [0, -1, 0]).length, 0);
  assert.ok(ray([x - 0.050, 1, z], [0, -1, 0]).length > 0);
  const trough = registry.build(await document("deep-laboratory-trough-with-rebated-rim"));
  const troughRay = sweepRay(t, trough.nodes);
  assert.equal(troughRay([0, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(troughRay([0.06, 1, 0], [0, -1, 0]).length > 0);
});

test("an upper drawer moves independently of its cabinet mounts and other drawers", async () => {
  const cabinet = await document("three-drawer-underbench-lab-cabinet");
  const initial = registry.build(cabinet);
  const [animation] = cabinet.parameters.animations;
  const group = cabinet.parameters.nodes.find(node => node.id === animation.target);
  assert.deepEqual(animation.from, [0, 0, 0]);
  group.transform.position = group.transform.position.map((value, index) => value + animation.to[index]);
  const moved = registry.build(cabinet);
  const part = (model, id) => model.nodes.find(node => node.metadata.compositionNodeId === id).transform.position;
  assert.deepEqual(moved.anchors.local, initial.anchors.local);
  assert.deepEqual(part(moved, "drawer-front-0"), part(initial, "drawer-front-0"));
  assert.equal(part(moved, "drawer-front-2")[2], part(initial, "drawer-front-2")[2] + 0.28);
});

test("the teaching-room scene checks 43 connections and catches both loose desk seats", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/classroom-auditorium-and-training-workbench.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 43);
  scene.instances.find(item => item.id === "tabletop-1").transform.position[1] += 0.012;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "tabletop-1#left-base"],
    ["SCENE_CONNECTION_GAP", "tabletop-1#right-base"],
  ]);
});
