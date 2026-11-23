import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the glazing unit retains a gap and both gasket bulbs contain open passages", async t => {
  const build = registry.build(await doc("double-insulated-glazing-panel"));
  const panes = build.nodes.filter(node => node.semanticType === "construction.facade.insulated-glazing.pane");
  const [outside, inside] = panes;
  const air = outside.transform.position[2] - inside.transform.position[2]
    - (outside.geometry.size[2] + inside.geometry.size[2]) / 2;
  assert.ok(Math.abs(air - 0.0154) < 1e-9);
  const gasket = sweepRay(t, registry.build(await doc("double-bulb-glazing-gasket")).nodes);
  assert.equal(gasket([-0.1, 0, -0.016], [1, 0, 0]).length, 0);
  assert.equal(gasket([-0.1, 0, 0.016], [1, 0, 0]).length, 0);
  assert.ok(gasket([-0.1, 0, 0], [1, 0, 0]).length > 0);
});

test("an awning sash moves outwards without moving the mounting frame", async () => {
  const awning = await doc("top-hung-awning-glazed-window");
  const closed = registry.build(awning);
  const [animation] = awning.parameters.animations;
  const motion = awning.parameters.nodes.find(node => node.id === animation.target);
  motion.transform.rotation = animation.to;
  const open = registry.build(awning);
  const pane = open.nodes.find(node => node.metadata.compositionNodeId === "sash-glazing");
  assert.ok(pane.transform.position[2] > 0.35);
  assert.deepEqual(open.anchors.local, closed.anchors.local);
});

test("curtain wall checks 28 links across the two bays and the corner", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/curtain-wall-glazing-and-sunshade.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 28);
  scene.instances.find(item => item.id === "mullion-2").transform.position[0] += 0.04;
  const affected = checkScene(scene, registry).issues.map(issue => issue.to);
  assert.ok(affected.includes("fixed-vision#right"));
  assert.ok(affected.includes("opening-awning#left"));
});
