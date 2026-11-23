import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importEditableScene } from "../apps/editor/scene-import.js";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const model = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;
const sweeps = state => state.nodes.filter(node => node.geometry.type === "sweep");
const part = (state, id) => state.nodes.find(item => item.metadata.compositionNodeId === id);

test("the transit and transformer leave four cable paths and a through core", async t => {
  const transit = sweepRay(t, sweeps(core.build(await model("four-cell-split-modular-cable-transit-frame-for-cabinet-wall"))));
  for (const x of [-0.0645, -0.0215, 0.0215, 0.0645]) {
    assert.equal(transit([x, 0, -0.1], [0, 0, 1]).length, 0);
  }
  assert.ok(transit([0.057, 0.021, -0.1], [0, 0, 1]).length > 0);
  const xformer = sweepRay(t, sweeps(core.build(await model("hinged-split-core-current-transformer-with-through-window"))));
  assert.equal(xformer([0.007, 0, -0.1], [0, 0, 1]).length, 0);
  assert.ok(xformer([0, 0.039, -0.1], [0, 0, 1]).length > 0);
});

test("the surge cartridge and indicator withdraw as a unit", async () => {
  const document = await model("clip-in-surge-protection-cartridge-with-status-window");
  const before = core.build(document);
  const [animation] = document.parameters.animations;
  document.parameters.nodes.find(node => node.id === animation.target).transform.position = animation.to;
  const after = core.build(document);
  assert.deepEqual(after.anchors.local.rail, before.anchors.local.rail);
  assert.equal(part(after, "surge-rear").transform.position[2], part(before, "surge-rear").transform.position[2]);
  assert.ok(Math.abs(part(after, "color-status-window").transform.position[2] -
    part(before, "color-status-window").transform.position[2] - 0.049) < 1e-9);
});

test("the cabinet's 44 connections survive import and the door carries its instrument", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/low-voltage-cabinet-din-and-cable-transits.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(relation => relation.connected).length, 41);
  const document = importEditableScene(scene);
  const open = core.build(document);
  assert.equal(open.attachments.length, 44);
  const closingTrack = document.parameters.animations.find(item => item.id === "instrumented-swing-door.close-cabinet-door");
  document.parameters.nodes.find(node => node.id === closingTrack.target).transform.rotation = closingTrack.to;
  const closed = core.build(document);
  const meter = "instrumented-swing-door.door-display-module.meter-body";
  assert.ok(Math.abs(part(closed, meter).transform.position[2] - part(open, meter).transform.position[2]) > 0.25);
  assert.deepEqual(part(open, "interior-strip-light.service-light").transform, part(closed, "interior-strip-light.service-light").transform);
});
