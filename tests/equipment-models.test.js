import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { checkEditableScene, importEditableScene } from "../apps/editor/scene-import.js";
import { insertLibraryGroup } from "../apps/editor/library-insert.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const example = name => read(`../examples/digital-modeling/equipment/${name}.json`);
const model = async path => (await read(`../registry/${path}/manifest.json`)).editor.document;
const pose = (document, id) => document.parameters.poseControls.find(control => control.id === id);
const byId = (build, id) => build.nodes.find(node => node.metadata.compositionNodeId === id);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test("forklift lift, tilt and spacing update the right moving parts without modifying authored transforms", async () => {
  const forklift = await model("compositions/counterbalance-forklift");
  const original = registry.build(forklift);
  const tips = build => [build.anchors.world["left-fork-tip"], build.anchors.world["right-fork-tip"]];
  const originalTransform = structuredClone(forklift.parameters.nodes.find(node => node.id === "carriage").transform);
  pose(forklift, "lift-travel").value = 0.72;
  pose(forklift, "fork-spacing").value = 0.62;
  assert.deepEqual(checkComposition(forklift), { ok: true, issues: [] });
  const lifted = registry.build(forklift);
  near(tips(lifted)[0][1] - tips(original)[0][1], 0.72);
  near(tips(lifted)[1][2] - tips(lifted)[0][2], 0.62);
  near(byId(lifted, "inner-tie").matrix[1][3] - byId(original, "inner-tie").matrix[1][3], 0.72 * 0.48);
  assert.deepEqual(byId(lifted, "chassis"), byId(original, "chassis"));
  assert.deepEqual(lifted.instance.parameters.nodes.find(node => node.id === "carriage").transform, originalTransform);
  pose(forklift, "mast-tilt").value = 10;
  const tilted = registry.build(forklift);
  assert.ok(tilted.anchors.worldDefinitions["left-fork-tip"].direction[1] > 0.17);
  assert.deepEqual(tilted.anchors.world.ground, original.anchors.world.ground);
});

test("fork and socket samples preserve interface checks in SceneSpec and the editor", async () => {
  for (const [name, count] of [["forklift-pallet-alignment", 2], ["interchangeable-ratchet-sockets", 3]]) {
    const scene = await example(name);
    assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
    assert.deepEqual(checkEditableScene(scene, registry), { ok: true, issues: [] });
    assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, count);
    const imported = importEditableScene(scene);
    assert.deepEqual(checkComposition(imported), { ok: true, issues: [] });
    assert.ok(imported.parameters.poseControls.every(control => control.targets.every(target => target.node.includes("."))));
  }
  const forklift = await example("forklift-pallet-alignment");
  pose(forklift.instances[0], "fork-spacing").value = 0.60;
  const { ok, issues: failures } = checkScene(forklift, registry);
  assert.equal(ok, true);
  assert.equal(failures.length, 2);
  assert.ok(failures.every(issue => issue.level === "warning" && issue.code === "SCENE_CONNECTION_GAP" && issue.from.startsWith("forklift#")));
  assert.equal(checkComposition(importEditableScene(forklift)).issues.length, 2);
});

test("drone optics and teaching frusta rotate together independently of the airframe", async () => {
  const sample = await example("drone-facade-field-of-view");
  assert.deepEqual(checkEditableScene(sample, registry), { ok: true, issues: [] });
  const document = importEditableScene(sample);
  const before = registry.build(document);
  pose(document, "drone.camera-yaw").value = 30;
  pose(document, "drone.camera-pitch").value = 20;
  const after = registry.build(document);
  for (const [name, view] of [["rgb-field-of-view", "rgb-view"], ["ir-field-of-view", "ir-view"]]) {
    const geometry = byId(after, "drone." + name).geometry;
    const [nearSection, farSection] = geometry.sections;
    const direction = after.anchors.worldDefinitions["drone." + view].direction;
    const axis = farSection.center.map((value, i) => value - nearSection.center[i]);
    const magnitude = Math.hypot(...axis);
    direction.forEach((value, i) => near(axis[i] / magnitude, value));
    assert.ok(direction[0] < -0.4 && direction[1] < -0.3);
  }
  assert.deepEqual(byId(before, "drone.shell"), byId(after, "drone.shell"));
  assert.deepEqual(before.anchors.world["drone.front-left-shaft"], after.anchors.world["drone.front-left-shaft"]);
});

test("socket geometry contains a hex bore and independent square drive opening", async t => {
  const socket = await model("components/tool/square-drive-socket-13mm");
  const trace = sweepRay(t, registry.build(socket).nodes);
  const hits = (x, y, z, sign) => trace([x,y,z],[0,sign,0]);
  near(hits(0.0055,-0.06,0,1)[0].point.y, -0.0125);
  near(hits(0.0075,-0.06,0,1)[0].point.y, -0.029);
  near(hits(0.0055,0.04,0,-1)[0].point.y, 0);
  assert.equal(hits(0,0.04,0,-1).length, 0);
});

test("pose validation reports range and references, and model insertion keeps separate controls", async () => {
  const wrench = await model("components/tool/adjustable-pipe-wrench");
  const empty = { id: "tools", component: "core.composition", parameters: { nodes: [] } };
  const first = insertLibraryGroup(empty, wrench);
  const second = insertLibraryGroup(first.document, wrench);
  const from = id => `${id}.moving-contact`;
  const baseline = registry.build(second.document);
  pose(second.document, `${second.groupId}.jaw-travel`).value = 20;
  const adjusted = registry.build(second.document);
  near(adjusted.anchors.world[from(second.groupId)][0] - baseline.anchors.world[from(second.groupId)][0], 0.012);
  assert.deepEqual(adjusted.anchors.world[from(first.groupId)], baseline.anchors.world[from(first.groupId)]);
  wrench.parameters.poseControls[0].value = -10;
  wrench.parameters.poseControls[0].targets.push({ node:"missing-slide", property:"position", axis:"x" });
  assert.deepEqual(checkComposition(wrench).issues.map(({ code, path }) => [code,path]), [
    ["POSE_CONTROL_INVALID", "/parameters/poseControls/0/value"],
    ["POSE_CONTROL_INVALID", "/parameters/poseControls/0/targets/1/node"],
  ]);
});
