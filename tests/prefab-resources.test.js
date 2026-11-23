import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/prefab/${name}/manifest.json`)).editor.document;

test("grout sleeve has a continuous axial bore and two open side passages", async t => {
  const sleeve = registry.build(await doc("dual-port-grout-sleeve"));
  const ray = sweepRay(t, sleeve.nodes);
  assert.equal(ray([0, -1, 0], [0, 1, 0]).length, 0);
  for (const port of ["grout-in", "grout-out"]) {
    const [x, y, z] = sleeve.anchors.local[port];
    const first = ray([x, y, z + 0.02], [0, 0, -1])[0];
    assert.ok(first.point.z < 0, port);
  }
  assert.ok(ray([0, 0.22, 0.17], [0, 0, -1])[0].point.z > 0);
});

test("four splice slots have actual oblong clearance along their long axis", async t => {
  const plate = await doc("slotted-splice-plate");
  const built = registry.build(plate);
  const ray = sweepRay(t, built.nodes);
  const slots = Object.entries(built.anchors.local).filter(([id]) => id.startsWith("slot-"));
  assert.equal(slots.length, 4);
  for (const [, [x, , z]] of slots) {
    assert.equal(ray([x + 0.018, 0.1, z], [0, -1, 0]).length, 0);
    assert.ok(ray([x, 0.1, z + 0.014], [0, -1, 0]).length > 0);
  }
  plate.parameters.nodes[0].geometry.slotWidth = 0.06;
  assert.equal(checkComposition(plate).issues[0].path, "/parameters/nodes/0/geometry/slotWidth");
});

test("prefab example aligns braced wall panels, lifting datums and independent grout parts", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/precast-wall-panel-installation.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 17);
  const brace = scene.instances.find(item => item.id === "brace-left");
  brace.parameters.anchors.head.position[1] += 0.06;
  assert.ok(checkScene(scene, registry).issues.some(issue => issue.code === "SCENE_CONNECTION_GAP" && issue.to === "brace-left#head"));
});
