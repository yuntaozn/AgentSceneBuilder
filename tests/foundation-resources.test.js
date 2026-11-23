import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/${name}/manifest.json`)).editor.document;

test("formwork ties fit four physical holes and the cup footing leaves a central recess", async t => {
  const panel = registry.build(await doc("construction/drilled-tie-formwork-panel"));
  const panelRay = sweepRay(t, panel.nodes.filter(node => node.geometry.type === "sweep"));
  for (const [name, [x, y]] of Object.entries(panel.anchors.local)) {
    if (name.startsWith("tie-")) assert.equal(panelRay([x, y, -1], [0, 0, 1]).length, 0, name);
  }
  assert.ok(panelRay([0, 0.22, -1], [0, 0, 1]).length > 0);
  const footing = registry.build(await doc("structure/socketed-column-footing"));
  const cupRay = sweepRay(t, footing.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(cupRay([0, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(cupRay([0.33, 1, 0], [0, -1, 0]).length > 0);
  assert.deepEqual(footing.anchors.local["socket-bottom"], [0, 0.22, 0]);
});

test("the foundation example aligns 25 links and reports a displaced through-tie at both panels", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/foundation-rebar-and-formwork.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 25);
  const movedTie = scene.instances.find(item => item.id === "tie-left-lower");
  movedTie.transform.position[1] += 0.02;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "tie-left-lower#front-hole"],
    ["SCENE_CONNECTION_GAP", "tie-left-lower#rear-hole"],
  ]);
});
