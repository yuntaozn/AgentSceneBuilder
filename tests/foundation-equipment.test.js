import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { insertLibraryGroup } from "../apps/editor/library-insert.js";
import { checkComposition, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const load = async path => {
  const manifest = JSON.parse(await readFile(new URL(`../registry/${path}/manifest.json`, import.meta.url), "utf8"));
  return manifest.editor.document;
};
const setPose = (document, id, value) => {
  document.parameters.poseControls.find(control => control.id === id).value = value;
};
const node = (build, id) => build.nodes.find(part => part.metadata.compositionNodeId === id);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test("the nursery tray follows its rolling bench bay and drains through the actual open frame", async t => {
  const [bench, tray] = await Promise.all([
    load("compositions/rolling-aisle-nursery-bench-with-three-matching-tray-bays"),
    load("components/site/removable-ebb-flow-nursery-tray-with-open-drain-and-adjustable-weir"),
  ]);
  const { document, groupId } = insertLibraryGroup(bench, tray);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = "tray-bay-1";
  root.transform = { position: [0, 0.753, 0] };
  document.parameters.attachments = [{
    from: "tray-1", to: `${groupId}.bench-fit`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const before = registry.build(document);
  const drain = sweepRay(t, [node(before, "windowed-grid-1"), node(before, `${groupId}.drained-pan`), node(before, `${groupId}.ring`)]);
  assert.equal(drain([0.143, 0.812, 0], [0, -1, 0]).length, 0);
  assert.ok(drain([0.143, 0.812, 0.039], [0, -1, 0]).length > 0);
  for (const x of [-0.229, 0.229]) for (const z of [-0.151, 0.151]) assert.equal(drain([x, 0.812, z], [0, -1, 0]).length, 0);
  setPose(document, "bed-lateral-travel", 0.174);
  setPose(document, `${groupId}.weir-travel`, 0.034);
  const shifted = registry.build(document);
  near(shifted.anchors.world[`${groupId}.water-return`][2], 0.174);
  near(shifted.anchors.world[`${groupId}.weir-top`][1], before.anchors.world[`${groupId}.weir-top`][1] + 0.034);
  assert.deepEqual(shifted.anchors.world.floor, before.anchors.world.floor);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the tree basket stays seated while its halves and the trolley saddles move independently", async () => {
  const [cart, basket] = await Promise.all([
    load("compositions/low-deck-root-ball-transport-cart-with-sliding-curved-saddles"),
    load("components/site/split-root-ball-transport-basket-with-independent-opening-halves"),
  ]);
  const { document, groupId } = insertLibraryGroup(cart, basket);
  document.parameters.nodes.find(part => part.id === groupId).transform = { position: [0, 0.254, 0] };
  document.parameters.attachments = [{
    from: "basket", to: `${groupId}.cart-seat`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const before = registry.build(document);
  setPose(document, "saddle-position-0", 0.093);
  setPose(document, `${groupId}.half-slide-1`, 0.17);
  const after = registry.build(document);
  near(after.anchors.world["saddle-center-0"][0], before.anchors.world["saddle-center-0"][0] + 0.093);
  near(after.anchors.world[`${groupId}.half-lift-1`][0], before.anchors.world[`${groupId}.half-lift-1`][0] + 0.17);
  for (const id of ["basket", "saddle-center-1", `${groupId}.half-lift--1`, `${groupId}.plant-center`]) {
    assert.deepEqual(after.anchors.world[id], before.anchors.world[id]);
  }
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the precast landing aligns both stair bores and carries compatible handrail posts", async t => {
  const [stair, landing, post] = await Promise.all([
    load("compositions/ten-step-precast-stair-flight-with-end-dowel-recesses-and-rail-seats"),
    load("compositions/recessed-precast-stair-landing-panel-with-two-slide-pin-inserts"),
    load("components/construction/removable-precast-stair-handrail-post-with-pinned-swivel-shoe"),
  ]);
  const ledge = insertLibraryGroup(stair, landing);
  const railing = insertLibraryGroup(ledge.document, post);
  const document = railing.document;
  document.parameters.nodes.find(part => part.id === ledge.groupId).transform = { position: [2.837, 1.57, 0] };
  const foot = document.parameters.nodes.find(part => part.id === railing.groupId);
  const mount = `${ledge.groupId}.guardrail-0.53`, seat = document.parameters.anchors[mount];
  foot.parent = seat.node;
  foot.transform = { position: seat.position };
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [
    { from: "top-landing", to: `${ledge.groupId}.stair-edge`, contract },
    ...[-1, 1].map(side => ({ from: `upper-dowel-${side}`, to: `${ledge.groupId}.dowel-seat-${side}`, contract })),
    { from: mount, to: `${railing.groupId}.stair-fit`, contract },
  ];
  const before = registry.build(document);
  const bores = sweepRay(t, [node(before, `${ledge.groupId}.front-dowel-recess-zone`), ...[-1, 1].flatMap(side => [
    node(before, `upper-dowel-sleeve-${side}`), node(before, `${ledge.groupId}.pin-socket-${side}`),
  ])]);
  for (const z of [-0.352, 0.352]) {
    assert.equal(bores([2.7595, 1.4605, z], [1, 0, 0]).length, 0);
    assert.ok(bores([2.7595, 1.4605, z + 0.026], [1, 0, 0]).length > 0);
  }
  const moving = `${ledge.groupId}.dowel-tip--1`, fixed = `${ledge.groupId}.dowel-tip-1`;
  setPose(document, `${ledge.groupId}.dowel-travel--1`, 0.07);
  setPose(document, `${railing.groupId}.lid-open`, 68);
  const fitted = registry.build(document);
  near(fitted.anchors.world[moving][0], before.anchors.world[moving][0] - 0.07);
  assert.deepEqual(fitted.anchors.world[fixed], before.anchors.world[fixed]);
  assert.deepEqual(fitted.anchors.world[`${railing.groupId}.stair-fit`], before.anchors.world[`${railing.groupId}.stair-fit`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the micropile armature remains clear while its four-hole cap carries a separately moving jack", async t => {
  const [pile, cap, jack] = await Promise.all([
    load("components/structure/sectioned-grouted-micropile-head-with-removable-shear-key-collar"),
    load("components/structure/four-hole-micropile-underpinning-cap-with-sliding-eccentric-head"),
    load("components/equipment/low-profile-underpinning-jack-cartridge-with-open-stroke-indicator"),
  ]);
  const head = insertLibraryGroup(pile, cap);
  const lift = insertLibraryGroup(head.document, jack);
  const document = lift.document;
  document.parameters.nodes.find(part => part.id === head.groupId).transform = { position: [0, 0.915, 0] };
  const jackRoot = document.parameters.nodes.find(part => part.id === lift.groupId);
  jackRoot.parent = `${head.groupId}.sliding-thrust-pad`;
  jackRoot.transform = { position: [0, 0.173, 0] };
  document.parameters.attachments = [
    { from: "pile-face", to: `${head.groupId}.pile-fit`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
    { from: `${head.groupId}.bearing-pad`, to: `${lift.groupId}.lower-seat`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
  ];
  const installed = registry.build(document);
  const hole = sweepRay(t, [node(installed, "contact-plate"), node(installed, `${head.groupId}.match-plate`)]);
  for (const x of [-0.091, 0.091]) for (const z of [-0.073, 0.073]) assert.equal(hole([x, 0.865, z], [0, 1, 0]).length, 0);
  assert.equal(hole([0, 0.865, 0], [0, 1, 0]).length, 0);
  assert.ok(hole([0.04, 0.865, 0.043], [0, 1, 0]).length > 0);
  setPose(document, "collar-release", 0.07);
  setPose(document, `${head.groupId}.pad-offset`, 0.035);
  setPose(document, `${lift.groupId}.lift-stroke`, 0.039);
  const adjusted = registry.build(document);
  const key = `${lift.groupId}.upper-seat`;
  near(adjusted.anchors.world[key][0], 0.035);
  near(adjusted.anchors.world[key][1], installed.anchors.world[key][1] + 0.039);
  assert.deepEqual(adjusted.anchors.world["shaft-axis"], installed.anchors.world["shaft-axis"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("both geothermal bore-mouth fittings clear all four lines of the independently removable U loops", async t => {
  const [borehole, collar, lid] = await Promise.all([
    load("compositions/cutaway-double-u-loop-geothermal-borehole-with-removable-probes"),
    load("components/mep/four-channel-geothermal-bore-centering-spider-with-adjustable-rollers"),
    load("components/construction/split-surface-borehole-header-cap-with-four-separate-through-glands"),
  ]);
  for (const fitting of [collar, lid]) {
    const { document, groupId } = insertLibraryGroup(structuredClone(borehole), fitting);
    const primary = document.parameters.nodes.find(part => part.id === groupId);
    primary.transform = { position: [0, 1.8, 0] };
    document.parameters.attachments = [{
      from: "mouth", to: `${groupId}.${fitting === collar ? "bottom" : "casing"}`,
      contract: { direction: "opposed", gapTolerance: 1e-6 },
    }];
    const before = registry.build(document);
    const clearances = sweepRay(t, before.nodes.filter(part => part.metadata.compositionNodeId.startsWith(`${groupId}.`) &&
      /\.(?:four-tube-guide|civil-seat|cover-half-|union-)/.test(part.metadata.compositionNodeId)));
    for (let loop = 0; loop < 2; loop++) for (let side = 0; side < 2; side++) {
      const [x, , z] = before.anchors.world[`port-${loop}-${side}`];
      assert.equal(clearances([x, 1.794, z], [0, 1, 0]).length, 0);
    }
    setPose(document, "loop-lift-0", 0.28);
    const raised = registry.build(document);
    near(raised.anchors.world["port-0-0"][1], before.anchors.world["port-0-0"][1] + 0.28);
    assert.deepEqual(raised.anchors.world["port-1-0"], before.anchors.world["port-1-0"]);
    assert.deepEqual(raised.anchors.world.mouth, before.anchors.world.mouth);
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  }
});

test("the laboratory fixture fits both vibration axes and the climate cabinet's probe ports remain open", async t => {
  const [vertical, horizontal, fixture, cabinet] = await Promise.all([
    load("compositions/sectioned-electrodynamic-vibration-shaker-with-guided-armature"),
    load("compositions/slide-axis-laboratory-vibration-table-with-two-flexure-pairs"),
    load("components/instrument/modular-cross-slot-vibration-test-fixture-plate-with-adjustable-clamps"),
    load("compositions/walk-up-climate-test-cabinet-with-sliding-sample-rack-carriage"),
  ]);
  const axes = [
    [vertical, "test-fixture", "shaker-table", "armature-position", 0.018, 1],
    [horizontal, "load-platform", "slip-plate", "slip-travel", 0.007, 0],
  ];
  for (const [table, seat, part, control, distance, movingAxis] of axes) {
    const { document, groupId } = insertLibraryGroup(table, structuredClone(fixture));
    const root = document.parameters.nodes.find(node => node.id === groupId);
    const dock = document.parameters.anchors[seat];
    root.parent = dock.node;
    root.transform = { position: dock.position };
    document.parameters.attachments = [{
      from: seat, to: `${groupId}.mounting-grid`, contract: { direction: "opposed", gapTolerance: 1e-6 },
    }];
    const before = registry.build(document);
    const fixtureMesh = sweepRay(t, [node(before, part), node(before, `${groupId}.fixture-plate`)]);
    const y = before.anchors.world[seat][1] - 0.052;
    for (const x of [-0.142, 0.142]) for (const z of [-0.112, 0.112]) {
      assert.equal(fixtureMesh([x, y, z], [0, 1, 0]).length, 0);
    }
    setPose(document, control, distance);
    const after = registry.build(document);
    const point = `${groupId}.specimen-centre`;
    near(after.anchors.world[point][movingAxis], before.anchors.world[point][movingAxis] + distance);
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  }
  const climate = registry.build(cabinet);
  const ports = sweepRay(t, climate.nodes.filter(node => /^(?:ported-side|feed-through-shell-)/.test(node.metadata.compositionNodeId)));
  for (const z of [-0.149, 0.075, 0.205]) {
    assert.equal(ports([0.485, 0.797, z], [-1, 0, 0]).length, 0);
    assert.ok(ports([0.485, 0.835, z], [-1, 0, 0]).length > 0);
  }
});

test("the bascule span carries its counterweight and exposes a through lock pocket at the closed position", async t => {
  const [leaf, counterweight, spanLock] = await Promise.all([
    load("compositions/single-leaf-bascule-bridge-deck-with-moving-lock-and-counterweight-seats"),
    load("components/structure/four-bolt-bascule-bridge-counterweight-carrier-with-sliding-blocks"),
    load("components/structure/sliding-bascule-span-lock-wedge-and-hollow-receiver"),
  ]);
  const weight = insertLibraryGroup(leaf, counterweight);
  const lock = insertLibraryGroup(weight.document, spanLock);
  const document = lock.document;
  const root = document.parameters.nodes.find(part => part.id === weight.groupId);
  root.parent = "moving-deck";
  root.transform = { position: [-0.61, -0.196, 0] };
  document.parameters.nodes.find(part => part.id === lock.groupId).transform = { position: [3.267, 0.621, 0] };
  document.parameters.attachments = [
    { from: "counterweight-face", to: `${weight.groupId}.leaf-face`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
    { from: "leaf-nose", to: `${lock.groupId}.span-face`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
  ];
  setPose(document, "leaf-angle", 0);
  const closed = registry.build(document);
  const bore = sweepRay(t, [node(closed, "open-lock-nose"), node(closed, `${lock.groupId}.receiver`)]);
  assert.equal(bore([3.207, 0.621, 0], [1, 0, 0]).length, 0);
  assert.ok(bore([3.207, 0.621, 0.082], [1, 0, 0]).length > 0);
  setPose(document, `${lock.groupId}.wedge-stroke`, 0.089);
  const latched = registry.build(document);
  assert.ok(latched.anchors.world[`${lock.groupId}.bolt-tip`][0] < closed.anchors.world["leaf-nose"][0]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  document.parameters.attachments.pop();
  setPose(document, `${lock.groupId}.wedge-stroke`, 0);
  setPose(document, "leaf-angle", 55);
  const lifted = registry.build(document);
  assert.ok(lifted.anchors.world["leaf-nose"][1] > 2.9);
  assert.ok(lifted.anchors.world[`${weight.groupId}.counterweight-center`][1] < closed.anchors.world[`${weight.groupId}.counterweight-center`][1]);
  assert.deepEqual(lifted.anchors.world[`${lock.groupId}.span-face`], closed.anchors.world[`${lock.groupId}.span-face`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("seam tooling separates clamping, longitudinal head travel and pipe root-gap geometry", async () => {
  const [bed, head, joint] = await Promise.all([
    load("compositions/longitudinal-seam-weld-bed-with-opposed-copper-finger-banks"),
    load("components/equipment/four-hole-linear-seam-torch-module-with-slide-and-angle-pivot"),
    load("components/construction/sectioned-paired-steel-pipe-butt-joint-with-adjustable-bevel-gap"),
  ]);
  const { document, groupId } = insertLibraryGroup(bed, head);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = "torch-shuttle";
  root.transform = { position: [0, 1.147, 0] };
  document.parameters.attachments = [{
    from: "weld-head-seat", to: `${groupId}.seat`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const before = registry.build(document);
  setPose(document, "head-travel", 0.42);
  setPose(document, "bank-drop--1", 0.025);
  setPose(document, `${groupId}.head-slide`, 0.066);
  const after = registry.build(document);
  near(after.anchors.world[`${groupId}.tool-point`][0], 0.42);
  near(after.anchors.world[`${groupId}.tool-point`][1], before.anchors.world[`${groupId}.tool-point`][1] - 0.066);
  near(after.anchors.world["pressure-line--1"][1], before.anchors.world["pressure-line--1"][1] - 0.025);
  assert.deepEqual(after.anchors.world["pressure-line-1"], before.anchors.world["pressure-line-1"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  setPose(joint, "root-gap", 0.027);
  setPose(joint, "edge-offset", 0.014);
  const built = registry.build(joint);
  const zero = built.anchors.world["root-face--1"], other = built.anchors.world["root-face-1"];
  near(other[2] - zero[2], 0.041);
  near(other[0] - zero[0], 0.014);
  const taper = node(built, "bevel-taper-1").geometry;
  assert.equal(taper.type, "lofted-surface");
  assert.equal(taper.capStart, false);
  assert.equal(taper.capEnd, false);
  assert.ok(Math.max(...taper.sections[1].profile.map(point => Math.hypot(...point))) >
    Math.max(...taper.sections[0].profile.map(point => Math.hypot(...point))));
});

test("the suspension trolley matches the beam flange and accepts the hoist's four-hole plate", async t => {
  const [beam, trolley, hoist] = await Promise.all([
    load("components/structure/underslung-monorail-beam-section-with-adjustable-paired-hangers"),
    load("compositions/geared-four-wheel-monorail-hoist-trolley-with-opposed-adjustable-cheeks"),
    load("compositions/low-headroom-cutaway-wire-rope-hoist-with-removable-reducer-cover"),
  ]);
  const carrier = insertLibraryGroup(beam, trolley);
  const drive = insertLibraryGroup(carrier.document, hoist);
  const document = drive.document;
  const hoistRoot = document.parameters.nodes.find(part => part.id === drive.groupId);
  hoistRoot.parent = carrier.groupId;
  hoistRoot.transform = { position: [0, -0.139, 0] };
  document.parameters.attachments = [
    { from: "travel-flange", to: `${carrier.groupId}.rail-seat`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
    { from: `${carrier.groupId}.hoist-mount`, to: `${drive.groupId}.trolley-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
  ];
  const seated = registry.build(document);
  const flange = sweepRay(t, [node(seated, "rail-contour")]);
  for (const side of [-1, 1]) for (const x of [-0.156, 0.156]) {
    const contact = seated.anchors.world[`${carrier.groupId}.wheel-bearing-${side}-${x}`];
    const intersections = flange([contact[0], 0.14, contact[2]], [0, -1, 0]);
    near(intersections[0].point.y, contact[1]);
  }
  const mounting = sweepRay(t, [node(seated, `${carrier.groupId}.hoist-attachment`), node(seated, `${drive.groupId}.hoist-plate`)]);
  for (const x of [-0.086, 0.086]) for (const z of [-0.057, 0.057]) assert.equal(mounting([x, -0.19, z], [0, 1, 0]).length, 0);
  assert.ok(mounting([0, -0.19, 0.057], [0, 1, 0]).length > 0);
  setPose(document, `${drive.groupId}.cover-draw`, 0.12);
  setPose(document, "hanger-offset--1", 0.14);
  const serviced = registry.build(document);
  assert.deepEqual(serviced.anchors.world[`${drive.groupId}.rope-entry`], seated.anchors.world[`${drive.groupId}.rope-entry`]);
  assert.deepEqual(serviced.anchors.world["travel-flange"], seated.anchors.world["travel-flange"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("both glass edger seats accept the same spindle with aligned bolt holes and independent motion", async t => {
  const [edger, spindle] = await Promise.all([
    load("compositions/inclined-glass-edging-machine-bed-with-two-quick-spindle-seats"),
    load("components/equipment/holed-glass-edging-spindle-cartridge-with-water-guard-and-tilting-wheel"),
  ]);
  let document = edger;
  const mounted = [], attachments = [];
  for (const side of [-1, 1]) {
    const inserted = insertLibraryGroup(document, structuredClone(spindle));
    document = inserted.document;
    const id = `spindle-dock-${side}`, socket = document.parameters.anchors[id];
    const root = document.parameters.nodes.find(part => part.id === inserted.groupId);
    root.parent = socket.node;
    root.transform = { position: socket.position };
    attachments.push({ from: id, to: `${inserted.groupId}.mount`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    mounted.push(inserted.groupId);
  }
  document.parameters.attachments = attachments;
  const seated = registry.build(document);
  for (const [index, side] of [-1, 1].entries()) {
    const holes = sweepRay(t, [node(seated, `device-spindle-mount-${side}`), node(seated, `${mounted[index]}.cartridge-seat`)]);
    for (const dx of [-0.053, 0.053]) for (const dz of [-0.043, 0.043])
      assert.equal(holes([side * 0.317 + dx, 0.627, 0.119 + dz], [0, 1, 0]).length, 0);
    assert.ok(holes([side * 0.317, 0.627, 0.119], [0, 1, 0]).length > 0);
    near(seated.anchors.world[`${mounted[index]}.wheel-contact`][1], 0.59);
  }
  setPose(document, "spindle-height-1", 0.015);
  setPose(document, `${mounted[0]}.wheel-tilt`, 21);
  const adjusted = registry.build(document);
  near(adjusted.anchors.world[`${mounted[1]}.wheel-contact`][1], seated.anchors.world[`${mounted[1]}.wheel-contact`][1] + 0.015);
  assert.deepEqual(adjusted.anchors.world[`spindle-dock--1`], seated.anchors.world[`spindle-dock--1`]);
  assert.notDeepEqual(adjusted.anchors.world[`${mounted[0]}.coolant-entry`], seated.anchors.world[`${mounted[0]}.coolant-entry`]);
  assert.deepEqual(adjusted.anchors.world["glass-infeed"], seated.anchors.world["glass-infeed"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the road-rail chassis accepts matching front and rear cassettes while the crossing flangeway stays clear", async t => {
  const [chassis, cassette, crossing] = await Promise.all([
    load("components/equipment/road-rail-maintenance-utility-vehicle-chassis-with-dual-cassette-seats"),
    load("components/equipment/deployable-flanged-rail-wheel-cassette-with-adjustable-gauge"),
    load("compositions/flush-dual-rail-road-crossing-deck-with-keyed-flangeway-panels"),
  ]);
  let truck = chassis;
  const links = [], cassettes = [];
  for (const end of ["front", "rear"]) {
    const { document, groupId } = insertLibraryGroup(truck, structuredClone(cassette));
    const face = `${end}-rail-cassette`;
    document.parameters.nodes.find(part => part.id === groupId).transform = { position: document.parameters.anchors[face].position };
    links.push({ from: face, to: `${groupId}.mount`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    cassettes.push(groupId);
    truck = document;
  }
  truck.parameters.attachments = links;
  const initial = registry.build(truck);
  const openings = sweepRay(t, [node(initial, "rail-dock-plate--1"), node(initial, `${cassettes[0]}.coupling-top`)]);
  for (const dx of [-0.081, 0.081]) for (const z of [-0.492, 0.492])
    assert.equal(openings([-1.369 + dx, 0.374, z], [0, 1, 0]).length, 0);
  assert.ok(openings([-1.369, 0.374, 0.492], [0, 1, 0]).length > 0);
  setPose(truck, `${cassettes[0]}.bridge-lower`, 0.19);
  setPose(truck, `${cassettes[0]}.gauge-trim`, 0.03);
  const deployed = registry.build(truck);
  near(deployed.anchors.world[`${cassettes[0]}.rail-contact-1`][1], -0.052);
  near(deployed.anchors.world[`${cassettes[0]}.rail-contact-1`][2], 0.749);
  assert.deepEqual(deployed.anchors.world[`${cassettes[1]}.rail-contact-1`], initial.anchors.world[`${cassettes[1]}.rail-contact-1`]);
  assert.deepEqual(checkComposition(truck), { ok: true, issues: [] });

  const track = registry.build(crossing);
  const plan = sweepRay(t, track.nodes.filter(part => /^(?:crossing-rail-|center-infill|approach-infill-)/.test(part.metadata.compositionNodeId)));
  for (const sign of [-1, 1]) {
    assert.ok(plan([0, 0.365, sign * 0.666], [0, -1, 0]).every(hit => hit.point.y < 0.237));
    assert.ok(plan([0, 0.365, sign * 0.719], [0, -1, 0]).some(hit => hit.point.y >= 0.237));
    near(track.anchors.world[`rail-contact-${sign}`][2], sign * 0.719);
  }
});

test("the wheel sorter aligns both parcel decks and raises its wheel contact through the deck openings", async t => {
  const [sorter, chute, scale] = await Promise.all([
    load("compositions/twelve-wheel-pop-up-steerable-parcel-sorter-cassette"),
    load("compositions/three-lane-gravity-parcel-chute-with-adjustable-divider-rails"),
    load("compositions/four-cell-inline-parcel-checkweigher-with-isolated-belt-deck"),
  ]);
  const side = insertLibraryGroup(sorter, chute);
  const straight = insertLibraryGroup(side.document, scale);
  const document = straight.document;
  document.parameters.nodes.find(part => part.id === side.groupId).transform = { position: [0, 0, 0.31] };
  document.parameters.nodes.find(part => part.id === straight.groupId).transform = { position: [0.907, 0, 0] };
  document.parameters.attachments = [
    { from: "branch-output", to: `${side.groupId}.infeed`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
    { from: "outfeed", to: `${straight.groupId}.infeed`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
  ];
  setPose(document, "cassette-pop", 0);
  const flush = registry.build(document);
  const aperture = sweepRay(t, [node(flush, "fixed-top-strip")]);
  assert.equal(aperture([-0.295, 0.681, -0.191], [0, 1, 0]).length, 0);
  assert.ok(aperture([-0.215, 0.681, -0.191], [0, 1, 0]).length > 0);
  setPose(document, "cassette-pop", 0.045);
  setPose(document, "wheel-heading", 54);
  setPose(document, `${straight.groupId}.deck-travel`, 0.011);
  const raised = registry.build(document);
  for (let index = 0; index < 12; index++) {
    const id = `wheel-top-${index}`;
    assert.ok(flush.anchors.world[id][1] < 0.707);
    near(raised.anchors.world[id][1], flush.anchors.world[id][1] + 0.045);
  }
  near(raised.anchors.world[`${straight.groupId}.platform-center`][1], 0.709);
  for (const id of ["branch-output", "outfeed"]) assert.deepEqual(raised.anchors.world[id], flush.anchors.world[id]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the access tripod winch rotates with its outer leg and the adjustable stair keeps its treads level", async t => {
  const [tripod, winch, stair, landing] = await Promise.all([
    load("compositions/three-leg-confined-access-tripod-with-telescoping-legs-and-winch-socket"),
    load("components/equipment/tripod-leg-mount-manual-retrieval-winch-with-captive-drum"),
    load("compositions/socketed-slope-adjustable-industrial-service-stair-frame"),
    load("components/construction/split-pin-service-stair-landing-crossbar-with-adjustable-clevis"),
  ]);
  const { document, groupId } = insertLibraryGroup(tripod, winch);
  const face = document.parameters.anchors["winch-face"];
  const winchRoot = document.parameters.nodes.find(part => part.id === groupId);
  winchRoot.parent = face.node;
  winchRoot.transform = { position: face.position };
  document.parameters.attachments = [{
    from: "winch-face", to: `${groupId}.tripod-seat`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  // Check the four pins along the actual leg-face plane, using the lowest supported angle.
  setPose(document, "leg-spread", 12);
  const nominal = registry.build(document);
  const mount = nominal.anchors.world["winch-face"];
  const outward = nominal.anchors.worldDefinitions["winch-face"].direction;
  const tangent = [-outward[1], outward[0], 0];
  const holes = sweepRay(t, [node(nominal, "winch-holder"), node(nominal, `${groupId}.baseplate`)]);
  for (const z of [-0.059, 0.059]) for (const dy of [-0.081, 0.081]) {
    const origin = mount.map((value, axis) => value - 0.028 * outward[axis] + dy * tangent[axis]);
    origin[2] += z;
    assert.equal(holes(origin, outward).length, 0);
  }
  setPose(document, "leg-spread", 35);
  setPose(document, "leg-extension", 0.35);
  const spread = registry.build(document);
  for (const id of ["foot-1", "foot-2"]) near(spread.anchors.world[id][1], spread.anchors.world["foot-0"][1]);
  assert.notDeepEqual(spread.anchors.world[`${groupId}.tripod-seat`], nominal.anchors.world[`${groupId}.tripod-seat`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const { document: stairSet, groupId: landingId } = insertLibraryGroup(stair, landing);
  const header = stairSet.parameters.nodes.find(part => part.id === landingId);
  header.parent = "stair-frame-pivot";
  header.transform = { position: [1.494, 0.019, 0] };
  stairSet.parameters.attachments = [[-0.262, -1], [0.262, 1]].map(([z, side]) => ({
    from: `landing-seat-${z}`, to: `${landingId}.pin-face-${side}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }));
  for (const angle of [18, 47]) {
    setPose(stairSet, "stair-slope", angle);
    const positioned = registry.build(stairSet);
    for (let index = 1; index <= 4; index++) {
      const [x, y, z] = positioned.anchors.worldDefinitions[`tread-top-${index}`].direction;
      near(x, 0);
      near(y, 1);
      near(z, 0);
    }
    assert.deepEqual(checkComposition(stairSet), { ok: true, issues: [] });
  }
});

test("the hydronic cabinet carries the manifold through aligned mounting holes and its loops stay fixed when serviced", async t => {
  const [cabinet, manifold, panel] = await Promise.all([
    load("components/mep/flush-recessed-hydronic-manifold-cabinet-with-sliding-mounting-rail"),
    load("compositions/four-zone-sectioned-hydronic-distribution-manifold-on-paired-brackets"),
    load("compositions/removable-finish-hydronic-radiant-floor-panel-with-hollow-serpentine-loop"),
  ]);
  const { document, groupId } = insertLibraryGroup(cabinet, manifold);
  const rack = document.parameters.nodes.find(part => part.id === groupId);
  rack.parent = "height-adjusting-rail";
  rack.transform = { position: [0, 0.02, 0.022] };
  document.parameters.attachments = [-0.209, 0.209].map(x => ({
    from: `rack-tab-${x}`, to: `${groupId}.wall-tab-${x}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }));
  const seated = registry.build(document);
  for (const x of [-0.209, 0.209]) {
    const holes = sweepRay(t, [node(seated, `lock-rail-${x}`), node(seated, `${groupId}.wall-tab-${x}`)]);
    for (const y of [0.211, 0.414]) assert.equal(holes([x, y, -0.149], [0, 0, 1]).length, 0);
    assert.ok(holes([x, 0.29, -0.149], [0, 0, 1]).length > 0);
  }
  setPose(document, "mount-height", 0.108);
  setPose(document, "door-angle", 94);
  setPose(document, `${groupId}.zone-3-valve`, 74);
  const raised = registry.build(document);
  for (const side of ["supply", "return"]) {
    const zone = `${groupId}.${side}-zone-3`;
    near(raised.anchors.world[zone][1], seated.anchors.world[zone][1] + 0.108);
    assert.deepEqual(raised.anchors.worldDefinitions[zone].direction, seated.anchors.worldDefinitions[zone].direction);
  }
  assert.deepEqual(raised.anchors.world["in-wall"], seated.anchors.world["in-wall"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const pane = registry.build(panel);
  setPose(panel, "overlay-removal", 0.24);
  const serviced = registry.build(panel);
  for (const port of ["feed", "return"]) assert.deepEqual(serviced.anchors.world[port], pane.anchors.world[port]);
  assert.ok(serviced.anchors.world["finish-top"][1] > pane.anchors.world["finish-top"][1]);
  const pipe = node(serviced, "water-pipe").geometry;
  assert.equal(pipe.holes.length, 1);
  assert.equal(pipe.points[0][2], -0.369);
  assert.equal(pipe.points.at(-1)[2], -0.369);
});

test("the pipe camera fits two kinds of guide without losing its optical or tether mounting points", async t => {
  const [camera, collar, sled] = await Promise.all([
    load("components/instrument/spring-neck-pushrod-pipe-camera-with-removable-lens-bezel"),
    load("components/instrument/four-roller-expandable-pipe-camera-centralizing-collar"),
    load("compositions/articulating-side-branch-pipe-inspection-camera-deflector-sled"),
  ]);
  for (const guide of [collar, sled]) {
    const { document, groupId } = insertLibraryGroup(guide, structuredClone(camera));
    const socket = document.parameters.anchors["camera-fit"];
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.parent = socket.node;
    root.transform = { position: socket.position };
    document.parameters.attachments = [{
      from: "camera-fit", to: `${groupId}.collar-fit`, contract: { direction: "opposed", gapTolerance: 1e-6 },
    }];
    const initial = registry.build(document);
    const optical = `${groupId}.optical-axis`;
    const frameNode = node(initial, socket.node ? "camera-guard" : "holed-collar");
    const head = initial.anchors.world[optical];
    const direction = initial.anchors.worldDefinitions[optical].direction;
    const origin = head.map((value, axis) => value - direction[axis] * 0.21);
    const ray = sweepRay(t, [frameNode]);
    assert.equal(ray(origin, direction).length, 0);
    origin[0] += 0.044;
    assert.ok(ray(origin, direction).length > 0);
    setPose(document, `${groupId}.bezel-removal`, 0.06);
    const serviced = registry.build(document);
    assert.deepEqual(serviced.anchors.world[optical], head);
    assert.deepEqual(serviced.anchors.world[`${groupId}.tether`], initial.anchors.world[`${groupId}.tether`]);
    if (socket.node) {
      setPose(document, "launch-angle", 59);
      setPose(document, "probe-reach", 0.07);
      const raised = registry.build(document);
      assert.notDeepEqual(raised.anchors.worldDefinitions[optical].direction, direction);
      assert.ok(raised.anchors.world[optical][1] > head[1]);
    } else {
      setPose(document, "radial-opening", 0.03);
      const expanded = registry.build(document);
      for (let index = 0; index < 4; index++) {
        const key = `wheel-contact-${index}`;
        near(Math.hypot(...expanded.anchors.world[key].slice(0, 2)), 0.182);
      }
      assert.deepEqual(expanded.anchors.world[optical], head);
    }
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  }
});

test("forklift tools follow their paired fork tips or the shifting attachment carriage", async t => {
  const [truck, jib, carriage, positioner] = await Promise.all([
    load("compositions/counterbalance-forklift"),
    load("compositions/fork-pocket-adjustable-overhead-lifting-jib-with-sliding-clevis"),
    load("compositions/dual-hook-side-shifting-forklift-attachment-carriage"),
    load("components/equipment/hook-on-hydraulic-fork-positioner-with-independent-tines"),
  ]);
  const { document: lifted, groupId: jibId } = insertLibraryGroup(truck, jib);
  const jibRoot = lifted.parameters.nodes.find(part => part.id === jibId);
  jibRoot.parent = "carriage";
  jibRoot.transform = { position: [1.1, 0.02, 0] };
  lifted.parameters.attachments = [["left", -1], ["right", 1]].map(([side, sign]) => ({
    from: `${side}-fork-tip`, to: `${jibId}.fork-tip-${sign}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }));
  const built = registry.build(lifted);
  assert.deepEqual(checkComposition(lifted), { ok: true, issues: [] });
  const pockets = sweepRay(t, [-1, 1].map(side => node(built, `${jibId}.fork-pocket-${side}`)));
  for (const side of ["left", "right"]) {
    const name = `${side}-fork-tip`;
    const tip = built.anchors.world[name];
    const axis = built.anchors.worldDefinitions[name].direction;
    const behind = tip.map((value, index) => value - 0.85 * axis[index]);
    assert.equal(pockets(behind, axis).length, 0);
    behind[2] += 0.062;
    assert.ok(pockets(behind, axis).length > 0);
  }

  const { document: attached, groupId: toolId } = insertLibraryGroup(carriage, positioner);
  const tool = attached.parameters.nodes.find(part => part.id === toolId);
  tool.parent = "moving-rail-frame";
  tool.transform = { position: [0.047, 0, 0] };
  attached.parameters.attachments = [{
    from: "tool-face", to: `${toolId}.carriage-fit`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const before = registry.build(attached);
  setPose(attached, "side-shift", 0.1);
  setPose(attached, `${toolId}.tine-spacing-1`, 0.12);
  const after = registry.build(attached);
  for (const [side, travel] of [[-1, 0.1], [1, 0.22]]) {
    const name = `${toolId}.tine-tip-${side}`;
    near(after.anchors.world[name][2], before.anchors.world[name][2] + travel);
  }
  assert.deepEqual(after.anchors.world["vehicle-frame"], before.anchors.world["vehicle-frame"]);
  assert.deepEqual(checkComposition(attached), { ok: true, issues: [] });
});

test("the standalone hexacopter connects its six arms and keeps its two optical axes independently editable", async () => {
  const hexacopter = await load("compositions/modular-six-rotor-photogrammetry-drone");
  assert.equal(hexacopter.parameters.attachments.length, 9);
  const initial = registry.build(hexacopter);
  const armAxes = Object.keys(initial.anchors.world).filter(id => id.endsWith(".rotor-axis"));
  assert.equal(armAxes.length, 6);
  for (const id of armAxes) {
    const [x, y, z] = initial.anchors.world[id];
    near(Math.hypot(x, z), 0.476);
    near(y, 0.276);
  }
  const left = Object.keys(initial.anchors.world).find(id => id.endsWith(".view-axis--1"));
  const right = Object.keys(initial.anchors.world).find(id => id.endsWith(".view-axis-1"));
  const leftControl = hexacopter.parameters.poseControls.find(control => control.id.endsWith(".left-oblique"));
  setPose(hexacopter, leftControl.id, 15);
  setPose(hexacopter, "rotor-phase", 43);
  const angled = registry.build(hexacopter);
  assert.notDeepEqual(angled.anchors.worldDefinitions[left].direction, initial.anchors.worldDefinitions[left].direction);
  assert.deepEqual(angled.anchors.worldDefinitions[right], initial.anchors.worldDefinitions[right]);
  for (const id of armAxes) assert.deepEqual(angled.anchors.world[id], initial.anchors.world[id]);
  assert.deepEqual(angled.anchors.world.payload, initial.anchors.world.payload);
  assert.deepEqual(checkComposition(hexacopter), { ok: true, issues: [] });
});

test("the pavement tracking stage carries the interchangeable tray while the specimen lifts independently", async t => {
  const [bench, tray] = await Promise.all([
    load("compositions/single-wheel-pavement-tracking-bench-with-moving-specimen-tray"),
    load("components/instrument/wheel-tracking-test-specimen-tray-with-removable-pavement-slab"),
  ]);
  const { document, groupId } = insertLibraryGroup(bench, tray);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = "specimen-carriage";
  root.transform = { position: [0, 0.267, 0] };
  document.parameters.attachments = [{
    from: "specimen-seat", to: `${groupId}.carriage-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const holes = sweepRay(t, [node(initial, "carriage-platform"), node(initial, `${groupId}.tray-floor`)]);
  for (const x of [-0.19, 0.19]) for (const z of [-0.213, 0.213])
    assert.equal(holes([x, 0.225, z], [0, 1, 0]).length, 0);
  assert.ok(holes([0, 0.225, 0.213], [0, 1, 0]).length > 0);
  setPose(document, "tray-stroke", 0.267);
  setPose(document, `${groupId}.specimen-lift`, 0.075);
  const moved = registry.build(document);
  const surface = `${groupId}.nominal-track`;
  near(moved.anchors.world[surface][0], 0.267);
  near(moved.anchors.world[surface][1], initial.anchors.world[surface][1] + 0.075);
  assert.deepEqual(moved.anchors.world["wheel-axle"], initial.anchors.world["wheel-axle"]);
  assert.deepEqual(moved.anchors.world["gauge-mount"], initial.anchors.world["gauge-mount"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("compressed air equipment exposes physical port clearances and independently removable service parts", async t => {
  const [separator, cartridge, tank] = await Promise.all([
    load("compositions/cutaway-modular-compressed-air-water-separator-head-with-detachable-bowl"),
    load("components/mep/moisture-separator-coalescing-cartridge-with-removable-core-cage"),
    load("compositions/sectioned-vertical-compressed-air-receiver-with-service-port-ring"),
  ]);
  const { document, groupId } = insertLibraryGroup(separator, cartridge);
  document.parameters.nodes.find(part => part.id === groupId).transform = { position: [0, -0.031, 0] };
  document.parameters.attachments = [{
    from: "cartridge-support", to: `${groupId}.support`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const bore = sweepRay(t, ["flow-head", "coupling--1", "coupling-1"].map(id => node(initial, id)));
  assert.equal(bore([-0.17, 0.139, 0], [1, 0, 0]).length, 0);
  assert.ok(bore([-0.17, 0.167, 0], [1, 0, 0]).length > 0);
  setPose(document, "bowl-removal", 0.17);
  setPose(document, `${groupId}.core-removal`, 0.053);
  const serviced = registry.build(document);
  near(serviced.anchors.world.drain[1], initial.anchors.world.drain[1] - 0.17);
  near(serviced.anchors.world[`${groupId}.core-end`][1], initial.anchors.world[`${groupId}.core-end`][1] - 0.053);
  assert.deepEqual(serviced.anchors.world["air-in"], initial.anchors.world["air-in"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const shell = build => sweepRay(t, build.nodes.filter(part => /^(?:shell-band-|air-port-|manway-ring|cover-face)/.test(part.metadata.compositionNodeId)));
  const sealedTank = shell(registry.build(tank));
  assert.equal(sealedTank([0, 1.328, -0.46], [0, 0, 1]).length, 0);
  assert.ok(sealedTank([-0.142, 0.87, 0.42], [0, 0, -1]).some(hit => hit.distance < 0.15));
  setPose(tank, "cover-removal", 0.177);
  const servicedTank = shell(registry.build(tank));
  assert.ok(servicedTank([-0.142, 0.87, 0.42], [0, 0, -1]).every(hit => hit.distance >= 0.15));
});

test("the assembly dial carries its quick fixture and the Geneva wheel has six open drive slots", async t => {
  const [dial, fixture, geneva] = await Promise.all([
    load("compositions/modular-six-station-indexing-assembly-dial-with-quick-fixture-grid"),
    load("components/equipment/quick-mount-assembly-dial-wedge-jaw-fixture"),
    load("compositions/six-slot-geneva-index-drive-with-intermittent-locking-disc"),
  ]);
  const { document, groupId } = insertLibraryGroup(dial, fixture);
  document.parameters.nodes.find(part => part.id === groupId).parent = "fixture-station-1";
  document.parameters.attachments = [{
    from: "fixture-1", to: `${groupId}.dial-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const holes = sweepRay(t, [node(initial, "fixture-hole-table"), node(initial, `${groupId}.fixture-plate`)]);
  for (const dx of [-0.088, 0.088]) for (const z of [-0.068, 0.068])
    assert.equal(holes([0.39 + dx, 0.25, z], [0, 1, 0]).length, 0);
  assert.ok(holes([0.39, 0.25, 0.052], [0, 1, 0]).length > 0);
  setPose(document, "dial-angle", 90);
  setPose(document, `${groupId}.jaw-close`, 0.026);
  const rotated = registry.build(document);
  near(rotated.anchors.world[`${groupId}.dial-mount`][2], -0.39);
  assert.deepEqual(rotated.anchors.world["fixed-transfer-line"], initial.anchors.world["fixed-transfer-line"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const slots = sweepRay(t, [node(registry.build(geneva), "physical-slotted-wheel")]);
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3, lobe = angle + Math.PI / 6;
    assert.equal(slots([0.18 * Math.cos(angle), 0.16, 0.18 * Math.sin(angle)], [0, 1, 0]).length, 0);
    assert.ok(slots([0.18 * Math.cos(lobe), 0.16, 0.18 * Math.sin(lobe)], [0, 1, 0]).length > 0);
  }
});

test("the dewatering test manifold closes its physical through bore without moving the pipe ends", async t => {
  const model = await load("compositions/rolling-dewatering-flow-and-pressure-test-manifold");
  const throughAxialBore = build => {
    const pipe = build.nodes.filter(part => /^(?:runner-|end-|valve-block|rotary-plug)/.test(part.metadata.compositionNodeId));
    return sweepRay(t, pipe)([-0.385, 0.258, 0], [1, 0, 0]);
  };
  const open = registry.build(model);
  assert.equal(throughAxialBore(open).length, 0);
  setPose(model, "valve-turn", 90);
  const closed = registry.build(model);
  assert.ok(throughAxialBore(closed).length > 0);
  for (const end of ["inlet", "outlet"]) {
    assert.deepEqual(closed.anchors.world[end], open.anchors.world[end]);
  }
});

test("the test-and-drain selector presents a full bore, a smaller bore and a closed face", async t => {
  const model = await load("components/mep/swing-test-and-drain-valve-with-sight-window");
  for (const [angle, expected] of [[0, [true, true]], [90, [true, false]], [180, [false, false]]]) {
    setPose(model, "selector-angle", angle);
    const build = registry.build(model);
    const flowParts = build.nodes.filter(part => /^(?:end-|split-view-|guide-|selector-rotor)/.test(part.metadata.compositionNodeId));
    const ray = sweepRay(t, flowParts);
    const clearance = [0, 0.018].map(z => ray([-0.19, 0.079, z], [1, 0, 0]).length === 0);
    assert.deepEqual(clearance, expected);
    assert.deepEqual(build.anchors.world.feed, [-0.175, 0.079, 0]);
    assert.deepEqual(build.anchors.world.drain, [0.175, 0.079, 0]);
  }
});

test("the riser clapper opens the central bore and keeps its drain lateral", async t => {
  const model = await load("compositions/sectioned-wet-riser-alarm-check-valve-with-drain-trim");
  const closed = registry.build(model);
  const cast = build => sweepRay(t, build.nodes.filter(part => /^(?:chamber-|feed|outlet|clapper-disc|seat|drain-neck|drain-plug)/.test(part.metadata.compositionNodeId)));
  assert.ok(cast(closed)([0, -0.02, 0], [0, 1, 0]).length > 0);
  setPose(model, "clapper-open", 78);
  const open = registry.build(model);
  assert.equal(cast(open)([0, -0.02, 0], [0, 1, 0]).length, 0);
  assert.equal(cast(open)([0, 0.114, 0], [1, 0, 0]).length, 0);
  for (const port of ["riser-in", "riser-out", "drain", "pressure-tap"])
    assert.deepEqual(open.anchors.world[port], closed.anchors.world[port]);
});

test("the suspension bracket fits both smoke baffle mounts while the leaves deploy", async () => {
  const bracket = await load("components/construction/telescopic-smoke-baffle-headbox-suspension-bracket");
  const baffle = await load("compositions/three-stage-vertical-smoke-baffle-with-captured-rails");
  const { document, groupId } = insertLibraryGroup(bracket, baffle);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.transform = { position: [0, -1.328, 0] };
  document.parameters.attachments = [-1, 1].map(side => ({
    from: `baffle-seat-${side}`, to: `${groupId}.ceiling-${side}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }));
  const stowed = registry.build(document);
  setPose(document, `${groupId}.deployment`, 0.654);
  setPose(document, `${groupId}.service-open`, 105);
  const deployed = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  const bottom = `${groupId}.deployed-bottom`;
  near(stowed.anchors.world[bottom][1] - deployed.anchors.world[bottom][1], 0.654);
});

test("the floor flood gate raises its lip and keeps the reusable drive aligned", async () => {
  const gate = await load("compositions/flush-floor-pivoting-flood-gate-cassette");
  const drive = await load("components/construction/side-mounted-ratchet-drive-for-pivot-flood-gate");
  const { document, groupId } = insertLibraryGroup(gate, drive);
  const seat = document.parameters.anchors["right-drive"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = seat.node;
  root.transform = { position: seat.position };
  document.parameters.attachments = [{
    from: "right-drive", to: `${groupId}.drive-input`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const flat = registry.build(document);
  setPose(document, "barrier-turn", 90);
  setPose(document, `${groupId}.drive-turn`, 90);
  setPose(document, `${groupId}.pawl-lift`, 47);
  const raised = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.deepEqual(raised.anchors.world["right-drive"], flat.anchors.world["right-drive"]);
  near(raised.anchors.world["upper-seal"][1], 0.64);
  near(raised.anchors.world[`${groupId}.manual-grip`][2] - flat.anchors.world[`${groupId}.manual-grip`][2], -0.148);
});

test("raising the adjustable weir closes more of the opening and preserves its submerged overlap", async t => {
  const model = await load("compositions/sliding-adjustable-weir-cassette-with-perforated-screen");
  const shoot = build => sweepRay(t, [node(build, "frame"), node(build, "blade")]);
  const low = registry.build(model);
  const lowRay = shoot(low);
  assert.ok(lowRay([0, 0.038, -0.08], [0, 0, 1]).length > 0);
  assert.equal(lowRay([0, 0.35, -0.08], [0, 0, 1]).length, 0);
  setPose(model, "weir-height", 0.216);
  setPose(model, "screen-lift", 0.287);
  const high = registry.build(model);
  const highRay = shoot(high);
  assert.ok(highRay([0, 0.038, -0.08], [0, 0, 1]).length > 0);
  assert.ok(highRay([0, 0.35, -0.08], [0, 0, 1]).length > 0);
  assert.equal(highRay([0, 0.46, -0.08], [0, 0, 1]).length, 0);
  near(high.anchors.world["crest-axis"][1] - low.anchors.world["crest-axis"][1], 0.216);
  near(high.anchors.world["screen-handle"][1] - low.anchors.world["screen-handle"][1], 0.287);
  assert.deepEqual(high.anchors.world.outgoing, low.anchors.world.outgoing);
});

test("the photovoltaic gantry accepts both reusable tools with independent carriage and tool motion", async () => {
  const gantry = await load("compositions/dual-rail-photovoltaic-cleaning-gantry-carriage");
  const cases = [
    ["quick-mount-helical-photovoltaic-roller-brush-head", "roll-angle", 90, "roller-index"],
    ["quick-mount-floating-photovoltaic-squeegee-head", "float-angle", 20, "wipe-line-1"],
  ];
  for (const [tool, control, angle, marker] of cases) {
    const head = await load(`components/equipment/${tool}`);
    const { document, groupId } = insertLibraryGroup(structuredClone(gantry), head);
    const dock = document.parameters.anchors["cleaner-head"];
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.parent = dock.node;
    root.transform = { position: dock.position };
    const moving = `${groupId}.${marker}`;
    document.parameters.attachments = [{
      from: "cleaner-head", to: `${groupId}.quick-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
    }];
    const start = registry.build(document);
    setPose(document, "bridge-travel", 0.542);
    setPose(document, "head-drop", 0.074);
    setPose(document, "rail-span", 0.138);
    const translated = registry.build(document);
    near(translated.anchors.world[moving][1] - start.anchors.world[moving][1], -0.074);
    near(translated.anchors.world[moving][2] - start.anchors.world[moving][2], 0.542);
    near(translated.anchors.world["run-end-1"][0] - translated.anchors.world["run-end--1"][0], 1.568);
    setPose(document, `${groupId}.${control}`, angle);
    const turned = registry.build(document);
    assert.notDeepEqual(turned.anchors.world[moving], translated.anchors.world[moving]);
    assert.deepEqual(turned.anchors.world["cleaner-head"], translated.anchors.world["cleaner-head"]);
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  }
});

test("the low-bed deck takes a separate gooseneck and walking bogie on fixed mating surfaces", async t => {
  const deck = await load("compositions/low-bed-equipment-semitrailer-deck-with-folding-ramps");
  const neck = await load("components/equipment/demountable-semitrailer-gooseneck-with-locking-pins");
  const bogie = await load("components/equipment/two-axle-equalizing-walking-beam-trailer-bogie");
  const coupled = insertLibraryGroup(deck, neck);
  const wheeled = insertLibraryGroup(coupled.document, bogie);
  const { document } = wheeled;
  document.parameters.attachments = [["neck-dock", coupled.groupId, "deck-mate"], ["bogie-dock", wheeled.groupId, "deck-mount"]]
    .map(([from, groupId, to]) => {
      const seat = document.parameters.anchors[from];
      const root = document.parameters.nodes.find(part => part.id === groupId);
      root.parent = seat.node;
      root.transform = { position: seat.position };
      return { from, to: `${groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
    });
  const stowed = registry.build(document);
  const lockAxis = stowed.anchors.world[`${coupled.groupId}.lock-end-1`];
  const receiver = stowed.nodes.filter(part => part.metadata.compositionNodeId.startsWith("docking-cheek-1-"));
  const throughReceiver = sweepRay(t, receiver);
  assert.equal(throughReceiver([lockAxis[0], lockAxis[1], 0.25], [0, 0, 1]).length, 0);
  assert.ok(throughReceiver([lockAxis[0] - 0.041, lockAxis[1], 0.25], [0, 0, 1]).length > 0);
  setPose(document, "ramp-1-angle", 25);
  setPose(document, `${wheeled.groupId}.walk-angle`, 11);
  setPose(document, `${coupled.groupId}.locking-pin-retract`, 0.178);
  const working = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  near(working.anchors.world[`${coupled.groupId}.lock-end-1`][2] - lockAxis[2], 0.178);
  near(working.anchors.world[`${wheeled.groupId}.wheel-center-1-1`][1] - working.anchors.world[`${wheeled.groupId}.wheel-center-0-1`][1],
    1.102 * Math.sin(11 * Math.PI / 180));
  assert.deepEqual(working.anchors.world["ramp-toe--1"], stowed.anchors.world["ramp-toe--1"]);
  assert.ok(working.anchors.world["ramp-toe-1"][1] < 0.04);
});

test("the guide-rail clamp seats its opposing wedges on the existing T-rail blade", async () => {
  const rail = await load("components/mep/elevator-t-guide-rail-section");
  const clamp = await load("components/mep/sliding-wedge-elevator-guide-rail-safety-clamp-cutaway");
  const { document, groupId } = insertLibraryGroup(rail, clamp);
  const [x, y, z] = registry.build(rail).anchors.world.guide;
  const group = document.parameters.nodes.find(part => part.id === groupId);
  group.transform = { position: [x, y - 0.108, z] };
  document.parameters.attachments = [{
    from: "guide", to: `${groupId}.rail-guide`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const open = registry.build(document);
  setPose(document, `${groupId}.jaw-travel`, 0.014);
  const closed = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  for (const side of [-1, 1]) {
    const contact = `${groupId}.contact-${side}`;
    near(open.anchors.world[contact][0], side * 0.024);
    near(closed.anchors.world[contact][0], side * 0.01);
    near(closed.anchors.world[contact][1] - open.anchors.world[contact][1], 0.014 * 1.85);
  }
  assert.deepEqual(closed.anchors.world[`${groupId}.sling-seat`], open.anchors.world[`${groupId}.sling-seat`]);
});

test("the escalator inclination joins both landing sections at the work and return rails", async () => {
  const truss = await load("compositions/inclined-escalator-truss-with-upper-and-return-guideways");
  const lower = await load("compositions/lower-escalator-landing-transition-track-and-drive-dock");
  const upper = await load("compositions/upper-escalator-landing-crest-transition-and-service-platform");
  const head = await load("compositions/dual-escalator-chain-sprocket-head-with-axial-adjustment");
  let document = truss;
  const attachments = [];
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  function attach(model, from, to) {
    const inserted = insertLibraryGroup(document, model);
    document = inserted.document;
    const root = document.parameters.nodes.find(part => part.id === inserted.groupId);
    const mount = document.parameters.anchors[from];
    root.parent = mount.node;
    root.transform = { position: mount.position };
    attachments.push({ from, to: `${inserted.groupId}.${to}`, contract });
    return inserted.groupId;
  }
  const low = attach(lower, "low-incline", "incline-dock");
  const high = attach(upper, "high-incline", "incline-dock");
  const drive = attach(head, `${low}.sprocket-dock`, "station-dock");
  const railNames = [["upper", "working"], ["return", "return"]];
  for (const [which, group] of [["low", low], ["high", high]]) {
    for (const [atTruss, atStation] of railNames) {
      for (const side of [-1, 1]) {
        attachments.push({
          from: `${which}-${atTruss}-${side}`, to: `${group}.${atStation}-incline-${side}`, contract,
        });
      }
    }
  }
  document.parameters.attachments = attachments;
  const initial = registry.build(document);
  setPose(document, `${low}.hatch-turn`, 103);
  setPose(document, `${high}.lid-service-travel`, 0.291);
  setPose(document, `${drive}.drive-roll`, 127);
  const serviced = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.deepEqual(serviced.anchors.world[`${drive}.station-dock`], initial.anchors.world[`${drive}.station-dock`]);
  near(serviced.anchors.world[`${high}.cover-observation`][0] - initial.anchors.world[`${high}.cover-observation`][0], 0.291);
});

test("the adjustable escalator comb places a real tooth in the adjacent tread groove", async t => {
  const comb = await load("components/mep/sliding-finger-escalator-comb-plate-with-slot-adjusters");
  const step = await load("components/mep/grooved-escalator-step-with-rolling-chain-attachments");
  const { document, groupId } = insertLibraryGroup(comb, step);
  document.parameters.nodes.find(part => part.id === groupId).transform = { position: [-0.207, 0, 0] };
  const throughGroove = build => {
    const parts = build.nodes.filter(part => part.metadata.compositionNodeId.startsWith(`${groupId}.tread-rib-`) ||
      part.metadata.compositionNodeId.startsWith("finger-"));
    return sweepRay(t, parts);
  };
  const nominal = throughGroove(registry.build(document));
  assert.equal(nominal([-0.075, 0.04, 0], [0, -1, 0]).length, 0);
  assert.ok(nominal([-0.046, 0.04, 0], [0, -1, 0]).length > 0);
  setPose(document, "comb-travel", 0.017);
  const withdrawn = throughGroove(registry.build(document));
  assert.equal(withdrawn([-0.046, 0.04, 0], [0, -1, 0]).length, 0);
  assert.ok(withdrawn([-0.046, 0.04, 0.0115], [0, -1, 0]).length > 0);
});

test("rack-mounted cooling and compute modules keep their mounts while serviced independently", async t => {
  let document = await load("compositions/adjustable-server-rack-frame-with-front-mesh-door-and-slide-rails");
  const installs = [
    ["rear-door-dock", "compositions/swing-out-rack-rear-door-air-to-water-heat-exchanger", "hinge-dock"],
    ["front-bay-0", "components/mep/four-channel-sliding-rack-coolant-distribution-tray", "rack-mount"],
    ["front-bay-1", "components/mep/two-unit-slide-out-server-fan-and-compute-tray", "rack-mount"],
  ];
  const attachments = [];
  const ids = [];
  for (const [from, path, to] of installs) {
    const inserted = insertLibraryGroup(document, await load(path));
    document = inserted.document;
    const root = document.parameters.nodes.find(part => part.id === inserted.groupId);
    root.transform = { position: document.parameters.anchors[from].position };
    attachments.push({ from, to: `${inserted.groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    ids.push(inserted.groupId);
  }
  document.parameters.attachments = attachments;
  const [door, coolant, server] = ids;
  setPose(document, `${door}.door-swing`, 0);
  const closed = registry.build(document);
  const anchor = document.parameters.anchors["front-bay-0"];
  const pipe = closed.nodes.filter(part => part.metadata.compositionNodeId.startsWith(`${coolant}.`) &&
    /\.(?:tube-|branch-window-|branch-)/.test(part.metadata.compositionNodeId));
  const through = sweepRay(t, pipe);
  assert.equal(through([0.093, anchor.position[1] + 0.052, anchor.position[2] + 0.174], [1, 0, 0]).length, 0);
  assert.ok(through([0.093, anchor.position[1] + 0.052, anchor.position[2] + 0.238], [1, 0, 0]).length > 0);
  setPose(document, `${door}.door-swing`, 96);
  setPose(document, `${coolant}.drawer-travel`, 0.329);
  setPose(document, `${server}.sled-travel`, 0.203);
  setPose(document, `${server}.fan-travel`, 0.079);
  const serviced = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.notDeepEqual(serviced.anchors.world[`${door}.coolant-out`], closed.anchors.world[`${door}.coolant-out`]);
  near(serviced.anchors.world[`${coolant}.supply`][2] - closed.anchors.world[`${coolant}.supply`][2], -0.329);
  near(serviced.anchors.world[`${server}.fan-grab`][2] - closed.anchors.world[`${server}.fan-grab`][2], -0.282);
});

test("a separate double-depth fork follows the stacker carriage and adds both reach stages", async () => {
  const carrier = await load("compositions/dual-post-rail-guided-warehouse-stacker-crane-body");
  const fork = await load("components/equipment/three-section-double-depth-stacker-telescopic-fork-carriage");
  const { document, groupId } = insertLibraryGroup(carrier, fork);
  const dock = document.parameters.anchors["fork-coupler"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "fork-coupler", to: `${groupId}.stacker-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const rest = registry.build(document);
  setPose(document, "aisle-travel", -0.73);
  setPose(document, "lift-travel", 1.293);
  setPose(document, `${groupId}.first-extension`, 0.468);
  setPose(document, `${groupId}.second-extension`, 0.437);
  const reached = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  const tip = `${groupId}.fork-tip-1`;
  near(reached.anchors.world[tip][0] - rest.anchors.world[tip][0], -0.73);
  near(reached.anchors.world[tip][1] - rest.anchors.world[tip][1], 1.293);
  near(reached.anchors.world[tip][2] - rest.anchors.world[tip][2], 0.905);
  assert.deepEqual(reached.anchors.world["rail-origin"], rest.anchors.world["rail-origin"]);
});

test("the pallet shuttle rolls on the two separate track faces and keeps lift independent", async () => {
  const track = await load("components/construction/twin-pallet-shuttle-rail-bay-with-moving-datum");
  const shuttle = await load("compositions/four-wheel-rail-pallet-shuttle-with-independent-lift-deck");
  const { document, groupId } = insertLibraryGroup(track, shuttle);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = document.parameters.anchors["shuttle-seat"].node;
  document.parameters.attachments = [{
    from: "shuttle-seat", to: `${groupId}.rail-carriage`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const nominal = registry.build(document);
  setPose(document, "shuttle-travel", 0.652);
  setPose(document, `${groupId}.deck-lift`, 0.06);
  const loaded = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  for (const side of [-1, 1]) {
    const end = loaded.anchors.world[`rail-end-${side}`];
    const [x, y, z] = loaded.anchors.world[`${groupId}.rolling-${side}-0.284`];
    near(x, end[0]);
    near(y, end[1]);
    assert.ok(z < end[2]);
  }
  near(loaded.anchors.world[`${groupId}.pallet-seat`][1] - nominal.anchors.world[`${groupId}.pallet-seat`][1], 0.06);
});

test("the tractor hitch carries both independent implements and keeps their working controls", async () => {
  const tractor = await load("compositions/compact-farm-tractor-with-steerable-oscillating-front-axle");
  const hitch = await load("components/equipment/tractor-three-point-lift-frame-with-sliding-hook-jaws");
  const cases = [
    ["compositions/three-point-box-grader-with-lifting-ripper-bar-and-reversible-blade", "ripper-retract", 0.155, "ripper-depth"],
    ["components/equipment/four-row-adjustable-implement-toolbar-with-gauge-wheels", "wheel-height", 0.082, "ground-wheel-1"],
  ];
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  for (const [path, control, travel, marker] of cases) {
    let document = structuredClone(tractor);
    const attachments = [];
    function attach(model, from, to) {
      const inserted = insertLibraryGroup(document, model);
      document = inserted.document;
      const mount = document.parameters.anchors[from];
      const root = document.parameters.nodes.find(part => part.id === inserted.groupId);
      root.parent = mount.node;
      root.transform = { position: mount.position };
      attachments.push({ from, to: `${inserted.groupId}.${to}`, contract });
      return inserted.groupId;
    }
    const lift = attach(hitch, "hitch-dock", "tractor-seat");
    const implement = attach(await load(path), `${lift}.implement-seat`, "implement-mount");
    for (const side of [-1, 1]) attachments.push({ from: `${lift}.implement-low-${side}`, to: `${implement}.lower-${side}`, contract });
    attachments.push({ from: `${lift}.implement-top`, to: `${implement}.upper`, contract });
    document.parameters.attachments = attachments;
    setPose(document, `${lift}.lift-angle`, -25);
    const raised = registry.build(document);
    setPose(document, `${implement}.${control}`, travel);
    const adjusted = registry.build(document);
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
    const point = `${implement}.${marker}`;
    near(adjusted.anchors.world[point][1] - raised.anchors.world[point][1], travel * Math.cos(25 * Math.PI / 180));
    assert.deepEqual(adjusted.anchors.world[`${implement}.implement-mount`], raised.anchors.world[`${implement}.implement-mount`]);
  }
});

test("the concrete cooling buffer exposes both bores through its liner and jacket", async t => {
  const model = await load("compositions/insulated-cooling-return-water-buffer-tank-with-lift-baffle");
  const closed = registry.build(model);
  const walls = closed.nodes.filter(part => /^(?:liner-|tank-shell-|inlet-|outlet-)/.test(part.metadata.compositionNodeId));
  const cast = sweepRay(t, walls);
  assert.equal(cast([0.232, 0.197, 0], [1, 0, 0]).length, 0);
  assert.equal(cast([-0.232, 0.469, 0], [-1, 0, 0]).length, 0);
  assert.ok(cast([0.232, 0.285, 0], [1, 0, 0]).length > 0);
  setPose(model, "cover-height", 0.303);
  setPose(model, "baffle-height", 0.384);
  const serviced = registry.build(model);
  near(serviced.anchors.world["baffle-access"][1] - closed.anchors.world["baffle-access"][1], 0.384);
  near(serviced.anchors.world["top-bleed"][1] - closed.anchors.world["top-bleed"][1], 0.303);
  assert.deepEqual(serviced.anchors.world.outlet, closed.anchors.world.outlet);
});

test("the embedded temperature probe rake adjusts one measurement depth with its own channel", async () => {
  const model = await load("components/instrument/sliding-five-depth-embedded-concrete-temperature-probe-rake");
  const initial = registry.build(model);
  setPose(model, "probe-2-height", -0.106);
  const moved = registry.build(model);
  near(moved.anchors.world["temperature-2"][1] - initial.anchors.world["temperature-2"][1], -0.106);
  near(moved.anchors.world["channel-2"][1] - initial.anchors.world["channel-2"][1], -0.106);
  for (const anchor of ["temperature-0", "temperature-4", "rebar-seat-1"])
    assert.deepEqual(moved.anchors.world[anchor], initial.anchors.world[anchor]);
});

test("the insulated panel's real window and blind sockets fit the adjustable thermal tie", async t => {
  const panel = await load("compositions/offset-window-precast-insulated-concrete-wall-panel-cutaway");
  const pin = await load("components/structure/ribbed-thermal-break-sandwich-panel-pin-with-sliding-retainer");
  const facade = registry.build(panel);
  const layers = ["outer-cap", "outer-face", "insulation", "inner-wythe-core", "inner-face"].map(id => node(facade, id));
  const cast = sweepRay(t, layers);
  assert.equal(cast([0.211, 1.311, -0.201], [0, 0, 1]).length, 0);
  assert.ok(cast([-0.67, 0.395, -0.201], [0, 0, 1]).length > 0);
  assert.equal(cast([-0.67, 0.395, -0.14], [0, 0, 1]).filter(hit => hit.distance < 0.24).length, 0);
  const { document, groupId } = insertLibraryGroup(panel, pin);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  const mount = document.parameters.anchors["tie-front-0"];
  root.parent = mount.node;
  root.transform = { position: mount.position };
  document.parameters.attachments = [["tie-front-0", "front-contact"], ["tie-back-0", "rear-contact"]].map(([from, to]) => ({
    from, to: `${groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }));
  setPose(document, "inner-offset", 0.047);
  setPose(document, `${groupId}.insulation-offset`, 0.047);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  const pulled = registry.build(document);
  near(pulled.anchors.world[`${groupId}.rear-contact`][2] - pulled.anchors.world[`${groupId}.front-contact`][2], 0.147);
});

test("the precast column and four-jaw collar seat in the existing socket footing", async () => {
  const footing = await load("components/structure/socketed-column-footing");
  const column = await load("components/structure/keyed-square-precast-column-with-socket-foot-and-tapered-shoulder");
  const collar = await load("compositions/four-jaw-levelling-collar-for-socketed-precast-columns");
  const original = registry.build(footing);
  const seated = insertLibraryGroup(footing, column);
  const aligned = insertLibraryGroup(seated.document, collar);
  const { document } = aligned;
  const pairs = [["socket-bottom", seated.groupId, "socket-seat"], ["socket-mouth", aligned.groupId, "footing-rim"]];
  document.parameters.attachments = pairs.map(([from, groupId, to]) => {
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.transform = { position: original.anchors.world[from] };
    return { from, to: `${groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
  });
  for (let i = 0; i < 4; i++) setPose(document, `${aligned.groupId}.paw-${i}-stroke`, 0.036);
  const adjusted = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  near(adjusted.anchors.world[`${seated.groupId}.cup-rim`][1], original.anchors.world["socket-mouth"][1]);
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = adjusted.anchors.world[`${aligned.groupId}.padding-${i}`];
    near(Math.hypot(x, z), 0.18);
    near(y, 0.784);
  }
});

test("the cage spreader aligns all four independent footing cage pick points", async () => {
  const cage = await load("components/structure/two-mat-isolated-footing-rebar-cage-with-adjustable-cover-chairs");
  const spreader = await load("components/tool/four-corner-adjustable-foundation-cage-hoisting-spreader");
  const { document, groupId } = insertLibraryGroup(cage, spreader);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.transform = { position: [0, 0.252 - 0.061 + 0.119, 0] };
  document.parameters.attachments = [-1, 1].flatMap(x => [-1, 1].map(z => ({
    from: `pick-${x}-${z}`, to: `${groupId}.shackle-${x}-${z}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  })));
  setPose(document, `${groupId}.hooks-drop`, 0.119);
  setPose(document, "cover--1-1-height", 0.023);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the envelope tapping probe guides its moving striker through a real mounting bore", async t => {
  const model = await load("components/instrument/spring-stroke-wall-tapping-probe-with-four-roller-carriage");
  const rest = registry.build(model);
  const ray = sweepRay(t, [node(rest, "frame"), node(rest, "body"), node(rest, "gasket")]);
  assert.equal(ray([0, -0.01, 0], [0, 1, 0]).length, 0);
  assert.ok(ray([0.016, -0.01, 0], [0, 1, 0]).length > 0);
  setPose(model, "strike-travel", 0.023);
  const extended = registry.build(model);
  near(rest.anchors.world["surface-contact"][1] - extended.anchors.world["surface-contact"][1], 0.023);
  assert.deepEqual(rest.anchors.world["rolling-plane"], extended.anchors.world["rolling-plane"]);
});

test("the thermal bridge coupon exposes a distinct real-through metal path", async t => {
  const model = await load("components/instrument/dual-path-insulation-and-thermal-bridge-comparison-coupon");
  setPose(model, "probe-clearance", 0.079);
  const built = registry.build(model);
  const layers = built.nodes.filter(part => /^(?:rear-panel-|sample-core-|face-[01]|bridge$)/.test(part.metadata.compositionNodeId));
  const through = sweepRay(t, layers);
  assert.ok(through([-0.146, 0.169, -0.098], [0, 0, 1]).length > 0);
  assert.equal(through([0.146, 0.169, -0.098], [0, 0, 1]).length, 0);
  assert.ok(through([0.159, 0.169, -0.098], [0, 0, 1]).length > 0);
});

test("the adjustable service rack carries each accessory with its own tier controls", async () => {
  let document = await load("compositions/adjustable-two-tier-prefabricated-overhead-mep-service-rack-module");
  const fixtures = [["pipe-dock-1", "quick-mount-dual-roller-pipe-saddle-with-hinged-keeper"],
    ["tray-dock", "removable-two-compartment-cable-service-cartridge-with-hinged-lid"]];
  const attachments = [];
  const installed = [];
  for (const [from, id] of fixtures) {
    const inserted = insertLibraryGroup(document, await load(`components/mep/${id}`));
    document = inserted.document;
    const mount = document.parameters.anchors[from];
    const part = document.parameters.nodes.find(node => node.id === inserted.groupId);
    part.parent = mount.node;
    part.transform = { position: mount.position };
    attachments.push({ from, to: `${inserted.groupId}.rack-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    installed.push(inserted.groupId);
  }
  document.parameters.attachments = attachments;
  const original = registry.build(document);
  setPose(document, "low-tier-height", -0.151);
  setPose(document, "upper-pipe-spread", 0.15);
  setPose(document, `${installed[0]}.keeper-open`, 90);
  setPose(document, `${installed[1]}.cover-open`, 90);
  const adjusted = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  const cable = `${installed[1]}.output-1`;
  const pipe = `${installed[0]}.axis`;
  near(adjusted.anchors.world[cable][1] - original.anchors.world[cable][1], -0.151);
  near(adjusted.anchors.world[pipe][0] - original.anchors.world[pipe][0], 0.075);
  assert.deepEqual(adjusted.anchors.world["bay-after"], original.anchors.world["bay-after"]);
});

test("the telescopic duct opens a real top service window while keeping its air ports axially aligned", async t => {
  const model = await load("components/mep/extendable-rectangular-air-duct-service-sleeve-with-guide-stays");
  const lookInside = build => {
    const parts = build.nodes.filter(part => /^(?:outer-shell-|service-window|hatch-seat|inner-shell|cover)/.test(part.metadata.compositionNodeId));
    return sweepRay(t, parts)([0, 0.35, 0.142], [0, -1, 0]).some(hit => hit.distance < 0.27);
  };
  const closed = registry.build(model);
  assert.equal(lookInside(closed), true);
  setPose(model, "extension", 0.226);
  setPose(model, "service-open", 102);
  const opened = registry.build(model);
  assert.equal(lookInside(opened), false);
  assert.deepEqual(opened.anchors.world["air-in"], closed.anchors.world["air-in"]);
  near(opened.anchors.world["air-out"][2] - closed.anchors.world["air-out"][2], 0.226);
});

test("opposed bridge shims stay in contact through travel and carry the guided bearing", async t => {
  const pack = await load("components/structure/bridge-seat-opposed-indexed-wedge-levelling-pack");
  const bearing = await load("components/structure/guided-spherical-bridge-bearing-with-removable-side-keeper-bars");
  const { document, groupId } = insertLibraryGroup(pack, bearing);
  const dock = document.parameters.anchors["bearing-base"];
  const group = document.parameters.nodes.find(part => part.id === groupId);
  group.parent = dock.node;
  group.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "bearing-base", to: `${groupId}.seat-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  for (const travel of [-0.041, 0, 0.082]) {
    setPose(document, "wedge-advance", travel);
    const build = registry.build(document);
    const lower = sweepRay(t, [node(build, "web--1")])([0, 0.26, 0], [0, -1, 0]);
    const upper = sweepRay(t, [node(build, "web-1")])([0, -0.03, 0], [0, 1, 0]);
    near(lower[0].point.y, upper[0].point.y);
    near(build.anchors.world["bearing-base"][1], 0.113 + travel * 2 * 0.021 / 0.266);
  }
  setPose(document, `${groupId}.bearing-travel`, 0.1);
  setPose(document, `${groupId}.guide-removal`, 0.104);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  near(registry.build(document).anchors.world[`${groupId}.girder-bearing`][0], 0.1);
});

test("the bridge service jacks install on the matched ledge and level the two load points", async () => {
  const ledge = await load("components/structure/anchored-temporary-bridge-seat-jacking-ledge-with-sliding-knees");
  const jacks = await load("compositions/synchronized-dual-jack-bridge-bearing-service-frame-with-lock-rings");
  const { document, groupId } = insertLibraryGroup(ledge, jacks);
  const mount = document.parameters.anchors["jack-deck"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = mount.node;
  root.transform = { position: mount.position };
  document.parameters.attachments = [{
    from: "jack-deck", to: `${groupId}.support`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const original = registry.build(document);
  setPose(document, `${groupId}.paired-stroke`, 0.171);
  const lifted = registry.build(document);
  const center = `${groupId}.load-center`;
  near(lifted.anchors.world[center][1] - original.anchors.world[center][1], 0.171);
  setPose(document, `${groupId}.seat-level`, 3);
  const leveled = registry.build(document);
  near(leveled.anchors.world[`${groupId}.load-right`][1] - leveled.anchors.world[`${groupId}.load-left`][1],
    0.424 * Math.sin(3 * Math.PI / 180));
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the tunnel carrier moves its separate nozzle while the annular mouth rotates independently", async () => {
  const carrier = await load("compositions/low-profile-tunnel-wet-shotcrete-carrier-with-telescopic-boom");
  const nozzle = await load("components/equipment/quick-mount-wet-shotcrete-nozzle-with-annular-open-mouth");
  const { document, groupId } = insertLibraryGroup(carrier, nozzle);
  const mount = document.parameters.anchors["nozzle-dock"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = mount.node;
  root.transform = { position: mount.position };
  document.parameters.attachments = [{
    from: "nozzle-dock", to: `${groupId}.boom-seat`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  setPose(document, "arm-slew", 67);
  setPose(document, "arm-elevation", 25);
  setPose(document, "head-angle", -15);
  const folded = registry.build(document);
  setPose(document, "arm-reach", 0.601);
  const reached = registry.build(document);
  const tip = `${groupId}.axis`;
  near(Math.hypot(...reached.anchors.world[tip].map((value, index) => value - folded.anchors.world[tip][index])), 0.601);
  setPose(document, `${groupId}.ring-position`, 117);
  const rotated = registry.build(document);
  assert.notDeepEqual(rotated.anchors.world[`${groupId}.ring-index`], reached.anchors.world[`${groupId}.ring-index`]);
  assert.deepEqual(rotated.anchors.world[tip], reached.anchors.world[tip]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the quick-mounted recovery shoe has a physical opening through the floor machine base", async t => {
  const machine = await load("compositions/walk-behind-enclosed-floor-shot-blaster-with-serviceable-wheel");
  const shoe = await load("components/equipment/quick-mount-floating-floor-prep-recovery-shoe-with-magnetic-skirt");
  const { document, groupId } = insertLibraryGroup(machine, shoe);
  const dock = document.parameters.anchors["shoe-mount"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "shoe-mount", to: `${groupId}.upper-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const layers = ["chassis", "shoe-seat", `${groupId}.mount`, `${groupId}.seal`].map(id => node(initial, id));
  const cast = sweepRay(t, layers);
  assert.equal(cast([0.221, -0.02, 0], [0, 1, 0]).length, 0);
  assert.ok(cast([0.221, -0.02, 0.156], [0, 1, 0]).length > 0);
  setPose(document, "shoe-clearance", 0.038);
  const raised = registry.build(document);
  near(raised.anchors.world[`${groupId}.floor-contact`][1] - initial.anchors.world[`${groupId}.floor-contact`][1], 0.038);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("an overhead crossarm carries independent upper and suspended components as the phase span changes", async () => {
  let document = await load("components/mep/tapered-octagonal-distribution-pole-with-hinged-access-pocket");
  const attachments = [];
  async function attach(path, from, to) {
    const installed = insertLibraryGroup(document, await load(path));
    document = installed.document;
    const mount = document.parameters.anchors[from];
    const group = document.parameters.nodes.find(part => part.id === installed.groupId);
    group.parent = mount.node;
    group.transform = { position: mount.position };
    attachments.push({ from, to: `${installed.groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    return installed.groupId;
  }
  const arm = await attach("compositions/adjustable-double-crossarm-saddle-bracket-for-distribution-pole", "bracket-2.86", "pole-mate");
  const insulator = await attach("components/mep/polymer-line-post-insulator-with-indexed-conductor-saddle", `${arm}.phase-2`, "crossarm-foot");
  const fuse = await attach("components/mep/suspended-drop-out-line-fuse-cutout-with-hinged-tube", `${arm}.hanging-2`, "crossarm-foot");
  document.parameters.attachments = attachments;
  const initial = registry.build(document);
  setPose(document, `${arm}.phase-distance`, 0.228);
  const spread = registry.build(document);
  for (const component of [insulator, fuse]) {
    near(spread.anchors.world[`${component}.crossarm-foot`][0] - initial.anchors.world[`${component}.crossarm-foot`][0], 0.114);
  }
  setPose(document, `${insulator}.saddle-angle`, 47);
  setPose(document, `${fuse}.drop-open`, 94);
  setPose(document, "door-open", 100);
  const open = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.deepEqual(open.anchors.world[`${fuse}.terminal-top`], spread.anchors.world[`${fuse}.terminal-top`]);
  assert.notDeepEqual(open.anchors.world[`${fuse}.cartridge-tip`], spread.anchors.world[`${fuse}.cartridge-tip`]);
  assert.notDeepEqual(open.anchors.worldDefinitions[`${insulator}.line-axis`].direction,
    spread.anchors.worldDefinitions[`${insulator}.line-axis`].direction);
});

test("both additive toolheads follow all three gantry axes while the bed sheet releases independently", async () => {
  const printer = await load("compositions/enclosed-three-axis-gantry-additive-printer-frame-with-quick-head");
  const bed = await load("components/equipment/four-corner-print-build-platform-with-removable-spring-steel-sheet");
  const tools = ["four-hole-quick-mount-cutaway-filament-extrusion-head", "quick-mount-paste-extrusion-toolhead-with-sliding-plunger"];
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  for (const id of tools) {
    const head = await load(`components/equipment/${id}`);
    const mounted = insertLibraryGroup(structuredClone(printer), head);
    const based = insertLibraryGroup(mounted.document, bed);
    const { document } = based;
    const parts = [["head-dock", mounted.groupId, "gantry-seat"], ["build-platform", based.groupId, "frame-mount"]];
    document.parameters.attachments = parts.map(([from, groupId, to]) => {
      const mount = document.parameters.anchors[from];
      const root = document.parameters.nodes.find(part => part.id === groupId);
      root.parent = mount.node;
      root.transform = { position: mount.position };
      return { from, to: `${groupId}.${to}`, contract };
    });
    const initial = registry.build(document);
    setPose(document, "x-travel", 0.218);
    setPose(document, "y-travel", 0.173);
    setPose(document, "z-travel", -0.196);
    setPose(document, `${based.groupId}.sheet-removal`, 0.161);
    const moved = registry.build(document);
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
    const tip = `${mounted.groupId}.tip`;
    for (const [axis, offset] of [0.218, 0.087, -0.196].entries()) {
      near(moved.anchors.world[tip][axis] - initial.anchors.world[tip][axis], offset);
    }
    const datum = `${based.groupId}.build-datum`;
    near(moved.anchors.world[datum][2] - initial.anchors.world[datum][2], -0.161);
    assert.deepEqual(moved.anchors.world["build-platform"], initial.anchors.world["build-platform"]);
  }
});

test("the cold-room door keeps a real groove above its fixed guide throughout full travel", async t => {
  const door = await load("compositions/lift-slide-insulated-cold-room-door-with-upper-guide-rail");
  const roller = await load("components/construction/floor-fixed-height-adjustable-cold-room-door-guide-roller");
  const { document, groupId } = insertLibraryGroup(door, roller);
  const seat = document.parameters.anchors["door-floor-guide"];
  document.parameters.nodes.find(part => part.id === groupId).transform = { position: seat.position };
  document.parameters.attachments = [{
    from: "door-floor-guide", to: `${groupId}.door-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const checkGroove = (build, lift) => {
    const cast = sweepRay(t, [node(build, "floor-guide-slot")]);
    near(cast([0.774, 0.02, 0.091], [0, 1, 0])[0].point.y, 0.069 + lift);
    near(cast([0.774, 0.02, 0.117], [0, 1, 0])[0].point.y, 0.028 + lift);
  };
  checkGroove(initial, 0);
  setPose(document, "door-opening", 1.338);
  setPose(document, "seal-lift", 0.026);
  const opened = registry.build(document);
  checkGroove(opened, 0.026);
  assert.deepEqual(opened.anchors.world[`${groupId}.guide-center`], initial.anchors.world[`${groupId}.guide-center`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the separate curb inlet seats on an open vault port while its lip and basket move", async t => {
  const vault = await load("compositions/curb-inlet-tree-box-biofilter-vault-with-lift-out-prefilter");
  const inlet = await load("components/site/hinged-lip-curb-runoff-inlet-with-removable-trash-breaker");
  const { document, groupId } = insertLibraryGroup(vault, inlet);
  const dock = document.parameters.anchors["curb-in"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "curb-in", to: `${groupId}.curb-vault`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const rest = registry.build(document);
  const ray = sweepRay(t, [node(rest, "inlet-wall"), node(rest, `${groupId}.housing`)]);
  assert.equal(ray([-0.9, 0.391, 0], [1, 0, 0]).length, 0);
  assert.ok(ray([-0.9, 0.391, 0.13], [1, 0, 0]).length > 0);
  setPose(document, "basket-clearance", 0.327);
  setPose(document, `${groupId}.lip-angle`, 27);
  setPose(document, `${groupId}.screen-lift`, 0.105);
  const serviced = registry.build(document);
  near(serviced.anchors.world["basket-lift"][1] - rest.anchors.world["basket-lift"][1], 0.327);
  assert.notDeepEqual(serviced.anchors.world[`${groupId}.approach`], rest.anchors.world[`${groupId}.approach`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("all four vault cable paths stay open through both walls and a separate bellmouth fits", async t => {
  const vault = await load("compositions/four-bore-underground-cable-pull-vault-with-indexed-sliding-rack");
  const adapter = await load("components/site/split-tapered-cable-duct-bellmouth-with-compression-retainer");
  const { document, groupId } = insertLibraryGroup(vault, adapter);
  const dock = document.parameters.anchors["duct--1-0"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "duct--1-0", to: `${groupId}.duct-face`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  setPose(document, "lid-lift", 104);
  setPose(document, "rack-height", 0.113);
  setPose(document, `${groupId}.collar-shift`, -0.029);
  const build = registry.build(document);
  const walls = build.nodes.filter(part => /^(?:end-wall-|sleeve-)/.test(part.metadata.compositionNodeId) ||
    part.metadata.compositionNodeId.startsWith(`${groupId}.`));
  const clear = sweepRay(t, walls);
  for (const y of [0.205, 0.414]) {
    for (const z of [-0.172, 0.172]) assert.equal(clear([-0.976, y, z], [1, 0, 0]).length, 0);
  }
  assert.ok(clear([-0.976, 0.365, 0.045], [1, 0, 0]).length > 0);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("both platform gap stages add their travel under the independently floating nose", async () => {
  const filler = await load("compositions/recessed-two-stage-platform-gap-filler-with-quick-change-nose");
  const nose = await load("components/construction/replaceable-flex-nose-for-telescopic-platform-gap-filler");
  const { document, groupId } = insertLibraryGroup(filler, nose);
  const dock = document.parameters.anchors["nose-dock"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "nose-dock", to: `${groupId}.filler-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const contact = `${groupId}.contact`;
  near(initial.anchors.world[contact][2], initial.anchors.world["platform-edge"][2]);
  setPose(document, "middle-extension", 0.208);
  setPose(document, "nose-extension", 0.194);
  setPose(document, `${groupId}.edge-deflection`, -0.011);
  const extended = registry.build(document);
  near(extended.anchors.world[contact][2] - initial.anchors.world[contact][2], 0.402);
  near(extended.anchors.world[contact][1] - initial.anchors.world[contact][1], -0.011);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the separate access ramp rises with the lift and folds around its own axis", async () => {
  const lift = await load("compositions/two-column-vertical-access-platform-lift-with-independent-swing-gates");
  const ramp = await load("components/equipment/quick-mount-folding-access-lift-ramp-with-sliding-edge-stop");
  const { document, groupId } = insertLibraryGroup(lift, ramp);
  const dock = document.parameters.anchors["ramp-dock"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "ramp-dock", to: `${groupId}.lift-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const lowered = registry.build(document);
  setPose(document, "lift-height", 0.97);
  setPose(document, "gate-1-angle", 95);
  const raised = registry.build(document);
  const rampEnd = `${groupId}.ramp-end`;
  near(raised.anchors.world[rampEnd][1] - lowered.anchors.world[rampEnd][1], 0.97);
  setPose(document, `${groupId}.fold-angle`, 88);
  const stowed = registry.build(document);
  assert.ok(stowed.anchors.world[rampEnd][1] - raised.anchors.world[rampEnd][1] > 0.5);
  assert.deepEqual(stowed.anchors.world["ramp-dock"], raised.anchors.world["ramp-dock"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the sheet-pile driver carries a separate jaw and mates to the rolled wall profile", async () => {
  const driver = await load("compositions/cutaway-twin-eccentric-sheet-pile-vibratory-driver-with-quick-clamp-plate");
  const grip = await load("components/equipment/quick-mount-opposed-jaw-sheet-pile-head-with-open-guide-mouth");
  const pile = await load("components/structure/hat-profile-steel-sheet-pile-with-opposed-rolled-interlock-edges");
  let document = driver;
  const attachments = [];
  function attach(part, from, to) {
    const installed = insertLibraryGroup(document, part);
    document = installed.document;
    const mount = document.parameters.anchors[from];
    const child = document.parameters.nodes.find(part => part.id === installed.groupId);
    child.parent = mount.node;
    const offset = part.parameters.anchors[to].position;
    child.transform = { position: mount.position.map((value, i) => value - offset[i]) };
    attachments.push({ from, to: `${installed.groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    return installed.groupId;
  }
  const clamp = attach(grip, "clamp-dock", "driver-mate");
  const first = attach(pile, `${clamp}.pile-cap`, "clamp-axis");
  const second = attach(pile, `${first}.join-1`, "join--1");
  document.parameters.attachments = attachments;
  const initial = registry.build(document);
  setPose(document, "eccentric-turn", 90);
  setPose(document, `${clamp}.jaw-close`, 0.055);
  const closed = registry.build(document);
  const face = side => closed.anchors.world[`${clamp}.jaw-face-${side}`][2];
  near(face(1) - face(-1), 0.02);
  near(closed.anchors.world[`${second}.bottom`][0] - closed.anchors.world[`${first}.bottom`][0], 0.858);
  assert.notDeepEqual(closed.anchors.world["eccentric-index-0"], initial.anchors.world["eccentric-index-0"]);
  assert.deepEqual(closed.anchors.world[`${first}.clamp-axis`], initial.anchors.world[`${first}.clamp-axis`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the drum washer stays on its tilt seat while the mesh and nozzles articulate independently", async () => {
  const drum = await load("compositions/inclined-rotary-water-treatment-fine-screen-drum-with-cleanout-seat");
  const wash = await load("components/mep/quick-mount-drum-screen-wash-bar-with-offset-circular-jets");
  const { document, groupId } = insertLibraryGroup(drum, wash);
  const dock = document.parameters.anchors["wash-dock"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "wash-dock", to: `${groupId}.screen-dock`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const start = registry.build(document);
  setPose(document, "drum-angle", 163);
  const rolled = registry.build(document);
  const jet = `${groupId}.jet-3`;
  assert.deepEqual(rolled.anchors.world[jet], start.anchors.world[jet]);
  assert.notDeepEqual(node(rolled, "screen-sector-0-0").matrix, node(start, "screen-sector-0-0").matrix);
  setPose(document, "drum-pitch", 11);
  setPose(document, `${groupId}.jet-bank-angle`, 29);
  const cleaned = registry.build(document);
  assert.notDeepEqual(cleaned.anchors.worldDefinitions[jet].direction, rolled.anchors.worldDefinitions[jet].direction);
  assert.deepEqual(cleaned.anchors.world["skid-bottom"], start.anchors.world["skid-bottom"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the ceiling filter tray draws out its separate cassette without shifting the air-shower mount", async t => {
  let document = await load("compositions/two-door-assembly-air-shower-pod-with-adjustable-jet-banks");
  const attachments = [];
  async function attach(path, from, to) {
    const inserted = insertLibraryGroup(document, await load(path));
    document = inserted.document;
    const mount = document.parameters.anchors[from];
    const root = document.parameters.nodes.find(part => part.id === inserted.groupId);
    root.parent = mount.node;
    root.transform = { position: mount.position };
    attachments.push({ from, to: `${inserted.groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    return inserted.groupId;
  }
  const housing = await attach("compositions/ceiling-terminal-air-filter-housing-with-side-release-cassette-carriage", "ceiling-filter", "plenum-foot");
  const cassette = await attach("components/mep/mechanically-removable-v-fold-air-filter-panel-with-hinged-index-frame", `${housing}.filter-seat`, "cassette-mount");
  document.parameters.attachments = attachments;
  const initial = registry.build(document);
  const cast = sweepRay(t, [node(initial, "roof"), node(initial, `${housing}.base`)]);
  assert.equal(cast([0, 2.047, 0], [0, 1, 0]).length, 0);
  assert.ok(cast([0.159, 2.047, 0], [0, 1, 0]).length > 0);
  setPose(document, `${housing}.rail-travel`, 0.322);
  setPose(document, `${housing}.access-open`, 97);
  setPose(document, `${cassette}.media-up`, 0.093);
  const accessed = registry.build(document);
  const grip = `${cassette}.filter-handle`;
  near(accessed.anchors.world[grip][2] - initial.anchors.world[grip][2], 0.322);
  near(accessed.anchors.world[grip][1] - initial.anchors.world[grip][1], 0.093);
  assert.deepEqual(accessed.anchors.world["ceiling-filter"], initial.anchors.world["ceiling-filter"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("three winter work heads share the existing skid-steer mount and retain their own motions", async () => {
  const carrier = await load("compositions/compact-wheeled-skid-steer-loader-carrier");
  const bucket = await load("components/equipment/skid-steer-quick-attach-toothed-loader-bucket");
  const plate = bucket.parameters.nodes.find(part => part.id === "coupler").geometry;
  const choices = [
    ["components/equipment/skid-steer-quick-attach-twin-wing-snow-plough-with-trip-edge", "wing-1-angle", 37, "wing-end-1"],
    ["compositions/skid-steer-quick-attach-two-stage-rotary-snow-blower", "outlet-angle", 84, "output"],
    ["components/equipment/skid-steer-quick-attach-angling-road-sweeper-brush-with-splash-guard", "roller-angle", 113, "rotation-index"],
  ];
  for (const [id, control, angle, marker] of choices) {
    const tool = await load(id);
    assert.deepEqual(tool.parameters.nodes.find(part => part.id === "coupler").geometry, plate);
    const { document, groupId } = insertLibraryGroup(structuredClone(carrier), tool);
    const mount = document.parameters.anchors["tool-coupler"];
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.parent = mount.node;
    root.transform = { position: mount.position };
    document.parameters.attachments = [{
      from: "tool-coupler", to: `${groupId}.carrier`, contract: { direction: "opposed", gapTolerance: 1e-6 },
    }];
    setPose(document, "lift-angle", 26);
    setPose(document, "tool-pitch", -18);
    const raised = registry.build(document);
    setPose(document, `${groupId}.${control}`, angle);
    const worked = registry.build(document);
    assert.notDeepEqual(worked.anchors.world[`${groupId}.${marker}`], raised.anchors.world[`${groupId}.${marker}`]);
    assert.deepEqual(worked.anchors.world["tool-coupler"], raised.anchors.world["tool-coupler"]);
    assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  }
});

test("the winter spreader moves a real plate across the open throat", async t => {
  const model = await load("compositions/towable-granular-winter-road-spreader-with-sliding-meter-gate");
  const throatPasses = build => {
    const cast = sweepRay(t, [node(build, "hopper-bottom"), node(build, "seat"), node(build, "gate")]);
    return cast([-0.043, 0.305, 0], [0, -1, 0]).length === 0;
  };
  assert.equal(throatPasses(registry.build(model)), true);
  setPose(model, "gate-offset", 0.064);
  assert.equal(throatPasses(registry.build(model)), false);
});

test("the same car pallet mounts on a lift or a turntable and preserves independent wheel stops", async () => {
  const pallet = await load("components/equipment/mechanical-parking-vehicle-pallet-with-two-folding-wheel-stops");
  const lift = await load("compositions/two-post-mechanical-parking-lift-frame-with-sliding-pallet-receiver");
  const turntable = await load("compositions/pit-mounted-dual-ring-vehicle-parking-turntable-with-retractable-guides");
  function insert(host, from) {
    const { document, groupId } = insertLibraryGroup(host, pallet);
    const mount = document.parameters.anchors[from];
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.parent = mount.node;
    root.transform = { position: mount.position };
    document.parameters.attachments = [{
      from, to: `${groupId}.lift-mate`, contract: { direction: "opposed", gapTolerance: 1e-6 },
    }];
    return { document, groupId };
  }
  const raised = insert(lift, "truck-pallet");
  const start = registry.build(raised.document);
  setPose(raised.document, "lift-travel", 1.825);
  setPose(raised.document, "pallet-shift", 0.358);
  const shifted = registry.build(raised.document);
  const approach = `${raised.groupId}.approach`;
  near(shifted.anchors.world[approach][1] - start.anchors.world[approach][1], 1.825);
  near(shifted.anchors.world[approach][2] - start.anchors.world[approach][2], 0.358);
  assert.deepEqual(checkComposition(raised.document), { ok: true, issues: [] });

  const turned = insert(turntable, "vehicle-deck");
  setPose(turned.document, "heading", 90);
  const rotated = registry.build(turned.document);
  const direction = rotated.anchors.worldDefinitions[`${turned.groupId}.approach`].direction;
  near(direction[0], -1);
  setPose(turned.document, `${turned.groupId}.stop-1-fold`, 90);
  const cleared = registry.build(turned.document);
  const stop = `${turned.groupId}.wheel-stop-1`;
  near(rotated.anchors.world[stop][1] - cleared.anchors.world[stop][1], 0.161);
  assert.deepEqual(checkComposition(turned.document), { ok: true, issues: [] });
});

test("the sliding motor base carries the motor and its coupling with an actual continuous keyed bore", async t => {
  let document = await load("components/equipment/three-screw-motor-slide-base-with-transverse-tension-carriage");
  const attachments = [];
  async function attach(path, from, to) {
    const inserted = insertLibraryGroup(document, await load(path));
    document = inserted.document;
    const mount = document.parameters.anchors[from];
    const root = document.parameters.nodes.find(part => part.id === inserted.groupId);
    root.parent = mount.node;
    root.transform = { position: mount.position };
    attachments.push({ from, to: `${inserted.groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } });
    return inserted.groupId;
  }
  const motor = await attach("compositions/split-housing-foot-mounted-induction-motor-with-independent-rotor-and-fan", "motor-seat", "base-mount");
  const coupler = await attach("components/equipment/cutaway-serpentine-grid-shaft-coupling-with-offset-keyed-hubs", `${motor}.drive-face`, "input-face");
  document.parameters.attachments = attachments;
  const initial = registry.build(document);
  const cast = sweepRay(t, [node(initial, `${coupler}.hub--1`), node(initial, `${coupler}.hub-1`)]);
  assert.equal(cast([0.24, 0.368, 0], [1, 0, 0]).length, 0);
  assert.ok(cast([0.24, 0.368, 0.02], [1, 0, 0]).length > 0);
  setPose(document, "tension-travel", 0.082);
  setPose(document, `${motor}.rotor-angle`, 91);
  setPose(document, `${coupler}.hub-offset`, 0.018);
  const tensioned = registry.build(document);
  const mate = `${coupler}.output-face`;
  near(tensioned.anchors.world[mate][2] - initial.anchors.world[mate][2], 0.082);
  near(tensioned.anchors.world[mate][0] - initial.anchors.world[mate][0], 0.018);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the adjustable trench spreader joins two facing panels and clears its index holes", async t => {
  const panel = await load("components/site/modular-trench-shield-side-panel");
  const spreader = await load("components/equipment/telescopic-trench-shield-pinned-spreader");
  const first = insertLibraryGroup(panel, panel);
  const second = insertLibraryGroup(first.document, spreader);
  const { document, groupId } = second;
  const farPanel = document.parameters.nodes.find(part => part.id === first.groupId);
  farPanel.transform = { position: [0, 0, 1.81], rotation: [0, Math.PI, 0] };
  const spreaderRoot = document.parameters.nodes.find(part => part.id === groupId);
  spreaderRoot.transform = { position: [-0.889, 0.315, 0.125] };
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [
    { from: "left-lower-seat", to: `${groupId}.fixed-clevis`, contract },
    { from: `${first.groupId}.right-lower-seat`, to: `${groupId}.moving-clevis`, contract },
  ];
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const original = registry.build(document);
  setPose(document, `${groupId}.spreader-travel`, 0.32);
  farPanel.transform.position[2] += 0.32;
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  const extended = registry.build(document);
  assert.deepEqual(extended.anchors.world[`${groupId}.fixed-clevis`], original.anchors.world[`${groupId}.fixed-clevis`]);
  near(extended.anchors.world[`${groupId}.moving-clevis`][2] - original.anchors.world[`${groupId}.moving-clevis`][2], 0.32);

  const indexWalls = build => build.nodes.filter(part => /(?:outer|inner)-horizontal-/.test(part.metadata.compositionNodeId));
  const throughIndex = build => sweepRay(t, indexWalls(build))([-0.889, 0.45, 1.043], [0, -1, 0]);
  assert.equal(throughIndex(original).length, 0);
  assert.equal(throughIndex(extended).length, 0);
  setPose(document, `${groupId}.spreader-travel`, 0.36);
  farPanel.transform.position[2] += 0.04;
  assert.ok(throughIndex(registry.build(document)).length > 0);
});

test("the sediment chamber and V-notch weir preserve their physical flow openings", async t => {
  const chamber = await load("components/site/inspection-sediment-trap-chamber-with-lift-basket");
  const closed = registry.build(chamber);
  const chamberPorts = closed.nodes.filter(part => /^(?:ported-wall|neck)-/.test(part.metadata.compositionNodeId));
  const throughPorts = sweepRay(t, chamberPorts);
  assert.equal(throughPorts([-0.55, -0.265, 0], [1, 0, 0]).length, 0);
  assert.ok(throughPorts([-0.55, -0.265, 0.064], [1, 0, 0]).length > 0);
  setPose(chamber, "cover-angle", 90);
  setPose(chamber, "basket-height", 0.654);
  const opened = registry.build(chamber);
  near(opened.anchors.world["lift-eye"][1] - closed.anchors.world["lift-eye"][1], 0.654);
  assert.deepEqual(opened.anchors.world.inbound, closed.anchors.world.inbound);
  assert.deepEqual(opened.anchors.world.outbound, closed.anchors.world.outbound);

  const weir = registry.build(await load("components/instrument/v-notch-channel-flow-measurement-weir-box"));
  const throughWeir = sweepRay(t, [node(weir, "weir")]);
  assert.equal(throughWeir([-0.4, 0.2, 0], [1, 0, 0]).length, 0);
  assert.ok(throughWeir([-0.4, 0.1, 0], [1, 0, 0]).length > 0);
  assert.ok(throughWeir([-0.4, 0.2, 0.1], [1, 0, 0]).length > 0);
});

test("the planetary stage follows the fixed-ring ratio while the differential preserves both axle axes", async () => {
  const planetary = await load("compositions/open-housing-inline-planetary-reducer");
  const original = registry.build(planetary);
  setPose(planetary, "sun-angle", 175);
  setPose(planetary, "cover-offset", 0.174);
  const driven = registry.build(planetary);
  const zAngle = name => {
    const [x, y] = driven.anchors.worldDefinitions[name].direction;
    return Math.atan2(-x, y) * 180 / Math.PI;
  };
  near(zAngle("timing-key-in"), 175);
  near(zAngle("timing-key-out"), 50);
  near(driven.anchors.world["cover-pull"][2] - original.anchors.world["cover-pull"][2], 0.174);
  assert.deepEqual(driven.anchors.world["input-shaft"], original.anchors.world["input-shaft"]);
  assert.deepEqual(driven.anchors.world["output-shaft"], original.anchors.world["output-shaft"]);

  const differential = await load("components/equipment/open-four-bevel-gear-differential");
  const neutral = registry.build(differential);
  setPose(differential, "carrier-angle", 35);
  setPose(differential, "differential-angle", 25);
  const turning = registry.build(differential);
  for (const [side, angle] of [["left", 60], ["right", 10]]) {
    const [, y, z] = turning.anchors.worldDefinitions[`${side}-key`].direction;
    near(Math.atan2(z, y) * 180 / Math.PI, angle);
    turning.anchors.world[`${side}-axle`].forEach((value, index) => {
      near(value, neutral.anchors.world[`${side}-axle`][index]);
    });
  }
});

test("the rotary feeder has actual throat openings and the screw guard moves independently", async t => {
  const feeder = registry.build(await load("components/equipment/rotary-vane-airlock-feed-valve"));
  const shell = feeder.nodes.filter(part => /^(?:shell-|flange-)/.test(part.metadata.compositionNodeId));
  const throughThroat = sweepRay(t, shell);
  assert.equal(throughThroat([0, 0.27, 0], [0, -1, 0]).length, 0);
  assert.ok(throughThroat([0, 0.27, 0.14], [0, -1, 0]).length > 0);

  const conveyor = await load("compositions/horizontal-trough-screw-conveyor-cutaway");
  const closed = registry.build(conveyor);
  setPose(conveyor, "screw-angle", 90);
  setPose(conveyor, "lid-angle", 95);
  const opened = registry.build(conveyor);
  assert.equal(node(opened, "flight").geometry.type, "lofted-surface");
  assert.notDeepEqual(node(opened, "flight").geometry.sections[0], node(closed, "flight").geometry.sections[0]);
  assert.ok(opened.anchors.world["service-edge"][1] > closed.anchors.world["service-edge"][1] + 0.25);
  assert.deepEqual(opened.anchors.world.feed, closed.anchors.world.feed);
  assert.deepEqual(opened.anchors.world.discharge, closed.anchors.world.discharge);
});

test("a separately inserted loading chute follows both belt stages and has its own tilt", async () => {
  const loader = await load("compositions/two-stage-telescopic-loading-bay-belt-conveyor");
  const chute = await load("components/equipment/pivoting-telescopic-conveyor-nose-transfer-chute");
  const { document, groupId } = insertLibraryGroup(loader, chute);
  const flange = document.parameters.anchors["accessory-flange"];
  const chuteRoot = document.parameters.nodes.find(part => part.id === groupId);
  chuteRoot.parent = flange.node;
  chuteRoot.transform = { position: flange.position };
  document.parameters.attachments = [{
    from: "accessory-flange", to: `${groupId}.carrier`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];

  const closed = registry.build(document);
  setPose(document, "loader-extension", 1.48);
  const extended = registry.build(document);
  const outlet = build => build.anchors.world["parcel-discharge"];
  const tip = build => build.anchors.world[`${groupId}.transition-end`];
  near(outlet(extended)[2] - outlet(closed)[2], 1.48);
  near(tip(extended)[2] - tip(closed)[2], 1.48);
  assert.deepEqual(extended.anchors.world["parcel-inlet"], closed.anchors.world["parcel-inlet"]);

  setPose(document, "deck-tilt", -10);
  const lifted = registry.build(document);
  assert.ok(tip(lifted)[1] > tip(extended)[1] + 0.45);
  setPose(document, `${groupId}.chute-tilt`, 35);
  const lowered = registry.build(document);
  assert.ok(tip(lowered)[1] < tip(lifted)[1] - 0.1);
  assert.deepEqual(outlet(lowered), outlet(lifted));
  assert.deepEqual(lowered.anchors.world.foundation, closed.anchors.world.foundation);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the deflection head seats the drop weight and supports an independently spaced row of probes", async () => {
  const head = await load("components/instrument/guided-drop-weight-pavement-deflection-head");
  const beam = await load("components/instrument/sliding-four-probe-pavement-deflection-sensor-beam");
  const { document, groupId } = insertLibraryGroup(head, beam);
  const dock = document.parameters.anchors["beam-flange"];
  const beamRoot = document.parameters.nodes.find(part => part.id === groupId);
  beamRoot.parent = dock.node;
  beamRoot.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "beam-flange", to: `${groupId}.head-flange`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];

  const initial = registry.build(document);
  setPose(document, "drop-height", -0.129);
  setPose(document, `${groupId}.probe-pitch-offset`, 0.068);
  const wider = registry.build(document);
  near(node(wider, "weight-impact-face").geometry.points[0][1] + node(wider, "weight-impact-face").matrix[1][3], 0.111);
  for (const index of [1, 2, 3, 4]) {
    const key = `${groupId}.contact-${index}`;
    near(wider.anchors.world[key][1], 0);
    near(wider.anchors.world[key][2] - initial.anchors.world[key][2], (index - 1) * 0.068);
  }
  assert.deepEqual(wider.anchors.world["load-center"], initial.anchors.world["load-center"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the raised channel gate clears the actual waterway and keeps the wall ports fixed", async t => {
  const gate = await load("components/mep/motorized-rising-slide-gate-with-open-frame");
  const closed = registry.build(gate);
  const waterway = build => sweepRay(t, [node(build, "flange"), node(build, "gasket"), node(build, "gate-skin")]);
  assert.ok(waterway(closed)([0, 0.28, -0.1], [0, 0, 1]).length > 0);
  setPose(gate, "gate-opening", 0.47);
  const open = registry.build(gate);
  assert.equal(waterway(open)([0, 0.28, -0.1], [0, 0, 1]).length, 0);
  assert.ok(waterway(open)([0.29, 0.28, -0.1], [0, 0, 1]).length > 0);
  assert.deepEqual(open.anchors.world.upstream, closed.anchors.world.upstream);
  assert.deepEqual(open.anchors.world.downstream, closed.anchors.world.downstream);
});

test("the sump holds two independently inserted pumps with fixed guides and discharge ports", async t => {
  const sump = await load("compositions/duplex-pump-sump-service-chamber-with-docking-rails");
  const pump = await load("components/mep/guided-submersible-sump-pump-docking-module");
  const left = insertLibraryGroup(sump, pump);
  const right = insertLibraryGroup(left.document, pump);
  const { document } = right;
  document.parameters.attachments = [["left-pump-seat", left.groupId], ["right-pump-seat", right.groupId]].map(([id, groupId]) => {
    const seat = document.parameters.anchors[id];
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.parent = seat.node;
    root.transform = { position: seat.position };
    return { from: id, to: `${groupId}.dock`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
  });
  const closed = registry.build(document);
  setPose(document, "lid-angle", 97);
  const open = registry.build(document);
  assert.ok(open.anchors.world["service-grip"][1] > closed.anchors.world["service-grip"][1] + 0.4);
  for (const [sign, groupId] of [[-1, left.groupId], [1, right.groupId]]) {
    const intake = open.anchors.world[`${groupId}.intake`];
    near(intake[0], sign * 0.159);
    near(intake[1], 0.038);
    const guide = sweepRay(t, [node(open, `${groupId}.slider-1`)]);
    assert.equal(guide([intake[0] + 0.072, 0.3, 0.072], [0, -1, 0]).length, 0);
    assert.deepEqual(open.anchors.world[`${groupId}.dock`], closed.anchors.world[`${groupId}.dock`]);
  }
});

test("the formwork leg has real lock positions and the drop head retains the slab support", async t => {
  const leg = await load("components/construction/folding-height-adjustable-table-formwork-leg");
  const locked = registry.build(leg);
  const atPin = build => {
    const wall = build.nodes.filter(part => /^(?:inner|outer)-post-face-/.test(part.metadata.compositionNodeId));
    return sweepRay(t, wall)([0, 0.46, 0.15], [0, 0, -1]);
  };
  assert.equal(atPin(locked).length, 0);
  setPose(leg, "leg-drop", 0.2);
  const extended = registry.build(leg);
  assert.equal(atPin(extended).length, 0);
  near(locked.anchors.world.bearing[1] - extended.anchors.world.bearing[1], 0.15);
  setPose(leg, "leg-drop", 0.175);
  assert.ok(atPin(registry.build(leg)).length > 0);
  setPose(leg, "fold-angle", 88);
  assert.deepEqual(registry.build(leg).anchors.world["table-mount"], locked.anchors.world["table-mount"]);

  const dropHead = await load("components/construction/quick-release-slab-formwork-drop-head");
  const supported = registry.build(dropHead);
  setPose(dropHead, "release-angle", 93);
  setPose(dropHead, "plate-drop", 0.102);
  const released = registry.build(dropHead);
  near(supported.anchors.world["beam-seat"][1] - released.anchors.world["beam-seat"][1], 0.102);
  assert.deepEqual(released.anchors.world.slab, supported.anchors.world.slab);
});

test("the grader blade follows the front articulation while the rear tool keeps its own pose", async () => {
  const grader = await load("compositions/articulated-tandem-wheel-motor-grader-carrier");
  const blade = await load("components/equipment/motor-grader-circle-moldboard-module");
  const scarifier = await load("components/equipment/rear-motor-grader-five-shank-scarifier");
  const front = insertLibraryGroup(grader, blade);
  const rear = insertLibraryGroup(front.document, scarifier);
  const { document } = rear;
  document.parameters.attachments = [["grader-blade", front.groupId, "carriage"], ["rear-scarifier", rear.groupId, "carrier"]]
    .map(([modelAnchor, groupId, groupAnchor]) => {
      const seat = document.parameters.anchors[modelAnchor];
      const root = document.parameters.nodes.find(part => part.id === groupId);
      root.parent = seat.node;
      root.transform = { position: seat.position };
      return { from: modelAnchor, to: `${groupId}.${groupAnchor}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
    });
  const initial = registry.build(document);
  setPose(document, "articulation-angle", 21);
  setPose(document, "blade-lift", 0.1);
  const turning = registry.build(document);
  const cutting = `${front.groupId}.cutting-center`;
  const rearTooth = `${rear.groupId}.tooth-tip-2`;
  assert.ok(turning.anchors.world[cutting][0] > initial.anchors.world[cutting][0] + 0.25);
  near(turning.anchors.world[cutting][1] - initial.anchors.world[cutting][1], 0.1);
  assert.deepEqual(turning.anchors.world[rearTooth], initial.anchors.world[rearTooth]);
  setPose(document, `${rear.groupId}.linkage-angle`, 27);
  const raised = registry.build(document);
  assert.ok(raised.anchors.world[rearTooth][1] > turning.anchors.world[rearTooth][1]);
  assert.deepEqual(raised.anchors.world[cutting], turning.anchors.world[cutting]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the pipe tapping rig feeds into the existing saddle and the cold cutter keeps its fixed pipe axis", async () => {
  const saddle = await load("components/site/mechanical-tapping-saddle-with-real-side-outlet");
  const tapping = await load("components/tool/hand-crank-branch-pipe-tapping-rig");
  const { document, groupId } = insertLibraryGroup(saddle, tapping);
  const fixture = document.parameters.nodes.find(part => part.id === groupId);
  fixture.transform = { position: document.parameters.anchors.branch.position };
  document.parameters.attachments = [{
    from: "branch", to: `${groupId}.branch-mount`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const raised = registry.build(document);
  setPose(document, `${groupId}.tool-feed`, 0.105);
  setPose(document, `${groupId}.spindle-angle`, 123);
  const fed = registry.build(document);
  const cutter = `${groupId}.cutter-axis`;
  near(raised.anchors.world[cutter][1] - fed.anchors.world[cutter][1], 0.105);
  near(fed.anchors.world[cutter][0], fed.anchors.world.branch[0]);
  near(fed.anchors.world[cutter][2], fed.anchors.world.branch[2]);
  assert.deepEqual(fed.anchors.world.branch, raised.anchors.world.branch);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const lathe = await load("components/tool/split-frame-cold-cutting-pipe-lathe");
  const original = registry.build(lathe);
  setPose(lathe, "cutter-orbit", 172);
  setPose(lathe, "tool-infeed", 0.041);
  const cutting = registry.build(lathe);
  const position = cutting.anchors.world["tool-edge"];
  near(Math.hypot(position[0], position[1]), Math.hypot(0.134 - 0.059 - 0.041, 0.002));
  assert.deepEqual(cutting.anchors.world["pipe-axis"], original.anchors.world["pipe-axis"]);
});

test("the construction hoist stacks rack sections and the independent gate moves with the cage", async () => {
  const mast = await load("components/equipment/stackable-building-hoist-toothed-mast-section");
  const cage = await load("compositions/rack-driven-construction-material-hoist-cage");
  const door = await load("components/construction/vertical-sliding-mesh-gate-for-construction-hoist");
  const upper = insertLibraryGroup(mast, mast);
  const carrier = insertLibraryGroup(upper.document, cage);
  const doorInsertion = insertLibraryGroup(carrier.document, door);
  const { document } = doorInsertion;
  const root = groupId => document.parameters.nodes.find(part => part.id === groupId);
  root(upper.groupId).transform = { position: [0, 1.04, 0] };
  root(carrier.groupId).transform = { position: [0, 0, 0.248] };
  const threshold = document.parameters.anchors[`${carrier.groupId}.entry-gate`];
  root(doorInsertion.groupId).parent = threshold.node;
  root(doorInsertion.groupId).transform = { position: threshold.position };
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [
    { from: "top", to: `${upper.groupId}.bottom`, contract },
    { from: "rack-guide", to: `${carrier.groupId}.rack-reference`, contract },
    { from: `${carrier.groupId}.entry-gate`, to: `${doorInsertion.groupId}.cage`, contract },
  ];
  const initial = registry.build(document);
  const rackRows = initial.nodes
    .filter(part => part.metadata.compositionNodeId?.includes("rack-tooth"))
    .map(part => part.matrix[1][3])
    .sort((a, b) => a - b);
  assert.equal(rackRows.length, 80);
  rackRows.slice(1).forEach((height, index) => near(height - rackRows[index], 0.026));

  const deck = `${carrier.groupId}.deck`;
  const gate = `${doorInsertion.groupId}.clearance-edge`;
  const pinion = `${carrier.groupId}.pinion-mark`;
  setPose(document, `${carrier.groupId}.cage-travel`, 0.75);
  const lifted = registry.build(document);
  near(lifted.anchors.world[deck][1] - initial.anchors.world[deck][1], 0.75);
  near(lifted.anchors.world[gate][1] - initial.anchors.world[gate][1], 0.75);
  assert.notEqual(lifted.anchors.world[pinion][2], initial.anchors.world[pinion][2]);
  setPose(document, `${doorInsertion.groupId}.gate-slide`, 0.612);
  const opened = registry.build(document);
  near(opened.anchors.world[gate][1] - lifted.anchors.world[gate][1], 0.612);
  assert.deepEqual(opened.anchors.world[deck], lifted.anchors.world[deck]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the extractor hood follows both swivels and the round isolation blade clears its bore", async t => {
  const arm = await load("components/mep/two-swivel-wall-mounted-local-fume-extraction-arm");
  const hood = await load("components/mep/tilting-flanged-fume-capture-hood");
  const { document, groupId } = insertLibraryGroup(arm, hood);
  const receiver = document.parameters.anchors["hood-flange"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = receiver.node;
  root.transform = { position: receiver.position };
  document.parameters.attachments = [{
    from: "hood-flange", to: `${groupId}.arm`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  setPose(document, "base-swivel", 63);
  setPose(document, "elbow-swivel", -94);
  setPose(document, `${groupId}.hood-tilt`, 25);
  const positioned = registry.build(document);
  assert.deepEqual(positioned.anchors.world["fan-connection"], initial.anchors.world["fan-connection"]);
  assert.notDeepEqual(positioned.anchors.world["hood-flange"], initial.anchors.world["hood-flange"]);
  near(positioned.anchors.worldDefinitions[`${groupId}.capture`].direction[1], -Math.cos(25 * Math.PI / 180));
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const valve = await load("components/mep/side-sliding-round-duct-blast-gate");
  const throat = build => sweepRay(t, build.nodes.filter(part => /^(?:port-tube-|fixed-plate-|spade)/.test(part.metadata.compositionNodeId)));
  assert.ok(throat(registry.build(valve))([0, 0, -0.1], [0, 0, 1]).length > 0);
  setPose(valve, "gate-travel", 0.181);
  assert.equal(throat(registry.build(valve))([0, 0, -0.1], [0, 0, 1]).length, 0);
});

test("the roller feed stand joins the bender while the upper roller moves under load", async () => {
  const machine = await load("compositions/adjustable-three-roller-sheet-bending-machine");
  const stand = await load("components/tool/height-adjustable-twin-roller-sheet-feed-stand");
  const { document, groupId } = insertLibraryGroup(machine, stand);
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.transform = { position: [0, 0, -0.378] };
  document.parameters.attachments = [{
    from: "sheet-infeed", to: `${groupId}.outfeed`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const original = registry.build(document);
  setPose(document, "roll-compression", 0.064);
  const engaged = registry.build(document);
  near(original.anchors.world["roll-reference"][1] - engaged.anchors.world["roll-reference"][1], 0.064);
  assert.deepEqual(engaged.anchors.world["sheet-infeed"], original.anchors.world["sheet-infeed"]);
  setPose(document, "roller-turn", 90);
  const rotating = registry.build(document);
  assert.ok(rotating.anchors.world["roll-reference"][2] < engaged.anchors.world["roll-reference"][2] - 0.07);
  assert.deepEqual(rotating.anchors.world[`${groupId}.outfeed`], original.anchors.world[`${groupId}.outfeed`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the rail web holes align with the independently inserted fishplate across both rail ends", async t => {
  const rail = await load("components/site/rolled-rail-segment-with-web-bolt-holes");
  const joint = await load("components/site/bolted-twin-fishplate-joint-kit-for-web-rail");
  const second = insertLibraryGroup(rail, rail);
  const clamp = insertLibraryGroup(second.document, joint);
  const { document } = clamp;
  document.parameters.nodes.find(part => part.id === second.groupId).transform = { position: [0, 0, 1.256] };
  document.parameters.nodes.find(part => part.id === clamp.groupId).transform = { position: [0, 0.068, 0.628] };
  document.parameters.attachments = [{
    from: "front", to: `${second.groupId}.rear`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const assembled = registry.build(document);
  const walls = ["web", `${second.groupId}.web`, `${clamp.groupId}.splice--1`, `${clamp.groupId}.splice-1`];
  const throughJoint = sweepRay(t, walls.map(id => node(assembled, id)));
  for (const offset of [-0.144, -0.061, 0.061, 0.144]) {
    assert.equal(throughJoint([-0.075, 0.068, 0.628 + offset], [1, 0, 0]).length, 0);
  }
  assert.ok(throughJoint([-0.075, 0.068, 0.628 + 0.1], [1, 0, 0]).length > 0);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("identical drone arms keep separate joints after insertion and the installed scanner can turn", async () => {
  const dock = await load("compositions/split-roof-inspection-drone-landing-dock");
  const airframe = await load("components/equipment/modular-four-arm-inspection-quadrotor-airframe-core");
  const arm = await load("components/equipment/folding-inspection-drone-arm-with-editable-rotor");
  const scanner = await load("components/instrument/rotating-underbody-lidar-payload-for-inspection-drone");
  const body = insertLibraryGroup(dock, airframe);
  const left = insertLibraryGroup(body.document, arm);
  const right = insertLibraryGroup(left.document, arm);
  const lidar = insertLibraryGroup(right.document, scanner);
  const { document } = lidar;
  const connections = [
    ["landing-reference", body.groupId, "landing-datum"],
    [`${body.groupId}.front-left`, left.groupId, "airframe"],
    [`${body.groupId}.front-right`, right.groupId, "airframe"],
    [`${body.groupId}.payload`, lidar.groupId, "airframe"],
  ];
  document.parameters.attachments = connections.map(([from, groupId, interfaceId]) => {
    const anchor = document.parameters.anchors[from];
    const root = document.parameters.nodes.find(part => part.id === groupId);
    root.parent = anchor.node;
    root.transform = { position: anchor.position };
    return { from, to: `${groupId}.${interfaceId}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
  });
  const packed = registry.build(document);
  setPose(document, "roof-opening", 0.568);
  setPose(document, `${left.groupId}.arm-fold`, 52);
  setPose(document, `${lidar.groupId}.scanner-yaw`, 90);
  const opened = registry.build(document);
  assert.deepEqual(opened.anchors.world["landing-reference"], packed.anchors.world["landing-reference"]);
  assert.notDeepEqual(opened.anchors.world[`${left.groupId}.rotor-axis`], packed.anchors.world[`${left.groupId}.rotor-axis`]);
  assert.deepEqual(opened.anchors.world[`${right.groupId}.rotor-axis`], packed.anchors.world[`${right.groupId}.rotor-axis`]);
  assert.deepEqual(opened.anchors.world[`${lidar.groupId}.downward-axis`], packed.anchors.world[`${lidar.groupId}.downward-axis`]);
  const [x, y, z] = opened.anchors.worldDefinitions[`${lidar.groupId}.sweep-axis`].direction;
  near(x, 1);
  near(y, 0);
  near(z, 0);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("both hydraulic rods translate together and each fixed port reaches the hollow barrel", async t => {
  const cylinder = await load("components/equipment/tie-rod-double-ended-hollow-hydraulic-cylinder");
  const neutral = registry.build(cylinder);
  setPose(cylinder, "piston-position", 0.146);
  const extended = registry.build(cylinder);
  for (const id of ["left-rod", "right-rod"]) {
    near(extended.anchors.world[id][0] - neutral.anchors.world[id][0], 0.146);
  }
  for (const id of ["rear-port", "front-port"]) {
    assert.deepEqual(extended.anchors.world[id], neutral.anchors.world[id]);
  }

  const barrel = sweepRay(t, neutral.nodes.filter(part => /^(?:barrel-|wet-port-)/.test(part.metadata.compositionNodeId)));
  for (const x of [-0.218, 0.218]) {
    assert.ok(barrel([x, 0.12, 0], [0, -1, 0])[0].point.y < 0);
  }
  assert.ok(barrel([0.16, 0.12, 0], [0, -1, 0])[0].point.y > 0);
});

test("the suspended work platform accepts separate drive and wall roller attachments", async () => {
  const balcony = await load("compositions/twin-suspension-open-deck-facade-gondola");
  const drive = await load("components/equipment/open-case-rope-traction-hoist-for-facade-gondola");
  const wheel = await load("components/equipment/telescopic-wall-guide-roller-pair-for-suspended-gondola");
  const left = insertLibraryGroup(balcony, drive);
  const right = insertLibraryGroup(left.document, wheel);
  const { document } = right;
  document.parameters.attachments = [["left-drive", left.groupId, "carrier"], ["right-guide", right.groupId, "gondola"]]
    .map(([from, groupId, mate]) => {
      const anchor = document.parameters.anchors[from];
      const root = document.parameters.nodes.find(part => part.id === groupId);
      root.parent = anchor.node;
      root.transform = { position: anchor.position };
      return { from, to: `${groupId}.${mate}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
    });
  const assembled = registry.build(document);
  setPose(document, "entry-gate", 91);
  setPose(document, `${right.groupId}.guide-reach`, 0.071);
  const adjusted = registry.build(document);
  assert.ok(adjusted.anchors.world["front-edge"][1] > assembled.anchors.world["front-edge"][1] + 0.43);
  const roller = `${right.groupId}.right-contact`;
  near(assembled.anchors.world[roller][2] - adjusted.anchors.world[roller][2], 0.071);
  assert.deepEqual(adjusted.anchors.world[`${left.groupId}.rope-entry`], assembled.anchors.world[`${left.groupId}.rope-entry`]);
  assert.deepEqual(adjusted.anchors.world["work-floor"], assembled.anchors.world["work-floor"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the soil consolidation discs have open perforations and the load face moves independently", async t => {
  const cell = await load("components/instrument/clear-ring-oedometer-with-porous-discs");
  const original = registry.build(cell);
  const discs = sweepRay(t, ["upper-disc", "lower-disc"].map(id => node(original, id)));
  assert.equal(discs([0, 0.15, 0], [0, -1, 0]).length, 0);
  assert.ok(discs([0.006, 0.15, 0.006], [0, -1, 0]).length > 0);
  setPose(cell, "compression-travel", 0.028);
  const loaded = registry.build(cell);
  near(original.anchors.world["sample-top"][1] - loaded.anchors.world["sample-top"][1], 0.028);
  assert.deepEqual(loaded.anchors.world["sample-base"], original.anchors.world["sample-base"]);
  assert.deepEqual(loaded.anchors.world["dial-datum"], original.anchors.world["dial-datum"]);
});

test("shield cutter inserts follow the cutterhead and lining segments share a continuous arc edge", async () => {
  const head = await load("compositions/open-spoke-modular-shield-tunnel-cutterhead");
  const cutter = await load("components/equipment/bolt-on-shield-disc-cutter-cartridge");
  const { document, groupId } = insertLibraryGroup(head, cutter);
  const receiver = document.parameters.anchors["disc-seat-0-1"];
  const wheel = document.parameters.nodes.find(part => part.id === groupId);
  wheel.parent = receiver.node;
  wheel.transform = { position: receiver.position };
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [{ from: "disc-seat-0-1", to: `${groupId}.mount`, contract }];
  const original = registry.build(document);
  setPose(document, "head-angle", 90);
  const turned = registry.build(document);
  const index = `${groupId}.cutter-contact`;
  const before = original.anchors.world[index];
  const after = turned.anchors.world[index];
  near(after[0], -before[1]);
  near(after[1], before[0]);
  near(after[2], before[2]);
  assert.deepEqual(turned.anchors.world.drive, original.anchors.world.drive);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const lining = await load("components/site/precast-shield-lining-segment-with-bolt-pockets");
  const pair = insertLibraryGroup(lining, lining);
  const segment = pair.document.parameters.nodes.find(part => part.id === pair.groupId);
  segment.transform = { rotation: [0, 0, 58 * Math.PI / 180] };
  pair.document.parameters.attachments = [{ from: "counterclockwise", to: `${pair.groupId}.clockwise`, contract }];
  assert.deepEqual(checkComposition(pair.document), { ok: true, issues: [] });
});

test("the separately inserted Kelly stages carry the drill bucket along the mast axis", async () => {
  const mast = await load("compositions/rotary-pile-boring-mast-with-sliding-drive");
  const kelly = await load("components/equipment/two-stage-telescopic-kelly-bar-with-tool-square");
  const bucket = await load("components/equipment/hinged-bottom-rotary-pile-drilling-bucket");
  const bar = insertLibraryGroup(mast, kelly);
  const tool = insertLibraryGroup(bar.document, bucket);
  const { document } = tool;
  document.parameters.attachments = [["kelly-drive", bar.groupId, "spindle"], [`${bar.groupId}.drill-tool`, tool.groupId, "kelly"]]
    .map(([from, groupId, to]) => {
      const anchor = document.parameters.anchors[from];
      const root = document.parameters.nodes.find(part => part.id === groupId);
      root.parent = anchor.node;
      root.transform = { position: anchor.position };
      return { from, to: `${groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
    });
  const original = registry.build(document);
  const door = `${tool.groupId}.door-tip`;
  setPose(document, `${bar.groupId}.bar-extension`, 0.47);
  setPose(document, "carriage-height", 0.25);
  const reaching = registry.build(document);
  near(reaching.anchors.world[door][1] - original.anchors.world[door][1], 0.25 - 0.47);
  setPose(document, `${tool.groupId}.door-angle`, 80);
  setPose(document, "spindle-turn", 71);
  const open = registry.build(document);
  assert.ok(open.anchors.world[door][1] < reaching.anchors.world[door][1] - 0.24);
  assert.deepEqual(open.anchors.world.base, original.anchors.world.base);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the tamping tool closes both pairs inward and keeps its machine interface fixed", async () => {
  const head = await load("components/equipment/four-tine-hydraulic-track-tamping-head");
  const initial = registry.build(head);
  setPose(head, "head-drop", 0.081);
  const lowered = registry.build(head);
  const left = "working--1-0.063";
  const right = "working-1-0.063";
  near(lowered.anchors.world[left][1] - initial.anchors.world[left][1], -0.081);
  near(lowered.anchors.world[right][1] - initial.anchors.world[right][1], -0.081);
  setPose(head, "jaw-close", 21);
  const closed = registry.build(head);
  assert.ok(closed.anchors.world[left][0] > lowered.anchors.world[left][0]);
  assert.ok(closed.anchors.world[right][0] < lowered.anchors.world[right][0]);
  assert.deepEqual(closed.anchors.world.mount, initial.anchors.world.mount);
});

test("waste shredder knife stacks counter-rotate while the trommel keeps drilled screen panels", async () => {
  const shredder = await load("compositions/open-hopper-twin-shaft-construction-waste-shredder");
  const initial = registry.build(shredder);
  setPose(shredder, "shaft-angle", 90);
  setPose(shredder, "guard-angle", 95);
  const rotating = registry.build(shredder);
  near(node(rotating, "knife-ring--1-4").matrix[1][2], -1);
  near(node(rotating, "knife-ring-1-4").matrix[1][2], 1);
  assert.ok(rotating.anchors.world.guard[1] > initial.anchors.world.guard[1] + 0.27);
  assert.deepEqual(rotating.anchors.world.feed, initial.anchors.world.feed);
  assert.deepEqual(rotating.anchors.world.discharge, initial.anchors.world.discharge);

  const drum = await load("compositions/tiltable-perforated-recycling-trommel-drum");
  const screen = registry.build(drum).nodes.filter(part => /^panel-/.test(part.metadata.compositionNodeId));
  assert.equal(screen.length, 16);
  assert.ok(screen.every(part => part.geometry.holes.length === 11));
});

test("a separate bleacher seat folds independently and follows its retracting row", async () => {
  const bay = await load("compositions/four-tier-telescopic-retractable-bleacher-bay");
  const seat = await load("components/construction/fold-down-bleacher-seat-with-recessed-hinge");
  const { document, groupId } = insertLibraryGroup(bay, seat);
  const anchor = document.parameters.anchors["seat-3-1"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = anchor.node;
  root.transform = { position: anchor.position };
  document.parameters.attachments = [{
    from: "seat-3-1", to: `${groupId}.bleacher`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];

  const inUse = registry.build(document);
  const back = `${groupId}.back-edge`;
  const bench = `${groupId}.seat-contact`;
  setPose(document, `${groupId}.back-fold`, 89);
  const folded = registry.build(document);
  assert.ok(folded.anchors.world[back][1] < inUse.anchors.world[back][1] - 0.33);
  assert.deepEqual(folded.anchors.world[bench], inUse.anchors.world[bench]);
  setPose(document, "extension", 0);
  const nested = registry.build(document);
  near(folded.anchors.world[bench][2] - nested.anchors.world[bench][2], 1.407);
  assert.deepEqual(nested.anchors.world["edge-0"], inUse.anchors.world["edge-0"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the heat exchanger tube sheet stays open and its bundle slides out independently", async t => {
  const exchanger = await load("compositions/horizontal-tube-bundle-heat-exchanger-with-service-withdrawal");
  const assembled = registry.build(exchanger);
  const sheets = assembled.nodes.filter(part => /^tube-sheet-/.test(part.metadata.compositionNodeId));
  const ray = sweepRay(t, sheets);
  assert.equal(ray([0, 0.298, -0.5], [0, 0, 1]).length, 0);
  assert.ok(ray([0.020, 0.298, -0.5], [0, 0, 1]).length > 0);
  setPose(exchanger, "cover-offset", 0.255);
  setPose(exchanger, "bundle-pull", 0.819);
  const servicing = registry.build(exchanger);
  near(servicing.anchors.world["tube-out"][0] - assembled.anchors.world["tube-out"][0], 0.255);
  near(servicing.anchors.world["bundle-pull"][2] - assembled.anchors.world["bundle-pull"][2], 0.819);
  assert.deepEqual(servicing.anchors.world["shell-in"], assembled.anchors.world["shell-in"]);
  assert.deepEqual(servicing.anchors.world["shell-out"], assembled.anchors.world["shell-out"]);
});

test("the installed pump cartridge withdraws while both wet-end pipe ports stay fixed", async () => {
  const housing = await load("components/mep/fixed-wet-end-housing-for-back-pullout-pump");
  const core = await load("components/mep/six-vane-back-pullout-pump-impeller-cartridge");
  const { document, groupId } = insertLibraryGroup(housing, core);
  const station = document.parameters.anchors.cartridge;
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = station.node;
  root.transform = { position: station.position };
  document.parameters.attachments = [
    { from: "cartridge", to: `${groupId}.casing`, contract: { direction: "opposed", gapTolerance: 1e-6 } },
  ];
  const connected = registry.build(document);
  setPose(document, "pullout", 0.287);
  setPose(document, `${groupId}.impeller-angle`, 141);
  const servicing = registry.build(document);
  near(servicing.anchors.world[`${groupId}.wet-center`][2] - connected.anchors.world[`${groupId}.wet-center`][2], 0.287);
  assert.deepEqual(servicing.anchors.world.inlet, connected.anchors.world.inlet);
  assert.deepEqual(servicing.anchors.world.outlet, connected.anchors.world.outlet);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("a wall panel transport clamp follows its moving stand and releases independently", async () => {
  const frame = await load("compositions/adjustable-a-frame-precast-panel-transport-stillage");
  const clamp = await load("components/tool/anchorable-panel-stillage-over-center-restraint-clamp");
  const { document, groupId } = insertLibraryGroup(frame, clamp);
  const station = document.parameters.anchors["clamp-1-1"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = station.node;
  root.transform = { position: station.position };
  document.parameters.attachments = [{
    from: "clamp-1-1", to: `${groupId}.stillage`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const assembled = registry.build(document);
  setPose(document, "shoe-distance", 0.235);
  const spread = registry.build(document);
  const pad = `${groupId}.panel`;
  near(spread.anchors.world[pad][2] - assembled.anchors.world[pad][2], 0.235 / 2);
  setPose(document, `${groupId}.arm-open`, 90);
  const released = registry.build(document);
  assert.ok(released.anchors.world[pad][1] > spread.anchors.world[pad][1] + 0.18);
  assert.deepEqual(released.anchors.world["panel-rest-1-1"], spread.anchors.world["panel-rest-1-1"]);
  assert.deepEqual(released.anchors.world.floor, assembled.anchors.world.floor);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the loading yoke stays symmetric and the pullout fixture has a continuous axial bore", async t => {
  const yoke = await load("components/instrument/symmetric-four-point-flexural-loading-yoke");
  const initial = registry.build(yoke);
  setPose(yoke, "load-span", 0.163);
  const widened = registry.build(yoke);
  near(widened.anchors.world["left-load"][0], -widened.anchors.world["right-load"][0]);
  near(widened.anchors.world["right-load"][0] - widened.anchors.world["left-load"][0], 0.41 + 0.163);
  assert.deepEqual(widened.anchors.world.actuator, initial.anchors.world.actuator);

  const puller = await load("components/instrument/annular-anchor-pullout-proof-test-bridge");
  const base = registry.build(puller);
  const rings = ["bridge-ring", "cylinder-body", "bore-seat", "inner-piston", "pull-head", "thin-washer"];
  const ray = sweepRay(t, rings.map(id => node(base, id)));
  assert.equal(ray([0, 0.5, 0], [0, -1, 0]).length, 0);
  assert.ok(ray([0.02, 0.5, 0], [0, -1, 0]).length > 0);
  setPose(puller, "pull-stroke", 0.037);
  const loaded = registry.build(puller);
  near(loaded.anchors.world["pull-face"][1] - base.anchors.world["pull-face"][1], 0.037);
  assert.deepEqual(loaded.anchors.world["anchor-axis"], base.anchors.world["anchor-axis"]);
});

test("the roof hatch and installed ladder have independent movements and a shared mounting point", async () => {
  const hatch = await load("components/construction/flush-roof-service-hatch-with-underside-ladder-mount");
  const ladder = await load("components/construction/folding-telescopic-ladder-for-roof-service-hatch");
  const { document, groupId } = insertLibraryGroup(hatch, ladder);
  const anchor = document.parameters.anchors.ladder;
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = anchor.node;
  root.transform = { position: anchor.position };
  document.parameters.attachments = [{
    from: "ladder", to: `${groupId}.frame`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const shut = registry.build(document);
  setPose(document, "cover-angle", 88);
  const open = registry.build(document);
  assert.ok(open.anchors.world["lid-handle"][1] > shut.anchors.world["lid-handle"][1] + 0.71);
  const foot = `${groupId}.bottom`;
  assert.deepEqual(open.anchors.world[foot], shut.anchors.world[foot]);
  setPose(document, `${groupId}.ladder-extension`, 0.234);
  const extended = registry.build(document);
  near(open.anchors.world[foot][1] - extended.anchors.world[foot][1], 0.234);
  assert.deepEqual(extended.anchors.world["lid-handle"], open.anchors.world["lid-handle"]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the switchgear drawer withdraws as a separate insert while the shutter has its own guide", async () => {
  const cradle = await load("components/mep/switchgear-drawout-cradle-with-movable-shutter");
  const cartridge = await load("components/mep/six-contact-withdrawable-switchgear-drawer");
  const { document, groupId } = insertLibraryGroup(cradle, cartridge);
  const anchor = document.parameters.anchors.cartridge;
  const insert = document.parameters.nodes.find(part => part.id === groupId);
  insert.parent = anchor.node;
  insert.transform = { position: anchor.position };
  document.parameters.attachments = [{
    from: "cartridge", to: `${groupId}.cradle`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const docked = registry.build(document);
  setPose(document, "drawer-travel", 0.283);
  const out = registry.build(document);
  const terminals = `${groupId}.rear-interface`;
  near(out.anchors.world[terminals][2] - docked.anchors.world[terminals][2], 0.283);
  assert.deepEqual(out.anchors.world.shutter, docked.anchors.world.shutter);
  setPose(document, "shutter-height", 0);
  const isolated = registry.build(document);
  near(out.anchors.world.shutter[1] - isolated.anchors.world.shutter[1], 0.121);
  assert.deepEqual(isolated.anchors.world[terminals], out.anchors.world[terminals]);
  assert.deepEqual(isolated.anchors.world.mount, docked.anchors.world.mount);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("water-filled barrier sections share a pin axis and a separate lane boom telescopes before raising", async () => {
  const barrier = await load("components/site/hinged-link-hollow-water-ballast-work-zone-barrier");
  const { document, groupId } = insertLibraryGroup(barrier, barrier);
  const duplicate = document.parameters.nodes.find(part => part.id === groupId);
  duplicate.transform = { position: [1.028, 0, 0] };
  document.parameters.attachments = [{
    from: "end", to: `${groupId}.start`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const joined = registry.build(document);
  setPose(document, "pin-lift", 0.16);
  const released = registry.build(document);
  near(node(released, "shaft").geometry.start[1] - node(joined, "shaft").geometry.start[1], 0.16);
  assert.deepEqual(released.anchors.world.end, joined.anchors.world.end);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

  const bar = await load("components/site/pivoted-two-stage-work-zone-lane-control-bar");
  const before = registry.build(bar);
  setPose(bar, "bar-length", 0.26);
  const extended = registry.build(bar);
  near(extended.anchors.world["bar-tip"][0] - before.anchors.world["bar-tip"][0], 0.26);
  setPose(bar, "lift-angle", 89);
  const raised = registry.build(bar);
  assert.ok(raised.anchors.world["bar-tip"][1] > extended.anchors.world["bar-tip"][1] + 1.34);
  assert.deepEqual(raised.anchors.world.base, before.anchors.world.base);
});

test("the launch saddle moves its separate lattice nose and guide roller in two axes", async () => {
  const saddle = await load("compositions/two-axis-hydraulic-incremental-bridge-launching-saddle");
  const nose = await load("components/structure/bolted-lattice-launching-nose-for-bridge-girder");
  const wheel = await load("components/equipment/adjustable-side-guide-roller-for-bridge-launching-saddle");
  const girder = insertLibraryGroup(saddle, nose);
  const guide = insertLibraryGroup(girder.document, wheel);
  const { document } = guide;
  document.parameters.attachments = [["beam", girder.groupId, "slide-work"], ["guide-right", guide.groupId, "saddle"]]
    .map(([from, groupId, to]) => {
      const anchor = document.parameters.anchors[from];
      const local = document.parameters.anchors[`${groupId}.${to}`].position;
      const root = document.parameters.nodes.find(part => part.id === groupId);
      root.parent = anchor.node;
      root.transform = { position: anchor.position.map((value, i) => value - local[i]) };
      return { from, to: `${groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 } };
    });
  const assembled = registry.build(document);
  setPose(document, "lifting-stroke", 0.102);
  setPose(document, "launch-step", 0.139);
  const moved = registry.build(document);
  const nosePoint = `${girder.groupId}.front-reference`;
  near(moved.anchors.world[nosePoint][1] - assembled.anchors.world[nosePoint][1], 0.102);
  near(moved.anchors.world[nosePoint][2] - assembled.anchors.world[nosePoint][2], 0.139);
  setPose(document, `${guide.groupId}.guide-offset`, 0.049);
  const aligned = registry.build(document);
  const roller = `${guide.groupId}.side-contact`;
  near(aligned.anchors.world[roller][0] - moved.anchors.world[roller][0], 0.049);
  assert.deepEqual(aligned.anchors.world[nosePoint], moved.anchors.world[nosePoint]);
  assert.deepEqual(aligned.anchors.world.foundation, assembled.anchors.world.foundation);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("two modular cabins stack around a rotating twistlock without moving either bearing face", async () => {
  const cabin = await load("compositions/corner-connected-temporary-site-module-cabin");
  const lock = await load("components/construction/double-ended-quarter-turn-container-corner-twistlock");
  const bottom = insertLibraryGroup(cabin, lock);
  const upper = insertLibraryGroup(bottom.document, cabin);
  const { document } = upper;
  const lowerSeat = "corner-upper-0.704-1.123";
  const upperSeat = `${upper.groupId}.corner-lower-0.704-1.123`;
  const lowerAnchor = document.parameters.anchors[lowerSeat];
  const lockRoot = document.parameters.nodes.find(part => part.id === bottom.groupId);
  lockRoot.parent = lowerAnchor.node;
  lockRoot.transform = { position: lowerAnchor.position };
  const upperRoot = document.parameters.nodes.find(part => part.id === upper.groupId);
  upperRoot.transform = { position: [0, lowerAnchor.position[1] + 0.041 - 0.009, 0] };
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [
    { from: lowerSeat, to: `${bottom.groupId}.lower-seat`, contract },
    { from: `${bottom.groupId}.upper-seat`, to: upperSeat, contract },
  ];
  const inserted = registry.build(document);
  setPose(document, `${bottom.groupId}.lock-turn`, 90);
  const locked = registry.build(document);
  const handle = `${bottom.groupId}.operation`;
  assert.ok(locked.anchors.world[handle][2] < inserted.anchors.world[handle][2] - 0.1);
  assert.deepEqual(locked.anchors.world[lowerSeat], inserted.anchors.world[lowerSeat]);
  assert.deepEqual(locked.anchors.world[upperSeat], inserted.anchors.world[upperSeat]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the separate spline joins two timber cassettes while their covers stay independent", async () => {
  const cassette = await load("compositions/clt-floor-cassette-with-side-spline-slots-and-access-panel");
  const spline = await load("components/structure/slotted-double-spline-for-engineered-timber-floor-cassette");
  const panel = insertLibraryGroup(cassette, cassette);
  const splice = insertLibraryGroup(panel.document, spline);
  const { document } = splice;
  document.parameters.nodes.find(part => part.id === panel.groupId).transform = { position: [1.06, 0, 0] };
  document.parameters.nodes.find(part => part.id === splice.groupId).transform = { position: [0.53, 0.082, 0] };
  const contract = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [
    { from: "right-spline", to: `${splice.groupId}.left`, contract },
    { from: `${splice.groupId}.right`, to: `${panel.groupId}.left-spline`, contract },
  ];
  const closed = registry.build(document);
  setPose(document, "cover-angle", 90);
  setPose(document, `${splice.groupId}.clamp-lift`, 0.031);
  const opened = registry.build(document);
  assert.ok(opened.anchors.world.hatch[1] > closed.anchors.world.hatch[1] + 0.35);
  const service = `${splice.groupId}.service`;
  near(opened.anchors.world[service][1] - closed.anchors.world[service][1], 0.031);
  assert.deepEqual(opened.anchors.world[`${panel.groupId}.hatch`], closed.anchors.world[`${panel.groupId}.hatch`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the ultrasonic probe follows the pipe rail orbit and widens its acoustic pair independently", async () => {
  const rail = await load("components/instrument/split-ring-orbital-pipe-weld-inspection-track");
  const probe = await load("components/instrument/dual-wedge-ultrasonic-probe-carriage-for-pipe-seams");
  const { document, groupId } = insertLibraryGroup(rail, probe);
  const dock = document.parameters.anchors["probe-dock"];
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = dock.node;
  root.transform = { position: dock.position };
  document.parameters.attachments = [{
    from: "probe-dock", to: `${groupId}.track`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const initial = registry.build(document);
  const first = `${groupId}.first-acoustic`;
  const second = `${groupId}.second-acoustic`;
  setPose(document, "orbit-angle", 90);
  const rotated = registry.build(document);
  near(rotated.anchors.world[first][0], -initial.anchors.world[first][1]);
  near(rotated.anchors.world[first][1], initial.anchors.world[first][0]);
  assert.deepEqual(rotated.anchors.world["pipe-axis"], initial.anchors.world["pipe-axis"]);
  setPose(document, `${groupId}.probe-space`, 0.082);
  const separated = registry.build(document);
  near(separated.anchors.world[second][2] - rotated.anchors.world[second][2], 0.041);
  near(rotated.anchors.world[first][2] - separated.anchors.world[first][2], 0.041);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("the attached screed beam follows carrier height while its trailing edge can tilt", async () => {
  const carrier = await load("compositions/wheeled-laser-screed-carrier-with-height-mast");
  const beam = await load("components/equipment/two-axis-laser-screed-vibratory-head-module");
  const { document, groupId } = insertLibraryGroup(carrier, beam);
  const station = document.parameters.anchors.tool;
  const root = document.parameters.nodes.find(part => part.id === groupId);
  root.parent = station.node;
  root.transform = { position: station.position };
  document.parameters.attachments = [{
    from: "tool", to: `${groupId}.carrier`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const original = registry.build(document);
  setPose(document, "tool-height", 0.136);
  const lifted = registry.build(document);
  const shoe = `${groupId}.surface`;
  near(lifted.anchors.world[shoe][1] - original.anchors.world[shoe][1], 0.136);
  assert.deepEqual(lifted.anchors.world["left-optical"], original.anchors.world["left-optical"]);
  setPose(document, `${groupId}.trailing-tilt`, 22);
  const raked = registry.build(document);
  const tail = `${groupId}.trail`;
  assert.ok(raked.anchors.world[tail][1] < lifted.anchors.world[tail][1] - 0.03);
  assert.deepEqual(raked.anchors.world[shoe], lifted.anchors.world[shoe]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("survey optics turn on two axes while the tripod interface stays fixed", async () => {
  const model = await load("components/instrument/survey-total-station");
  const original = registry.build(model);
  setPose(model, "azimuth-angle", 90);
  setPose(model, "elevation-angle", 30);
  const posed = registry.build(model);
  const [x, y, z] = posed.anchors.worldDefinitions["sight-axis"].direction;
  near(x, 0);
  near(y, 0.5);
  near(z, -Math.sqrt(3) / 2);
  const object = posed.anchors.world["sight-axis"];
  const eye = posed.anchors.world["sight-origin"];
  const axis = object.map((value, index) => value - eye[index]);
  const length = Math.hypot(...axis);
  near(axis[1] / length, y);
  near(axis[2] / length, z);
  assert.deepEqual(posed.anchors.worldDefinitions["tripod-mount"], original.anchors.worldDefinitions["tripod-mount"]);
});

test("the personnel platform travels on two stages and its gate stays editable after insertion", async () => {
  const model = await load("compositions/vertical-mast-personnel-lift");
  const empty = { id: "work-area", component: "core.composition", parameters: { nodes: [] } };
  const { document, groupId } = insertLibraryGroup(empty, model);
  const original = registry.build(document);
  setPose(document, `${groupId}.platform-rise`, 2.25);
  const extended = registry.build(document);
  const floor = build => build.anchors.world[`${groupId}.platform-floor`][1];
  const middle = build => node(build, `${groupId}.intermediate-profile`).matrix[1][3];
  near(floor(extended) - floor(original), 2.25);
  near(middle(extended) - middle(original), 1.125);
  setPose(document, `${groupId}.gate-angle`, -88);
  const open = registry.build(document);
  assert.notDeepEqual(open.anchors.world[`${groupId}.entry`], extended.anchors.world[`${groupId}.entry`]);
  assert.deepEqual(open.anchors.world[`${groupId}.ground`], original.anchors.world[`${groupId}.ground`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});

test("cutoff wheels, bearing seats and dust fittings retain their authored openings", async t => {
  const wheel = registry.build(await load("components/tool/diamond-cutoff-wheel"));
  const wheelCore = sweepRay(t, [node(wheel, "core")]);
  assert.equal(wheelCore([0, 0.02, 0], [0, -1, 0]).length, 0);
  assert.ok(wheelCore([0.02, 0.02, 0], [0, -1, 0]).length > 0);

  const bearing = registry.build(await load("components/equipment/two-bolt-pillow-block-bearing"));
  const traceBearing = sweepRay(t, bearing.nodes.filter(part => part.geometry.type === "sweep"));
  for (const y of [0.045, 0.057, 0.069]) {
    assert.equal(traceBearing([0, y, -0.1], [0, 0, 1]).length, 0);
  }
  assert.ok(traceBearing([0.02, 0.057, -0.1], [0, 0, 1]).length > 0);

  const vacuum = registry.build(await load("compositions/mobile-industrial-dust-extractor"));
  const portAndBand = vacuum.nodes.filter(part => /^inlet-|^canister-/.test(part.metadata.compositionNodeId));
  const tracePort = sweepRay(t, portAndBand);
  assert.ok(tracePort([0.26, 0.455, 0], [-1, 0, 0])[0].point.x < 0);
  assert.ok(tracePort([0.26, 0.455, 0.04], [-1, 0, 0])[0].point.x > 0.17);
});

test("the hoist expands interlocking link rows and keeps the fixed chain when editing the hook", async () => {
  const model = await load("compositions/manual-chain-hoist");
  const original = registry.build(model);
  const links = build => build.nodes.filter(part => part.metadata.compositionNodeId.startsWith("load-link-"));
  assert.equal(links(original).length, 36);
  assert.equal(links(original)[0].geometry.holes.length, 1);
  setPose(model, "hook-swivel", 90);
  setPose(model, "hook-latch", -35);
  const posed = registry.build(model);
  assert.deepEqual(links(posed), links(original));
  assert.notDeepEqual(posed.anchors.world["lower-seat"], original.anchors.world["lower-seat"]);
  assert.deepEqual(posed.anchors.world["upper-seat"], original.anchors.world["upper-seat"]);
});

test("a separately inserted robot tool follows the wrist and preserves symmetric jaw travel", async () => {
  const robot = await load("compositions/six-axis-industrial-robot");
  const gripper = await load("components/equipment/robot-parallel-jaw-gripper");
  const { document, groupId } = insertLibraryGroup(robot, gripper);
  const mount = document.parameters.nodes.find(part => part.id === groupId);
  const flange = document.parameters.anchors["tool-flange"];
  mount.parent = flange.node;
  mount.transform = { position: flange.position };
  document.parameters.attachments = [{
    from: "tool-flange", to: `${groupId}.robot-flange`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];

  const before = registry.build(document);
  for (const [joint, value] of [["base-yaw", 55], ["shoulder-pitch", 25], ["elbow-pitch", -35], ["wrist-pitch", 28]]) {
    setPose(document, joint, value);
  }
  const positioned = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.notDeepEqual(positioned.anchors.world["tool-flange"], before.anchors.world["tool-flange"]);
  assert.deepEqual(positioned.anchors.world["installation-base"], before.anchors.world["installation-base"]);

  setPose(document, "tool-roll", 90);
  setPose(document, `${groupId}.jaw-opening`, 0.026);
  const opened = registry.build(document);
  const gap = build => {
    const left = build.anchors.world[`${groupId}.left-contact`];
    const right = build.anchors.world[`${groupId}.right-contact`];
    return Math.hypot(...left.map((value, index) => value - right[index]));
  };
  near(gap(opened) - gap(positioned), 0.026);
  assert.deepEqual(opened.anchors.world["tool-flange"], positioned.anchors.world["tool-flange"]);
});

test("the concrete bucket gates open downward while the port stays centered", async () => {
  const model = await load("compositions/bottom-gate-concrete-placement-bucket");
  const before = registry.build(model);
  setPose(model, "gate-angle", -65);
  const open = registry.build(model);
  const left = open.anchors.world["door-tip--1"];
  const right = open.anchors.world["door-tip-1"];
  assert.ok(left[1] < before.anchors.world["door-tip--1"][1] - 0.1);
  near(left[0], -right[0]);
  near(left[1], right[1]);
  assert.deepEqual(open.anchors.world.discharge, before.anchors.world.discharge);
  assert.deepEqual(open.anchors.world["lifting-eye"], before.anchors.world["lifting-eye"]);
});

test("the quick changer plates use opposing docking axes and keep their own lock and tool controls", async () => {
  const master = await load("components/equipment/robot-quick-changer-master");
  const toolPlate = await load("components/equipment/robot-quick-changer-tool-plate");
  const gripper = await load("components/equipment/robot-parallel-jaw-gripper");
  const plate = insertLibraryGroup(master, toolPlate);
  const tool = insertLibraryGroup(plate.document, gripper);
  const document = tool.document;
  const plateNode = document.parameters.nodes.find(part => part.id === plate.groupId);
  plateNode.transform = { position: [0.053, 0, 0] };
  const gripperNode = document.parameters.nodes.find(part => part.id === tool.groupId);
  gripperNode.parent = plate.groupId;
  gripperNode.transform = { position: [0.037, 0, 0] };
  const opposed = { direction: "opposed", gapTolerance: 1e-6 };
  document.parameters.attachments = [
    { from: "tool-dock", to: `${plate.groupId}.master-dock`, contract: opposed },
    { from: `${plate.groupId}.tool-flange`, to: `${tool.groupId}.robot-flange`, contract: opposed },
  ];
  const before = registry.build(document);
  setPose(document, "ball-extension", -0.0033);
  setPose(document, `${tool.groupId}.jaw-opening`, 0.036);
  const opened = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  near(node(before, "ball-0").matrix[1][3] - node(opened, "ball-0").matrix[1][3], 0.0033);
  assert.deepEqual(opened.anchors.world["tool-dock"], before.anchors.world["tool-dock"]);
  assert.deepEqual(opened.anchors.world[`${tool.groupId}.grip-center`], before.anchors.world[`${tool.groupId}.grip-center`]);
});

test("the mobile robot docks at the charge contacts and can lift through the transfer seat range", async () => {
  const vehicle = await load("compositions/low-profile-amr-pallet-lift-base");
  const dock = await load("components/equipment/floor-mounted-amr-charging-dock");
  const vehicleContact = registry.build(vehicle).anchors.world["dock-contact"];
  const dockContact = registry.build(dock).anchors.world["robot-contact"];
  const { document, groupId } = insertLibraryGroup(dock, vehicle);
  document.parameters.nodes.find(part => part.id === groupId).transform = {
    position: dockContact.map((value, index) => value - vehicleContact[index]),
  };
  document.parameters.attachments = [{
    from: "robot-contact", to: `${groupId}.dock-contact`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const before = registry.build(document);
  setPose(document, `${groupId}.lift-height`, 0.049);
  const raised = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.deepEqual(raised.anchors.world[`${groupId}.dock-contact`], before.anchors.world[`${groupId}.dock-contact`]);

  const stand = registry.build(await load("components/equipment/three-point-amr-load-transfer-stand"));
  const lowerHeight = before.anchors.world[`${groupId}.cargo-seat`][1];
  const upperHeight = raised.anchors.world[`${groupId}.cargo-seat`][1];
  near(upperHeight - lowerHeight, 0.049);
  for (let index = 0; index < 3; index++) {
    const height = stand.anchors.world[`pallet-seat-${index}`][1];
    assert.ok(height > lowerHeight && height < upperHeight);
  }
});

test("floor reference anchors line up with the compressor wheels and horizontal trowel assembly", async () => {
  const compressor = registry.build(await load("compositions/rolling-twin-cylinder-air-compressor"));
  near(compressor.anchors.world.ground[1], compressor.bounds.min[1]);
  const model = await load("compositions/walk-behind-concrete-power-trowel");
  const resting = registry.build(model);
  near(resting.anchors.world["finish-plane"][1], resting.bounds.min[1]);
  setPose(model, "blade-pitch", 13);
  const pitched = registry.build(model);
  assert.ok(pitched.bounds.min[1] >= resting.bounds.min[1]);
  assert.deepEqual(pitched.anchors.world["finish-plane"], resting.anchors.world["finish-plane"]);
});

test("the telescopic bollard retracts flush without shifting the casing or drain", async () => {
  const model = await load("components/site/recessed-telescopic-road-bollard");
  setPose(model, "post-rise", -0.027);
  const retracted = registry.build(model);
  near(retracted.anchors.world["raised-post"][1], retracted.anchors.world.paving[1]);
  setPose(model, "post-rise", 0.590);
  const raised = registry.build(model);
  near(raised.anchors.world["raised-post"][1] - retracted.anchors.world["raised-post"][1], 0.617);
  assert.deepEqual(raised.anchors.world.paving, retracted.anchors.world.paving);
  assert.deepEqual(raised.anchors.world.drain, retracted.anchors.world.drain);
});

test("basket strainer pipe bores enter the casing and stay fixed during service", async t => {
  const model = await load("components/mep/two-position-header-ring-basket-strainer");
  const closed = registry.build(model);
  const pipeAndCase = closed.nodes.filter(part => /^(side-shell|pipe-)/.test(part.metadata.compositionNodeId));
  const trace = sweepRay(t, pipeAndCase);
  for (const sign of [-1, 1]) {
    assert.equal(trace([sign * 0.19, 0.217, 0], [-sign, 0, 0]).length, 0);
  }
  assert.ok(trace([0.19, 0.255, 0], [-1, 0, 0]).length > 0);
  setPose(model, "service-takeout", 0.229);
  const open = registry.build(model);
  near(open.anchors.world["basket-handle"][1] - closed.anchors.world["basket-handle"][1], 0.229);
  assert.deepEqual(open.anchors.world.upstream, closed.anchors.world.upstream);
  assert.deepEqual(open.anchors.world.downstream, closed.anchors.world.downstream);
});

test("the mill lowers its tool to the fixture zone while both table feeds stay independent", async () => {
  const model = await load("compositions/three-axis-vertical-cnc-milling-machine");
  const rest = registry.build(model);
  setPose(model, "feed-x", 0.193);
  setPose(model, "feed-z", -0.144);
  setPose(model, "head-height", -0.300);
  const fed = registry.build(model);
  const table = fed.anchors.world["fixture-face"];
  const tool = fed.anchors.world["cutter-tip"];
  near(table[0] - rest.anchors.world["fixture-face"][0], 0.193);
  near(table[2] - rest.anchors.world["fixture-face"][2], -0.144);
  near(tool[1] - rest.anchors.world["cutter-tip"][1], -0.300);
  near(tool[1] - table[1], 0.014);
  assert.deepEqual(fed.anchors.world.foundation, rest.anchors.world.foundation);
});

test("the anchor bolt jig changes each grid dimension while keeping all locators on a centered rectangle", async () => {
  const model = await load("components/construction/adjustable-foundation-anchor-bolt-setting-template");
  setPose(model, "grid-width", 0.173);
  setPose(model, "grid-depth", -0.117);
  const placed = registry.build(model);
  const holes = Object.entries(placed.anchors.world).filter(([name]) => name.startsWith("bolt-center-")).map(([, point]) => point);
  assert.equal(holes.length, 4);
  for (const [x, y, z] of holes) {
    near(Math.abs(x), (0.382 + 0.173) / 2);
    near(Math.abs(z), (0.274 - 0.117) / 2);
    near(y, 0.308);
  }
  assert.deepEqual(placed.anchors.world["form-datum"], [0, 0, 0]);
});

test("a telehandler's separate fork carriage follows both extension stages and the coupler tilt", async () => {
  const machine = await load("compositions/compact-telescopic-material-handler");
  const carriage = await load("components/equipment/quick-mount-adjustable-telehandler-fork-carriage");
  const { document, groupId } = insertLibraryGroup(machine, carriage);
  const face = document.parameters.anchors["quick-attach-face"];
  const group = document.parameters.nodes.find(part => part.id === groupId);
  group.parent = face.node;
  group.transform = { position: face.position };
  document.parameters.attachments = [{
    from: "quick-attach-face", to: `${groupId}.carrier-coupler`, contract: { direction: "opposed", gapTolerance: 1e-6 },
  }];
  const start = registry.build(document);
  setPose(document, "boom-extension", 2.03);
  const extended = registry.build(document);
  const tip = `${groupId}.fork-tip-1`;
  near(Math.hypot(...extended.anchors.world[tip].map((value, index) => value - start.anchors.world[tip][index])), 2.03);
  setPose(document, "coupler-tilt", 34);
  setPose(document, `${groupId}.fork-spacing`, 0.173);
  const tilted = registry.build(document);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  assert.notDeepEqual(tilted.anchors.worldDefinitions[tip].direction, extended.anchors.worldDefinitions[tip].direction);
  assert.deepEqual(tilted.anchors.world.ground, start.anchors.world.ground);
});

test("straight, rotary and lift conveyor modules share a roller height with independent motion", async () => {
  const straight = await load("components/equipment/motorized-pallet-roller-conveyor-section");
  const rotary = await load("compositions/motorized-pallet-conveyor-rotary-transfer-table");
  const lift = await load("compositions/four-guide-roller-conveyor-lift-transfer");
  const height = registry.build(straight).anchors.world.outfeed[1];
  near(registry.build(rotary).anchors.world["rotary-feed"][1], height);
  near(registry.build(lift).anchors.world.infeed[1], height);
  setPose(rotary, "transfer-angle", 90);
  const rotated = registry.build(rotary);
  near(rotated.anchors.world["rotary-discharge"][1], height);
  near(rotated.anchors.worldDefinitions["rotary-discharge"].direction[2], -1);
  setPose(lift, "lift-height", 0.134);
  const raised = registry.build(lift);
  near(raised.anchors.world.outfeed[1], height + 0.134);
  assert.deepEqual(raised.anchors.world.installation, [0, 0, 0]);
});

test("the separate clamshell tool opens outward symmetrically around a fixed carrier", async () => {
  const model = await load("components/equipment/dual-jaw-excavator-clamshell-grab");
  const closed = registry.build(model);
  setPose(model, "jaw-opening", 56);
  const open = registry.build(model);
  const left = open.anchors.world["lip--1"];
  const right = open.anchors.world["lip-1"];
  assert.ok(right[0] > 0.25 && left[0] < -0.25);
  near(left[0], -right[0]);
  near(left[1], right[1]);
  assert.deepEqual(open.anchors.world["mount-pin-0"], closed.anchors.world["mount-pin-0"]);
  assert.deepEqual(open.anchors.world["mount-pin-1"], closed.anchors.world["mount-pin-1"]);
});

test("independent tower crane modules stack and carry both arms with the slewing platform", async () => {
  const [base, mast, carrier, jib, tail] = await Promise.all([
    "cross-beam-ballasted-tower-crane-base-frame",
    "modular-lattice-tower-crane-mast-section",
    "tower-crane-slew-platform-and-operator-cab",
    "lattice-hammerhead-tower-crane-jib-with-trolley",
    "tower-crane-counter-jib-and-ballast-carrier",
  ].map(id => load(`components/equipment/${id}`)));
  let document = base;
  const attachments = [];
  function attach(model, from, to, rotation) {
    const inserted = insertLibraryGroup(document, model);
    document = inserted.document;
    const source = document.parameters.anchors[from];
    const group = document.parameters.nodes.find(part => part.id === inserted.groupId);
    group.parent = source.node;
    group.transform = { position: source.position, ...(rotation ? { rotation } : {}) };
    attachments.push({
      from, to: `${inserted.groupId}.${to}`, contract: { direction: "opposed", gapTolerance: 1e-6 },
    });
    return inserted.groupId;
  }
  const lower = attach(mast, "mast-seat", "mast-base");
  const upper = attach(mast, `${lower}.mast-top`, "mast-base");
  const platform = attach(carrier, `${upper}.mast-top`, "mast-seat");
  const front = attach(jib, `${platform}.jib-dock`, "root-dock");
  const rear = attach(tail, `${platform}.counter-arm`, "counter-jib-root", [0, Math.PI, 0]);
  document.parameters.attachments = attachments;
  const initial = registry.build(document);
  const hook = `${front}.load-hook`;
  const ballast = `${rear}.weight-position-0`;
  near(initial.anchors.world[`${upper}.mast-top`][1], 4.313);
  setPose(document, `${platform}.slew-angle`, 90);
  const turned = registry.build(document);
  near(turned.anchors.world[hook][2], -initial.anchors.world[hook][0]);
  near(turned.anchors.world[ballast][2], -initial.anchors.world[ballast][0]);
  assert.deepEqual(turned.anchors.world[`${upper}.mast-top`], initial.anchors.world[`${upper}.mast-top`]);
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
});
