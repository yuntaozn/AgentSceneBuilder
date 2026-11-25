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
