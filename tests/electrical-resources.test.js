import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("electrical box ports remain clear and the lid opens around the side hinge", async t => {
  const source = await doc("dual-entry-electrical-junction-box");
  const closed = registry.build(source);
  const ray = sweepRay(t, closed.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(ray([0, 1, 0.043], [0, -1, 0]).length, 0);
  assert.ok(ray([0.025, 1, 0.043], [0, -1, 0]).length > 0);

  const [animation] = source.parameters.animations;
  source.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  const open = registry.build(source);
  assert.deepEqual(open.anchors.local, closed.anchors.local);
  assert.ok(open.nodes.find(node => node.metadata.compositionNodeId === "lid").transform.position[2] > 0.15);
});

test("overhead tray and wall route check 16 joints, including the diameter change at a dual-port box", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/electrical-conduit-and-tray-assembly.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 16);
  const flex = scene.instances.find(item => item.id === "flex-tail");
  flex.parameters.nodes[0].geometry.outsideDiameter = 0.032;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [["SCENE_CONNECTION_DIAMETER_MISMATCH", "flex-tail#start"]]);
});
