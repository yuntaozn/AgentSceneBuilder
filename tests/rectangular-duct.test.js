import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createSweepGeometry } from "../adapters/three/src/sweep-geometry.js";
import { sweepWireLines } from "../apps/shared/model-preview.js";
import { checkComposition, checkScene, composeScene, createDefaultRegistry, sweep } from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const ductModel = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("a rectangular duct has open ends, inward-facing interior walls and separate contour wires", async t => {
  const model = await ductModel("rectangular-duct-straight");
  const build = registry.build(model);
  assert.deepEqual(build.bounds.size, [0.6, 0.35, 1.5]);
  const section = build.nodes[0].geometry;
  assert.equal(section.holes.length, 1);
  assert.equal(sweepWireLines(section).length, 12);
  const geometry = createSweepGeometry(section);
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  t.after(() => { geometry.dispose(); material.dispose(); });
  const ray = (origin, direction) => new Raycaster(new Vector3(...origin), new Vector3(...direction)).intersectObject(mesh);
  assert.equal(ray([0, 0, -1], [0, 0, 1]).length, 0, "air path through both ends");
  assert.ok(ray([0.298, 0, -1], [0, 0, 1]).length > 0, "the end face includes the wall thickness");
  assert.ok(Math.abs(ray([0, 0, 0.5], [1, 0, 0])[0].point.x - 0.296) < 1e-6, "inner face points into the air path");
});

test("duct elbows recalculate the outlet after a path edit and report invalid wall thickness", async () => {
  const model = await ductModel("rectangular-duct-elbow");
  const duct = model.parameters.nodes[0].geometry;
  duct.sectionWidth = 0.8;
  duct.points[2] = [1.3, 0, 1.2];
  const build = registry.build(model);
  assert.deepEqual(build.anchors.local.end, [1.3, 0, 1.2]);
  assert.deepEqual(build.anchors.definitions.end.direction, [1, 0, 0]);
  assert.equal(build.nodes[0].geometry.rings[1].length, 8);
  duct.thickness = 0.2;
  assert.deepEqual(checkComposition(model).issues.map(({ code, path }) => [code, path]), [
    ["GEOMETRY_INVALID", "/parameters/nodes/0/geometry/thickness"],
  ]);
  assert.throws(() => registry.build(model), /leave an opening/);
});

test("sweep checks that holes are separate, inside a closed section, and off its boundary", () => {
  const square = radius => [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]];
  const geometry = { id: "section", profile: square(1), points: [[0, 0, 0], [0, 0, 2]], closedProfile: true };
  assert.throws(() => sweep({ ...geometry, closedProfile: false, holes: [square(0.1)] }), /require a closed profile/);
  assert.throws(() => sweep({ ...geometry, holes: [square(1)] }), /strictly inside/);
  assert.throws(() => sweep({ ...geometry, holes: [square(0.1), square(0.2)] }), /overlap or contain/);
});

test("straight duct, animated damper, elbow, and operation envelope assemble from library parts", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/rectangular-duct-and-damper.json");
  const names = ["rectangular-duct-straight", "rectangular-duct-damper", "rectangular-duct-elbow", "damper-operation-envelope"];
  for (const [i, name] of names.entries()) {
    assert.deepEqual(scene.instances[i].parameters, (await ductModel(name)).parameters);
  }
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 3);

  const damper = scene.instances[1];
  const parts = build => Object.fromEntries(build.nodes.map(node => [node.metadata.compositionNodeId, node]));
  const initial = parts(registry.build(damper));
  damper.parameters.nodes.find(node => node.id === "hinge").transform.rotation[0] = 0.65;
  const turned = parts(registry.build(damper));
  assert.notDeepEqual(initial.blade.matrix, turned.blade.matrix);
  assert.notDeepEqual(initial.handle.geometry.end, turned.handle.geometry.end);
  assert.deepEqual(initial.shaft.geometry.end, turned.shaft.geometry.end);
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
});
