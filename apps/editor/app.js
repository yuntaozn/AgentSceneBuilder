import { checkComposition, createDefaultRegistry, isCompositionManifest } from "../../packages/core/src/index.js";
import { applySyntaxFixes, checkSourceDraft, diagnosticRange } from "./diagnostic-range.js";
import { sweepGeometry } from "../../packages/core/src/sweep.js";
import modelLibrary from "../../registry/registry.json";
import { drawModelPreview, modelPreviewNodes, sweepWireLines } from "../shared/model-preview.js";
import { publicRegistryEntries } from "../shared/registry-visibility.js";

const registry = createDefaultRegistry();
const publicModelLibraryEntries = publicRegistryEntries(modelLibrary);
const defaultDocument = {
  id: "untitled-scene",
  component: "core.composition",
  parameters: {
    nodes: [
      { id: "cube", semanticType: "generic.solid", geometry: { type: "box", size: [1, 1, 1] }, transform: { position: [0, .5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, material: "default" },
      { id: "key-light", kind: "light", semanticType: "scene.light.directional", light: { type: "directional", color: "#ffffff", intensity: 4.5, helperLength: 3 }, transform: { position: [4, 6, 4], rotation: [-.77134, .7854, 0], scale: [1, 1, 1] } },
      { id: "fill-light", kind: "light", semanticType: "scene.light.directional", light: { type: "directional", color: "#8cc7ff", intensity: 1.8, helperLength: 2.5 }, transform: { position: [-4, 3, -4], rotation: [-.41613, -2.35619, 0], scale: [1, 1, 1] } },
      { id: "local-light", kind: "light", semanticType: "scene.light.point", light: { type: "point", color: "#fff0d2", intensity: 350, distance: 7 }, transform: { position: [2.8, 3.5, 2.8], rotation: [0, 0, 0], scale: [1, 1, 1] } }
    ],
    anchors: {},
    lighting: { enabled: true, preset: "studio", ambientIntensity: 1 }
  }
};

function defaultLightNodes() {
  return defaultDocument.parameters.nodes
    .filter(node => node.kind === "light" || node.light)
    .map(node => structuredClone(node));
}

function uniqueDocumentNodeId(base, usedIds) {
  let id = base;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

function withDefaultSceneLighting(sourceDocument) {
  const next = structuredClone(sourceDocument);
  next.parameters ??= {};
  next.parameters.nodes ??= [];
  next.parameters.anchors ??= {};
  next.parameters.lighting = {
    ...defaultDocument.parameters.lighting,
    ...(next.parameters.lighting ?? {})
  };
  const hasLightNode = next.parameters.nodes.some(node => node.kind === "light" || node.light);
  const hasLegacyLight = Array.isArray(next.parameters.lighting.lights) && next.parameters.lighting.lights.length > 0;
  if (!hasLightNode && !hasLegacyLight) {
    const usedIds = new Set(next.parameters.nodes.map(node => node.id).filter(Boolean));
    next.parameters.nodes.push(...defaultLightNodes().map(node => ({
      ...node,
      id: uniqueDocumentNodeId(node.id, usedIds)
    })));
    next.parameters.lighting.enabled = true;
  }
  return next;
}

const $ = (selector) => document.querySelector(selector);
const canvas = $("#viewport");
const context = canvas.getContext("2d");
const threeCanvas = $("#threeViewport");
let threeRenderer = null;
let requestedRenderMode = localStorage.getItem("agentscene.renderer") === "canvas" ? "canvas" : "three";
let renderMode = "canvas";
let threeNeedsRebuild = true;
let threeLoading = null;
let documentValue = structuredClone(defaultDocument);
let build = null;
let selectedId = null;
let selectedOccurrenceExplicit = false;
let diagnostics = [];
let diagnosticsSource;
let sourceDraftPending = false;
let lastSyntaxRepair;
let view = { yaw: -0.72, pitch: 0.52, zoom: 84, panX: 0, panY: 20 };
let projectedNodes = [];
let hiddenPrototypes = new Set();
let isolatedPrototype = null;
let showGrid = true;
let xray = false;
let undoStack = [];
let redoStack = [];
let editMode = "orbit";
let animationOffsets = new Map();
let animationRotations = new Map();
let animationRotationModes = new Map();
let animationHandle = null;
let animationPreviewUsesBuild = false;
let selectedPrototypes = new Set();
let activePrototype = null;
let changeLog = [];
let gizmoHitAreas = [];
let pathHitAreas = [];
let annotationHitAreas = [];
let selectedAnnotationId = null;
let collapsedPrototypes = new Set();
let draggedPrototype = null;
let soloLightPrototype = null;
const initialDocument = structuredClone(defaultDocument);

const palette = { concrete: "#7d8991", steel: "#8fd0d1", water: "#54a8ff", accent: "#d9ff57", default: "#aab5be" };
const add = (a, b) => a.map((value, index) => value + b[index]);
const sub = (a, b) => a.map((value, index) => value - b[index]);
const scale = (vector, amount) => vector.map((value) => value * amount);
const isVec3 = (point) => Array.isArray(point) && point.length >= 3 && point.every(Number.isFinite);

function applyMatrix(point, matrix) {
  if (!matrix) return point;
  return [0, 1, 2].map((row) => matrix[row][0] * point[0] + matrix[row][1] * point[1] + matrix[row][2] * point[2] + matrix[row][3]);
}

function project(point) {
  const center = build?.bounds?.center ?? [0, 0, 0];
  let [x, y, z] = sub(point, center);
  const cy = Math.cos(view.yaw); const sy = Math.sin(view.yaw);
  [x, z] = [x * cy - z * sy, x * sy + z * cy];
  const cp = Math.cos(view.pitch); const sp = Math.sin(view.pitch);
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  return [canvas.clientWidth / 2 + x * view.zoom + view.panX, canvas.clientHeight / 2 - y * view.zoom + view.panY, z];
}

function screenDeltaToWorld(dx, dy) {
  const amountX = dx / Math.max(1, view.zoom);
  const amountY = dy / Math.max(1, view.zoom);
  return Math.abs(view.pitch) > 1.2 ? [amountX, 0, amountY] : [amountX, -amountY, 0];
}

function sceneDisplayName() {
  return documentValue.title || documentValue.name || documentValue.id || "未命名场景";
}

function defaultAnnotationPosition() {
  const bounds = build?.bounds;
  if (!bounds) return [0, 1, 0];
  const center = bounds.center ?? [0, 0, 0];
  const maxY = bounds.max?.[1] ?? center[1] + 1;
  return [center[0], maxY + .35, center[2]];
}

function nodeHasDescendants(id){const nodes=documentValue.parameters?.nodes??[],children=new Map();for(const node of nodes){if(node.parent){children.get(node.parent)?.push(node)??children.set(node.parent,[node])}}const stack=[...(children.get(id)??[])];while(stack.length){const node=stack.pop();if(node)return true;stack.push(...(children.get(node.id)??[]))}return false}
function animatableNodes(){return(documentValue.parameters?.nodes??[]).filter(node=>node.geometry||node.light||nodeHasDescendants(node.id))}
function animationNeedsRebuild(target){const source=documentValue.parameters?.nodes?.find(node=>node.id===target);return !!source&&(nodeHasDescendants(target)||(!source.geometry&&!source.light))}
function animatedBuild(animation,value){const clone=structuredClone(documentValue),source=clone.parameters?.nodes?.find(node=>node.id===animation.target);if(!source)return build;source.transform={position:source.transform?.position??source.position??[0,0,0],rotation:source.transform?.rotation??[0,0,0],scale:source.transform?.scale??[1,1,1]};if(animation.property==="rotation")source.transform.rotation=value;else source.transform.position=add(source.transform.position,value);return registry.build(clone)}
function visualOffset(node){return animationOffsets.get(node.metadata?.compositionNodeId)??[0,0,0]}
function visualRotation(node){return animationRotations.get(node.metadata?.compositionNodeId)??[0,0,0]}
function animatedWorldPoint(node,localPoint){const rotation=visualRotation(node),mode=animationRotationModes.get(node.metadata?.compositionNodeId),base=applyMatrix(mode?.space==="group"?localPoint:rotatePoint(localPoint,rotation),node.matrix);return add(mode?.space==="group"?add(mode.pivot,rotatePoint(sub(base,mode.pivot),rotation)):base,visualOffset(node))}
function rotatePoint([x,y,z],[rx,ry,rz]){let c=Math.cos(rx),s=Math.sin(rx);[y,z]=[y*c-z*s,y*s+z*c];c=Math.cos(ry);s=Math.sin(ry);[x,z]=[x*c+z*s,-x*s+z*c];c=Math.cos(rz);s=Math.sin(rz);return[x*c-y*s,x*s+y*c,z]}
function boxFaces(node) {
  const [x, y, z] = node.geometry.size.map((value) => value / 2);
  const local = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
  const points = local.map((point) => animatedWorldPoint(node,point));
  return [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4]].map((face) => face.map((index) => points[index]));
}

function primitiveWorldPoint(node,point){return animatedWorldPoint(node,point)}
function sampledCircle(count,pointAt){const points=Array.from({length:count+1},(_,index)=>pointAt(index/count*Math.PI*2));return points}
function solidWireLines(node){const g=node.geometry,lines=[];
  if(g.type==="sphere"){for(const plane of ["xy","xz","yz"])lines.push(sampledCircle(32,a=>plane==="xy"?[g.radius*Math.cos(a),g.radius*Math.sin(a),0]:plane==="xz"?[g.radius*Math.cos(a),0,g.radius*Math.sin(a)]:[0,g.radius*Math.cos(a),g.radius*Math.sin(a)]))}
  if(g.type==="cylinder"||g.type==="cone"){const y0=-g.height/2,y1=g.height/2;lines.push(sampledCircle(32,a=>[g.radius*Math.cos(a),y0,g.radius*Math.sin(a)]));if(g.type==="cylinder")lines.push(sampledCircle(32,a=>[g.radius*Math.cos(a),y1,g.radius*Math.sin(a)]));for(let i=0;i<8;i++){const a=i/8*Math.PI*2;lines.push(g.type==="cone"?[[g.radius*Math.cos(a),y0,g.radius*Math.sin(a)],[0,y1,0]]:[[g.radius*Math.cos(a),y0,g.radius*Math.sin(a)],[g.radius*Math.cos(a),y1,g.radius*Math.sin(a)]])}}
  if(g.type==="torus"){for(const v of [0,Math.PI/2,Math.PI,Math.PI*1.5])lines.push(sampledCircle(40,u=>[(g.majorRadius+g.tubeRadius*Math.cos(v))*Math.cos(u),g.tubeRadius*Math.sin(v),(g.majorRadius+g.tubeRadius*Math.cos(v))*Math.sin(u)]));for(let i=0;i<8;i++){const u=i/8*Math.PI*2;lines.push(sampledCircle(18,v=>[(g.majorRadius+g.tubeRadius*Math.cos(v))*Math.cos(u),g.tubeRadius*Math.sin(v),(g.majorRadius+g.tubeRadius*Math.cos(v))*Math.sin(u)]))}}
  return lines.map(line=>line.map(point=>primitiveWorldPoint(node,point)));
}

function animatedPolyline(node, rawPoints) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 2 || rawPoints.some(point => !isVec3(point))) return [];
  const offset = visualOffset(node);
  const rotation = visualRotation(node);
  const mode = animationRotationModes.get(node.metadata?.compositionNodeId);
  const pivot = mode?.space === "group"
    ? mode.pivot
    : node.matrix
      ? [node.matrix[0][3], node.matrix[1][3], node.matrix[2][3]]
      : (node.bounds?.center ?? node.transform?.position ?? rawPoints[0]);
  if (!isVec3(pivot)) return rawPoints.map(point => add(point, offset));
  return rawPoints.map(point => add(add(pivot, rotatePoint(sub(point, pivot), rotation)), offset));
}

function loftedSectionRing(section, segments) {
  if (!section || !isVec3(section.center)) return [];
  const axisX = isVec3(section.axisX) ? section.axisX : [section.radiusX ?? 0, 0, 0];
  const axisZ = isVec3(section.axisZ) ? section.axisZ : [0, 0, section.radiusZ ?? 0];
  if (!isVec3(axisX) || !isVec3(axisZ)) return [];
  if (Array.isArray(section.profile) && section.profile.length >= 3) {
    return Array.from({ length: segments + 1 }, (_, index) => {
      const [x, z] = profileSample(section.profile, index, segments);
      return add(add(section.center, scale(axisX, x)), scale(axisZ, z));
    });
  }
  return sampledCircle(segments, angle => add(add(section.center, scale(axisX, Math.cos(angle))), scale(axisZ, Math.sin(angle))));
}

function profileSample(profile, index, segments) {
  const scaled = index / segments * profile.length;
  const base = Math.floor(scaled) % profile.length;
  const next = (base + 1) % profile.length;
  const t = scaled - Math.floor(scaled);
  const a = profile[base], b = profile[next];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function loftedSurfaceWireLines(node) {
  const sections = node.geometry?.sections ?? [];
  if (sections.length < 2) return [];
  const profileSegments = Math.max(0, ...sections.map(section => Array.isArray(section.profile) ? section.profile.length : 0));
  const segments = Math.min(32, Math.max(6, node.geometry.radialSegments ?? (profileSegments || 10)));
  const rings = sections.map(section => loftedSectionRing(section, segments));
  if (rings.some(ring => ring.length < 2)) return [];
  const lines = rings.map(ring => animatedPolyline(node, ring));
  const used = new Set();
  const longitudinalCount = Math.min(8, segments);
  for (let spoke = 0; spoke < longitudinalCount; spoke += 1) {
    const index = Math.round(spoke / longitudinalCount * segments) % segments;
    if (used.has(index)) continue;
    used.add(index);
    lines.push(animatedPolyline(node, rings.map(ring => ring[index])));
  }
  const spine = sections.map(section => section.center).filter(isVec3);
  if (spine.length >= 2) lines.push(animatedPolyline(node, spine));
  return lines.filter(line => line.length >= 2);
}

function pathGeometryLines(node) {
  const type = node.geometry?.type;
  if (type === "sweep") return sweepWireLines(node.geometry).map(line => line.map(point => animatedWorldPoint(node, point)));
  if (type === "tube-along") return [animatedPolyline(node, node.geometry.points)].filter(line => line.length >= 2);
  if (type === "cylinder-between" || type === "tapered-cylinder-between") return [animatedPolyline(node, [node.geometry.start, node.geometry.end])].filter(line => line.length >= 2);
  if (type === "lofted-surface") return loftedSurfaceWireLines(node);
  return [];
}

function geometryStrokeWidth(node, selected = false) {
  const geometry = node.geometry ?? {};
  if (geometry.type === "tube-along" || geometry.type === "cylinder-between" || geometry.type === "tapered-cylinder-between") {
    const radius = geometry.radius ?? Math.max(geometry.startRadius ?? 0, geometry.endRadius ?? 0, .035);
    return Math.max(selected ? 4 : 2, radius * view.zoom * (selected ? 2.8 : 2));
  }
  return geometry.type === "lofted-surface" ? (selected ? 2.4 : 1.35) : (selected ? 2.6 : 1.25);
}

function colorFor(node) { return node.appearance?.color ?? palette[node.material] ?? palette.default; }

function drawGrid() {
  if (!showGrid) return;
  context.save(); context.lineWidth = 1; context.strokeStyle = "#8ea0ad18";
  for (let i = -8; i <= 8; i += 1) {
    for (const line of [[[i,0,-8],[i,0,8]],[[-8,0,i],[8,0,i]]]) {
      const a = project(line[0]); const b = project(line[1]);
      context.beginPath(); context.moveTo(a[0],a[1]); context.lineTo(b[0],b[1]); context.stroke();
    }
  }
  context.restore();
}

function prepareCanvasLayer() {
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(canvas.clientWidth * ratio) || canvas.height !== Math.round(canvas.clientHeight * ratio)) {
    canvas.width = Math.round(canvas.clientWidth * ratio); canvas.height = Math.round(canvas.clientHeight * ratio);
  }
  context.setTransform(ratio,0,0,ratio,0,0); context.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
}

function drawCanvasLight(node){
  const prototypeId=node.metadata?.compositionNodeId;if(hiddenPrototypes.has(prototypeId)||(isolatedPrototype&&prototypeId!==isolatedPrototype))return;
  const position=node.matrix?[node.matrix[0][3],node.matrix[1][3],node.matrix[2][3]]:node.transform?.position??[0,0,0],p=project(position),selected=selectedPrototypes.has(prototypeId),color=node.light?.color??"#fff1d6",type=node.light?.type??"point";context.save();context.strokeStyle=selected?"#d9ff57":color;context.fillStyle=color;context.lineWidth=selected?2.5:1.5;
  if(type==="directional"){context.strokeRect(p[0]-8,p[1]-6,16,12)}else{context.beginPath();context.arc(p[0],p[1],selected?9:7,0,Math.PI*2);context.fill();context.stroke()}
  context.beginPath();context.moveTo(p[0]-12,p[1]);context.lineTo(p[0]+12,p[1]);context.moveTo(p[0],p[1]-12);context.lineTo(p[0],p[1]+12);context.stroke();
  if(selected&&type==="point"){context.globalAlpha=.62;context.setLineDash([6,4]);const radius=Math.max(24,(node.light.distance??7)*view.zoom);context.beginPath();context.arc(p[0],p[1],radius,0,Math.PI*2);context.stroke()}
  if(selected&&type!=="point"){const matrix=node.matrix,direction=matrix?[-matrix[0][2],-matrix[1][2],-matrix[2][2]]:[0,0,-1],length=node.light?.helperLength??4,end=project(add(position,scale(direction,length))),dx=end[0]-p[0],dy=end[1]-p[1],screenLength=Math.hypot(dx,dy)||1,tx=dx/screenLength,ty=dy/screenLength;context.setLineDash([6,4]);context.beginPath();context.moveTo(p[0],p[1]);context.lineTo(end[0],end[1]);context.stroke();context.setLineDash([]);context.beginPath();context.moveTo(end[0],end[1]);context.lineTo(end[0]-tx*13-ty*6,end[1]-ty*13+tx*6);context.lineTo(end[0]-tx*13+ty*6,end[1]-ty*13-tx*6);context.closePath();context.fillStyle=selected?"#d9ff57":color;context.fill();if(type==="spot"){const spread=Math.max(18,Math.tan(node.light.angle??Math.PI/5)*length*view.zoom*.35);context.beginPath();context.moveTo(p[0],p[1]);context.lineTo(end[0]-ty*spread,end[1]+tx*spread);context.lineTo(end[0]+ty*spread,end[1]-tx*spread);context.closePath();context.stroke()}}
  context.restore();projectedNodes.push({id:node.id,minX:p[0]-14,maxX:p[0]+14,minY:p[1]-14,maxY:p[1]+14,depth:p[2]});
}

function selectedGeometryLines(node) {
  if (node.geometry.type === "box") return boxFaces(node).flatMap(face => face.map((point, index) => [point, face[(index + 1) % face.length]]));
  if (["sphere", "cylinder", "cone", "torus"].includes(node.geometry.type)) return solidWireLines(node);
  return pathGeometryLines(node);
}

function drawSelectionOverlay() {
  if (!build || !selectedPrototypes.size) return;
  context.save();
  context.strokeStyle = "#d9ff57";
  context.shadowBlur = 12;
  context.shadowColor = "rgba(217,255,87,.75)";
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const node of build.nodes) {
    const prototypeId = node.metadata?.compositionNodeId;
    const selected = selectedOccurrenceExplicit ? node.id === selectedId : selectedPrototypes.has(prototypeId);
    if (!selected || node.kind === "light" || !node.geometry) continue;
    if (hiddenPrototypes.has(prototypeId) || (isolatedPrototype && prototypeId !== isolatedPrototype)) continue;
    for (const line of selectedGeometryLines(node)) {
      const points = line.map(project);
      context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(point[0], point[1]) : context.moveTo(point[0], point[1]));
      context.lineWidth = geometryStrokeWidth(node, true);
      context.stroke();
    }
  }
  context.restore();
}

function draw() {
  if (renderMode === "three" && threeRenderer) {
    threeRenderer.render(build,{view,showGrid,xray,palette,lighting:lightingConfig(),soloLightPrototype,hiddenPrototypes,isolatedPrototype,selectedPrototypes,animationOffsets,animationRotations,animationRotationModes,forceRebuild:threeNeedsRebuild});
    threeNeedsRebuild=false;
    prepareCanvasLayer();
    drawSelectionOverlay();
    if(editMode!=="orbit"){drawPathControls();drawGizmo()}
    drawAnnotations();
    return;
  }
  prepareCanvasLayer();
  if (!build) return;
  drawGrid();
  const primitives = [];
  projectedNodes = [];
  for (const node of build.nodes) {
    const prototypeId = node.metadata?.compositionNodeId;
    if (hiddenPrototypes.has(prototypeId) || (isolatedPrototype && prototypeId !== isolatedPrototype)) continue;
    if(node.kind==="light")continue;
    if (node.geometry.type === "box") {
      for (const face of boxFaces(node)) {
        const projected = face.map(project); primitives.push({ kind:"face", node, points:projected, depth:projected.reduce((sum,p)=>sum+p[2],0)/projected.length });
      }
    } else if (["sphere","cylinder","cone","torus"].includes(node.geometry.type)) {
      for(const line of solidWireLines(node)){const projected=line.map(project);primitives.push({kind:"wire",node,points:projected,depth:projected.reduce((sum,p)=>sum+p[2],0)/projected.length})}
    } else {
      for (const line of pathGeometryLines(node)) {
        const projected = line.map(project);
        primitives.push({ kind: node.geometry.type === "lofted-surface" ? "wire" : "line", node, points: projected, depth: projected.reduce((sum,p)=>sum+p[2],0)/projected.length });
      }
    }
  }
  primitives.sort((a,b)=>a.depth-b.depth);
  for (const primitive of primitives) {
    const selected = selectedOccurrenceExplicit ? primitive.node.id === selectedId : selectedPrototypes.has(primitive.node.metadata?.compositionNodeId); const color = colorFor(primitive.node);
    context.globalAlpha=primitive.node.appearance?.opacity??1;
    context.shadowBlur=primitive.node.appearance?.glow??0; context.shadowColor=primitive.node.appearance?.emissive??"transparent";
    context.beginPath(); primitive.points.forEach((point,index)=>index?context.lineTo(point[0],point[1]):context.moveTo(point[0],point[1]));
    if (primitive.kind === "face") { context.closePath(); context.fillStyle = selected ? "#d9ff5775" : `${color}${xray?"18":"58"}`; context.fill(); context.strokeStyle = selected ? "#e8ff90" : `${color}${xray?"68":"d0"}`; context.lineWidth = selected?1.8:1; context.stroke(); }
    else { context.strokeStyle = selected ? "#e8ff90" : color; context.lineWidth = geometryStrokeWidth(primitive.node, selected); context.lineCap="round"; context.lineJoin="round"; context.stroke(); }
    const xs=primitive.points.map(p=>p[0]), ys=primitive.points.map(p=>p[1]); projectedNodes.push({id:primitive.node.id,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),depth:primitive.depth});
  }
  context.shadowBlur=0; context.shadowColor="transparent"; context.globalAlpha=1;
  for(const node of build.nodes)if(node.kind==="light")drawCanvasLight(node);
  drawSelectionOverlay();
  for (const [anchorId, point] of Object.entries(build.anchors?.local ?? {})) {
    const p=project(point); context.beginPath(); context.arc(p[0],p[1],4,0,Math.PI*2); context.fillStyle="#c8f24d"; context.fill(); context.strokeStyle="#101609"; context.lineWidth=2; context.stroke(); context.fillStyle="#dfe8cf"; context.font="9px Cascadia Code"; context.fillText(anchorId,p[0]+8,p[1]-7);
  }
  drawAttachments();
  drawPathControls();
  drawGizmo();
  drawAnnotations();
}

function anchorPoint(reference) {
  const key=String(reference??"").replace(/^#/ ,"").split("#").pop();
  return build?.anchors?.local?.[key] ?? null;
}
function drawAttachments(){
  const attachments=build?.attachments??documentValue.parameters?.attachments??[];
  context.save();context.setLineDash([6,4]);context.font="9px Cascadia Code";
  for(const item of attachments){const from=anchorPoint(item.from??item.source??item.a),to=anchorPoint(item.to??item.target??item.b);if(!from||!to)continue;const a=project(from),b=project(to);context.strokeStyle="#68d5c2";context.lineWidth=1.5;context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.stroke();context.fillStyle="#a8f0df";context.fillText(item.id??item.kind??"attachment",(a[0]+b[0])/2+5,(a[1]+b[1])/2-5)}
  context.restore();
}
function sourceTransformPoint(source, point) {
  const transform = source.transform ?? {};
  const position = transform.position ?? source.position ?? [0, 0, 0];
  const rotation = transform.rotation ?? [0, 0, 0];
  const nodeScale = transform.scale ?? [1, 1, 1];
  return add(rotatePoint(point.map((value, axis) => value * nodeScale[axis]), rotation), position);
}
function sourceWorldPoint(source, point) {
  let result = sourceTransformPoint(source, point);
  let parentId = source.parent;
  const visited = new Set([source.id]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = documentValue.parameters.nodes.find(node => node.id === parentId);
    if (!parent) break;
    result = sourceTransformPoint(parent, result);
    parentId = parent.parent;
  }
  return result;
}
function sourceControlKind(source) {
  if (["tube-along", "sweep"].includes(source?.geometry?.type)) return "tube-point";
  if (source?.geometry?.type === "lofted-surface") return "loft-section";
  if (source?.repetition?.type === "path") return "path-point";
  return null;
}
function sourceControlPoints(source, kind = sourceControlKind(source)) {
  if (kind === "tube-point") return source.geometry.points;
  if (kind === "loft-section") return source.geometry.sections.map(section => section.center);
  if (kind === "path-point") return source.repetition.points;
  return null;
}
function readSourceControlPoint(source, kind, index) {
  if (kind === "loft-section") return source.geometry.sections[index]?.center;
  return sourceControlPoints(source, kind)?.[index];
}
function writeSourceControlPoint(source, kind, index, point) {
  if (kind === "loft-section") source.geometry.sections[index].center = point;
  else sourceControlPoints(source, kind)[index] = point;
}
function drawPathControls(){
  pathHitAreas=[];
  if(!activePrototype)return;
  const pipeId = clipBinding(activePrototype)?.node;
  const source = documentValue.parameters.nodes.find(n => n.id === (pipeId ?? activePrototype));
  const kind=sourceControlKind(source),points=kind?sourceControlPoints(source,kind):null;if(!points?.length)return;
  context.save();context.strokeStyle=kind==="loft-section"?"#72f2ffaa":"#d9ff57aa";context.setLineDash([3,3]);context.beginPath();points.forEach((point,index)=>{const p=project(sourceWorldPoint(source,point));index?context.lineTo(p[0],p[1]):context.moveTo(p[0],p[1]);pathHitAreas.push({source,kind,index,x:p[0],y:p[1]})});context.stroke();context.setLineDash([]);for(const hit of pathHitAreas){context.fillStyle="#10151a";context.strokeStyle=hit.kind==="loft-section"?"#72f2ff":"#d9ff57";context.lineWidth=2;context.fillRect(hit.x-4,hit.y-4,8,8);context.strokeRect(hit.x-4,hit.y-4,8,8)}context.restore();
}
function activeOrigin(){const node=build?.nodes.find(n=>n.metadata?.compositionNodeId===activePrototype);return node?.matrix?[node.matrix[0][3],node.matrix[1][3],node.matrix[2][3]]:null}
function drawGizmo(){
  gizmoHitAreas=[];const origin=activeOrigin();if(!origin||editMode==="orbit")return;const center=project(origin),axes=[{axis:"x",color:"#ff6363",v:[.7,0,0]},{axis:"y",color:"#65db7c",v:[0,.7,0]},{axis:"z",color:"#5f9dff",v:[0,0,.7]}];context.save();context.font="bold 10px Segoe UI";
  if(editMode==="move"){for(const item of axes){const end=project(add(origin,item.v));context.strokeStyle=item.color;context.lineWidth=3;context.beginPath();context.moveTo(center[0],center[1]);context.lineTo(end[0],end[1]);context.stroke();context.fillStyle=item.color;context.fillText(item.axis.toUpperCase(),end[0]+4,end[1]-4);gizmoHitAreas.push({type:"move",axis:item.axis,a:center,b:end})}}
  else {for(const item of axes){const radius=.78,points=Array.from({length:65},(_,index)=>{const angle=index/64*Math.PI*2,local=item.axis==="x"?[0,Math.cos(angle)*radius,Math.sin(angle)*radius]:item.axis==="y"?[Math.cos(angle)*radius,0,Math.sin(angle)*radius]:[Math.cos(angle)*radius,Math.sin(angle)*radius,0];return project(add(origin,local))});for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],front=(a[2]+b[2])/2>=center[2];context.globalAlpha=front?1:.24;context.strokeStyle=item.color;context.lineWidth=front?3:1.5;context.setLineDash(front?[]:[3,3]);context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.stroke()}context.setLineDash([]);context.globalAlpha=1;const tip=points[12],previous=points[9],dx=tip[0]-previous[0],dy=tip[1]-previous[1],length=Math.hypot(dx,dy)||1,tx=dx/length,ty=dy/length;context.fillStyle=item.color;context.beginPath();context.moveTo(tip[0],tip[1]);context.lineTo(tip[0]-tx*10-ty*5,tip[1]-ty*10+tx*5);context.lineTo(tip[0]-tx*10+ty*5,tip[1]-ty*10-tx*5);context.closePath();context.fill();context.fillText(item.axis.toUpperCase(),tip[0]+8,tip[1]-8);gizmoHitAreas.push({type:"rotate",axis:item.axis,points})}}
  context.restore();
}

function drawAnnotations() {
  annotationHitAreas=[];
  const annotations=build?.annotations??[];
  if(!annotations.length)return;
  context.save();
  context.font="10px Segoe UI";
  context.textBaseline="middle";
  for(const [index,annotation] of annotations.entries()){
    if(!annotation.position)continue;
    const id=annotation.id??`label-${index+1}`,text=String(annotation.text??id),p=project(annotation.position),selected=id===selectedAnnotationId;
    const width=Math.min(220,Math.max(58,context.measureText(text).width+18)),height=23,x=p[0]+10,y=p[1]-28,color=annotation.color??"#eaf3cf";
    context.strokeStyle=selected?"#d9ff57":"rgba(200,242,77,.45)";
    context.lineWidth=selected?2:1;
    context.beginPath();context.moveTo(p[0],p[1]);context.lineTo(x,y+height/2);context.stroke();
    context.fillStyle=selected?"#d9ff57":"rgba(12,16,19,.88)";
    context.strokeStyle=selected?"#f0ffad":"rgba(200,242,77,.35)";
    context.beginPath();context.roundRect(x,y,width,height,5);context.fill();context.stroke();
    context.fillStyle=selected?"#111609":color;
    context.fillText(text,x+9,y+height/2,width-16);
    context.fillStyle=selected?"#d9ff57":color;
    context.beginPath();context.arc(p[0],p[1],selected?4:3,0,Math.PI*2);context.fill();
    annotationHitAreas.push({id,minX:Math.min(p[0]-8,x),maxX:Math.max(p[0]+8,x+width),minY:Math.min(p[1]-8,y),maxY:Math.max(p[1]+8,y+height),depth:p[2]});
  }
  context.restore();
}

function property(label, value) { return `<div class="property"><span>${label}</span><code>${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</code></div>`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char])); }
function vectorInputs(className,values,step){return `<div class="edit-grid">${values.map((value,index)=>`<input class="${className}" data-axis="${index}" type="number" step="${step}" value="${Number(value).toFixed(3).replace(/\.000$/,'')}">`).join("")}</div>`}

function renderSceneInspector() {
  $("#inspectTab").innerHTML = `<div class="selection-context"><span>当前选择</span><strong>${escapeHtml(sceneDisplayName())}</strong><small>场景级属性：用于命名、说明和整体模型管理</small></div><div class="section"><div class="section-title">SCENE</div><div class="edit-field"><label>场景名称 <span class="field-key">title / name</span></label><small class="field-help">给人看的名称，会显示在顶部状态栏和导出的 JSON 中。</small><input id="sceneTitle" value="${escapeHtml(sceneDisplayName())}"></div><div class="edit-field"><label>场景 ID <span class="field-key">id</span></label><small class="field-help">给 Agent 和文件使用的稳定标识，建议使用英文、数字、短横线。</small><input id="sceneId" value="${escapeHtml(documentValue.id??"untitled-scene")}"></div><div class="edit-field"><label>场景说明 <span class="field-key">description</span></label><input id="sceneDescription" value="${escapeHtml(documentValue.description??"")}"></div><div class="inspector-actions"><button id="applySceneProperties" class="apply">应用场景属性</button></div></div><div class="section"><div class="section-title">MODEL SUMMARY</div>${property("展开节点",build?.nodes?.length??0)}${property("局部锚点",Object.keys(build?.anchors?.local??{}).length)}${property("重复系统",build?.repetitions?.length??0)}${property("画布标签",documentValue.parameters?.annotations?.length??0)}</div><div class="section"><div class="concept-note"><strong>选择方式</strong><span>点选左侧组件结构、画布模型或画布标签后，右侧会切换到对应属性。</span></div></div>`;
  $("#applySceneProperties").addEventListener("click",applySceneProperties);
}

function applySceneProperties() {
  const title=$("#sceneTitle").value.trim(),id=$("#sceneId").value.trim(),description=$("#sceneDescription").value.trim();
  if(!id){diagnostics=[{message:"场景 ID 不能为空"}];renderDiagnostics();setStatus("场景 ID 不能为空");return}
  pushUndo("更新场景属性");
  documentValue.id=id;
  documentValue.title=title||id;
  if(description)documentValue.description=description;else delete documentValue.description;
  compile(undefined,{preserveSource:true});
  setStatus(`已更新场景：${sceneDisplayName()}`);
}

function sectionExtent(profile, axis) {
  let min = Infinity, max = -Infinity;
  for (const point of profile) {
    min = Math.min(min, point[axis]);
    max = Math.max(max, point[axis]);
  }
  return max - min;
}

function sweepSizeFields(geometry) {
  if (geometry?.type !== "sweep") return "";
  return ["截面宽度（米）", "截面高度（米）"].map((label, axis) => {
    const value = sectionExtent(geometry.profile, axis);
    return value > 0 ? `<label class="edit-field">${label}<input id="sweepSize${axis}" type="number" min="0" step="any" value="${value}"></label>` : "";
  }).join("");
}

function renderInspector() {
  const sourceNode=documentValue.parameters?.nodes?.find(item=>item.id===activePrototype);
  const outputs=build?.nodes?.filter(item=>item.metadata?.compositionNodeId===activePrototype)??[];
  const node=(selectedOccurrenceExplicit&&build?.nodes.find(item=>item.id===selectedId))??outputs[0]??null;
  if (!sourceNode) {
    renderSceneInspector();
    return;
  }
  if(sourceNode.light){renderLightInspector(sourceNode);enhanceLightInspector(sourceNode);bindLightLivePreview(sourceNode);return}
  const transform=sourceNode?.transform??{};const position=transform.position??sourceNode?.position??[0,0,0];const rotation=transform.rotation??[0,0,0];const nodeScale=transform.scale??[1,1,1];const size=sourceNode?.geometry?.size;
  const parentOptions=[`<option value="">无父节点</option>`,...documentValue.parameters.nodes.filter(item=>item.id!==sourceNode.id&&!item.repetition).map(item=>`<option value="${escapeHtml(item.id)}" ${sourceNode.parent===item.id?"selected":""}>${escapeHtml(item.id)}</option>`)].join("");
  const selectionDescription=selectedOccurrenceExplicit&&node?node.metadata?.occurrenceRef??node.id:outputs.length>1?`组件原型（包含 ${outputs.length} 个展开实例）`:outputs.length===1?"组件原型（1 个实例）":"仅组织层级的空组件";
  const geometryHtml=sourceNode.geometry?`<div class="section"><div class="section-title">几何 · ${escapeHtml(sourceNode.geometry.type)}</div>${sweepSizeFields(sourceNode.geometry)}${size?`<div class="edit-field"><label>尺寸 X / Y / Z</label>${vectorInputs("editSize",size,.1)}</div>`:""}${sourceNode.geometry.radius!==undefined?`<div class="edit-field"><label>半径</label><input id="editRadius" type="number" min="0.001" step="0.01" value="${sourceNode.geometry.radius}"></div>`:""}${sourceNode.geometry.height!==undefined?`<div class="edit-field"><label>高度</label><input id="editHeight" type="number" min="0.001" step="0.1" value="${sourceNode.geometry.height}"></div>`:""}${sourceNode.geometry.majorRadius!==undefined?`<div class="edit-field"><label>圆环主半径</label><input id="editMajorRadius" type="number" min="0.001" step="0.1" value="${sourceNode.geometry.majorRadius}"></div><div class="edit-field"><label>圆管半径</label><input id="editTubeRadius" type="number" min="0.001" step="0.01" value="${sourceNode.geometry.tubeRadius}"></div>`:""}</div>`:`<div class="section"><div class="section-title">几何</div><div class="concept-note"><strong>空组件</strong><span>这个组件只用于组织父子关系和变换，本身没有可绘制几何。</span></div></div>`;
  $("#inspectTab").innerHTML = `<div class="selection-context"><span>当前选择</span><strong>${escapeHtml(sourceNode.id)}</strong><small>${escapeHtml(selectionDescription)}</small></div><div class="section"><div class="section-title">组件身份与层级</div><div class="edit-field"><label>组件 ID <span class="field-key">id / 原型 ID</span></label><small class="field-help">模型中的唯一名称。父子关系、动画和连接会通过它引用这个组件。</small><input id="editId" value="${escapeHtml(sourceNode.id)}"></div><div class="edit-field"><label>父组件 <span class="field-key">parent</span></label><small class="field-help">决定组件跟随谁移动、旋转和缩放。</small><select id="editParent">${parentOptions}</select></div><div class="edit-field"><label>用途分类 <span class="field-key">semanticType / 语义类型</span></label><small class="field-help">告诉 Agent 这是什么，例如 structure.column 表示结构柱；不决定几何外形。</small><input id="editSemantic" value="${escapeHtml(sourceNode.semanticType??"")}"></div>${property(selectedOccurrenceExplicit?"当前实例":"选择范围",selectionDescription)}</div><div class="section"><div class="section-title">外观与材质</div><div class="edit-field"><label>材质名称 <span class="field-key">material / 材质标识</span></label><small class="field-help">可复用的材质类别名称，例如 steel、concrete、water；颜色可在下方单独覆盖。</small><input id="editMaterial" value="${escapeHtml(sourceNode.material??"")}"></div><div class="edit-field"><label>颜色与不透明度</label><div class="color-row"><input id="editColor" type="color" value="${escapeHtml(sourceNode.appearance?.color??(node?colorFor(node):palette.default))}"><input id="editOpacity" type="number" min="0" max="1" step="0.05" value="${sourceNode.appearance?.opacity??1}"></div></div></div><div class="section"><div class="section-title">位置与姿态</div><div class="edit-field"><label>位置 X / Y / Z</label>${vectorInputs("editPosition",position,.1)}</div><div class="edit-field"><label>旋转 X / Y / Z（弧度）</label>${vectorInputs("editRotation",rotation,.1)}</div><div class="edit-field"><label>缩放 X / Y / Z</label>${vectorInputs("editScale",nodeScale,.1)}</div></div>${geometryHtml}<div class="section"><div class="inspector-actions"><button id="focusSelected">聚焦</button><button id="isolateSelected">${isolatedPrototype?"退出隔离":"隔离查看"}</button><button id="duplicateSelected">复制</button><button id="deleteSelected">删除</button>${sourceNode.geometry?`<button id="addMoveAnimation">＋ 移动动画</button><button id="addRotateAnimation">＋ 旋转动画</button>`:""}<button id="applyProperties" class="apply">应用全部修改</button></div></div>`;
  $("#applyProperties").addEventListener("click",()=>applyProperties(sourceNode));
  if (clipBinding(sourceNode.id)) {
    $("#editParent").disabled = true;
    $("#editParent").title = "管卡随所属管线移动。可在源 JSON 的 routeBindings 中调整绑定。";
  }
  $("#focusSelected").addEventListener("click",fitView);
  $("#isolateSelected").addEventListener("click",()=>{isolatedPrototype=isolatedPrototype?null:sourceNode.id;setStatus(isolatedPrototype?`正在隔离查看 ${sourceNode.id}；点击“退出隔离”或按 Esc 恢复全部`:`已退出隔离，恢复显示全部组件`);renderTree();renderInspector();draw()});
  $("#duplicateSelected").addEventListener("click",()=>duplicateNode(sourceNode.id));
  $("#deleteSelected").addEventListener("click",()=>deleteNode(sourceNode.id));
  $("#addMoveAnimation")?.addEventListener("click",()=>addAnimation(sourceNode.id,"position"));
  $("#addRotateAnimation")?.addEventListener("click",()=>addAnimation(sourceNode.id,"rotation"));
}

function renderLightInspector(sourceNode){const transform=sourceNode.transform??{},position=transform.position??[0,0,0],rotation=transform.rotation??[0,0,0],light=sourceNode.light,parents=[`<option value="">无父节点</option>`,...documentValue.parameters.nodes.filter(item=>item.id!==sourceNode.id&&!item.repetition).map(item=>`<option value="${escapeHtml(item.id)}" ${sourceNode.parent===item.id?"selected":""}>${escapeHtml(item.id)}</option>`)].join("");$("#inspectTab").innerHTML=`<div class="selection-context"><span>当前选择 · 灯光组件</span><strong>${escapeHtml(sourceNode.id)}</strong><small>可复用选择、移动、旋转、父子、复制和动画能力</small></div><div class="section"><div class="section-title">LIGHT COMPONENT</div><div class="edit-field"><label>组件 ID</label><input id="editLightId" value="${escapeHtml(sourceNode.id)}"></div><div class="edit-field"><label>父组件</label><select id="editLightParent">${parents}</select></div><div class="edit-field"><label>灯光类型</label><select id="editLightType"><option value="point" ${light.type==="point"?"selected":""}>点光源</option><option value="directional" ${light.type==="directional"?"selected":""}>方向光</option><option value="spot" ${light.type==="spot"?"selected":""}>聚光灯</option></select></div><div class="edit-field"><label><input id="editLightEnabled" type="checkbox" ${light.enabled!==false?"checked":""}> 启用该灯光</label></div></div><div class="section"><div class="section-title">光学参数</div><div class="color-row"><input id="editLightColor" type="color" value="${light.color??"#ffffff"}"><input id="editLightIntensity" type="number" min="0" step=".1" value="${light.intensity??1}"></div>${light.type!=="directional"?`<div class="edit-field"><label>有效距离</label><input id="editLightDistance" type="number" min="0" step=".5" value="${light.distance??20}"></div>`:""}${light.type==="spot"?`<div class="edit-field"><label>锥角（度）</label><input id="editLightAngle" type="number" min="1" max="179" step="1" value="${(light.angle??Math.PI/5)*180/Math.PI}"></div><div class="edit-field"><label>边缘柔化 0–1</label><input id="editLightPenumbra" type="number" min="0" max="1" step=".05" value="${light.penumbra??.25}"></div>`:""}</div><div class="section"><div class="section-title">位置与照射方向</div><div class="edit-field"><label>位置 X / Y / Z</label>${vectorInputs("editLightPosition",position,.1)}</div><div class="edit-field"><label>旋转 X / Y / Z（弧度）</label>${vectorInputs("editLightRotation",rotation,.1)}<small class="field-help">方向光和聚光灯沿局部 -Z 轴照射，可使用三轴旋转操纵器。</small></div></div><div class="section"><div class="inspector-actions"><button id="focusSelected">适应场景</button><button id="duplicateSelected">复制</button><button id="deleteSelected">删除</button><button id="addMoveAnimation">＋ 移动动画</button><button id="addRotateAnimation">＋ 旋转动画</button><button id="applyLightProperties" class="apply">应用灯光修改</button></div></div>`;$("#applyLightProperties").addEventListener("click",()=>applyLightProperties(sourceNode));$("#focusSelected").addEventListener("click",fitView);$("#duplicateSelected").addEventListener("click",()=>duplicateNode(sourceNode.id));$("#deleteSelected").addEventListener("click",()=>deleteNode(sourceNode.id));$("#addMoveAnimation").addEventListener("click",()=>addAnimation(sourceNode.id,"position"));$("#addRotateAnimation").addEventListener("click",()=>addAnimation(sourceNode.id,"rotation"))}

function enhanceLightInspector(sourceNode){
  const type=sourceNode.light.type,descriptions={
    point:{title:"点光源 · 球形覆盖",text:"移动会改变发光中心；“有效距离”决定选中时显示的范围球。",steps:["移动：改变照明位置","距离：改变覆盖半径","强度：改变亮度"]},
    spot:{title:"聚光灯 · 锥形覆盖",text:"移动改变锥体起点，旋转改变朝向；距离与锥角共同决定覆盖范围。",steps:["移动：改变光源位置","旋转：改变照射方向","距离 / 锥角：改变锥体"]},
    directional:{title:"方向光 · 全场平行光",text:"方向光没有距离边界。移动只改变编辑标记的位置，旋转才会改变照射方向。",steps:["移动：仅移动控制标记","旋转：改变平行光方向","强度：改变全场亮度"]}
  },description=descriptions[type]??descriptions.point,guide=document.createElement("div");
  guide.className=`light-behavior-guide light-${type}`;guide.innerHTML=`<strong>${description.title}</strong><span>${description.text}</span><div>${description.steps.map(step=>`<i>${step}</i>`).join("")}</div><button id="soloLightPreview" class="${soloLightPrototype===sourceNode.id?"active":""}">${soloLightPrototype===sourceNode.id?"退出单灯预览":"单灯预览"}</button>`;$("#inspectTab .selection-context").after(guide);$("#soloLightPreview").addEventListener("click",()=>{soloLightPrototype=soloLightPrototype===sourceNode.id?null:sourceNode.id;threeNeedsRebuild=true;renderInspector();draw();setStatus(soloLightPrototype?`正在单独预览 ${sourceNode.id}，基础环境光已降至最低`:`已恢复完整灯光方案`) });
  const colorRow=$("#editLightIntensity")?.closest(".color-row");if(colorRow){colorRow.insertAdjacentHTML("beforebegin",'<div class="light-field-labels"><span>颜色</span><span>光照强度</span></div>')}
  const addSlider=(selector,{min,max,step,label})=>{const number=$(selector);if(!number)return;number.min=min;number.max=max;number.step=step;const slider=document.createElement("input");slider.type="range";slider.className="light-range-slider";slider.min=min;slider.max=max;slider.step=step;slider.value=number.value;slider.setAttribute("aria-label",label);number.closest(".edit-field,.color-row")?.append(slider);slider.addEventListener("input",()=>{number.value=slider.value;number.dispatchEvent(new Event("input",{bubbles:true}))});number.addEventListener("input",()=>{slider.value=number.value})};
  addSlider("#editLightIntensity",{min:0,max:type==="directional"?8:2000,step:type==="directional"?.1:5,label:"光照强度"});
  addSlider("#editLightDistance",{min:.5,max:50,step:.5,label:"有效距离"});
  addSlider("#editLightAngle",{min:1,max:120,step:1,label:"聚光灯锥角"});
  const help=$("#inspectTab .field-help");if(help)help.textContent=type==="directional"?"矩形标记是灯光位置；平行线从标记出发，末端三角箭头所指就是实际照射方向。":type==="spot"?"选中灯光后，画布会显示完整锥体；锥体从灯光位置向实际照射方向展开。":"点光源向四周发光，旋转不会改变效果。";
}

function previewLightProperties(sourceNode){const color=$("#editLightColor"),intensity=$("#editLightIntensity"),enabled=$("#editLightEnabled");if(!color||!intensity||!enabled)return;sourceNode.light.enabled=enabled.checked;sourceNode.light.color=color.value;sourceNode.light.intensity=Math.max(0,Number(intensity.value)||0);if($("#editLightDistance"))sourceNode.light.distance=Math.max(0,Number($("#editLightDistance").value)||0);if($("#editLightAngle"))sourceNode.light.angle=Math.max(1,Math.min(179,Number($("#editLightAngle").value)||36))*Math.PI/180;if($("#editLightPenumbra"))sourceNode.light.penumbra=Math.max(0,Math.min(1,Number($("#editLightPenumbra").value)||0));sourceNode.transform={...(sourceNode.transform??{}),position:readVector(".editLightPosition"),rotation:readVector(".editLightRotation"),scale:[1,1,1]};try{build=registry.build(documentValue);diagnostics=[]}catch(error){diagnostics=[{message:error.message}]}threeNeedsRebuild=true;syncSourceEditor();draw();setStatus(`正在实时预览灯光 ${sourceNode.id}`)}

function bindLightLivePreview(sourceNode){const panel=$("#inspectTab"),controls=panel.querySelectorAll("#editLightEnabled,#editLightColor,#editLightIntensity,#editLightDistance,#editLightAngle,#editLightPenumbra,.editLightPosition,.editLightRotation");let undoCaptured=false;const preview=()=>{if(!undoCaptured){pushUndo(`调整灯光 ${sourceNode.id}`);undoCaptured=true}previewLightProperties(sourceNode)};controls.forEach(control=>{control.addEventListener("input",preview);control.addEventListener("change",preview)});const type=$("#editLightType");if(type)type.addEventListener("change",()=>{if(!undoCaptured)pushUndo(`调整灯光 ${sourceNode.id}`);sourceNode.light.type=type.value;sourceNode.semanticType=`scene.light.${type.value}`;threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus(`已切换为${type.value==="point"?"点光源":type.value==="spot"?"聚光灯":"方向光"}，参数会实时预览`)})}

function applyLightProperties(sourceNode){pushUndo(`更新灯光 ${sourceNode.id}`);const oldId=sourceNode.id,nextId=$("#editLightId").value.trim();if(!nextId||nextId!==oldId&&documentValue.parameters.nodes.some(item=>item.id===nextId)){diagnostics=[{message:!nextId?"灯光 ID 不能为空":`组件 ID 已存在：${nextId}`}];renderDiagnostics();return}if(nextId!==oldId){for(const item of documentValue.parameters.nodes)if(item.parent===oldId)item.parent=nextId}sourceNode.id=nextId;sourceNode.parent=$("#editLightParent").value||undefined;sourceNode.light.type=$("#editLightType").value;sourceNode.semanticType=`scene.light.${sourceNode.light.type}`;sourceNode.light.enabled=$("#editLightEnabled").checked;sourceNode.light.color=$("#editLightColor").value;sourceNode.light.intensity=Math.max(0,Number($("#editLightIntensity").value)||0);if($("#editLightDistance"))sourceNode.light.distance=Math.max(0,Number($("#editLightDistance").value)||0);else delete sourceNode.light.distance;if($("#editLightAngle"))sourceNode.light.angle=Math.max(1,Math.min(179,Number($("#editLightAngle").value)||36))*Math.PI/180;else delete sourceNode.light.angle;if($("#editLightPenumbra"))sourceNode.light.penumbra=Math.max(0,Math.min(1,Number($("#editLightPenumbra").value)||0));else delete sourceNode.light.penumbra;sourceNode.transform={...(sourceNode.transform??{}),position:readVector(".editLightPosition"),rotation:readVector(".editLightRotation"),scale:[1,1,1]};activePrototype=nextId;selectedPrototypes=new Set([nextId]);threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus(`已更新灯光组件 ${nextId}`)}

function treeDropPosition(row, clientY) {
  const rect = row.getBoundingClientRect();
  const ratio = (clientY - rect.top) / Math.max(1, rect.height);
  if (ratio < .24) return "before";
  if (ratio > .76) return "after";
  return "inside";
}

function clearTreeDropTarget(row) {
  row.classList.remove("drop-before", "drop-after", "drop-inside");
  delete row.dataset.dropPosition;
}

function clearAllTreeDropTargets() {
  $("#tree").querySelectorAll(".drop-before,.drop-after,.drop-inside").forEach(clearTreeDropTarget);
  $("#tree").classList.remove("drop-root");
}

function markTreeDropTarget(row, position) {
  clearAllTreeDropTargets();
  row.classList.add(`drop-${position}`);
  row.dataset.dropPosition = position;
}

function clipBinding(id) {
  const bindings = documentValue.parameters?.routeBindings;
  return Array.isArray(bindings) ? bindings.find(binding => binding?.clip === id) : undefined;
}

function canDropPrototype(sourceId, targetId, position) {
  if (!sourceId || !targetId) return { ok: false, reason: "请先拖动一个组件" };
  if (sourceId === targetId) return { ok: false, reason: "不能把组件移动到自身" };
  const source = documentValue.parameters.nodes.find(node => node.id === sourceId);
  const target = documentValue.parameters.nodes.find(node => node.id === targetId);
  if (!source || !target) return { ok: false, reason: "组件不存在，已取消结构调整" };
  if (descendantNodeIds(sourceId).has(targetId)) return { ok: false, reason: "不能把父组件移动到自己的子组件下方" };
  if (position === "inside" && target.repetition) return { ok: false, reason: "带重复系统的组件暂不作为父组件使用" };
  const pipeId = clipBinding(sourceId)?.node;
  if (pipeId && pipeId !== (position === "inside" ? targetId : target.parent)) {
    return { ok: false, reason: `该管卡绑定在管线 ${pipeId} 下` };
  }
  return { ok: true };
}

function movePrototypeInTree(sourceId, targetId, position) {
  const allowed = canDropPrototype(sourceId, targetId, position);
  if (!allowed.ok) {
    setStatus(allowed.reason);
    return;
  }
  const nodes = documentValue.parameters.nodes;
  const sourceIndex = nodes.findIndex(node => node.id === sourceId);
  const targetNode = nodes.find(node => node.id === targetId);
  pushUndo(`调整组件结构 ${sourceId}`);
  const [moved] = nodes.splice(sourceIndex, 1);
  if (position === "inside") moved.parent = targetId;
  else if (targetNode.parent) moved.parent = targetNode.parent;
  else delete moved.parent;

  let insertIndex;
  if (position === "inside") {
    const lastChildIndex = nodes.reduce((last, node, index) => node.parent === targetId ? index : last, -1);
    insertIndex = lastChildIndex >= 0 ? lastChildIndex + 1 : nodes.findIndex(node => node.id === targetId) + 1;
    collapsedPrototypes.delete(targetId);
  } else {
    const targetIndex = nodes.findIndex(node => node.id === targetId);
    insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  }
  nodes.splice(Math.max(0, insertIndex), 0, moved);
  activePrototype = sourceId;
  selectedPrototypes = new Set([sourceId]);
  selectedOccurrenceExplicit = false;
  compile(undefined, { preserveSource: true });
  const relation = position === "inside" ? `设为 ${targetId} 的子组件` : `${position === "before" ? "移动到" : "移动到"} ${targetId} ${position === "before" ? "之前" : "之后"}`;
  setStatus(`已调整组件结构：${sourceId} ${relation}`);
}

function movePrototypeToRootEnd(sourceId) {
  const pipeId = clipBinding(sourceId)?.node;
  if (pipeId) { setStatus(`该管卡绑定在管线 ${pipeId} 下`); return; }
  const nodes = documentValue.parameters.nodes;
  const sourceIndex = nodes.findIndex(node => node.id === sourceId);
  if (sourceIndex < 0) return;
  pushUndo(`调整组件结构 ${sourceId}`);
  const [moved] = nodes.splice(sourceIndex, 1);
  delete moved.parent;
  nodes.push(moved);
  activePrototype = sourceId;
  selectedPrototypes = new Set([sourceId]);
  selectedOccurrenceExplicit = false;
  compile(undefined, { preserveSource: true });
  setStatus(`已调整组件结构：${sourceId} 移动到根层级末尾`);
}

function renderTree() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const sourceNodes = documentValue.parameters?.nodes ?? [];
  const outputsByProto = new Map();
  for (const node of build?.nodes ?? []) {
    const id = node.metadata?.compositionNodeId;
    if (!outputsByProto.has(id)) outputsByProto.set(id, []);
    outputsByProto.get(id).push(node);
  }
  const children = new Map();
  for (const source of sourceNodes) {
    const key = source.parent ?? "__root";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(source);
  }

  let visibleCount = 0;
  function renderBranch(parent, depth = 0) {
    return (children.get(parent) ?? []).map(source => {
      const outputs = outputsByProto.get(source.id) ?? [];
      const searchable = `${source.id} ${source.semanticType ?? ""}`.toLowerCase();
      const descendantHtml = renderBranch(source.id, depth + 1);
      if (query && !searchable.includes(query) && !descendantHtml) return "";
      visibleCount += 1;

      const hidden = hiddenPrototypes.has(source.id)
        || (isolatedPrototype && isolatedPrototype !== source.id);
      const selected = selectedPrototypes.has(source.id);
      const glyph = source.light ? "LT" : !source.geometry ? "GR" : source.geometry.type === "box" ? "BX" : "LN";
      const expandable = outputs.length > 1 || Boolean(descendantHtml);
      const collapsed = collapsedPrototypes.has(source.id) && !query;
      const occurrences = outputs.length > 1
        ? `<div class="tree-group-line">${outputs.map(output => `<button class="tree-item occurrence-row ${selectedOccurrenceExplicit && output.id === selectedId ? "selected" : ""}" style="padding-left:${12 + depth * 12}px" data-occurrence="${escapeHtml(output.id)}" role="treeitem"><span class="glyph">#</span><span class="label"><strong>${escapeHtml(output.metadata.occurrenceRef)}</strong><small>${output.metadata.gridIndex ? `grid ${output.metadata.gridIndex.join(",")}` : output.metadata.pathDistance !== undefined ? `distance ${Number(output.metadata.pathDistance).toFixed(2)}` : "repeated instance"}</small></span></button>`).join("")}</div>`
        : "";
      const childCount = children.get(source.id)?.length ?? 0;
      return `<div>
        <div class="tree-item prototype-row ${selected ? "multi-selected" : ""} ${activePrototype === source.id ? "selected" : ""} ${hidden ? "hidden-node" : ""}" style="padding-left:${7 + depth * 12}px" data-prototype="${escapeHtml(source.id)}" draggable="true" role="treeitem" tabindex="0" aria-expanded="${expandable ? !collapsed : false}" aria-grabbed="false" title="拖拽可调整组件结构位置">
          <button class="tree-toggle ${expandable ? "" : "empty"}" data-action="toggle" type="button" title="${collapsed ? "展开" : "收起"}">${collapsed ? "▸" : "▾"}</button>
          <span class="drag-handle" aria-hidden="true">⋮</span>
          <span class="glyph">${glyph}</span>
          <span class="label"><strong>${escapeHtml(source.id)}</strong><small>${escapeHtml(source.semanticType ?? (!source.geometry ? "transform group" : source.geometry.type))}</small></span>
          ${outputs.length > 1 ? `<span class="tree-badge">×${outputs.length}</span>` : ""}
          <span class="tree-actions" aria-label="组件操作">
            <button data-action="visibility" type="button" title="${hidden ? "显示组件" : "隐藏组件"}" aria-label="${hidden ? "显示" : "隐藏"} ${escapeHtml(source.id)}">${hidden ? "○" : "●"}</button>
            <button data-action="isolate" type="button" title="${isolatedPrototype === source.id ? "退出隔离" : "隔离显示"}" aria-label="隔离 ${escapeHtml(source.id)}">◎</button>
            <button class="danger" data-action="delete" type="button" title="${childCount ? `删除组件及 ${childCount} 个直属子组件` : "删除组件"}" aria-label="删除 ${escapeHtml(source.id)}">×</button>
          </span>
        </div>
        <div class="tree-children" ${collapsed ? "hidden" : ""}>${occurrences}${descendantHtml}</div>
      </div>`;
    }).join("");
  }

  $("#tree").innerHTML = renderBranch("__root")
    || `<p style="padding:12px;color:var(--muted);font-size:11px">没有匹配原型</p>`;
  $("#nodeCount").textContent = `${visibleCount}/${build?.nodes?.length ?? 0}`;
  $("#tree").querySelectorAll("[data-prototype]").forEach(row => {
    row.addEventListener("click", event => selectPrototype(row.dataset.prototype, event.ctrlKey || event.metaKey));
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectPrototype(row.dataset.prototype, event.ctrlKey || event.metaKey);
    });
    row.addEventListener("dragstart", event => {
      if (event.target.closest("[data-action]")) {
        event.preventDefault();
        return;
      }
      draggedPrototype = row.dataset.prototype;
      row.classList.add("dragging");
      row.setAttribute("aria-grabbed", "true");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedPrototype);
    });
    row.addEventListener("dragover", event => {
      if (!draggedPrototype) return;
      const target = row.dataset.prototype;
      const position = treeDropPosition(row, event.clientY);
      const allowed = canDropPrototype(draggedPrototype, target, position);
      if (!allowed.ok) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      markTreeDropTarget(row, position);
    });
    row.addEventListener("dragleave", event => {
      if (!row.contains(event.relatedTarget)) clearTreeDropTarget(row);
    });
    row.addEventListener("drop", event => {
      const target = row.dataset.prototype;
      const position = treeDropPosition(row, event.clientY);
      const allowed = canDropPrototype(draggedPrototype, target, position);
      clearAllTreeDropTargets();
      if (!allowed.ok) {
        setStatus(allowed.reason);
        return;
      }
      event.preventDefault();
      movePrototypeInTree(draggedPrototype, target, position);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      row.setAttribute("aria-grabbed", "false");
      draggedPrototype = null;
      clearAllTreeDropTargets();
    });
  });
  $("#tree").querySelectorAll("[data-occurrence]").forEach(button => button.addEventListener("click", () => selectNode(button.dataset.occurrence)));
  $("#tree").querySelectorAll("[data-action]").forEach(control => control.addEventListener("click", event => {
    event.stopPropagation();
    const proto = control.closest("[data-prototype]").dataset.prototype;
    const action = control.dataset.action;
    if (action === "toggle") {
      if (control.classList.contains("empty")) return;
      collapsedPrototypes.has(proto)
        ? collapsedPrototypes.delete(proto)
        : collapsedPrototypes.add(proto);
      renderTree();
      return;
    }
    if (action === "delete") {
      deleteNode(proto);
      return;
    }
    if (action === "visibility") {
      hiddenPrototypes.has(proto)
        ? hiddenPrototypes.delete(proto)
        : hiddenPrototypes.add(proto);
      isolatedPrototype = null;
    } else if (action === "isolate") {
      isolatedPrototype = isolatedPrototype === proto ? null : proto;
    }
    renderTree();
    draw();
  }));
  updateIsolationUI();
}

function updateIsolationUI(){const button=$("#clearIsolationButton");button.hidden=!isolatedPrototype;if(isolatedPrototype)button.textContent=`退出隔离 · ${isolatedPrototype}`}
function clearIsolation(){if(!isolatedPrototype)return;isolatedPrototype=null;updateIsolationUI();renderTree();renderInspector();draw();setStatus("已退出隔离，恢复显示全部组件")}

const relatedLocationLabels = {
  "first-declaration": "首次声明",
  "candidate-declaration": "候选声明",
  "cycle-edge": "下一条父引用",
};

function diagnosticLocationLabel({ path, sourceRange }) {
  if (!sourceRange) return path || "定位 JSON";
  const { line, column } = sourceRange;
  return `${path ? path + " · " : ""}第 ${line} 行，第 ${column} 列`;
}

function updateDiagnosticActions() {
  const panel = $("#diagnosticsTab");
  const source = $("#sourceEditor").value;
  const links = panel.querySelectorAll("[data-issue-index]");
  const stale = diagnosticsSource !== source;
  const passed = panel.querySelector("[data-draft-check]");
  const note = panel.querySelector(".diagnostics-stale");
  if (note) note.hidden = !(stale && (links.length || passed));
  if (passed) passed.hidden = stale;
  links.forEach(link => { link.disabled = stale; });
  const repair = panel.querySelector('[data-diagnostic-action="repair"]');
  const restore = panel.querySelector('[data-diagnostic-action="restore"]');
  if (repair) repair.disabled = stale;
  if (restore) restore.disabled = !sourceDraftPending || lastSyntaxRepair?.after !== source;
}

function renderDiagnostics({ checkedDraft = false } = {}) {
  const panel = $("#diagnosticsTab");
  $("#issueBadge").textContent = diagnostics.length ? diagnostics.length : "";
  const fixCount = diagnostics.filter(issue => issue.fix).length;
  const repair = fixCount ? `<button type="button" class="button primary" data-diagnostic-action="repair">应用 ${fixCount} 处标点修复</button>` : "";
  const restore = lastSyntaxRepair ? '<button type="button" class="button" data-diagnostic-action="restore">还原本次修复</button>' : "";
  const actions = repair || restore ? `<div class="diagnostic-actions">${repair}${restore}</div>` : "";
  const currentStatus = checkedDraft
    ? `<div class="diagnostic ok" data-draft-check><strong>JSON 草稿通过检查</strong>${sourceDraftPending ? "<br>重新构建可更新预览。" : ""}</div>`
    : '<div class="diagnostic ok"><strong>模型状态正常</strong><br>结构已构建，当前没有诊断问题。</div>';
  const entries = diagnostics.length ? diagnostics.map((item, index) => {
    const link = typeof item.path === "string"
      ? `<button type="button" data-issue-index="${index}">${escapeHtml(diagnosticLocationLabel(item))}</button>`
      : "";
    const related = (item.relatedLocations ?? []).map((location, relatedIndex) =>
      `<button class="diagnostic-related" type="button" data-issue-index="${index}" data-related-index="${relatedIndex}"><span>${escapeHtml(relatedLocationLabels[location.kind] ?? "关联位置")}</span>${escapeHtml(diagnosticLocationLabel(location))}</button>`).join("");
    const suggested = item.suggestedValues?.length
      ? `<div class="diagnostic-suggestions"><span>候选值</span>${item.suggestedValues.map(value => `<code>${escapeHtml(JSON.stringify(value))}</code>`).join("")}</div>`
      : "";
    return `<div class="diagnostic"><strong>${escapeHtml(item.syntaxCode ?? item.code ?? "MODEL_ERROR")}</strong><br>${escapeHtml(item.message)}${link}${related}${suggested}</div>`;
  }).join("") : currentStatus;
  panel.innerHTML = `<p class="diagnostics-stale" hidden>JSON 草稿已更改，可以在 JSON 页重新检查。</p>${actions}${entries}`;
  updateDiagnosticActions();
}

function refreshDraftDiagnostics() {
  diagnosticsSource = $("#sourceEditor").value;
  diagnostics = checkSourceDraft(diagnosticsSource).issues;
  renderDiagnostics({ checkedDraft: true });
}

function replaceCheckedDraft(text) {
  $("#sourceEditor").value = text;
  sourceDraftPending = true;
  refreshDraftDiagnostics();
}

$("#checkSourceButton").addEventListener("click", () => {
  refreshDraftDiagnostics();
  activateTab("diagnostics");
  setStatus(diagnostics.length ? `草稿检查完成 · ${diagnostics.length} 项诊断` : "JSON 草稿通过检查");
  $('[data-tab="diagnostics"]').focus();
});

$("#diagnosticsTab").addEventListener("click", event => {
  const editor = $("#sourceEditor");
  const action = event.target.closest("[data-diagnostic-action]")?.dataset.diagnosticAction;
  if (action === "repair") {
    if (diagnosticsSource !== editor.value) return;
    const result = applySyntaxFixes(editor.value, diagnostics);
    if (!result) return;
    lastSyntaxRepair = { before: editor.value, after: result.text };
    replaceCheckedDraft(result.text);
    setStatus(`已应用 ${result.count} 处标点修复${diagnostics.length ? ` · 还有 ${diagnostics.length} 项诊断` : " · 草稿通过检查"}`);
    $('[data-diagnostic-action="restore"]').focus();
    return;
  }
  if (action === "restore") {
    if (!sourceDraftPending || lastSyntaxRepair?.after !== editor.value) return;
    const { before } = lastSyntaxRepair;
    lastSyntaxRepair = undefined;
    replaceCheckedDraft(before);
    setStatus("已还原修复前的 JSON 草稿");
    $('[data-diagnostic-action="repair"]')?.focus();
    return;
  }
  const button = event.target.closest("[data-issue-index]");
  if (!button) return;
  if (diagnosticsSource !== editor.value) {
    updateDiagnosticActions();
    return;
  }
  const issue = diagnostics[Number(button.dataset.issueIndex)];
  const location = button.dataset.relatedIndex === undefined ? issue : issue.relatedLocations[Number(button.dataset.relatedIndex)];
  const { offset, length } = diagnosticRange(editor.value, location);
  activateTab("source");
  editor.focus();
  editor.setSelectionRange(offset, offset + length);
  // Selection alone doesn't scroll a textarea. Measure the prefix at the same
  // wrap width so a field in minified JSON is reachable as well.
  const measure = editor.cloneNode(false);
  measure.removeAttribute("id");
  measure.setAttribute("aria-hidden", "true");
  measure.tabIndex = -1;
  Object.assign(measure.style, {
    position: "absolute", visibility: "hidden", overflow: "hidden", boxSizing: "border-box",
    height: "1px", minHeight: "0", width: `${editor.clientWidth}px`,
  });
  measure.value = editor.value.slice(0, offset);
  editor.after(measure);
  editor.scrollTop = Math.max(0, measure.scrollHeight - editor.clientHeight / 2);
  measure.remove();
});

$("#sourceEditor").addEventListener("input", () => { sourceDraftPending = true; });

function updateSummary() {
  const size = build?.bounds?.size; $("#boundsValue").textContent = size ? size.map(v=>v.toFixed(2)).join(" × ") : "—";
  $("#expandedValue").textContent = build?.nodes?.length??0; $("#repeatValue").textContent = build?.repetitions?.length??0;
  $("#documentName").textContent = sceneDisplayName(); $("#emptyState").hidden = Boolean(build);
}

function setStatus(message) { $("#statusBar").textContent = message; }

function pushUndo(summary="编辑模型") {
  undoStack.push(structuredClone(documentValue));
  if (undoStack.length > 30) undoStack.shift();
  redoStack=[];
  changeLog.unshift({id:`change-${Date.now()}`,summary,time:new Date().toLocaleTimeString(),status:"已应用"});
  if(changeLog.length>50)changeLog.length=50;
  $("#undoButton").disabled = undoStack.length === 0;
  $("#redoButton").disabled = true;
  renderChanges();
}

function renderChanges(){const host=$("#changesTab");if(!host)return;$("#changeBadge").textContent=changeLog.length||"";host.innerHTML=`<div class="section"><div class="section-title">CHANGESET REVIEW</div><div class="change-toolbar"><button id="undoLatestChange" ${undoStack.length?"":"disabled"}>撤销最近变更</button><button id="clearChanges">清空记录</button></div>${changeLog.map(item=>`<article class="change-card"><strong>${escapeHtml(item.summary)}</strong><span>${escapeHtml(item.status)} · ${escapeHtml(item.time)}</span></article>`).join("")||`<p style="color:var(--muted);font-size:11px">尚无编辑变更。</p>`}</div>`;$("#undoLatestChange")?.addEventListener("click",()=>$("#undoButton").click());$("#clearChanges")?.addEventListener("click",()=>{changeLog=[];renderChanges()})}

function readVector(selector) { return [...document.querySelectorAll(selector)].map((input)=>Number(input.value)); }

function applyProperties(sourceNode) {
  if (!sourceNode) return;
  let nextProfile;
  if (sourceNode.geometry?.type === "sweep") {
    const geometry = sourceNode.geometry;
    try {
      const factors = [0, 1].map(axis => {
        const input = $(`#sweepSize${axis}`);
        if (!input) return 1;
        const size = input.valueAsNumber;
        if (!Number.isFinite(size) || size <= 0) throw new Error("截面尺寸必须大于 0");
        return size / sectionExtent(geometry.profile, axis);
      });
      nextProfile = geometry.profile.map(([u, v]) => [u * factors[0], v * factors[1]]);
      sweepGeometry({ ...geometry, profile: nextProfile });
    } catch (error) {
      diagnostics = [{ message: error.message }];
      renderDiagnostics();
      return;
    }
  }
  pushUndo();
  const oldId=sourceNode.id;const nextId=$("#editId").value.trim();
  if(!nextId) { diagnostics=[{message:"原型 ID 不能为空"}];renderDiagnostics();return; }
  if(nextId!==oldId&&documentValue.parameters.nodes.some(item=>item.id===nextId)){diagnostics=[{message:`原型 ID 已存在：${nextId}`}];renderDiagnostics();return;}
  sourceNode.id=nextId;
  if (nextId !== oldId) {
    for (const item of documentValue.parameters.nodes) if (item.parent === oldId) item.parent = nextId;
    for (const anchor of Object.values(documentValue.parameters.anchors ?? {})) if (anchor.node === oldId) anchor.node = nextId;
    for (const binding of documentValue.parameters.routeBindings ?? []) {
      if (binding.node === oldId) binding.node = nextId;
      if (binding.clip === oldId) binding.clip = nextId;
    }
  }
  sourceNode.semanticType = $("#editSemantic").value.trim() || undefined;
  sourceNode.material = $("#editMaterial").value.trim() || undefined;
  sourceNode.parent=$("#editParent").value||undefined;
  sourceNode.appearance={color:$("#editColor").value,opacity:Number($("#editOpacity").value)};
  const position=readVector(".editPosition"),rotation=readVector(".editRotation"),nodeScale=readVector(".editScale");
  if ([...position,...rotation,...nodeScale].some((value)=>!Number.isFinite(value))) { diagnostics=[{message:"变换值必须是有效数字"}];renderDiagnostics();return; }
  sourceNode.transform = { ...(sourceNode.transform??{}), position, rotation, scale:nodeScale };
  const sizeInputs=document.querySelectorAll(".editSize");if(sizeInputs.length){const size=readVector(".editSize");if(size.some(value=>!Number.isFinite(value)||value<=0)){diagnostics=[{message:"几何尺寸必须大于 0"}];renderDiagnostics();return;}sourceNode.geometry.size=size}
  const radiusInput=$("#editRadius");if(radiusInput){const radius=Number(radiusInput.value);if(!Number.isFinite(radius)||radius<=0){diagnostics=[{message:"半径必须大于 0"}];renderDiagnostics();return;}sourceNode.geometry.radius=radius}
  for(const [selector,key,label] of [["#editHeight","height","高度"],["#editMajorRadius","majorRadius","圆环主半径"],["#editTubeRadius","tubeRadius","圆管半径"]]){const input=$(selector);if(input){const value=Number(input.value);if(!Number.isFinite(value)||value<=0){diagnostics=[{message:`${label}必须大于 0`}];renderDiagnostics();return}sourceNode.geometry[key]=value}}
  if (nextProfile) sourceNode.geometry.profile = nextProfile;
  delete sourceNode.position;
  syncSourceEditor();
  compile(undefined,{preserveSource:true});
  activePrototype=nextId;selectedPrototypes=new Set([nextId]);selectedOccurrenceExplicit=false;selectedId=build.nodes.find(item=>item.metadata?.compositionNodeId===nextId)?.id??null;renderTree();renderInspector();draw();setStatus(`已更新组件 ${sourceNode.id}`);
}

function uniqueNodeId(base){const ids=new Set(documentValue.parameters.nodes.map(item=>item.id));let id=base,index=2;while(ids.has(id)){id=`${base}-${index}`;index+=1}return id}
function selectCreatedComponent(id){activePrototype=id;selectedPrototypes=new Set([id]);selectedOccurrenceExplicit=false;selectedId=build?.nodes.find(item=>item.metadata?.compositionNodeId===id)?.id??null;renderTree();renderInspector();renderSelectedAnimations();draw()}
function addBox(){pushUndo();const id=uniqueNodeId("box");documentValue.parameters.nodes.push({id,semanticType:"generic.solid",geometry:{type:"box",size:[1,1,1]},transform:{position:[0,.5,0],rotation:[0,0,0],scale:[1,1,1]},material:"default"});compile(undefined,{preserveSource:true});selectCreatedComponent(id);setStatus(`已创建 ${id}`)}
function addComponent(template){pushUndo();const configs={box:{base:"box",semanticType:"generic.solid",geometry:{type:"box",size:[1,1,1]},position:[0,.5,0]},slab:{base:"slab",semanticType:"construction.slab",geometry:{type:"box",size:[4,.2,3]},position:[0,.1,0]},column:{base:"column",semanticType:"structure.column",geometry:{type:"box",size:[.3,3,.3]},position:[0,1.5,0]},sphere:{base:"sphere",semanticType:"generic.sphere",geometry:{type:"sphere",radius:.5,segments:24},position:[0,.5,0]},cylinder:{base:"cylinder",semanticType:"generic.cylinder",geometry:{type:"cylinder",radius:.5,height:1.5,radialSegments:24},position:[0,.75,0]},cone:{base:"cone",semanticType:"generic.cone",geometry:{type:"cone",radius:.6,height:1.5,radialSegments:24},position:[0,.75,0]},torus:{base:"torus",semanticType:"generic.ring",geometry:{type:"torus",majorRadius:.65,tubeRadius:.16,radialSegments:32,tubularSegments:12},position:[0,.8,0]},pipe:{base:"pipe",semanticType:"mep.pipe",geometry:{type:"tube-along",points:[[-1,0,0],[1,0,0]],radius:.08},position:[0,1,0]},grid:{base:"grid-box",semanticType:"generic.array-item",geometry:{type:"box",size:[.4,.4,.4]},position:[0,.2,0],repetition:{type:"grid",count:[3,1,3],stepX:[.8,0,0],stepZ:[0,0,.8]}},group:{base:"group",semanticType:"core.group",position:[0,0,0]}};const config=configs[template];if(!config)return;const id=uniqueNodeId(config.base);const node={id,semanticType:config.semanticType,geometry:config.geometry,transform:{position:config.position,rotation:[0,0,0],scale:[1,1,1]},appearance:{color:"#9fb8c5",opacity:1},repetition:config.repetition};documentValue.parameters.nodes.push(node);compile(undefined,{preserveSource:true});selectCreatedComponent(id);setStatus(`已创建基础构件 ${id}`)}
function addLightComponent(type){pushUndo(`添加${type}灯光组件`);const id=uniqueNodeId(`${type}-light`),defaults={point:{color:"#fff1d6",intensity:80,distance:18},directional:{color:"#ffffff",intensity:1.2},spot:{color:"#fff1d6",intensity:120,distance:20,angle:Math.PI/5,penumbra:.25}},node={id,kind:"light",semanticType:`scene.light.${type}`,light:{type,...defaults[type]},transform:{position:[3,4,3],rotation:type==="point"?[0,0,0]:[-.7,.7,0],scale:[1,1,1]}};documentValue.parameters.nodes.push(node);threeNeedsRebuild=true;compile(undefined,{preserveSource:true});selectCreatedComponent(id);setStatus(`已创建灯光组件 ${id}`)}

const libraryPreviewStates=new Map();
let libraryPreviewRenderVersion=0;
function bindLibraryPreview(canvas,item){
  if(!canvas)return;
  const nodes=modelPreviewNodes(item,registry);
  const state=libraryPreviewStates.get(item.id)??{yaw:-.7,pitch:.48,zoom:80};
  libraryPreviewStates.set(item.id,state);
  const redraw=()=>{
    try {
      drawModelPreview(canvas,nodes,{...state,scale:.82});
    } catch (error) {
      const context=canvas.getContext("2d"),width=canvas.clientWidth||320,height=canvas.clientHeight||164,ratio=window.devicePixelRatio||1;
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
      context.fillStyle="#71808a";context.font="12px sans-serif";context.textAlign="center";context.fillText("暂无可视预览",width/2,height/2);
      console.warn("Library preview failed", item.id, error);
    }
  };
  let pointer=null;
  canvas.addEventListener("pointerdown",event=>{
    pointer={x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch};
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove",event=>{
    if(!pointer)return;
    state.yaw=pointer.yaw+(event.clientX-pointer.x)*.012;
    state.pitch=Math.max(-1.35,Math.min(1.35,pointer.pitch+(event.clientY-pointer.y)*.012));
    redraw();
  });
  const endPointer=()=>{pointer=null;canvas.classList.remove("dragging")};
  canvas.addEventListener("pointerup",endPointer);
  canvas.addEventListener("pointercancel",endPointer);
  canvas.addEventListener("dblclick",()=>{
    Object.assign(state,{yaw:-.7,pitch:.48,zoom:80});
    redraw();
  });
  canvas.addEventListener("wheel",event=>{
    event.preventDefault();
    state.zoom=Math.max(35,Math.min(220,state.zoom*Math.exp(-event.deltaY*.001)));
    redraw();
  },{passive:false});
  canvas.addEventListener("keydown",event=>{
    const amount=event.shiftKey ? .2 : .08;
    if(event.key==="ArrowLeft")state.yaw-=amount;
    else if(event.key==="ArrowRight")state.yaw+=amount;
    else if(event.key==="ArrowUp")state.pitch=Math.max(-1.35,state.pitch-amount);
    else if(event.key==="ArrowDown")state.pitch=Math.min(1.35,state.pitch+amount);
    else if(event.key==="Home")Object.assign(state,{yaw:-.7,pitch:.48,zoom:80});
    else return;
    event.preventDefault();
    redraw();
  });
  redraw();
  requestAnimationFrame(redraw);
  setTimeout(redraw, 80);
}

function renderModelLibrary(filter="all",query=""){
  const normalized=query.trim().toLowerCase();
  const usable=publicModelLibraryEntries.filter(item=>item.editor?.document||item.editor?.node||item.editor?.template);
  const entries=usable.filter(item=>(filter==="all"||item.kind===filter)&&(!normalized||[item.id,item.title,item.summary,item.semanticType??"",...(item.tags??[]),...(item.capabilities??[])].join(" ").toLowerCase().includes(normalized)));
  const labels={component:"构件",method:"空间方法",composition:"组合"};
  $("#libraryEntries").innerHTML=entries.map(item=>{
    const actionLabel=item.editor?.document?"打开完整模型":"添加到场景";
    const previewLabel=item.editor?.document||item.editor?.node?"可旋转预览":"结构定义";
    const source=item.source??item.license??"registry";
    return `<article class="library-card" data-library-id="${escapeHtml(item.id)}" data-library-title="${escapeHtml(item.title)}">
      <div class="library-card-content">
        <div class="library-card-head">
          <span class="library-kind ${item.kind}">${labels[item.kind]??item.kind}</span>
          <code>${escapeHtml(item.id)}@${escapeHtml(item.version)}</code>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <div class="library-tags">${(item.capabilities??[]).map(value=>`<span>${escapeHtml(value)}</span>`).join("")}</div>
        <footer>
          <small>${escapeHtml(source)}</small>
          <button data-library-use="${escapeHtml(item.id)}">${actionLabel}</button>
        </footer>
      </div>
      <div class="library-card-preview">
        <canvas data-library-preview="${escapeHtml(item.id)}" tabindex="0" aria-label="${escapeHtml(item.title)} 模型预览"></canvas>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${previewLabel}</span>
      </div>
    </article>`;
  }).join("")||`<div class="library-empty">没有可带入编辑器的匹配条目</div>`;
  $("#libraryCount").textContent=`${entries.length} / ${usable.length}`;
  const renderVersion=++libraryPreviewRenderVersion;
  requestAnimationFrame(()=>entries.forEach(item=>{
    if(renderVersion!==libraryPreviewRenderVersion)return;
    const card=[...$("#libraryEntries").querySelectorAll("[data-library-id]")].find(element=>element.dataset.libraryId===item.id);
    bindLibraryPreview(card?.querySelector("[data-library-preview]"),item);
  }));
  $("#libraryEntries").querySelectorAll("[data-library-use]").forEach(button=>button.addEventListener("click",()=>{
    const item=usable.find(entry=>entry.id===button.dataset.libraryUse);
    if(!item)return;
    $("#libraryDialog").close();
    if(item.editor.template){addComponent(item.editor.template);return}
    pushUndo(`从模型库使用 ${item.id}`);
    if(item.editor.document){
      sourceDraftPending=false;
      documentValue=withDefaultSceneLighting(item.editor.document);
      hiddenPrototypes.clear();isolatedPrototype=null;selectedId=null;activePrototype=null;selectedOccurrenceExplicit=false;selectedAnnotationId=null;selectedPrototypes.clear();
      threeNeedsRebuild=true;
      compile(undefined,{preserveSource:true});
      fitView();
      setStatus(`已打开完整模型 ${item.title}，并确认默认灯光`);
      return;
    }
    if(item.editor.node){
      const node=structuredClone(item.editor.node),original=node.id??"library-component";
      node.id=uniqueNodeId(original);
      documentValue.parameters.nodes.push(node);
      compile(undefined,{preserveSource:true});
      selectCreatedComponent(node.id);
      setStatus(`已添加模型库构件 ${item.title}`);
    }
  }));
}
function duplicateNode(id){const source=documentValue.parameters.nodes.find(item=>item.id===id);if(!source)return;pushUndo();const clone=structuredClone(source);clone.id=uniqueNodeId(`${id}-copy`);const p=clone.transform?.position??clone.position??[0,0,0];clone.transform={...(clone.transform??{}),position:[p[0]+.5,p[1],p[2]+.5]};delete clone.position;documentValue.parameters.nodes.push(clone);compile(undefined,{preserveSource:true});selectCreatedComponent(clone.id);setStatus(`已复制为 ${clone.id}`)}
function descendantNodeIds(id){
  const ids=new Set([id]);
  let changed=true;
  while(changed){
    changed=false;
    for(const node of documentValue.parameters.nodes){
      if(node.parent&&ids.has(node.parent)&&!ids.has(node.id)){ids.add(node.id);changed=true}
    }
  }
  return ids;
}
function deleteNode(id){
  const ids=descendantNodeIds(id),descendantCount=ids.size-1;
  if(descendantCount&&!window.confirm(`删除 ${id} 会同时删除其下 ${descendantCount} 个子组件，是否继续？`)){setStatus(`已取消删除 ${id}`);return}
  pushUndo(`删除组件 ${id}${descendantCount?` 及 ${descendantCount} 个子组件`:""}`);
  documentValue.parameters.nodes=documentValue.parameters.nodes.filter(item=>!ids.has(item.id));
  if (documentValue.parameters.routeBindings) {
    documentValue.parameters.routeBindings = documentValue.parameters.routeBindings.filter(binding => !ids.has(binding.node));
    for (const binding of documentValue.parameters.routeBindings) {
      if (ids.has(binding.clip)) { delete binding.clip; delete binding.clipOffset; }
    }
  }
  for(const [key,anchor] of Object.entries(documentValue.parameters.anchors??{})){if(ids.has(anchor.node))delete documentValue.parameters.anchors[key]}
  documentValue.parameters.animations=(documentValue.parameters.animations??[]).filter(item=>!ids.has(item.target));
  for(const removedId of ids){hiddenPrototypes.delete(removedId);collapsedPrototypes.delete(removedId)}
  if(isolatedPrototype&&ids.has(isolatedPrototype))isolatedPrototype=null;
  selectedId=null;activePrototype=null;selectedOccurrenceExplicit=false;selectedAnnotationId=null;selectedPrototypes.clear();
  compile(undefined,{preserveSource:true});
  setStatus(`已删除 ${id}${descendantCount?` 及 ${descendantCount} 个子组件`:""}`)
}

function addAnimation(target,property="position"){pushUndo(`为 ${target} 添加${property==="rotation"?"旋转":"移动"}动画`);documentValue.parameters.animations??=[];const prefix=property==="rotation"?"rotate":"move",id=`${prefix}-${target}-${documentValue.parameters.animations.length+1}`,source=documentValue.parameters.nodes.find(node=>node.id===target);documentValue.parameters.animations.push({id,target,property,from:[0,0,0],to:property==="rotation"?[0,Math.PI*2,0]:[1,0,0],duration:property==="rotation"?3:1.5,loop:true,...(property==="rotation"?{space:source?.repetition?"group":"local"}:{})});compile(undefined,{preserveSource:true});$("#animationSelect").value=id;renderSelectedAnimations();setStatus(`已添加${property==="rotation"?"旋转":"移动"}动画 ${id}，可在“动画”页调整参数并预览`)}
function refreshAnimationSelect(){const select=$("#animationSelect"),previous=select.value;select.innerHTML=(build?.animations??[]).map(item=>`<option value="${escapeHtml(item.id)}">${item.property==="rotation"?"旋转":"移动"} · ${escapeHtml(item.target)} · ${escapeHtml(item.id)}</option>`).join("")||`<option value="">无动画</option>`;if([...select.options].some(option=>option.value===previous))select.value=previous}
function animationPivot(target){const source=documentValue.parameters.nodes.find(node=>node.id===target),outputs=build?.nodes?.filter(node=>node.metadata?.compositionNodeId===target)??[];if(outputs.length){const origins=outputs.map(node=>node.matrix?[node.matrix[0][3],node.matrix[1][3],node.matrix[2][3]]:node.transform?.position??[0,0,0]);return origins.reduce((sum,point)=>add(sum,point),[0,0,0]).map(value=>value/origins.length)}if(Array.isArray(source?.repetition?.center))return [...source.repetition.center];return source?.transform?.position??source?.position??[0,0,0]}
function stopAnimation(){const restoreBuild=animationPreviewUsesBuild;if(animationHandle)cancelAnimationFrame(animationHandle);animationHandle=null;animationPreviewUsesBuild=false;animationOffsets.clear();animationRotations.clear();animationRotationModes.clear();$("#playAnimationButton").textContent="▶ 预览";$("#animationTime").textContent="0.00s";if(restoreBuild)compile(undefined,{preserveSource:true});else draw()}
function playAnimation(){if(animationHandle){stopAnimation();setStatus("动画预览已停止");return}const animation=(build?.animations??[]).find(item=>item.id===$("#animationSelect").value);if(!animation){setStatus("当前没有动画：先选择组件，再在属性页或动画页创建动画");return}const started=performance.now(),rebuildPreview=animationNeedsRebuild(animation.target);animationPreviewUsesBuild=rebuildPreview;if(animation.property==="rotation"){const source=documentValue.parameters.nodes.find(node=>node.id===animation.target),space=animation.space??(source?.repetition?"group":"local");animationRotationModes.set(animation.target,{space,pivot:Array.isArray(animation.pivot)?animation.pivot:animationPivot(animation.target)})}$("#playAnimationButton").textContent="■ 停止";setStatus(`正在预览 ${rebuildPreview?"层级":animation.property==="rotation"?(animationRotationModes.get(animation.target)?.space==="group"?"整组旋转":"实例自转"):"移动"}动画：${animation.id}`);function frame(now){const elapsed=(now-started)/1000,duration=Math.max(.01,animation.duration??1),ratio=animation.loop?(elapsed%duration)/duration:Math.min(1,elapsed/duration),eased=ratio*ratio*(3-2*ratio),value=(animation.from??[0,0,0]).map((v,index)=>v+((animation.to??[0,0,0])[index]-v)*eased);if(rebuildPreview){build=animatedBuild(animation,value);threeNeedsRebuild=true}else if(animation.property==="rotation")animationRotations.set(animation.target,value);else animationOffsets.set(animation.target,value);$("#animationTime").textContent=`${elapsed.toFixed(2)}s`;draw();if(animation.loop||ratio<1)animationHandle=requestAnimationFrame(frame);else stopAnimation()}animationHandle=requestAnimationFrame(frame)}

function renderAnimations(){const animations=documentValue.parameters?.animations??[],targets=animatableNodes().map(node=>`<option value="${escapeHtml(node.id)}">${escapeHtml(node.id)}${nodeHasDescendants(node.id)?" · 层级":""}</option>`).join("");$("#animationsTab").innerHTML=`<div class="section"><div class="section-title">动画操作</div><div class="concept-note"><strong>怎么使用</strong><span>重复组件旋转时通常选择“整组绕中心旋转”；机械臂、吊臂这类父子结构应选择 pivot/父节点，预览时会让子树跟随。</span><span>角度按 X / Y / Z 设置，例如 Y=360 表示绕 Y 轴完整旋转一周。保存后可直接在动画卡片内预览。</span></div><div class="animation-create"><select id="animationTarget"><option value="">选择组件</option>${targets}</select><button id="createMoveAnimation">＋ 移动</button><button id="createRotateAnimation">＋ 旋转</button></div></div>${animations.map((item,index)=>{const degrees=item.property==="rotation";const from=(item.from??[0,0,0]).map(v=>degrees?v*180/Math.PI:v),to=(item.to??[0,0,0]).map(v=>degrees?v*180/Math.PI:v);return `<div class="section animation-card" data-animation-index="${index}"><div class="animation-card-head"><div><strong>${degrees?"旋转动画":"移动动画"}</strong><small>${escapeHtml(item.id)}</small></div><button data-delete-animation="${index}">删除</button></div><div class="edit-field"><label>作用组件</label><select class="animationTargetEdit">${targets.replace(`value="${escapeHtml(item.target)}"`,`value="${escapeHtml(item.target)}" selected`)}</select></div>${degrees?`<div class="edit-field"><label>旋转方式</label><select class="animationSpace"><option value="group" ${(item.space??(documentValue.parameters.nodes.find(node=>node.id===item.target)?.repetition?"group":"local"))==="group"?"selected":""}>整组绕中心旋转（推荐重复组件）</option><option value="local" ${item.space==="local"?"selected":""}>各实例绕自身中心旋转 / 层级 pivot</option></select><small class="field-help">父子层级或空 pivot 会临时重建 CompositionSpec，让子树跟随关节运动。</small></div>`:""}<div class="edit-field"><label>起点 X / Y / Z ${degrees?"（度）":""}</label>${vectorInputs("animationFrom",from,.1)}</div><div class="edit-field"><label>终点 X / Y / Z ${degrees?"（度）":""}</label>${vectorInputs("animationTo",to,.1)}</div><div class="animation-row"><label>时长（秒）<input class="animationDuration" type="number" min=".1" step=".1" value="${item.duration??1}"></label><label><input class="animationLoop" type="checkbox" ${item.loop?"checked":""}> 循环播放</label></div><div class="animation-card-actions"><button class="save-animation" data-save-animation="${index}">保存</button><button class="preview-animation" data-preview-animation="${index}">▶ 预览此动画</button></div></div>`}).join("")||`<div class="concept-note empty-note">还没有动画。先从上方选择组件，再创建移动或旋转动画。</div>`}`;const targetSelect=$("#animationTarget");if(activePrototype&&[...targetSelect.options].some(o=>o.value===activePrototype))targetSelect.value=activePrototype;$("#createMoveAnimation").addEventListener("click",()=>targetSelect.value?addAnimation(targetSelect.value,"position"):setStatus("请先选择动画作用的组件"));$("#createRotateAnimation").addEventListener("click",()=>targetSelect.value?addAnimation(targetSelect.value,"rotation"):setStatus("请先选择动画作用的组件"));$("#animationsTab").querySelectorAll("[data-save-animation]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.saveAnimation),card=button.closest(".animation-card"),item=animations[index],factor=item.property==="rotation"?Math.PI/180:1;pushUndo(`更新动画 ${item.id}`);item.target=card.querySelector(".animationTargetEdit").value;if(item.property==="rotation")item.space=card.querySelector(".animationSpace").value;item.from=[...card.querySelectorAll(".animationFrom")].map(input=>Number(input.value)*factor);item.to=[...card.querySelectorAll(".animationTo")].map(input=>Number(input.value)*factor);item.duration=Math.max(.1,Number(card.querySelector(".animationDuration").value)||1);item.loop=card.querySelector(".animationLoop").checked;compile(undefined,{preserveSource:true});$("#animationSelect").value=item.id;setStatus(`已保存动画 ${item.id}`)}));$("#animationsTab").querySelectorAll("[data-preview-animation]").forEach(button=>button.addEventListener("click",()=>{const item=animations[Number(button.dataset.previewAnimation)];if(animationHandle)stopAnimation();$("#animationSelect").value=item.id;playAnimation()}));$("#animationsTab").querySelectorAll("[data-delete-animation]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.deleteAnimation);pushUndo(`删除动画 ${animations[index].id}`);stopAnimation();animations.splice(index,1);compile(undefined,{preserveSource:true});setStatus("动画已删除")}))}

function renderSelectedAnimations(){
  const animations=documentValue.parameters?.animations??[],source=documentValue.parameters?.nodes?.find(node=>node.id===activePrototype),target=source&&(source.geometry||source.light||nodeHasDescendants(source.id))?source.id:null;
  const scoped=animations.map((item,index)=>({item,index})).filter(entry=>entry.item.target===target);
  const targetHeader=target?`<div class="animation-selection"><span>当前组件</span><strong>${escapeHtml(target)}</strong><small>动画目标跟随组件结构或画布选择</small></div>`:`<div class="concept-note"><strong>请先选择组件</strong><span>在左侧组件结构或画布中点选一个有几何的组件，动画页会自动跟随。</span></div>`;
  $("#animationsTab").innerHTML=`<div class="section"><div class="section-title">动画操作</div>${targetHeader}<div class="concept-note"><strong>旋转方式</strong><span>重复组件通常使用“整组绕中心旋转”；只有需要每个实例分别转动时才使用“各实例自转”。</span></div><div class="animation-create selected-target"><button id="createMoveAnimation" ${target?"":"disabled"}>＋ 为当前组件添加移动</button><button id="createRotateAnimation" ${target?"":"disabled"}>＋ 为当前组件添加旋转</button></div></div>${scoped.map(({item,index})=>{const degrees=item.property==="rotation",from=(item.from??[0,0,0]).map(v=>degrees?v*180/Math.PI:v),to=(item.to??[0,0,0]).map(v=>degrees?v*180/Math.PI:v),defaultSpace=source?.repetition?"group":"local";return `<div class="section animation-card" data-animation-index="${index}"><div class="animation-card-head"><div><strong>${degrees?"旋转动画":"移动动画"}</strong><small>${escapeHtml(item.id)}</small></div><button data-delete-animation="${index}">删除</button></div><div class="animation-target-readonly"><span>作用组件</span><strong>${escapeHtml(item.target)}</strong></div>${degrees?`<div class="edit-field"><label>旋转方式</label><select class="animationSpace"><option value="group" ${(item.space??defaultSpace)==="group"?"selected":""}>整组绕中心旋转（推荐重复组件）</option><option value="local" ${(item.space??defaultSpace)==="local"?"selected":""}>各实例绕自身中心旋转</option></select><small class="field-help">共同中心由展开实例自动计算；动画目标只能通过组件结构或画布选择改变。</small></div>`:""}<div class="edit-field"><label>起点 X / Y / Z ${degrees?"（度）":""}</label>${vectorInputs("animationFrom",from,.1)}</div><div class="edit-field"><label>终点 X / Y / Z ${degrees?"（度）":""}</label>${vectorInputs("animationTo",to,.1)}</div><div class="animation-row"><label>时长（秒）<input class="animationDuration" type="number" min=".1" step=".1" value="${item.duration??1}"></label><label><input class="animationLoop" type="checkbox" ${item.loop?"checked":""}> 循环播放</label></div><div class="animation-card-actions"><button class="save-animation" data-save-animation="${index}">保存</button><button class="preview-animation" data-preview-animation="${index}">▶ 预览此动画</button></div></div>`}).join("")||(target?`<div class="concept-note empty-note">当前组件 ${escapeHtml(target)} 还没有动画。</div>`:"")}`;
  $("#createMoveAnimation")?.addEventListener("click",()=>target&&addAnimation(target,"position"));
  $("#createRotateAnimation")?.addEventListener("click",()=>target&&addAnimation(target,"rotation"));
  $("#animationsTab").querySelectorAll("[data-save-animation]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.saveAnimation),card=button.closest(".animation-card"),item=animations[index],factor=item.property==="rotation"?Math.PI/180:1;pushUndo(`更新动画 ${item.id}`);if(item.property==="rotation")item.space=card.querySelector(".animationSpace").value;item.from=[...card.querySelectorAll(".animationFrom")].map(input=>Number(input.value)*factor);item.to=[...card.querySelectorAll(".animationTo")].map(input=>Number(input.value)*factor);item.duration=Math.max(.1,Number(card.querySelector(".animationDuration").value)||1);item.loop=card.querySelector(".animationLoop").checked;compile(undefined,{preserveSource:true});$("#animationSelect").value=item.id;setStatus(`已保存 ${target} 的动画 ${item.id}`)}));
  $("#animationsTab").querySelectorAll("[data-preview-animation]").forEach(button=>button.addEventListener("click",()=>{const item=animations[Number(button.dataset.previewAnimation)];if(animationHandle)stopAnimation();$("#animationSelect").value=item.id;playAnimation()}));
  $("#animationsTab").querySelectorAll("[data-delete-animation]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.deleteAnimation);pushUndo(`删除动画 ${animations[index].id}`);stopAnimation();animations.splice(index,1);compile(undefined,{preserveSource:true});setStatus("动画已删除")}));
  const matching=(build?.animations??[]).find(item=>item.target===target),select=$("#animationSelect");if(matching&&[...select.options].some(option=>option.value===matching.id))select.value=matching.id;
}

function activateTab(name){
  document.querySelectorAll("[data-tab]").forEach(button=>button.classList.toggle("active",button.dataset.tab===name));
  ["inspect","animations","annotations","changes","source","diagnostics"].forEach(tab=>$("#"+tab+"Tab").hidden=tab!==name);
  if (name === "diagnostics") updateDiagnosticActions();
}
function uniqueAnnotationId(base="label"){
  const ids=new Set((documentValue.parameters?.annotations??[]).map(item=>item.id));
  let id=base,index=1;
  while(ids.has(id)){id=`${base}-${index}`;index+=1}
  return id;
}
function selectAnnotation(id,{announce=true}={}){
  selectedAnnotationId=id;
  activePrototype=null;selectedId=null;selectedOccurrenceExplicit=false;selectedPrototypes.clear();
  renderTree();renderInspector();renderSelectedAnimations();renderAnnotations();activateTab("annotations");draw();
  if(announce)setStatus(`已选择画布标签 ${id}，可在右侧修改文字和位置`);
}
function addText(){
  pushUndo("添加画布标签");
  documentValue.parameters.annotations??=[];
  const id=uniqueAnnotationId("label"),position=defaultAnnotationPosition();
  documentValue.parameters.annotations.push({id,text:"新建标签",position,color:"#eaf3cf"});
  selectedAnnotationId=id;
  compile(undefined,{preserveSource:true});
  selectAnnotation(id,{announce:false});
  setStatus(`已添加画布标签 ${id}，可在右侧“文本”页修改内容`);
}
function renderAnnotations(){
  const values=documentValue.parameters?.annotations??[];
  $("#annotationsTab").innerHTML=`<div class="section"><div class="section-title">CANVAS LABELS</div><div class="concept-note"><strong>画布标签</strong><span>标签是场景里的文字标注，不是模型构件；可点选、改文字、改位置，移动模式下可在画布拖动。</span></div>${values.map((item,index)=>`<div class="annotation-editor ${item.id===selectedAnnotationId?"selected":""}" data-index="${index}"><button class="annotation-picker" data-select-annotation="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.text??item.id)}</strong><span>${escapeHtml(item.id)} · ${item.position?.map(value=>Number(value).toFixed(2)).join(", ")??"无位置"}</span></button><div class="edit-field"><label>标签文字</label><input class="annotationText" value="${escapeHtml(item.text??"")}"></div><div class="edit-field"><label>位置 X / Y / Z</label><div class="edit-grid">${(item.position??[0,1,0]).map((value,axis)=>`<input class="annotationPosition" data-axis="${axis}" type="number" step=".1" value="${value}">`).join("")}</div></div><div class="edit-field"><label>文字颜色</label><div class="color-row"><input class="annotationColor" type="color" value="${escapeHtml(item.color??"#eaf3cf")}"><input class="annotationId" value="${escapeHtml(item.id)}" readonly></div></div><div class="inspector-actions"><button data-annotation-save="${index}" class="apply">保存标签</button><button data-annotation-delete="${index}">删除标签</button></div></div>`).join("")||`<p style="color:var(--muted);font-size:10px">尚无画布标签。</p>`}<div class="inspector-actions"><button id="addAnnotationHere" class="apply">＋ 添加画布标签</button></div></div>`;
  $("#addAnnotationHere").addEventListener("click",addText);
  $("#annotationsTab").querySelectorAll("[data-select-annotation]").forEach(button=>button.addEventListener("click",()=>selectAnnotation(button.dataset.selectAnnotation)));
  $("#annotationsTab").querySelectorAll("[data-annotation-save]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.annotationSave),editor=button.closest(".annotation-editor"),item=values[index];pushUndo(`更新画布标签 ${item.id}`);item.text=editor.querySelector(".annotationText").value.trim()||item.id;item.position=[...editor.querySelectorAll(".annotationPosition")].map(input=>Number(input.value));item.color=editor.querySelector(".annotationColor").value;selectedAnnotationId=item.id;compile(undefined,{preserveSource:true});activateTab("annotations");setStatus(`已更新画布标签 ${item.id}`)}));
  $("#annotationsTab").querySelectorAll("[data-annotation-delete]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.annotationDelete),id=values[index]?.id;pushUndo(`删除画布标签 ${id}`);values.splice(index,1);if(selectedAnnotationId===id)selectedAnnotationId=null;compile(undefined,{preserveSource:true});activateTab("annotations");setStatus(`已删除画布标签 ${id}`)}));
}

function lightingConfig(){return documentValue.parameters?.lighting??{enabled:true,preset:"studio",ambientIntensity:1.05,lights:[]}}
function editableLighting(){documentValue.parameters??={};documentValue.parameters.lighting??=structuredClone(lightingConfig());return documentValue.parameters.lighting}
function lightVector(values,name){return `<div class="edit-grid">${(values??[0,0,0]).map((value,index)=>`<input class="${name}" data-axis="${index}" type="number" step=".1" value="${value}">`).join("")}</div>`}
function renderLighting(){const config=lightingConfig(),lights=config.lights??[];$("#lightingButton").classList.toggle("active",config.enabled!==false);$("#lightingTab").innerHTML=`<div class="section"><div class="section-title">SCENE LIGHTING</div><div class="concept-note"><strong>灯光分两层</strong><span>环境预设保证模型基本可见；自定义灯光作为 CompositionSpec 场景数据保存。</span></div><div class="edit-field"><label><input id="lightingEnabled" type="checkbox" ${config.enabled!==false?"checked":""}> 启用场景灯光</label></div><div class="edit-field"><label>环境预设</label><select id="lightingPreset"><option value="studio" ${config.preset==="studio"?"selected":""}>工作室</option><option value="bright" ${config.preset==="bright"?"selected":""}>明亮检查</option><option value="outdoor" ${config.preset==="outdoor"?"selected":""}>室外日光</option><option value="neutral" ${config.preset==="neutral"?"selected":""}>中性均匀</option></select></div><div class="edit-field"><label>环境光强度</label><input id="ambientIntensity" type="number" min="0" max="10" step=".05" value="${config.ambientIntensity??1.05}"></div><div class="inspector-actions"><button id="saveLighting" class="apply">应用基础照明</button><button id="addPointLight">＋ 点光源</button><button id="addDirectionalLight">＋ 方向光</button></div></div>${lights.map((light,index)=>`<div class="section light-card" data-light-index="${index}"><div class="animation-card-head"><div><strong>${light.type==="directional"?"方向光":"点光源"}</strong><small>${escapeHtml(light.id??`light-${index+1}`)}</small></div><button data-delete-light="${index}">删除</button></div><div class="edit-field"><label>名称</label><input class="lightId" value="${escapeHtml(light.id??`light-${index+1}`)}"></div><div class="color-row"><input class="lightColor" type="color" value="${light.color??"#ffffff"}"><input class="lightIntensity" type="number" min="0" step=".1" value="${light.intensity??(light.type==="point"?8:1)}"></div><div class="edit-field"><label>位置 X / Y / Z</label>${lightVector(light.position??[4,6,4],"lightPosition")}</div>${light.type==="directional"?`<div class="edit-field"><label>指向目标 X / Y / Z</label>${lightVector(light.target??[0,0,0],"lightTarget")}</div>`:`<div class="edit-field"><label>有效距离</label><input class="lightDistance" type="number" min="0" step=".5" value="${light.distance??20}"></div>`}<div class="inspector-actions"><button class="save-light apply" data-save-light="${index}">保存该灯光</button></div></div>`).join("")||`<div class="concept-note empty-note">尚未添加自定义灯光，当前仅使用环境预设。</div>`}`;$("#saveLighting").addEventListener("click",()=>{pushUndo("更新场景照明");const value=editableLighting();value.enabled=$("#lightingEnabled").checked;value.preset=$("#lightingPreset").value;value.ambientIntensity=Math.max(0,Number($("#ambientIntensity").value)||0);threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus("已应用基础照明设置")});const addLight=type=>{pushUndo(`添加${type==="point"?"点光源":"方向光"}`);const value=editableLighting(),id=`${type}-light-${value.lights.length+1}`;value.lights.push({id,type,color:"#ffffff",intensity:type==="point"?8:1,position:[4,6,4],...(type==="point"?{distance:20}:{target:[0,0,0]})});threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus(`已添加 ${id}`)};$("#addPointLight").addEventListener("click",()=>addLight("point"));$("#addDirectionalLight").addEventListener("click",()=>addLight("directional"));$("#lightingTab").querySelectorAll("[data-save-light]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.saveLight),card=button.closest(".light-card"),light=editableLighting().lights[index];pushUndo(`更新灯光 ${light.id}`);light.id=card.querySelector(".lightId").value.trim()||light.id;light.color=card.querySelector(".lightColor").value;light.intensity=Math.max(0,Number(card.querySelector(".lightIntensity").value)||0);light.position=[...card.querySelectorAll(".lightPosition")].map(input=>Number(input.value));if(light.type==="directional")light.target=[...card.querySelectorAll(".lightTarget")].map(input=>Number(input.value));else light.distance=Math.max(0,Number(card.querySelector(".lightDistance").value)||0);threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus(`已保存灯光 ${light.id}`)}));$("#lightingTab").querySelectorAll("[data-delete-light]").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.deleteLight),lights=editableLighting().lights;pushUndo(`删除灯光 ${lights[index].id}`);lights.splice(index,1);threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus("已删除自定义灯光")}))}

function fitView() {
  if (!build) return;
  const {min,max}=build.bounds,corners=[];for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]])corners.push([x,y,z]);
  const previousZoom=view.zoom;view.zoom=1;view.panX=0;view.panY=0;const points=corners.map(project),width=Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));
  const availableWidth=Math.max(80,canvas.clientWidth-80),availableHeight=Math.max(80,canvas.clientHeight-150);view.zoom=Math.max(8,Math.min(2600,Math.min(availableWidth/Math.max(width,0.01),availableHeight/Math.max(height,0.01))*.92));
  if(!Number.isFinite(view.zoom))view.zoom=previousZoom;view.panX=0;view.panY=-22;draw();setStatus("视图已按当前窗口完整适应模型");
}

function renderEnvironmentLighting(){const config=lightingConfig();$("#lightingButton").classList.toggle("active",config.enabled!==false);$("#lightingTab").innerHTML=`<div class="section"><div class="section-title">ENVIRONMENT LIGHTING</div><div class="concept-note"><strong>环境照明</strong><span>这里只管理整个场景的基础可见性。点光源、方向光和聚光灯已纳入“组件结构”，可像其他组件一样选择、移动、复制和删除。</span></div><div class="edit-field"><label><input id="lightingEnabled" type="checkbox" ${config.enabled!==false?"checked":""}> 启用所有场景照明</label></div><div class="edit-field"><label>环境预设</label><select id="lightingPreset"><option value="studio" ${config.preset==="studio"?"selected":""}>工作室</option><option value="bright" ${config.preset==="bright"?"selected":""}>明亮检查</option><option value="outdoor" ${config.preset==="outdoor"?"selected":""}>室外日光</option><option value="neutral" ${config.preset==="neutral"?"selected":""}>中性均匀</option></select></div><div class="edit-field"><label>环境光强度</label><input id="ambientIntensity" type="number" min="0" max="10" step=".05" value="${config.ambientIntensity??.55}"></div><div class="inspector-actions"><button id="saveEnvironmentLighting" class="apply">应用环境照明</button></div></div><div class="concept-note"><strong>添加具体灯光</strong><span>使用顶部“添加构件”，选择点光源、方向光或聚光灯。</span></div>`;$("#saveEnvironmentLighting").addEventListener("click",()=>{pushUndo("更新环境照明");const value=editableLighting();value.enabled=$("#lightingEnabled").checked;value.preset=$("#lightingPreset").value;value.ambientIntensity=Math.max(0,Number($("#ambientIntensity").value)||0);delete value.lights;threeNeedsRebuild=true;compile(undefined,{preserveSource:true});setStatus("已应用环境照明")})}

function migrateLegacyLights(candidate) {
  const legacy = candidate.parameters?.lighting?.lights;
  if (!Array.isArray(legacy) || !legacy.length) return;
  const ids = new Set(candidate.parameters.nodes.map(node => node.id));
  for (const item of legacy) {
    const type = item.type ?? "point";
    const id = uniqueDocumentNodeId(item.id ?? `${type}-light`, ids);
    candidate.parameters.nodes.push({
      id, kind: "light", semanticType: `scene.light.${type}`,
      light: { type, color: item.color ?? "#ffffff", intensity: item.intensity ?? 1, ...(item.distance === undefined ? {} : { distance: item.distance }) },
      transform: { position: item.position ?? [3,4,3], rotation: [0,0,0], scale: [1,1,1] },
    });
  }
  delete candidate.parameters.lighting.lights;
}

function syncSourceEditor() {
  if (!sourceDraftPending) {
    lastSyntaxRepair = undefined;
    $("#sourceEditor").value = JSON.stringify(documentValue, null, 2);
  }
}

function compile(source, { preserveSource = false } = {}) {
  const editor = $("#sourceEditor");
  let candidate = documentValue;
  let input;
  diagnostics = [];
  diagnosticsSource = undefined;
  const hasErrors = () => diagnostics.some(issue => issue.level !== "warning");
  if (!preserveSource) {
    if (source !== undefined) editor.value = source;
    if (lastSyntaxRepair?.after !== editor.value) lastSyntaxRepair = undefined;
    sourceDraftPending = true;
    diagnosticsSource = editor.value;
    ({ input, issues: diagnostics } = checkSourceDraft(diagnosticsSource));
    if (!hasErrors()) {
      const doc = isCompositionManifest(input) ? input.editor.document : input;
      candidate = doc.component ? doc : { id: doc.id, component: "core.composition", parameters: doc };
    }
  }
  if (!hasErrors()) {
    try {
      migrateLegacyLights(candidate);
      build = registry.build(candidate);
      const resolved = build.instance.parameters;
      if (resolved !== candidate.parameters) {
        // Active canvas drags retain their source node between pointer events.
        const nodes = candidate.parameters.nodes;
        resolved.nodes.forEach((node, i) => Object.assign(nodes[i], node));
        candidate.parameters = { ...resolved, nodes };
      }
      documentValue = candidate;
      diagnostics = build.warnings.filter(issue => issue?.level === "warning" && typeof issue.path === "string" && issue.path.startsWith("/attachments/"))
        .map(issue => ({ ...issue, path: "/parameters" + issue.path }));
    } catch (error) {
      diagnostics = checkComposition(input ?? candidate).issues;
      if (!hasErrors()) diagnostics.push({ code: "COMPILE_FAILED", path: "", message: error.message });
    }
  }
  if (hasErrors()) {
    if (preserveSource && !sourceDraftPending) {
      syncSourceEditor();
      diagnosticsSource = editor.value;
    }
    renderDiagnostics();
    activateTab("diagnostics");
    setStatus(`构建失败 · ${diagnostics.length} 项问题${build ? " · 视图保留上次构建" : ""}`);
    return;
  }
  if (!preserveSource) sourceDraftPending = false;
  syncSourceEditor();
  if (!sourceDraftPending) diagnosticsSource = editor.value;
  if (activePrototype && !documentValue.parameters.nodes.some(node => node.id === activePrototype)) {
    activePrototype = null;
    selectedPrototypes.clear();
    selectedOccurrenceExplicit = false;
  }
  if (selectedAnnotationId && !documentValue.parameters.annotations?.some(item => item.id === selectedAnnotationId)) selectedAnnotationId = null;
  selectedId = selectedOccurrenceExplicit && build.nodes.some(node => node.id === selectedId)
    ? selectedId : build.nodes.find(node => node.metadata?.compositionNodeId === activePrototype)?.id ?? null;
  renderTree(); renderInspector(); renderSelectedAnimations(); renderAnnotations(); renderChanges();
  renderDiagnostics(); refreshAnimationSelect(); updateSummary(); draw();
  setStatus(`构建完成 · ${build.nodes.length} 个展开节点${diagnostics.length ? ` · ${diagnostics.length} 条警告` : ""}`);
}

function selectPrototype(id,additive=false){selectedAnnotationId=null;if(additive){selectedPrototypes.has(id)?selectedPrototypes.delete(id):selectedPrototypes.add(id);activePrototype=selectedPrototypes.has(id)?id:[...selectedPrototypes].at(-1)??null}else{selectedPrototypes=new Set([id]);activePrototype=id}selectedOccurrenceExplicit=false;selectedId=activePrototype?build?.nodes.find(item=>item.metadata?.compositionNodeId===activePrototype)?.id??null:null;renderTree();renderInspector();renderSelectedAnimations();renderAnnotations();draw();setStatus(activePrototype?`已选择组件 ${activePrototype}${selectedPrototypes.size>1?`（共 ${selectedPrototypes.size} 个）`:""}`:"已取消选择")}
function selectNode(id){selectedAnnotationId=null;selectedId=id;selectedOccurrenceExplicit=true;const node=build?.nodes.find(item=>item.id===id);activePrototype=node?.metadata?.compositionNodeId??null;selectedPrototypes=new Set(activePrototype?[activePrototype]:[]);renderTree();renderInspector();renderSelectedAnimations();renderAnnotations();draw();setStatus(`已选择模型实例 ${node?.metadata?.occurrenceRef??id}，属性对应组件 ${activePrototype}`)}
function selectedSources(){return [...selectedPrototypes].map(id=>documentValue.parameters.nodes.find(node=>node.id===id)).filter(Boolean)}
function nodePosition(node){return [...(node.transform?.position??node.position??[0,0,0])]}
function setNodePosition(node,position){node.transform={...(node.transform??{}),position};delete node.position}
function alignSelected(){const nodes=selectedSources(),axis=$("#spatialAxis").value,index={x:0,y:1,z:2}[axis];if(nodes.length<2){setStatus("请按 Ctrl/Cmd 在原型树中至少选择两个原型");return}pushUndo(`沿 ${axis.toUpperCase()} 轴对齐 ${nodes.length} 个原型`);const target=nodePosition(nodes[0])[index];nodes.forEach(node=>{const p=nodePosition(node);p[index]=target;setNodePosition(node,p)});compile(undefined,{preserveSource:true});setStatus(`已沿 ${axis.toUpperCase()} 轴对齐`)}
function distributeSelected(){const nodes=selectedSources(),axis=$("#spatialAxis").value,index={x:0,y:1,z:2}[axis];if(nodes.length<3){setStatus("均匀分布需要至少选择三个原型");return}pushUndo(`沿 ${axis.toUpperCase()} 轴均匀分布 ${nodes.length} 个原型`);const sorted=[...nodes].sort((a,b)=>nodePosition(a)[index]-nodePosition(b)[index]),start=nodePosition(sorted[0])[index],end=nodePosition(sorted.at(-1))[index],step=(end-start)/(sorted.length-1);sorted.forEach((node,i)=>{const p=nodePosition(node);p[index]=start+step*i;setNodePosition(node,p)});compile(undefined,{preserveSource:true});setStatus(`已沿 ${axis.toUpperCase()} 轴均匀分布`)}

$("#compileButton").addEventListener("click",()=>compile());
$("#documentName").addEventListener("click",()=>{selectedId=null;activePrototype=null;selectedOccurrenceExplicit=false;selectedAnnotationId=null;selectedPrototypes.clear();renderTree();renderInspector();renderSelectedAnimations();renderAnnotations();activateTab("inspect");draw();setStatus("已切换到场景属性，可修改场景名称")});
$("#newButton").addEventListener("click",()=>{pushUndo();sourceDraftPending=false;documentValue=structuredClone(defaultDocument);hiddenPrototypes.clear();isolatedPrototype=null;selectedId=null;activePrototype=null;selectedOccurrenceExplicit=false;selectedAnnotationId=null;selectedPrototypes.clear();compile(undefined,{preserveSource:true});fitView();setStatus("已创建基础场景：立方体与默认灯光")});
$("#addComponentButton").addEventListener("click",()=>$("#componentDialog").showModal());
$("#openLibraryButton").addEventListener("click",()=>{$("#libraryDialog").showModal();renderModelLibrary($("#libraryKind").value,$("#librarySearch").value)});
$("#closeLibraryDialog").addEventListener("click",()=>$("#libraryDialog").close());
$("#libraryKind").addEventListener("change",event=>renderModelLibrary(event.target.value,$("#librarySearch").value));
$("#librarySearch").addEventListener("input",event=>renderModelLibrary($("#libraryKind").value,event.target.value));
$("#closeComponentDialog").addEventListener("click",()=>$("#componentDialog").close());
document.querySelectorAll("[data-template]").forEach(button=>button.addEventListener("click",()=>{$("#componentDialog").close();addComponent(button.dataset.template)}));
document.querySelectorAll("[data-light-template]").forEach(button=>button.addEventListener("click",()=>{$("#componentDialog").close();addLightComponent(button.dataset.lightTemplate)}));
$("#addTextButton").addEventListener("click",addText);
$("#undoButton").addEventListener("click",()=>{if(!undoStack.length)return;redoStack.push(structuredClone(documentValue));documentValue=undoStack.pop();$("#undoButton").disabled=undoStack.length===0;$("#redoButton").disabled=false;compile(undefined,{preserveSource:true});setStatus("已撤销")});
$("#redoButton").addEventListener("click",()=>{if(!redoStack.length)return;undoStack.push(structuredClone(documentValue));documentValue=redoStack.pop();$("#undoButton").disabled=false;$("#redoButton").disabled=redoStack.length===0;compile(undefined,{preserveSource:true});setStatus("已重做")});
$("#fitButton").addEventListener("click",fitView);
$("#clearIsolationButton").addEventListener("click",clearIsolation);
async function initializeThreeRenderer(){if(threeRenderer)return threeRenderer;if(threeLoading)return threeLoading;$("#rendererModeButton").disabled=true;$("#rendererModeButton").textContent="加载 GPU";threeLoading=import("../../adapters/three/src/renderer.js").then(({createThreeRenderer})=>{threeRenderer=createThreeRenderer(threeCanvas);return threeRenderer}).catch(error=>{console.warn("Three renderer unavailable; using Canvas fallback",error);requestedRenderMode="canvas";localStorage.setItem("agentscene.renderer","canvas");return null}).finally(()=>{$("#rendererModeButton").disabled=false;threeLoading=null});const result=await threeLoading;if(result&&requestedRenderMode==="three")setRenderMode("three",{announce:false});else setRenderMode("canvas",{announce:false});return result}
function setRenderMode(mode,{announce=true}={}){requestedRenderMode=mode;localStorage.setItem("agentscene.renderer",mode);if(mode==="three"&&!threeRenderer){renderMode="canvas";$(".viewport-shell").dataset.renderer="canvas";initializeThreeRenderer();return}renderMode=mode==="three"&&threeRenderer?"three":"canvas";$(".viewport-shell").dataset.renderer=renderMode;$(".viewport-shell").dataset.editing=editMode==="orbit"?"false":"true";$("#rendererModeButton").classList.toggle("active",renderMode==="three");$("#rendererModeButton").textContent=renderMode==="three"?"GPU":"轻量";threeNeedsRebuild=true;draw();if(announce)setStatus(renderMode==="three"?"已启用 GPU 渲染，场景数据和相机视角保持不变":"已切换到 Canvas 轻量渲染，场景数据保持不变")}
function setEditMode(mode,{toggle=true}={}){editMode=toggle&&editMode===mode?"orbit":mode;$(".viewport-shell").dataset.editing=editMode==="orbit"?"false":"true";$("#moveModeButton").classList.toggle("active",editMode==="move");$("#rotateModeButton").classList.toggle("active",editMode==="rotate");canvas.style.cursor=editMode==="orbit"?"default":"crosshair";draw();setStatus(editMode==="move"?"移动模式：当前渲染器保持不变，可拖动三轴或路径控制点":editMode==="rotate"?"旋转模式：当前渲染器保持不变，可拖动三色旋转环；方向光沿局部 -Z 轴照射":"查看模式")}
$("#moveModeButton").addEventListener("click",()=>setEditMode("move"));
$("#rotateModeButton").addEventListener("click",()=>setEditMode("rotate"));
$("#rendererModeButton").addEventListener("click",()=>setRenderMode(requestedRenderMode==="three"?"canvas":"three"));
$("#lightingButton").addEventListener("click",event=>{pushUndo("切换场景灯光");const config=editableLighting();config.enabled=config.enabled===false;event.currentTarget.classList.toggle("active",config.enabled);threeNeedsRebuild=true;syncSourceEditor();draw();setStatus(config.enabled?"已开启全部照明":"已关闭全部照明")});
$("#alignButton").addEventListener("click",alignSelected);
$("#distributeButton").addEventListener("click",distributeSelected);
$("#gridButton").addEventListener("click",event=>{showGrid=!showGrid;event.currentTarget.classList.toggle("active",showGrid);draw();setStatus(showGrid?"已显示辅助网格":"已隐藏辅助网格")});
$("#xrayButton").addEventListener("click",event=>{xray=!xray;threeNeedsRebuild=true;event.currentTarget.classList.toggle("active",xray);draw();setStatus(xray?"已开启透视显示":"已关闭透视显示")});
$("#searchInput").addEventListener("input",renderTree);
$("#tree").addEventListener("dragover",event=>{
  if(!draggedPrototype||event.target.closest("[data-prototype]"))return;
  event.preventDefault();
  clearAllTreeDropTargets();
  $("#tree").classList.add("drop-root");
});
$("#tree").addEventListener("dragleave",event=>{if(!$("#tree").contains(event.relatedTarget))$("#tree").classList.remove("drop-root")});
$("#tree").addEventListener("drop",event=>{
  if(!draggedPrototype||event.target.closest("[data-prototype]"))return;
  event.preventDefault();
  $("#tree").classList.remove("drop-root");
  movePrototypeToRootEnd(draggedPrototype);
  draggedPrototype=null;
});
$("#fileInput").addEventListener("change",async(event)=>{const file=event.target.files[0];if(file){const text=await file.text();lastSyntaxRepair=undefined;compile(text);}});
$("#downloadButton").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(documentValue,null,2)],{type:"application/json"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`${documentValue.id??"composition"}.json`;link.click();URL.revokeObjectURL(link.href)});$("#playAnimationButton").addEventListener("click",playAnimation);
document.querySelectorAll("[data-tab]").forEach((button)=>button.addEventListener("click",()=>activateTab(button.dataset.tab)));
document.querySelectorAll("[data-view]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b===button));view=button.dataset.view==="top"?{...view,yaw:0,pitch:Math.PI/2}:button.dataset.view==="front"?{...view,yaw:0,pitch:0}:{...view,yaw:-.72,pitch:.52};draw()}));
let drag=null;
canvas.addEventListener("pointerdown",event=>{
  const rect=canvas.getBoundingClientRect(),mx=event.clientX-rect.left,my=event.clientY-rect.top;
  if(editMode==="move"){const label=hitAnnotation(mx,my);if(label){const source=(documentValue.parameters?.annotations??[]).find(item=>item.id===label.id);if(source){pushUndo(`移动画布标签 ${source.id}`);selectedAnnotationId=source.id;activePrototype=null;selectedId=null;selectedOccurrenceExplicit=false;selectedPrototypes.clear();renderTree();renderInspector();renderSelectedAnimations();renderAnnotations();activateTab("annotations");drag={mode:"annotation",x:event.clientX,y:event.clientY,source,start:[...(source.position??[0,1,0])],moved:false};canvas.setPointerCapture(event.pointerId);return}}const path=pathHitAreas.find(hit=>Math.hypot(mx-hit.x,my-hit.y)<9);if(path){pushUndo(`编辑 ${path.source.id} ${path.kind==="loft-section"?"截面中心":"路径控制点"} ${path.index+1}`);const point=readSourceControlPoint(path.source,path.kind,path.index);drag={mode:"path",kind:path.kind,x:event.clientX,y:event.clientY,source:path.source,index:path.index,start:[...point],moved:false};canvas.setPointerCapture(event.pointerId);return}}
  if(editMode!=="orbit"&&activePrototype){const source=documentValue.parameters.nodes.find(item=>item.id===activePrototype);const hit=hitGizmo(mx,my);if(source&&hit){pushUndo(`${editMode==="move"?"移动":"旋转"} ${source.id} · ${hit.axis.toUpperCase()} 轴`);drag={mode:editMode,axis:hit.axis,hit,tangent:hit.tangent,x:event.clientX,y:event.clientY,source,start:editMode==="move"?nodePosition(source):[...(source.transform?.rotation??[0,0,0])],moved:false};canvas.setPointerCapture(event.pointerId);return}}
  drag={mode:"orbit",x:event.clientX,y:event.clientY,yaw:view.yaw,pitch:view.pitch,moved:false};canvas.setPointerCapture(event.pointerId)
});
function distanceToSegment(x,y,a,b){const vx=b[0]-a[0],vy=b[1]-a[1],length=vx*vx+vy*vy,t=length?Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/length)):0;return Math.hypot(x-(a[0]+t*vx),y-(a[1]+t*vy))}
function hitGizmo(x,y){let best=null;for(const area of gizmoHitAreas){if(area.type==="move"){const distance=distanceToSegment(x,y,area.a,area.b);if(distance<8&&(!best||distance<best.distance)){const vx=area.b[0]-area.a[0],vy=area.b[1]-area.a[1],length=Math.hypot(vx,vy)||1;best={...area,distance,tangent:[vx/length,vy/length]}}}else{for(let i=1;i<area.points.length;i++){const a=area.points[i-1],b=area.points[i],distance=distanceToSegment(x,y,a,b);if(distance<8&&(!best||distance<best.distance)){const vx=b[0]-a[0],vy=b[1]-a[1],length=Math.hypot(vx,vy)||1;best={...area,distance,tangent:[vx/length,vy/length]}}}}}return best}
function hitAnnotation(x,y){return annotationHitAreas.filter(area=>x>=area.minX-5&&x<=area.maxX+5&&y>=area.minY-5&&y<=area.maxY+5).sort((a,b)=>b.depth-a.depth)[0]??null}
canvas.addEventListener("pointermove",event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved ||= Math.abs(dx)+Math.abs(dy)>4;if(drag.mode==="annotation"){const delta=screenDeltaToWorld(dx,dy);drag.source.position=drag.start.map((value,index)=>value+delta[index]);compile(undefined,{preserveSource:true});activateTab("annotations");setStatus(`移动画布标签 ${drag.source.id} · ${drag.source.position.map(v=>v.toFixed(2)).join(", ")}`)}else if(drag.mode==="move"){const index={x:0,y:1,z:2}[drag.axis],screen=[drag.hit.b[0]-drag.hit.a[0],drag.hit.b[1]-drag.hit.a[1]],length=Math.hypot(...screen)||1,amount=(dx*screen[0]/length+dy*screen[1]/length)/view.zoom,p=[...drag.start];p[index]+=amount;setNodePosition(drag.source,p);compile(undefined,{preserveSource:true});setStatus(`移动 ${drag.source.id} · ${drag.axis.toUpperCase()} ${p[index].toFixed(2)}`)}else if(drag.mode==="rotate"){const index={x:0,y:1,z:2}[drag.axis],rotation=[...drag.start],amount=(dx*drag.tangent[0]+dy*drag.tangent[1])*.012;rotation[index]+=amount;drag.source.transform={...(drag.source.transform??{}),rotation};compile(undefined,{preserveSource:true});setStatus(`旋转 ${drag.source.id} · ${drag.axis.toUpperCase()} ${(rotation[index]*180/Math.PI).toFixed(1)}° · 沿箭头为正方向`)}else if(drag.mode==="path"){const p=[...drag.start];p[0]+=dx/view.zoom;if(Math.abs(view.pitch)>1.2)p[2]+=dy/view.zoom;else p[1]-=dy/view.zoom;writeSourceControlPoint(drag.source,drag.kind,drag.index,p);compile(undefined,{preserveSource:true});setStatus(`${drag.kind==="loft-section"?"截面中心":"路径点"} ${drag.index+1} · ${p.map(v=>v.toFixed(2)).join(", ")}`)}else{view.yaw=drag.yaw+dx*.008;view.pitch=Math.max(-1.45,Math.min(1.45,drag.pitch+dy*.008));draw()}});
canvas.addEventListener("pointerup",event=>{if(drag&&!drag.moved&&drag.mode==="orbit"){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,label=hitAnnotation(x,y);if(label){selectAnnotation(label.id);drag=null;return}if(renderMode==="three"&&threeRenderer){const id=threeRenderer.pick(x,y);if(id)selectNode(id)}else{const hit=projectedNodes.filter(p=>x>=p.minX-5&&x<=p.maxX+5&&y>=p.minY-5&&y<=p.maxY+5).sort((a,b)=>b.depth-a.depth)[0];if(hit)selectNode(hit.id)}}drag=null});
canvas.addEventListener("wheel",event=>{event.preventDefault();view.zoom=Math.max(20,Math.min(2600,view.zoom*Math.exp(-event.deltaY*.001)));draw()},{passive:false});window.addEventListener("resize",draw);window.addEventListener("keydown",event=>{if(event.key==="Escape"&&isolatedPrototype){clearIsolation();return}if(event.target===$("#sourceEditor") && !(event.key.toLowerCase()==="s" && (event.ctrlKey||event.metaKey)))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();$(event.shiftKey?"#redoButton":"#undoButton").click()}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();$("#downloadButton").click()}if(event.key==="Delete"&&selectedId){const node=build?.nodes.find(item=>item.id===selectedId);if(node)deleteNode(node.metadata.compositionNodeId)}});

const pendingLibraryImport=localStorage.getItem("agentscene.library-import");
if(pendingLibraryImport){try{const payload=JSON.parse(pendingLibraryImport);if(payload?.document?.component==="core.composition"&&Array.isArray(payload.document.parameters?.nodes)){documentValue=withDefaultSceneLighting(payload.document);threeNeedsRebuild=true;localStorage.removeItem("agentscene.library-import");setTimeout(()=>setStatus(`已从模型库载入 ${payload.source??documentValue.id}，并确认默认灯光；可继续调整参数、材质和结构`),0)}}catch{localStorage.removeItem("agentscene.library-import")}}
syncSourceEditor();compile();fitView();setRenderMode(requestedRenderMode,{announce:false});
