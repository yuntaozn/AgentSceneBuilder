import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultRegistry, geometryBounds, sphere, torus, transformPoint } from "../packages/core/src/index.js";

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(actual.every((value, axis) => Math.abs(value - expected[axis]) <= tolerance),
    `Expected ${JSON.stringify(actual)} within ${tolerance} of ${JSON.stringify(expected)}`);
}

test("sphere and torus bounds use node scale, shear, translation and collapsed axes", () => {
  const matrix = [[3, 4, 0, 10], [0, 0, 0, -3], [-4, 0, 3, 2], [0, 0, 0, 1]];
  const ball = geometryBounds(sphere({ id: "ball", radius: 0.5, matrix }));
  close(ball.min, [7.5, -3, -0.5]);
  close(ball.max, [12.5, -3, 4.5]);
  const ring = geometryBounds(torus({ id: "ring", majorRadius: 2, tubeRadius: 0.5, matrix }));
  close(ring.min, [1.5, -3, -10.5]);
  close(ring.max, [18.5, -3, 14.5]);

  const pose = { position: [1, 2, 3], rotation: [0, 0, Math.PI / 2], scale: [-2, 0, 0.5] };
  close(geometryBounds(sphere({ id: "ball", radius: 1, ...pose })).size, [0, 4, 1]);
  close(geometryBounds(torus({ id: "ring", majorRadius: 2, tubeRadius: 0.5, ...pose })).size, [0, 10, 2.5]);
});

test("bounds enclose the transformed sphere and torus surfaces and agree with sampled extrema", () => {
  const registry = createDefaultRegistry();
  const parent = { rotation: [0.4, -0.3, 0.2], scale: [0.6, -1.5, 2], position: [1, 0, -2] };
  const child = { rotation: [-0.2, 0.5, 0.3], position: [0, -2, 1] };
  const instance = { rotation: [-0.3, 0.2, 0.5], scale: [1, 1.25, 0.8], position: [3, 0, 2] };
  for (const geometry of [{ type: "sphere", radius: 0.5 }, { type: "torus", majorRadius: 1.5, tubeRadius: 0.3 }]) {
    const { bounds } = registry.build({ id: "assembly", component: "core.composition", transform: instance,
      parameters: { nodes: [{ id: "mount", transform: parent }, { id: "body", parent: "mount", transform: child, geometry }] } });
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let u = 0; u < 360; u += 2) for (let v = 0; v < 360; v += 2) {
      const azimuth = u * Math.PI / 180, elevation = v * Math.PI / 180;
      const radius = geometry.radius ?? geometry.tubeRadius;
      const radial = (geometry.majorRadius ?? 0) + radius * Math.cos(elevation);
      const local = [radial * Math.cos(azimuth), radius * Math.sin(elevation), radial * Math.sin(azimuth)];
      const point = transformPoint(transformPoint(transformPoint(local, child), parent), instance);
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(point[axis] >= bounds.min[axis] - 1e-12 && point[axis] <= bounds.max[axis] + 1e-12);
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    close(bounds.min, min, 0.0006);
    close(bounds.max, max, 0.0006);
  }
});
