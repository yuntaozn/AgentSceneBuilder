import { applyCompositionChangesetProposal } from "./human-pose.js";

const HUMAN_SURFACE_METHOD = "character.human-surface-lowpoly";
const DEFAULT_HEIGHT = 1.74;
const HUMAN_PARTS = new Set(["head", "hand", "foot"]);
const HUMAN_SIDES = new Set(["left", "right"]);

const COLORS = {
  shirt: "#ffdc4f",
  shirtShadow: "#f1c940",
  inner: "#00a8b5",
  placket: "#f7f3df",
  pocket: "#b6b9bb",
  trousers: "#aeb2b5",
  trousersDark: "#94999c",
  belt: "#8a3f12",
  buckle: "#f5c451",
  skin: "#efd7c1",
  glove: "#fbfbf4",
  gloveShadow: "#e5e5dc",
  helmet: "#f5f7f5",
  boot: "#c89a54",
  bootToe: "#e0bd78",
  bootSole: "#7b5630",
};

const TORSO_PROFILE = [
  [1, 0],
  [0.84, 0.55],
  [0.42, 1.05],
  [0, 1.12],
  [-0.42, 1.05],
  [-0.84, 0.55],
  [-1, 0],
  [-0.82, -0.58],
  [0, -0.74],
  [0.82, -0.58],
];
const TROUSER_PROFILE = [
  [1, 0],
  [0.82, 0.58],
  [0.28, 0.94],
  [-0.28, 0.94],
  [-0.82, 0.58],
  [-1, 0],
  [-0.72, -0.6],
  [0, -0.78],
  [0.72, -0.6],
];
const HEAD_PROFILE = [
  [1, 0],
  [0.7, 0.68],
  [0.2, 1.1],
  [0, 1.16],
  [-0.2, 1.1],
  [-0.7, 0.68],
  [-1, 0],
  [-0.72, -0.7],
  [0, -0.82],
  [0.72, -0.7],
];
const HELMET_PROFILE = [
  [1, 0],
  [0.92, 0.58],
  [0.42, 1],
  [0, 1.06],
  [-0.42, 1],
  [-0.92, 0.58],
  [-1, 0],
  [-0.88, -0.48],
  [0, -0.64],
  [0.88, -0.48],
];
const PALM_PROFILE = [
  [1, 0],
  [0.84, 0.58],
  [0.38, 0.92],
  [-0.38, 0.92],
  [-0.84, 0.58],
  [-1, 0],
  [-0.78, -0.55],
  [0, -0.72],
  [0.78, -0.55],
];
const SLEEVE_PROFILE = [
  [1, 0],
  [0.74, 0.7],
  [0, 0.95],
  [-0.74, 0.7],
  [-1, 0],
  [-0.66, -0.62],
  [0, -0.76],
  [0.66, -0.62],
];
const LIMB_PROFILE = [
  [1, 0],
  [0.72, 0.64],
  [0.18, 0.92],
  [-0.42, 0.82],
  [-1, 0.16],
  [-0.86, -0.54],
  [-0.16, -0.82],
  [0.74, -0.58],
];
const BOOT_PROFILE = [
  [1, 0],
  [0.82, 0.72],
  [0.22, 0.98],
  [-0.7, 0.72],
  [-1, 0.05],
  [-0.86, -0.86],
  [0, -1],
  [0.9, -0.74],
];
const NOSE_PROFILE = [
  [0.72, 0.12],
  [0.4, 0.86],
  [0, 1],
  [-0.4, 0.86],
  [-0.72, 0.12],
  [-0.45, -0.78],
  [0, -1],
  [0.45, -0.78],
];

function validateHeight(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError("human height must be a positive number");
  return value;
}

function validateHumanPart(value) {
  if (!HUMAN_PARTS.has(value)) throw new TypeError(`Unknown human part: ${value}`);
  return value;
}

function validateSide(value) {
  if (!HUMAN_SIDES.has(value)) throw new TypeError(`Unknown human side: ${value}`);
  return value;
}

function scalar(value, scale = 1) {
  return Number((value * scale).toFixed(6));
}

function vec(value, scale = 1) {
  return value.map((item) => scalar(item, scale));
}

function subtractVec(a, b) {
  return a.map((item, index) => scalar(item - b[index], 1));
}

function clone(value) {
  return structuredClone(value);
}

function appearance(color, extra = {}) {
  return { color, opacity: 1, roughness: 0.62, ...extra };
}

function node({ id, parent, semanticType, geometry, transform, appearance: nodeAppearance, metadata, repetition, orientation }) {
  return {
    id,
    ...(parent ? { parent } : {}),
    semanticType,
    ...(geometry ? { geometry } : {}),
    ...(transform ? { transform } : {}),
    ...(nodeAppearance ? { appearance: nodeAppearance } : {}),
    ...(metadata ? { metadata } : {}),
    ...(repetition ? { repetition } : {}),
    ...(orientation ? { orientation } : {}),
  };
}

function scaledNode(definition, scale) {
  const result = clone(definition);
  if (result.geometry?.type === "box") result.geometry.size = vec(result.geometry.size, scale);
  if (result.geometry?.type === "sphere") result.geometry.radius = scalar(result.geometry.radius, scale);
  if (result.geometry?.type === "cylinder") {
    result.geometry.radius = scalar(result.geometry.radius, scale);
    result.geometry.height = scalar(result.geometry.height, scale);
  }
  if (result.geometry?.type === "cone") {
    result.geometry.radius = scalar(result.geometry.radius, scale);
    result.geometry.height = scalar(result.geometry.height, scale);
  }
  if (result.geometry?.type === "torus") {
    result.geometry.majorRadius = scalar(result.geometry.majorRadius, scale);
    result.geometry.tubeRadius = scalar(result.geometry.tubeRadius, scale);
  }
  if (result.geometry?.type === "cylinder-between") {
    result.geometry.start = vec(result.geometry.start, scale);
    result.geometry.end = vec(result.geometry.end, scale);
    result.geometry.radius = scalar(result.geometry.radius, scale);
  }
  if (result.geometry?.type === "tapered-cylinder-between") {
    result.geometry.start = vec(result.geometry.start, scale);
    result.geometry.end = vec(result.geometry.end, scale);
    result.geometry.startRadius = scalar(result.geometry.startRadius, scale);
    result.geometry.endRadius = scalar(result.geometry.endRadius, scale);
  }
  if (result.geometry?.type === "lofted-surface") {
    result.geometry.sections = result.geometry.sections.map((section) => ({
      ...section,
      center: vec(section.center, scale),
      ...(section.radiusX !== undefined ? { radiusX: scalar(section.radiusX, scale) } : {}),
      ...(section.radiusZ !== undefined ? { radiusZ: scalar(section.radiusZ, scale) } : {}),
      ...(section.axisX ? { axisX: vec(section.axisX, scale) } : {}),
      ...(section.axisZ ? { axisZ: vec(section.axisZ, scale) } : {}),
    }));
  }
  if (result.geometry?.type === "tube-along") {
    result.geometry.points = result.geometry.points.map((point) => vec(point, scale));
    result.geometry.radius = scalar(result.geometry.radius, scale);
  }
  if (result.transform?.position) result.transform.position = vec(result.transform.position, scale);
  if (result.pivot) result.pivot = vec(result.pivot, scale);
  if (result.repetition?.start) result.repetition.start = vec(result.repetition.start, scale);
  for (const key of ["step", "stepX", "stepY", "stepZ", "center"]) {
    if (result.repetition?.[key]) result.repetition[key] = vec(result.repetition[key], scale);
  }
  if (result.repetition?.radius !== undefined) result.repetition.radius = scalar(result.repetition.radius, scale);
  return result;
}

function profileSection(id, y, width, depth, role, scale) {
  return {
    id,
    y: scalar(y, scale),
    width: scalar(width, scale),
    depth: scalar(depth, scale),
    role,
  };
}

function loftedProfile(sections, radialSegments = 10, profile) {
  return {
    type: "lofted-surface",
    sections: sections.map(([id, center, radiusX, radiusZ, role, sectionProfile, extra = {}]) => ({
      id,
      center,
      ...(radiusX !== undefined ? { radiusX } : {}),
      ...(radiusZ !== undefined ? { radiusZ } : {}),
      role,
      ...(extra.axisX ? { axisX: extra.axisX } : {}),
      ...(extra.axisZ ? { axisZ: extra.axisZ } : {}),
      ...((sectionProfile ?? profile) ? { profile: sectionProfile ?? profile } : {}),
    })),
    radialSegments,
    capStart: true,
    capEnd: true,
  };
}

function xySectionAxes(radiusX, radiusY) {
  return { axisX: [radiusX, 0, 0], axisZ: [0, radiusY, 0] };
}

export function createHumanSurfaceProfile(request = {}) {
  const height = validateHeight(request.height ?? DEFAULT_HEIGHT);
  const scale = height / DEFAULT_HEIGHT;
  const profile = request.profile ?? "low-poly-worker";
  if (profile !== "low-poly-worker") throw new TypeError(`Unknown human surface profile: ${profile}`);
  return {
    kind: "human-surface-profile",
    method: HUMAN_SURFACE_METHOD,
    profile,
    units: "m",
    height,
    sections: [
      profileSection("sole", 0.0, 0.24, 0.25, "ground-contact reference", scale),
      profileSection("ankle", 0.08, 0.18, 0.11, "ankle/boot top", scale),
      profileSection("knee", 0.51, 0.21, 0.11, "knee joint line", scale),
      profileSection("hip", 0.91, 0.36, 0.14, "pelvis support", scale),
      profileSection("waist", 1.04, 0.30, 0.11, "belt and waist narrowing", scale),
      profileSection("chest", 1.32, 0.45, 0.145, "flatter upper torso and shoulders", scale),
      profileSection("neck", 1.49, 0.07, 0.07, "neck cylinder", scale),
      profileSection("eye", 1.64, 0.16, 0.105, "face/gaze line", scale),
      profileSection("crown", 1.74, 0.14, 0.105, "helmet/head top", scale),
    ],
    limbProfiles: {
      upperArm: { length: scalar(0.265, scale), shoulderRadius: scalar(0.027, scale), elbowRadius: scalar(0.021, scale), visualRule: "lofted sleeve surface with non-circular limb profile; visible shoulder ball should be subtle" },
      forearm: { length: scalar(0.238, scale), elbowRadius: scalar(0.022, scale), wristRadius: scalar(0.015, scale), visualRule: "lofted sleeve surface narrows toward glove cuff and keeps forearm from reading as a plastic pipe" },
      thigh: { length: scalar(0.39, scale), hipWidth: scalar(0.11, scale), kneeWidth: scalar(0.082, scale), visualRule: "flatter trouser crease and side facet break straight pipe silhouette" },
      lowerLeg: { length: scalar(0.44, scale), kneeWidth: scalar(0.08, scale), ankleWidth: scalar(0.056, scale), visualRule: "flatter shin crease and boot overlap prevent stick-leg look" },
      hand: { palmLength: scalar(0.065, scale), fingerCount: 5, fingertipAnchors: 10, visualRule: "smaller palm, thumb, four close-set fingers, tips, and subtle knuckles avoid claw-like hands" },
      footwear: { length: scalar(0.25, scale), profile: "axis-lofted boot outline", visualRule: "shoe volume is lofted along the foot direction instead of box plus sphere toe" },
      face: { profile: "axis-lofted nose and cheek facets", visualRule: "facial features should be low relief patches on a head surface, not isolated toy primitives" },
    },
    expansion: {
      compositionSpec: "0.3",
      geometryTypes: ["box", "sphere", "cylinder", "cone", "torus", "cylinder-between", "tapered-cylinder-between", "lofted-surface"],
      rendererNeutral: true,
      noNewGeometryTypeRequired: false,
      addedGeometryTypes: ["tapered-cylinder-between", "lofted-surface"],
      primarySurfaceGeometry: "lofted-surface",
      surfaceFeatures: ["section-loft-body", "section-loft-head", "section-loft-hands", "profiled-section-contours", "axis-lofted-footwear", "facial-feature-lofting", "limb-profile-lofting", "worker-silhouette-v3", "reduced-doll-joints"],
    },
    aiHints: [
      "Use the section widths to keep the waist narrower than the chest and the limbs narrower than the torso.",
      "Use section.profile points on lofted-surface nodes when a human part needs a flattened back, protruding face, broad shoulder, or non-circular palm/trouser outline.",
      "Use axisX/axisZ on lofted-surface sections for features that grow along another direction, such as a nose bridge or shoe length.",
      "Keep pose pivots separate from visible surface nodes; pose belongs to character.human-pose-rig.",
      "If an existing human is missing semantic surface nodes, request addMissing=true in a refinement proposal.",
      "Prefer clothing sleeves and cuffs over exposed cylindrical arms for worker figures; oversized joint balls make the result look like a toy.",
    ],
  };
}

function addTorsoSurface(nodes) {
  nodes.push(
    node({ id: "pelvis", parent: "body-root", semanticType: "character.human.torso.pelvis", geometry: loftedProfile([
      ["pelvis-bottom", [0, 0.875, 0.006], 0.145, 0.058, "hip narrowing above legs"],
      ["pelvis-mid", [0, 0.94, 0.008], 0.18, 0.07, "pelvis width"],
      ["pelvis-top", [0, 1.015, 0.01], 0.166, 0.064, "belt support"],
    ], 10, TROUSER_PROFILE), appearance: appearance(COLORS.trousers, { flatShading: true }) }),
    node({ id: "belt", parent: "body-root", semanticType: "character.human.clothing.belt", geometry: { type: "box", size: [0.38, 0.032, 0.018] }, transform: { position: [0, 1.015, 0.108] }, appearance: appearance(COLORS.belt, { roughness: 0.55 }) }),
    node({ id: "belt-buckle", parent: "body-root", semanticType: "character.human.clothing.belt-buckle", geometry: { type: "box", size: [0.052, 0.032, 0.012] }, transform: { position: [0, 1.016, 0.123] }, appearance: appearance(COLORS.buckle, { metalness: 0.45, roughness: 0.28 }) }),
    node({ id: "abdomen", parent: "body-root", semanticType: "character.human.torso.abdomen", geometry: loftedProfile([
      ["waist", [0, 1.025, 0.012], 0.148, 0.054, "waist narrowing"],
      ["abdomen-mid", [0, 1.14, 0.015], 0.168, 0.061, "flatter shirt body"],
      ["lower-chest", [0, 1.23, 0.014], 0.186, 0.066, "transition into chest"],
    ], 10, TORSO_PROFILE), appearance: appearance(COLORS.shirt, { flatShading: true }) }),
    node({ id: "chest", parent: "body-root", semanticType: "character.human.torso.chest", geometry: loftedProfile([
      ["rib-lower", [0, 1.205, 0.012], 0.184, 0.064, "lower rib cage"],
      ["chest-full", [0, 1.315, 0.016], 0.225, 0.073, "upper chest width with flatter front/back"],
      ["shoulder-slope", [0, 1.43, 0.006], 0.205, 0.062, "neck and shoulder taper"],
    ], 10, TORSO_PROFILE), appearance: appearance(COLORS.shirt, { flatShading: true }) }),
    node({ id: "left-shirt-side-facet", parent: "body-root", semanticType: "character.human.clothing.torso-facet.left", geometry: { type: "box", size: [0.07, 0.28, 0.01] }, transform: { position: [-0.202, 1.255, 0.076], rotation: [0, 0, -0.1] }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.72 }) }),
    node({ id: "right-shirt-side-facet", parent: "body-root", semanticType: "character.human.clothing.torso-facet.right", geometry: { type: "box", size: [0.07, 0.28, 0.01] }, transform: { position: [0.202, 1.255, 0.076], rotation: [0, 0, 0.1] }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.72 }) }),
    node({ id: "shirt-placket", parent: "body-root", semanticType: "character.human.clothing.shirt-placket", geometry: { type: "box", size: [0.032, 0.34, 0.009] }, transform: { position: [0, 1.245, 0.102] }, appearance: appearance(COLORS.placket, { roughness: 0.58 }) }),
    node({ id: "shirt-neck-inset", parent: "body-root", semanticType: "character.human.clothing.inner-shirt", geometry: { type: "box", size: [0.075, 0.115, 0.01] }, transform: { position: [0, 1.395, 0.106] }, appearance: appearance(COLORS.inner, { roughness: 0.5 }) }),
    node({ id: "left-shirt-collar", parent: "body-root", semanticType: "character.human.clothing.collar.left", geometry: { type: "box", size: [0.088, 0.044, 0.012] }, transform: { position: [-0.058, 1.405, 0.111], rotation: [0, 0, -0.42] }, appearance: appearance("#f1f2e8") }),
    node({ id: "right-shirt-collar", parent: "body-root", semanticType: "character.human.clothing.collar.right", geometry: { type: "box", size: [0.088, 0.044, 0.012] }, transform: { position: [0.058, 1.405, 0.111], rotation: [0, 0, 0.42] }, appearance: appearance("#f1f2e8") }),
    node({ id: "left-chest-pocket", parent: "body-root", semanticType: "character.human.clothing.pocket.left", geometry: { type: "box", size: [0.07, 0.065, 0.01] }, transform: { position: [-0.112, 1.29, 0.105] }, appearance: appearance(COLORS.pocket) }),
    node({ id: "right-chest-pocket", parent: "body-root", semanticType: "character.human.clothing.pocket.right", geometry: { type: "box", size: [0.07, 0.065, 0.01] }, transform: { position: [0.112, 1.29, 0.105] }, appearance: appearance(COLORS.pocket) }),
    node({ id: "shirt-button-upper", parent: "body-root", semanticType: "character.human.clothing.button", geometry: { type: "sphere", radius: 0.0065, segments: 8 }, transform: { position: [0, 1.33, 0.11], scale: [1, 1, 0.35] }, appearance: appearance("#d8d4bd", { roughness: 0.45 }) }),
    node({ id: "shirt-button-middle", parent: "body-root", semanticType: "character.human.clothing.button", geometry: { type: "sphere", radius: 0.0065, segments: 8 }, transform: { position: [0, 1.245, 0.11], scale: [1, 1, 0.35] }, appearance: appearance("#d8d4bd", { roughness: 0.45 }) }),
    node({ id: "shirt-button-lower", parent: "body-root", semanticType: "character.human.clothing.button", geometry: { type: "sphere", radius: 0.0065, segments: 8 }, transform: { position: [0, 1.16, 0.11], scale: [1, 1, 0.35] }, appearance: appearance("#d8d4bd", { roughness: 0.45 }) }),
    node({ id: "shoulder-line", parent: "body-root", semanticType: "character.human.torso.shoulder-line", geometry: { type: "cylinder-between", start: [-0.245, 1.385, 0], end: [0.245, 1.385, 0], radius: 0.014, radialSegments: 8 }, appearance: appearance("#f4d24a", { opacity: 0.45, roughness: 0.64 }) }),
    node({ id: "left-clavicle", parent: "body-root", semanticType: "character.human.torso.clavicle.left", geometry: { type: "cylinder-between", start: [-0.035, 1.405, 0.06], end: [-0.205, 1.375, 0.055], radius: 0.009, radialSegments: 8 }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.9, roughness: 0.58 }) }),
    node({ id: "right-clavicle", parent: "body-root", semanticType: "character.human.torso.clavicle.right", geometry: { type: "cylinder-between", start: [0.035, 1.405, 0.06], end: [0.205, 1.375, 0.055], radius: 0.009, radialSegments: 8 }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.9, roughness: 0.58 }) }),
  );
}

function addHeadSurface(nodes) {
  nodes.push(
    node({ id: "neck", parent: "body-root", semanticType: "character.human.neck", geometry: { type: "cylinder", radius: 0.034, height: 0.105, radialSegments: 10 }, transform: { position: [0, 1.485, -0.002] }, appearance: appearance(COLORS.skin, { roughness: 0.52 }) }),
    node({ id: "head-pivot", parent: "body-root", semanticType: "character.human.rig.pivot.head", transform: { position: [0, 1.585, 0.006], rotation: [0, 0, 0] } }),
    node({ id: "head", parent: "head-pivot", semanticType: "character.human.head", geometry: loftedProfile([
      ["jaw", [0, -0.107, 0.032], 0.052, 0.035, "narrow jaw and chin support"],
      ["mouth-cheek", [0, -0.054, 0.04], 0.073, 0.049, "mouth and lower cheek volume"],
      ["eye-cheek", [0, 0.018, 0.033], 0.085, 0.058, "eye and cheek width"],
      ["temple", [0, 0.078, 0.006], 0.078, 0.052, "temple narrowing"],
      ["crown", [0, 0.13, -0.009], 0.05, 0.036, "rounded crown under helmet"],
    ], 10, HEAD_PROFILE), appearance: appearance(COLORS.skin, { roughness: 0.52, flatShading: true }) }),
    node({ id: "helmet-inner-shadow", parent: "head-pivot", semanticType: "character.human.safety-helmet.inner-shadow", geometry: { type: "sphere", radius: 0.08, segments: 10 }, transform: { position: [0, 0.066, -0.048], scale: [0.66, 0.08, 0.38] }, appearance: appearance("#d9d9d2", { opacity: 0.16, roughness: 0.72 }) }),
    node({ id: "safety-helmet-shell", parent: "head-pivot", semanticType: "character.human.safety-helmet.shell", geometry: loftedProfile([
      ["helmet-rim", [0, 0.058, -0.002], 0.116, 0.104, "flat hard-hat lower rim"],
      ["helmet-dome", [0, 0.112, -0.006], 0.101, 0.092, "hard-hat dome"],
      ["helmet-crown", [0, 0.158, -0.008], 0.045, 0.04, "hard-hat crown"],
    ], 10, HELMET_PROFILE), appearance: appearance(COLORS.helmet, { roughness: 0.42, flatShading: true }) }),
    node({ id: "safety-helmet-brim", parent: "head-pivot", semanticType: "character.human.safety-helmet.brim", geometry: { type: "box", size: [0.23, 0.012, 0.08] }, transform: { position: [0, 0.054, 0.078] }, appearance: appearance("#eff2ef", { roughness: 0.45 }) }),
    node({ id: "safety-helmet-side-rim", parent: "head-pivot", semanticType: "character.human.safety-helmet.side-rim", geometry: { type: "box", size: [0.232, 0.012, 0.018] }, transform: { position: [0, 0.056, -0.055] }, appearance: appearance("#ecefeb", { roughness: 0.45 }) }),
    node({ id: "safety-helmet-ridge", parent: "head-pivot", semanticType: "character.human.safety-helmet.ridge", geometry: { type: "box", size: [0.024, 0.022, 0.17] }, transform: { position: [0, 0.139, -0.012] }, appearance: appearance("#e7eae5", { roughness: 0.45 }) }),
    node({ id: "safety-helmet-front-badge", parent: "head-pivot", semanticType: "character.human.safety-helmet.badge", geometry: { type: "box", size: [0.047, 0.018, 0.005] }, transform: { position: [0, 0.086, 0.111] }, appearance: appearance("#ff6f2a", { roughness: 0.5 }) }),
    node({ id: "left-ear", parent: "head-pivot", semanticType: "character.human.ear.left", geometry: { type: "sphere", radius: 0.019, segments: 10 }, transform: { position: [-0.098, -0.002, -0.01], scale: [0.45, 0.9, 0.65] }, appearance: appearance(COLORS.skin, { roughness: 0.52 }) }),
    node({ id: "right-ear", parent: "head-pivot", semanticType: "character.human.ear.right", geometry: { type: "sphere", radius: 0.019, segments: 10 }, transform: { position: [0.098, -0.002, -0.01], scale: [0.45, 0.9, 0.65] }, appearance: appearance(COLORS.skin, { roughness: 0.52 }) }),
    node({ id: "left-eye", parent: "head-pivot", semanticType: "character.human.eye.left", geometry: { type: "sphere", radius: 0.0062, segments: 8 }, transform: { position: [-0.032, 0.022, 0.088], scale: [1.25, 0.55, 0.28] }, appearance: appearance("#242426", { roughness: 0.38 }) }),
    node({ id: "right-eye", parent: "head-pivot", semanticType: "character.human.eye.right", geometry: { type: "sphere", radius: 0.0062, segments: 8 }, transform: { position: [0.032, 0.022, 0.088], scale: [1.25, 0.55, 0.28] }, appearance: appearance("#242426", { roughness: 0.38 }) }),
    node({ id: "left-brow", parent: "head-pivot", semanticType: "character.human.brow.left", geometry: { type: "box", size: [0.037, 0.004, 0.004] }, transform: { position: [-0.032, 0.048, 0.092], rotation: [0, 0, -0.05] }, appearance: appearance("#f1f1ec", { roughness: 0.5 }) }),
    node({ id: "right-brow", parent: "head-pivot", semanticType: "character.human.brow.right", geometry: { type: "box", size: [0.037, 0.004, 0.004] }, transform: { position: [0.032, 0.048, 0.092], rotation: [0, 0, 0.05] }, appearance: appearance("#f1f1ec", { roughness: 0.5 }) }),
    node({ id: "left-glasses-rim", parent: "head-pivot", semanticType: "character.human.glasses.rim.left", geometry: { type: "torus", majorRadius: 0.017, tubeRadius: 0.0016, radialSegments: 18, tubularSegments: 6 }, transform: { position: [-0.033, 0.022, 0.098], scale: [1.18, 0.76, 0.18] }, appearance: appearance("#5a5148", { metalness: 0.25, roughness: 0.4 }) }),
    node({ id: "right-glasses-rim", parent: "head-pivot", semanticType: "character.human.glasses.rim.right", geometry: { type: "torus", majorRadius: 0.017, tubeRadius: 0.0016, radialSegments: 18, tubularSegments: 6 }, transform: { position: [0.033, 0.022, 0.098], scale: [1.18, 0.76, 0.18] }, appearance: appearance("#5a5148", { metalness: 0.25, roughness: 0.4 }) }),
    node({ id: "glasses-bridge", parent: "head-pivot", semanticType: "character.human.glasses.bridge", geometry: { type: "box", size: [0.022, 0.003, 0.003] }, transform: { position: [0, 0.022, 0.098] }, appearance: appearance("#5a5148", { metalness: 0.25, roughness: 0.4 }) }),
    node({ id: "nose", parent: "head-pivot", semanticType: "character.human.nose", geometry: loftedProfile([
      ["nose-root", [0, 0.014, 0.081], 0.013, 0.011, "nose bridge root", undefined, xySectionAxes(0.013, 0.011)],
      ["nose-bridge", [0, -0.003, 0.097], 0.0105, 0.014, "nose bridge low relief", undefined, xySectionAxes(0.0105, 0.014)],
      ["nose-tip", [0, -0.019, 0.114], 0.0085, 0.0105, "small rounded nose tip", undefined, xySectionAxes(0.0085, 0.0105)],
    ], 8, NOSE_PROFILE), appearance: appearance("#e1bea5", { roughness: 0.5, flatShading: true }) }),
    node({ id: "left-cheek-facet", parent: "head-pivot", semanticType: "character.human.face.cheek.left", geometry: { type: "box", size: [0.034, 0.04, 0.004] }, transform: { position: [-0.039, -0.02, 0.084], rotation: [0, -0.22, -0.05] }, appearance: appearance("#e7c6ad", { opacity: 0.56, roughness: 0.54 }) }),
    node({ id: "right-cheek-facet", parent: "head-pivot", semanticType: "character.human.face.cheek.right", geometry: { type: "box", size: [0.034, 0.04, 0.004] }, transform: { position: [0.039, -0.02, 0.084], rotation: [0, 0.22, 0.05] }, appearance: appearance("#e7c6ad", { opacity: 0.56, roughness: 0.54 }) }),
    node({ id: "mouth", parent: "head-pivot", semanticType: "character.human.mouth", geometry: { type: "box", size: [0.03, 0.0025, 0.003] }, transform: { position: [0, -0.055, 0.081] }, appearance: appearance("#7a4238", { roughness: 0.42 }) }),
    node({ id: "chin", parent: "head-pivot", semanticType: "character.human.chin", geometry: { type: "sphere", radius: 0.014, segments: 8 }, transform: { position: [0, -0.091, 0.043], scale: [1.05, 0.28, 0.42] }, appearance: appearance("#e8c7ad", { roughness: 0.52 }) }),
  );
}

function addFingerNodes(nodes, side, sign) {
  nodes.push(
    node({ id: `${side}-palm-crease`, parent: `${side}-wrist-pivot`, semanticType: `character.human.hand.palm-crease.${side}`, geometry: { type: "box", size: [0.052, 0.003, 0.003] }, transform: { position: [-sign * 0.004, -0.047, 0.044], rotation: [0, 0, sign * 0.04] }, appearance: appearance(COLORS.gloveShadow, { opacity: 0.5, roughness: 0.52 }) }),
    node({ id: `${side}-thumb-pivot`, parent: `${side}-wrist-pivot`, semanticType: `character.human.hand.thumb-pivot.${side}`, transform: { position: [sign * 0.022, -0.031, 0.029], rotation: [0, 0, 0] } }),
    node({ id: `${side}-thumb`, parent: `${side}-thumb-pivot`, semanticType: `character.human.hand.thumb.proximal.${side}`, geometry: { type: "tapered-cylinder-between", start: [0, 0, 0], end: [sign * 0.021, -0.019, 0.01], startRadius: 0.0075, endRadius: 0.0062, radialSegments: 10 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
    node({ id: `${side}-thumb-distal`, parent: `${side}-thumb-pivot`, semanticType: `character.human.hand.thumb.distal.${side}`, geometry: { type: "tapered-cylinder-between", start: [sign * 0.021, -0.019, 0.01], end: [sign * 0.034, -0.033, 0.012], startRadius: 0.006, endRadius: 0.0048, radialSegments: 10 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
    node({ id: `${side}-thumb-tip`, parent: `${side}-thumb-pivot`, semanticType: `character.human.hand.thumb.tip.${side}`, geometry: { type: "sphere", radius: 0.0066, segments: 10 }, transform: { position: [sign * 0.036, -0.034, 0.012], scale: [0.9, 0.75, 0.9] }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
  );

  const fingers = [
    { name: "index", x: sign * 0.014, endX: sign * 0.001, y: -0.056, z: 0.041, length: -0.036, radius: 0.0044, knuckle: 0.0056 },
    { name: "middle", x: sign * 0.002, endX: 0, y: -0.058, z: 0.042, length: -0.041, radius: 0.0047, knuckle: 0.0059 },
    { name: "ring", x: -sign * 0.011, endX: -sign * 0.001, y: -0.056, z: 0.041, length: -0.036, radius: 0.0042, knuckle: 0.0054 },
    { name: "little", x: -sign * 0.023, endX: -sign * 0.001, y: -0.053, z: 0.039, length: -0.03, radius: 0.0038, knuckle: 0.0049 },
  ];
  for (const finger of fingers) {
    nodes.push(
      node({ id: `${side}-${finger.name}-finger-pivot`, parent: `${side}-wrist-pivot`, semanticType: `character.human.hand.finger-pivot.${finger.name}.${side}`, transform: { position: [finger.x, finger.y, finger.z], rotation: [0, 0, 0] } }),
      node({ id: `${side}-${finger.name}-knuckle`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.knuckle.${finger.name}.${side}`, geometry: { type: "sphere", radius: finger.knuckle, segments: 10 }, transform: { position: [0, 0, 0], scale: [0.86, finger.name === "little" ? 0.58 : 0.62, finger.name === "little" ? 0.72 : 0.78] }, appearance: appearance(COLORS.gloveShadow, { opacity: 0.42, roughness: 0.52 }) }),
      node({ id: `${side}-${finger.name}-finger`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.finger.${finger.name}.${side}`, geometry: { type: "tapered-cylinder-between", start: [0, 0, 0], end: [finger.endX, finger.length, 0.002], startRadius: finger.radius, endRadius: Number((finger.radius * 0.72).toFixed(5)), radialSegments: 8 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
      node({ id: `${side}-${finger.name}-tip`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.fingertip.${finger.name}.${side}`, geometry: { type: "sphere", radius: finger.radius + 0.0006, segments: 8 }, transform: { position: [finger.endX, finger.length - 0.001, 0.002], scale: [0.82, 0.68, 0.82] }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
    );
  }
}

function addSideLimbSurface(nodes, side) {
  const sign = side === "left" ? -1 : 1;
  nodes.push(
    node({ id: `${side}-hip-pivot`, parent: "body-root", semanticType: `character.human.rig.pivot.hip.${side}`, transform: { position: [sign * 0.095, 0.905, 0], rotation: [0, 0, 0] } }),
    node({ id: `${side}-thigh`, parent: `${side}-hip-pivot`, semanticType: `character.human.leg.upper.${side}`, geometry: loftedProfile([
      ["thigh-upper", [0, 0.165, 0.006], 0.055, 0.043, "thigh root under pelvis"],
      ["thigh-mid", [0, -0.02, 0.009], 0.05, 0.04, "flatter trouser volume"],
      ["thigh-knee", [0, -0.19, 0.004], 0.041, 0.034, "knee taper"],
    ], 9, TROUSER_PROFILE), transform: { position: [sign * 0.006, -0.195, 0.016], rotation: [0, 0, sign * 0.035] }, appearance: appearance(COLORS.trousers, { roughness: 0.66, flatShading: true }) }),
    node({ id: `${side}-thigh-front-crease`, parent: `${side}-hip-pivot`, semanticType: `character.human.clothing.trouser-crease.${side}`, geometry: { type: "cylinder-between", start: [-sign * 0.004, -0.04, 0.064], end: [sign * 0.01, -0.36, 0.071], radius: 0.004, radialSegments: 6 }, appearance: appearance("#e3e5e6", { opacity: 0.85, roughness: 0.62 }) }),
    node({ id: `${side}-trouser-side-facet`, parent: `${side}-hip-pivot`, semanticType: `character.human.clothing.trouser-facet.${side}`, geometry: { type: "box", size: [0.045, 0.16, 0.006] }, transform: { position: [sign * 0.045, -0.18, 0.058], rotation: [0, 0, sign * 0.18] }, appearance: appearance(COLORS.trousers, { opacity: 0.7, roughness: 0.66 }) }),
    node({ id: `${side}-knee-pivot`, parent: `${side}-hip-pivot`, semanticType: `character.human.rig.pivot.knee.${side}`, transform: { position: [sign * 0.01, -0.39, 0.01], rotation: [0, 0, 0] } }),
    node({ id: `${side}-knee`, parent: `${side}-knee-pivot`, semanticType: `character.human.joint.knee.${side}`, geometry: { type: "sphere", radius: 0.024, segments: 8 }, transform: { position: [0, 0, 0.018], scale: [1.2, 0.38, 0.72] }, appearance: appearance(COLORS.trousersDark, { opacity: 0.72, roughness: 0.68 }) }),
    node({ id: `${side}-lower-leg`, parent: `${side}-knee-pivot`, semanticType: `character.human.leg.lower.${side}`, geometry: loftedProfile([
      ["calf-knee", [0, 0.19, 0.004], 0.04, 0.034, "below knee"],
      ["calf-full", [0, -0.03, 0], 0.038, 0.036, "calf fabric volume without pipe look"],
      ["ankle-taper", [0, -0.215, -0.004], 0.028, 0.026, "ankle narrowing"],
    ], 9, TROUSER_PROFILE), transform: { position: [-sign * 0.002, -0.22, -0.002] }, appearance: appearance("#b8bcbe", { roughness: 0.66, flatShading: true }) }),
    node({ id: `${side}-shin-front-crease`, parent: `${side}-knee-pivot`, semanticType: `character.human.clothing.shin-crease.${side}`, geometry: { type: "cylinder-between", start: [-sign * 0.002, -0.035, 0.047], end: [-sign * 0.002, -0.39, 0.036], radius: 0.0035, radialSegments: 6 }, appearance: appearance("#e7e8e9", { opacity: 0.75, roughness: 0.62 }) }),
    node({ id: `${side}-ankle-pivot`, parent: `${side}-knee-pivot`, semanticType: `character.human.rig.pivot.ankle.${side}`, transform: { position: [0, -0.44, -0.01], rotation: [0, 0, 0] } }),
    node({ id: `${side}-shoe`, parent: `${side}-ankle-pivot`, semanticType: `character.human.foot.shoe.${side}`, geometry: loftedProfile([
      ["boot-heel", [sign * 0.01, -0.052, -0.046], 0.046, 0.025, "heel volume", undefined, xySectionAxes(0.046, 0.025)],
      ["boot-arch", [sign * 0.01, -0.048, 0.04], 0.054, 0.031, "boot arch and instep", undefined, xySectionAxes(0.054, 0.031)],
      ["boot-toe", [sign * 0.01, -0.043, 0.127], 0.052, 0.029, "rounded toe box", undefined, xySectionAxes(0.052, 0.029)],
      ["boot-front", [sign * 0.01, -0.046, 0.174], 0.035, 0.02, "toe front taper", undefined, xySectionAxes(0.035, 0.02)],
    ], 10, BOOT_PROFILE), appearance: appearance(COLORS.boot, { roughness: 0.72, flatShading: true }) }),
    node({ id: `${side}-toe-cap`, parent: `${side}-ankle-pivot`, semanticType: `character.human.foot.toe.${side}`, geometry: { type: "box", size: [0.082, 0.012, 0.032] }, transform: { position: [sign * 0.01, -0.019, 0.157] }, appearance: appearance(COLORS.bootToe, { opacity: 0.72, roughness: 0.72 }) }),
    node({ id: `${side}-boot-sole`, parent: `${side}-ankle-pivot`, semanticType: `character.human.foot.boot-sole.${side}`, geometry: { type: "box", size: [0.118, 0.014, 0.244] }, transform: { position: [sign * 0.01, -0.084, 0.062] }, appearance: appearance(COLORS.bootSole, { roughness: 0.78 }) }),
    node({ id: `${side}-boot-lace-a`, parent: `${side}-ankle-pivot`, semanticType: `character.human.foot.boot-lace.${side}`, geometry: { type: "box", size: [0.067, 0.0045, 0.006] }, transform: { position: [sign * 0.01, -0.018, 0.07], rotation: [0, -sign * 0.42, 0] }, appearance: appearance("#f2e2b5", { roughness: 0.65 }) }),
    node({ id: `${side}-boot-lace-b`, parent: `${side}-ankle-pivot`, semanticType: `character.human.foot.boot-lace.${side}`, geometry: { type: "box", size: [0.059, 0.0045, 0.006] }, transform: { position: [sign * 0.01, -0.016, 0.096], rotation: [0, sign * 0.36, 0] }, appearance: appearance("#f2e2b5", { roughness: 0.65 }) }),

    node({ id: `${side}-shoulder-pivot`, parent: "body-root", semanticType: `character.human.rig.pivot.shoulder.${side}`, transform: { position: [sign * 0.252, 1.382, 0.004], rotation: [0, 0, 0] } }),
    node({ id: `${side}-shoulder`, parent: `${side}-shoulder-pivot`, semanticType: `character.human.joint.shoulder.${side}`, geometry: { type: "sphere", radius: 0.014, segments: 8 }, transform: { position: [0, -0.006, 0.008], scale: [0.9, 0.42, 0.55] }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.16, roughness: 0.68 }) }),
    node({ id: `${side}-sleeve-cap`, parent: `${side}-shoulder-pivot`, semanticType: `character.human.clothing.sleeve-cap.${side}`, geometry: loftedProfile([
      ["sleeve-shoulder", [0, -0.01, 0.012], 0.042, 0.033, "soft shoulder cap"],
      ["sleeve-upper", [sign * 0.01, -0.075, 0.021], 0.036, 0.028, "upper sleeve volume"],
    ], 8, SLEEVE_PROFILE), appearance: appearance(COLORS.shirt, { roughness: 0.66, flatShading: true }) }),
    node({ id: `${side}-upper-arm`, parent: `${side}-shoulder-pivot`, semanticType: `character.human.arm.upper.${side}`, geometry: loftedProfile([
      ["upper-arm-shoulder", [sign * 0.006, -0.052, 0.02], 0.027, 0.023, "sleeve leaves shoulder cap"],
      ["upper-arm-mid", [sign * 0.016, -0.15, 0.028], 0.024, 0.021, "soft upper arm sleeve"],
      ["upper-arm-elbow", [sign * 0.026, -0.262, 0.033], 0.021, 0.018, "elbow taper"],
    ], 10, LIMB_PROFILE), appearance: appearance(COLORS.shirt, { roughness: 0.66, flatShading: true }) }),
    node({ id: `${side}-upper-sleeve-fold`, parent: `${side}-shoulder-pivot`, semanticType: `character.human.clothing.sleeve-fold.${side}`, geometry: { type: "cylinder-between", start: [sign * 0.004, -0.075, 0.042], end: [sign * 0.023, -0.224, 0.058], radius: 0.0028, radialSegments: 6 }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.78, roughness: 0.58 }) }),
    node({ id: `${side}-elbow-pivot`, parent: `${side}-shoulder-pivot`, semanticType: `character.human.rig.pivot.elbow.${side}`, transform: { position: [sign * 0.026, -0.262, 0.033], rotation: [0, 0, 0] } }),
    node({ id: `${side}-elbow`, parent: `${side}-elbow-pivot`, semanticType: `character.human.joint.elbow.${side}`, geometry: { type: "sphere", radius: 0.011, segments: 8 }, transform: { position: [0, 0, 0.008], scale: [0.9, 0.38, 0.55] }, appearance: appearance("#e8c942", { opacity: 0.18, roughness: 0.68 }) }),
    node({ id: `${side}-forearm`, parent: `${side}-elbow-pivot`, semanticType: `character.human.arm.forearm.${side}`, geometry: loftedProfile([
      ["forearm-elbow", [0, 0, 0.01], 0.022, 0.018, "covered elbow entry"],
      ["forearm-mid", [-sign * 0.007, -0.12, 0.026], 0.018, 0.016, "forearm sleeve body"],
      ["forearm-wrist", [-sign * 0.014, -0.234, 0.039], 0.0145, 0.012, "wrist taper before glove cuff"],
    ], 10, LIMB_PROFILE), appearance: appearance(COLORS.shirt, { roughness: 0.66, flatShading: true }) }),
    node({ id: `${side}-forearm-sleeve-fold`, parent: `${side}-elbow-pivot`, semanticType: `character.human.clothing.forearm-fold.${side}`, geometry: { type: "cylinder-between", start: [-sign * 0.003, -0.04, 0.039], end: [-sign * 0.012, -0.19, 0.062], radius: 0.0025, radialSegments: 6 }, appearance: appearance(COLORS.shirtShadow, { opacity: 0.62, roughness: 0.58 }) }),
    node({ id: `${side}-wrist-pivot`, parent: `${side}-elbow-pivot`, semanticType: `character.human.rig.pivot.wrist.${side}`, transform: { position: [-sign * 0.014, -0.234, 0.039], rotation: [0, 0, 0] } }),
    node({ id: `${side}-sleeve-cuff`, parent: `${side}-wrist-pivot`, semanticType: `character.human.clothing.sleeve-cuff.${side}`, geometry: { type: "sphere", radius: 0.025, segments: 10 }, transform: { position: [sign * 0.003, -0.006, 0.004], scale: [1, 0.28, 0.8] }, appearance: appearance("#f2f0f8", { roughness: 0.58 }) }),
    node({ id: `${side}-hand`, parent: `${side}-wrist-pivot`, semanticType: `character.human.hand.palm.${side}`, geometry: loftedProfile([
      ["wrist-entry", [0, -0.002, 0.001], 0.015, 0.01, "narrow glove wrist entry"],
      ["palm-body", [0, -0.028, 0.005], 0.023, 0.014, "palm body volume"],
      ["knuckle-row", [0, -0.054, 0.004], 0.026, 0.012, "finger root row"],
    ], 9, PALM_PROFILE), transform: { position: [-sign * 0.004, -0.037, 0.019] }, appearance: appearance(COLORS.glove, { roughness: 0.5, flatShading: true }) }),
  );
  addFingerNodes(nodes, side, sign);
}

function lowPolyWorkerSurfaceNodes(scale = 1) {
  const nodes = [
    node({ id: "body-root", semanticType: "character.human.root", transform: { position: [0, 0, 0] } }),
  ];
  addSideLimbSurface(nodes, "left");
  addSideLimbSurface(nodes, "right");
  addTorsoSurface(nodes);
  addHeadSurface(nodes);
  nodes.push(
    node({ id: "center-height-line", parent: "body-root", semanticType: "character.human.measure.height-reference", geometry: { type: "cylinder-between", start: [0.0, 0.0, -0.18], end: [0.0, DEFAULT_HEIGHT, -0.18], radius: 0.004, radialSegments: 8 }, appearance: appearance("#b8ff4d", { opacity: 0.55, emissive: "#8fcc3a", glow: 1 }) }),
    node({ id: "eye-line", parent: "head-pivot", semanticType: "character.human.measure.eye-line", geometry: { type: "cylinder-between", start: [-0.098, 0.022, 0.098], end: [0.098, 0.022, 0.098], radius: 0.003, radialSegments: 8 }, appearance: appearance("#69d9d3", { opacity: 0.85, emissive: "#69d9d3", glow: 1 }) }),
  );
  return nodes.map((item) => scaledNode(item, scale));
}

function lowPolyWorkerAnchors(scale = 1) {
  const anchor = (value) => ({ ...value, position: vec(value.position, scale) });
  return {
    "head-top": anchor({ node: "head", position: [0, 0.14, 0], direction: [0, 1, 0], kind: "height-top" }),
    "eye-forward": anchor({ node: "head-pivot", position: [0, 0.022, 0.098], direction: [0, 0, 1], kind: "gaze-forward" }),
    "neck-base": anchor({ node: "neck", position: [0, -0.055, 0], direction: [0, 1, 0], kind: "joint" }),
    "left-shoulder": anchor({ node: "left-shoulder-pivot", position: [0, 0, 0], direction: [-1, 0, 0], kind: "joint" }),
    "right-shoulder": anchor({ node: "right-shoulder-pivot", position: [0, 0, 0], direction: [1, 0, 0], kind: "joint" }),
    "left-elbow": anchor({ node: "left-elbow-pivot", position: [0, 0, 0], direction: [-1, -1, 0], kind: "joint" }),
    "right-elbow": anchor({ node: "right-elbow-pivot", position: [0, 0, 0], direction: [1, -1, 0], kind: "joint" }),
    "left-wrist": anchor({ node: "left-wrist-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "right-wrist": anchor({ node: "right-wrist-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "left-hand-grip": anchor({ node: "left-hand", position: [0, -0.04, 0.025], direction: [0, 0, 1], kind: "hand-grip" }),
    "right-hand-grip": anchor({ node: "right-hand", position: [0, -0.04, 0.025], direction: [0, 0, 1], kind: "hand-grip" }),
    "left-thumb-tip": anchor({ node: "left-thumb-tip", position: [0, 0, 0], direction: [-1, -1, 0.2], kind: "fingertip" }),
    "right-thumb-tip": anchor({ node: "right-thumb-tip", position: [0, 0, 0], direction: [1, -1, 0.2], kind: "fingertip" }),
    "left-index-tip": anchor({ node: "left-index-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "right-index-tip": anchor({ node: "right-index-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "left-middle-tip": anchor({ node: "left-middle-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "right-middle-tip": anchor({ node: "right-middle-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "left-ring-tip": anchor({ node: "left-ring-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "right-ring-tip": anchor({ node: "right-ring-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "left-little-tip": anchor({ node: "left-little-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "right-little-tip": anchor({ node: "right-little-tip", position: [0, 0, 0], direction: [0, -1, 0.1], kind: "fingertip" }),
    "left-hip": anchor({ node: "left-hip-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "right-hip": anchor({ node: "right-hip-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "left-knee": anchor({ node: "left-knee-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "right-knee": anchor({ node: "right-knee-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "left-ankle": anchor({ node: "left-ankle-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "right-ankle": anchor({ node: "right-ankle-pivot", position: [0, 0, 0], direction: [0, -1, 0], kind: "joint" }),
    "left-foot-contact": anchor({ node: "left-shoe", position: [0, -0.0225, 0.02], direction: [0, -1, 0], kind: "ground-contact" }),
    "right-foot-contact": anchor({ node: "right-shoe", position: [0, -0.0225, 0.02], direction: [0, -1, 0], kind: "ground-contact" }),
  };
}

function lowPolyWorkerRelations() {
  const relations = [
    { type: "mirror-pair", axis: "x", nodes: ["left-shoe", "right-shoe"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-lower-leg", "right-lower-leg"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-thigh", "right-thigh"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-upper-arm", "right-upper-arm"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-forearm", "right-forearm"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-hand", "right-hand"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-thumb", "right-thumb"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-index-finger", "right-index-finger"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-middle-finger", "right-middle-finger"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-ring-finger", "right-ring-finger"] },
    { type: "mirror-pair", axis: "x", nodes: ["left-little-finger", "right-little-finger"] },
    { type: "kinematic-chain", name: "left-arm", nodes: ["left-shoulder", "left-upper-arm", "left-elbow", "left-forearm", "left-wrist", "left-hand"] },
    { type: "kinematic-chain", name: "right-arm", nodes: ["right-shoulder", "right-upper-arm", "right-elbow", "right-forearm", "right-wrist", "right-hand"] },
    { type: "kinematic-chain", name: "left-leg", nodes: ["left-hip", "left-thigh", "left-knee", "left-lower-leg", "left-ankle", "left-shoe"] },
    { type: "kinematic-chain", name: "right-leg", nodes: ["right-hip", "right-thigh", "right-knee", "right-lower-leg", "right-ankle", "right-shoe"] },
  ];
  for (const side of ["left", "right"]) {
    relations.push(
      { type: "finger-chain", name: `${side}-thumb`, nodes: [`${side}-wrist`, `${side}-hand`, `${side}-thumb-pivot`, `${side}-thumb`, `${side}-thumb-distal`, `${side}-thumb-tip`] },
      { type: "finger-chain", name: `${side}-index`, nodes: [`${side}-wrist`, `${side}-hand`, `${side}-index-finger-pivot`, `${side}-index-knuckle`, `${side}-index-finger`, `${side}-index-tip`] },
      { type: "finger-chain", name: `${side}-middle`, nodes: [`${side}-wrist`, `${side}-hand`, `${side}-middle-finger-pivot`, `${side}-middle-knuckle`, `${side}-middle-finger`, `${side}-middle-tip`] },
      { type: "finger-chain", name: `${side}-ring`, nodes: [`${side}-wrist`, `${side}-hand`, `${side}-ring-finger-pivot`, `${side}-ring-knuckle`, `${side}-ring-finger`, `${side}-ring-tip`] },
      { type: "finger-chain", name: `${side}-little`, nodes: [`${side}-wrist`, `${side}-hand`, `${side}-little-finger-pivot`, `${side}-little-knuckle`, `${side}-little-finger`, `${side}-little-tip`] },
    );
  }
  return relations;
}

function descendantIds(nodes, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of nodes) {
      if (item.parent && ids.has(item.parent) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

function isolateSubtree(nodes, { part, rootId, rootNodeId, rootSemanticType, includeIds = [], rebaseBodyChildren = false }) {
  const ids = descendantIds(nodes, rootId);
  for (const id of includeIds) ids.add(id);
  const origin = nodes.find((item) => item.id === rootId)?.transform?.position ?? [0, 0, 0];
  const result = [
    node({ id: rootNodeId, semanticType: rootSemanticType, transform: { position: [0, 0, 0] }, metadata: { humanPart: part, generatedBy: HUMAN_SURFACE_METHOD } }),
  ];

  for (const source of nodes) {
    if (!ids.has(source.id)) continue;
    const item = clone(source);
    item.metadata = {
      ...(item.metadata ?? {}),
      humanPart: part,
      generatedBy: HUMAN_SURFACE_METHOD,
    };
    if (item.id === rootId) {
      item.parent = rootNodeId;
      item.transform = { ...(item.transform ?? {}), position: [0, 0, 0] };
    } else if (!item.parent || !ids.has(item.parent)) {
      item.parent = rootNodeId;
    }
    if (rebaseBodyChildren && source.parent === "body-root" && item.transform?.position) {
      item.parent = rootNodeId;
      item.transform = { ...item.transform, position: subtractVec(source.transform.position, origin) };
    }
    result.push(item);
  }
  return { nodes: result, nodeIds: new Set(result.map((item) => item.id)) };
}

function partRelations(part, side) {
  if (part === "head") {
    return [
      { type: "human-part-module", name: "head", nodes: ["head-root", "neck", "head-pivot", "head"] },
      { type: "facial-feature-group", name: "face-lite", nodes: ["head", "nose", "left-eye", "right-eye", "left-cheek-facet", "right-cheek-facet", "mouth", "chin"] },
      { type: "safety-equipment-layer", name: "helmet", nodes: ["safety-helmet-shell", "safety-helmet-brim", "safety-helmet-side-rim", "safety-helmet-ridge", "safety-helmet-front-badge"] },
    ];
  }
  if (part === "hand") {
    return [
      { type: "human-part-module", name: `${side}-hand`, nodes: [`${side}-hand-root`, `${side}-wrist-pivot`, `${side}-hand`] },
      { type: "finger-chain", name: `${side}-thumb`, nodes: [`${side}-wrist-pivot`, `${side}-hand`, `${side}-thumb-pivot`, `${side}-thumb`, `${side}-thumb-distal`, `${side}-thumb-tip`] },
      ...["index", "middle", "ring", "little"].map((finger) => ({
        type: "finger-chain",
        name: `${side}-${finger}`,
        nodes: [`${side}-wrist-pivot`, `${side}-hand`, `${side}-${finger}-finger-pivot`, `${side}-${finger}-knuckle`, `${side}-${finger}-finger`, `${side}-${finger}-finger-distal`, `${side}-${finger}-tip`],
      })),
    ];
  }
  return [
    { type: "human-part-module", name: `${side}-foot`, nodes: [`${side}-foot-root`, `${side}-ankle-pivot`, `${side}-shoe`] },
    { type: "footwear-layer", name: `${side}-boot`, nodes: [`${side}-ankle-collar`, `${side}-shoe`, `${side}-toe-cap`, `${side}-boot-sole`, `${side}-heel-block`, `${side}-boot-side-panel`, `${side}-boot-lace-a`, `${side}-boot-lace-b`, `${side}-boot-lace-c`] },
  ];
}

function partAnnotations(part, side, scale) {
  if (part === "head") {
    return [
      { id: "head-module-note", text: "Head module: face, helmet, glasses, neck anchor", position: vec([0.22, 0.07, 0.2], scale), color: "#b8ff4d" },
      { id: "face-loft-note", text: "Nose and cheeks are low-relief editable facial geometry", position: vec([0.2, -0.08, 0.22], scale), color: "#69d9d3" },
    ];
  }
  if (part === "hand") {
    return [
      { id: `${side}-hand-module-note`, text: "Hand module: palm, thumb, four fingers, grip and fingertip anchors", position: vec([0.16, -0.08, 0.16], scale), color: "#f0d879" },
    ];
  }
  return [
    { id: `${side}-foot-module-note`, text: "Foot module: axis-lofted boot, sole, laces and ground contact anchor", position: vec([0.2, -0.04, 0.22], scale), color: "#f0d879" },
  ];
}

function partAnchors(part, side, scale, nodeIds) {
  const all = lowPolyWorkerAnchors(scale);
  const anchors = Object.fromEntries(Object.entries(all).filter(([, anchor]) => nodeIds.has(anchor.node)).map(([key, value]) => [key, clone(value)]));
  if (part === "hand") {
    anchors["hand-grip"] = clone(all[`${side}-hand-grip`]);
    anchors["thumb-tip"] = clone(all[`${side}-thumb-tip`]);
    for (const finger of ["index", "middle", "ring", "little"]) anchors[`${finger}-tip`] = clone(all[`${side}-${finger}-tip`]);
  }
  if (part === "foot") {
    anchors["foot-contact"] = clone(all[`${side}-foot-contact`]);
    anchors["ankle-joint"] = { node: `${side}-ankle-pivot`, position: [0, 0, 0], direction: [0, 1, 0], kind: "joint" };
  }
  return anchors;
}

function buildHeadPartNodes(scale = 1) {
  const nodes = [
    node({ id: "head-root", semanticType: "character.human.part.head.root", transform: { position: [0, 0, 0] }, metadata: { humanPart: "head", generatedBy: HUMAN_SURFACE_METHOD } }),
    node({ id: "neck", parent: "head-root", semanticType: "character.human.neck", geometry: { type: "lofted-surface", sections: [
      { id: "neck-base", center: [0, -0.18, -0.006], radiusX: 0.04, radiusZ: 0.034, profile: HEAD_PROFILE },
      { id: "neck-top", center: [0, -0.075, -0.002], radiusX: 0.034, radiusZ: 0.03, profile: HEAD_PROFILE },
    ], radialSegments: 10, capStart: true, capEnd: true }, appearance: appearance(COLORS.skin, { roughness: 0.52, flatShading: true }) }),
    node({ id: "head-pivot", parent: "head-root", semanticType: "character.human.rig.pivot.head", transform: { position: [0, 0, 0], rotation: [0, 0, 0] } }),
    node({ id: "head", parent: "head-pivot", semanticType: "character.human.head", geometry: loftedProfile([
      ["chin-plane", [0, -0.118, 0.035], 0.048, 0.034, "narrow chin"],
      ["jaw-plane", [0, -0.082, 0.044], 0.066, 0.045, "jaw and lower face"],
      ["mouth-cheek", [0, -0.04, 0.048], 0.078, 0.054, "mouth and cheek volume"],
      ["eye-cheek", [0, 0.02, 0.044], 0.09, 0.062, "eye and cheek width"],
      ["temple", [0, 0.08, 0.012], 0.083, 0.057, "temple narrowing"],
      ["skull-top", [0, 0.135, -0.006], 0.054, 0.04, "skull top under helmet"],
    ], 12, HEAD_PROFILE), appearance: appearance(COLORS.skin, { roughness: 0.52, flatShading: true }) }),
    node({ id: "nose", parent: "head-pivot", semanticType: "character.human.nose", geometry: loftedProfile([
      ["nose-root", [0, 0.018, 0.086], 0.013, 0.011, "nose bridge root", undefined, xySectionAxes(0.013, 0.011)],
      ["nose-bridge", [0, -0.004, 0.104], 0.011, 0.015, "nose bridge low relief", undefined, xySectionAxes(0.011, 0.015)],
      ["nose-tip", [0, -0.026, 0.119], 0.009, 0.011, "small rounded nose tip", undefined, xySectionAxes(0.009, 0.011)],
    ], 8, NOSE_PROFILE), appearance: appearance("#e2bea5", { roughness: 0.5, flatShading: true }) }),
    node({ id: "left-cheek-facet", parent: "head-pivot", semanticType: "character.human.face.cheek.left", geometry: { type: "box", size: [0.034, 0.045, 0.004] }, transform: { position: [-0.041, -0.022, 0.088], rotation: [0, -0.22, -0.04] }, appearance: appearance("#e8c8b0", { opacity: 0.5, roughness: 0.54 }) }),
    node({ id: "right-cheek-facet", parent: "head-pivot", semanticType: "character.human.face.cheek.right", geometry: { type: "box", size: [0.034, 0.045, 0.004] }, transform: { position: [0.041, -0.022, 0.088], rotation: [0, 0.22, 0.04] }, appearance: appearance("#e8c8b0", { opacity: 0.5, roughness: 0.54 }) }),
    node({ id: "left-ear", parent: "head-pivot", semanticType: "character.human.ear.left", geometry: { type: "sphere", radius: 0.018, segments: 10 }, transform: { position: [-0.102, -0.004, -0.006], scale: [0.42, 0.9, 0.6] }, appearance: appearance(COLORS.skin, { roughness: 0.52 }) }),
    node({ id: "right-ear", parent: "head-pivot", semanticType: "character.human.ear.right", geometry: { type: "sphere", radius: 0.018, segments: 10 }, transform: { position: [0.102, -0.004, -0.006], scale: [0.42, 0.9, 0.6] }, appearance: appearance(COLORS.skin, { roughness: 0.52 }) }),
    node({ id: "left-eye", parent: "head-pivot", semanticType: "character.human.eye.left", geometry: { type: "sphere", radius: 0.0058, segments: 8 }, transform: { position: [-0.032, 0.024, 0.096], scale: [1.45, 0.58, 0.24] }, appearance: appearance("#242426", { roughness: 0.38 }) }),
    node({ id: "right-eye", parent: "head-pivot", semanticType: "character.human.eye.right", geometry: { type: "sphere", radius: 0.0058, segments: 8 }, transform: { position: [0.032, 0.024, 0.096], scale: [1.45, 0.58, 0.24] }, appearance: appearance("#242426", { roughness: 0.38 }) }),
    node({ id: "left-brow", parent: "head-pivot", semanticType: "character.human.brow.left", geometry: { type: "box", size: [0.036, 0.0035, 0.0035] }, transform: { position: [-0.032, 0.049, 0.099], rotation: [0, 0, -0.06] }, appearance: appearance("#f1f1ec", { roughness: 0.5 }) }),
    node({ id: "right-brow", parent: "head-pivot", semanticType: "character.human.brow.right", geometry: { type: "box", size: [0.036, 0.0035, 0.0035] }, transform: { position: [0.032, 0.049, 0.099], rotation: [0, 0, 0.06] }, appearance: appearance("#f1f1ec", { roughness: 0.5 }) }),
    node({ id: "left-glasses-rim", parent: "head-pivot", semanticType: "character.human.glasses.rim.left", geometry: { type: "torus", majorRadius: 0.0165, tubeRadius: 0.0015, radialSegments: 18, tubularSegments: 6 }, transform: { position: [-0.033, 0.024, 0.104], scale: [1.18, 0.76, 0.18] }, appearance: appearance("#5a5148", { metalness: 0.25, roughness: 0.4 }) }),
    node({ id: "right-glasses-rim", parent: "head-pivot", semanticType: "character.human.glasses.rim.right", geometry: { type: "torus", majorRadius: 0.0165, tubeRadius: 0.0015, radialSegments: 18, tubularSegments: 6 }, transform: { position: [0.033, 0.024, 0.104], scale: [1.18, 0.76, 0.18] }, appearance: appearance("#5a5148", { metalness: 0.25, roughness: 0.4 }) }),
    node({ id: "glasses-bridge", parent: "head-pivot", semanticType: "character.human.glasses.bridge", geometry: { type: "box", size: [0.021, 0.0028, 0.0028] }, transform: { position: [0, 0.024, 0.104] }, appearance: appearance("#5a5148", { metalness: 0.25, roughness: 0.4 }) }),
    node({ id: "mouth", parent: "head-pivot", semanticType: "character.human.mouth", geometry: { type: "box", size: [0.03, 0.0025, 0.003] }, transform: { position: [0, -0.058, 0.084] }, appearance: appearance("#7a4238", { roughness: 0.42 }) }),
    node({ id: "chin", parent: "head-pivot", semanticType: "character.human.chin", geometry: { type: "sphere", radius: 0.014, segments: 8 }, transform: { position: [0, -0.096, 0.046], scale: [1.05, 0.28, 0.42] }, appearance: appearance("#e8c7ad", { roughness: 0.52 }) }),
    node({ id: "safety-helmet-shell", parent: "head-pivot", semanticType: "character.human.safety-helmet.shell", geometry: loftedProfile([
      ["helmet-rim", [0, 0.058, 0.002], 0.118, 0.106, "flat hard-hat lower rim"],
      ["helmet-dome", [0, 0.116, -0.004], 0.102, 0.092, "hard-hat dome"],
      ["helmet-crown", [0, 0.162, -0.008], 0.046, 0.04, "hard-hat crown"],
    ], 12, HELMET_PROFILE), appearance: appearance(COLORS.helmet, { roughness: 0.42, flatShading: true }) }),
    node({ id: "safety-helmet-brim", parent: "head-pivot", semanticType: "character.human.safety-helmet.brim", geometry: { type: "box", size: [0.232, 0.011, 0.074] }, transform: { position: [0, 0.052, 0.086] }, appearance: appearance("#eff2ef", { roughness: 0.45 }) }),
    node({ id: "safety-helmet-side-rim", parent: "head-pivot", semanticType: "character.human.safety-helmet.side-rim", geometry: { type: "box", size: [0.23, 0.01, 0.016] }, transform: { position: [0, 0.056, -0.06] }, appearance: appearance("#ecefeb", { roughness: 0.45 }) }),
    node({ id: "safety-helmet-ridge", parent: "head-pivot", semanticType: "character.human.safety-helmet.ridge", geometry: { type: "box", size: [0.022, 0.021, 0.165] }, transform: { position: [0, 0.142, -0.008] }, appearance: appearance("#e7eae5", { roughness: 0.45 }) }),
    node({ id: "safety-helmet-front-badge", parent: "head-pivot", semanticType: "character.human.safety-helmet.badge", geometry: { type: "box", size: [0.046, 0.017, 0.005] }, transform: { position: [0, 0.087, 0.115] }, appearance: appearance("#ff6f2a", { roughness: 0.5 }) }),
    node({ id: "eye-line", parent: "head-pivot", semanticType: "character.human.measure.eye-line", geometry: { type: "cylinder-between", start: [-0.1, 0.024, 0.108], end: [0.1, 0.024, 0.108], radius: 0.0025, radialSegments: 8 }, appearance: appearance("#69d9d3", { opacity: 0.85, emissive: "#69d9d3", glow: 1 }) }),
  ].map((item) => scaledNode(item, scale));
  return nodes;
}

function buildHandPartNodes(side = "right", scale = 1) {
  const sign = side === "left" ? -1 : 1;
  const nodes = [
    node({ id: `${side}-hand-root`, semanticType: `character.human.part.hand.${side}.root`, transform: { position: [0, 0, 0] }, metadata: { humanPart: "hand", side, generatedBy: HUMAN_SURFACE_METHOD, modulePose: "open-palm-readable" } }),
    node({ id: `${side}-wrist-pivot`, parent: `${side}-hand-root`, semanticType: `character.human.rig.pivot.wrist.${side}`, transform: { position: [0, 0, -0.095], rotation: [0, 0, 0] } }),
    node({ id: `${side}-sleeve-cuff`, parent: `${side}-hand-root`, semanticType: `character.human.clothing.sleeve-cuff.${side}`, geometry: { type: "lofted-surface", sections: [
      { id: "cuff-back", center: [0, 0, -0.108], ...xySectionAxes(0.043, 0.018), profile: SLEEVE_PROFILE },
      { id: "cuff-front", center: [0, 0, -0.064], ...xySectionAxes(0.04, 0.016), profile: SLEEVE_PROFILE },
    ], radialSegments: 8, capStart: true, capEnd: true }, appearance: appearance("#f2f0f8", { roughness: 0.58, flatShading: true }) }),
    node({ id: `${side}-hand`, parent: `${side}-hand-root`, semanticType: `character.human.hand.palm.${side}`, geometry: loftedProfile([
      ["palm-wrist", [0, 0, -0.056], 0.034, 0.014, "narrow wrist side", undefined, xySectionAxes(0.034, 0.014)],
      ["palm-body", [sign * 0.004, 0.002, 0.0], 0.053, 0.018, "broad palm body", undefined, xySectionAxes(0.053, 0.018)],
      ["knuckle-row", [sign * 0.002, 0, 0.065], 0.058, 0.015, "four finger root row", undefined, xySectionAxes(0.058, 0.015)],
    ], 10, PALM_PROFILE), appearance: appearance(COLORS.glove, { roughness: 0.5, flatShading: true }) }),
    node({ id: `${side}-palm-pad`, parent: `${side}-hand-root`, semanticType: `character.human.hand.palm-pad.${side}`, geometry: { type: "sphere", radius: 0.026, segments: 10 }, transform: { position: [sign * 0.012, 0.014, 0.014], scale: [1.2, 0.22, 0.9] }, appearance: appearance(COLORS.gloveShadow, { opacity: 0.24, roughness: 0.55 }) }),
    node({ id: `${side}-palm-crease`, parent: `${side}-hand-root`, semanticType: `character.human.hand.palm-crease.${side}`, geometry: { type: "box", size: [0.062, 0.003, 0.003] }, transform: { position: [sign * 0.002, 0.019, 0.025], rotation: [0, 0, sign * 0.06] }, appearance: appearance(COLORS.gloveShadow, { opacity: 0.45, roughness: 0.52 }) }),
    node({ id: `${side}-thumb-pivot`, parent: `${side}-hand-root`, semanticType: `character.human.hand.thumb-pivot.${side}`, transform: { position: [sign * 0.048, 0.004, -0.002], rotation: [0, 0, 0] } }),
    node({ id: `${side}-thumb`, parent: `${side}-thumb-pivot`, semanticType: `character.human.hand.thumb.proximal.${side}`, geometry: { type: "tapered-cylinder-between", start: [0, 0, 0], end: [sign * 0.026, 0.002, 0.034], startRadius: 0.009, endRadius: 0.007, radialSegments: 10 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
    node({ id: `${side}-thumb-distal`, parent: `${side}-thumb-pivot`, semanticType: `character.human.hand.thumb.distal.${side}`, geometry: { type: "tapered-cylinder-between", start: [sign * 0.026, 0.002, 0.034], end: [sign * 0.038, -0.002, 0.069], startRadius: 0.0068, endRadius: 0.0054, radialSegments: 10 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
    node({ id: `${side}-thumb-tip`, parent: `${side}-thumb-pivot`, semanticType: `character.human.hand.thumb.tip.${side}`, geometry: { type: "sphere", radius: 0.0065, segments: 10 }, transform: { position: [sign * 0.04, -0.002, 0.071], scale: [0.9, 0.72, 0.9] }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
  ];
  const fingers = [
    { name: "index", x: sign * 0.034, z: 0.07, length: 0.062, radius: 0.0063, bend: sign * -0.003 },
    { name: "middle", x: sign * 0.012, z: 0.073, length: 0.074, radius: 0.0066, bend: 0 },
    { name: "ring", x: -sign * 0.012, z: 0.071, length: 0.066, radius: 0.006, bend: sign * 0.002 },
    { name: "little", x: -sign * 0.034, z: 0.066, length: 0.052, radius: 0.0052, bend: sign * 0.004 },
  ];
  for (const finger of fingers) {
    nodes.push(
      node({ id: `${side}-${finger.name}-finger-pivot`, parent: `${side}-hand-root`, semanticType: `character.human.hand.finger-pivot.${finger.name}.${side}`, transform: { position: [finger.x, 0.002, finger.z], rotation: [0, 0, 0] } }),
      node({ id: `${side}-${finger.name}-knuckle`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.knuckle.${finger.name}.${side}`, geometry: { type: "sphere", radius: finger.radius * 1.05, segments: 8 }, transform: { position: [0, 0.003, 0], scale: [0.9, 0.42, 0.72] }, appearance: appearance(COLORS.gloveShadow, { opacity: 0.28, roughness: 0.52 }) }),
      node({ id: `${side}-${finger.name}-finger`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.finger.${finger.name}.${side}`, geometry: { type: "tapered-cylinder-between", start: [0, 0, 0], end: [finger.bend, 0, finger.length * 0.58], startRadius: finger.radius, endRadius: Number((finger.radius * 0.86).toFixed(5)), radialSegments: 8 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
      node({ id: `${side}-${finger.name}-finger-distal`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.finger-distal.${finger.name}.${side}`, geometry: { type: "tapered-cylinder-between", start: [finger.bend, 0, finger.length * 0.58], end: [finger.bend * 1.8, -0.004, finger.length], startRadius: Number((finger.radius * 0.84).toFixed(5)), endRadius: Number((finger.radius * 0.64).toFixed(5)), radialSegments: 8 }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
      node({ id: `${side}-${finger.name}-tip`, parent: `${side}-${finger.name}-finger-pivot`, semanticType: `character.human.hand.fingertip.${finger.name}.${side}`, geometry: { type: "sphere", radius: finger.radius * 0.78, segments: 8 }, transform: { position: [finger.bend * 1.8, -0.004, finger.length + 0.002], scale: [0.82, 0.62, 0.9] }, appearance: appearance(COLORS.glove, { roughness: 0.5 }) }),
    );
  }
  return nodes.map((item) => scaledNode(item, scale));
}

function buildFootPartNodes(side = "right", scale = 1) {
  const sign = side === "left" ? -1 : 1;
  const nodes = [
    node({ id: `${side}-foot-root`, semanticType: `character.human.part.foot.${side}.root`, transform: { position: [0, 0, 0] }, metadata: { humanPart: "foot", side, generatedBy: HUMAN_SURFACE_METHOD, modulePose: "standing-foot-readable" } }),
    node({ id: `${side}-ankle-pivot`, parent: `${side}-foot-root`, semanticType: `character.human.rig.pivot.ankle.${side}`, transform: { position: [0, 0.015, -0.035], rotation: [0, 0, 0] } }),
    node({ id: `${side}-ankle-collar`, parent: `${side}-foot-root`, semanticType: `character.human.foot.ankle-collar.${side}`, geometry: { type: "lofted-surface", sections: [
      { id: "collar-bottom", center: [sign * 0.004, -0.028, -0.04], ...xySectionAxes(0.043, 0.019), profile: BOOT_PROFILE },
      { id: "collar-top", center: [sign * 0.004, 0.05, -0.044], ...xySectionAxes(0.037, 0.017), profile: BOOT_PROFILE },
    ], radialSegments: 10, capStart: true, capEnd: true }, appearance: appearance(COLORS.boot, { roughness: 0.72, flatShading: true }) }),
    node({ id: `${side}-shoe`, parent: `${side}-foot-root`, semanticType: `character.human.foot.shoe.${side}`, geometry: loftedProfile([
      ["boot-heel", [sign * 0.004, -0.046, -0.071], 0.043, 0.025, "heel volume", undefined, xySectionAxes(0.043, 0.025)],
      ["boot-arch", [sign * 0.006, -0.046, 0.02], 0.056, 0.031, "boot arch and instep", undefined, xySectionAxes(0.056, 0.031)],
      ["boot-ball", [sign * 0.008, -0.043, 0.105], 0.058, 0.03, "ball of foot", undefined, xySectionAxes(0.058, 0.03)],
      ["boot-toe", [sign * 0.008, -0.043, 0.175], 0.049, 0.027, "rounded toe box", undefined, xySectionAxes(0.049, 0.027)],
      ["boot-front", [sign * 0.008, -0.046, 0.22], 0.032, 0.019, "toe front taper", undefined, xySectionAxes(0.032, 0.019)],
    ], 10, BOOT_PROFILE), appearance: appearance(COLORS.boot, { roughness: 0.72, flatShading: true }) }),
    node({ id: `${side}-toe-cap`, parent: `${side}-foot-root`, semanticType: `character.human.foot.toe.${side}`, geometry: { type: "box", size: [0.082, 0.011, 0.04] }, transform: { position: [sign * 0.008, -0.012, 0.178] }, appearance: appearance(COLORS.bootToe, { opacity: 0.68, roughness: 0.72 }) }),
    node({ id: `${side}-boot-sole`, parent: `${side}-foot-root`, semanticType: `character.human.foot.boot-sole.${side}`, geometry: { type: "box", size: [0.124, 0.015, 0.31] }, transform: { position: [sign * 0.008, -0.078, 0.075] }, appearance: appearance(COLORS.bootSole, { roughness: 0.78 }) }),
    node({ id: `${side}-heel-block`, parent: `${side}-foot-root`, semanticType: `character.human.foot.heel.${side}`, geometry: { type: "box", size: [0.092, 0.034, 0.068] }, transform: { position: [sign * 0.008, -0.062, -0.06] }, appearance: appearance("#8a6338", { roughness: 0.78 }) }),
    node({ id: `${side}-boot-side-panel`, parent: `${side}-foot-root`, semanticType: `character.human.foot.boot-side-panel.${side}`, geometry: { type: "box", size: [0.005, 0.04, 0.14] }, transform: { position: [sign * 0.064, -0.035, 0.05], rotation: [0, 0, sign * 0.04] }, appearance: appearance("#b68142", { opacity: 0.62, roughness: 0.72 }) }),
    node({ id: `${side}-boot-lace-a`, parent: `${side}-foot-root`, semanticType: `character.human.foot.boot-lace.${side}`, geometry: { type: "box", size: [0.069, 0.0045, 0.006] }, transform: { position: [sign * 0.008, -0.009, 0.052], rotation: [0, -sign * 0.42, 0] }, appearance: appearance("#f2e2b5", { roughness: 0.65 }) }),
    node({ id: `${side}-boot-lace-b`, parent: `${side}-foot-root`, semanticType: `character.human.foot.boot-lace.${side}`, geometry: { type: "box", size: [0.063, 0.0045, 0.006] }, transform: { position: [sign * 0.008, -0.007, 0.079], rotation: [0, sign * 0.36, 0] }, appearance: appearance("#f2e2b5", { roughness: 0.65 }) }),
    node({ id: `${side}-boot-lace-c`, parent: `${side}-foot-root`, semanticType: `character.human.foot.boot-lace.${side}`, geometry: { type: "box", size: [0.056, 0.0045, 0.006] }, transform: { position: [sign * 0.008, -0.006, 0.105], rotation: [0, -sign * 0.28, 0] }, appearance: appearance("#f2e2b5", { roughness: 0.65 }) }),
  ].map((item) => scaledNode(item, scale));
  return nodes;
}

function headPartAnchors(scale = 1) {
  return {
    "head-top": { node: "safety-helmet-shell", position: vec([0, 0.162, 0], scale), direction: [0, 1, 0], kind: "height-top" },
    "eye-forward": { node: "head-pivot", position: vec([0, 0.024, 0.108], scale), direction: [0, 0, 1], kind: "gaze-forward" },
    "neck-base": { node: "neck", position: vec([0, -0.18, -0.006], scale), direction: [0, -1, 0], kind: "joint" },
  };
}

function handPartAnchors(side = "right", scale = 1) {
  const sign = side === "left" ? -1 : 1;
  const anchors = {
    [`${side}-wrist`]: { node: `${side}-wrist-pivot`, position: [0, 0, 0], direction: [0, 0, -1], kind: "joint" },
    [`${side}-hand-grip`]: { node: `${side}-hand`, position: vec([0, 0.018, 0.02], scale), direction: [0, 1, 0], kind: "hand-grip" },
    "hand-grip": { node: `${side}-hand`, position: vec([0, 0.018, 0.02], scale), direction: [0, 1, 0], kind: "hand-grip" },
    [`${side}-thumb-tip`]: { node: `${side}-thumb-tip`, position: [0, 0, 0], direction: [sign, 0, 1], kind: "fingertip" },
    "thumb-tip": { node: `${side}-thumb-tip`, position: [0, 0, 0], direction: [sign, 0, 1], kind: "fingertip" },
  };
  for (const finger of ["index", "middle", "ring", "little"]) {
    anchors[`${side}-${finger}-tip`] = { node: `${side}-${finger}-tip`, position: [0, 0, 0], direction: [0, 0, 1], kind: "fingertip" };
    anchors[`${finger}-tip`] = { node: `${side}-${finger}-tip`, position: [0, 0, 0], direction: [0, 0, 1], kind: "fingertip" };
  }
  return anchors;
}

function footPartAnchors(side = "right", scale = 1) {
  return {
    [`${side}-ankle`]: { node: `${side}-ankle-pivot`, position: [0, 0, 0], direction: [0, 1, 0], kind: "joint" },
    "ankle-joint": { node: `${side}-ankle-pivot`, position: [0, 0, 0], direction: [0, 1, 0], kind: "joint" },
    [`${side}-foot-contact`]: { node: `${side}-boot-sole`, position: vec([0, -0.0075, 0], scale), direction: [0, -1, 0], kind: "ground-contact" },
    "foot-contact": { node: `${side}-boot-sole`, position: vec([0, -0.0075, 0], scale), direction: [0, -1, 0], kind: "ground-contact" },
    "toe-forward": { node: `${side}-shoe`, position: vec([0, 0, 0.22], scale), direction: [0, 0, 1], kind: "orientation" },
  };
}

function getHumanDocument(document) {
  return document?.editor?.document ?? document;
}

function nodeMap(nodes) {
  return new Map((nodes ?? []).map((item) => [item.id, item]));
}

function hasGeometry(map, id, type) {
  const actual = map.get(id)?.geometry?.type;
  return type ? actual === type : Boolean(actual);
}

function countMatching(nodes, predicate) {
  return nodes.filter(predicate).length;
}

function qualityGate(id, passed, weight, message) {
  return { id, passed, weight, message };
}

function scoreGates(gates) {
  const total = gates.reduce((sum, gate) => sum + gate.weight, 0);
  const passed = gates.filter((gate) => gate.passed).reduce((sum, gate) => sum + gate.weight, 0);
  return total ? Number((passed / total).toFixed(3)) : 0;
}

function ratingForScore(score) {
  if (score >= 0.9) return "usable-baseline";
  if (score >= 0.72) return "needs-visual-review";
  return "below-human-modeling-bar";
}

function inferHumanQualityTarget(document, nodes) {
  const metricPart = document?.parameters?.metrics?.humanPart;
  if (metricPart) return metricPart;
  if (nodes.some((item) => item.id === "head-root")) return "head";
  if (nodes.some((item) => item.id.endsWith("-hand-root"))) return "hand";
  if (nodes.some((item) => item.id.endsWith("-foot-root"))) return "foot";
  return "human";
}

export function analyzeHumanModelQuality(document = {}) {
  const target = getHumanDocument(document);
  const nodes = target?.parameters?.nodes ?? [];
  if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError("human model quality analysis requires a composition document with nodes");
  const map = nodeMap(nodes);
  const anchors = target?.parameters?.anchors ?? {};
  const qualityTarget = inferHumanQualityTarget(target, nodes);
  const gates = [];

  if (qualityTarget === "head") {
    gates.push(
      qualityGate("head-root", map.has("head-root"), 1, "head module has an explicit root"),
      qualityGate("head-surface", hasGeometry(map, "head", "lofted-surface"), 2, "head is modeled as a lofted surface, not a sphere only"),
      qualityGate("facial-relief", hasGeometry(map, "nose", "lofted-surface") && map.has("left-cheek-facet") && map.has("right-cheek-facet"), 2, "nose and cheek relief are present"),
      qualityGate("eyes-and-gaze", map.has("left-eye") && map.has("right-eye") && Boolean(anchors["eye-forward"]), 1.5, "eyes and gaze anchor are present"),
      qualityGate("head-equipment-layer", hasGeometry(map, "safety-helmet-shell", "lofted-surface"), 1, "helmet/equipment layer is separated from head surface"),
      qualityGate("head-density", nodes.length >= 22, 1, "head module has enough editable semantic nodes"),
    );
  } else if (qualityTarget === "hand") {
    const distalCount = countMatching(nodes, (item) => item.id.includes("finger-distal"));
    const tipAnchorCount = countMatching(Object.keys(anchors), (id) => id.endsWith("-tip") || id === "thumb-tip");
    gates.push(
      qualityGate("hand-root", nodes.some((item) => item.id.endsWith("-hand-root")), 1, "hand module has an explicit root"),
      qualityGate("palm-surface", nodes.some((item) => item.id.endsWith("-hand") && item.geometry?.type === "lofted-surface"), 2, "palm is modeled as a lofted surface"),
      qualityGate("finger-count", countMatching(nodes, (item) => item.id.includes("-finger-pivot")) >= 4, 2, "four non-thumb finger pivots are present"),
      qualityGate("finger-segments", distalCount >= 4, 2, "fingers have proximal and distal segments"),
      qualityGate("thumb-chain", nodes.some((item) => item.id.endsWith("-thumb-distal")) && nodes.some((item) => item.id.endsWith("-thumb-tip")), 1.5, "thumb has a separate distal segment and tip"),
      qualityGate("grip-and-tip-anchors", Boolean(anchors["hand-grip"]) && tipAnchorCount >= 5, 1.5, "grip and fingertip anchors are present"),
      qualityGate("hand-density", nodes.length >= 28, 1, "hand module has enough editable semantic nodes"),
    );
  } else if (qualityTarget === "foot") {
    const laceCount = countMatching(nodes, (item) => item.id.includes("boot-lace"));
    gates.push(
      qualityGate("foot-root", nodes.some((item) => item.id.endsWith("-foot-root")), 1, "foot module has an explicit root"),
      qualityGate("shoe-surface", nodes.some((item) => item.id.endsWith("-shoe") && item.geometry?.type === "lofted-surface"), 2, "shoe is modeled as an axis-lofted surface"),
      qualityGate("ankle-collar", nodes.some((item) => item.id.endsWith("-ankle-collar") && item.geometry?.type === "lofted-surface"), 1.5, "ankle collar/upper boot layer is present"),
      qualityGate("sole-heel-toe", nodes.some((item) => item.id.endsWith("-boot-sole")) && nodes.some((item) => item.id.endsWith("-heel-block")) && nodes.some((item) => item.id.endsWith("-toe-cap")), 2, "sole, heel, and toe cap are present"),
      qualityGate("laces", laceCount >= 3, 1, "multiple lace details are present"),
      qualityGate("contact-anchors", Boolean(anchors["foot-contact"]) && Boolean(anchors["toe-forward"]), 1.5, "ground contact and toe direction anchors are present"),
      qualityGate("foot-density", nodes.length >= 10, 1, "foot module has enough editable semantic nodes"),
    );
  } else {
    gates.push(
      qualityGate("full-human-scale", target?.parameters?.metrics?.standingHeight >= 1.5 && target?.parameters?.metrics?.standingHeight <= 2.1, 1, "standing height is realistic"),
      qualityGate("no-model-import", nodes.every((item) => item.geometry?.type !== "model"), 2, "human does not rely on imported mesh geometry"),
      qualityGate("head-surface", hasGeometry(map, "head", "lofted-surface") && hasGeometry(map, "nose", "lofted-surface"), 2, "head and nose use human surface geometry"),
      qualityGate("torso-surface", hasGeometry(map, "chest", "lofted-surface") && hasGeometry(map, "abdomen", "lofted-surface"), 2, "torso uses lofted human surfaces"),
      qualityGate("hands", hasGeometry(map, "left-hand", "lofted-surface") && hasGeometry(map, "right-hand", "lofted-surface") && Boolean(anchors["right-hand-grip"]), 2, "hands use palm surfaces and grip anchors"),
      qualityGate("feet", hasGeometry(map, "left-shoe", "lofted-surface") && hasGeometry(map, "right-shoe", "lofted-surface") && Boolean(anchors["right-foot-contact"]), 2, "feet use lofted footwear and contact anchors"),
      qualityGate("pose-rig-separated", target?.parameters?.metrics?.poseMethod === "character.human-pose-rig", 1.5, "pose responsibility is separated from visible surface"),
      qualityGate("semantic-density", nodes.length >= 120, 1, "complete human has enough editable semantic source nodes"),
    );
  }

  const score = scoreGates(gates);
  return {
    kind: "human-model-quality-analysis",
    target: qualityTarget,
    rating: ratingForScore(score),
    score,
    gates,
    failures: gates.filter((gate) => !gate.passed).map((gate) => ({ id: gate.id, message: gate.message })),
    facts: {
      nodeCount: nodes.length,
      geometryTypes: [...new Set(nodes.map((item) => item.geometry?.type).filter(Boolean))].sort(),
      anchorCount: Object.keys(anchors).length,
      generatedBy: HUMAN_SURFACE_METHOD,
    },
    limitation: "This is a structural and semantic quality gate; it does not replace human visual review for likeness, anatomy, or style.",
  };
}

export function generateHumanPart(request = {}) {
  const part = validateHumanPart(request.part ?? "head");
  const side = part === "head" ? undefined : validateSide(request.side ?? "right");
  const height = validateHeight(request.height ?? DEFAULT_HEIGHT);
  const scale = height / DEFAULT_HEIGHT;
  const id = request.id ?? (part === "head" ? "human-head-module" : `human-${side}-${part}-module`);
  const title = request.title ?? (part === "head" ? "Human head module" : `Human ${side} ${part} module`);
  const nodes = part === "head" ? buildHeadPartNodes(scale) : part === "hand" ? buildHandPartNodes(side, scale) : buildFootPartNodes(side, scale);
  const anchors = part === "head" ? headPartAnchors(scale) : part === "hand" ? handPartAnchors(side, scale) : footPartAnchors(side, scale);
  return {
    kind: "human-part-geometry",
    method: HUMAN_SURFACE_METHOD,
    part,
    ...(side ? { side } : {}),
    composition: {
      id,
      title,
      component: "core.composition",
      parameters: {
        nodes,
        anchors,
        relations: partRelations(part, side),
        metrics: {
          standingHeightReference: height,
          humanPart: part,
          ...(side ? { side } : {}),
          generatedBy: HUMAN_SURFACE_METHOD,
          reusableAs: part === "head" ? "head module for human compositions" : `${part} module for mirrored human compositions`,
        },
        annotations: partAnnotations(part, side, scale),
      },
    },
    facts: {
      nodeCount: nodes.length,
      anchorCount: Object.keys(anchors).length,
      geometryTypes: [...new Set(nodes.map((item) => item.geometry?.type).filter(Boolean))].sort(),
      rendererNeutral: true,
      noGlb: true,
    },
  };
}

export function generateLowPolyWorkerHuman(request = {}) {
  const height = validateHeight(request.height ?? DEFAULT_HEIGHT);
  const scale = height / DEFAULT_HEIGHT;
  const id = request.id ?? "low-poly-worker-human";
  const surfaceProfile = createHumanSurfaceProfile({ height, profile: "low-poly-worker" });
  const nodes = lowPolyWorkerSurfaceNodes(scale).map((item) => ({
    ...item,
    metadata: {
      ...item.metadata,
      generatedBy: HUMAN_SURFACE_METHOD,
      surfaceProfile: "low-poly-worker",
      surfaceRole: item.semanticType,
    },
  }));
  return {
    kind: "human-geometry-surface",
    method: HUMAN_SURFACE_METHOD,
    composition: {
      id,
      title: request.title ?? "Low-poly worker human",
      component: "core.composition",
      parameters: {
        nodes,
        anchors: lowPolyWorkerAnchors(scale),
        relations: lowPolyWorkerRelations(),
        surfaceProfile,
        metrics: {
          standingHeight: height,
          shoulderWidth: scalar(0.504, scale),
          stanceWidth: scalar(0.23, scale),
          eyeHeight: scalar(1.607, scale),
          surfaceProfile: "low-poly-worker",
          surfaceProfileMethod: HUMAN_SURFACE_METHOD,
          poseMethod: "character.human-pose-rig",
          handDetailLevel: "palm-thumb-four-fingers-with-finger-pivots",
          fingerTipAnchorCount: 10,
          generatedBy: HUMAN_SURFACE_METHOD,
        },
        animations: [
          { id: "right-arm-wave-preview", target: "right-elbow-pivot", property: "rotation", from: [0, 0, -0.25], to: [0, 0, -0.85], duration: 1.4, loop: true, space: "local" },
          { id: "head-look-preview", target: "head-pivot", property: "rotation", from: [0, -0.2, 0], to: [0, 0.2, 0], duration: 2.2, loop: true, space: "local" },
        ],
        annotations: [
          { id: "human-scale-note", text: `${height.toFixed(2)}m real human scale reference`, position: vec([0.16, 1.48, -0.22], scale), color: "#b8ff4d" },
          { id: "human-section-profile-note", text: "Human section profile controls chest/waist/limb proportions", position: vec([0.58, 1.2, 0.24], scale), color: "#69d9d3" },
          { id: "human-hand-detail-note", text: "Palm, thumb, four fingers, and fingertip anchors are semantic editable nodes", position: vec([0.56, 0.98, 0.34], scale), color: "#f0d879" },
        ],
      },
    },
    facts: {
      nodeCount: nodes.length,
      height,
      profileSectionCount: surfaceProfile.sections.length,
      generatedGeometryTypes: [...new Set(nodes.map((item) => item.geometry?.type).filter(Boolean))].sort(),
      fingertipAnchorCount: 10,
      rigCompatible: true,
    },
    limitations: [
      "This method generates a low-poly editable human surface from primitives; it is not a scanned mesh or anatomical simulation.",
      "Clothing wrinkles, facial expression, and body deformation should be layered by follow-up methods when needed.",
    ],
  };
}

function lowPolySurfacePatch(scale = 1) {
  return new Map(lowPolyWorkerSurfaceNodes(scale)
    .filter((item) => item.geometry || item.transform || item.appearance || item.semanticType)
    .map((item) => [item.id, {
      ...item,
      metadata: {
        ...(item.metadata ?? {}),
        generatedBy: HUMAN_SURFACE_METHOD,
        surfaceProfile: "low-poly-worker",
        surfaceRole: item.semanticType,
      },
    }]));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function sameJson(a, b) {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
}

function refinementScale(target, request) {
  const height = request.height ?? target?.parameters?.metrics?.standingHeight ?? DEFAULT_HEIGHT;
  return validateHeight(height) / DEFAULT_HEIGHT;
}

export function proposeHumanSurfaceRefinement(document, request = {}) {
  const target = document?.editor?.document ?? document;
  if (!target?.parameters?.nodes) throw new TypeError("human surface refinement requires a core.composition editor document");
  const profile = request.profile ?? "low-poly-worker";
  if (profile !== "low-poly-worker") throw new TypeError(`Unknown human surface profile: ${profile}`);
  const patch = lowPolySurfacePatch(refinementScale(target, request));
  const changes = [];
  const existingNodeIds = new Set(target.parameters.nodes.map((item) => item.id));
  const skippedNodeIds = [];
  const addedNodeIds = [];
  const addMissing = request.addMissing === true;

  for (const sourceNode of target.parameters.nodes) {
    const afterNode = patch.get(sourceNode.id);
    if (!afterNode) continue;
    const subset = {};
    const before = {};
    for (const field of ["geometry", "transform", "appearance", "semanticType"]) {
      if (afterNode[field] !== undefined && !sameJson(sourceNode[field], afterNode[field])) {
        subset[field] = clone(afterNode[field]);
        before[field] = clone(sourceNode[field] ?? null);
      }
    }
    if (Object.keys(subset).length > 0) {
      changes.push({
        operation: "update-composition-node",
        nodeId: sourceNode.id,
        before,
        after: {
          ...subset,
          metadata: {
            ...(sourceNode.metadata ?? {}),
            ...(afterNode.metadata ?? {}),
          },
        },
      });
    }
  }

  for (const [nodeId, afterNode] of patch.entries()) {
    if (existingNodeIds.has(nodeId)) continue;
    if (addMissing) {
      changes.push({
        operation: "add-composition-node",
        nodeId,
        before: null,
        after: clone(afterNode),
      });
      addedNodeIds.push(nodeId);
    } else {
      skippedNodeIds.push(nodeId);
    }
  }

  return {
    kind: "changeset-proposal",
    intent: "human-surface-refinement",
    method: HUMAN_SURFACE_METHOD,
    applied: false,
    summary: `Apply ${profile} human surface geometry to ${changes.length} composition node change(s).`,
    changes,
    facts: {
      profile,
      changedNodeIds: changes.filter((item) => item.operation !== "add-composition-node").map((item) => item.nodeId),
      addedNodeIds,
      skippedNodeIds,
      addMissing,
      generatedBy: HUMAN_SURFACE_METHOD,
    },
    warnings: skippedNodeIds.length ? [{ code: "missing-surface-node", nodeIds: skippedNodeIds, message: "Some generated surface nodes do not exist in the target composition and were skipped. Use addMissing=true to propose adding them." }] : [],
    limitations: [
      "The proposal updates or optionally adds semantic surface nodes; it does not solve pose or inverse kinematics.",
      "Pose, IK, and grasp behavior remain owned by character.human-pose-rig.",
    ],
  };
}

export function applyHumanSurfaceRefinement(document, request = {}) {
  return applyCompositionChangesetProposal(document, proposeHumanSurfaceRefinement(document, request));
}
