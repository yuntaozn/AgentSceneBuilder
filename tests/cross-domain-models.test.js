import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { insertLibraryGroup } from "../apps/editor/library-insert.js";
import { checkComposition, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const load = async name => {
  const { editor } = JSON.parse(await readFile(new URL(`../registry/compositions/${name}/manifest.json`, import.meta.url), "utf8"));
  return editor.document;
};
const pose = (document, id, value) => {
  const control = document.parameters.poseControls.find(control => control.id === id);
  assert.ok(control, `Missing pose ${id}`);
  control.value = value;
};
const part = (build, id) => build.nodes.find(node => node.metadata?.compositionNodeId === id);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `Expected ${a} to equal ${b}`);
const check = document => assert.deepEqual(checkComposition(document), { ok: true, issues: [] });

test("the aquarium arch stays open as a nested rear filter cartridge is lifted", async t => {
  const document = await load("complete-desktop-aquarium-with-lid-light-filter-and-rock-arch");
  const arch = "aquascape-rock-arch-with-real-swim-through-opening";
  const filter = "complete-rim-hung-filter-with-two-independent-media-cartridges";
  const cartridge = `${filter}.lift-out-aquarium-media-cartridge-with-perforated-plates`;
  const returnLip = `${filter}.rim-hung-aquarium-filter-body-with-hinged-service-lid.return-lip`;
  const before = registry.build(document);
  const [x, y, z] = before.anchors.world[`${arch}.cave-front`];
  const throughArch = sweepRay(t, [part(before, `${arch}.main-cavity`)]);
  assert.equal(throughArch([x, y, z + 0.004], [0, 0, -1]).length, 0);
  assert.ok(throughArch([x - 0.072, y, z + 0.004], [0, 0, -1]).length > 0);
  pose(document, `${cartridge}-2.withdraw`, 0.13);
  const after = registry.build(document);
  near(after.anchors.world[`${cartridge}-2.lift-ring`][1], before.anchors.world[`${cartridge}-2.lift-ring`][1] + 0.13);
  for (const anchor of [`${cartridge}.lift-ring`, returnLip, `${arch}.cave-front`]) {
    assert.deepEqual(after.anchors.world[anchor], before.anchors.world[anchor]);
  }
  check(document);
});

test("a pottery blank turns and lifts with its bat while the split pan moves separately", async t => {
  const document = await load("complete-pottery-wheel-with-lift-off-bat-splash-pan-and-vase");
  const wheel = "pottery-wheelhead-with-two-locating-pins-and-turn-axis";
  const board = "removable-two-hole-pottery-bat-with-edge-grips";
  const vase = "open-wheel-thrown-vase-with-hollow-wall-and-thrown-ridges";
  const pan = "split-pottery-splash-pan-with-independently-removable-halves";
  pose(document, `${wheel}.wheel-turn`, 0);
  const before = registry.build(document);
  const throughBoard = sweepRay(t, [part(before, `${board}.bat-board`)]);
  for (const pin of [-0.104, 0.104]) {
    const [x, y, z] = before.anchors.world[`${wheel}.pin-${pin}`];
    assert.equal(throughBoard([x, y - 0.017, z], [0, 1, 0]).length, 0);
    assert.ok(throughBoard([x + 0.014, y - 0.017, z], [0, 1, 0]).length > 0);
  }
  pose(document, `${wheel}.wheel-turn`, 90);
  pose(document, `${board}.bat-remove`, 0.084);
  pose(document, `${pan}.half-slide-0`, 0.067);
  const after = registry.build(document);
  near(after.anchors.world[`${board}.rim-grip`][0], 0.151);
  near(after.anchors.world[`${vase}.mouth`][1], before.anchors.world[`${vase}.mouth`][1] + 0.084);
  near(after.anchors.world[`${pan}.grip-0`][0], before.anchors.world[`${pan}.grip-0`][0] - 0.067);
  assert.deepEqual(after.anchors.world[`${pan}.grip-1`], before.anchors.world[`${pan}.grip-1`]);
  check(document);
});

test("the clay slab roller converts travel to crank rotation and keeps height adjustment independent", async () => {
  const document = await load("complete-bench-clay-slab-roller-with-moving-crank-carriage");
  const roller = "travelling-clay-slab-roller-with-linked-crank-and-height-adjustment";
  const deck = "ceramic-slab-workbed-with-longitudinal-carriage-guides";
  pose(document, `${roller}.traverse`, 0);
  const before = registry.build(document);
  pose(document, `${roller}.traverse`, 0.029);
  pose(document, `${roller}.roller-drop`, 0.024);
  const after = registry.build(document);
  const axis = after.anchors.world[`${roller}.roller-axis`];
  const grip = after.anchors.world[`${roller}.crank-grip`];
  near(axis[2], 0.029);
  near(axis[1], before.anchors.world[`${roller}.roller-axis`][1] - 0.013);
  near(grip[1] - axis[1], 0.066 * Math.cos(1));
  near(grip[2] - axis[2], 0.066 * Math.sin(1));
  assert.deepEqual(after.anchors.world[`${deck}.slab-in`], before.anchors.world[`${deck}.slab-in`]);
  check(document);
});

test("the easel keeps its canvas seated while the lower tray, mast tilt and rear leg are adjusted", async () => {
  const document = await load("complete-folding-studio-easel-with-adjustable-mast-and-canvas");
  const base = "three-leg-studio-easel-base-with-folding-rear-leg";
  const mast = "tilting-easel-mast-with-telescopic-clamp-and-lifting-tray";
  const canvas = "stretched-artist-canvas-with-rear-wood-frame-and-diagonal-braces";
  const before = registry.build(document);
  pose(document, `${mast}.lower-height`, 0.13);
  const raised = registry.build(document);
  near(raised.anchors.world[`${canvas}.picture-centre`][1], before.anchors.world[`${canvas}.picture-centre`][1] + 0.072 * Math.cos(7 * Math.PI / 180));
  pose(document, `${mast}.tilt`, 12);
  pose(document, `${base}.rear-fold`, 12);
  const folded = registry.build(document);
  assert.deepEqual(folded.anchors.world[`${canvas}.easel-fit`], folded.anchors.world[`${mast}.canvas-seat`]);
  assert.ok(folded.anchors.world[`${base}.rear-foot`][2] > before.anchors.world[`${base}.rear-foot`][2]);
  assert.deepEqual(folded.anchors.world[`${base}.front-floor`], before.anchors.world[`${base}.front-floor`]);
  check(document);
});

test("the watercolour kit reuses one pan with distinct pigments and independent removal", async t => {
  const document = await load("complete-field-watercolour-box-with-six-removable-colours-and-mixing-tray");
  const pan = "liftable-watercolour-half-pan-with-separate-pigment-cake";
  const palette = "fold-out-watercolour-mixing-palette-with-three-wells";
  const box = "six-pocket-watercolour-box-with-hinged-lid-and-brush-rest";
  const before = registry.build(document);
  const colours = [pan, ...[2, 3, 4, 5, 6].map(i => `${pan}-${i}`)].map(id => part(before, `${id}.pigment-cake`).appearance.color);
  assert.equal(new Set(colours).size, 6);
  const [x, y, z] = before.anchors.world[`${palette}.mix-centre`];
  const throughWell = sweepRay(t, [part(before, `${palette}.perforated-palette-top`)]);
  assert.equal(throughWell([x, y - 0.001, z], [0, 1, 0]).length, 0);
  assert.ok(throughWell([x + 0.027, y - 0.001, z], [0, 1, 0]).length > 0);
  pose(document, `${pan}-3.paint-lift`, 0.043);
  pose(document, `${palette}.palette-fold`, 69);
  const after = registry.build(document);
  near(after.anchors.world[`${pan}-3.colour-surface`][1], before.anchors.world[`${pan}-3.colour-surface`][1] + 0.043);
  assert.deepEqual(after.anchors.world[`${pan}-6.colour-surface`], before.anchors.world[`${pan}-6.colour-surface`]);
  assert.deepEqual(after.anchors.world[`${box}.front-palette`], before.anchors.world[`${box}.front-palette`]);
  check(document);
});

test("each garden tray socket is open and its cups and vents move independently", async t => {
  const document = await load("complete-six-cell-propagation-tray-with-vented-hinged-clear-lid");
  const tray = "six-socket-propagation-base-with-vented-deck";
  const cup = "lift-out-seedling-cup-with-through-drain-and-pull-tab";
  const lid = "hinged-translucent-propagation-lid-with-two-vents";
  pose(document, `${lid}.lid-angle`, 0);
  const before = registry.build(document);
  const throughDeck = sweepRay(t, [part(before, `${tray}.socket-deck`)]);
  for (const x of [-0.091, 0, 0.091]) for (const z of [-0.04, 0.04]) {
    assert.equal(throughDeck([x, 0.053, z], [0, 1, 0]).length, 0);
  }
  assert.ok(throughDeck([0.042, 0.053, 0], [0, 1, 0]).length > 0);
  for (const side of [-1, 1]) {
    const throughWall = sweepRay(t, [part(before, `${lid}.clear-side-${side}`)]);
    assert.ok(throughWall([-0.2, 0.109, -0.001], [1, 0, 0]).length > 0);
    assert.equal(throughWall([-0.2, 0.109, -0.161], [1, 0, 0]).length, 0);
  }
  const drain = before.anchors.world[`${cup}-2.drain`];
  const throughBottom = sweepRay(t, [part(before, `${cup}-2.cell-bottom`)]);
  assert.equal(throughBottom([drain[0], drain[1] - 0.002, drain[2]], [0, 1, 0]).length, 0);
  assert.ok(throughBottom([drain[0] + 0.011, drain[1] - 0.002, drain[2]], [0, 1, 0]).length > 0);
  pose(document, `${cup}-2.pull-height`, 0.065);
  pose(document, `${lid}.vent-slide-1`, 0.042);
  const after = registry.build(document);
  near(after.anchors.world[`${cup}-2.drain`][1], drain[1] + 0.065);
  assert.deepEqual(after.anchors.world[`${cup}.drain`], before.anchors.world[`${cup}.drain`]);
  assert.deepEqual(after.anchors.world[`${lid}.front-pull`], before.anchors.world[`${lid}.front-pull`]);
  check(document);
});

test("the sewing needle follows its feed through a real plate opening while the presser moves independently", async t => {
  const document = await load("complete-domestic-sewing-machine-with-removable-thread-spool");
  const frame = "open-throat-sewing-machine-frame-with-accessory-drawer";
  const needle = "sewing-needle-bar-with-travelling-clamp-and-eye";
  const presser = "liftable-sewing-presser-foot-with-pivoted-open-toe";
  const before = registry.build(document);
  const [x, y, z] = before.anchors.world[`${frame}.stitch-plane`];
  const throughPlate = sweepRay(t, [part(before, `${frame}.needle-plate`), part(before, `${frame}.bed`)]);
  assert.equal(throughPlate([x, y - 0.017, z], [0, 1, 0]).length, 0);
  assert.ok(throughPlate([x, y - 0.017, z + 0.019], [0, 1, 0]).length > 0);
  pose(document, `${needle}.needle-feed`, 0.012);
  pose(document, `${presser}.presser-lift`, 0.014);
  const after = registry.build(document);
  near(after.anchors.world[`${needle}.tip`][1], before.anchors.world[`${needle}.tip`][1] - 0.009);
  near(after.anchors.world[`${presser}.cloth-contact`][1], before.anchors.world[`${presser}.cloth-contact`][1] + 0.012);
  assert.deepEqual(after.anchors.world[`${frame}.stitch-plane`], [x, y, z]);
  check(document);
});

test("lifting the embroidery inner hoop carries the fabric while the outer clamp stays seated", async () => {
  const document = await load("complete-embroidery-hoop-with-lift-out-inner-ring-and-stitched-fabric");
  const inner = "open-embroidery-inner-hoop-with-replaceable-fabric-seat";
  const outer = "split-embroidery-outer-hoop-with-screw-clamp";
  const fabric = "round-embroidery-fabric-with-separate-leaf-stitches";
  const before = registry.build(document);
  pose(document, `${inner}.inner-hoop-lift`, 0.08);
  const after = registry.build(document);
  near(after.anchors.world[`${fabric}.canvas-centre`][1], before.anchors.world[`${fabric}.canvas-centre`][1] + 0.08);
  assert.deepEqual(after.anchors.world[`${fabric}.ring-fit`], after.anchors.world[`${inner}.cloth-seat`]);
  assert.deepEqual(after.anchors.world[`${outer}.clamp-axis`], before.anchors.world[`${outer}.clamp-axis`]);
  check(document);
});

test("the two drive sleds withdraw independently and the moving drive holes align with the sled deck", async t => {
  const document = await load("complete-dual-bay-desktop-drive-dock-with-independent-sleds");
  const sled = "vented-slide-out-drive-sled-with-swivelling-extraction-tab";
  const drive = "two-point-five-inch-storage-drive-with-four-bored-mounting-lugs";
  const before = registry.build(document);
  pose(document, `${sled}.withdraw`, 0.087);
  const after = registry.build(document);
  near(after.anchors.world[`${drive}.connector`][2], before.anchors.world[`${drive}.connector`][2] + 0.087);
  assert.deepEqual(after.anchors.world[`${drive}-2.connector`], before.anchors.world[`${drive}-2.connector`]);
  const fixed = "-0.0305--0.038";
  const [x, y, z] = after.anchors.world[`${drive}.fix-${fixed}`];
  const throughBoth = sweepRay(t, [part(after, `${sled}.perforated-deck`), part(after, `${drive}.fixing-lug-${fixed}`)]);
  assert.equal(throughBoth([x, y - 0.009, z], [0, 1, 0]).length, 0);
  assert.ok(throughBoth([x + 0.0034, y - 0.009, z], [0, 1, 0]).length > 0);
  check(document);
});

test("the hub port and cable clip keep their contacts aligned when swivelling the hub assembly", async () => {
  const document = await load("complete-swivelling-desktop-data-hub-with-anchored-short-cable");
  const stand = "swivel-desktop-hub-cradle-with-two-side-retainers";
  const hub = "desktop-data-hub-with-three-recessed-port-openings";
  const cable = "right-angle-desktop-data-cable-with-separate-moulded-connectors";
  const clip = "low-profile-snap-open-desktop-data-cable-guide";
  const before = registry.build(document);
  pose(document, `${stand}.swivel`, -25);
  pose(document, `${clip}.gate-angle`, 86);
  const after = registry.build(document);
  assert.notDeepEqual(after.anchors.world[`${hub}.upstream`], before.anchors.world[`${hub}.upstream`]);
  for (const [source, destination] of [
    [`${hub}.upstream`, `${cable}.hub-fit`],
    [`${clip}.guide`, `${cable}.clip-span`],
  ]) {
    for (let i = 0; i < 3; i++) near(after.anchors.world[source][i], after.anchors.world[destination][i]);
  }
  assert.deepEqual(after.anchors.world[`${stand}.bench-fit`], before.anchors.world[`${stand}.bench-fit`]);
  check(document);
});

test("the retail rack aligns real upright openings and retains independently adjustable merchandise fixtures", async t => {
  const rack = await load("four-level-display-fixture-with-shelves-and-pegboard");
  const frame = "slotted-retail-display-upright-bay";
  const shelf = "folded-retail-shelf-tray-with-paired-upright-hooks";
  const hook = "single-pegboard-merchandising-hook-with-sliding-stop";
  const basket = "open-wire-retail-merchandise-basket-with-sliding-divider";
  assert.equal(rack.parameters.attachments.length, 9);
  const initial = registry.build(rack);
  const holes = sweepRay(t, [part(initial, `${frame}.front-slot-strip-0`), part(initial, `${shelf}.mounting-ear-0`)]);
  for (const offset of [-0.023, 0.023]) assert.equal(holes([-0.402, 0.45 + offset, -0.04], [0, 0, 1]).length, 0);
  assert.ok(holes([-0.402, 0.45, -0.04], [0, 0, 1]).length > 0);
  pose(rack, `${hook}.stop-position`, 0.04);
  pose(rack, `${basket}.divider-travel`, 0.12);
  const adjusted = registry.build(rack);
  near(adjusted.anchors.world[`${hook}.goods-stop`][2], initial.anchors.world[`${hook}.goods-stop`][2] + 0.04);
  near(adjusted.anchors.world[`${basket}.divider`][0], initial.anchors.world[`${basket}.divider`][0] + 0.12);
  assert.deepEqual(adjusted.anchors.world[`${basket}.shelf-fit`], initial.anchors.world[`${basket}.shelf-fit`]);
  check(rack);
});

test("the coffee cup follows the drip tray while the portafilter keeps the removable basket coaxial", async t => {
  const coffee = await load("complete-espresso-machine-with-portafilter-basket-and-cup");
  const shell = "compact-single-group-espresso-machine-body-with-draw-out-drip-tray";
  const handle = "two-ear-espresso-portafilter-with-rotating-lock-and-spout";
  const basket = "perforated-removable-espresso-filter-basket";
  const cup = "demitasse-espresso-cup-with-open-loop-handle";
  const initial = registry.build(coffee);
  const centre = initial.anchors.world[`${basket}.filter-axis`];
  const holes = sweepRay(t, [part(initial, `${basket}.drain-screen`)]);
  assert.equal(holes([centre[0], centre[1] - 0.011, centre[2]], [0, 1, 0]).length, 0);
  assert.ok(holes([centre[0] + 0.018, centre[1] - 0.011, centre[2]], [0, 1, 0]).length > 0);
  pose(coffee, `${shell}.drip-tray-open`, 0.102);
  pose(coffee, `${handle}.lock-angle`, -29);
  const changed = registry.build(coffee);
  near(changed.anchors.world[`${cup}.deck-fit`][2], initial.anchors.world[`${cup}.deck-fit`][2] + 0.102);
  assert.deepEqual(changed.anchors.world[`${basket}.filter-axis`], centre);
  assert.notDeepEqual(changed.anchors.world[`${handle}.grip`], initial.anchors.world[`${handle}.grip`]);
  check(coffee);
});

test("a furniture worktable accepts a media monitor with its nested mount and pose controls intact", async t => {
  const [desk, monitor] = await Promise.all([
    load("home-office-worktable-with-trestles-and-cable-hatches"),
    load("complete-adjustable-desktop-monitor-with-stand-and-panel"),
  ]);
  const surface = "desktop-worktop-with-split-hinged-cable-recess.surface";
  const { document, groupId, anchorNames } = insertLibraryGroup(desk, monitor);
  const stand = "height-adjustable-desktop-display-stand-with-100mm-mount";
  const panel = "frameless-flat-display-panel-with-recessed-monitor-mount";
  document.parameters.nodes.find(node => node.id === groupId).transform = { position: [0, 0.762, 0] };
  document.parameters.attachments.push({
    from: surface, to: anchorNames.get(`${stand}.desk`), contract: { direction: "opposed", gapTolerance: 1e-6 },
  });
  pose(document, `${groupId}.${stand}.tilt`, 0);
  const initial = registry.build(document);
  const [x, y, z] = initial.anchors.world[anchorNames.get(`${stand}.screen`)];
  const holes = sweepRay(t, [part(initial, `${groupId}.${stand}.bracket`), part(initial, `${groupId}.${panel}.inset-plate`)]);
  for (const dx of [-0.05, 0.05]) for (const dy of [-0.05, 0.05]) {
    assert.equal(holes([x + dx, y + dy, z - 0.02], [0, 0, 1]).length, 0);
  }
  assert.ok(holes([x, y, z - 0.02], [0, 0, 1]).length > 0);
  pose(document, `${groupId}.${stand}.height`, 0.085);
  pose(document, `${groupId}.${stand}.tilt`, 20);
  pose(document, "desktop-worktop-with-split-hinged-cable-recess.cover-0", 79);
  const raised = registry.build(document);
  const view = anchorNames.get(`${panel}.screen-centre`);
  assert.ok(raised.anchors.world[view][1] > initial.anchors.world[view][1] + 0.04);
  assert.notDeepEqual(raised.anchors.worldDefinitions[view].direction, initial.anchors.worldDefinitions[view].direction);
  assert.deepEqual(raised.anchors.world[surface], initial.anchors.world[surface]);
  check(document);
});

test("the storage drawer can open without shifting the independently hinged door", async () => {
  const cabinet = await load("two-bay-home-storage-cabinet-with-drawer-and-hinged-door");
  const drawer = "slide-in-storage-drawer-with-open-box-and-removable-divider";
  const door = "side-swing-storage-cubby-door-with-through-hole-hinge";
  const before = registry.build(cabinet);
  pose(cabinet, `${drawer}.opening`, 0.231);
  const after = registry.build(cabinet);
  near(after.anchors.world[`${drawer}.drawer-handle`][2], before.anchors.world[`${drawer}.drawer-handle`][2] + 0.192);
  assert.deepEqual(after.anchors.world[`${door}.pull`], before.anchors.world[`${door}.pull`]);
  check(cabinet);
});

test("the table tennis halves fold around fixed axes while the net moves independently", async () => {
  const table = await load("complete-foldable-table-tennis-table-with-height-adjustable-net");
  const rear = "foldable-table-tennis-half-deck-with-underframe";
  const front = `${rear}-2`;
  const net = "clip-on-table-tennis-net-with-telescoping-posts.top-centre";
  const before = registry.build(table);
  near(before.anchors.world[`${front}.playing-surface`][1], before.anchors.world[`${rear}.playing-surface`][1]);
  pose(table, "wing-1", 67);
  pose(table, "clip-on-table-tennis-net-with-telescoping-posts.net-height", 0.021);
  const folded = registry.build(table);
  assert.ok(folded.anchors.world[`${front}.playing-surface`][1] > before.anchors.world[`${front}.playing-surface`][1] + 0.5);
  assert.deepEqual(folded.anchors.world[`${rear}.playing-surface`], before.anchors.world[`${rear}.playing-surface`]);
  assert.deepEqual(folded.anchors.world[`${front}.hinge`], before.anchors.world[`${front}.hinge`]);
  near(folded.anchors.world[net][1], before.anchors.world[net][1] + 0.015);
  check(table);
});

test("the bicycle front wheel follows the steering fork through its aligned axle bore", async t => {
  const bicycle = await load("complete-city-bicycle-with-spoked-wheels-and-steering");
  const fork = "city-bicycle-steering-fork-with-handlebar-and-brake-levers";
  const rim = "spoked-city-bicycle-wheel-with-annular-tyre-and-hub";
  const front = `${rim}-2.axle-fit`, rear = `${rim}.axle-fit`;
  const initial = registry.build(bicycle);
  const [x, y] = initial.anchors.world[front];
  const bore = sweepRay(t, [part(initial, `${fork}.fork-eye--0.052`), part(initial, `${fork}.fork-eye-0.052`),
    part(initial, `${rim}-2.hub-cylinder`)]);
  assert.equal(bore([x, y, -0.079], [0, 0, 1]).length, 0);
  assert.ok(bore([x + 0.014, y, -0.079], [0, 0, 1]).length > 0);
  pose(bicycle, `${fork}.steering`, 38);
  const turned = registry.build(bicycle);
  assert.deepEqual(turned.anchors.world[front], turned.anchors.world[`${fork}.wheel`]);
  assert.notDeepEqual(turned.anchors.worldDefinitions[front].direction, initial.anchors.worldDefinitions[front].direction);
  assert.deepEqual(turned.anchors.world[rear], initial.anchors.world[rear]);
  near(turned.anchors.world[`${rim}-2.ground`][1], 0);
  check(bicycle);
});

test("the carry-on keeps four floor contacts while its two-stage handle and case lid move separately", async () => {
  const suitcase = await load("complete-rolling-carry-on-with-extendable-handle-and-four-swivel-casters");
  const box = "hinged-hard-shell-carry-on-suitcase-body-with-four-caster-seats";
  const handle = "two-stage-luggage-telescoping-pull-handle-with-hollow-guides";
  const initial = registry.build(suitcase);
  pose(suitcase, `${box}.lid-opening`, 90);
  pose(suitcase, `${handle}.lower-rise`, 0.14);
  pose(suitcase, `${handle}.upper-rise`, 0.09);
  const raised = registry.build(suitcase);
  const feet = Object.keys(raised.anchors.world).filter(id => id.startsWith("luggage-twin-wheel-") && id.endsWith(".floor"));
  assert.equal(feet.length, 4);
  for (const anchor of feet) {
    near(raised.anchors.world[anchor][1], 0);
    assert.deepEqual(raised.anchors.world[anchor], initial.anchors.world[anchor]);
  }
  near(raised.anchors.world[`${handle}.handhold`][1] - initial.anchors.world[`${handle}.handhold`][1], 0.063);
  assert.deepEqual(raised.anchors.world[`${box}.pull-handle`], initial.anchors.world[`${box}.pull-handle`]);
  check(suitcase);
});

test("the teaching bench aligns optical centres and the four blades restrict the through aperture", async t => {
  const bench = await load("complete-four-station-teaching-optical-bench");
  const stop = "four-leaf-adjustable-optical-aperture-with-open-throat";
  const items = ["bench-led-optical-source-with-removable-holed-aperture-plate.optical-axis", `${stop}.optical-axis`,
    "sliding-convex-lens-carrier-with-open-annular-frame.optical-axis", "grid-target-optical-screen-with-pitchable-frame-and-board-foot.image-centre"];
  const open = registry.build(bench);
  for (const id of items) {
    near(open.anchors.world[id][1], 0.193);
    near(open.anchors.world[id][2], 0);
  }
  const blades = build => sweepRay(t, build.nodes.filter(node => node.metadata?.compositionNodeId.startsWith(`${stop}.opaque-blade-`)));
  const rayOrigin = [-0.18, 0.203, 0];
  assert.equal(blades(open)(rayOrigin, [1, 0, 0]).length, 0);
  pose(bench, `${stop}.aperture`, 0.012);
  const narrowed = registry.build(bench);
  const cast = blades(narrowed);
  assert.ok(cast(rayOrigin, [1, 0, 0]).length > 0);
  assert.equal(cast([-0.18, 0.193, 0], [1, 0, 0]).length, 0);
  assert.deepEqual(narrowed.anchors.world[`${stop}.optical-axis`], open.anchors.world[`${stop}.optical-axis`]);
  check(bench);
});

test("the hi-hat reuses mirrored rims on a fixed seat and a moving pull rod", async () => {
  const hiHat = await load("complete-pedal-hi-hat-with-paired-cymbals");
  const stand = "pedal-operated-hi-hat-stand-with-independent-pedal-and-pull-rod";
  const rim = "paired-bell-cymbal-with-actual-post-bore";
  const lower = `${rim}.post-top`, upper = `${rim}-2.post-fit`;
  const before = registry.build(hiHat);
  pose(hiHat, `${stand}.pull-rod-height`, 0.031);
  pose(hiHat, `${stand}.pedal-angle`, 16);
  const raised = registry.build(hiHat);
  assert.deepEqual(raised.anchors.world[lower], before.anchors.world[lower]);
  for (const axis of [0, 2]) near(raised.anchors.world[lower][axis], raised.anchors.world[upper][axis]);
  near(raised.anchors.world[upper][1] - before.anchors.world[upper][1], 0.031 - 0.019);
  for (const id of [rim, `${rim}-2`]) {
    const bow = part(raised, `${id}.cymbal-bow`).geometry;
    assert.equal(bow.capStart, false);
    assert.equal(bow.capEnd, false);
    near(bow.sections[0].radiusX, 0.0045);
  }
  check(hiHat);
});

test("the camping tent has a true door opening and keeps its pole and stake attachments when the flap opens", async t => {
  const tent = await load("complete-two-pole-camping-tent-with-pegs-and-sleep-mat");
  const canopy = "two-pole-dome-tent-canopy-with-opening-front-panel";
  const initial = registry.build(tent);
  const ray = sweepRay(t, [part(initial, `${canopy}.front-panel`)]);
  assert.equal(ray([0, 0.41, 1.2], [0, 0, -1]).length, 0);
  assert.ok(ray([0.64, 0.41, 1.2], [0, 0, -1]).length > 0);
  pose(tent, `${canopy}.door-open`, 104);
  const opened = registry.build(tent);
  assert.notDeepEqual(part(opened, `${canopy}.door-fabric`).matrix, part(initial, `${canopy}.door-fabric`).matrix);
  for (const id of ["hoop-rear", "hoop-front", "stake--1--1", "stake--1-1", "stake-1--1", "stake-1-1", "mat"]) {
    assert.deepEqual(opened.anchors.world[`${canopy}.${id}`], initial.anchors.world[`${canopy}.${id}`]);
  }
  assert.equal(tent.parameters.attachments.length, 7);
  check(tent);
});

test("the cooler carries its basket upward with the lid and basket grip on separate pivots", async () => {
  const cooler = await load("complete-camping-cooler-with-hinged-lid-and-lift-out-basket");
  const body = "hinged-hard-camping-cooler-shell-with-basket-carrier";
  const basket = "removable-wire-insert-basket-for-camping-cooler";
  const before = registry.build(cooler);
  pose(cooler, `${body}.basket-rise`, 0.105);
  pose(cooler, `${body}.lid-angle`, 92);
  pose(cooler, `${basket}.grip-fold`, 43);
  const raised = registry.build(cooler);
  near(raised.anchors.world[`${basket}.cooler-fit`][1] - before.anchors.world[`${basket}.cooler-fit`][1], 0.105);
  assert.notDeepEqual(raised.anchors.worldDefinitions[`${basket}.hand`].direction,
    before.anchors.worldDefinitions[`${basket}.hand`].direction);
  assert.deepEqual(raised.anchors.world[`${body}.floor`], before.anchors.world[`${body}.floor`]);
  check(cooler);
});

test("the shipping carton keeps all four jar and cap seats when one flap closes", async t => {
  const carton = await load("complete-four-jar-shipping-carton-with-slotted-divider");
  const box = "folding-corrugated-parcel-carton-with-four-independent-flaps";
  const lid = "knurled-wide-mouth-jar-cap-with-annular-gasket";
  const before = registry.build(carton);
  const seats = Object.keys(before.anchors.world).filter(id => id.startsWith(lid) && id.endsWith(".neck-fit"));
  assert.equal(seats.length, 4);
  const [cx, cy, cz] = before.anchors.world[`${lid}.neck-fit`];
  const gasket = sweepRay(t, [part(before, `${lid}.gasket`)]);
  assert.equal(gasket([cx, cy - 0.014, cz], [0, 1, 0]).length, 0);
  assert.ok(gasket([cx + 0.035, cy - 0.014, cz], [0, 1, 0]).length > 0);
  pose(carton, `${box}.flap-front`, 0);
  const closed = registry.build(carton);
  assert.notDeepEqual(closed.anchors.world[`${box}.flap-edge-front`], before.anchors.world[`${box}.flap-edge-front`]);
  assert.deepEqual(closed.anchors.world[`${box}.flap-edge-back`], before.anchors.world[`${box}.flap-edge-back`]);
  for (const seat of seats) assert.deepEqual(closed.anchors.world[seat], before.anchors.world[seat]);
  assert.equal(carton.parameters.attachments.length, 9);
  check(carton);
});

test("the binder's three paper holes are genuinely open when its two hinge systems move", async t => {
  const binder = await load("complete-three-ring-office-binder-with-perforated-paper");
  const shell = "three-ring-file-binder-covers-with-moving-front-board";
  const rings = "three-ring-binder-mechanism-with-opposed-opening-halves";
  const pages = "three-hole-ruled-paper-stack-with-real-punch-openings";
  const initial = registry.build(binder);
  const paper = sweepRay(t, initial.nodes.filter(node => node.metadata?.compositionNodeId.startsWith(`${pages}.paper-layer-`)));
  for (const z of [-0.104, 0, 0.104]) {
    assert.equal(paper([0.052, 0.022, z], [0, 1, 0]).length, 0);
    assert.ok(paper([0.064, 0.022, z], [0, 1, 0]).length > 0);
  }
  pose(binder, `${shell}.cover-open`, 145);
  pose(binder, `${rings}.ring-open`, 33);
  const opened = registry.build(binder);
  assert.notDeepEqual(initial.anchors.world[`${shell}.cover-edge`], opened.anchors.world[`${shell}.cover-edge`]);
  assert.notDeepEqual(part(initial, `${rings}.ring-half-1-1`).geometry.points, part(opened, `${rings}.ring-half-1-1`).geometry.points);
  for (const id of [`${pages}.writing-surface`, `${shell}.page-bed`, `${shell}.ring-rail`]) {
    assert.deepEqual(opened.anchors.world[id], initial.anchors.world[id]);
  }
  check(binder);
});

test("the cat tower bolts the same post through both levels while its perch cushion lifts away", async t => {
  const tower = await load("complete-modular-cat-climbing-tower-with-reused-sisal-posts");
  const post = "stackable-sisal-cat-scratching-post-with-bored-end-plates";
  const panel = "offset-cat-tree-step-platform-with-through-hole-stack-seat";
  const perch = "oval-cat-tree-perch-with-lifting-padded-liner";
  const before = registry.build(tower);
  const joint = sweepRay(t, [part(before, `${post}.end-plate-0.341`), part(before, `${panel}.step-board`),
    part(before, `${post}-2.end-plate-0`)]);
  for (const x of [-0.023, 0.023]) for (const z of [-0.023, 0.023]) {
    assert.equal(joint([x, 0.369, z], [0, 1, 0]).length, 0);
  }
  assert.ok(joint([0, 0.369, 0], [0, 1, 0]).length > 0);
  pose(tower, `${perch}.cushion-lift`, 0.103);
  const after = registry.build(tower);
  near(after.anchors.world[`${perch}.rest`][1] - before.anchors.world[`${perch}.rest`][1], 0.103);
  assert.deepEqual(after.anchors.world[`${perch}.post-fit`], before.anchors.world[`${perch}.post-fit`]);
  check(tower);
});

test("both removable pet bowls rise with the shelf that has two through openings", async t => {
  const feeder = await load("complete-raised-double-pet-feeder-with-removable-steel-bowls");
  const stand = "raised-two-bowl-pet-feeder-frame-with-adjustable-top-shelf";
  const bowl = "drop-in-stainless-pet-bowl-with-real-concave-interior";
  const before = registry.build(feeder);
  const shelf = sweepRay(t, [part(before, `${stand}.actual-two-hole-shelf`)]);
  for (const x of [-0.104, 0.104]) assert.equal(shelf([x, 0.1, 0], [0, 1, 0]).length, 0);
  assert.ok(shelf([0, 0.1, 0], [0, 1, 0]).length > 0);
  pose(feeder, `${stand}.top-height`, 0.025);
  const raised = registry.build(feeder);
  for (const id of [`${bowl}.rim-seat`, `${bowl}-2.rim-seat`]) {
    near(raised.anchors.world[id][1] - before.anchors.world[id][1], 0.017);
  }
  assert.deepEqual(raised.anchors.world[`${stand}.floor`], before.anchors.world[`${stand}.floor`]);
  check(feeder);
});

test("the stick vacuum keeps its floor head fixed as the attached motor follows the pitched extension", async () => {
  const vacuum = await load("complete-cordless-stick-vacuum-with-removable-dust-cup-and-wand");
  const motor = "handheld-stick-vacuum-motor-body-with-removable-clear-dust-cup";
  const tube = "telescoping-stick-vacuum-wand-with-tilting-floor-head";
  const initial = registry.build(vacuum);
  pose(vacuum, `${tube}.wand-pitch`, 38);
  pose(vacuum, `${tube}.wand-rise`, 0.114);
  pose(vacuum, `${motor}.bin-removal`, 0.084);
  const moved = registry.build(vacuum);
  assert.deepEqual(moved.anchors.world[`${tube}.floor`], initial.anchors.world[`${tube}.floor`]);
  assert.notDeepEqual(moved.anchors.worldDefinitions[`${tube}.motor`].direction, initial.anchors.worldDefinitions[`${tube}.motor`].direction);
  assert.deepEqual(moved.anchors.world[`${tube}.motor`], moved.anchors.world[`${motor}.wand-fit`]);
  const distance = build => Math.hypot(...build.anchors.world[`${motor}.cup`].map((value, axis) => value - build.anchors.world[`${motor}.wand-fit`][axis]));
  assert.ok(distance(moved) > distance(initial) + 0.05);
  check(vacuum);
});

test("the spin mop keeps the central seat attached while the basket turns and the shaft extends", async () => {
  const mop = await load("complete-two-chamber-spin-mop-set-with-telescoping-shaft");
  const bucket = "two-chamber-cleaning-bucket-with-wringer-seat-and-folding-bail";
  const rotor = "perforated-mop-wringer-basket-with-spinning-liner";
  const head = "round-microfiber-mop-head-with-replaceable-fringe";
  const shaft = "two-stage-telescoping-cleaning-mop-handle-with-lock-collar";
  const before = registry.build(mop);
  pose(mop, `${rotor}.spin-angle`, 69);
  pose(mop, `${shaft}.extension`, 0.114);
  const extended = registry.build(mop);
  assert.deepEqual(extended.anchors.world[`${bucket}.wringer`], before.anchors.world[`${bucket}.wringer`]);
  assert.deepEqual(extended.anchors.world[`${head}.wringer-fit`], extended.anchors.world[`${rotor}.mop`]);
  assert.notDeepEqual(part(before, `${head}.fringe-0`).geometry.points, part(extended, `${head}.fringe-0`).geometry.points);
  near(extended.anchors.world[`${shaft}.grip`][1] - before.anchors.world[`${shaft}.grip`][1], 0.074);
  check(mop);
});
