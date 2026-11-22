import { CircleGeometry, CylinderGeometry, Group, Mesh, Vector3 } from "three";

export function createSegmentMesh(start, end, startRadius, endRadius, material, radialSegments = 12) {
  const a = new Vector3(...start), b = new Vector3(...end);
  const delta = b.clone().sub(a);
  const segments = Math.min(48, radialSegments);
  // A fully collapsed tube has a single flat cap in the local XZ plane.
  if (a.equals(b)) {
    const geometry = new CircleGeometry(Math.max(startRadius, endRadius), segments, -Math.PI / 2);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(a);
    return mesh;
  }
  const geometry = new CylinderGeometry(endRadius, startRadius, delta.length(), segments);
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

export function createTubeMesh({ points, radius, radialSegments }, material) {
  const group = new Group();
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i];
    if (start.some((value, axis) => value !== end[axis])) {
      group.add(createSegmentMesh(start, end, radius, radius, material, radialSegments));
    }
  }
  if (!group.children.length) group.add(createSegmentMesh(points[0], points[0], radius, radius, material, radialSegments));
  return group;
}
