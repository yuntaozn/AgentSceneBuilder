import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async (group, name) => (await readJson(`../registry/components/${group}/${name}/manifest.json`)).editor.document;

test("open purlins retain distinct support offsets and recalculate end features", async t => {
  const channel = await document("structure", "cold-formed-c-purlin");
  const zee = await document("structure", "cold-formed-z-purlin");
  const c = registry.build(channel), z = registry.build(zee);
  assert.ok(c.anchors.local["bearing-start"][2] < 0);
  assert.ok(z.anchors.local["bearing-start"][2] > 0);
  const ray = sweepRay(t, c.nodes);
  assert.equal(ray([-1, 0.076, -0.033], [1, 0, 0]).length, 0);
  assert.ok(ray([-1, 0.076, 0], [1, 0, 0]).length > 0);
  Object.assign(channel.parameters.nodes[0].geometry, { length: 2.2, bearingInset: 0.15 });
  assert.equal(registry.build(channel).anchors.local["bearing-end"][0], 2.2 - 0.15);
});

test("the cellular web and eave bird plate have physical openings", async t => {
  const beam = await document("structure", "flanged-cellular-steel-beam-with-circular-openings");
  const built = registry.build(beam);
  const node = built.nodes.find(item => item.metadata.compositionNodeId === "perforated-web");
  const ray = sweepRay(t, [node]);
  const [x, y] = built.anchors.local["first-hole"];
  assert.equal(ray([x, y, -1], [0, 0, 1]).length, 0);
  assert.ok(ray([x, y + 0.095, -1], [0, 0, 1]).length > 0);
  beam.parameters.nodes[0].geometry.openingDiameter = 0.29;
  assert.ok(checkComposition(beam).issues.some(issue => issue.path === "/parameters/nodes/0/geometry/openingDiameter"));

  const guard = registry.build(await document("construction", "perforated-metal-roof-eave-bird-guard-strip"));
  const guardRay = sweepRay(t, guard.nodes.filter(item => item.geometry.type === "sweep"));
  assert.equal(guardRay([0.0455, 0.041, -1], [0, 0, 1]).length, 0);
  assert.ok(guardRay([0, 0.041, -1], [0, 0, 1]).length > 0);
});

test("the industrial steel sample checks 54 connections and identifies both moved purlin seats", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/steel-industrial-frame-and-envelope-details.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 54);
  scene.instances.find(item => item.id === "continuous-c-purlin").transform.position[0] += 0.01;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "continuous-c-purlin#bearing-start"],
    ["SCENE_CONNECTION_GAP", "continuous-c-purlin#bearing-end"],
  ]);
});
