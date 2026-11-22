import test from "node:test";
import assert from "node:assert/strict";
import { Box3 } from "three";
import { createTubeMesh } from "../adapters/three/src/tube-mesh.js";
import { createDefaultRegistry, geometryBounds, transformPoint } from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
function build(geometry, transform, nodeTransform) {
  return registry.build({ id: "part", component: "core.composition", transform,
    parameters: { nodes: [{ id: "body", geometry, transform: nodeTransform }] } });
}

function closeVector(actual, expected, tolerance = 1e-12) {
  assert.ok(actual.every((value, axis) => Math.abs(value - expected[axis]) <= tolerance),
    `Expected ${JSON.stringify(actual)} within ${tolerance} of ${JSON.stringify(expected)}`);
}

test("bent tubes include both end disks at the bend and ignore duplicate segments", () => {
  const geometry = { type: "tube-along", radius: 0.2,
    points: [[1, 0, 0], [1, 0, 0], [3, 0, 0], [3, 0, 0], [3, -2, 0], [3, -2, 0]] };
  const model = build(geometry);
  closeVector(model.bounds.min, [1, -2, -0.2]);
  closeVector(model.bounds.max, [3.2, 0.2, 0.2]);
  assert.deepEqual(model.nodes[0].geometry.points, geometry.points);
  const flat = build({ ...geometry, points: [[1, 2, 3], [1, 2, 3]] });
  closeVector(flat.bounds.min, [0.8, 2, 2.8]);
  closeVector(flat.bounds.max, [1.2, 2, 3.2]);
  for (const [built, count] of [[model, 2], [flat, 1]]) {
    const mesh = createTubeMesh(built.nodes[0].geometry);
    assert.equal(mesh.children.length, count);
    const meshBounds = new Box3().setFromObject(mesh, true);
    closeVector(meshBounds.min.toArray(), built.bounds.min, 1e-7);
    closeVector(meshBounds.max.toArray(), built.bounds.max, 1e-7);
    for (const child of mesh.children) assert.ok(child.geometry.attributes.normal.array.every(Number.isFinite));
  }
});

test("oblique and tapered rods use each cap radius through a mirrored, non-uniform instance transform", () => {
  const transform = { position: [2, -1, 3], rotation: [0.5, -0.1, 0.7], scale: [0.8, -2, 1.5] };
  const start = [0, 0, 0], end = [3, 4, 0];
  for (const endRadius of [0.4, 0.1]) {
    const geometry = endRadius === 0.4 ? { type: "cylinder-between", start, end, radius: 0.4 }
      : { type: "tapered-cylinder-between", start, end, startRadius: 0.4, endRadius };
    const { localBounds, bounds } = build(geometry, transform);
    closeVector(localBounds.min, [-0.32, -0.24, -0.4]);
    closeVector(localBounds.max, [3 + 0.8 * endRadius, 4 + 0.6 * endRadius, 0.4]);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    // [-0.8, 0.6, 0] and [0, 0, 1] span each physical end disk.
    for (const [center, radius] of [[start, 0.4], [end, endRadius]]) {
      for (let i = 0; i < 4096; i++) {
        const angle = 2 * Math.PI * i / 4096;
        const point = transformPoint([center[0] - 0.8 * radius * Math.cos(angle),
          center[1] + 0.6 * radius * Math.cos(angle), center[2] + radius * Math.sin(angle)], transform);
        point.forEach((value, k) => {
          assert.ok(value >= bounds.min[k] - 1e-12 && value <= bounds.max[k] + 1e-12);
          min[k] = Math.min(min[k], value);
          max[k] = Math.max(max[k], value);
        });
      }
    }
    closeVector(bounds.min, min, 3e-7);
    closeVector(bounds.max, max, 3e-7);
  }
});

test("short and long diagonals preserve their disk normal", () => {
  for (const span of [Number.MIN_VALUE, 1.4e308]) {
    const geometry = { type: "tube-along", radius: 1, points: [[0, 0, 0], [span, span, 0]] };
    const bounds = geometryBounds({ geometry });
    closeVector(bounds.min, [-Math.SQRT1_2, -Math.SQRT1_2, -1]);
    assert.equal(bounds.max[2], 1);
  }
});

test("cylinder and cone bounds follow the cap plane and apex under node and instance rotations", () => {
  const cylinder = { type: "cylinder", radius: 1, height: 2 };
  const spin = { rotation: [0, Math.PI / 4, 0] };
  closeVector(build(cylinder, spin, spin).bounds.size, [2, 2, 2]);
  const cone = { type: "cone", radius: 1, height: 2 };
  const tilt = { rotation: [0, 0, Math.PI / 4] };
  const c = Math.SQRT1_2;
  for (const bounds of [build(cone, tilt, spin).bounds, geometryBounds({ geometry: cone, transform: tilt })]) {
    closeVector(bounds.min, [-c, -2 * c, -1]);
    closeVector(bounds.max, [2 * c, c, 1]);
  }
  const collapsed = build(cylinder, { rotation: [0, 0, Math.PI / 2], scale: [2, 0, 1] });
  closeVector(collapsed.bounds.size, [0, 4, 2]);
});
