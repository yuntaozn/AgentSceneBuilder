import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const model = async name => (await readJson(`../registry/components/prefab/${name}/manifest.json`)).editor.document;
const part = (built, id) => built.nodes.find(node => node.metadata.compositionNodeId === id);
const sweeps = built => built.nodes.filter(node => node.geometry.type === "sweep");

test("the wet room tray slopes to its offset bore and the ceiling leaves a full vent path", async t => {
  const tray = core.build(await model("off-centre-drain-sloped-prefabricated-wet-room-floor-tray"));
  const surface = part(tray, "shaped-waterproof-tray-top").geometry;
  assert.deepEqual(surface.sections[0].center, [0.22, 0.022, -0.157]);
  assert.ok(surface.sections[1].center[1] > surface.sections[0].center[1]);
  assert.equal(surface.capStart, false);
  const drainRay = sweepRay(t, [part(tray, "drain-mouth-bead")]);
  assert.equal(drainRay([0.22, -0.1, -0.157], [0, 1, 0]).length, 0);
  const ceiling = core.build(await model("clip-in-wet-room-ceiling-panel-with-round-vent-aperture"));
  const ventRay = sweepRay(t, sweeps(ceiling));
  assert.equal(ventRay([0.312, -0.1, -0.202], [0, 1, 0]).length, 0);
  assert.ok(ventRay([0.403, -0.1, -0.202], [0, 1, 0]).length > 0);
});

test("the hair catch cover and strainer can be lifted while the seat stays fixed", async () => {
  const document = await model("lift-out-wet-room-hair-trap-basket-and-ribbed-grate");
  const closed = core.build(document);
  const [animation] = document.parameters.animations;
  document.parameters.nodes.find(node => node.id === animation.target).transform.position = animation.to;
  const lifted = core.build(document);
  assert.deepEqual(lifted.anchors.local, closed.anchors.local);
  const center = (model, id) => part(model, id).matrix[1][3];
  for (const id of ["strainer-bottom", "bar-slot-cover"]) {
    assert.ok(Math.abs(center(lifted, id) - center(closed, id) - 0.085) < 1e-9);
  }
});

test("the pod scene validates 38 connections and checks the exhaust collar diameter", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/prefabricated-wet-room-tray-and-services.json");
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.equal(composeScene(scene, core).relations.filter(relation => relation.connected).length, 38);
  scene.instances.find(item => item.id === "visible-ceiling-duct").parameters.nodes[0].geometry.outsideDiameter = 0.106;
  assert.deepEqual(checkScene(scene, core).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "visible-ceiling-duct#start"],
  ]);
});
