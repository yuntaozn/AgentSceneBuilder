import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const readModel = async slug => (await readJson(`../registry/components/${slug}/manifest.json`)).editor.document;

test("the sill slopes out and contains a true underside drip groove", async t => {
  const sill = await readModel("construction/window-sill");
  const source = sill.parameters.nodes[0].geometry;
  Object.assign(source, { projection: 0.3, fall: 0.024, grooveDepth: 0.015 });
  const built = registry.build(sill);
  const hits = sweepRay(t, built.nodes);
  const z = source.projection - source.grooveSetback - source.grooveWidth / 2;
  const [underGroove] = hits([0, -1, z], [0, 1, 0]);
  const [underSolid] = hits([0, -1, 0.1], [0, 1, 0]);
  assert.ok(Math.abs(underGroove.point.y - (-source.thickness + source.grooveDepth)) < 1e-6);
  assert.ok(Math.abs(underSolid.point.y + source.thickness) < 1e-6);
  assert.deepEqual(built.anchors.local.front, [0, -0.024, 0.3]);
  source.grooveDepth = 0.07;
  assert.equal(checkComposition(sill).issues[0].path, "/parameters/nodes/0/geometry/grooveDepth");
});

test("balcony and canopy keep their authored upper edges and a roof drain remains hollow", async t => {
  const balcony = await readModel("construction/balcony-deck");
  const source = balcony.parameters.nodes[0].geometry;
  Object.assign(source, { deckWidth: 3, projection: 1.4, downstand: 0.2 });
  const built = registry.build(balcony);
  assert.deepEqual(built.anchors.local["railing-left"], [-1.5, 0, 1.4]);
  assert.equal(built.bounds.min[1], -source.thickness - source.downstand);
  assert.equal(built.bounds.max[1], 0);
  const canopy = await readModel("construction/entrance-canopy");
  const cover = canopy.parameters.nodes[0].geometry;
  assert.deepEqual(registry.build(canopy).anchors.local.front, [0, -cover.fall, cover.projection]);
  const drain = registry.build(await readModel("construction/rectangular-roof-drain"));
  const hits = sweepRay(t, drain.nodes);
  assert.equal(hits([0, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(hits([0.1, 1, 0], [0, -1, 0]).length > 0);
  assert.deepEqual(drain.anchors.local.outlet, [0, -0.22, 0]);
});

test("the two-storey facade preserves openings, panel repetition and roof-edge connections", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/two-storey-facade.json");
  const windows = scene.instances.filter(instance => instance.id.startsWith("window-"));
  assert.equal(windows.length, 3);
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(link => link.connected).length, 36);
  const panels = registry.build(scene.instances.find(instance => instance.id === "cladding-course"));
  assert.equal(panels.repetitions[0].occurrenceCount, 5);
  const firstWindowWall = scene.instances.find(instance => instance.id === "wall-1-2");
  firstWindowWall.parameters.nodes[0].geometry.thickness = 0.2;
  const issues = checkScene(scene, registry).issues;
  assert.ok(issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === "sill-1-2#mount"));
});
