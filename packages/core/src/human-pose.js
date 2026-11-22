import { assertVec3, length, normalizeVector, subtract } from "./math.js";
import { compileCompositionSpec } from "./composition.js";

export const DEFAULT_HUMAN_JOINT_ANCHORS = [
  "head-top",
  "eye-forward",
  "neck-base",
  "left-shoulder",
  "right-shoulder",
  "left-elbow",
  "right-elbow",
  "left-wrist",
  "right-wrist",
  "left-hand-grip",
  "right-hand-grip",
  "left-hip",
  "right-hip",
  "left-knee",
  "right-knee",
  "left-ankle",
  "right-ankle",
  "left-foot-contact",
  "right-foot-contact",
];

export const DEFAULT_HUMAN_OPTIONAL_JOINT_ANCHORS = [
  "left-thumb-tip",
  "right-thumb-tip",
  "left-index-tip",
  "right-index-tip",
  "left-middle-tip",
  "right-middle-tip",
  "left-ring-tip",
  "right-ring-tip",
  "left-little-tip",
  "right-little-tip",
];

export const DEFAULT_HUMAN_BONES = [
  { id: "spine", chain: "spine", side: "center", from: "pelvis-center", to: "shoulder-center" },
  { id: "neck", chain: "spine", side: "center", from: "shoulder-center", to: "neck-base" },
  { id: "head", chain: "spine", side: "center", from: "neck-base", to: "head-top" },
  { id: "left-upper-arm", chain: "left-arm", side: "left", from: "left-shoulder", to: "left-elbow" },
  { id: "left-forearm", chain: "left-arm", side: "left", from: "left-elbow", to: "left-wrist" },
  { id: "left-hand", chain: "left-arm", side: "left", from: "left-wrist", to: "left-hand-grip" },
  { id: "right-upper-arm", chain: "right-arm", side: "right", from: "right-shoulder", to: "right-elbow" },
  { id: "right-forearm", chain: "right-arm", side: "right", from: "right-elbow", to: "right-wrist" },
  { id: "right-hand", chain: "right-arm", side: "right", from: "right-wrist", to: "right-hand-grip" },
  { id: "left-thigh", chain: "left-leg", side: "left", from: "left-hip", to: "left-knee" },
  { id: "left-lower-leg", chain: "left-leg", side: "left", from: "left-knee", to: "left-ankle" },
  { id: "left-foot", chain: "left-leg", side: "left", from: "left-ankle", to: "left-foot-contact" },
  { id: "right-thigh", chain: "right-leg", side: "right", from: "right-hip", to: "right-knee" },
  { id: "right-lower-leg", chain: "right-leg", side: "right", from: "right-knee", to: "right-ankle" },
  { id: "right-foot", chain: "right-leg", side: "right", from: "right-ankle", to: "right-foot-contact" },
];

export const DEFAULT_HUMAN_OPTIONAL_BONES = [
  { id: "left-thumb", chain: "left-hand", side: "left", from: "left-hand-grip", to: "left-thumb-tip" },
  { id: "left-index-finger", chain: "left-hand", side: "left", from: "left-hand-grip", to: "left-index-tip" },
  { id: "left-middle-finger", chain: "left-hand", side: "left", from: "left-hand-grip", to: "left-middle-tip" },
  { id: "left-ring-finger", chain: "left-hand", side: "left", from: "left-hand-grip", to: "left-ring-tip" },
  { id: "left-little-finger", chain: "left-hand", side: "left", from: "left-hand-grip", to: "left-little-tip" },
  { id: "right-thumb", chain: "right-hand", side: "right", from: "right-hand-grip", to: "right-thumb-tip" },
  { id: "right-index-finger", chain: "right-hand", side: "right", from: "right-hand-grip", to: "right-index-tip" },
  { id: "right-middle-finger", chain: "right-hand", side: "right", from: "right-hand-grip", to: "right-middle-tip" },
  { id: "right-ring-finger", chain: "right-hand", side: "right", from: "right-hand-grip", to: "right-ring-tip" },
  { id: "right-little-finger", chain: "right-hand", side: "right", from: "right-hand-grip", to: "right-little-tip" },
];

const DEFAULT_SYMMETRY_PAIRS = [
  ["left-shoulder", "right-shoulder"],
  ["left-elbow", "right-elbow"],
  ["left-wrist", "right-wrist"],
  ["left-hand-grip", "right-hand-grip"],
  ["left-hip", "right-hip"],
  ["left-knee", "right-knee"],
  ["left-ankle", "right-ankle"],
  ["left-foot-contact", "right-foot-contact"],
  ["left-thumb-tip", "right-thumb-tip"],
  ["left-index-tip", "right-index-tip"],
  ["left-middle-tip", "right-middle-tip"],
  ["left-ring-tip", "right-ring-tip"],
  ["left-little-tip", "right-little-tip"],
];

const DEFAULT_BONE_SYMMETRY_PAIRS = [
  ["left-upper-arm", "right-upper-arm"],
  ["left-forearm", "right-forearm"],
  ["left-hand", "right-hand"],
  ["left-thigh", "right-thigh"],
  ["left-lower-leg", "right-lower-leg"],
  ["left-foot", "right-foot"],
];

const PRESET_ROTATIONS = {
  "right-arm-wave": {
    "right-shoulder-pivot": [0, 0, -0.18],
    "right-elbow-pivot": [0, 0, -0.85],
    "right-wrist-pivot": [0, 0, 0.18],
  },
  "left-arm-wave": {
    "left-shoulder-pivot": [0, 0, 0.18],
    "left-elbow-pivot": [0, 0, 0.85],
    "left-wrist-pivot": [0, 0, -0.18],
  },
  "look-left": {
    "head-pivot": [0, 0.35, 0],
  },
  "look-right": {
    "head-pivot": [0, -0.35, 0],
  },
  "right-hand-reach": {
    "right-shoulder-pivot": [-0.65, 0, -0.28],
    "right-elbow-pivot": [0, 0, -0.28],
    "right-wrist-pivot": [0, 0, 0.08],
  },
  "left-hand-reach": {
    "left-shoulder-pivot": [-0.65, 0, 0.28],
    "left-elbow-pivot": [0, 0, 0.28],
    "left-wrist-pivot": [0, 0, -0.08],
  },
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const IK_SOLVER = "two-bone-ik-lite";
const HAND_GRASP_SOLVER = "hand-grasp-pose-lite";
const HAND_FINGERS = ["thumb", "index", "middle", "ring", "little"];
const GRASP_ALIASES = {
  grip: "power-grip",
  power: "power-grip",
  "power_grip": "power-grip",
  "power-grasp": "power-grip",
  grab: "power-grip",
};
const GRASP_PROFILES = {
  open: {
    description: "open hand with straight fingers",
    fingers: { thumb: 0, index: 0, middle: 0, ring: 0, little: 0 },
    thumbOpposition: 0,
  },
  relaxed: {
    description: "slightly curled resting hand",
    fingers: { thumb: -0.12, index: -0.18, middle: -0.2, ring: -0.22, little: -0.24 },
    thumbOpposition: 0.18,
  },
  point: {
    description: "index finger extended while other fingers curl",
    fingers: { thumb: -0.35, index: -0.05, middle: -0.92, ring: -0.94, little: -0.88 },
    thumbOpposition: 0.35,
  },
  pinch: {
    description: "thumb and index partially close for a small target",
    fingers: { thumb: -0.52, index: -0.42, middle: -0.72, ring: -0.74, little: -0.68 },
    thumbOpposition: 0.62,
  },
  "power-grip": {
    description: "all fingers close around a handle-like target",
    fingers: { thumb: -0.78, index: -1.05, middle: -1.1, ring: -1.08, little: -1 },
    thumbOpposition: 0.76,
  },
};

function sideFor(id) {
  if (id.startsWith("left-")) return "left";
  if (id.startsWith("right-")) return "right";
  return "center";
}

function normalizeRequestedSide(side) {
  if (side === undefined || side === null || side === "auto") return undefined;
  return side;
}

function sourceFrom(input, { space = "local" } = {}) {
  if (!input || typeof input !== "object") throw new TypeError("human pose input must be an object");
  if (input.anchors?.definitions) {
    return {
      nodes: input.nodes ?? [],
      anchors: space === "world" && input.anchors.worldDefinitions ? input.anchors.worldDefinitions : input.anchors.definitions,
      relations: input.relations ?? [],
      metrics: input.metrics ?? {},
      document: null,
    };
  }
  const document = input.editor?.document ?? (input.component === "core.composition" ? input : null);
  const parameters = document?.parameters ?? (Array.isArray(input.nodes) ? input : null);
  if (!parameters?.nodes) throw new TypeError("human pose input requires a core.composition document, parameters object, or compiled build");
  const compiled = compileCompositionSpec(parameters, { instanceId: document?.id ?? "human" });
  return {
    nodes: compiled.nodes,
    anchors: compiled.anchors ?? {},
    relations: compiled.relations ?? [],
    metrics: compiled.metrics ?? {},
    document,
  };
}

function anchorPosition(definition) {
  if (Array.isArray(definition)) return assertVec3(definition, "anchor");
  if (!definition?.position) return null;
  return assertVec3(definition.position, "anchor.position");
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function addJoint(joints, id, position, extra = {}) {
  if (!position) return;
  joints[id] = {
    id,
    side: sideFor(id),
    position,
    ...extra,
  };
}

function addVirtualMidpoint(joints, id, leftId, rightId, role) {
  const left = joints[leftId];
  const right = joints[rightId];
  if (!left || !right) return;
  addJoint(joints, id, midpoint(left.position, right.position), { side: "center", virtual: true, role, from: [leftId, rightId] });
}

function buildJoints(anchors, required, warnings) {
  const joints = {};
  for (const id of required) {
    const definition = anchors[id];
    if (!definition) {
      warnings.push({ code: "missing-joint-anchor", anchor: id, message: `Missing human joint anchor: ${id}` });
      continue;
    }
    addJoint(joints, id, anchorPosition(definition), {
      sourceAnchor: id,
      kind: Array.isArray(definition) ? undefined : definition.kind,
      direction: Array.isArray(definition) ? undefined : definition.direction,
    });
  }
  addVirtualMidpoint(joints, "shoulder-center", "left-shoulder", "right-shoulder", "shoulder-center");
  addVirtualMidpoint(joints, "pelvis-center", "left-hip", "right-hip", "pelvis-center");
  addVirtualMidpoint(joints, "foot-center", "left-foot-contact", "right-foot-contact", "foot-center");
  return joints;
}

function addOptionalJoints(joints, anchors, optional) {
  for (const id of optional) {
    const definition = anchors[id];
    if (!definition) continue;
    addJoint(joints, id, anchorPosition(definition), {
      sourceAnchor: id,
      kind: Array.isArray(definition) ? undefined : definition.kind,
      direction: Array.isArray(definition) ? undefined : definition.direction,
      optional: true,
    });
  }
}

function boneFromDefinition(joints, definition, warnings) {
  const from = joints[definition.from];
  const to = joints[definition.to];
  if (!from || !to) {
    warnings.push({ code: "missing-bone-joint", bone: definition.id, from: definition.from, to: definition.to, message: `Cannot resolve bone ${definition.id}` });
    return null;
  }
  const vector = subtract(to.position, from.position);
  const boneLength = length(vector);
  return {
    ...definition,
    length: boneLength,
    vector,
    direction: boneLength === 0 ? null : normalizeVector(vector, `bone.${definition.id}`),
  };
}

function optionalBoneFromDefinition(joints, definition) {
  const from = joints[definition.from];
  const to = joints[definition.to];
  if (!from || !to) return null;
  const vector = subtract(to.position, from.position);
  const boneLength = length(vector);
  return {
    ...definition,
    optional: true,
    length: boneLength,
    vector,
    direction: boneLength === 0 ? null : normalizeVector(vector, `bone.${definition.id}`),
  };
}

function chainMap(bones) {
  const chains = {};
  for (const bone of bones) {
    chains[bone.chain] ??= [];
    chains[bone.chain].push(bone.id);
  }
  return chains;
}

function symmetryFor(joints, bonesById, tolerance) {
  const jointPairs = DEFAULT_SYMMETRY_PAIRS
    .filter(([left, right]) => joints[left] && joints[right])
    .map(([left, right]) => {
      const a = joints[left].position;
      const b = joints[right].position;
      const mirrorDeviation = length([a[0] + b[0], a[1] - b[1], a[2] - b[2]]);
      return { left, right, mirrorDeviation, ok: mirrorDeviation <= tolerance };
    });
  const bonePairs = DEFAULT_BONE_SYMMETRY_PAIRS
    .filter(([left, right]) => bonesById[left] && bonesById[right])
    .map(([left, right]) => {
      const lengthDelta = Math.abs(bonesById[left].length - bonesById[right].length);
      return { left, right, lengthDelta, ok: lengthDelta <= tolerance };
    });
  const maxJointDeviation = Math.max(0, ...jointPairs.map((item) => item.mirrorDeviation));
  const maxBoneLengthDelta = Math.max(0, ...bonePairs.map((item) => item.lengthDelta));
  return {
    axis: "x",
    tolerance,
    ok: jointPairs.every((item) => item.ok) && bonePairs.every((item) => item.ok),
    maxJointDeviation,
    maxBoneLengthDelta,
    jointPairs,
    bonePairs,
  };
}

function angleBetween(a, b) {
  const na = normalizeVector(a, "angle.a");
  const nb = normalizeVector(b, "angle.b");
  const cosine = Math.max(-1, Math.min(1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]));
  return Math.acos(cosine);
}

function angleAt(joints, a, b, c) {
  if (!joints[a] || !joints[b] || !joints[c]) return null;
  const radians = angleBetween(subtract(joints[a].position, joints[b].position), subtract(joints[c].position, joints[b].position));
  return { radians, degrees: radians * 180 / Math.PI, joints: [a, b, c] };
}

function jointAngles(joints) {
  return Object.fromEntries(Object.entries({
    leftElbow: angleAt(joints, "left-shoulder", "left-elbow", "left-wrist"),
    rightElbow: angleAt(joints, "right-shoulder", "right-elbow", "right-wrist"),
    leftKnee: angleAt(joints, "left-hip", "left-knee", "left-ankle"),
    rightKnee: angleAt(joints, "right-hip", "right-knee", "right-ankle"),
  }).filter(([, value]) => value));
}

function humanMetrics(joints, bonesById) {
  const groundY = Math.min(
    joints["left-foot-contact"]?.position[1] ?? 0,
    joints["right-foot-contact"]?.position[1] ?? 0,
  );
  const fingerTips = Object.keys(joints).filter((id) => id.endsWith("-tip"));
  return {
    height: joints["head-top"] ? joints["head-top"].position[1] - groundY : null,
    eyeHeight: joints["eye-forward"] ? joints["eye-forward"].position[1] - groundY : null,
    shoulderWidth: joints["left-shoulder"] && joints["right-shoulder"] ? length(subtract(joints["right-shoulder"].position, joints["left-shoulder"].position)) : null,
    stanceWidth: joints["left-foot-contact"] && joints["right-foot-contact"] ? length(subtract(joints["right-foot-contact"].position, joints["left-foot-contact"].position)) : null,
    handDetail: {
      fingerTipCount: fingerTips.length,
      leftFingerTipCount: fingerTips.filter((id) => id.startsWith("left-")).length,
      rightFingerTipCount: fingerTips.filter((id) => id.startsWith("right-")).length,
    },
    boneLengths: Object.fromEntries(Object.entries(bonesById).map(([id, bone]) => [id, bone.length])),
  };
}

export function analyzeHumanPoseRig(input, options = {}) {
  const warnings = [];
  const source = sourceFrom(input, options);
  const joints = buildJoints(source.anchors, options.jointAnchors ?? DEFAULT_HUMAN_JOINT_ANCHORS, warnings);
  addOptionalJoints(joints, source.anchors, options.optionalJointAnchors ?? DEFAULT_HUMAN_OPTIONAL_JOINT_ANCHORS);
  const requiredBones = (options.bones ?? DEFAULT_HUMAN_BONES)
    .map((definition) => boneFromDefinition(joints, definition, warnings))
    .filter(Boolean);
  const optionalBones = (options.optionalBones ?? DEFAULT_HUMAN_OPTIONAL_BONES)
    .map((definition) => optionalBoneFromDefinition(joints, definition))
    .filter(Boolean);
  const bones = [...requiredBones, ...optionalBones];
  const bonesById = Object.fromEntries(bones.map((bone) => [bone.id, bone]));
  const metrics = humanMetrics(joints, bonesById);
  const symmetry = symmetryFor(joints, bonesById, options.symmetryTolerance ?? 0.035);
  const expectedHeight = options.expectedHeightRange ?? [1.2, 2.2];
  if (metrics.height !== null && (metrics.height < expectedHeight[0] || metrics.height > expectedHeight[1])) {
    warnings.push({ code: "height-out-of-range", height: metrics.height, expected: expectedHeight, message: "Human figure height is outside the expected range." });
  }
  if (!symmetry.ok) warnings.push({ code: "symmetry-deviation", symmetry, message: "Left/right human joints or bone lengths exceed symmetry tolerance." });

  return {
    kind: "human-pose-rig-analysis",
    method: "character.human-pose-rig",
    jointCount: Object.keys(joints).length,
    boneCount: bones.length,
    joints,
    bones,
    chains: chainMap(bones),
    metrics,
    jointAngles: jointAngles(joints),
    symmetry,
    source: {
      nodeCount: source.nodes.length,
      relationCount: source.relations.length,
      metricKeys: Object.keys(source.metrics),
    },
    warnings,
  };
}

function armReachCandidate(rig, side, target, tolerance) {
  const shoulder = rig.joints[`${side}-shoulder`];
  const hand = rig.joints[`${side}-hand-grip`];
  const upperArm = rig.metrics.boneLengths[`${side}-upper-arm`] ?? 0;
  const forearm = rig.metrics.boneLengths[`${side}-forearm`] ?? 0;
  const handLength = rig.metrics.boneLengths[`${side}-hand`] ?? 0;
  if (!shoulder || !hand || upperArm === 0 || forearm === 0) {
    return {
      side,
      reachable: false,
      missing: [!shoulder ? `${side}-shoulder` : null, !hand ? `${side}-hand-grip` : null].filter(Boolean),
      reason: "missing-arm-chain",
    };
  }
  const maxReach = upperArm + forearm + handLength;
  const shoulderDistance = length(subtract(target, shoulder.position));
  const currentHandDistance = length(subtract(target, hand.position));
  const overreach = Math.max(0, shoulderDistance - maxReach);
  const reachable = overreach <= tolerance;
  const reachRatio = maxReach === 0 ? Infinity : shoulderDistance / maxReach;
  return {
    side,
    reachable,
    shoulder: shoulder.position,
    currentHand: hand.position,
    target,
    upperArm,
    forearm,
    hand: handLength,
    maxReach,
    shoulderDistance,
    currentHandDistance,
    reachRatio,
    margin: maxReach - shoulderDistance,
    overreach,
    score: (reachable ? 0 : 1000 + overreach * 100) + currentHandDistance + Math.max(0, reachRatio - 0.92),
    reason: reachable ? "within-arm-chain" : "target-beyond-arm-chain",
  };
}

export function analyzeHumanReach(input, request = {}) {
  const target = assertVec3(request.target ?? request.targetPoint, "reach.target");
  const rig = analyzeHumanPoseRig(input, request);
  const tolerance = request.tolerance ?? 0.035;
  const requestedSide = normalizeRequestedSide(request.side);
  const sides = requestedSide ? [requestedSide] : ["left", "right"];
  for (const side of sides) {
    if (!["left", "right"].includes(side)) throw new TypeError("reach.side must be left or right");
  }
  const candidates = sides
    .map((side) => armReachCandidate(rig, side, target, tolerance))
    .sort((a, b) => a.score - b.score);
  const selected = candidates[0] ?? null;
  const warnings = [...rig.warnings];
  if (!selected?.reachable) {
    warnings.push({
      code: "target-unreachable",
      target,
      selectedSide: selected?.side ?? null,
      message: "The target is outside the selected arm chain reach envelope.",
    });
  }
  return {
    kind: "human-reach-analysis",
    method: "character.human-pose-rig",
    target,
    selectedSide: selected?.side ?? null,
    reachable: !!selected?.reachable,
    candidates,
    facts: {
      tolerance,
      candidateCount: candidates.length,
      bestMargin: selected?.margin ?? null,
      bestCurrentHandDistance: selected?.currentHandDistance ?? null,
      solver: "reach-envelope-analysis",
    },
    rig: {
      jointCount: rig.jointCount,
      boneCount: rig.boneCount,
      height: rig.metrics.height,
      symmetryOk: rig.symmetry.ok,
    },
    warnings,
    limitations: ["Reach analysis checks distance against the arm chain envelope; it does not solve inverse kinematics or guarantee exact hand-target contact."],
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function squaredDistance(a, b) {
  const delta = subtract(a, b);
  return delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2;
}

function defaultIkControls(side) {
  return [
    { nodeId: `${side}-shoulder-pivot`, axes: ["z", "x", "y"] },
    { nodeId: `${side}-elbow-pivot`, axes: ["z", "x"] },
  ];
}

function defaultRotationLimits(side) {
  return {
    [`${side}-shoulder-pivot`]: {
      x: [-1.7, 1.35],
      y: [-1.2, 1.2],
      z: [-1.7, 1.7],
    },
    [`${side}-elbow-pivot`]: {
      x: [-1.2, 1.2],
      y: [-0.7, 0.7],
      z: side === "right" ? [-1.85, 0.45] : [-0.45, 1.85],
    },
    [`${side}-wrist-pivot`]: {
      x: [-0.95, 0.95],
      y: [-0.95, 0.95],
      z: [-0.95, 0.95],
    },
  };
}

function limitFor(limits, nodeId, axis) {
  const value = limits?.[nodeId]?.[axis];
  return Array.isArray(value) && value.length === 2 ? value : [-Math.PI, Math.PI];
}

function nodeMap(document) {
  return new Map(document.parameters.nodes.map((node) => [node.id, node]));
}

function ensureTransform(node) {
  node.transform = {
    position: node.transform?.position ?? node.position ?? [0, 0, 0],
    rotation: node.transform?.rotation ?? [0, 0, 0],
    scale: node.transform?.scale ?? [1, 1, 1],
  };
  return node.transform;
}

function normalizeControls(document, controls, warnings) {
  const nodes = nodeMap(document);
  const available = [];
  for (const control of controls) {
    const node = nodes.get(control.nodeId);
    if (!node) {
      warnings.push({ code: "missing-ik-control-node", nodeId: control.nodeId, message: `IK control node does not exist: ${control.nodeId}` });
      continue;
    }
    ensureTransform(node);
    available.push({
      nodeId: control.nodeId,
      axes: (control.axes ?? ["x", "y", "z"]).filter((axis) => AXIS_INDEX[axis] !== undefined),
    });
  }
  return available;
}

function compiledAnchorPosition(document, anchorId) {
  const compiled = compileCompositionSpec(document.parameters, { instanceId: document.id ?? "human-ik" });
  const anchor = compiled.anchors?.[anchorId];
  if (!anchor?.position) throw new Error(`Cannot resolve IK end-effector anchor: ${anchorId}`);
  return anchor.position;
}

function evaluateIkDocument(document, anchorId, target) {
  const position = compiledAnchorPosition(document, anchorId);
  const errorSquared = squaredDistance(position, target);
  return { position, error: Math.sqrt(errorSquared), errorSquared };
}

function rotationsForControls(document, controls) {
  const nodes = nodeMap(document);
  return Object.fromEntries(controls.map((control) => [control.nodeId, [...ensureTransform(nodes.get(control.nodeId)).rotation]]));
}

function applyRotationSeed(document, rotations) {
  if (!rotations) return;
  const nodes = nodeMap(document);
  for (const [nodeId, rotation] of Object.entries(rotations)) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    ensureTransform(node).rotation = assertVec3(rotation, `seed.${nodeId}`);
  }
}

function seedDocuments(target, side, request) {
  const seeds = [{ name: "current", document: structuredClone(target) }];
  if (request.seedPreset !== false) {
    const preset = PRESET_ROTATIONS[request.seedPreset ?? `${side}-hand-reach`];
    if (preset) {
      const presetDocument = structuredClone(target);
      applyRotationSeed(presetDocument, preset);
      seeds.push({ name: request.seedPreset ?? `${side}-hand-reach`, document: presetDocument });
    }
  }
  if (request.seedRotations) {
    const seeded = structuredClone(target);
    applyRotationSeed(seeded, request.seedRotations);
    seeds.push({ name: "custom-seed", document: seeded });
  }
  return seeds;
}

function mergeRotationLimits(side, request) {
  return {
    ...defaultRotationLimits(side),
    ...(request.rotationLimits ?? {}),
  };
}

function optimizeIkSeed(seed, controls, limits, target, anchorId, request) {
  const document = seed.document;
  const nodes = nodeMap(document);
  const maxIterations = request.maxIterations ?? 56;
  const tolerance = request.tolerance ?? 0.035;
  const minStep = request.minStep ?? 0.0025;
  let step = request.initialStep ?? 0.42;
  let iterationCount = 0;
  let evaluationCount = 1;
  let current = evaluateIkDocument(document, anchorId, target);

  while (iterationCount < maxIterations && current.error > tolerance && step >= minStep) {
    let improved = false;
    for (const control of controls) {
      const node = nodes.get(control.nodeId);
      const transform = ensureTransform(node);
      for (const axis of control.axes) {
        const axisIndex = AXIS_INDEX[axis];
        const original = transform.rotation[axisIndex];
        const [min, max] = limitFor(limits, control.nodeId, axis);
        let bestAngle = original;
        let best = current;
        for (const direction of [1, -1]) {
          const candidateAngle = clamp(original + step * direction, min, max);
          if (Math.abs(candidateAngle - original) < 1e-9) continue;
          transform.rotation[axisIndex] = candidateAngle;
          const candidate = evaluateIkDocument(document, anchorId, target);
          evaluationCount += 1;
          if (candidate.errorSquared < best.errorSquared - 1e-9) {
            best = candidate;
            bestAngle = candidateAngle;
          }
        }
        transform.rotation[axisIndex] = bestAngle;
        if (best.errorSquared < current.errorSquared - 1e-9) {
          current = best;
          improved = true;
        }
      }
    }
    if (!improved) step *= 0.5;
    iterationCount += 1;
  }

  return {
    seed: seed.name,
    document,
    endEffector: current.position,
    error: current.error,
    iterations: iterationCount,
    evaluations: evaluationCount,
    rotations: rotationsForControls(document, controls),
  };
}

function solveIkForSide(target, side, request, warnings) {
  const anchorId = request.endEffector ?? `${side}-hand-grip`;
  const anchorDefinition = target.parameters.anchors?.[anchorId];
  if (!anchorDefinition || Array.isArray(anchorDefinition) || !anchorDefinition.node) {
    return {
      kind: "human-ik-lite-solution",
      method: "character.human-pose-rig",
      solver: IK_SOLVER,
      side,
      target: assertVec3(request.target ?? request.targetPoint, "ik.target"),
      endEffectorAnchor: anchorId,
      solvable: false,
      reachable: false,
      warnings: [...warnings, { code: "ik-anchor-not-node-bound", anchor: anchorId, message: "IK-lite requires a node-bound end-effector anchor so compiled transforms can be measured." }],
      limitations: ["Array/static anchors cannot move when pivot rotations are edited; expose a node-bound hand-grip anchor before requesting IK-lite."],
    };
  }

  const controls = normalizeControls(structuredClone(target), request.controls ?? defaultIkControls(side), warnings);
  if (!controls.length || controls.length < (request.controls?.length ?? defaultIkControls(side).length)) {
    return {
      kind: "human-ik-lite-solution",
      method: "character.human-pose-rig",
      solver: IK_SOLVER,
      side,
      target: assertVec3(request.target ?? request.targetPoint, "ik.target"),
      endEffectorAnchor: anchorId,
      solvable: false,
      reachable: false,
      controls,
      warnings,
      limitations: ["IK-lite requires shoulder and elbow pivot nodes to generate a reviewable two-bone arm changeset. Add wrist controls explicitly when hand orientation should also be adjusted."],
    };
  }

  const targetPoint = assertVec3(request.target ?? request.targetPoint, "ik.target");
  const initial = evaluateIkDocument(target, anchorId, targetPoint);
  const limits = mergeRotationLimits(side, request);
  const solutions = seedDocuments(target, side, request)
    .map((seed) => optimizeIkSeed(seed, controls, limits, targetPoint, anchorId, request))
    .sort((a, b) => a.error - b.error);
  const best = solutions[0];
  const tolerance = request.tolerance ?? 0.035;
  const resultWarnings = [...warnings];
  if (best.error > tolerance) {
    resultWarnings.push({
      code: "ik-residual-above-tolerance",
      residual: best.error,
      tolerance,
      message: "IK-lite improved the pose but the final hand target residual is still above tolerance.",
    });
  }

  const solution = {
    kind: "human-ik-lite-solution",
    method: "character.human-pose-rig",
    solver: IK_SOLVER,
    side,
    target: targetPoint,
    endEffectorAnchor: anchorId,
    solvable: true,
    reachable: true,
    withinTolerance: best.error <= tolerance,
    controls,
    seed: best.seed,
    initialEndEffector: initial.position,
    finalEndEffector: best.endEffector,
    initialError: initial.error,
    finalError: best.error,
    improvement: initial.error - best.error,
    rotations: best.rotations,
    facts: {
      solver: IK_SOLVER,
      search: "bounded-coordinate-descent",
      tolerance,
      seedCount: solutions.length,
      selectedSeed: best.seed,
      iterationCount: best.iterations,
      evaluationCount: solutions.reduce((sum, solution) => sum + solution.evaluations, 0),
      changedNodeIds: Object.keys(best.rotations),
    },
    warnings: resultWarnings,
    limitations: [
      "IK-lite solves only the selected arm pivot chain; it does not solve full-body balance, skin deformation, collision, or physically correct joint anatomy.",
      "The output remains a reviewable changeset proposal; inspect residual error and joint rotations before applying it to a final scene.",
    ],
  };
  Object.defineProperty(solution, "document", { value: best.document, enumerable: false });
  return solution;
}

export function solveHumanArmIkLite(document, request = {}) {
  const target = documentParameters(document);
  const normalizedRequest = { ...request, side: normalizeRequestedSide(request.side) };
  const reach = analyzeHumanReach(target, normalizedRequest);
  const side = normalizedRequest.side ?? reach.selectedSide;
  const warnings = [...reach.warnings];
  if (!side) {
    return {
      kind: "human-ik-lite-solution",
      method: "character.human-pose-rig",
      solver: IK_SOLVER,
      target: reach.target,
      solvable: false,
      reachable: false,
      warnings: [...warnings, { code: "missing-ik-side", message: "IK-lite could not select a left or right arm." }],
      limitations: ["Provide side:'left' or side:'right', or ensure reach analysis can select a side."],
    };
  }
  if (!reach.reachable && !request.allowClosest) {
    return {
      kind: "human-ik-lite-solution",
      method: "character.human-pose-rig",
      solver: IK_SOLVER,
      side,
      target: reach.target,
      solvable: false,
      reachable: false,
      candidates: reach.candidates,
      facts: {
        solver: IK_SOLVER,
        reachSolver: reach.facts.solver,
        selectedSide: side,
        reachable: false,
      },
      warnings,
      limitations: ["No IK-lite changes are emitted for unreachable targets unless allowClosest:true is provided."],
    };
  }
  const solution = solveIkForSide(target, side, normalizedRequest, warnings);
  solution.reachable = reach.reachable;
  solution.reach = reach;
  return solution;
}

function documentParameters(document) {
  const target = document?.editor?.document ?? document;
  if (target?.component !== "core.composition" || !target.parameters?.nodes) {
    throw new TypeError("pose changesets require a core.composition editor document");
  }
  return target;
}

function transformFor(node) {
  return {
    position: node.transform?.position ?? node.position ?? [0, 0, 0],
    rotation: node.transform?.rotation ?? [0, 0, 0],
    scale: node.transform?.scale ?? [1, 1, 1],
  };
}

function normalizeGraspType(value) {
  const requested = value ?? "relaxed";
  const normalized = GRASP_ALIASES[requested] ?? requested;
  if (!GRASP_PROFILES[normalized]) {
    throw new TypeError(`Unknown human grasp type: ${requested}`);
  }
  return normalized;
}

function fingerPivotNodeId(side, finger) {
  return finger === "thumb" ? `${side}-thumb-pivot` : `${side}-${finger}-finger-pivot`;
}

function thumbOppositionForSide(side, value) {
  return side === "right" ? -value : value;
}

function defaultFingerRotations(side, graspType) {
  const profile = GRASP_PROFILES[graspType];
  return Object.fromEntries(HAND_FINGERS.map((finger) => {
    const curl = profile.fingers[finger] ?? 0;
    const rotation = finger === "thumb"
      ? [curl, 0, thumbOppositionForSide(side, profile.thumbOpposition ?? 0)]
      : [curl, 0, 0];
    return [fingerPivotNodeId(side, finger), rotation];
  }));
}

function tryCompiledAnchorPosition(document, anchorId, warnings) {
  try {
    return compiledAnchorPosition(document, anchorId);
  } catch {
    warnings?.push({
      code: "missing-hand-anchor",
      anchor: anchorId,
      message: `Cannot resolve hand anchor for grasp orientation: ${anchorId}`,
    });
    return null;
  }
}

function selectHandSideForGrasp(document, request, targetPoint, warnings) {
  const requestedSide = normalizeRequestedSide(request.side);
  if (requestedSide) {
    if (!["left", "right"].includes(requestedSide)) throw new TypeError("grasp.side must be left or right");
    return requestedSide;
  }
  if (targetPoint) {
    const left = tryCompiledAnchorPosition(document, "left-hand-grip");
    const right = tryCompiledAnchorPosition(document, "right-hand-grip");
    if (left && right) return squaredDistance(left, targetPoint) <= squaredDistance(right, targetPoint) ? "left" : "right";
  }
  warnings.push({
    code: "default-grasp-side",
    side: "right",
    message: "No grasp side was provided and no target could select a hand; defaulting to the right hand.",
  });
  return "right";
}

function defaultWristOrientationRotation(document, side, targetPoint, request, warnings) {
  if (request.orientPalm === false || !targetPoint) return null;
  const anchorId = request.palmAnchor ?? `${side}-hand-grip`;
  const hand = tryCompiledAnchorPosition(document, anchorId, warnings);
  if (!hand) return null;
  const delta = subtract(targetPoint, hand);
  const distance = length(delta);
  if (distance < 1e-6) {
    warnings.push({
      code: "grasp-target-overlaps-hand",
      target: targetPoint,
      message: "The grasp target is already on the hand anchor; wrist orientation is left unchanged.",
    });
    return null;
  }
  const horizontal = Math.max(0.05, Math.hypot(delta[0], delta[2]));
  const sideSign = side === "right" ? 1 : -1;
  const pitch = clamp(-Math.atan2(delta[1], horizontal) * 0.35, -0.55, 0.55);
  const yaw = clamp(Math.atan2(delta[0] * sideSign, Math.max(0.05, Math.abs(delta[2]))) * 0.42, -0.65, 0.65);
  const roll = clamp((request.wristRoll ?? 0), -0.65, 0.65);
  return [pitch, yaw, roll];
}

export function proposeHumanGraspChangeset(document, request = {}) {
  const target = documentParameters(document);
  const warnings = [];
  const targetPoint = request.target || request.targetPoint || request.palmTarget
    ? assertVec3(request.target ?? request.targetPoint ?? request.palmTarget, "grasp.target")
    : null;
  const side = selectHandSideForGrasp(target, request, targetPoint, warnings);
  const graspType = normalizeGraspType(request.graspType ?? request.grasp);
  const nodeById = new Map(target.parameters.nodes.map((node) => [node.id, node]));
  const rotations = {
    ...defaultFingerRotations(side, graspType),
    ...(request.rotations ?? {}),
  };
  const changes = [];
  const skippedNodeIds = [];

  for (const [nodeId, rotationValue] of Object.entries(rotations)) {
    const node = nodeById.get(nodeId);
    if (!node) {
      skippedNodeIds.push(nodeId);
      warnings.push({
        code: "missing-grasp-node",
        nodeId,
        message: `Grasp target pivot node does not exist: ${nodeId}`,
      });
      continue;
    }
    const before = transformFor(node);
    const after = { ...before, rotation: assertVec3(rotationValue, `grasp.rotations.${nodeId}`) };
    changes.push({ operation: "update-composition-node-transform", nodeId, before, after });
  }

  let wristOriented = false;
  const wristNodeId = request.wristNodeId ?? `${side}-wrist-pivot`;
  const wristRotation = request.wristRotation
    ? assertVec3(request.wristRotation, "grasp.wristRotation")
    : defaultWristOrientationRotation(target, side, targetPoint, request, warnings);
  if (wristRotation) {
    const wrist = nodeById.get(wristNodeId);
    if (wrist) {
      const before = transformFor(wrist);
      const after = { ...before, rotation: wristRotation };
      changes.push({ operation: "update-composition-node-transform", nodeId: wristNodeId, before, after });
      wristOriented = true;
    } else {
      skippedNodeIds.push(wristNodeId);
      warnings.push({
        code: "missing-grasp-wrist-node",
        nodeId: wristNodeId,
        message: `Grasp wrist orientation node does not exist: ${wristNodeId}`,
      });
    }
  }

  return {
    kind: "changeset-proposal",
    intent: "human-grasp-pose",
    method: "character.human-pose-rig",
    summary: `Apply ${side} hand ${graspType} pose with ${changes.length} pivot node change(s).`,
    facts: {
      solver: HAND_GRASP_SOLVER,
      graspType,
      selectedSide: side,
      target: targetPoint,
      profile: GRASP_PROFILES[graspType].description,
      fingerPivotCount: changes.filter((change) => change.nodeId.includes("-finger-pivot") || change.nodeId.includes("-thumb-pivot")).length,
      wristOriented,
      orientationMode: wristOriented ? "palm-toward-target-lite" : "finger-curl-only",
      changedNodeIds: changes.map((change) => change.nodeId),
      skippedNodeIds,
    },
    changes,
    warnings,
    limitations: [
      "Hand-grasp-pose-lite rotates named finger and wrist pivots only; it does not solve collision, palm contact, skin deformation, or tool-specific finger wrapping.",
      "Use it after IK-lite or another reach method when the hand is already near the target, then inspect the reviewable changeset before applying it.",
    ],
    applied: false,
  };
}

export function proposeHumanPoseChangeset(document, request = {}) {
  const target = documentParameters(document);
  const nodeById = new Map(target.parameters.nodes.map((node) => [node.id, node]));
  const rotations = request.rotations ?? PRESET_ROTATIONS[request.preset ?? "right-arm-wave"];
  if (!rotations || typeof rotations !== "object") throw new TypeError("pose request requires rotations or a known preset");
  const warnings = [];
  const changes = [];
  for (const [nodeId, rotationValue] of Object.entries(rotations)) {
    const node = nodeById.get(nodeId);
    if (!node) {
      warnings.push({ code: "missing-pose-node", nodeId, message: `Pose target node does not exist: ${nodeId}` });
      continue;
    }
    const before = transformFor(node);
    const after = { ...before, rotation: assertVec3(rotationValue, `rotations.${nodeId}`) };
    changes.push({ operation: "update-composition-node-transform", nodeId, before, after });
  }
  return {
    kind: "changeset-proposal",
    intent: "human-pose",
    method: "character.human-pose-rig",
    summary: `Apply human pose ${request.preset ?? "custom"} to ${changes.length} pivot node(s).`,
    facts: {
      preset: request.preset ?? null,
      changedNodeIds: changes.map((change) => change.nodeId),
      skippedNodeIds: warnings.filter((warning) => warning.code === "missing-pose-node").map((warning) => warning.nodeId),
    },
    changes,
    warnings,
    applied: false,
  };
}

export function proposeHumanIkReachChangeset(document, request = {}) {
  const target = documentParameters(document);
  const solution = solveHumanArmIkLite(target, request);
  if (!solution.solvable) {
    return {
      kind: "changeset-proposal",
      intent: "human-ik-reach-pose",
      method: "character.human-pose-rig",
      summary: `Cannot create an IK-lite reach pose for target ${JSON.stringify(solution.target)}.`,
      facts: {
        target: solution.target,
        selectedSide: solution.side ?? null,
        reachable: solution.reachable ?? false,
        solver: IK_SOLVER,
        candidates: solution.candidates ?? solution.reach?.candidates ?? [],
      },
      changes: [],
      warnings: solution.warnings,
      limitations: solution.limitations,
      applied: false,
    };
  }

  const originalNodes = nodeMap(target);
  const solvedNodes = nodeMap(solution.document);
  const changes = [];
  for (const control of solution.controls) {
    const beforeNode = originalNodes.get(control.nodeId);
    const afterNode = solvedNodes.get(control.nodeId);
    if (!beforeNode || !afterNode) continue;
    const before = transformFor(beforeNode);
    const after = transformFor(afterNode);
    if (squaredDistance(before.rotation, after.rotation) <= 1e-10) continue;
    changes.push({ operation: "update-composition-node-transform", nodeId: control.nodeId, before, after });
  }

  return {
    kind: "changeset-proposal",
    intent: "human-ik-reach-pose",
    method: "character.human-pose-rig",
    summary: `Apply ${solution.side} arm IK-lite reach pose toward ${JSON.stringify(solution.target)} with ${changes.length} pivot node change(s).`,
    facts: {
      target: solution.target,
      selectedSide: solution.side,
      reachable: solution.reachable,
      withinTolerance: solution.withinTolerance,
      initialEndEffector: solution.initialEndEffector,
      finalEndEffector: solution.finalEndEffector,
      initialError: solution.initialError,
      finalError: solution.finalError,
      improvement: solution.improvement,
      solver: IK_SOLVER,
      search: solution.facts.search,
      selectedSeed: solution.facts.selectedSeed,
      changedNodeIds: changes.map((change) => change.nodeId),
    },
    changes,
    warnings: solution.warnings,
    limitations: solution.limitations,
    applied: false,
  };
}

export function proposeHumanReachChangeset(document, request = {}) {
  if (request.solver === "ik-lite" || request.solver === IK_SOLVER) return proposeHumanIkReachChangeset(document, request);
  const target = documentParameters(document);
  const reach = analyzeHumanReach(target, request);
  if (!reach.reachable) {
    return {
      kind: "changeset-proposal",
      intent: "human-reach-pose",
      method: "character.human-pose-rig",
      summary: `Cannot create a reach pose for target ${JSON.stringify(reach.target)} because it is outside the arm reach envelope.`,
      facts: {
        target: reach.target,
        selectedSide: reach.selectedSide,
        reachable: false,
        candidates: reach.candidates,
        solver: "preset-reach-not-ik",
      },
      changes: [],
      warnings: reach.warnings,
      limitations: ["No pose changes are emitted for unreachable targets."],
      applied: false,
    };
  }
  const side = reach.selectedSide;
  const preset = request.preset ?? `${side}-hand-reach`;
  const proposal = proposeHumanPoseChangeset(target, { ...request, preset });
  return {
    ...proposal,
    intent: "human-reach-pose",
    summary: `Apply ${side} hand reach pose toward ${JSON.stringify(reach.target)} with ${proposal.changes.length} pivot node change(s).`,
    facts: {
      ...proposal.facts,
      target: reach.target,
      selectedSide: side,
      reachable: true,
      reachMargin: reach.candidates[0]?.margin ?? null,
      currentHandDistance: reach.candidates[0]?.currentHandDistance ?? null,
      candidates: reach.candidates,
      solver: "preset-reach-not-ik",
    },
    warnings: [...reach.warnings, ...proposal.warnings],
    limitations: ["This proposal applies a reusable reach preset toward the target; it is not an inverse-kinematics solution and does not guarantee exact hand-target contact."],
  };
}

export function applyCompositionChangesetProposal(document, proposal) {
  const target = documentParameters(document);
  if (!proposal || proposal.kind !== "changeset-proposal") throw new TypeError("expected a changeset proposal");
  if (proposal.applied) throw new Error("proposal is already marked as applied");
  const clone = structuredClone(target);
  const nodeById = new Map(clone.parameters.nodes.map((node) => [node.id, node]));
  for (const change of proposal.changes) {
    if (change.operation === "add-composition-node") {
      if (nodeById.has(change.nodeId)) throw new Error(`Changeset node already exists: ${change.nodeId}`);
      const added = structuredClone(change.after);
      clone.parameters.nodes.push(added);
      nodeById.set(added.id, added);
      continue;
    }
    const node = nodeById.get(change.nodeId);
    if (!node) throw new Error(`Changeset node does not exist: ${change.nodeId}`);
    if (change.operation === "update-composition-node-transform") {
      node.transform = structuredClone(change.after);
      continue;
    }
    if (change.operation === "update-composition-node") {
      for (const field of ["geometry", "transform", "appearance", "metadata", "semanticType"]) {
        if (change.after?.[field] !== undefined) node[field] = structuredClone(change.after[field]);
      }
      continue;
    }
    if (change.operation === "update-composition-node-geometry") {
      node.geometry = structuredClone(change.after);
      continue;
    }
    if (change.operation === "update-composition-node-appearance") {
      node.appearance = structuredClone(change.after);
      continue;
    }
    throw new Error(`Unsupported composition changeset operation: ${change.operation}`);
  }
  clone.revision = (target.revision ?? 0) + 1;
  return clone;
}
