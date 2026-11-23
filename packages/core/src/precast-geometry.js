import { assertFiniteNumber } from "./math.js";

const down = [0, -1, 0];
const up = [0, 1, 0];

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function boundedCount(geometry, field) {
  const count = assertFiniteNumber(geometry[field], field, { min: 1, max: 32 });
  if (!Number.isInteger(count)) invalid(field, "Expected a whole number of sections");
  return count;
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function point(position, direction) {
  return { position, direction };
}

function ends(length, level = 0) {
  return {
    start: point([0, level, 0], [-1, 0, 0]),
    end: point([length, level, 0], [1, 0, 0]),
  };
}

function bearingInset(geometry, length) {
  const inset = positive(geometry, "bearingInset");
  if (inset >= length / 2) invalid("bearingInset", "End bearing points must remain separate");
  return inset;
}

function axisSweep(length, profile, anchors, holes) {
  return {
    points: [[0, 0, 0], [length, 0, 0]],
    up, profile, closedProfile: true,
    ...(holes ? { holes } : {}),
    anchors,
  };
}

function hollowCore(geometry) {
  const length = positive(geometry, "length");
  const width = positive(geometry, "width");
  const depth = positive(geometry, "depth");
  const count = boundedCount(geometry, "voidCount");
  const diameter = positive(geometry, "voidDiameter");
  const key = positive(geometry, "keyDepth");
  const b = bearingInset(geometry, length);
  const pitch = width / count;
  if (key * 2 >= pitch) invalid("keyDepth", "The side recess must leave room for the outside cell");
  if (diameter >= Math.min(depth, pitch - 2 * key)) {
    invalid("voidDiameter", "The cores must stay separated and inside the slab edges");
  }
  const w = width / 2;
  const lo = depth * 0.36, hi = depth * 0.64;
  const profile = [
    [-w, 0], [w, 0], [w, lo * 0.75], [w - key, lo], [w - key, hi], [w, depth - lo * 0.75], [w, depth],
    [-w, depth], [-w, depth - lo * 0.75], [-w + key, hi], [-w + key, lo], [-w, lo * 0.75],
  ];
  const radius = diameter / 2;
  const holes = Array.from({ length: count }, (_, index) => {
    const center = -w + (index + 0.5) * pitch;
    return Array.from({ length: 24 }, (_, sample) => {
      const angle = sample * Math.PI / 12;
      return [center + radius * Math.cos(angle), depth / 2 + radius * Math.sin(angle)];
    });
  });
  return axisSweep(length, profile, {
    ...ends(length, depth / 2),
    "bearing-start": point([b, 0, 0], down),
    "bearing-end": point([length - b, 0, 0], down),
    top: point([length / 2, depth, 0], up),
    "key-near": point([length / 2, depth / 2, w], [0, 0, 1]),
    "key-far": point([length / 2, depth / 2, -w], [0, 0, -1]),
    "first-core-start": point([0, depth / 2, w - pitch / 2], [-1, 0, 0]),
    "first-core-end": point([length, depth / 2, w - pitch / 2], [1, 0, 0]),
  }, holes);
}

function doubleTee(geometry) {
  const length = positive(geometry, "length");
  const w = positive(geometry, "width") / 2;
  const depth = positive(geometry, "depth");
  const flange = positive(geometry, "flangeThickness");
  const stemTop = positive(geometry, "stemTopWidth") / 2;
  const stemBottom = positive(geometry, "stemBottomWidth") / 2;
  const offset = positive(geometry, "stemSpacing") / 2;
  const b = bearingInset(geometry, length);
  if (flange >= depth) invalid("flangeThickness", "The slab must retain downward stems");
  if (offset + Math.max(stemTop, stemBottom) >= w || offset <= Math.max(stemTop, stemBottom)) {
    invalid("stemSpacing", "Both stems must stay separate and below the flange");
  }
  const soffit = depth - flange;
  const profile = [[-w, soffit]];
  for (const center of [-offset, offset]) {
    profile.push([center - stemTop, soffit], [center - stemBottom, 0],
      [center + stemBottom, 0], [center + stemTop, soffit]);
  }
  profile.push([w, soffit], [w, depth], [-w, depth]);
  return axisSweep(length, profile, {
    ...ends(length, (soffit + depth) / 2),
    top: point([length / 2, depth, 0], up),
    "near-edge": point([length / 2, depth, w], [0, 0, 1]),
    "far-edge": point([length / 2, depth, -w], [0, 0, -1]),
    "start-near-bearing": point([b, 0, offset], down),
    "start-far-bearing": point([b, 0, -offset], down),
    "end-near-bearing": point([length - b, 0, offset], down),
    "end-far-bearing": point([length - b, 0, -offset], down),
  });
}

function ledgeBeam(geometry) {
  const length = positive(geometry, "length");
  const w = positive(geometry, "width") / 2;
  const depth = positive(geometry, "depth");
  const h = positive(geometry, "ledgeHeight");
  const web = positive(geometry, "webWidth") / 2;
  if (h >= depth) invalid("ledgeHeight", "The web must extend above the seats");
  if (web >= w) invalid("webWidth", "The ledges must extend past the web");
  const profile = [[-w, 0], [w, 0], [w, h], [web, h], [web, depth], [-web, depth], [-web, h], [-w, h]];
  const zSeat = (w + web) / 2;
  return axisSweep(length, profile, {
    ...ends(length, h / 2),
    top: point([length / 2, depth, 0], up),
    bottom: point([length / 2, 0, 0], down),
    "seat-near": point([length / 2, h, zSeat], up),
    "seat-far": point([length / 2, h, -zSeat], up),
  });
}

function dappedBeam(geometry) {
  const length = positive(geometry, "length");
  const w = positive(geometry, "width") / 2;
  const depth = positive(geometry, "depth");
  const notch = positive(geometry, "notchLength");
  const rise = positive(geometry, "seatRise");
  if (notch >= length / 2) invalid("notchLength", "A full-depth beam segment must remain between the notches");
  if (rise >= depth) invalid("seatRise", "The end section must retain beam material above its seat");
  return {
    points: [[0, 0, -w], [0, 0, w]], up, closedProfile: true,
    profile: [[0, rise], [notch, rise], [notch, 0], [length - notch, 0],
      [length - notch, rise], [length, rise], [length, depth], [0, depth]],
    anchors: {
      ...ends(length, (rise + depth) / 2),
      top: point([length / 2, depth, 0], up),
      "bearing-start": point([notch / 2, rise, 0], down),
      "bearing-end": point([length - notch / 2, rise, 0], down),
    },
  };
}

function steelDeck(geometry) {
  const length = positive(geometry, "length");
  const pitch = positive(geometry, "ribPitch");
  const crown = positive(geometry, "crownWidth");
  const trough = positive(geometry, "troughWidth");
  const height = positive(geometry, "ribHeight");
  const thickness = positive(geometry, "thickness");
  const count = boundedCount(geometry, "ribCount");
  if (crown + trough >= pitch) invalid("crownWidth", "Rib pitch must leave two inclined side webs");
  if (thickness >= height) invalid("thickness", "Sheet thickness must preserve the raised ribs");
  const w = pitch * count / 2;
  const controls = Array.from({ length: count }, (_, index) => {
    const edge = -w + index * pitch;
    return [[edge + trough / 2, 0], [edge + (pitch - crown) / 2, height],
      [edge + (pitch + crown) / 2, height], [edge + pitch - trough / 2, 0]];
  }).flat();
  const baseline = [[-w, 0], ...controls, [w, 0]];
  const surface = baseline.map(([u, y]) => [u, y + thickness]).reverse();
  return axisSweep(length, [...baseline, ...surface], {
    ...ends(length, thickness / 2),
    "near-edge": point([length / 2, thickness / 2, w], [0, 0, 1]),
    "far-edge": point([length / 2, thickness / 2, -w], [0, 0, -1]),
    "crown-first": point([length / 2, height + thickness, w - pitch / 2], up),
    "bearing-start": point([0, 0, w - trough / 4], down),
    "bearing-end": point([length, 0, w - trough / 4], down),
  });
}

const builders = new Map([
  ["precast-hollow-core-slab", hollowCore],
  ["precast-double-tee-slab", doubleTee],
  ["precast-inverted-tee-beam", ledgeBeam],
  ["precast-dapped-end-beam", dappedBeam],
  ["ribbed-composite-deck-sheet", steelDeck],
]);

export function precastSweep(geometry) {
  return builders.get(geometry?.type)?.(geometry);
}
