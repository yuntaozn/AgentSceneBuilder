import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { transformVectorMatrix } from "../packages/core/src/math.js";
import { importEditableScene } from "../apps/editor/scene-import.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;
const beamDirection = node => transformVectorMatrix([0, 0, -1], node.matrix);

test("track spotlight movement aims the light with the head and keeps the adapter stationary", async () => {
  const lamp = await document("tilting-track-spotlight-with-adapter");
  const before = registry.build(lamp);
  const [animation] = lamp.parameters.animations;
  lamp.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const after = registry.build(lamp);
  assert.deepEqual(before.anchors.local.seat, after.anchors.local.seat);
  assert.deepEqual(before.nodes[0].matrix, after.nodes[0].matrix);
  const direction = build => beamDirection(build.nodes.find(node => node.light));
  assert.ok(direction(before)[1] < -0.99);
  assert.ok(direction(after)[0] > 0.60);
  assert.ok(direction(after)[1] < -0.75);

  const stepLight = registry.build(await document("recessed-asymmetric-step-light"));
  const [, y, z] = direction(stepLight);
  assert.ok(y < -0.30 && z > 0.9, "step light must point down and away from the wall");
});

test("the ceiling-box conduit reaches the chamber through the side wall", async t => {
  const box = registry.build(await document("octagonal-luminaire-ceiling-junction-box"));
  const ray = sweepRay(t, box.nodes.filter(node => node.geometry.type === "sweep"));
  assert.ok(ray([0.20, 0.028, 0], [-1, 0, 0])[0].point.x < 0);
  assert.ok(ray([0.20, 0.045, 0], [-1, 0, 0])[0].point.x > 0.04);
});

test("the lighting sample checks 27 connections and imports its 22 light nodes", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/ceiling-and-wall-lighting-fixtures.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 27);
  const imported = registry.build(importEditableScene(scene));
  assert.equal(imported.nodes.filter(node => node.kind === "light").length, 22);
  scene.instances.find(item => item.id === "track-run-two").transform.rotation[1] = 0;
  assert.ok(checkScene(scene, registry).issues.some(issue =>
    issue.code === "SCENE_CONNECTION_DIRECTION" && issue.to === "track-run-two#start"));
});
