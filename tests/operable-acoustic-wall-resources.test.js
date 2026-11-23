import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importEditableScene } from "../apps/editor/scene-import.js";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const model = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;
const example = () => readJson("../examples/digital-modeling/structure/operable-acoustic-partitions-and-folding-wall.json");

test("rail, pass opening, honeycomb, and recessed crank room have open geometry", async t => {
  const sweepNodes = async name => core.build(await model(name)).nodes.filter(item => item.geometry.type === "sweep");
  const track = sweepRay(t, await sweepNodes("slot-bottom-centre-hung-operable-partition-head-track"));
  assert.ok(track([0.5, -0.1, 0], [0, 1, 0])[0].point.y > 0.09);
  assert.ok(track([0.5, -0.1, 0.025], [0, 1, 0])[0].point.y < 0.001);
  const frame = sweepRay(t, await sweepNodes("open-pass-door-frame-panel-for-operable-partition-wall"));
  assert.equal(frame([0, 1.2, 0.6], [0, 0, -1]).length, 0);
  assert.ok(frame([0, 2.0, 0.6], [0, 0, -1]).length > 0);
  const honeycomb = sweepRay(t, await sweepNodes("open-honeycomb-acoustic-sandwich-panel-core-coupon"));
  const cellX = -0.157 + 3 * Math.sqrt(3) * 0.052;
  assert.equal(honeycomb([cellX, 0.067, 0.6], [0, 0, -1]).length, 0);
  assert.ok(honeycomb([cellX + 0.043, 0.067, 0.6], [0, 0, -1]).length > 0);
  const leaf = sweepRay(t, await sweepNodes("demountable-veneered-operable-acoustic-wall-panel-blank"));
  assert.equal(leaf([0.234, 1.061, 0.6], [0, 0, -1]).length, 0);
  assert.ok(leaf([0.270, 1.061, 0.6], [0, 0, -1]).length > 0);
});

test("the descending seal moves while its mounting slot remains fixed", async () => {
  const seal = await model("push-down-retractable-floor-seal-for-operable-acoustic-panel");
  const before = core.build(seal);
  const [animation] = seal.parameters.animations;
  seal.parameters.nodes.find(node => node.id === animation.target).transform.position = animation.to;
  const after = core.build(seal);
  const lip = result => result.nodes.find(node => node.metadata.compositionNodeId === "soft-lip-1");
  assert.deepEqual(before.anchors.local, after.anchors.local);
  assert.ok(Math.abs(lip(before).transform.position[1] - lip(after).transform.position[1] - 0.03) < 1e-10);
});

test("a connected folding chain preserves its links at both folded joints", async () => {
  const scene = await example();
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(item => item.connected).length, 39);
  const document = importEditableScene(scene);
  assert.equal(document.parameters.attachments.length, 42);
  const original = core.build(document);
  for (const animation of document.parameters.animations.filter(item => /first-fold|second-fold/.test(item.id))) {
    document.parameters.nodes.find(node => node.id === animation.target).transform.rotation = animation.to;
  }
  const folded = core.build(document);
  const position = (result, suffix) => result.nodes.find(node => node.metadata.compositionNodeId.endsWith(suffix)).transform.position;
  assert.deepEqual(position(folded, "near-bifold-leaf.foldable-infill"), position(original, "near-bifold-leaf.foldable-infill"));
  assert.ok(position(folded, "far-bifold-leaf.foldable-infill")[0] < position(original, "far-bifold-leaf.foldable-infill")[0] - 0.45);
});
