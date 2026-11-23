import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { checkComposition, checkScene, composeScene, createDefaultRegistry, geometryBounds } from "../packages/core/src/index.js";
import { createSweepGeometry } from "../adapters/three/src/sweep-geometry.js";

const registry = createDefaultRegistry();

async function libraryDocument(path) {
  const manifest = new URL(`../registry/components/${path}/manifest.json`, import.meta.url);
  return JSON.parse(await readFile(manifest, "utf8")).editor.document;
}

test("resizing a straight stair updates every tread, its bounds, and its landing anchors", async t => {
  const doc = await libraryDocument("structure/straight-stair");
  const source = doc.parameters.nodes[0].geometry;
  Object.assign(source, { stepCount: 6, treadDepth: 0.25, riserHeight: 0.2, width: 1.4 });
  const build = registry.build(doc);
  assert.deepEqual(checkComposition(doc), { ok: true, issues: [] });
  assert.deepEqual(build.bounds.size, [source.width, 6 * source.riserHeight, 6 * source.treadDepth]);
  assert.deepEqual(build.anchors.local["lower-landing"], [0, 0, 0]);
  assert.deepEqual(build.anchors.local["upper-landing"], [0, 6 * source.riserHeight, 6 * source.treadDepth]);
  assert.deepEqual(build.instance.parameters.nodes[0].geometry, source);

  const geometry = createSweepGeometry(build.nodes[0].geometry);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const stairs = new Mesh(geometry, material);
  t.after(() => { geometry.dispose(); material.dispose(); });
  for (let i = 0; i < source.stepCount; i++) {
    const ray = new Raycaster(new Vector3(0, 3, (i + 0.5) * source.treadDepth), new Vector3(0, -1, 0));
    const [first] = ray.intersectObject(stairs);
    assert.ok(Math.abs(first.point.y - (i + 1) * source.riserHeight) < 1e-6);
  }
});

test("a wall opening stays clear through the geometry after changing its width, height, and offset", async t => {
  const doc = await libraryDocument("construction/door-opening-wall");
  const source = doc.parameters.nodes[0].geometry;
  Object.assign(source, { thickness: 0.3, openingWidth: 0.6, openingHeight: 1.9, openingOffset: -0.7 });
  const build = registry.build(doc);
  assert.deepEqual(build.bounds.size, [3.6, 2.8, 0.3]);
  assert.deepEqual(build.anchors.local["opening-top"], [-0.7, 1.9, 0]);
  const geometry = createSweepGeometry(build.nodes[0].geometry);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const wall = new Mesh(geometry, material);
  t.after(() => { geometry.dispose(); material.dispose(); });
  const hits = (x, y) => new Raycaster(new Vector3(x, y, 2), new Vector3(0, 0, -1)).intersectObject(wall);
  assert.equal(hits(-0.7, 1).length, 0);
  assert.ok(hits(0.25, 1).length > 0);
  assert.ok(hits(-0.7, 2.05).length > 0);

  const next = { ...structuredClone(doc), id: "next-wall", transform: { position: [3.6, 0, 0] } };
  const scene = { instances: [doc, next], attachments: [
    { from: `${doc.id}#wall-right`, to: `${next.id}#wall-left`, contract: { direction: "opposed" } },
  ] };
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
});

test("invalid stair counts and impossible wall openings identify the offending dimension", async () => {
  const stair = await libraryDocument("structure/straight-stair");
  const wall = await libraryDocument("construction/door-opening-wall");
  for (const [doc, field, bad] of [[stair, "stepCount", 2.5], [wall, "openingHeight", 2.8],
    [wall, "openingWidth", 3.6], [wall, "openingOffset", 1.4]]) {
    const instance = structuredClone(doc);
    instance.parameters.nodes[0].geometry[field] = bad;
    const report = checkComposition(instance);
    assert.deepEqual(report.issues.map(({ code, path }) => [code, path]), [
      ["GEOMETRY_INVALID", `/parameters/nodes/0/geometry/${field}`],
    ]);
    assert.throws(() => registry.build(instance));
  }
});

test("resizing building walls retains the floor datum and recalculates a through window opening", async t => {
  const partition = await libraryDocument("construction/solid-partition-wall");
  Object.assign(partition.parameters.nodes[0].geometry, { wallWidth: 4, wallHeight: 3.2 });
  const solid = registry.build(partition);
  assert.deepEqual(solid.bounds.min, [-2, 0, -0.075]);
  assert.deepEqual(solid.anchors.local["wall-right"], [2, 0, 0]);

  const windowWall = await libraryDocument("construction/window-opening-wall");
  const source = windowWall.parameters.nodes[0].geometry;
  Object.assign(source, { sillHeight: 1.1, openingOffset: 0.6 });
  const built = registry.build(windowWall);
  assert.deepEqual(built.anchors.local["opening-base"], [0.6, 1.1, 0]);
  assert.deepEqual(built.anchors.local["opening-right"], [1.2, 1.1, 0]);
  const geometry = createSweepGeometry(built.nodes[0].geometry);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  t.after(() => { geometry.dispose(); material.dispose(); });
  const hits = (x, y) => new Raycaster(new Vector3(x, y, 1), new Vector3(0, 0, -1)).intersectObject(mesh);
  assert.equal(hits(0.6, 1.5).length, 0, "through the window");
  assert.ok(hits(0.6, 0.8).length > 0, "wall below the sill");
  assert.ok(hits(-0.3, 1.5).length > 0, "wall at the jamb");
  source.sillHeight = 3;
  assert.equal(checkComposition(windowWall).issues[0].path, "/parameters/nodes/0/geometry/sillHeight");
});

test("the straight railing retains open bays and rejects dimensions with no room for the bays", async t => {
  const doc = await libraryDocument("construction/straight-railing");
  const rail = doc.parameters.nodes[0].geometry;
  Object.assign(rail, { railWidth: 2.5, bayCount: 10 });
  const built = registry.build(doc);
  assert.deepEqual(built.bounds.size, [2.5, 1, 0.05]);
  assert.deepEqual(built.anchors.local.start, [-1.25, 0, 0]);
  assert.equal(built.nodes[0].geometry.holes.length, 10);
  const geometry = createSweepGeometry(built.nodes[0].geometry);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  t.after(() => { geometry.dispose(); material.dispose(); });
  assert.equal(new Raycaster(new Vector3(-1.1, 0.5, 1), new Vector3(0, 0, -1)).intersectObject(mesh).length, 0);
  rail.memberWidth = 0.25;
  assert.equal(checkComposition(doc).issues[0].path, "/parameters/nodes/0/geometry/memberWidth");
});

test("the architectural bay uses the library modules and validates wall, opening and landing connections", async () => {
  const urls = ["construction/solid-partition-wall", "construction/door-opening-wall", "construction/single-swing-door",
    "construction/window-opening-wall", "construction/fixed-window", "structure/straight-stair", "structure/slab", "construction/straight-railing"];
  const scene = JSON.parse(await readFile(new URL("../examples/digital-modeling/structure/architectural-bay.json", import.meta.url), "utf8"));
  for (const [index, path] of urls.entries()) {
    const expected = (await libraryDocument(path)).parameters;
    const actual = scene.instances[index].parameters;
    assert.deepEqual(actual.nodes, expected.nodes, path);
    for (const [name, anchor] of Object.entries(expected.anchors)) assert.deepEqual(actual.anchors[name], anchor, path);
  }
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(link => link.connected).length, 12);

  const door = scene.instances[2];
  const hinge = door.parameters.nodes.find(node => node.id === "hinge");
  for (const angle of [0, -Math.PI / 4, -Math.PI / 2]) {
    hinge.transform.rotation[1] = angle;
    const leaf = registry.build(door).nodes.find(node => node.metadata.compositionNodeId === "leaf");
    const bounds = geometryBounds(leaf);
    assert.ok(bounds.min[0] > -0.41 && bounds.max[0] < 0.41, "door leaf clears both frame jambs");
  }
  scene.instances[3].parameters.nodes[0].geometry.openingWidth = 1.4;
  const issues = checkScene(scene, registry).issues;
  assert.equal(issues.filter(issue => issue.code === "SCENE_CONNECTION_GAP").length, 2);
});

test("a slab opening follows both offsets and remains clear through the slab", async t => {
  const doc = await libraryDocument("structure/floor-opening-slab");
  const slab = doc.parameters.nodes[0].geometry;
  Object.assign(slab, { openingOffsetX: 0.5, openingOffsetZ: -0.35, thickness: 0.24 });
  const built = registry.build(doc);
  assert.deepEqual(built.bounds.min, [-2.4, -0.24, -2.1]);
  assert.deepEqual(built.bounds.max, [2.4, 0, 2.1]);
  assert.deepEqual(built.anchors.local["opening-far"], [0.5, 0, slab.openingOffsetZ + slab.openingDepth / 2]);
  const geometry = createSweepGeometry(built.nodes[0].geometry);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  t.after(() => { geometry.dispose(); material.dispose(); });
  const hits = x => new Raycaster(new Vector3(x, 1, -0.35), new Vector3(0, -1, 0)).intersectObject(mesh);
  assert.equal(hits(0.5).length, 0);
  assert.ok(hits(-0.5).length > 0);
  slab.openingOffsetX = 1.8;
  assert.equal(checkComposition(doc).issues[0].path, "/parameters/nodes/0/geometry/openingOffsetX");
});

test("ramp and corner wall dimensions move their end anchors and retain the expected surfaces", async t => {
  const ramp = await libraryDocument("construction/straight-ramp");
  Object.assign(ramp.parameters.nodes[0].geometry, { run: 4, rise: 0.6, rampWidth: 1.6, deckThickness: 0.15 });
  const builtRamp = registry.build(ramp);
  assert.deepEqual(builtRamp.anchors.local["upper-landing"], [0, 0.6, 4]);
  const rampMesh = createSweepGeometry(builtRamp.nodes[0].geometry);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  t.after(() => { rampMesh.dispose(); material.dispose(); });
  const [midpoint] = new Raycaster(new Vector3(0, 2, 2), new Vector3(0, -1, 0)).intersectObject(new Mesh(rampMesh, material));
  assert.ok(Math.abs(midpoint.point.y - 0.3) < 1e-6);

  const corner = await libraryDocument("construction/l-corner-wall");
  const wall = corner.parameters.nodes[0].geometry;
  Object.assign(wall, { lengthX: 3, lengthZ: 2, thickness: 0.2 });
  const builtCorner = registry.build(corner);
  assert.deepEqual(builtCorner.bounds.max, [3, 2.8, 2]);
  assert.deepEqual(builtCorner.anchors.local["x-end"], [3, 0, 0.1]);
  assert.deepEqual(builtCorner.anchors.local["z-end"], [0.1, 0, 2]);
  const cornerMesh = createSweepGeometry(builtCorner.nodes[0].geometry);
  const mesh = new Mesh(cornerMesh, material);
  t.after(() => cornerMesh.dispose());
  const hits = (x, z) => new Raycaster(new Vector3(x, 4, z), new Vector3(0, -1, 0)).intersectObject(mesh);
  assert.ok(hits(2.5, 0.1).length > 0);
  assert.ok(hits(0.1, 1.5).length > 0);
  assert.equal(hits(1, 1).length, 0);
  wall.thickness = 2;
  assert.equal(checkComposition(corner).issues[0].path, "/parameters/nodes/0/geometry/thickness");
});

test("floor and ceiling assembly aligns the library parts, including the tile inside the grid opening", async () => {
  const urls = ["structure/straight-stair", "structure/floor-opening-slab", "construction/straight-ramp", "structure/slab",
    "construction/l-corner-wall", "construction/solid-partition-wall", "construction/suspended-ceiling-grid",
    "construction/square-ceiling-panel", "construction/square-ceiling-panel", "construction/straight-railing"];
  const scene = JSON.parse(await readFile(new URL("../examples/digital-modeling/structure/floor-and-ceiling-assembly.json", import.meta.url), "utf8"));
  for (const [index, path] of urls.entries()) {
    const expected = (await libraryDocument(path)).parameters;
    const actual = scene.instances[index].parameters;
    assert.deepEqual(actual.nodes, expected.nodes, path);
    for (const [name, anchor] of Object.entries(expected.anchors)) assert.deepEqual(actual.anchors[name], anchor, path);
  }
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(link => link.connected).length, 6);

  const grid = registry.build(scene.instances[6]);
  const tile = registry.build(scene.instances[7]);
  assert.deepEqual(grid.repetitions.map(item => item.occurrenceCount), [5, 16, 6]);
  const rails = grid.nodes.filter(node => node.metadata.compositionNodeId === "main-runner").map(node => geometryBounds(node));
  assert.ok(Math.abs(rails[1].min[0] - rails[0].max[0] - tile.localBounds.size[0]) < 1e-9);
});
