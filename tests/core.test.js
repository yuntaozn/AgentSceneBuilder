import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeBoundsPair,
  analyzeGlbReferenceBytes,
  analyzeHumanPoseRig,
  analyzeHumanModelQuality,
  analyzeHumanReach,
  analyzeDrainSlope,
  analyzePath,
  analyzeSceneSpatial,
  applyCompositionChangesetProposal,
  applyChangesetProposal,
  composeScene,
  createHumanSurfaceProfile,
  createDefaultRegistry,
  generateMepPressureTestLoop,
  generateMepRouteWithClips,
  generateHumanPart,
  generateLowPolyWorkerHuman,
  geometryBounds,
  methodResultContract,
  nearlyEqual,
  proposeAnchorAlignment,
  proposeHumanReachChangeset,
  proposeHumanPoseChangeset,
  proposeLinearDistribution,
  proposeHumanSurfaceRefinement,
  queryScene,
  orthogonalPathCandidates,
  samplePath,
  transformPoint,
  compileCompositionSpec,
  transformPointMatrix,
} from "../packages/core/src/index.js";

function createTinyGlb() {
  const jsonEncoder = new TextEncoder();
  const positions = new Float32Array([0, 0, 0, 2, 4, 6]);
  const bin = new Uint8Array(positions.buffer);
  const json = {
    asset: { version: "2.0", generator: "agentscene-test" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ name: "translated-node", mesh: 0, translation: [1, 2, 3] }],
    meshes: [{ name: "test-mesh", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: "body-red", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: "VEC3" }],
  };
  const jsonBytes = jsonEncoder.encode(JSON.stringify(json));
  const jsonPadded = padBytes(jsonBytes, 0x20);
  const binPadded = padBytes(bin, 0);
  const totalLength = 12 + 8 + jsonPadded.byteLength + 8 + binPadded.byteLength;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPadded.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.set(jsonPadded, 20);
  const binHeaderOffset = 20 + jsonPadded.byteLength;
  view.setUint32(binHeaderOffset, binPadded.byteLength, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true);
  output.set(binPadded, binHeaderOffset + 8);
  return output;
}

function padBytes(bytes, padValue) {
  const length = Math.ceil(bytes.byteLength / 4) * 4;
  const output = new Uint8Array(length);
  output.set(bytes);
  output.fill(padValue, bytes.byteLength);
  return output;
}

test("compiles a declarative composition and preserves repetition intent", () => {
  const result = compileCompositionSpec({
    nodes: [{
      id: "stud",
      semanticType: "framing.stud",
      geometry: { type: "box", size: [0.1, 3, 0.1] },
      repetition: { type: "linear", count: 3, start: [0, 1.5, 0], step: [0.6, 0, 0] },
    }],
    anchors: { origin: { position: [0, 0, 0], kind: "mount" } },
  }, { instanceId: "wall" });
  assert.deepEqual(result.nodes.map((node) => node.id), ["wall.stud.000", "wall.stud.001", "wall.stud.002"]);
  assert.deepEqual(result.nodes[2].transform.position, [1.2, 1.5, 0]);
  assert.equal(result.nodes[1].metadata.repetitionIndex, 1);
  assert.equal(result.repetitions[0].occurrenceCount, 3);
});

test("builds data-only compositions through the default registry", () => {
  const result = createDefaultRegistry().build({
    id: "assembly",
    component: "core.composition",
    parameters: {
      nodes: [{ id: "body", geometry: { type: "box", size: [2, 1, 1] }, semanticType: "generic.solid" }],
      anchors: { mount: { position: [1, 0, 0], kind: "mount", direction: [1, 0, 0] } },
    },
  });
  assert.equal(result.nodes[0].id, "assembly.body");
  assert.deepEqual(result.anchors.local.mount, [1, 0, 0]);
  assert.equal(result.anchors.definitions.mount.kind, "mount");
});

test("builds sphere, cylinder, cone, torus, tapered segment, and lofted surface primitives with bounds", () => {
  const registry=createDefaultRegistry();
  const result=registry.build({id:"solid-primitives",component:"core.composition",parameters:{nodes:[
    {id:"ball",geometry:{type:"sphere",radius:1},transform:{position:[0,1,0]}},
    {id:"cylinder",geometry:{type:"cylinder",radius:.5,height:2},transform:{position:[3,1,0]}},
    {id:"cone",geometry:{type:"cone",radius:.75,height:2},transform:{position:[6,1,0]}},
    {id:"ring",geometry:{type:"torus",majorRadius:1,tubeRadius:.2},transform:{position:[9,1,0]}},
    {id:"tapered-limb",geometry:{type:"tapered-cylinder-between",start:[0,0,0],end:[0,1,0],startRadius:.16,endRadius:.08,radialSegments:12}},
    {id:"lofted-shell",geometry:{type:"lofted-surface",sections:[{center:[0,0,0],radiusX:.2,radiusZ:.1,profile:[[1.2,0],[0,1],[-1.2,0],[0,-.7]]},{center:[0,1,0],radiusX:.1,radiusZ:.05,profile:[[1.2,0],[0,1],[-1.2,0],[0,-.7]]}],radialSegments:4}},
  ]}});
  assert.deepEqual(result.nodes.map(node=>node.geometry.type),["sphere","cylinder","cone","torus","tapered-cylinder-between","lofted-surface"]);
  assert.deepEqual(geometryBounds(result.nodes[0]).size,[2,2,2]);
  assert.deepEqual(geometryBounds(result.nodes[3]).size.map(value=>Number(value.toFixed(3))),[2.4,.4,2.4]);
  assert.deepEqual(geometryBounds(result.nodes[4]).size.map(value=>Number(value.toFixed(3))),[.32,1.32,.32]);
  assert.equal(result.nodes[5].geometry.sections[0].profile.length,4);
  assert.deepEqual(geometryBounds(result.nodes[5]).size.map(value=>Number(value.toFixed(3))),[.48,1,.17]);
});

test("analyzes GLB references into material, node, and proportion facts", () => {
  const analysis = analyzeGlbReferenceBytes(createTinyGlb());
  assert.equal(analysis.kind, "glb-reference-analysis");
  assert.equal(analysis.source.generator, "agentscene-test");
  assert.equal(analysis.counts.analyzedPrimitives, 1);
  assert.deepEqual(analysis.effectiveBounds.min, [1, 2, 3]);
  assert.deepEqual(analysis.effectiveBounds.max, [3, 6, 9]);
  assert.deepEqual(analysis.effectiveBounds.size, [2, 4, 6]);
  assert.equal(analysis.proportionHints.height, 4);
  assert.equal(analysis.materialGroups[0].name, "body-red");
  assert.deepEqual(analysis.materialGroups[0].baseColorFactor, [1, 0, 0, 1]);
  assert.equal(analysis.nodeGroups[0].name, "translated-node");
  assert.deepEqual(analysis.outlierPrimitives, []);
});

test("expands grid, radial, and path repetitions as reusable spatial methods", () => {
  const grid = compileCompositionSpec({ nodes: [{
    id: "tile", geometry: { type: "box", size: [0.9, 0.1, 0.9] },
    repetition: { type: "grid", count: [2, 1, 2], stepX: [1, 0, 0], stepZ: [0, 0, 1] },
  }] }, { instanceId: "floor" });
  assert.equal(grid.nodes.length, 4);
  assert.deepEqual(grid.nodes[3].metadata.gridIndex, [1, 0, 1]);
  assert.deepEqual(grid.nodes[3].transform.position, [1, 0, 1]);

  const radial = compileCompositionSpec({ nodes: [{
    id: "bolt", geometry: { type: "box", size: [0.1, 0.1, 0.1] },
    repetition: { type: "radial", count: 4, center: [2, 0, 3], radius: 1, axis: "y" },
  }] }, { instanceId: "flange" });
  assert.deepEqual(radial.nodes[0].transform.position, [3, 0, 3]);
  assert.ok(nearlyEqual(radial.nodes[1].transform.position[2], 4));

  const along = compileCompositionSpec({ nodes: [{
    id: "hanger", geometry: { type: "box", size: [0.1, 0.4, 0.1] },
    repetition: { type: "path", points: [[0, 0, 0], [2, 0, 0], [2, 0, 2]], spacing: 1, includeEnd: true },
  }] }, { instanceId: "supports" });
  assert.deepEqual(along.nodes.map((node) => node.transform.position), [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1], [2, 0, 2]]);
  assert.deepEqual(along.nodes.at(-1).metadata.tangent, [0, 0, 1]);
});

test("resolves parent transforms, pivots, and node-bound anchors", () => {
  const result = compileCompositionSpec({
    nodes: [
      { id: "pivot", transform: { rotation: [0, 0, Math.PI / 2] } },
      {
        id: "arm",
        parent: "pivot",
        transform: { position: [2, 0, 0], rotation: [0, 0, Math.PI / 2] },
        pivot: [1, 0, 0],
        geometry: { type: "box", size: [2, 0.2, 0.2] },
      },
    ],
    anchors: { tip: { node: "arm", position: [2, 0, 0], direction: [1, 0, 0], kind: "tip" } },
  }, { instanceId: "machine" });
  assert.equal(result.nodes[0].parent, "pivot");
  assert.ok(nearlyEqual(result.anchors.tip.position[0], -1));
  assert.ok(nearlyEqual(result.anchors.tip.position[1], 3));
  assert.equal(result.anchors.tip.kind, "tip");
  assert.ok(nearlyEqual(result.anchors.tip.direction[0], -1));
  assert.ok(nearlyEqual(result.anchors.tip.direction[1], 0));
});

test("orients repeated nodes along path tangents and radial directions", () => {
  const path = compileCompositionSpec({ nodes: [{
    id: "arrow",
    geometry: { type: "box", size: [0.1, 1, 0.1] },
    repetition: { type: "path", points: [[0, 0, 0], [2, 0, 0]], spacing: 1 },
    orientation: { mode: "tangent", localAxis: [0, 1, 0] },
  }] }, { instanceId: "route" });
  const origin = transformPointMatrix([0, 0, 0], path.nodes[0].matrix);
  const tip = transformPointMatrix([0, 1, 0], path.nodes[0].matrix);
  assert.ok(nearlyEqual(tip[0] - origin[0], 1));
  assert.ok(nearlyEqual(tip[1] - origin[1], 0));

  const radial = compileCompositionSpec({ nodes: [{
    id: "marker",
    geometry: { type: "box", size: [0.1, 1, 0.1] },
    repetition: { type: "radial", count: 1, center: [2, 0, 0], radius: 1, axis: "y" },
    orientation: { mode: "radial-inward", localAxis: [0, 1, 0] },
  }] }, { instanceId: "ring" });
  const radialOrigin = transformPointMatrix([0, 0, 0], radial.nodes[0].matrix);
  const radialTip = transformPointMatrix([0, 1, 0], radial.nodes[0].matrix);
  assert.ok(nearlyEqual(radialTip[0] - radialOrigin[0], -1));
});

test("rejects cyclic composition hierarchies", () => {
  assert.throws(() => compileCompositionSpec({ nodes: [
    { id: "a", parent: "b" },
    { id: "b", parent: "a" },
  ] }, { instanceId: "cycle" }), /cycle/);
});

test("addresses repeated occurrences by index, grid index, and path distance", () => {
  const result = compileCompositionSpec({
    nodes: [
      { id: "stud", geometry: { type: "box", size: [0.1, 2, 0.1] }, repetition: { type: "linear", count: 4, step: [1, 0, 0] } },
      { id: "tile", geometry: { type: "box", size: [1, 0.1, 1] }, repetition: { type: "grid", count: [2, 1, 2], stepX: [1, 0, 0], stepZ: [0, 0, 1] } },
      { id: "hanger", geometry: { type: "box", size: [0.1, 0.5, 0.1] }, repetition: { type: "path", points: [[0, 0, 0], [3, 0, 0]], spacing: 1 } },
    ],
    anchors: {
      stud3: { node: "stud", occurrence: 3, position: [0, 1, 0] },
      tile11: { node: "tile", occurrence: { gridIndex: [1, 0, 1] }, position: [0, 0, 0] },
      hanger2: { node: "hanger", occurrence: { pathDistance: 2 }, position: [0, 0, 0] },
    },
  }, { instanceId: "addressing" });
  assert.deepEqual(result.anchors.stud3.position, [3, 1, 0]);
  assert.equal(result.anchors.stud3.occurrenceRef, "stud[3]");
  assert.deepEqual(result.anchors.tile11.position, [1, 0, 1]);
  assert.deepEqual(result.anchors.hanger2.position, [2, 0, 0]);
});

test("preserves appearance, animations, and annotations in composition output", () => {
  const result = createDefaultRegistry().build({ id: "visual", component: "core.composition", parameters: {
    nodes: [{ id: "panel", geometry: { type: "box", size: [1, 1, 0.1] }, appearance: { color: "#ff8800", opacity: 0.6 } }],
    animations: [{ id: "move-panel", target: "panel", property: "position", from: [0, 0, 0], to: [2, 0, 0], duration: 1 }],
    annotations: [{ id: "note", text: "检修口", position: [0, 1, 0] }],
  } });
  assert.equal(result.nodes[0].appearance.color, "#ff8800");
  assert.equal(result.animations[0].target, "panel");
  assert.equal(result.annotations[0].text, "检修口");
});

test("compiles light components without changing geometry bounds", () => {
  const registry = createDefaultRegistry();
  const build = registry.build({
    id: "lit-cube",
    component: "core.composition",
    parameters: { nodes: [
      { id: "cube", geometry: { type: "box", size: [1,1,1] } },
      { id: "key-light", kind: "light", light: { type: "point", color: "#ffffff", intensity: 7 }, transform: { position: [3,4,5] } },
    ] },
  });
  const light = build.nodes.find(node => node.kind === "light");
  assert.equal(light.metadata.compositionNodeId, "key-light");
  assert.deepEqual(light.transform.position, [3,4,5]);
  assert.deepEqual(build.bounds.size, [1,1,1]);
});

test("analyzes a human pose rig and proposes reviewable pivot changesets", () => {
  const humanDocument = {
    id: "human-rig",
    component: "core.composition",
    parameters: {
      nodes: [
        { id: "right-shoulder-pivot", transform: { position: [0.28, 1.36, 0], rotation: [0, 0, 0] } },
        { id: "right-elbow-pivot", parent: "right-shoulder-pivot", transform: { position: [0.12, -0.23, 0.03], rotation: [0, 0, 0] } },
        { id: "right-wrist-pivot", parent: "right-elbow-pivot", transform: { position: [-0.07, -0.19, 0.05], rotation: [0, 0, 0] } },
      ],
      anchors: {
        "head-top": [0, 1.75, 0],
        "eye-forward": [0, 1.63, 0.11],
        "neck-base": [0, 1.47, 0],
        "left-shoulder": [-0.28, 1.36, 0],
        "right-shoulder": [0.28, 1.36, 0],
        "left-elbow": [-0.4, 1.13, 0.03],
        "right-elbow": [0.4, 1.13, 0.03],
        "left-wrist": [-0.33, 0.94, 0.08],
        "right-wrist": [0.33, 0.94, 0.08],
        "left-hand-grip": [-0.32, 0.88, 0.1],
        "right-hand-grip": [0.32, 0.88, 0.1],
        "left-hip": [-0.1, 0.9, 0],
        "right-hip": [0.1, 0.9, 0],
        "left-knee": [-0.1, 0.51, 0.01],
        "right-knee": [0.1, 0.51, 0.01],
        "left-ankle": [-0.1, 0.07, 0],
        "right-ankle": [0.1, 0.07, 0],
        "left-foot-contact": [-0.11, 0, 0.06],
        "right-foot-contact": [0.11, 0, 0.06],
      },
    },
  };
  const rig = analyzeHumanPoseRig(humanDocument);
  assert.equal(rig.kind, "human-pose-rig-analysis");
  assert.equal(rig.boneCount, 15);
  assert.ok(rig.metrics.height > 1.7);
  assert.ok(rig.symmetry.ok);
  assert.ok(rig.jointAngles.rightElbow.degrees > 120);

  const proposal = proposeHumanPoseChangeset(humanDocument, { preset: "right-arm-wave" });
  assert.equal(proposal.intent, "human-pose");
  assert.deepEqual(proposal.facts.changedNodeIds, ["right-shoulder-pivot", "right-elbow-pivot", "right-wrist-pivot"]);
  const changed = applyCompositionChangesetProposal(humanDocument, proposal);
  assert.deepEqual(changed.parameters.nodes.find(node => node.id === "right-elbow-pivot").transform.rotation, [0, 0, -0.85]);
  assert.deepEqual(humanDocument.parameters.nodes.find(node => node.id === "right-elbow-pivot").transform.rotation, [0, 0, 0]);

  const reach = analyzeHumanReach(humanDocument, { side: "right", target: [0.45, 1.12, 0.22] });
  assert.equal(reach.kind, "human-reach-analysis");
  assert.equal(reach.selectedSide, "right");
  assert.equal(reach.reachable, true);
  assert.ok(reach.candidates[0].margin > 0);

  const reachProposal = proposeHumanReachChangeset(humanDocument, { side: "right", target: [0.45, 1.12, 0.22] });
  assert.equal(reachProposal.intent, "human-reach-pose");
  assert.deepEqual(reachProposal.facts.changedNodeIds, ["right-shoulder-pivot", "right-elbow-pivot", "right-wrist-pivot"]);
  assert.equal(reachProposal.facts.reachable, true);
  const reachChanged = applyCompositionChangesetProposal(humanDocument, reachProposal);
  assert.deepEqual(reachChanged.parameters.nodes.find(node => node.id === "right-shoulder-pivot").transform.rotation, [-0.65, 0, -0.28]);

  const unreachableProposal = proposeHumanReachChangeset(humanDocument, { side: "right", target: [2, 1.3, 0] });
  assert.equal(unreachableProposal.facts.reachable, false);
  assert.deepEqual(unreachableProposal.changes, []);
  assert.ok(unreachableProposal.warnings.some(warning => warning.code === "target-unreachable"));
});

test("generates and refines low-poly human surface geometry without changing pose responsibility", () => {
  const registry = createDefaultRegistry();
  const profile = createHumanSurfaceProfile({ height: 1.78 });
  assert.equal(profile.kind, "human-surface-profile");
  assert.equal(profile.method, "character.human-surface-lowpoly");
  assert.equal(profile.sections.find(section => section.id === "chest").width > profile.sections.find(section => section.id === "waist").width, true);
  assert.equal(profile.limbProfiles.hand.fingerCount, 5);
  assert.equal(profile.expansion.noNewGeometryTypeRequired, false);
  assert.deepEqual(profile.expansion.addedGeometryTypes, ["tapered-cylinder-between", "lofted-surface"]);
  assert.equal(profile.expansion.primarySurfaceGeometry, "lofted-surface");
  assert.ok(profile.expansion.surfaceFeatures.includes("section-loft-head"));
  assert.ok(profile.expansion.surfaceFeatures.includes("section-loft-hands"));
  assert.ok(profile.expansion.surfaceFeatures.includes("worker-silhouette-v3"));
  assert.ok(profile.expansion.surfaceFeatures.includes("axis-lofted-footwear"));
  assert.ok(profile.expansion.surfaceFeatures.includes("facial-feature-lofting"));

  const generated = generateLowPolyWorkerHuman({ id: "worker-surface", height: 1.78 });
  assert.equal(generated.kind, "human-geometry-surface");
  assert.equal(generated.method, "character.human-surface-lowpoly");
  assert.equal(generated.composition.component, "core.composition");
  assert.ok(generated.composition.parameters.nodes.length > 90);
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "chest").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "abdomen").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-thigh").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "head").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-hand").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "chest").geometry.sections.length, 3);
  assert.deepEqual(generated.composition.parameters.nodes.find(node => node.id === "head").geometry.sections.map(section => section.id), ["jaw", "mouth-cheek", "eye-cheek", "temple", "crown"]);
  assert.deepEqual(generated.composition.parameters.nodes.find(node => node.id === "left-hand").geometry.sections.map(section => section.id), ["wrist-entry", "palm-body", "knuckle-row"]);
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-glasses-rim").geometry.type, "torus");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-index-finger").geometry.type, "tapered-cylinder-between");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-sleeve-cap").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "safety-helmet-shell").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "nose").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-shoe").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.surfaceProfile.sections.length, 9);
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-upper-arm").geometry.type, "lofted-surface");
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-upper-arm").geometry.sections.length, 3);
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-upper-arm").geometry.radialSegments, 10);
  assert.equal(generated.composition.parameters.nodes.find(node => node.id === "left-shoulder").geometry.radius < 0.03, true);
  const built = registry.build(generated.composition);
  assert.ok(built.bounds.size[1] > 1.74 && built.bounds.size[1] < 1.9);
  assert.ok(built.anchors.world["right-hand-grip"]);
  assert.ok(built.anchors.world["right-index-tip"]);
  assert.ok(generated.composition.parameters.relations.some(relation => relation.type === "kinematic-chain" && relation.name === "right-arm"));
  assert.ok(generated.composition.parameters.relations.some(relation => relation.type === "finger-chain" && relation.name === "right-index"));

  const doll = {
    id: "doll-human",
    component: "core.composition",
    parameters: {
      nodes: [
        { id: "chest", geometry: { type: "sphere", radius: 0.2 }, transform: { position: [0, 1.3, 0] }, appearance: { color: "#ffff00" } },
        { id: "abdomen", geometry: { type: "sphere", radius: 0.18 }, transform: { position: [0, 1.1, 0] }, appearance: { color: "#ffff00" } },
        { id: "left-upper-arm", geometry: { type: "cylinder-between", start: [0, 0, 0], end: [-0.12, -0.2, 0], radius: 0.05, radialSegments: 24 }, appearance: { color: "#ffff00" } },
      ],
    },
  };
  const proposal = proposeHumanSurfaceRefinement(doll);
  assert.equal(proposal.intent, "human-surface-refinement");
  assert.equal(proposal.method, "character.human-surface-lowpoly");
  assert.ok(proposal.facts.changedNodeIds.includes("chest"));
  assert.ok(proposal.facts.changedNodeIds.includes("left-upper-arm"));
  const refined = applyCompositionChangesetProposal(doll, proposal);
  assert.equal(refined.parameters.nodes.find(node => node.id === "chest").geometry.type, "lofted-surface");
  assert.equal(refined.parameters.nodes.find(node => node.id === "chest").geometry.sections[1].id, "chest-full");
  assert.equal(refined.parameters.nodes.find(node => node.id === "left-upper-arm").geometry.type, "lofted-surface");
  assert.equal(refined.parameters.nodes.find(node => node.id === "left-upper-arm").geometry.sections[0].id, "upper-arm-shoulder");
  assert.equal(refined.parameters.nodes.find(node => node.id === "left-upper-arm").geometry.radialSegments, 10);
  assert.equal(refined.parameters.nodes.find(node => node.id === "chest").metadata.generatedBy, "character.human-surface-lowpoly");

  const addMissingProposal = proposeHumanSurfaceRefinement(doll, { addMissing: true });
  assert.ok(addMissingProposal.facts.addedNodeIds.includes("body-root"));
  assert.ok(addMissingProposal.facts.addedNodeIds.includes("right-index-finger"));
  const completed = applyCompositionChangesetProposal(doll, addMissingProposal);
  assert.ok(completed.parameters.nodes.some(node => node.id === "right-index-finger"));
  assert.ok(completed.parameters.nodes.some(node => node.id === "safety-helmet-shell"));

  const headPart = generateHumanPart({ part: "head", id: "worker-head-part", height: 1.78 });
  assert.equal(headPart.kind, "human-part-geometry");
  assert.equal(headPart.composition.parameters.nodes[0].id, "head-root");
  assert.equal(headPart.composition.parameters.nodes.find(node => node.id === "head-pivot").parent, "head-root");
  assert.equal(headPart.composition.parameters.nodes.find(node => node.id === "nose").geometry.type, "lofted-surface");
  assert.ok(headPart.composition.parameters.anchors["eye-forward"]);

  const handPart = generateHumanPart({ part: "hand", side: "right", id: "worker-right-hand-part", height: 1.78 });
  assert.equal(handPart.composition.parameters.nodes[0].id, "right-hand-root");
  assert.equal(handPart.composition.parameters.nodes.find(node => node.id === "right-wrist-pivot").parent, "right-hand-root");
  assert.equal(handPart.composition.parameters.nodes.find(node => node.id === "right-hand").geometry.type, "lofted-surface");
  assert.ok(handPart.composition.parameters.anchors["hand-grip"]);
  assert.ok(handPart.composition.parameters.relations.some(relation => relation.type === "finger-chain" && relation.name === "right-index"));

  const footPart = generateHumanPart({ part: "foot", side: "right", id: "worker-right-foot-part", height: 1.78 });
  assert.equal(footPart.composition.parameters.nodes[0].id, "right-foot-root");
  assert.equal(footPart.composition.parameters.nodes.find(node => node.id === "right-ankle-pivot").parent, "right-foot-root");
  assert.equal(footPart.composition.parameters.nodes.find(node => node.id === "right-shoe").geometry.type, "lofted-surface");
  assert.ok(footPart.composition.parameters.anchors["foot-contact"]);

  assert.equal(analyzeHumanModelQuality(headPart.composition).rating, "usable-baseline");
  assert.equal(analyzeHumanModelQuality(handPart.composition).rating, "usable-baseline");
  assert.equal(analyzeHumanModelQuality(footPart.composition).rating, "usable-baseline");
  assert.equal(analyzeHumanModelQuality(generated.composition).rating, "usable-baseline");
});

test("builds a parametric independent foundation with stable child ids", () => {
  const registry = createDefaultRegistry();
  const result = registry.build({
    id: "f-01",
    component: "construction.independent-foundation",
    parameters: {
      width: 6.5,
      depth: 4.4,
      height: 0.8,
      columnWidth: 1.2,
      columnDepth: 1.2,
      columnHeight: 2.4,
      rebarDiameter: 0.032,
      rebarSpacing: 0.4,
      concreteCover: 0.05,
    },
  });
  assert.equal(result.instance.componentVersion, "0.1.0");
  assert.ok(result.nodes.every((node) => node.id.startsWith("f-01.")));
  assert.ok(result.nodes.some((node) => node.id === "f-01.pad"));
  assert.ok(result.metrics.rebarCount > 20);
  assert.ok(nearlyEqual(result.metrics.concreteVolume.value, 6.5 * 4.4 * 0.8 + 1.2 * 1.2 * 2.4));
  assert.deepEqual(result.anchors.local.padTopCenter, [0, 0.9, 0]);
  assert.ok(result.bounds.size[0] >= 6.5);
});

test("builds a pipe run with length, anchors, and bounds", () => {
  const registry = createDefaultRegistry();
  const result = registry.build({
    id: "pipe-01",
    component: "mep.pipe-run",
    parameters: {
      path: [[0, 0, 0], [0, 3, 0], [4, 3, 0]],
      diameter: 0.1,
      system: "cold-water",
    },
  });
  assert.equal(result.nodes[0].geometry.type, "tube-along");
  assert.equal(result.metrics.centerlineLength.value, 7);
  assert.deepEqual(result.anchors.local.start, [0, 0, 0]);
  assert.deepEqual(result.anchors.local.end, [4, 3, 0]);
  assert.deepEqual(result.bounds.size, [4.1, 3.0999999999999996, 0.1]);
});

test("rejects invalid component parameters", () => {
  const registry = createDefaultRegistry();
  assert.throws(() => registry.build({
    id: "bad",
    component: "construction.independent-foundation",
    parameters: { width: -1 },
  }), /width/);
});

test("applies instance transforms to world anchors and bounds", () => {
  const registry = createDefaultRegistry();
  const result = registry.build({
    id: "pipe-moved",
    component: "mep.pipe-run",
    transform: { position: [1, 2, 3], rotation: [0, Math.PI / 2, 0] },
    parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 },
  });
  assert.deepEqual(result.anchors.world.start, [1, 2, 3]);
  assert.ok(nearlyEqual(result.anchors.world.end[0], 1));
  assert.ok(nearlyEqual(result.anchors.world.end[2], 2));
  assert.ok(nearlyEqual(result.bounds.size[2], 1.1));
});

test("composes components, resolves connections, and queries semantic nodes", () => {
  const registry = createDefaultRegistry();
  const scene = composeScene({
    instances: [
      { id: "foundation", component: "construction.independent-foundation" },
      {
        id: "pipe",
        component: "mep.pipe-run",
        transform: { position: [0, 2.4, 0] },
        parameters: { path: [[0, 0, 0], [2, 0, 0]], diameter: 0.1 },
      },
    ],
    relations: [{ type: "connects", from: "foundation#columnTopCenter", to: "pipe#start" }],
  }, registry);
  assert.equal(scene.ok, true);
  assert.equal(scene.relations[0].connected, true);
  const rebar = queryScene(scene, { semanticType: "construction.rebar" });
  assert.ok(rebar.length > 20);
  const pipes = queryScene(scene, { component: "mep.pipe-run" });
  assert.equal(pipes.length, 1);
});

test("reports required anchor connection gaps", () => {
  const registry = createDefaultRegistry();
  const scene = composeScene({
    instances: [
      { id: "a", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
      { id: "b", component: "mep.pipe-run", transform: { position: [3, 0, 0] }, parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
    ],
    relations: [{ type: "connects", from: "a#end", to: "b#start", tolerance: 0.01 }],
  }, registry);
  assert.equal(scene.ok, false);
  assert.equal(scene.issues[0].code, "SCENE_CONNECTION_GAP");
  assert.equal(scene.relations[0].gap, 2);
});

test("evaluates explicit attachment contracts with embed allowance", () => {
  const registry = createDefaultRegistry();
  const scene = composeScene({
    instances: [
      { id: "a", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
      { id: "b", component: "mep.pipe-run", transform: { position: [1.04, 0, 0] }, parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
    ],
    attachments: [{
      id: "joint-1",
      from: "a#end",
      to: "b#start",
      contract: { contact: "socket", embed: 0.03, gapTolerance: 0.011 },
    }],
  }, registry);
  assert.equal(scene.ok, true);
  assert.equal(scene.relations[0].type, "attachment");
  assert.ok(nearlyEqual(scene.relations[0].gap, 0.04));
  assert.ok(nearlyEqual(scene.relations[0].effectiveGap, 0.01));
  assert.equal(scene.relations[0].contract.contact, "socket");
});

test("checks attachment anchor directions when requested", () => {
  const registry = createDefaultRegistry();
  const component = (id, direction, position = [0, 0, 0]) => ({
    id,
    component: "core.composition",
    transform: { position },
    parameters: {
      nodes: [{ id: "body", geometry: { type: "box", size: [1, 1, 1] } }],
      anchors: { port: { position: [0, 0, 0], direction, kind: "socket" } },
    },
  });
  const scene = composeScene({
    instances: [component("left", [1, 0, 0]), component("right", [-1, 0, 0])],
    attachments: [{ from: "left#port", to: "right#port", contract: { direction: "opposed" } }],
  }, registry);
  assert.equal(scene.ok, true);
  assert.equal(scene.relations[0].directionCompatible, true);
  assert.equal(scene.relations[0].directionDot, -1);

  const invalid = composeScene({
    instances: [component("left", [1, 0, 0]), component("right", [1, 0, 0])],
    attachments: [{ from: "left#port", to: "right#port", contract: { direction: "opposed" } }],
  }, registry);
  assert.equal(invalid.ok, false);
  assert.match(invalid.issues[0].message, /directions/);
});

test("transforms points using scale, XYZ rotation, and translation", () => {
  const point = transformPoint([1, 0, 0], { position: [10, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1] });
  assert.ok(nearlyEqual(point[0], 10));
  assert.ok(nearlyEqual(point[1], 2));
});

test("classifies separated, touching, and intersecting bounds", () => {
  const a = { min: [0, 0, 0], max: [1, 1, 1] };
  assert.equal(analyzeBoundsPair(a, { min: [2, 0, 0], max: [3, 1, 1] }).state, "separated");
  assert.equal(analyzeBoundsPair(a, { min: [1, 0, 0], max: [2, 1, 1] }).state, "touching");
  assert.equal(analyzeBoundsPair(a, { min: [0.5, 0, 0], max: [2, 1, 1] }).state, "intersecting");
});

test("proposes anchor alignment without mutating the scene", () => {
  const registry = createDefaultRegistry();
  const document = {
    revision: 4,
    instances: [
      { id: "a", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [2, 0, 0]], diameter: 0.1 } },
      { id: "b", component: "mep.pipe-run", transform: { position: [5, 1, 0] }, parameters: { path: [[0, 0, 0], [0, 2, 0]], diameter: 0.1 } },
    ],
  };
  const scene = composeScene(document, registry);
  const proposal = proposeAnchorAlignment(scene, { instanceId: "b", source: "b#start", target: "a#end" });
  assert.deepEqual(proposal.facts.translation, [-3, -1, 0]);
  assert.equal(proposal.applied, false);
  assert.deepEqual(document.instances[1].transform.position, [5, 1, 0]);
  const updated = applyChangesetProposal(document, proposal);
  assert.deepEqual(updated.instances[1].transform.position, [2, 0, 0]);
  assert.equal(updated.revision, 5);
});

test("proposes deterministic linear distribution", () => {
  const registry = createDefaultRegistry();
  const scene = composeScene({ instances: [
    { id: "a", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
    { id: "b", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [2, 0, 0]], diameter: 0.1 } },
  ] }, registry);
  const proposal = proposeLinearDistribution(scene, { instanceIds: ["a", "b"], axis: "x", start: 0, gap: 0.5 });
  assert.equal(proposal.changes.length, 2);
  assert.ok(nearlyEqual(proposal.facts.placements[0].proposedMin, 0));
  assert.ok(nearlyEqual(proposal.facts.placements[1].proposedMin, 1.6));
});

test("analyzes all scene instance pairs", () => {
  const registry = createDefaultRegistry();
  const scene = composeScene({ instances: [
    { id: "a", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [2, 0, 0]], diameter: 0.2 } },
    { id: "b", component: "mep.pipe-run", transform: { position: [1, 0, 0] }, parameters: { path: [[0, 0, 0], [2, 0, 0]], diameter: 0.2 } },
  ] }, registry);
  const analysis = analyzeSceneSpatial(scene);
  assert.equal(analysis.pairCount, 1);
  assert.equal(analysis.collisions, 1);
});

test("analyzes orthogonal and sloped path segments", () => {
  const result = analyzePath([[0, 0, 0], [0, 2, 0], [3, 2, 0], [4, 3, 0]]);
  assert.equal(result.segmentCount, 3);
  assert.equal(result.bendCount, 2);
  assert.equal(result.orthogonal, false);
  assert.equal(result.segments[0].axis, "y");
  assert.equal(result.segments[1].axis, "x");
  assert.ok(nearlyEqual(result.segments[2].slope, 1));
});

test("returns orthogonal route candidates without selecting one", () => {
  const result = orthogonalPathCandidates([0, 0, 0], [2, 3, 4]);
  assert.equal(result.candidates.length, 6);
  assert.equal(result.selected, null);
  assert.ok(result.candidates.every((candidate) => nearlyEqual(candidate.totalLength, 9)));
  assert.ok(result.candidates.every((candidate) => candidate.bendCount === 2));
});

test("samples stable positions along a polyline", () => {
  const result = samplePath([[0, 0, 0], [0, 2, 0], [4, 2, 0]], {
    spacing: 1.5,
    startOffset: 0.5,
    endOffset: 0.5,
    includeEnd: true,
  });
  assert.deepEqual(result.samples.map((sample) => sample.distance), [0.5, 2, 3.5, 5, 5.5]);
  assert.deepEqual(result.samples[2].position, [1.5, 2, 0]);
  assert.deepEqual(result.samples.at(-1).position, [3.5, 2, 0]);
});

test("generates MEP routes with preserved pipe-clip path repetition", () => {
  const generated = generateMepRouteWithClips({
    id: "rough-in-test",
    routes: [{
      id: "cold",
      system: "cold-water",
      points: [[0, 0.4, 0], [0, 1.8, 0], [2.4, 1.8, 0]],
      clipSpacing: 0.6,
    }],
  });
  assert.equal(generated.kind, "mep-route-with-clips");
  assert.equal(generated.routeCount, 1);
  assert.equal(generated.composition.component, "core.composition");
  const routeNode = generated.composition.parameters.nodes.find(node => node.id === "cold");
  const clipNode = generated.composition.parameters.nodes.find(node => node.id === "cold-clip");
  assert.equal(routeNode.geometry.type, "tube-along");
  assert.equal(clipNode.repetition.type, "path");
  assert.equal(clipNode.repetition.spacing, 0.6);
  assert.equal(clipNode.orientation.mode, "tangent");
  const built = createDefaultRegistry().build(generated.composition);
  assert.ok(built.repetitions.some(repetition => repetition.prototypeId === "cold-clip" && repetition.occurrenceCount >= 5));
  assert.ok(built.anchors.world["cold-start"]);
  assert.ok(built.anchors.world["cold-end"]);
});

test("checks MEP drain slope segments without mutating the route", () => {
  const ok = analyzeDrainSlope([[0, 0.1, 0], [2, 0.08, 0], [4, 0.06, 0]], {
    minSlope: 0.005,
    maxSlope: 0.02,
  });
  assert.equal(ok.kind, "mep-drain-slope-check");
  assert.equal(ok.ok, true);
  assert.ok(nearlyEqual(ok.averageSlope, 0.01));
  assert.deepEqual(ok.segments.map(segment => segment.status), ["ok", "ok"]);

  const bad = analyzeDrainSlope([[0, 0.1, 0], [2, 0.11, 0]], {
    minSlope: 0.005,
    maxSlope: 0.02,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.segments[0].status, "reverse-fall");
  assert.equal(bad.issues[0].code, "DRAIN_SLOPE_REVERSE_FALL");
});

test("generates an editable MEP pressure-test loop with stable ports", () => {
  const generated = generateMepPressureTestLoop({
    id: "pressure-loop-test",
    hotPort: [-1.2, 0.7, -0.2],
    coldPort: [-1.2, 0.7, -0.8],
    targetPressureMpa: 0.8,
    holdMinutes: 30,
  });
  assert.equal(generated.kind, "mep-pressure-test-loop");
  assert.equal(generated.composition.parameters.metrics.targetPressureMpa, 0.8);
  assert.ok(generated.hoseLength > 3);
  const nodes = generated.composition.parameters.nodes;
  assert.ok(nodes.some(node => node.id === "cold-hose" && node.geometry.type === "tube-along"));
  assert.ok(nodes.some(node => node.id === "gauge-face"));
  const built = createDefaultRegistry().build(generated.composition);
  assert.ok(built.anchors.world["cold-port"]);
  assert.ok(built.anchors.world["hot-port"]);
  assert.ok(built.anchors.world["gauge-read"]);
});

test("classifies method outputs into facts, candidates, proposals, and generated compositions", () => {
  const facts = methodResultContract(analyzePath([[0, 0, 0], [2, 0, 0]]), { expectedType: "facts" });
  assert.equal(facts.ok, true);
  assert.equal(facts.reviewRequired, false);

  const candidates = methodResultContract(orthogonalPathCandidates([0, 0, 0], [1, 1, 1]), { expectedType: "candidates" });
  assert.equal(candidates.ok, true);
  assert.equal(candidates.reviewRequired, true);

  const registry = createDefaultRegistry();
  const scene = composeScene({ instances: [
    { id: "a", component: "mep.pipe-run", parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
    { id: "b", component: "mep.pipe-run", transform: { position: [3, 0, 0] }, parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.1 } },
  ] }, registry);
  const proposal = methodResultContract(proposeAnchorAlignment(scene, { instanceId: "b", source: "b#start", target: "a#end" }), { expectedType: "proposal" });
  assert.equal(proposal.ok, true);
  assert.equal(proposal.reviewRequired, true);

  const generated = methodResultContract(generateMepRouteWithClips(), { expectedType: "generated-composition" });
  assert.equal(generated.ok, true);
  assert.equal(generated.reviewRequired, false);

  const invalidAutoSelected = methodResultContract({ kind: "path-candidates", candidates: [], selected: "candidate-1" }, { expectedType: "candidates" });
  assert.equal(invalidAutoSelected.ok, false);
  assert.equal(invalidAutoSelected.issues[0].code, "CANDIDATES_SHOULD_NOT_AUTO_SELECT");
});
