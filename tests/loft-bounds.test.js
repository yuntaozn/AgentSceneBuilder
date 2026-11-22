import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSceneSpatial, composeScene, createDefaultRegistry, transformPoint } from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
function shell(radiusX, radiusZ, extra = {}) {
  return {
    id: "shell", geometry: { type: "lofted-surface", radialSegments: 16,
      sections: [0, 1].map(y => ({ center: [0,y,0], radiusX, radiusZ })) },
    ...extra,
  };
}
const composition = (id, nodes) => ({ id, component: "core.composition", parameters: { nodes } });

test("rotating a two-metre circular loft does not hide a box crossing its outer wall", () => {
  const loft = composition("housing", [shell(1, 1, { transform: { rotation: [0, Math.PI/4, 0] } })]);
  const block = composition("block", [{ id: "tip", geometry: { type: "box", size: [.1,.1,.1] }, position: [.99,.5,0] }]);
  const scene = composeScene({ instances: [loft, block] }, registry);
  assert.ok(Math.abs(scene.instances[0].bounds.size[0] - 2) < 1e-12);
  const [pair] = analyzeSceneSpatial(scene).pairs;
  assert.equal(pair.state, "intersecting");
  assert.equal(pair.distance, 0);
});

test("rotating the whole instance preserves the circular envelope beside other geometry", () => {
  const model = composition("housing", [
    shell(1, 1),
    { id: "foot", position: [0, -1, 0], geometry: { type: "box", size: [0.2, 0.5, 0.2] } },
  ]);
  model.transform = { rotation: [0, Math.PI / 4, 0] };
  const { bounds } = registry.build(model);
  assert.ok(Math.abs(bounds.size[0] - 2) < 1e-12);
  assert.ok(Math.abs(bounds.size[2] - 2) < 1e-12);
  assert.equal(bounds.min[1], -1.25);
});

test("the transformed elliptical loft bounds enclose the surface for arbitrary angles", () => {
  const parent = { position: [1,-2,3], rotation: [.3,.74,-.2], scale: [1.5,2,.75] };
  const child = { rotation: [.51,.2,-.18], position: [.8,2,-1] };
  const model = composition("assembly", [
    { id: "mount", transform: parent }, shell(2,.35,{ parent: "mount", transform: child }),
  ]);
  model.transform = { rotation: [.2,-.4,.7], position: [-2,4,3], scale: [2,.9,1] };
  const { localBounds, bounds } = registry.build(model);
  for (const y of [0,.5,1]) for (let i = 0; i < 360; i++) {
    const t = i * Math.PI / 180;
    const local = transformPoint(transformPoint([2 * Math.cos(t),y,.35 * Math.sin(t)], child), parent);
    const world = transformPoint(local, model.transform);
    for (const [point, box] of [[local, localBounds],[world, bounds]]) {
      assert.ok(point.every((v,k) => box.min[k] - 1e-12 <= v && v <= box.max[k] + 1e-12));
    }
  }
});

test("off-centre polygon profiles include the cap centre only at capped ends", () => {
  const node = shell(1,1);
  for (const s of node.geometry.sections) s.profile = [[1,1],[2,1],[1,2]];
  assert.deepEqual(registry.build(composition("capped", [node])).bounds.min, [0,0,0]);
  Object.assign(node.geometry, {capStart:false, capEnd:false});
  assert.deepEqual(registry.build(composition("open", [node])).bounds.min, [1,0,1]);
});
