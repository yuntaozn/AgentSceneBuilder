import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRegistry } from "../scripts/registry.mjs";
import { publicRegistryDomains, searchPublicRegistry } from "../registry/catalog.js";
import {
  applyCompositionChangesetProposal,
  analyzeHumanModelQuality,
  checkComposition,
  checkScene,
  compileCompositionSpec,
  composeScene,
  createDefaultRegistry,
  proposeHumanGraspChangeset,
  proposeHumanIkReachChangeset,
} from "../packages/core/src/index.js";
import { modelDocumentFor, modelPreviewZoomForExtent } from "../apps/shared/model-preview.js";
import { publicRegistryCounts, publicRegistryEntries } from "../apps/shared/registry-visibility.js";

test("validates the open digital model registry", async () => {
  const registry = await buildRegistry();
  assert.deepEqual(registry.counts, { component: 1388, method: 13, composition: 246 });
  assert.equal(new Set(registry.entries.map(entry => entry.id)).size, registry.entries.length);
  assert.ok(registry.entries.every(entry => entry.source.endsWith("manifest.json")));
});

test("public model library hides internal experimental character entries", async () => {
  const registry = await buildRegistry();
  const publicEntries = publicRegistryEntries(registry);
  assert.deepEqual(publicRegistryCounts(publicEntries), { component: 1388, method: 11, composition: 242 });
  assert.equal(publicEntries.some(entry => entry.id.startsWith("character.")), false);
});

test("public domain filtering combines spaces in queries with the selected kind", () => {
  const catalog = { entries: [
    { id: "mep.bend", kind: "component", title: "圆形弯头", tags: ["风管"] },
    { id: "mep.route", kind: "method", title: "圆形弯头", tags: ["风管"] },
    { id: "structure.bend", kind: "component", title: "圆形弯头", tags: ["风管"] },
    { id: "internal.fixture", kind: "component", title: "圆形弯头", visibility: "internal" },
    { id: "media.boom", kind: "component", title: "桌夹式双关节麦克风悬臂", tags: ["播客"] },
    { id: "new-domain.fixture", kind: "composition", title: "装配示例" },
  ] };
  assert.deepEqual(publicRegistryDomains(catalog).map(([key]) => key), ["structure", "mep", "media", "new-domain"]);
  assert.ok(publicRegistryDomains(catalog).some(([key, label]) => key === "media" && label === "影像与音频"));
  const matches = searchPublicRegistry(catalog, "风管 弯头", "component", "mep");
  assert.deepEqual(matches.map(entry => entry.id), ["mep.bend"]);
});

test("library components expose agent-usable capabilities", async () => {
  const registry = await buildRegistry();
  const components = registry.entries.filter(entry => entry.kind === "component");
  assert.ok(components.every(entry => entry.semanticType && entry.capabilities.length));
  assert.ok(components.some(entry => entry.capabilities.includes("attach")));
});

test("registry entries expose generated AI context for agents", async () => {
  const registry = await buildRegistry();
  for (const entry of registry.entries) {
    assert.ok(entry.agent?.intent, `${entry.id} requires agent intent`);
    assert.ok(Array.isArray(entry.agent.useWhen) && entry.agent.useWhen.length, `${entry.id} requires agent use cases`);
    assert.ok(Array.isArray(entry.agent.qualityChecks) && entry.agent.qualityChecks.length, `${entry.id} requires agent quality checks`);
    assert.equal(entry.agent.structure.kind, entry.kind);
    assert.deepEqual(entry.agent.structure.parameters, Object.keys(entry.parameters ?? {}));
    if (entry.editor?.document) {
      assert.equal(entry.agent.structure.nodeCount, entry.editor.document.parameters.nodes.length, `${entry.id} agent node count should match document`);
    }
  }

  const pathRepeat = registry.entries.find(entry => entry.id === "spatial.repeat-along-path");
  assert.ok(pathRepeat.agent.useWhen.some(item => item.includes("管线支吊架")));
  assert.ok(pathRepeat.agent.structure.repetitionPrototypes.some(item => item.prototypeId === "support" && item.type === "path"));
});

test("hand-authored AI guidance remains structurally honest", async () => {
  const registry = await buildRegistry();
  const keyboard = registry.entries.find(entry => entry.id === "electronics.keyboard");
  assert.ok(keyboard.ai.qualityChecks.some(item => item.includes("最后一排键")));
  assert.ok(keyboard.agent.editableParts.includes("spacebar"));

  const mouse = registry.entries.find(entry => entry.id === "electronics.mouse");
  assert.equal(mouse.summary.includes("底部传感器"), false);
  assert.equal(mouse.summary.includes("脚垫"), false);
  const mouseNodeIds = new Set(mouse.editor.document.parameters.nodes.map(node => node.id));
  for (const removedDetail of ["optical-sensor", "bottom-foot", "mouse-usb-plug", "wheel-ridge", "button-deck"]) {
    assert.equal(mouseNodeIds.has(removedDetail), false, `mouse should not expose removed detail ${removedDetail}`);
  }
  assert.ok(mouse.agent.avoidWhen.some(item => item.includes("高拟真")));
});

test("all library editor documents compile as editable CompositionSpec", async () => {
  const library = await buildRegistry();
  const core = createDefaultRegistry();
  const documents = library.entries.map(entry => entry.editor?.document).filter(Boolean);
  assert.ok(documents.length >= 2);
  for (const document of documents) {
    const result = core.build(document);
    assert.ok(result.nodes.length > 0, `${document.id} should expand nodes`);
  }
});

test("every complete model has visible editable content", async () => {
  const library = await buildRegistry();
  const completeModels = library.entries.filter(entry => entry.kind === "composition");
  for (const entry of completeModels) {
    assert.ok(entry.editor?.document?.parameters?.nodes?.length, `${entry.id} has no model content`);
  }
});

test("library-to-editor JSON transfer preserves every editable model build", async () => {
  const library = await buildRegistry();
  const core = createDefaultRegistry();
  for (const entry of library.entries) {
    if (!entry.editor?.document && !entry.editor?.node) continue;
    const document = modelDocumentFor(entry);
    const before = core.build(document);
    const transferred = JSON.parse(JSON.stringify({ source: entry.id, document })).document;
    const after = core.build(transferred);
    assert.deepEqual(after.nodes, before.nodes, `${entry.id} changes nodes during library import`);
    assert.deepEqual(after.bounds, before.bounds, `${entry.id} changes bounds during library import`);
    assert.deepEqual(after.anchors, before.anchors, `${entry.id} changes anchors during library import`);
  }
});

async function loadAssembly(file, componentIds) {
  const scene = JSON.parse(await readFile(new URL(`../examples/digital-modeling/${file}`, import.meta.url), "utf8"));
  const library = await buildRegistry();
  for (const [i, id] of componentIds.entries()) {
    const entry = library.entries.find(item => item.id === id);
    assert.deepEqual(scene.instances[i].parameters, modelDocumentFor(entry).parameters, id);
  }
  return scene;
}

test("a beam-column-slab bay validates against anchor positions derived from current box sizes", async () => {
  const scene = await loadAssembly("structure/beam-column-slab-bay.json", [
    "structure.rectangular-column", "structure.rectangular-column", "structure.rectangular-beam", "structure.rectangular-slab",
  ]);
  const core = createDefaultRegistry();
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.ok(composeScene(scene, core).relations.every(relation => relation.connected));
  const [left, right, beam, slab] = scene.instances;
  beam.parameters.nodes[0].geometry.size[0] = 6;
  assert.deepEqual(core.build(beam).anchors.local.end, [3, 0.2, 0]);
  assert.ok(checkScene(scene, core).issues.some(issue => issue.code === "SCENE_CONNECTION_GAP"));
  beam.transform.position[0] = slab.transform.position[0] = 3;
  right.transform.position[0] = 6;
  left.parameters.nodes[0].geometry.size[1] = 3.2;
  slab.parameters.nodes[0].geometry.size[1] = 0.4;
  assert.deepEqual(core.build(left).anchors.local["top-center"], [0, 3.1, 0]);
  assert.deepEqual(core.build(slab).anchors.local["bottom-center"], [0, -0.1, 0]);
  left.parameters.nodes[0].transform.position[1] = 1.4;
  slab.transform.position[1] = 3.5;
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
});

test("a straight tray and elbow keep equal profiles and recalculate anchor positions and directions", async () => {
  const scene = await loadAssembly("mep/cable-tray-connection.json", ["mep.cable-tray-straight", "mep.cable-tray-elbow"]);
  const [straight, elbow] = scene.instances;
  const straightGeometry = straight.parameters.nodes[0].geometry;
  assert.deepEqual(straightGeometry.profile, elbow.parameters.nodes[0].geometry.profile);
  const core = createDefaultRegistry();
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
  assert.ok(composeScene(scene, core).relations[0].connected);
  assert.deepEqual(core.build(elbow).anchors.worldDefinitions.end.direction, [1, 0, 0]);
  straightGeometry.points[1] = [2, 0, 0];
  const straightBuild = core.build(straight);
  assert.deepEqual(straightBuild.anchors.worldDefinitions.end.position, [2, 0, 0]);
  assert.deepEqual(straightBuild.anchors.worldDefinitions.end.direction, [1, 0, 0]);
  assert.deepEqual(straightBuild.instance.parameters.anchors.end, straight.parameters.anchors.end);
  elbow.transform.position = [2, 0, 0];
  assert.ok(checkScene(scene, core).issues.some(issue => issue.code === "SCENE_CONNECTION_DIRECTION"));
  elbow.transform.rotation = [0, Math.PI / 2, 0];
  assert.deepEqual(checkScene(scene, core), { ok: true, issues: [] });
});

test("geometry anchors report their own input paths when invalid", () => {
  const parameters = {
    nodes: [{ id: "box", geometry: { type: "box", size: [1, 1, 1] } }],
    anchors: {
      unbound: { onGeometry: { type: "box", fraction: [0, 0, 0] } },
      outside: { node: "box", onGeometry: { type: "box", fraction: [0.6, 0, 0] } },
      wrongGeometry: { node: "box", onGeometry: { type: "sweep-end", end: "start" } },
      both: { node: "box", position: [0, 0, 0], onGeometry: { type: "box", fraction: [0, 0, 0] } },
      fixed: { node: "box", position: [2, 0, 0] },
    },
  };
  const doc = { id: "geometry-anchor-check", component: "core.composition", parameters };
  assert.deepEqual(checkComposition(doc).issues.map(({ code, path }) => [code, path]), [
    ["ANCHOR_NODE_MISSING", "/parameters/anchors/unbound/node"],
    ["ANCHOR_GEOMETRY_INVALID", "/parameters/anchors/outside/onGeometry"],
    ["ANCHOR_GEOMETRY_INVALID", "/parameters/anchors/wrongGeometry/onGeometry"],
    ["ANCHOR_GEOMETRY_INVALID", "/parameters/anchors/both/onGeometry"],
  ]);
  assert.throws(() => createDefaultRegistry().build(doc), /requires a node for onGeometry/);
});

test("equipment entries describe the machine itself without scene cargo", async () => {
  const library = await buildRegistry();
  const equipment = library.entries.filter(entry => entry.id.startsWith("equipment."));
  assert.ok(equipment.length >= 3);
  for (const entry of equipment) {
    const nodes = entry.editor?.document?.parameters?.nodes ?? [];
    assert.ok(nodes.length > 0, `${entry.id} requires structured machine nodes`);
    assert.ok(nodes.every(node => node.semanticType?.startsWith("equipment.")), `${entry.id} mixes non-equipment scene objects`);
  }
});

test("vehicle wheel groups use coherent longitudinal and axle directions", async () => {
  const library = await buildRegistry();
  const truck = library.entries.find(entry => entry.id === "equipment.flatbed-truck");
  const truckNodes = truck.editor.document.parameters.nodes;
  const truckWheels = truckNodes.filter(node => node.semanticType?.includes("wheel") && !node.semanticType?.includes("hub"));
  assert.ok(truckWheels.length === 6);
  assert.ok(truckWheels.every(node => Math.abs(node.transform.rotation[0]) > 1.5), "truck wheel axles must run across vehicle width");
  assert.deepEqual(truckNodes.find(node => node.id === "fuel-tank").transform.rotation, [0,0,1.5708]);

  const excavator = library.entries.find(entry => entry.id === "equipment.tracked-excavator");
  const excavatorNodes = excavator.editor.document.parameters.nodes;
  assert.deepEqual(excavatorNodes.find(node => node.id === "upper").transform.rotation, [0,0,0]);
  for (const wheelGroup of excavatorNodes.filter(node => node.semanticType === "equipment.excavator.road-wheel")) {
    assert.deepEqual(wheelGroup.repetition.step.slice(1), [0,0], `${wheelGroup.id} must repeat along track length`);
  }
});

test("mobile crane hoist line and wheel groups stay in coherent world positions", async () => {
  const library = await buildRegistry();
  const core = createDefaultRegistry();
  const crane = library.entries.find(entry => entry.id === "equipment.mobile-panel-crane");
  const nodes = crane.editor.document.parameters.nodes;
  const boom = nodes.find(node => node.id === "boom");
  const line = nodes.find(node => node.id === "hook-line");
  const farTipX = boom.transform.position[0] - boom.geometry.size[0] / 2;
  assert.equal(line.parent, "boom-pivot");
  assert.deepEqual(line.geometry.start, [farTipX,0,0]);
  assert.equal(nodes.some(node => node.semanticType === "equipment.crane.sling"), false);
  assert.ok(nodes.length >= 40);
  for (const detail of ["left-wheel", "right-wheel", "jack-foot-pad", "counterweight", "winch-drum", "boom-brace-a", "hook-block"]) {
    assert.ok(nodes.some(node => node.id === detail), `mobile crane should expose ${detail}`);
  }
  assert.ok(crane.editor.document.parameters.anchors["boom-tip"]);
  assert.ok(crane.editor.document.parameters.anchors["base-contact"]);
  assert.ok(crane.editor.document.parameters.animations.some(animation => animation.id === "winch-drum-spin"));

  const wheelNodes = nodes.filter(node => node.semanticType === "equipment.crane.wheel");
  assert.equal(wheelNodes.length, 4);
  for (const wheel of wheelNodes) {
    assert.equal(wheel.repetition, undefined, `${wheel.id} should use explicit wheel placement because rotation changes repeated offsets`);
    assert.ok(Math.abs(wheel.transform.rotation[0]) > 1.5, `${wheel.id} axle should run across the vehicle width`);
    assert.ok(wheel.transform.position[1] < .35, `${wheel.id} should sit under the chassis`);
    assert.ok(Math.abs(wheel.transform.position[2]) > .75, `${wheel.id} should sit on a side of the chassis`);
  }
  const built = core.build(crane.editor.document);
  const leftWheel = built.nodes.find(node => node.metadata?.compositionNodeId === "left-wheel");
  assert.deepEqual(leftWheel.matrix.map(row => row[3]).slice(0, 3).map(value => Number(value.toFixed(2))), [-.82, .22, -.86]);
});

test("AI chip model exposes layered thermal structure and procedural fan", async () => {
  const library = await buildRegistry();
  const chip = library.entries.find(entry => entry.id === "electronics.ai-chip-cooling-module");
  const nodes = chip.editor.document.parameters.nodes;
  assert.ok(nodes.some(node => node.id === "die-array" && node.repetition?.type === "grid"));
  assert.equal(nodes.find(node => node.id === "heatsink-fin").repetition.count, 17);
  assert.equal(nodes.find(node => node.id === "fan-blade").repetition.type, "radial");
  assert.ok(nodes.some(node => node.appearance?.emissive && node.appearance?.glow));
  assert.ok(chip.editor.document.parameters.animations.some(animation => animation.id === "fan-spin"));
});

test("fire safety models expose hydrant outlets and extinguisher hose details", async () => {
  const library = await buildRegistry();
  const hydrant = library.entries.find(entry => entry.id === "equipment.fire-hydrant");
  const hydrantNodes = hydrant.editor.document.parameters.nodes;
  assert.ok(hydrantNodes.some(node => node.id === "front-outlet"));
  assert.equal(hydrantNodes.filter(node => node.semanticType === "equipment.fire.hydrant.outlet-cap").length, 3);
  assert.ok(hydrant.editor.document.parameters.anchors["main-outlet"]);
  assert.ok(hydrant.editor.document.parameters.anchors["operating-point"]);

  const extinguisher = library.entries.find(entry => entry.id === "equipment.fire-extinguisher");
  const extinguisherNodes = extinguisher.editor.document.parameters.nodes;
  assert.ok(extinguisherNodes.some(node => node.id === "hose" && node.geometry.type === "tube-along"));
  assert.ok(extinguisherNodes.some(node => node.id === "nozzle" && node.geometry.type === "cylinder-between"));
  assert.ok(extinguisherNodes.some(node => node.id === "pressure-gauge"));
  assert.ok(extinguisher.editor.document.parameters.anchors["nozzle-tip"]);
});

test("MEP rough-in entries expose reusable route, slope, clip, and pressure-test capabilities", async () => {
  const library = await buildRegistry();
  const clip = library.entries.find(entry => entry.id === "mep.pipe-clip");
  assert.ok(clip, "pipe clip component should exist");
  assert.ok(clip.agent.structure.anchors.includes("pipe-center"));
  assert.ok(clip.agent.structure.geometryTypes.includes("torus"));

  for (const methodId of ["mep.route-with-clips", "mep.drain-slope-check", "mep.pressure-test-loop"]) {
    const method = library.entries.find(entry => entry.id === methodId);
    assert.ok(method, `${methodId} should exist`);
    assert.ok(method.capabilities.includes("mep"));
    assert.ok(method.agent.useWhen.length > 0);
  }

  const roughIn = library.entries.find(entry => entry.id === "mep.water-electric-rough-in-system");
  assert.ok(roughIn, "rough-in composition should exist");
  const nodes = roughIn.editor.document.parameters.nodes;
  assert.ok(nodes.some(node => node.id === "cold-water" && node.geometry.type === "tube-along"));
  assert.ok(nodes.some(node => node.id === "floor-drain" && node.metadata?.method === "mep.drain-slope-check"));
  assert.ok(nodes.some(node => node.id === "pressure-gauge-face"));
  const clipNode = nodes.find(node => node.id === "cold-water-clip");
  assert.equal(clipNode.repetition.type, "path");
  assert.equal(clipNode.orientation.mode, "tangent");
  assert.ok(roughIn.editor.document.parameters.anchors["gauge-read"]);
  assert.ok(roughIn.agent.qualityChecks.some(item => item.includes("mep.drain-slope-check")));
});

test("desktop electronics models expose monitor, keyboard, mouse, laptop, and tower details", async () => {
  const library = await buildRegistry();
  const monitor = library.entries.find(entry => entry.id === "electronics.display-monitor");
  const monitorNodes = monitor.editor.document.parameters.nodes;
  assert.ok(monitorNodes.some(node => node.id === "display-surface"));
  assert.ok(monitorNodes.some(node => node.id === "stand-neck"));
  assert.ok(monitor.editor.document.parameters.anchors["display-center"]);

  const keyboard = library.entries.find(entry => entry.id === "electronics.keyboard");
  const keyboardNodes = keyboard.editor.document.parameters.nodes;
  assert.equal(keyboardNodes.find(node => node.id === "main-key").repetition.count, 10);
  assert.equal(keyboardNodes.find(node => node.id === "home-row-key").repetition.count, 9);
  assert.equal(keyboardNodes.find(node => node.id === "bottom-letter-key").repetition.count, 7);
  assert.deepEqual(keyboardNodes.find(node => node.id === "numeric-key").repetition.count, [3, 1, 4]);
  assert.ok(keyboardNodes.some(node => node.id === "spacebar"));
  assert.ok(keyboard.editor.document.parameters.anchors["usb-exit"]);

  const mouse = library.entries.find(entry => entry.id === "electronics.mouse");
  const mouseNodes = mouse.editor.document.parameters.nodes;
  assert.ok(mouseNodes.some(node => node.id === "body-shell" && node.geometry.type === "sphere"));
  assert.ok(mouseNodes.some(node => node.id === "scroll-wheel"));
  assert.ok(mouseNodes.some(node => node.id === "mouse-cable" && node.geometry.type === "tube-along"));

  const laptop = library.entries.find(entry => entry.id === "electronics.laptop");
  const laptopNodes = laptop.editor.document.parameters.nodes;
  assert.ok(laptopNodes.some(node => node.id === "screen-display"));
  assert.deepEqual(laptopNodes.find(node => node.id === "keyboard-key").repetition.count, [14, 5, 1]);
  assert.ok(laptopNodes.some(node => node.id === "trackpad"));
  assert.ok(laptop.editor.document.parameters.anchors["screen-center"]);
  assert.ok(laptop.editor.document.parameters.anchors["desk-contact"]);
  assert.ok(laptop.agent.editableParts.includes("screen-display"));

  const tower = library.entries.find(entry => entry.id === "electronics.desktop-tower");
  const towerNodes = tower.editor.document.parameters.nodes;
  assert.equal(towerNodes.find(node => node.id === "fan-blade").repetition.type, "radial");
  assert.ok(towerNodes.some(node => node.id === "power-button"));
  assert.ok(tower.editor.document.parameters.anchors["power-inlet"]);
});

test("desktop electronics models use coherent real-world metric scale", async () => {
  const library = await buildRegistry();
  const core = createDefaultRegistry();
  const boundsFor = id => core.build(library.entries.find(entry => entry.id === id).editor.document).bounds.size;
  const laptop = boundsFor("electronics.laptop");
  const keyboard = boundsFor("electronics.keyboard");
  const mouse = boundsFor("electronics.mouse");
  const monitor = boundsFor("electronics.display-monitor");
  const tower = boundsFor("electronics.desktop-tower");

  assert.ok(laptop[0] > .3 && laptop[0] < .45, "laptop should remain realistic notebook width");
  assert.ok(keyboard[0] > .35 && keyboard[0] < .5, "keyboard should not be meter-scale");
  assert.ok(mouse[2] > .09 && mouse[2] < .14, "mouse length should be hand-scale");
  assert.ok(monitor[0] > .45 && monitor[0] < .65, "monitor should be larger than laptop but not room-scale");
  assert.ok(tower[1] > .35 && tower[1] < .5, "desktop tower height should be case-scale");
});

test("basic human figure exposes scale, bilateral limbs, and posture anchors", async () => {
  const library = await buildRegistry();
  const core = createDefaultRegistry();
  const human = library.entries.find(entry => entry.id === "character.basic-human-figure");
  const poseMethod = library.entries.find(entry => entry.id === "character.human-pose-rig");
  const surfaceMethod = library.entries.find(entry => entry.id === "character.human-surface-lowpoly");
  assert.ok(human, "human figure should exist in the model library");
  assert.ok(poseMethod, "human pose rig method should exist in the model library");
  assert.ok(surfaceMethod, "human surface method should exist in the model library");
  assert.ok(human.capabilities.includes("no-glb"));
  assert.ok(human.capabilities.includes("joint-chain"));
  assert.ok(human.capabilities.includes("finger-chain"));
  assert.ok(human.capabilities.includes("finger-pivots"));
  assert.ok(human.capabilities.includes("reach-analysis"));
  assert.ok(human.capabilities.includes("ik-lite-compatible"));
  assert.ok(human.capabilities.includes("hand-grasp-pose"));
  assert.ok(human.capabilities.includes("fine-hand-anchors"));
  assert.ok(human.capabilities.includes("low-poly-worker"));
  assert.ok(human.capabilities.includes("safety-clothing"));
  assert.ok(human.capabilities.includes("human-surface-lowpoly"));
  assert.ok(human.capabilities.includes("human-section-profile"));
  assert.ok(human.capabilities.includes("surface-refinement-ready"));
  assert.ok(human.capabilities.includes("lofted-surface"));
  assert.ok(human.capabilities.includes("section-loft-body"));
  assert.ok(human.capabilities.includes("section-loft-head"));
  assert.ok(human.capabilities.includes("section-loft-hands"));
  assert.ok(human.capabilities.includes("face-lite"));
  assert.ok(human.capabilities.includes("glb-reference-informed-proportions"));
  assert.ok(poseMethod.capabilities.includes("ik-lite"));
  assert.ok(poseMethod.capabilities.includes("grasp-pose"));
  assert.ok(poseMethod.capabilities.includes("hand-grasp-pose"));
  assert.ok(poseMethod.capabilities.includes("finger-curl"));
  assert.ok(surfaceMethod.capabilities.includes("human-surface"));
  assert.ok(surfaceMethod.capabilities.includes("human-section-profile"));
  assert.ok(surfaceMethod.capabilities.includes("semantic-fingers"));
  assert.ok(surfaceMethod.capabilities.includes("surface-refinement"));
  assert.ok(surfaceMethod.capabilities.includes("add-missing-surface-nodes"));
  assert.ok(surfaceMethod.capabilities.includes("tapered-cylinder-between"));
  assert.ok(surfaceMethod.capabilities.includes("tapered-limbs"));
  assert.ok(surfaceMethod.capabilities.includes("lofted-surface"));
  assert.ok(surfaceMethod.capabilities.includes("section-loft-body"));
  assert.ok(surfaceMethod.capabilities.includes("section-loft-head"));
  assert.ok(surfaceMethod.capabilities.includes("section-loft-hands"));
  assert.ok(surfaceMethod.capabilities.includes("face-lite"));
  assert.ok(surfaceMethod.capabilities.includes("changeset-proposal"));
  assert.ok(human.capabilities.includes("pose-changeset"));

  const nodes = human.editor.document.parameters.nodes;
  for (const requiredNode of ["head-pivot", "head", "nose", "left-cheek-facet", "right-cheek-facet", "safety-helmet-shell", "safety-helmet-brim", "safety-helmet-front-badge", "left-glasses-rim", "right-glasses-rim", "left-brow", "right-brow", "chest", "left-shirt-side-facet", "right-shirt-side-facet", "shirt-placket", "left-chest-pocket", "right-chest-pocket", "belt-buckle", "pelvis", "left-clavicle", "right-clavicle", "left-sleeve-cap", "right-sleeve-cap", "left-upper-arm", "right-upper-arm", "left-sleeve-cuff", "right-sleeve-cuff", "right-elbow-pivot", "left-thigh", "right-thigh", "left-thigh-front-crease", "right-thigh-front-crease", "left-knee-pivot", "left-hand", "right-hand", "left-thumb-pivot", "right-thumb-pivot", "left-index-finger-pivot", "right-index-finger-pivot", "left-thumb-distal", "right-thumb-distal", "left-index-finger", "right-index-finger", "left-middle-finger", "right-middle-finger", "left-ring-finger", "right-ring-finger", "left-little-finger", "right-little-finger", "left-shoe", "right-shoe", "left-boot-sole", "right-boot-sole", "left-boot-lace-b", "right-boot-lace-b"]) {
    assert.ok(nodes.some(node => node.id === requiredNode), `human figure should expose ${requiredNode}`);
  }
  for (const node of nodes) {
    assert.notEqual(node.geometry?.type, "model", "human figure must not rely on imported model geometry");
  }

  const anchors = human.editor.document.parameters.anchors;
  for (const requiredAnchor of ["head-top", "eye-forward", "left-hand-grip", "right-hand-grip", "left-thumb-tip", "right-thumb-tip", "left-index-tip", "right-index-tip", "left-middle-tip", "right-middle-tip", "left-foot-contact", "right-foot-contact"]) {
    assert.ok(anchors[requiredAnchor], `human figure should expose ${requiredAnchor}`);
  }

  const leftArm = nodes.find(node => node.id === "left-upper-arm").geometry;
  const rightArm = nodes.find(node => node.id === "right-upper-arm").geometry;
  const chest = nodes.find(node => node.id === "chest").geometry;
  const leftThigh = nodes.find(node => node.id === "left-thigh").geometry;
  const head = nodes.find(node => node.id === "head").geometry;
  const rightHand = nodes.find(node => node.id === "right-hand").geometry;
  assert.equal(chest.type, "lofted-surface");
  assert.equal(chest.sections[1].id, "chest-full");
  assert.ok(chest.sections[1].radiusX > chest.sections[0].radiusX, "chest loft should widen toward the upper chest before shoulder taper");
  assert.equal(leftThigh.type, "lofted-surface");
  assert.ok(leftThigh.sections[0].radiusX > leftThigh.sections[2].radiusX, "thigh loft should taper toward the knee");
  assert.equal(head.type, "lofted-surface");
  assert.deepEqual(head.sections.map(section => section.id), ["jaw", "mouth-cheek", "eye-cheek", "temple", "crown"]);
  assert.equal(rightHand.type, "lofted-surface");
  assert.equal(rightHand.sections[2].id, "knuckle-row");
  assert.equal(leftArm.type, "lofted-surface");
  assert.ok(leftArm.sections[0].radiusX > leftArm.sections[2].radiusX, "upper arm loft should taper from shoulder toward elbow");
  assert.ok(Math.abs(leftArm.sections[0].center[0] + rightArm.sections[0].center[0]) < 1e-9, "left and right arms should mirror across the x axis");
  assert.ok(Math.abs(leftArm.sections[2].center[0] + rightArm.sections[2].center[0]) < 1e-9, "left and right elbows should mirror across the x axis");
  assert.equal(nodes.find(node => node.id === "right-forearm").parent, "right-elbow-pivot");
  assert.equal(nodes.find(node => node.id === "right-hand").parent, "right-wrist-pivot");
  assert.equal(nodes.find(node => node.id === "right-index-finger").parent, "right-index-finger-pivot");
  assert.equal(nodes.find(node => node.id === "right-index-tip").parent, "right-index-finger-pivot");
  assert.equal(nodes.find(node => node.id === "right-thumb").parent, "right-thumb-pivot");
  assert.equal(nodes.find(node => node.id === "chest").appearance.color, "#ffdc4f");
  assert.equal(nodes.find(node => node.id === "safety-helmet-shell").appearance.color, "#f5f7f5");
  assert.equal(nodes.find(node => node.id === "right-hand").appearance.color, "#fbfbf4");

  const built = core.build(human.editor.document);
  assert.ok(built.bounds.size[1] > 1.7 && built.bounds.size[1] < 1.9, "human figure should remain realistic standing scale");
  assert.ok(built.bounds.size[0] > 0.62 && built.bounds.size[0] < 0.76, "human figure width should stay close to standing-worker reference proportions");
  assert.ok(Object.keys(built.anchors.definitions).length >= 29, "compiled human figure should preserve posture and fingertip anchors");
  assert.ok(built.anchors.world["eye-forward"][1] > 1.6, "eye-forward anchor should stay on the head instead of falling back to the origin");
  assert.ok(built.anchors.world["eye-forward"][2] > 0.09, "eye-forward anchor should point from the face side of the head");
  assert.ok(built.anchors.world["right-index-tip"][1] < built.anchors.world["right-hand-grip"][1], "right index fingertip should extend below the palm grip point");
  assert.ok(human.editor.document.parameters.relations.some(relation => relation.type === "finger-chain" && relation.name === "right-index" && relation.nodes.includes("right-index-finger-pivot")));
  assert.equal(human.editor.document.parameters.metrics.handDetailLevel, "palm-thumb-four-fingers-with-finger-pivots");
  assert.ok(human.editor.document.parameters.animations.some(animation => animation.target === "right-elbow-pivot"));
  assert.ok(human.editor.document.parameters.metrics.poseMethod === "character.human-pose-rig");
  assert.ok(human.agent.qualityChecks.some(item => item.includes("左右肢体") || item.includes("left/right")));
  const target = [0.45, 1.12, 0.22];
  const ikProposal = proposeHumanIkReachChangeset(human.editor.document, { side: "right", target, tolerance: 0.035 });
  assert.equal(ikProposal.intent, "human-ik-reach-pose");
  assert.equal(ikProposal.facts.solver, "two-bone-ik-lite");
  assert.equal(ikProposal.facts.withinTolerance, true);
  assert.deepEqual(ikProposal.facts.changedNodeIds, ["right-shoulder-pivot", "right-elbow-pivot"]);
  assert.ok(ikProposal.facts.finalError < 0.035);
  const ikChanged = applyCompositionChangesetProposal(human.editor.document, ikProposal);
  const ikBuilt = compileCompositionSpec(ikChanged.parameters, { instanceId: ikChanged.id });
  const hand = ikBuilt.anchors["right-hand-grip"].position;
  assert.ok(Math.hypot(hand[0] - target[0], hand[1] - target[1], hand[2] - target[2]) < 0.035);

  const graspProposal = proposeHumanGraspChangeset(human.editor.document, { side: "right", graspType: "pinch", target });
  assert.equal(graspProposal.intent, "human-grasp-pose");
  assert.equal(graspProposal.facts.solver, "hand-grasp-pose-lite");
  assert.equal(graspProposal.facts.graspType, "pinch");
  assert.equal(graspProposal.facts.wristOriented, true);
  assert.ok(graspProposal.facts.changedNodeIds.includes("right-index-finger-pivot"));
  assert.ok(graspProposal.facts.changedNodeIds.includes("right-thumb-pivot"));
  assert.ok(graspProposal.facts.changedNodeIds.includes("right-wrist-pivot"));
  const graspChanged = applyCompositionChangesetProposal(human.editor.document, graspProposal);
  assert.ok(graspChanged.parameters.nodes.find(node => node.id === "right-index-finger-pivot").transform.rotation[0] < -0.2);
  assert.ok(graspChanged.parameters.nodes.find(node => node.id === "right-thumb-pivot").transform.rotation[2] < -0.2);
});

test("human part modules expose reusable head, hand, and foot geometry", async () => {
  const library = await buildRegistry();
  const head = library.entries.find(entry => entry.id === "character.human-head-module");
  const hand = library.entries.find(entry => entry.id === "character.human-right-hand-module");
  const foot = library.entries.find(entry => entry.id === "character.human-right-foot-module");
  assert.ok(head);
  assert.ok(hand);
  assert.ok(foot);
  assert.ok(head.capabilities.includes("human-head-module"));
  assert.ok(hand.capabilities.includes("human-hand-module"));
  assert.ok(foot.capabilities.includes("human-foot-module"));
  assert.equal(head.editor.document.parameters.nodes.find(node => node.id === "nose").geometry.type, "lofted-surface");
  assert.equal(hand.editor.document.parameters.nodes.find(node => node.id === "right-hand").geometry.type, "lofted-surface");
  assert.equal(foot.editor.document.parameters.nodes.find(node => node.id === "right-shoe").geometry.type, "lofted-surface");
  assert.ok(head.editor.document.parameters.anchors["eye-forward"]);
  assert.ok(hand.editor.document.parameters.anchors["hand-grip"]);
  assert.ok(foot.editor.document.parameters.anchors["foot-contact"]);
  assert.equal(analyzeHumanModelQuality(head.editor.document).rating, "usable-baseline");
  assert.equal(analyzeHumanModelQuality(hand.editor.document).rating, "usable-baseline");
  assert.equal(analyzeHumanModelQuality(foot.editor.document).rating, "usable-baseline");
});

test("model previews auto-fit small real-world objects instead of capping at a fixed zoom", () => {
  const smallModelZoom = modelPreviewZoomForExtent({ width: 320, height: 190, extent: .18, zoom: 100 });
  const largeModelZoom = modelPreviewZoomForExtent({ width: 320, height: 190, extent: 2.4, zoom: 100 });
  assert.ok(smallModelZoom > 400, "small metric models should be enlarged in preview");
  assert.ok(largeModelZoom < smallModelZoom / 8, "large models should be fitted down relative to small models");
});

test("library repetitions use current CompositionSpec field names", async () => {
  const library = await buildRegistry();
  for (const entry of library.entries) {
    for (const node of entry.editor?.document?.parameters?.nodes ?? []) {
      if (node.repetition?.type === "grid") {
        assert.equal(node.repetition.origin, undefined, `${entry.id}/${node.id} uses legacy grid origin`);
        assert.equal(node.repetition.steps, undefined, `${entry.id}/${node.id} uses legacy grid steps`);
        assert.ok(node.repetition.stepX && node.repetition.stepY && node.repetition.stepZ, `${entry.id}/${node.id} requires explicit grid steps`);
      }
    }
  }
});
