import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("the standing-seam jaw and the two roof cable entries have open paths", async t => {
  const clamp = registry.build(await document("standing-seam-roof-pv-rail-clamp"));
  const jaw = clamp.nodes.find(node => node.metadata.compositionNodeId === "clamp-block");
  const jawRay = sweepRay(t, [jaw]);
  assert.equal(jawRay([0, 0.04, -1], [0, 0, 1]).length, 0);
  assert.ok(jawRay([0.021, 0.04, -1], [0, 0, 1]).length > 0);
  assert.ok(jawRay([0, 0.051, -1], [0, 0, 1]).length > 0);

  const gland = registry.build(await document("dual-entry-photovoltaic-roof-cable-gland"));
  const ray = sweepRay(t, gland.nodes);
  for (const key of ["left-port", "right-port"]) {
    const [x,, z] = gland.anchors.local[key];
    assert.equal(ray([x, 1, z], [0, -1, 0]).length, 0);
    assert.ok(ray([x + 0.012, 1, z], [0, -1, 0]).length > 0);
  }
});

test("combiner door motion keeps field access and fixed cable ports independent", async () => {
  const box = await document("hinged-photovoltaic-string-combiner-box");
  const closed = registry.build(box);
  const [animation] = box.parameters.animations;
  box.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const open = registry.build(box);
  assert.deepEqual(open.anchors.local, closed.anchors.local);
  const panel = build => build.nodes.find(node => node.metadata.compositionNodeId === "front-door").transform.position;
  assert.ok(panel(open)[2] > panel(closed)[2] + 0.15);
});

test("the two roof arrays check 78 relationships and locate gaps around a moved clamp", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/roof-photovoltaic-mounting-and-cable-assembly.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 78);
  scene.instances.find(item => item.id === "mid-clamp-front").transform.position[1] += 0.01;
  const issues = checkScene(scene, registry).issues;
  for (const target of ["mid-clamp-front#rail", "roof-module-left#inner-front", "roof-module-right#inner-front"]) {
    assert.ok(issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === target));
  }
});
