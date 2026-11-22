import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDefaultRegistry, geometryBounds, pointsBounds, sweep, transformPoint, transformPointMatrix } from "../packages/core/src/index.js";
import { createSweepGeometry } from "../adapters/three/src/sweep-geometry.js";
import { sweepWireLines } from "../apps/shared/model-preview.js";
import { run } from "../packages/cli/src/agentscene.mjs";

const manifestPath = "registry/compositions/cable-tray-elbow/manifest.json";
const trayDocument = JSON.parse(readFileSync(new URL("../" + manifestPath, import.meta.url))).editor.document;
const tray = trayDocument.parameters.nodes[0].geometry;

test("tray miters preserve width, upright walls and concave capped ends", () => {
  const { nodes, bounds } = createDefaultRegistry().build(trayDocument);
  const g = nodes[0].geometry;
  assert.deepEqual(bounds.min, [-0.15, 0, 0]);
  assert.deepEqual(bounds.max, [1, 0.1, 1.2 + 0.15]);
  for (const [index, [u, v]] of tray.profile.entries()) {
    assert.deepEqual(g.rings[1][index], [u, v, 1.2 - u]);
    assert.deepEqual(g.rings[2][index], [1, v, 1.2 - u]);
  }
  const mesh = createSweepGeometry(g);
  const vertices = mesh.getAttribute("position");
  let area = 0;
  let triangles = 0;
  for (let i = 0; i < vertices.count; i += 3) {
    if ([i, i + 1, i + 2].some(j => vertices.getZ(j) !== 0)) continue;
    const x = j => vertices.getX(i+j), y = j => vertices.getY(i+j);
    const signed = ((x(1)-x(0))*(y(2)-y(0)) - (y(1)-y(0))*(x(2)-x(0))) / 2;
    assert.ok(signed < 0, "start cap faces away from the path");
    area -= signed;
    triangles++;
  }
  assert.equal(triangles, 6);
  assert.ok(Math.abs(area - (0.3 * 0.002 + 2 * 0.098 * 0.002)) < 1e-8);
  mesh.dispose();
});

test("sweep CLI build, GPU mesh and wire outlines agree under a hierarchy and repetition", () => {
  let output = "";
  assert.equal(run(["component", "build", manifestPath], { stdout: { write: text => output += text } }), 0);
  assert.equal(JSON.parse(output).build.nodes[0].geometry.type, "sweep");
  const doc = structuredClone(trayDocument);
  doc.transform = { position: [-2, 1, 5], rotation: [-.13, Math.PI / 4, .5], scale: [1.5, 2, -.8] };
  doc.parameters.nodes.unshift({ id: "mount", transform: { position: [3, 4, 5], rotation: [.3,.2,0], scale: [2,3,4] } });
  Object.assign(doc.parameters.nodes[1], { parent: "mount", repetition: { type: "linear", count: 2, step: [2,0,0] } });
  const { nodes, bounds } = createDefaultRegistry().build(doc);
  const worldVertices = [];
  assert.equal(nodes.length, 2);
  for (const node of nodes) {
    const inComponent = p => transformPointMatrix(p, node.matrix);
    const wireBounds = pointsBounds(sweepWireLines(node.geometry).flat().map(inComponent));
    assert.deepEqual(geometryBounds(node), wireBounds);
    const mesh = createSweepGeometry(node.geometry);
    const { position } = mesh.attributes;
    const vertices = Array.from({ length: position.count }, (_, i) =>
      inComponent([position.getX(i), position.getY(i), position.getZ(i)]));
    const meshBounds = pointsBounds(vertices);
    for (const vertex of vertices) worldVertices.push(transformPoint(vertex, doc.transform));
    for (const bound of ["min","max"]) for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(meshBounds[bound][i] - wireBounds[bound][i]) < 1e-6);
    }
    mesh.dispose();
  }
  const meshBounds = pointsBounds(worldVertices);
  for (const bound of ["min", "max"]) for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(meshBounds[bound][axis] - bounds[bound][axis]) < 1e-6);
  }
});

test("open vertical sweeps keep open edges, and invalid corners and profiles fail early", () => {
  const open = { id: "strip", profile: [[-.1,0],[.1,0]], points: [[0,0,0],[0,1,0],[1,1,1]] };
  const g = sweep(open).geometry;
  assert.equal(sweepWireLines(g).length, 5);
  const mesh = createSweepGeometry(g);
  assert.equal(mesh.attributes.position.count, 12);
  mesh.dispose();
  assert.throws(() => sweep({ ...open, up: [0,1,0] }), /parallel/);
  assert.throws(() => sweep({ ...open, points: [[0,0,0],[0,1,0],[0,.5,0]] }), /reverses/);
  assert.throws(() => sweep({ ...open, points: [[0,0,0],[0,0,0],[0,1,0]] }), /segment 0/);
  assert.throws(() => sweep({ ...open, closedProfile: true, profile: [[0,0],[1,1],[0,1],[1,0]] }), /intersects/);
  assert.throws(() => sweep({ ...tray, id: "tight", points: [[0,0,0],[0,0,.05],[.05,0,.05]] }), /too large/);
});
