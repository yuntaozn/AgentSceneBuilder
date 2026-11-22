import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";

export function createSweepGeometry({ rings, profile, closedProfile }) {
  const positions = [];
  function triangle(a, b, c) {
    positions.push(...a, ...b, ...c);
  }
  for (let i = 1; i < rings.length; i++) {
    const previous = rings[i - 1], next = rings[i];
    const edges = closedProfile ? profile.length : profile.length - 1;
    for (let j = 0; j < edges; j++) {
      const k = (j + 1) % profile.length;
      triangle(previous[j], previous[k], next[k]);
      triangle(previous[j], next[k], next[j]);
    }
  }
  if (closedProfile) {
    const contour = profile.map(([u, v]) => new Vector2(u, v));
    for (const [a, b, c] of ShapeUtils.triangulateShape(contour, [])) {
      triangle(rings[0][c], rings[0][b], rings[0][a]);
      const last = rings.at(-1);
      triangle(last[a], last[b], last[c]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
