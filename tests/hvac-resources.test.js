import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("the offset reducer keeps its top level and the branch penetrates the duct roof", async t => {
  const reducer = registry.build(await doc("top-flat-rectangular-duct-reducer"));
  const shell = reducer.nodes.find(node => node.metadata.compositionNodeId === "weather-shell").geometry;
  assert.equal(shell.capStart, false);
  assert.equal(shell.capEnd, false);
  const [large, small] = shell.sections;
  assert.ok(Math.abs(large.center[1] + large.axisZ[1] - small.center[1] - small.axisZ[1]) < 1e-9);
  const takeoff = registry.build(await doc("rectangular-duct-round-takeoff"));
  const ray = sweepRay(t, takeoff.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(ray([0.275, 0.4, 0], [0, -1, 0]).length, 0);
  assert.ok(ray([0.465, 0.4, 0], [0, -1, 0]).length > 0);
});

test("the duct routes align all 14 connections and expose both adjacent diameter mismatches", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/duct-transitions-and-terminal-airflow.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 14);
  scene.instances.find(item => item.id === "round-run").parameters.nodes[0].geometry.outsideDiameter = 0.27;
  const issues = checkScene(scene, registry).issues;
  assert.deepEqual(issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "round-run#start"],
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "round-turn#start"],
  ]);
});
