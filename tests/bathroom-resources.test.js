import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("the countertop has separate basin and faucet cutouts and the basin is open", async t => {
  const counter = registry.build(await doc("vanity-counter-with-basin-cutouts"));
  const ray = sweepRay(t, counter.nodes);
  assert.equal(ray([0, 1, 0], [0, -1, 0]).length, 0);
  assert.equal(ray([0, 1, -0.284], [0, -1, 0]).length, 0);
  assert.ok(ray([0, 1, -0.23], [0, -1, 0]).length > 0);
  const basin = registry.build(await doc("oval-drop-in-wash-basin"));
  const walls = basin.nodes.filter(node => node.geometry.type === "lofted-surface");
  assert.ok(walls.every(({ geometry }) => !geometry.capStart && !geometry.capEnd));
  const rims = sweepRay(t, basin.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(rims([0, 1, 0], [0, -1, 0]).length, 0);
});

test("bathroom scene aligns 25 fixture links and reports a raised shower head", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/basin-and-shower-fixture-assembly.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 25);
  const head = scene.instances.find(item => item.id === "head");
  head.transform.position[1] += 0.025;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [["SCENE_CONNECTION_GAP", "head#inlet"]]);
});
