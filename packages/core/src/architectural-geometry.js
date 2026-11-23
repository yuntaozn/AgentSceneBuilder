import { assertFiniteNumber } from "./math.js";

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function stairSweep(geometry) {
  const { stepCount } = geometry;
  if (!Number.isInteger(stepCount) || stepCount < 1 || stepCount > 128) {
    invalid("stepCount", "stepCount must be an integer between 1 and 128");
  }
  const riserHeight = positive(geometry, "riserHeight");
  const treadDepth = positive(geometry, "treadDepth");
  const width = positive(geometry, "width");
  const rise = assertFiniteNumber(stepCount * riserHeight, "riserHeight");
  const run = assertFiniteNumber(stepCount * treadDepth, "treadDepth");
  const profile = [[0, 0], [-run, 0]];
  // The sweep goes toward +X, so a negative section u points along +Z.
  for (let i = stepCount; i >= 1; i--) {
    profile.push([-i * treadDepth, i * riserHeight], [-(i - 1) * treadDepth, i * riserHeight]);
  }
  return {
    points: [[-width / 2, 0, 0], [width / 2, 0, 0]],
    profile,
    anchors: {
      "lower-landing": { position: [0, 0, 0], direction: [0, 0, -1] },
      "upper-landing": { position: [0, rise, run], direction: [0, 0, 1] },
    },
  };
}

function rampSweep(geometry) {
  const run = positive(geometry, "run");
  const rise = positive(geometry, "rise");
  const width = positive(geometry, "rampWidth");
  const thickness = positive(geometry, "deckThickness");
  return {
    points: [[-width / 2, 0, 0], [width / 2, 0, 0]],
    profile: [[0, -thickness], [-run, rise - thickness], [-run, rise], [0, 0]],
    anchors: {
      "lower-landing": { position: [0, 0, 0], direction: [0, 0, -1] },
      "upper-landing": { position: [0, rise, run], direction: [0, 0, 1] },
    },
  };
}

function spanSweep(width, profile, anchors) {
  return { points: [[-width / 2, 0, 0], [width / 2, 0, 0]], profile, anchors };
}

function sillSweep(geometry) {
  const width = positive(geometry, "sillWidth");
  const depth = positive(geometry, "projection");
  const thickness = positive(geometry, "thickness");
  const drop = positive(geometry, "fall");
  const groove = positive(geometry, "grooveWidth");
  const recess = positive(geometry, "grooveDepth");
  const setback = positive(geometry, "grooveSetback");
  if (drop >= thickness) invalid("fall", "The front edge must retain a positive thickness");
  if (groove + setback >= depth) invalid("grooveWidth", "The drip groove must fit underneath the sill");
  const near = depth - setback - groove, far = depth - setback;
  if (recess >= thickness - drop * far / depth) invalid("grooveDepth", "The drip groove must stay below the sloping sill top");
  return spanSweep(width, [[0, 0], [-depth, -drop], [-depth, -thickness], [-far, -thickness],
    [-far, -thickness + recess], [-near, -thickness + recess], [-near, -thickness], [0, -thickness]], {
    mount: { position: [0, 0, 0], direction: [0, 0, -1] },
    front: { position: [0, -drop, depth], direction: [0, 0, 1] },
  });
}

function balconySweep(geometry) {
  const width = positive(geometry, "deckWidth");
  const depth = positive(geometry, "projection");
  const thickness = positive(geometry, "thickness");
  const edgeWidth = positive(geometry, "edgeWidth");
  const downstand = positive(geometry, "downstand");
  if (edgeWidth >= depth) invalid("edgeWidth", "The downstand must fit within the deck projection");
  const inner = depth - edgeWidth;
  return spanSweep(width, [[0, 0], [-depth, 0], [-depth, -thickness - downstand],
    [-inner, -thickness - downstand], [-inner, -thickness], [0, -thickness]], {
    mount: { position: [0, 0, 0], direction: [0, 0, -1] },
    front: { position: [0, 0, depth], direction: [0, 0, 1] },
    "railing-left": { position: [-width / 2, 0, depth], direction: [1, 0, 0] },
    "railing-right": { position: [width / 2, 0, depth], direction: [-1, 0, 0] },
  });
}

function coverSweep(geometry) {
  const width = positive(geometry, "coverWidth");
  const depth = positive(geometry, "projection");
  const thickness = positive(geometry, "thickness");
  const fall = assertFiniteNumber(geometry.fall, "fall", { min: 0 });
  return spanSweep(width, [[0, 0], [-depth, -fall], [-depth, -fall - thickness], [0, -thickness]], {
    mount: { position: [0, 0, 0], direction: [0, 0, -1] },
    front: { position: [0, -fall, depth], direction: [0, 0, 1] },
  });
}

function copingSweep(geometry) {
  const length = positive(geometry, "capLength");
  const width = positive(geometry, "capWidth");
  const height = positive(geometry, "edgeHeight");
  const rise = positive(geometry, "crownRise");
  const half = width / 2;
  return spanSweep(length, [[-half, 0], [half, 0], [half, height], [0, height + rise], [-half, height]], {
    mount: { position: [0, 0, 0], direction: [0, -1, 0] },
    start: { position: [-length / 2, 0, 0], direction: [-1, 0, 0] },
    end: { position: [length / 2, 0, 0], direction: [1, 0, 0] },
  });
}

function rectangle(left, bottom, right, top) {
  return [[left, bottom], [right, bottom], [right, top], [left, top]];
}

function panelSweep(width, height, thickness) {
  return {
    points: [[0, 0, -thickness / 2], [0, 0, thickness / 2]],
    profile: rectangle(-width / 2, 0, width / 2, height),
  };
}

function wallSweep(geometry) {
  const width = positive(geometry, "wallWidth");
  const height = positive(geometry, "wallHeight");
  const thickness = positive(geometry, "thickness");
  const halfWidth = width / 2;
  const sweep = {
    ...panelSweep(width, height, thickness),
    anchors: {
      "wall-left": { position: [-halfWidth, 0, 0], direction: [-1, 0, 0] },
      "wall-right": { position: [halfWidth, 0, 0], direction: [1, 0, 0] },
      "panel-top": { position: [0, height, 0] },
    },
  };
  if (geometry.type === "partition-wall") return sweep;
  const openingWidth = positive(geometry, "openingWidth");
  const openingHeight = positive(geometry, "openingHeight");
  const offset = assertFiniteNumber(geometry.openingOffset, "openingOffset");
  const window = geometry.type === "window-opening-wall";
  const sill = window ? positive(geometry, "sillHeight") : 0;
  const top = sill + openingHeight;
  const left = offset - openingWidth / 2, right = offset + openingWidth / 2;
  if (sill >= height) invalid("sillHeight", "The sill must be below the top of the wall");
  if (top >= height) invalid("openingHeight", "The opening must leave room above it");
  if (openingWidth >= width) invalid("openingWidth", "The opening must be narrower than the wall");
  if (left <= -halfWidth || right >= halfWidth) invalid("openingOffset", "The opening must leave wall on both sides");
  sweep.anchors["opening-base"] = { position: [offset, sill, 0] };
  sweep.anchors["opening-top"] = { position: [offset, top, 0] };
  sweep.anchors["opening-exterior-base"] = { position: [offset, sill, thickness / 2], direction: [0, 0, 1] };
  sweep.anchors["opening-left"] = { position: [left, sill, 0], direction: [1, 0, 0] };
  sweep.anchors["opening-right"] = { position: [right, sill, 0], direction: [-1, 0, 0] };
  if (window) sweep.holes = [rectangle(left, sill, right, top)];
  else sweep.profile = [[-halfWidth, 0], [left, 0], [left, top], [right, top], [right, 0],
    [halfWidth, 0], [halfWidth, height], [-halfWidth, height]];
  return sweep;
}

function railingSweep(geometry) {
  const { bayCount } = geometry;
  if (!Number.isInteger(bayCount) || bayCount < 1 || bayCount > 32) invalid("bayCount", "bayCount must be an integer between 1 and 32");
  const width = positive(geometry, "railWidth");
  const height = positive(geometry, "railHeight");
  const thickness = positive(geometry, "thickness");
  const member = positive(geometry, "memberWidth");
  const rise = geometry.type === "sloped-railing" ? assertFiniteNumber(geometry.rise, "rise") : 0;
  const slopeEdge = ([x, y]) => [x, y + rise * (x / width + 0.5)];
  const gap = (width - (bayCount + 1) * member) / bayCount;
  if (gap <= 0 || height <= 2 * member) invalid("memberWidth", "Railing members must leave space for the openings");
  const holes = Array.from({ length: bayCount }, (_, index) => {
    const left = -width / 2 + member + index * (gap + member);
    return rectangle(left, member, left + gap, height - member).map(slopeEdge);
  });
  return {
    ...panelSweep(width, height, thickness),
    profile: rectangle(-width / 2, 0, width / 2, height).map(slopeEdge),
    holes,
    anchors: {
      start: { position: [-width / 2, 0, 0], direction: [-1, 0, 0] },
      end: { position: [width / 2, rise, 0], direction: [1, 0, 0] },
      "handrail-start": { position: [-width / 2, height, 0], direction: [-1, 0, 0] },
      "handrail-end": { position: [width / 2, height + rise, 0], direction: [1, 0, 0] },
    },
  };
}

function floorOpeningSweep(geometry) {
  const width = positive(geometry, "slabWidth");
  const depth = positive(geometry, "slabDepth");
  const thickness = positive(geometry, "thickness");
  const openingWidth = positive(geometry, "openingWidth");
  const openingDepth = positive(geometry, "openingDepth");
  const x = assertFiniteNumber(geometry.openingOffsetX, "openingOffsetX");
  const z = assertFiniteNumber(geometry.openingOffsetZ, "openingOffsetZ");
  if (openingWidth >= width) invalid("openingWidth", "The opening must be narrower than the slab");
  if (openingDepth >= depth) invalid("openingDepth", "The opening must be shallower than the slab");
  if (Math.abs(x) >= (width - openingWidth) / 2) invalid("openingOffsetX", "The opening must stay inside the slab along X");
  if (Math.abs(z) >= (depth - openingDepth) / 2) invalid("openingOffsetZ", "The opening must stay inside the slab along Z");
  // Extrusion along +Y with +Z up projects section u onto -X and section v onto +Z.
  const near = z - openingDepth / 2, far = z + openingDepth / 2;
  return {
    up: [0, 0, 1], points: [[0, -thickness, 0], [0, 0, 0]],
    profile: rectangle(-width / 2, -depth / 2, width / 2, depth / 2),
    holes: [rectangle(-x - openingWidth / 2, near, -x + openingWidth / 2, far)],
    anchors: {
      "opening-near": { position: [x, 0, near], direction: [0, 0, 1] },
      "opening-far": { position: [x, 0, far], direction: [0, 0, -1] },
      "slab-near": { position: [0, 0, -depth / 2], direction: [0, 0, -1] },
      "slab-far": { position: [0, 0, depth / 2], direction: [0, 0, 1] },
    },
  };
}

function cornerWallSweep(geometry) {
  const x = positive(geometry, "lengthX");
  const z = positive(geometry, "lengthZ");
  const height = positive(geometry, "wallHeight");
  const thickness = positive(geometry, "thickness");
  if (thickness >= Math.min(x, z)) invalid("thickness", "Corner wall thickness must be smaller than both runs");
  return {
    up: [0, 0, 1], points: [[0, 0, 0], [0, height, 0]],
    profile: [[0, 0], [-x, 0], [-x, thickness], [-thickness, thickness], [-thickness, z], [0, z]],
    anchors: {
      "x-end": { position: [x, 0, thickness / 2], direction: [1, 0, 0] },
      "z-end": { position: [thickness / 2, 0, z], direction: [0, 0, 1] },
    },
  };
}

export function architecturalSweep(geometry) {
  const build = architecturalBuilders.get(geometry?.type);
  if (build) return { up: [0, 1, 0], closedProfile: true, ...build(geometry) };
}

const architecturalBuilders = new Map([
  ["straight-stair", stairSweep], ["straight-ramp", rampSweep], ["straight-railing", railingSweep], ["sloped-railing", railingSweep],
  ["partition-wall", wallSweep], ["door-opening-wall", wallSweep], ["window-opening-wall", wallSweep],
  ["floor-opening-slab", floorOpeningSweep], ["l-corner-wall", cornerWallSweep],
  ["window-sill", sillSweep], ["balcony-deck", balconySweep], ["sloped-cover", coverSweep], ["wall-coping", copingSweep],
]);
