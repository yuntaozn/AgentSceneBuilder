import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { importEditableScene } from "../apps/editor/scene-import.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const model = async name => (await readJson(`../registry/components/structure/${name}/manifest.json`)).editor.document;
const sweepNodes = build => build.nodes.filter(node => node.geometry.type === "sweep");
const nodeId = node => node.metadata.compositionNodeId;

test("movement joint drain and damper eye have clear geometric bores", async t => {
  const gutter = core.build(await model("split-level-expansion-joint-drainage-gutter-with-center-outlet"));
  const drainRay = sweepRay(t, sweepNodes(gutter));
  assert.equal(drainRay([0, -0.3, 0], [0, 1, 0]).length, 0);
  assert.ok(drainRay([0.045, -0.3, 0], [0, 1, 0])[0].point.y < -0.1);
  const damper = core.build(await model("pin-ended-sectioned-inline-viscous-structural-damper"));
  const damperEye = sweepRay(t, damper.nodes.filter(node => nodeId(node) === "fixed-joint-eye"));
  assert.equal(damperEye([0, 0, 0.2], [0, 0, -1]).length, 0);
  assert.ok(damperEye([0, 0.021, 0.2], [0, 0, -1]).length > 0);
});

test("sliding bearing and damper moving anchors track their own mechanism strokes", async () => {
  for (const [name, moving, fixed, stroke] of [
    ["longitudinally-guided-ptfe-slip-bearing-with-side-stops", "load", "base", 0.05],
    ["pin-ended-sectioned-inline-viscous-structural-damper", "moving", "fixed", 0.081],
  ]) {
    const document = await model(name);
    const initial = core.build(document);
    const [animation] = document.parameters.animations;
    document.parameters.nodes.find(node => node.id === animation.target).transform.position = animation.to;
    const end = core.build(document);
    assert.deepEqual(end.anchors.local[fixed], initial.anchors.local[fixed]);
    assert.ok(Math.abs(end.anchors.local[moving][0] - initial.anchors.local[moving][0] - stroke) < 1e-9);
  }
});

test("movement joint example checks 49 connections and preserves the sliding test range", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/structural-movement-joints-bearings-and-dampers.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(relation => relation.connected).length, 49);
  const document = importEditableScene(scene);
  document.parameters.nodes.find(node => node.id === "moving-dowel.sliding-dowel").transform.position = [0.038, 0, 0];
  assert.equal(core.build(document).attachments.length, 49);
  const bad = scene.instances.find(item => item.id === "underdeck-gutter");
  bad.parameters.anchors.drain.outsideDiameter = 0.083;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "gutter-downpipe#start"],
  ]);
});
