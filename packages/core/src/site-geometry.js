import { assertFiniteNumber } from "./math.js";

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function straightSection(length, profile, endY, anchors) {
  return {
    points: [[0, 0, 0], [length, 0, 0]], up: [0, 1, 0], closedProfile: true, profile,
    anchors: {
      start: { position: [0, endY, 0], direction: [-1, 0, 0] },
      end: { position: [length, endY, 0], direction: [1, 0, 0] },
      ...anchors,
    },
  };
}

function curb(geometry) {
  const length = positive(geometry, "length"), half = positive(geometry, "width") / 2;
  const height = positive(geometry, "height"), bevel = positive(geometry, "bevel");
  if (bevel >= Math.min(2 * half, height)) invalid("bevel", "The bevel must leave a curb top and street face");
  return straightSection(length, [[-half,0],[half,0],[half,height],[-half+bevel,height],[-half,height-bevel]], 0, {
    "paving-edge": { position: [length / 2, height, -half], direction: [0, 0, -1] },
    "road-edge": { position: [length / 2, 0, half], direction: [0, 0, 1] },
  });
}

function channel(geometry) {
  const length = positive(geometry, "length"), half = positive(geometry, "clearWidth") / 2;
  const depth = positive(geometry, "depth"), wall = positive(geometry, "thickness");
  const seatWidth = positive(geometry, "seatWidth"), seatDepth = positive(geometry, "seatDepth");
  if (seatWidth >= wall) invalid("seatWidth", "The grate seat must leave an outer rim");
  if (wall >= depth) invalid("thickness", "The channel must have a hollow section above its bottom");
  if (seatDepth >= depth - wall) invalid("seatDepth", "The grate seat must be above the channel invert");
  const outside = half + wall, seat = half + seatWidth, invert = wall - depth;
  const profile = [[-outside,0],[-outside,-depth],[outside,-depth],[outside,0],[seat,0],[seat,-seatDepth],
    [half,-seatDepth],[half,invert],[-half,invert],[-half,-seatDepth],[-seat,-seatDepth],[-seat,0]];
  return straightSection(length, profile, invert, {
    "grate-seat": { position: [length / 2, -seatDepth, 0], direction: [0, 1, 0] },
  });
}

function grate(geometry) {
  const length = positive(geometry, "length"), width = positive(geometry, "width");
  const thickness = positive(geometry, "thickness"), frame = positive(geometry, "frameWidth");
  const bar = positive(geometry, "barWidth");
  const { slotCount } = geometry;
  if (!Number.isInteger(slotCount) || slotCount < 2 || slotCount > 64) {
    invalid("slotCount", "slotCount must be an integer between 2 and 64");
  }
  if (2 * frame >= Math.min(length, width)) invalid("frameWidth", "The frame must leave an open grate area");
  const gap = (length - 2 * frame - (slotCount - 1) * bar) / slotCount;
  if (gap <= 0) invalid("barWidth", "Grate bars must leave space for the slots");
  // Sweeping along +Y with +Z up maps section u to -X and v to +Z.
  const near = width / 2 - frame;
  const holes = Array.from({ length: slotCount }, (_, index) => {
    const right = -frame - index * (gap + bar), left = right - gap;
    return [[left,-near],[right,-near],[right,near],[left,near]];
  });
  return {
    points: [[0, -thickness, 0], [0, 0, 0]], up: [0, 0, 1], closedProfile: true,
    profile: [[-length,-width/2],[0,-width/2],[0,width/2],[-length,width/2]], holes,
    anchors: {
      "grate-bottom": { position: [length / 2, -thickness, 0], direction: [0, -1, 0] },
      start: { position: [0, 0, 0], direction: [-1, 0, 0] },
      end: { position: [length, 0, 0], direction: [1, 0, 0] },
    },
  };
}

function roadCrown(geometry) {
  const length = positive(geometry, "length"), half = positive(geometry, "width") / 2;
  const thick = positive(geometry, "thickness");
  const rise = assertFiniteNumber(geometry.crownHeight, "crownHeight", { min: 0 });
  return straightSection(length, [[-half,0],[0,rise],[half,0],[half,-thick],[0,rise-thick],[-half,-thick]], rise, {
    crown: { position: [length / 2, rise, 0], direction: [0, 1, 0] },
    "edge-negative-z": { position: [length / 2, 0, -half], direction: [0, 0, -1] },
    "edge-positive-z": { position: [length / 2, 0, half], direction: [0, 0, 1] },
  });
}

function retainingWall(geometry) {
  const length = positive(geometry, "length"), height = positive(geometry, "wallHeight");
  const wall = positive(geometry, "wallThickness"), cap = positive(geometry, "capThickness");
  const toe = positive(geometry, "toeDepth"), heel = positive(geometry, "heelDepth");
  const footing = positive(geometry, "footingThickness");
  if (wall >= heel) invalid("wallThickness", "The base must extend past the back of the wall");
  if (cap > wall) invalid("capThickness", "The cap must be no wider than the stem base");
  const top = footing + height;
  return straightSection(length, [[toe,0],[-heel,0],[-heel,footing],[-wall,footing],
    [-cap,top],[0,top],[0,footing],[toe,footing]], footing, {
    "wall-top": { position: [length / 2, top, cap / 2], direction: [0, 1, 0] },
    "base-center": { position: [length / 2, 0, 0], direction: [0, -1, 0] },
    "heel-seat": { position: [length / 2, footing, heel], direction: [0, 0, 1] },
  });
}

function curvedTreeCurb(geometry) {
  const outer = positive(geometry, "outsideRadius");
  const inner = positive(geometry, "insideRadius");
  const height = positive(geometry, "height");
  if (inner >= outer) invalid("insideRadius", "The tree curb must retain a positive wall width");
  const arc = radius => Array.from({ length: 17 }, (_, index) => {
    const angle = index * Math.PI / 32;
    return [-radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  const middle = (inner + outer) / 2;
  const seatRadius = inner + (outer - inner) / 8;
  return {
    points: [[0, 0, 0], [0, height, 0]],
    up: [0, 0, 1], closedProfile: true,
    profile: [...arc(outer), ...arc(inner).reverse()],
    anchors: {
      center: { position: [0, 0, 0], direction: [0, -1, 0] },
      start: { position: [middle, height / 2, 0], direction: [0, 0, -1] },
      end: { position: [0, height / 2, middle], direction: [-1, 0, 0] },
      seat: { position: [seatRadius * Math.SQRT1_2, height, seatRadius * Math.SQRT1_2], direction: [0, 1, 0] },
    },
  };
}

function swale(geometry) {
  const length = positive(geometry, "length");
  const halfTop = positive(geometry, "topWidth") / 2;
  const halfBottom = positive(geometry, "bottomWidth") / 2;
  const depth = positive(geometry, "depth");
  const thickness = positive(geometry, "baseThickness");
  if (halfBottom >= halfTop) invalid("bottomWidth", "The swale must widen above its invert");
  const rim = depth + thickness;
  const profile = [
    [-halfTop, 0], [halfTop, 0], [halfTop, rim], [halfBottom, thickness],
    [-halfBottom, thickness], [-halfTop, rim],
  ];
  return straightSection(length, profile, thickness, {
    invert: { position: [length / 2, thickness, 0], direction: [0, 1, 0] },
    "underside": { position: [length / 2, 0, 0], direction: [0, -1, 0] },
    "top-near": { position: [length / 2, rim, halfTop], direction: [0, 1, 0] },
    "top-far": { position: [length / 2, rim, -halfTop], direction: [0, 1, 0] },
  });
}

const builders = new Map([
  ["bevelled-curb", curb], ["rebated-drain-channel", channel], ["slotted-drain-grate", grate],
  ["crowned-road-surface", roadCrown], ["l-retaining-wall", retainingWall],
  ["quarter-circle-tree-pit-curb", curvedTreeCurb], ["landscape-trapezoidal-swale", swale],
]);

export function siteSweep(geometry) {
  return builders.get(geometry?.type)?.(geometry);
}
