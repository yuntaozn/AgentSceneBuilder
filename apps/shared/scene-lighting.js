import { allocateModelId } from "../editor/library-insert.js";

export const studioLighting = { enabled: true, preset: "studio", ambientIntensity: 1 };

export const studioLightNodes = [
  {
    id: "key-light", kind: "light", semanticType: "scene.light.directional",
    light: { type: "directional", color: "#ffffff", intensity: 4.5, helperLength: 3 },
    transform: { position: [4, 6, 4], rotation: [-.77134, .7854, 0], scale: [1, 1, 1] },
  },
  {
    id: "fill-light", kind: "light", semanticType: "scene.light.directional",
    light: { type: "directional", color: "#8cc7ff", intensity: 1.8, helperLength: 2.5 },
    transform: { position: [-4, 3, -4], rotation: [-.41613, -2.35619, 0], scale: [1, 1, 1] },
  },
  {
    id: "local-light", kind: "light", semanticType: "scene.light.point",
    light: { type: "point", color: "#fff0d2", intensity: 350, distance: 7 },
    transform: { position: [2.8, 3.5, 2.8], rotation: [0, 0, 0], scale: [1, 1, 1] },
  },
];

export function withDefaultSceneLighting(sourceDocument) {
  const next = structuredClone(sourceDocument);
  next.parameters ??= {};
  next.parameters.nodes ??= [];
  next.parameters.anchors ??= {};
  next.parameters.lighting = { ...studioLighting, ...next.parameters.lighting };
  const hasLightNode = next.parameters.nodes.some(node => node.kind === "light" || node.light);
  const hasLegacyLight = Array.isArray(next.parameters.lighting.lights) && next.parameters.lighting.lights.length > 0;
  if (!hasLightNode && !hasLegacyLight) {
    const usedIds = new Set(next.parameters.nodes.map(node => node.id).filter(Boolean));
    next.parameters.nodes.push(...structuredClone(studioLightNodes).map(node => ({
      ...node,
      id: allocateModelId(node.id, usedIds),
    })));
    next.parameters.lighting.enabled = true;
  }
  return next;
}
