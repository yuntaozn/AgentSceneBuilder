import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/mep/${name}/manifest.json`)).editor.document;

test("spool bolt holes and the main bore are open and the header branch reaches the chamber", async t => {
  const spool = registry.build(await document("bolted-flanged-plant-pipe-spool"));
  const spoolRay = sweepRay(t, spool.nodes);
  assert.equal(spoolRay([-1, 0, 0], [1, 0, 0]).length, 0);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    assert.equal(spoolRay([-1, 0.08 * Math.sin(angle), -0.08 * Math.cos(angle)], [1, 0, 0]).length, 0);
  }
  assert.ok(spoolRay([-1, 0, -0.097], [1, 0, 0]).length > 0);

  const header = registry.build(await document("four-port-flanged-hydraulic-header"));
  const headerRay = sweepRay(t, header.nodes.filter(node => node.geometry?.type === "sweep"));
  for (const key of ["outlet-1", "outlet-2", "outlet-3", "outlet-4"]) {
    const [x] = header.anchors.local[key];
    const hits = headerRay([x, 0.65, 0], [0, -1, 0]);
    assert.ok(hits[0].point.y < 0.34, `${key} must be open into the chamber`);
  }

  const pump = registry.build(await document("base-mounted-end-suction-pump"));
  const pumpRay = sweepRay(t, pump.nodes.filter(node => node.geometry?.type === "sweep"));
  assert.ok(pumpRay([0.28, 0.8, 0], [0, -1, 0])[0].point.y < 0.38);
});

test("instrument and valve motion preserves the fixed installation anchors", async () => {
  for (const name of ["dial-pressure-gauge", "rising-stem-flanged-gate-valve", "manual-hydrostatic-test-pump"]) {
    const model = await document(name);
    const built = registry.build(model);
    const [animation] = model.parameters.animations;
    const target = model.parameters.nodes.find(node => node.id === animation.target);
    const movingPart = model.parameters.nodes.find(node => node.parent === target.id);
    if (animation.property === "position") {
      assert.deepEqual(animation.from, [0, 0, 0]);
      target.transform.position = target.transform.position.map((value, index) => value + animation.to[index]);
    } else target.transform.rotation = animation.to;
    const moved = registry.build(model);
    assert.deepEqual(moved.anchors.local, built.anchors.local);
    const part = scene => scene.nodes.find(node => node.metadata.compositionNodeId === movingPart.id);
    assert.notDeepEqual(part(moved), part(built));
  }
});

test("the pump room checks equipment seats and typed pipe ports together", async () => {
  const scene = await readJson("../examples/digital-modeling/mep/pump-room-flanged-pipe-assembly.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 19);
  scene.instances.find(item => item.id === "pump-riser").parameters.nodes[0].geometry.outsideDiameter = 0.09;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "pump-riser#start"],
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "header#inlet"],
  ]);
});
