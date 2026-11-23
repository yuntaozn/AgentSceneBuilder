import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { sweepRay } from "./sweep-test-fixtures.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("the sloped guard preserves real openings and can descend in local X", async t => {
  const guard = await doc("sloped-open-guardrail");
  guard.parameters.nodes[0].geometry.rise = -0.8;
  const built = registry.build(guard);
  assert.deepEqual(built.anchors.local.end, [0.84, -0.8, 0]);
  assert.ok(Math.abs(built.anchors.local["handrail-end"][1] - 0.06) < 1e-9);
  const cast = sweepRay(t, built.nodes);
  const rayAt = x => cast([x, 0.43 - 0.8 * (x / 1.68 + 0.5), 1], [0, 0, -1]);
  assert.equal(rayAt(-0.72).length, 0);
  assert.ok(rayAt(-0.615).length > 0);
});

test("winder geometry rises over the turn and the right-angle landing has two local joints", async t => {
  const winder = registry.build(await doc("quarter-turn-winder-stair"));
  const cast = sweepRay(t, winder.nodes);
  const height = angle => cast([0.84 * Math.cos(angle), 2, 0.84 * Math.sin(angle)], [0, -1, 0])[0].point.y;
  assert.ok(Math.abs(height(-1.45) - 0.17) < 1e-6);
  assert.ok(Math.abs(height(-0.12) - 1.02) < 1e-6);
  const landing = await doc("quarter-turn-landing-stair");
  assert.deepEqual(checkComposition(landing), { ok: true, issues: [] });
  landing.parameters.nodes.find(node => node.id === "landing").transform.position[1] += 0.035;
  assert.equal(checkComposition(landing).issues.filter(issue => issue.code.includes("GAP")).length, 2);
});

test("the stair scene checks 19 landing and railing joints", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/stair-landings-and-guardrails.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 19);
  scene.instances.find(item => item.id === "sloping-guard").parameters.nodes[0].geometry.rise = 0.96;
  assert.deepEqual(checkScene(scene, registry).issues.map(({ to }) => to), ["upper-guard#start"]);
});
