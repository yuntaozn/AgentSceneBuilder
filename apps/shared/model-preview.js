import { withDefaultSceneLighting } from "./scene-lighting.js";

export const modelMaterialPalette = { concrete: "#7d8991", steel: "#8fd0d1", water: "#54a8ff", accent: "#d9ff57", default: "#aab5be" };

export function modelDocumentFor(entry) {
  if (entry.editor?.document) return structuredClone(entry.editor.document);
  if (entry.kind === "component" && entry.editor?.node) {
    return {
      id: `library-${entry.editor.node.id}`,
      component: "core.composition",
      parameters: { nodes: [structuredClone(entry.editor.node)], anchors: {} }
    };
  }
  return {
    kind: entry.kind,
    id: entry.id,
    version: entry.version,
    capabilities: entry.capabilities,
    parameters: entry.parameters ?? {},
    dependencies: entry.dependencies ?? []
  };
}

export function modelPreviewBuild(entry, core, { studioLighting = false } = {}) {
  try {
    const model = modelDocumentFor(entry);
    if (model.component !== "core.composition") return { nodes: [] };
    return core.build(studioLighting ? withDefaultSceneLighting(model) : model);
  } catch {
    const nodes = entry.editor?.document?.parameters?.nodes
      ?? (entry.editor?.node ? [entry.editor.node] : []);
    return { nodes };
  }
}

export function modelPreviewNodes(entry, core) {
  return modelPreviewBuild(entry, core).nodes;
}

export function observeModelPreviews(canvases, draw, { root = null } = {}) {
  if (typeof IntersectionObserver !== "function") {
    const frame = requestAnimationFrame(() => canvases.forEach(draw));
    return () => cancelAnimationFrame(frame);
  }
  const pending = new Set(canvases);
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting || !pending.delete(target)) continue;
      observer.unobserve(target);
      draw(target);
    }
  }, { root, rootMargin: "160px 0px" });
  for (const canvas of pending) observer.observe(canvas);
  return () => {
    pending.clear();
    observer.disconnect();
  };
}

export function modelPreviewZoomForExtent({
  width = 320,
  height = 190,
  extent = 1,
  zoom = 100,
  scale = 1,
  fitRatio = .42,
  minZoom = 2,
  maxZoom = 2600
} = {}) {
  const safeExtent = Math.max(.001, Number.isFinite(extent) ? extent : 1);
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 320);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 190);
  const fitZoom = Math.min(safeWidth, safeHeight) * fitRatio / safeExtent;
  const userZoom = Math.max(.05, (Number.isFinite(zoom) ? zoom : 100) / 100);
  return Math.max(minZoom, Math.min(maxZoom, fitZoom * userZoom * scale));
}

function rotatePoint([x, y, z], { yaw, pitch }) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  [x, z] = [x * cy - z * sy, x * sy + z * cy];
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  return [x, y, z];
}

const add = (a, b) => a.map((value, axis) => value + b[axis]);
const scale = (vector, amount) => vector.map(value => value * amount);
const isVec3 = point => Array.isArray(point) && point.length >= 3 && point.every(Number.isFinite);
function profileSample(profile, index, segments) {
  const scaled = index / segments * profile.length;
  const base = Math.floor(scaled) % profile.length;
  const next = (base + 1) % profile.length;
  const t = scaled - Math.floor(scaled);
  const a = profile[base];
  const b = profile[next];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function sweepWireLines({ rings, profile, holes = [], closedProfile }) {
  if (!rings?.length) return [];
  const sizes = holes.length ? [profile.length, ...holes.map(contour => contour.length)] : [rings[0].length];
  const outlines = closedProfile ? rings.flatMap(ring => {
    let start = 0;
    return sizes.map(size => {
      const line = [...ring.slice(start, start + size), ring[start]];
      start += size;
      return line;
    });
  }) : rings;
  const rails = rings[0].map((_, i) => rings.map(ring => ring[i]));
  return [...outlines, ...rails];
}

function geometryLines(node) {
  const geometry = node?.geometry;
  if (!geometry) return [];
  if (geometry.type === "sweep") return sweepWireLines(geometry);
  const circle = (radius, y, count = 32) => Array.from({ length: count + 1 }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  });

  if (geometry.type === "box") {
    const [x, y, z] = geometry.size.map(value => value / 2);
    const points = [
      [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
      [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    return edges.map(([start, end]) => [points[start], points[end]]);
  }

  if (geometry.type === "sphere") {
    return ["xy", "xz", "yz"].map(plane => Array.from({ length: 41 }, (_, index) => {
      const angle = index / 40 * Math.PI * 2;
      if (plane === "xy") return [geometry.radius * Math.cos(angle), geometry.radius * Math.sin(angle), 0];
      if (plane === "xz") return [geometry.radius * Math.cos(angle), 0, geometry.radius * Math.sin(angle)];
      return [0, geometry.radius * Math.cos(angle), geometry.radius * Math.sin(angle)];
    }));
  }

  if (geometry.type === "cylinder" || geometry.type === "cone") {
    const bottom = -geometry.height / 2;
    const top = geometry.height / 2;
    const lines = [circle(geometry.radius, bottom)];
    if (geometry.type === "cylinder") lines.push(circle(geometry.radius, top));
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2;
      const edge = [geometry.radius * Math.cos(angle), bottom, geometry.radius * Math.sin(angle)];
      lines.push(geometry.type === "cone"
        ? [edge, [0, top, 0]]
        : [edge, [edge[0], top, edge[2]]]);
    }
    return lines;
  }

  if (geometry.type === "torus") {
    return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(v => Array.from({ length: 41 }, (_, index) => {
      const u = index / 40 * Math.PI * 2;
      return [
        (geometry.majorRadius + geometry.tubeRadius * Math.cos(v)) * Math.cos(u),
        geometry.tubeRadius * Math.sin(v),
        (geometry.majorRadius + geometry.tubeRadius * Math.cos(v)) * Math.sin(u)
      ];
    }));
  }

  if (geometry.type === "tube-along") return [geometry.points];
  if (geometry.type === "cylinder-between") return [[geometry.start, geometry.end]];
  if (geometry.type === "tapered-cylinder-between") return [[geometry.start, geometry.end]];
  if (geometry.type === "lofted-surface") {
    const sections = geometry.sections ?? [];
    if (sections.length < 2) return [];
    const profileSegments = Math.max(0, ...sections.map(section => Array.isArray(section.profile) ? section.profile.length : 0));
    const segments = Math.min(32, Math.max(6, geometry.radialSegments ?? (profileSegments || 10)));
    const rings = sections.map(section => {
      if (!isVec3(section.center)) return [];
      const axisX = isVec3(section.axisX) ? section.axisX : [section.radiusX ?? 0, 0, 0];
      const axisZ = isVec3(section.axisZ) ? section.axisZ : [0, 0, section.radiusZ ?? 0];
      if (!isVec3(axisX) || !isVec3(axisZ)) return [];
      return Array.from({ length: segments + 1 }, (_, index) => {
        const [x, z] = Array.isArray(section.profile) && section.profile.length >= 3
          ? profileSample(section.profile, index, segments)
          : [Math.cos(index / segments * Math.PI * 2), Math.sin(index / segments * Math.PI * 2)];
        return add(add(section.center, scale(axisX, x)), scale(axisZ, z));
      });
    });
    if (rings.some(ring => ring.length < 2)) return [];
    const lines = [...rings];
    const longitudinalCount = Math.min(8, segments);
    const used = new Set();
    for (let spoke = 0; spoke < longitudinalCount; spoke += 1) {
      const index = Math.round(spoke / longitudinalCount * segments) % segments;
      if (used.has(index)) continue;
      used.add(index);
      lines.push(rings.map(ring => ring[index]));
    }
    lines.push(sections.map(section => section.center).filter(isVec3));
    return lines.filter(line => line.length >= 2);
  }
  return [];
}

function transformPoint(point, matrix) {
  return matrix
    ? [0, 1, 2].map(row => (
      matrix[row][0] * point[0]
      + matrix[row][1] * point[1]
      + matrix[row][2] * point[2]
      + matrix[row][3]
    ))
    : point;
}

function expandedNodeLines(node) {
  const base = geometryLines(node);
  if (node.matrix) return base.map(line => line.map(point => transformPoint(point, node.matrix)));
  if (["tube-along", "cylinder-between", "tapered-cylinder-between", "lofted-surface"].includes(node.geometry?.type)) return base;

  const position = node.transform?.position ?? node.position ?? [0, 0, 0];
  const repeat = node.repetition?.type === "linear" ? node.repetition : null;
  const count = repeat?.count ?? 1;
  const start = repeat?.start ?? [0, 0, 0];
  const step = repeat?.step ?? [0, 0, 0];
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const offset = position.map((value, axis) => value + start[axis] + step[axis] * index);
    result.push(...base.map(line => line.map(point => point.map((value, axis) => value + offset[axis]))));
  }
  return result;
}

function expandedBoxFaces(node) {
  if (node.geometry?.type !== "box") return [];
  const [x, y, z] = node.geometry.size.map(value => value / 2);
  const corners = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
  ];
  const faces = [
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]
  ];
  const position = node.transform?.position ?? node.position ?? [0, 0, 0];
  return faces.map(face => face.map(index => {
    const point = transformPoint(corners[index], node.matrix);
    return node.matrix ? point : point.map((value, axis) => value + position[axis]);
  }));
}

export function drawModelPreview(canvas, nodes, options = {}) {
  if (!canvas) return;
  const state = {
    yaw: options.yaw ?? -.7,
    pitch: options.pitch ?? .48,
    zoom: options.zoom ?? 100
  };
  const scale = options.scale ?? 1;
  const ratio = globalThis.devicePixelRatio || 1;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 190;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#27343d";
  context.lineWidth = 1;
  for (let index = -4; index <= 4; index += 1) {
    context.beginPath();
    context.moveTo(0, height * .72 + index * 7);
    context.lineTo(width, height * .72 - index * 7);
    context.stroke();
  }

  const drawable = nodes.map(node => ({
    node,
    lines: expandedNodeLines(node),
    faces: expandedBoxFaces(node)
  }));
  const points = drawable.flatMap(item => [
    ...item.lines.flat(),
    ...item.faces.flat()
  ]);
  if (!points.length) {
    context.fillStyle = "#71808a";
    context.font = "12px sans-serif";
    context.textAlign = "center";
    context.fillText("空间方法 / 结构定义", width / 2, height / 2);
    return;
  }

  const center = [0, 1, 2].map(axis => (
    Math.min(...points.map(point => point[axis]))
    + Math.max(...points.map(point => point[axis]))
  ) / 2);
  const centered = point => point.map((value, axis) => value - center[axis]);
  const rotated = points.map(point => rotatePoint(centered(point), state));
  const extent = Math.max(.001, ...rotated.flatMap(point => [Math.abs(point[0]), Math.abs(point[1])]));
  const zoom = modelPreviewZoomForExtent({
    width,
    height,
    extent,
    zoom: state.zoom,
    scale,
    fitRatio: options.fitRatio,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom
  });
  const projected = [];

  for (const item of drawable) {
    const color = item.node.appearance?.color ?? "#aab5be";
    const opacity = item.node.appearance?.opacity ?? 1;
    const emissive = item.node.appearance?.emissive;
    const glow = item.node.appearance?.glow ?? 0;
    if (item.faces.length) {
      for (const face of item.faces) {
        const facePoints = face.map(point => rotatePoint(centered(point), state));
        projected.push({
          kind: "face",
          points: facePoints,
          color,
          opacity,
          emissive,
          glow,
          depth: facePoints.reduce((sum, point) => sum + point[2], 0) / facePoints.length
        });
      }
      continue;
    }
    for (const line of item.lines) {
      const linePoints = line.map(point => rotatePoint(centered(point), state));
      projected.push({
        kind: "line",
        points: linePoints,
        color,
        opacity,
        emissive,
        glow,
        width: ["tube-along", "cylinder-between", "tapered-cylinder-between"].includes(item.node.geometry.type)
          ? Math.max(2, (item.node.geometry.radius ?? Math.max(item.node.geometry.startRadius ?? 0, item.node.geometry.endRadius ?? 0, .03)) * zoom * 2)
          : item.node.geometry.type === "lofted-surface" ? 1.15 : 1.4,
        depth: linePoints.reduce((sum, point) => sum + point[2], 0) / linePoints.length
      });
    }
  }

  projected.sort((first, second) => first.depth - second.depth);
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const primitive of projected) {
    context.globalAlpha = primitive.opacity;
    context.shadowBlur = primitive.glow;
    context.shadowColor = primitive.emissive ?? "transparent";
    context.beginPath();
    primitive.points.forEach((point, index) => {
      const x = width / 2 + point[0] * zoom;
      const y = height / 2 - point[1] * zoom;
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    if (primitive.kind === "face") {
      context.closePath();
      context.fillStyle = `${primitive.color}30`;
      context.fill();
      context.strokeStyle = primitive.emissive ?? `${primitive.color}8c`;
      context.lineWidth = primitive.emissive ? 1.5 : 1;
      context.stroke();
    } else {
      context.strokeStyle = primitive.emissive ?? primitive.color;
      context.lineWidth = primitive.width;
      context.stroke();
    }
  }
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  context.globalAlpha = 1;
}
