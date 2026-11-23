import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createSweepGeometry } from "../adapters/three/src/sweep-geometry.js";

export function sweepRay(t, nodes) {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const meshes = nodes.map(node => {
    const mesh = new Mesh(createSweepGeometry(node.geometry), material);
    if (node.matrix) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.set(...node.matrix.flat());
      mesh.updateMatrixWorld(true);
    }
    return mesh;
  });
  t.after(() => {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  });
  return (origin, direction) => new Raycaster(new Vector3(...origin), new Vector3(...direction)).intersectObjects(meshes);
}
