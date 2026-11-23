import { assertFiniteNumber } from "./math.js";
import { rectangularDuctSweep } from "./rectangular-duct.js";

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function circle(radius, u = 0, v = 0) {
  return Array.from({ length: 32 }, (_, i) => {
    const theta = i * Math.PI / 16;
    return [u + radius * Math.cos(theta), v + radius * Math.sin(theta)];
  });
}

function oblong(radius, offset, u, v) {
  const half = (side, start) => Array.from({ length: 17 }, (_, i) => {
    const theta = start + i * Math.PI / 16;
    return [u + side * offset + radius * Math.cos(theta), v + radius * Math.sin(theta)];
  });
  return [...half(1, -Math.PI / 2), ...half(-1, Math.PI / 2)];
}

function extrusion(length, profile, holes, extraAnchors) {
  return {
    points: [[0, 0, 0], [length, 0, 0]], up: [0, 1, 0], closedProfile: true,
    profile, ...(holes ? { holes } : {}),
    anchors: {
      start: { position: [0, 0, 0], direction: [-1, 0, 0] },
      end: { position: [length, 0, 0], direction: [1, 0, 0] },
      ...extraAnchors,
    },
  };
}

function beamSection(geometry) {
  const w = positive(geometry, "sectionWidth") / 2, h = positive(geometry, "sectionHeight") / 2;
  const web = positive(geometry, "webThickness"), flange = positive(geometry, "flangeThickness");
  if (web >= w * 2) invalid("webThickness", "The web must be narrower than the flanges");
  if (flange >= h) invalid("flangeThickness", "Two flanges must leave space for the web");
  const lower = -h + flange, upper = h - flange;
  const isI = geometry.type === "steel-i-section", halfWeb = web / 2;
  const profile = isI ? [[-w,-h],[w,-h],[w,lower],[halfWeb,lower],[halfWeb,upper],[w,upper],
    [w,h],[-w,h],[-w,upper],[-halfWeb,upper],[-halfWeb,lower],[-w,lower]]
    : [[-w,-h],[w,-h],[w,lower],[-w+web,lower],[-w+web,upper],[w,upper],[w,h],[-w,h]];
  const length = positive(geometry, "length");
  return extrusion(length, profile, undefined, {
    "bearing-start": { position: [0, -h, 0], direction: [0, -1, 0] },
    "bearing-end": { position: [length, -h, 0], direction: [0, -1, 0] },
  });
}

function angleSection(geometry) {
  const w = positive(geometry, "sectionWidth") / 2, h = positive(geometry, "sectionHeight") / 2;
  const t = positive(geometry, "thickness");
  if (t >= 2 * Math.min(w, h)) invalid("thickness", "Angle thickness must leave both legs distinct");
  return extrusion(positive(geometry, "length"), [[-w,-h],[w,-h],[w,-h+t],[-w+t,-h+t],[-w+t,h],[-w,h]]);
}

function roundTube(geometry) {
  const radius = positive(geometry, "outerDiameter") / 2;
  const thickness = positive(geometry, "thickness");
  if (thickness >= radius || radius - thickness === radius) invalid("thickness", "The tube must retain an inner opening");
  return extrusion(positive(geometry, "length"), circle(radius), [circle(radius - thickness)]);
}

function rectangularTube(geometry) {
  const length = positive(geometry, "length");
  const section = rectangularDuctSweep({ ...geometry, type: "rectangular-duct", points: [[0,0,0],[length,0,0]], up: [0,1,0] });
  return extrusion(length, section.profile, section.holes);
}

function basePlate(geometry) {
  const w = positive(geometry, "plateWidth") / 2, d = positive(geometry, "plateDepth") / 2;
  const thickness = positive(geometry, "thickness"), radius = positive(geometry, "holeDiameter") / 2;
  const x = positive(geometry, "boltPitchX") / 2, z = positive(geometry, "boltPitchZ") / 2;
  if (x + radius >= w || z + radius >= d) invalid("holeDiameter", "Bolt holes must remain inside the plate perimeter");
  if (radius >= Math.min(x, z)) invalid("holeDiameter", "Bolt holes must remain separate");
  const anchors = {
    mount: { position: [0, 0, 0], direction: [0, -1, 0] },
    "column-seat": { position: [0, thickness, 0], direction: [0, 1, 0] },
  };
  const holes = [];
  for (const [side, sx] of [["left", -x], ["right", x]]) {
    for (const [end, sz] of [["front", -z], ["back", z]]) {
      holes.push(circle(radius, -sx, sz));
      anchors["bolt-" + end + "-" + side] = { position: [sx, thickness, sz], direction: [0, 1, 0] };
    }
  }
  return { points: [[0,0,0],[0,thickness,0]], up: [0,0,1], closedProfile: true,
    profile: [[-w,-d],[w,-d],[w,d],[-w,d]], holes, anchors };
}

function splicePlate(geometry) {
  const halfLength = positive(geometry, "plateLength") / 2, halfWidth = positive(geometry, "plateWidth") / 2;
  const thickness = positive(geometry, "thickness");
  const halfSlot = positive(geometry, "slotLength") / 2, radius = positive(geometry, "slotWidth") / 2;
  const halfPitchX = positive(geometry, "pitchX") / 2, halfPitchZ = positive(geometry, "pitchZ") / 2;
  if (radius >= halfSlot) invalid("slotWidth", "A slot must be longer than its width");
  if (halfSlot >= halfPitchX || halfPitchX + halfSlot >= halfLength) invalid("slotLength", "Slots must stay apart and inside the plate ends");
  if (radius >= halfPitchZ || halfPitchZ + radius >= halfWidth) invalid("slotWidth", "Slots must stay apart and inside the plate sides");
  const offset = halfSlot - radius;
  const holes = [], anchors = {
    mount: { position: [0, 0, 0], direction: [0, -1, 0] },
    face: { position: [0, thickness, 0], direction: [0, 1, 0] },
  };
  for (const [end, z] of [["front", -halfPitchZ], ["back", halfPitchZ]]) {
    for (const [side, x] of [["left", -halfPitchX], ["right", halfPitchX]]) {
      // The +Y sweep projects section u onto -X. Each half circle lies at one slot end.
      holes.push(oblong(radius, offset, -x, z));
      anchors["slot-" + end + "-" + side] = { position: [x, thickness, z], direction: [0, 1, 0] };
    }
  }
  return { points: [[0,0,0],[0,thickness,0]], up: [0,0,1], closedProfile: true,
    profile: [[-halfLength,-halfWidth],[halfLength,-halfWidth],[halfLength,halfWidth],[-halfLength,halfWidth]], holes, anchors };
}

function stripFooting(geometry) {
  const length = positive(geometry, "length");
  const w = positive(geometry, "footingWidth") / 2, inner = positive(geometry, "stemWidth") / 2;
  const thickness = positive(geometry, "footingThickness"), height = positive(geometry, "stemHeight");
  if (inner >= w) invalid("stemWidth", "The footing must extend on both sides of the stem");
  const top = thickness + height;
  return extrusion(length, [[-w,0],[w,0],[w,thickness],[inner,thickness],[inner,top],
    [-inner,top],[-inner,thickness],[-w,thickness]], undefined, {
    "top-center": { position: [length / 2, top, 0], direction: [0, 1, 0] },
  });
}

function roundPile(geometry) {
  const length = positive(geometry, "length"), radius = positive(geometry, "diameter") / 2;
  return { profile: circle(radius), points: [[0,0,0],[0,-length,0]], up: [0,0,1], closedProfile: true, anchors: {
    head: { position: [0, 0, 0], direction: [0, 1, 0] },
    toe: { position: [0, -length, 0], direction: [0, -1, 0] },
  } };
}

function elevatorGuideRail(geometry) {
  const length = positive(geometry, "length");
  const halfFoot = positive(geometry, "footWidth") / 2;
  const footThickness = positive(geometry, "footThickness");
  const halfBlade = positive(geometry, "bladeWidth") / 2;
  const depth = positive(geometry, "bladeDepth");
  const inset = positive(geometry, "spliceInset");
  if (halfBlade >= halfFoot) invalid("bladeWidth", "The rail foot must extend on both sides of the blade");
  if (inset >= length / 2) invalid("spliceInset", "The two splice references must remain inside the rail ends");
  const face = footThickness + depth;
  return {
    points: [[0, 0, 0], [0, length, 0]], up: [0, 0, 1], closedProfile: true,
    profile: [[-halfFoot, 0], [halfFoot, 0], [halfFoot, footThickness], [halfBlade, footThickness],
      [halfBlade, face], [-halfBlade, face], [-halfBlade, footThickness], [-halfFoot, footThickness]],
    anchors: {
      start: { position: [0, 0, 0], direction: [0, -1, 0] },
      end: { position: [0, length, 0], direction: [0, 1, 0] },
      back: { position: [0, length / 2, 0], direction: [0, 0, -1] },
      guide: { position: [0, length / 2, face], direction: [0, 0, 1] },
      "splice-start": { position: [0, inset, 0], direction: [0, 0, -1] },
      "splice-end": { position: [0, length - inset, 0], direction: [0, 0, -1] },
    },
  };
}

function coldFormedPurlin(geometry) {
  const length = positive(geometry, "length");
  const height = positive(geometry, "sectionHeight");
  const flange = positive(geometry, "flangeWidth");
  const thickness = positive(geometry, "thickness");
  const lip = positive(geometry, "lipLength");
  const inset = positive(geometry, "bearingInset");
  if (thickness >= Math.min(flange, lip)) invalid("thickness", "The profile must retain an open fold");
  if (lip * 2 >= height) invalid("lipLength", "The folded lips must leave clearance");
  if (inset * 2 >= length) invalid("bearingInset", "The two purlin seats must stay apart");
  const t = thickness, h = height, f = flange;
  const isZ = geometry.type === "cold-formed-z-purlin";
  const profile = isZ
    ? [[-f,0],[t/2,0],[t/2,h-t],[f-t,h-t],[f-t,h-lip],[f,h-lip],[f,h],
      [-t/2,h],[-t/2,t],[-f+t,t],[-f+t,lip],[-f,lip]]
    : [[-t/2,0],[f,0],[f,lip],[f-t,lip],[f-t,t],[t/2,t],[t/2,h-t],
      [f-t,h-t],[f-t,h-lip],[f,h-lip],[f,h],[-t/2,h]];
  const seatZ = (isZ ? 1 : -1) * f / 2;
  return extrusion(length, profile, undefined, {
    "start": { position: [0, h / 2, 0], direction: [-1, 0, 0] },
    "end": { position: [length, h / 2, 0], direction: [1, 0, 0] },
    "bearing-start": { position: [inset, 0, seatZ], direction: [0, -1, 0] },
    "bearing-end": { position: [length - inset, 0, seatZ], direction: [0, -1, 0] },
    "skin-seat": { position: [length / 2, h, -f / 2], direction: [0, 1, 0] },
  });
}

function cellularSteelWeb(geometry) {
  const length = positive(geometry, "length");
  const height = positive(geometry, "webHeight");
  const thickness = positive(geometry, "thickness");
  const diameter = positive(geometry, "openingDiameter");
  const count = assertFiniteNumber(geometry.openingCount, "openingCount", { min: 1, max: 24 });
  if (!Number.isInteger(count)) invalid("openingCount", "The opening count must be an integer");
  const pitch = length / count;
  if (diameter >= Math.min(pitch, height)) invalid("openingDiameter", "The holes must clear one another and the web perimeter");
  const center = height / 2, first = pitch / 2, half = thickness / 2;
  return {
    points: [[0,0,-half],[0,0,half]], up: [0,1,0], closedProfile: true,
    profile: [[0,0],[length,0],[length,height],[0,height]],
    holes: Array.from({ length: count }, (_, index) => circle(diameter / 2, first + index * pitch, center)),
    anchors: {
      start: { position: [0, center, 0], direction: [-1, 0, 0] },
      end: { position: [length, center, 0], direction: [1, 0, 0] },
      "top-flange": { position: [length / 2, height, 0], direction: [0, 1, 0] },
      "bottom-flange": { position: [length / 2, 0, 0], direction: [0, -1, 0] },
      "first-opening": { position: [first, center, half], direction: [0, 0, 1] },
    },
  };
}

function runwayRail(geometry) {
  const length = positive(geometry, "length");
  const head = positive(geometry, "headWidth") / 2;
  const foot = positive(geometry, "footWidth") / 2;
  const height = positive(geometry, "height");
  const headThickness = positive(geometry, "headThickness");
  const footThickness = positive(geometry, "footThickness");
  const web = positive(geometry, "webThickness") / 2;
  if (web >= Math.min(head, foot)) invalid("webThickness", "The running head and foot must project past the web");
  if (headThickness + footThickness >= height) invalid("headThickness", "The rail must retain a distinct web");
  const chamfer = Math.min(headThickness, head) / 5;
  const shoulder = height - headThickness;
  const profile = [
    [-foot, 0], [foot, 0], [foot, footThickness], [web, footThickness], [web, shoulder],
    [head, shoulder], [head, height - chamfer], [head - chamfer, height], [-head + chamfer, height],
    [-head, height - chamfer], [-head, shoulder], [-web, shoulder], [-web, footThickness], [-foot, footThickness],
  ];
  return extrusion(length, profile, undefined, {
    "bed": { position: [length / 2, 0, 0], direction: [0, -1, 0] },
    "running-head": { position: [length / 2, height, 0], direction: [0, 1, 0] },
    "foot-near": { position: [length / 2, footThickness, (foot + web) / 2], direction: [0, 1, 0] },
    "foot-far": { position: [length / 2, footThickness, -(foot + web) / 2], direction: [0, 1, 0] },
  });
}

const builders = new Map([
  ["steel-i-section", beamSection], ["steel-channel-section", beamSection], ["steel-angle-section", angleSection],
  ["steel-round-tube", roundTube], ["steel-rectangular-tube", rectangularTube], ["bolted-base-plate", basePlate],
  ["slotted-splice-plate", splicePlate],
  ["strip-footing", stripFooting], ["round-pile", roundPile], ["elevator-t-guide-rail", elevatorGuideRail],
  ["cold-formed-c-purlin", coldFormedPurlin], ["cold-formed-z-purlin", coldFormedPurlin], ["cellular-steel-web", cellularSteelWeb],
  ["overhead-crane-runway-rail", runwayRail],
]);

export function structuralSweep(geometry) {
  return builders.get(geometry?.type)?.(geometry);
}
