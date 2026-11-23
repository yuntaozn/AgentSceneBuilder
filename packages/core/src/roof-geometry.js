import { assertFiniteNumber } from "./math.js";

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function roofPanel(geometry, makeProfile) {
  const width = positive(geometry, "panelWidth");
  const run = positive(geometry, "run");
  const rise = assertFiniteNumber(geometry.rise, "rise", { min: 0 });
  const slopeLength = assertFiniteNumber(Math.hypot(run, rise), "rise");
  const h = rise / slopeLength, d = run / slopeLength;
  const half = width / 2;
  const center = [0, rise / 2, run / 2];
  const thickness = positive(geometry, "thickness");
  const { profile, centerHeight = 0 } = makeProfile(geometry, half, thickness);
  const surface = [0, center[1] + d * centerHeight, center[2] - h * centerHeight];
  return {
    points: [[0, 0, 0], [0, rise, run]], up: [0, 1, 0], closedProfile: true, profile,
    anchors: {
      eave: { position: [0, 0, 0], direction: [0, -h, -d] },
      ridge: { position: [0, rise, run], direction: [0, h, d] },
      left: { position: [-half, center[1], center[2]], direction: [-1, 0, 0] },
      right: { position: [half, center[1], center[2]], direction: [1, 0, 0] },
      "surface-center": { position: surface, direction: [0, d, -h] },
      "underside-center": { position: [0, surface[1] - d * thickness, surface[2] + h * thickness], direction: [0, -d, h] },
    },
  };
}

function deckProfile(_geometry, half, t) {
  return { profile: [[-half,-t],[half,-t],[half,0],[-half,0]] };
}

function seamProfile(geometry, half, t) {
  const seam = positive(geometry, "seamHeight");
  if (t >= half) invalid("thickness", "Folded edges must leave room for the flat pan");
  return { profile: [[-half,-t],[half,-t],[half,seam],[half-t,seam],
    [half-t,0],[-half+t,0],[-half+t,seam],[-half,seam]] };
}

function corrugatedProfile(geometry, half, t) {
  const depth = positive(geometry, "ribHeight");
  const { corrugationCount } = geometry;
  if (!Number.isInteger(corrugationCount) || corrugationCount < 2 || corrugationCount > 24) {
    invalid("corrugationCount", "corrugationCount must be an integer between 2 and 24");
  }
  const intervals = corrugationCount * 8;
  const top = Array.from({ length: intervals + 1 }, (_, i) =>
    [half * (2 * i / intervals - 1), depth * (1 - Math.cos(i * Math.PI / 4)) / 2]);
  return { profile: [...top, ...top.slice().reverse().map(([u, v]) => [u, v - t])],
    centerHeight: top[intervals / 2][1] };
}

function ridgeCap(geometry) {
  const length = positive(geometry, "length");
  const width = positive(geometry, "legWidth");
  const fall = assertFiniteNumber(geometry.fall, "fall", { min: 0 });
  const t = positive(geometry, "thickness");
  return {
    points: [[-length / 2, 0, 0], [length / 2, 0, 0]], up: [0, 1, 0], closedProfile: true,
    profile: [[-width,-fall],[0,0],[width,-fall],[width,-fall+t],[0,t],[-width,-fall+t]],
    anchors: {
      crest: { position: [0, 0, 0], direction: [0, -1, 0] },
      start: { position: [-length / 2, 0, 0], direction: [-1, 0, 0] },
      end: { position: [length / 2, 0, 0], direction: [1, 0, 0] },
    },
  };
}

const builders = new Map([
  ["pitched-roof-deck", geometry => roofPanel(geometry, deckProfile)],
  ["standing-seam-roof-panel", geometry => roofPanel(geometry, seamProfile)],
  ["corrugated-roof-panel", geometry => roofPanel(geometry, corrugatedProfile)],
  ["roof-ridge-cap", ridgeCap],
]);

export function roofSweep(geometry) {
  return builders.get(geometry?.type)?.(geometry);
}
