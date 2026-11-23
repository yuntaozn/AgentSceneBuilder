import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async (domain, name) => (await readJson(`../registry/components/${domain}/${name}/manifest.json`)).editor.document;
const sweepNodes = build => build.nodes.filter(node => node.geometry?.type === "sweep");

test("the cross-drilled pin and the retaining nut have true openings", async t => {
  const pin = registry.build(await document("structure", "cross-drilled-clevis-pin"));
  const ray = sweepRay(t, sweepNodes(pin));
  assert.equal(ray([0, 0.012, -1], [0, 0, 1]).length, 0);
  assert.ok(ray([0.005, 0.012, -1], [0, 0, 1]).length > 0);
  const nut = registry.build(await document("structure", "nylon-insert-prevailing-torque-locknut"));
  const nutRay = sweepRay(t, sweepNodes(nut));
  assert.equal(nutRay([0, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(nutRay([0.011, 1, 0], [0, -1, 0]).length > 0);
});

test("the countersunk recess and open spring washer are visible in their actual sections", async t => {
  const socket = registry.build(await document("structure", "countersunk-hex-socket-fastener"));
  const socketRay = sweepRay(t, sweepNodes(socket));
  assert.equal(socketRay([0, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(socketRay([0.009, 1, 0], [0, -1, 0]).length > 0);
  const washer = registry.build(await document("structure", "open-split-helical-spring-washer"));
  const washerRay = sweepRay(t, sweepNodes(washer));
  assert.equal(washerRay([0.013, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(washerRay([-0.013, 1, 0], [0, -1, 0]).length > 0);
});

test("the fastener sample checks 47 joints and identifies both ends of a moved bearing washer", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/fastener-stacks-anchors-and-pin-details.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 47);
  scene.instances.find(item => item.id === "flat-bearing").transform.position[0] += 0.007;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "flat-bearing#base"],
    ["SCENE_CONNECTION_GAP", "flat-bearing-bolt#seat"],
  ]);
});
