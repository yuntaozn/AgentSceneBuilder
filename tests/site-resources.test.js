import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/site/${name}/manifest.json`)).editor.document;

test("the grate slots are through openings and the channel remains open along its invert", async t => {
  const grate = await doc("slotted-drain-grate");
  const builtGrate = registry.build(grate);
  assert.equal(builtGrate.nodes[0].geometry.holes.length, 14);
  const grateRay = sweepRay(t, builtGrate.nodes);
  assert.equal(grateRay([0.05, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(grateRay([0.05, 1, 0.21], [0, -1, 0]).length > 0);
  const channel = await doc("rebated-drain-channel");
  const builtChannel = registry.build(channel);
  const channelRay = sweepRay(t, builtChannel.nodes);
  assert.equal(channelRay([-0.1, -0.15, 0], [1, 0, 0]).length, 0);
  assert.ok(Math.abs(channelRay([0.5, 1, 0], [0, -1, 0])[0].point.y + 0.27) < 1e-6);
  assert.deepEqual(builtChannel.anchors.local["grate-seat"], builtGrate.anchors.local["grate-bottom"]);
  channel.parameters.nodes[0].geometry.seatDepth = 0.28;
  assert.equal(checkComposition(channel).issues[0].path, "/parameters/nodes/0/geometry/seatDepth");
});

test("the site example aligns 12 joints including the channel invert and basin inlet", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/site-drainage-and-paving.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 12);
  scene.instances.find(item => item.id === "catch-basin").transform.position[1] += 0.06;
  assert.ok(checkScene(scene, registry).issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === "catch-basin#channel-in"));
});
