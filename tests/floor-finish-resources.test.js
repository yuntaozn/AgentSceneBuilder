import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const document = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the raised-floor port is open through all layers and the trimmed divider has a through hole", async t => {
  const panel = registry.build(await document("rectangular-cable-port-access-floor-panel"));
  const panelRay = sweepRay(t, panel.nodes.filter(node => node.geometry.type === "sweep"));
  const [cableX,, cableZ] = panel.anchors.local["grommet-seat"];
  assert.equal(panelRay([cableX, 1, cableZ], [0, -1, 0]).length, 0);
  assert.ok(panelRay([-cableX, 1, cableZ], [0, -1, 0]).length > 0);

  const brush = registry.build(await document("rectangular-brush-floor-grommet"));
  const brushRay = sweepRay(t, brush.nodes.filter(node => node.geometry.type === "sweep"));
  assert.equal(brushRay([0, 1, 0], [0, -1, 0]).length, 0);
  assert.ok(brushRay([0, 1, 0.043], [0, -1, 0]).length > 0);

  const divider = registry.build(await document("perforated-terrazzo-divider-profile"));
  const wing = divider.nodes.find(node => node.metadata.compositionNodeId === "perforated-wing");
  const dividerRay = sweepRay(t, [wing]);
  const [holeX,, holeZ] = divider.anchors.local["first-hole"];
  assert.equal(dividerRay([holeX, 1, holeZ], [0, -1, 0]).length, 0);
  assert.ok(dividerRay([holeX, 1, holeZ + 0.007], [0, -1, 0]).length > 0);
});

test("finish samples check all 52 relationships and identify both contacts on a loose pedestal", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/floor-finishes-and-access-floor.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 52);
  scene.instances.find(item => item.id === "pedestal-1-0-0").transform.position[1] += 0.01;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ code, to }) => [code, to]), [
    ["SCENE_CONNECTION_GAP", "pedestal-1-0-0#base"],
    ["SCENE_CONNECTION_GAP", "stringer-1-far#left"],
  ]);
});
