import test from "node:test";
import assert from "node:assert/strict";
import {
  box, boxBounds, createDefaultRegistry, geometryBounds, instanceGeometryBounds, pointsBounds, transformPoint,
} from "../packages/core/src/index.js";

function corners(size) {
  const points = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    points.push([size[0] * x, size[1] * y, size[2] * z]);
  }
  return points;
}

function assertBounds(actual, vertices) {
  const expected = pointsBounds(vertices);
  for (const key of ["min", "max"]) for (const axis of [0, 1, 2]) {
    assert.ok(Math.abs(actual[key][axis] - expected[key][axis]) < 1e-12,
      `${key}[${axis}]: expected ${expected[key][axis]}, got ${actual[key][axis]}`);
  }
}

test("nested boxes use their original corners through a pivot, mirror and non-uniform instance scale", () => {
  const mount = { position: [1, -2, 0], scale: [-1, 2, 0.5], rotation: [0.3, -0.2, 0.4] };
  const pivot = [0.25, 0, -0.5];
  const instance = { position: [3, 5, -4], scale: [2, 0.7, -1.5], rotation: [-0.1, 0.4, 0.8] };
  const children = [
    { id: "left", size: [0.3, 3, 1], transform: { position: [-4, 2, -1], rotation: [0.7, -0.5, 0.1] } },
    { id: "right", size: [1, 0.5, 2], transform: { position: [5, -3, 2], rotation: [-0.2, 0.4, 0.3] } },
  ];
  const build = createDefaultRegistry().build({
    id: "assembly", component: "core.composition", transform: instance,
    parameters: { nodes: [{ id: "mount", transform: mount, pivot }, ...children.map(({ id, size, transform }) =>
      ({ id, parent: "mount", transform, geometry: { type: "box", size } }))] },
  });
  const vertices = children.flatMap(child => corners(child.size).map(point => {
    const onMount = transformPoint(point, child.transform).map((v, k) => v - pivot[k]);
    return transformPoint(onMount, mount).map((v, k) => v + pivot[k]);
  }));
  assertBounds(build.localBounds, vertices);
  assertBounds(build.bounds, vertices.map(p => transformPoint(p, instance)));
});

test("Core boxes without a matrix respect node rotation and scale in local and world bounds", () => {
  const size = [4, 1, 2];
  const pose = { position: [2, -1, 3], rotation: [0, 0, Math.PI / 4], scale: [-1, 2, 0.5] };
  const node = box({ id: "beam.body", size, ...pose });
  const vertices = corners(size).map(p => transformPoint(p, pose));
  assertBounds(geometryBounds(node), vertices);
  const instance = { rotation: [0, 0, -Math.PI / 4] };
  const registry = createDefaultRegistry().register({
    id: "test.beam", version: "1", title: "Beam", build: () => ({ nodes: [node] }),
  });
  const build = registry.build({ id: "beam", component: "test.beam", transform: instance });
  assertBounds(build.bounds, vertices.map(p => transformPoint(p, instance)));

  const bounds = boxBounds(pose.position, size);
  const legacy = instanceGeometryBounds([{ geometry: node.geometry, bounds }], instance);
  assertBounds(legacy.bounds, corners(size).map(p => transformPoint(transformPoint(p, { position: pose.position }), instance)));
});
