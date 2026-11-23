import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkEditableScene, importEditableScene } from "../apps/editor/scene-import.js";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const core = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const build = async name => core.build((await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document);
const scene = () => readJson("../examples/digital-modeling/structure/glazed-building-entry-sliding-and-revolving-door.json");
const nodes = (model, ids) => model.nodes.filter(node => ids.includes(node.metadata.compositionNodeId));

test("glass, gasket holes, and floor strike have through mounting paths", async t => {
  const glass = await build("bored-frameless-glass-pivot-door-leaf");
  const drillRay = sweepRay(t, nodes(glass, ["drilled-glass-lite", "soft-grommet-1", "soft-grommet-2"]));
  for (const y of [0.871, 1.249]) assert.equal(drillRay([0.654, y, 0.1], [0, 0, -1]).length, 0);
  assert.ok(drillRay([0.682, 0.871, 0.1], [0, 0, -1]).length > 0);
  const strike = await build("flush-floor-glass-door-drop-bolt-strike-receiver");
  const strikeRay = sweepRay(t, strike.nodes);
  assert.equal(strikeRay([0, 0.1, 0], [0, -1, 0]).length, 0);
  assert.ok(strikeRay([0.026, 0.1, 0], [0, -1, 0]).length > 0);
});

test("the entrance example retains internal and external joints in the editable scene", async () => {
  const input = await scene();
  assert.deepEqual(checkScene(input, core), { ok: true, issues: [] });
  assert.equal(composeScene(input, core).relations.filter(item => item.connected).length, 24);
  assert.deepEqual(checkEditableScene(input, core), { ok: true, issues: [] });
  const document = importEditableScene(input);
  assert.equal(document.parameters.attachments.length, 36);
  assert.equal(core.build(document).attachments.length, 36);
});

test("the swing pull, sliding carriage, and revolving wings follow their axes", async () => {
  const document = importEditableScene(await scene());
  const initial = core.build(document);
  const change = id => {
    const animation = document.parameters.animations.find(item => item.id.endsWith(id));
    document.parameters.nodes.find(node => node.id === animation.target).transform[animation.property] = animation.to;
  };
  change("swing-open");
  change("slide-open");
  change("rotate-wings");
  const opened = core.build(document);
  const pos = (model, nodeId) => nodes(model, [nodeId])[0].transform.position;
  const carriage = "moving-slider.slider-left-carriage.carrier-bridge";
  assert.ok(Math.abs(pos(opened, carriage)[0] - pos(initial, carriage)[0] - 0.425) < 1e-9);
  const pull = "glass-swing-assembly.paired-pull.bow-handle-1";
  const firstPoint = model => nodes(model, [pull])[0].geometry.points[0];
  assert.ok(firstPoint(opened)[2] < firstPoint(initial)[2] - 0.45);
  const firstWing = "four-wing-rotor.glass-wing-1.radial-lite";
  const secondWing = "four-wing-rotor.glass-wing-2.radial-lite";
  assert.ok(pos(opened, firstWing).every((value, axis) => Math.abs(value - pos(initial, secondWing)[axis]) < 1e-9));
  const fixed = "top-canopy.drive-crossrail";
  assert.deepEqual(pos(initial, fixed), pos(opened, fixed));
});
