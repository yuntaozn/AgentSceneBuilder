import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("a hollow pipe preserves its bore and recalculates the declared port diameter", async t => {
  const pipe = await doc("hollow-round-pipe");
  const shape = pipe.parameters.nodes[0].geometry;
  shape.outsideDiameter = 0.09;
  const built = registry.build(pipe);
  assert.equal(built.anchors.definitions.end.outsideDiameter, 0.09);
  const ray = sweepRay(t, built.nodes);
  assert.equal(ray([-0.1, 0, 0], [1, 0, 0]).length, 0);
  assert.ok(ray([-0.1, 0.042, 0], [1, 0, 0]).length > 0);
  shape.thickness = 0.05;
  assert.equal(checkComposition(pipe).issues[0].path, "/parameters/nodes/0/geometry/thickness");
});

test("the branch tee has an unobstructed trunk and an open branch into it", async t => {
  const tee = registry.build(await doc("drain-branch-tee"));
  const ray = sweepRay(t, tee.nodes);
  assert.equal(ray([-0.1, 0, 0], [1, 0, 0]).length, 0);
  assert.ok(ray([0.18, 0.2, 0], [0, -1, 0])[0].point.y < 0);
});

test("the valve bore stays open inside the rotor and rotates with the handle", async () => {
  const valve = await doc("quarter-turn-water-ball-valve");
  const bore = build => build.nodes.find(node => node.metadata.compositionNodeId === "bore").geometry;
  const getAxis = geometry => geometry.sections[1].center.map((value, i) => value - geometry.sections[0].center[i]);
  const open = registry.build(valve);
  assert.equal(bore(open).capStart, false);
  assert.equal(bore(open).capEnd, false);
  const [stroke] = valve.parameters.animations;
  valve.parameters.nodes.find(node => node.id === stroke.target).transform.rotation = stroke.to;
  const shut = registry.build(valve);
  const [x, , z] = getAxis(bore(shut));
  assert.ok(Math.abs(x) < 1e-9);
  assert.ok(Math.abs(z) > 0.08);
  assert.deepEqual(open.anchors.local, shut.anchors.local);
});

test("the plumbing example checks 17 joints, including a fitted reducer and socket insertion", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/sanitary-pipe-connections.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  const { relations } = composeScene(scene, registry);
  assert.equal(relations.filter(relation => relation.connected).length, 17);
  const socket = relations.find(relation => relation.from === "coupler#end");
  assert.ok(socket.gap > 0.02 && socket.effectiveGap === 0);
  const small = scene.instances.find(item => item.id === "small-drain");
  small.parameters.nodes[0].geometry.outsideDiameter = 0.09;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [["SCENE_CONNECTION_DIAMETER_MISMATCH", "small-drain#start"]]);
});
