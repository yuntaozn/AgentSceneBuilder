import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("rack slots go through the face and the back of the upright stays open", async t => {
  const upright = registry.build(await document("teardrop-slotted-pallet-rack-upright"));
  const ray = sweepRay(t, upright.nodes);
  for (const y of [0.475, 1.238]) {
    assert.equal(ray([0.022, y, -1], [0, 0, 1]).length, 0);
    assert.equal(ray([-0.022, y, -1], [0, 0, 1]).length, 0);
    const center = ray([0, y, -1], [0, 0, 1]);
    assert.ok(center[0].point.z > 0.03);
  }
});

test("the moving dock deck carries its lip while the pit frame remains fixed", async () => {
  const dock = await document("hinged-loading-dock-leveller-with-separate-lip");
  const [deckAnimation, lipAnimation] = dock.parameters.animations;
  const before = registry.build(dock);
  dock.parameters.nodes.find(node => node.id === deckAnimation.target).transform.rotation = deckAnimation.to;
  const lifted = registry.build(dock);
  dock.parameters.nodes.find(node => node.id === lipAnimation.target).transform.rotation = lipAnimation.to;
  const folded = registry.build(dock);
  const part = (model, id) => model.nodes.find(node => node.metadata.compositionNodeId === id);
  assert.deepEqual(part(lifted, "pit-frame"), part(before, "pit-frame"));
  assert.ok(part(lifted, "front-lip").transform.position[1] > part(before, "front-lip").transform.position[1] + 0.1);
  assert.notDeepEqual(part(folded, "front-lip").matrix, part(lifted, "front-lip").matrix);
  assert.deepEqual(part(folded, "deck").matrix, part(lifted, "deck").matrix);
});

test("the warehouse model connects 71 interfaces and reports both ends of a displaced transfer table", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/warehouse-rack-conveyor-and-loading-dock.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 71);
  scene.instances.find(item => item.id === "transfer-balls").transform.position[0] += 0.02;
  const issues = checkScene(scene, registry).issues;
  for (const to of ["transfer-balls#start", "corner-rollers#start", "transfer-balls#base", "conveyor-tote#base"]) {
    assert.ok(issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === to));
  }
});
