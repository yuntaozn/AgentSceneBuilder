import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";

export function createSweepGeometry({ rings, profile, holes = [], closedProfile }) {
  const positions = [];
  const contours = [profile, ...holes];
  function triangle(a, b, c) {
    positions.push(...a, ...b, ...c);
  }
  for (let i = 1; i < rings.length; i++) {
    const previous = rings[i - 1], next = rings[i];
    let offset = 0;
    for (const contour of contours) {
      const edges = closedProfile ? contour.length : contour.length - 1;
      for (let j = 0; j < edges; j++) {
        const a = offset + j, b = offset + (j + 1) % contour.length;
        triangle(previous[a], previous[b], next[b]);
        triangle(previous[a], next[b], next[a]);
      }
      offset += contour.length;
    }
  }
  if (closedProfile) {
    const [outer, ...inner] = contours.map(contour => contour.map(([u, v]) => new Vector2(u, v)));
    for (const [a, b, c] of ShapeUtils.triangulateShape(outer, inner)) {
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
