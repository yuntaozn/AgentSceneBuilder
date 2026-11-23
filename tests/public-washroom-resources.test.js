import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async (domain, name) => (await readJson(`../registry/components/${domain}/${name}/manifest.json`)).editor.document;

test("the WC rear outlet and flexible water dam stay open through their wall sections", async t => {
  const wc = registry.build(await document("mep", "wall-hung-ceramic-wc-pan-with-rear-soil-outlet"));
  const wcRay = sweepRay(t, wc.nodes.filter(node => node.geometry.type === "sweep"));
  assert.ok(wcRay([0, 0.16, -1], [0, 0, 1])[0].point.z > 0.14);
  assert.ok(wcRay([0.08, 0.16, -1], [0, 0, 1])[0].point.z < 0.001);
  const strip = registry.build(await document("construction", "flexible-hollow-shower-water-dam-strip"));
  const stripRay = sweepRay(t, strip.nodes);
  assert.equal(stripRay([-1, 0.018, 0], [1, 0, 0]).length, 0);
  assert.ok(stripRay([-1, 0.018, 0.02], [1, 0, 0]).length > 0);
});

test("the support rail folds upward while its wall anchor remains in place", async () => {
  const rail = await document("mep", "wall-mounted-fold-up-support-rail");
  const closed = registry.build(rail);
  const [animation] = rail.parameters.animations;
  rail.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const open = registry.build(rail);
  assert.deepEqual(open.anchors.local, closed.anchors.local);
  const height = model => Math.max(...model.nodes.find(node => node.metadata.compositionNodeId === "looped-grip")
    .geometry.points.map(point => point[1]));
  assert.ok(height(open) > height(closed) + 0.60);
});

test("the public washroom checks 51 contacts and locates a wrong rear outlet diameter", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/public-washroom-and-access-entry-details.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 51);
  scene.instances.find(item => item.id === "wc-carrier").parameters.anchors.soil.outsideDiameter = 0.11;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "wall-hung-pan#soil"],
  ]);
});
