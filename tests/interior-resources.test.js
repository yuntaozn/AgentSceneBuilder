import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";
import { insertLibraryGroup } from "../apps/editor/library-insert.js";

const registry = createDefaultRegistry();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const doc = async name => (await readJson(`../registry/components/construction/${name}/manifest.json`)).editor.document;

test("sliding door keeps the wall fit anchored when its moving group opens", async () => {
  const source = await doc("single-sliding-door");
  const host = { id: "host", component: "core.composition", parameters: { nodes: [] } };
  const { document } = insertLibraryGroup(host, source);
  const [animation] = document.parameters.animations;
  const slider = document.parameters.nodes.find(node => node.id === animation.target);
  const leaf = document.parameters.nodes.find(node => node.parent === slider.id && node.id.endsWith(".leaf"));
  const closed = registry.build(document);
  slider.transform.position = animation.to;
  const open = registry.build(document);
  assert.deepEqual(open.anchors.local, closed.anchors.local);
  const openLeaf = open.nodes.find(node => node.metadata.compositionNodeId === leaf.id).transform.position;
  const closedLeaf = closed.nodes.find(node => node.metadata.compositionNodeId === leaf.id).transform.position;
  assert.deepEqual(openLeaf, [closedLeaf[0] + animation.to[0], closedLeaf[1], closedLeaf[2]]);
});

test("circulation scene checks 24 external connections and both stair flights seat on the landing", async () => {
  const scene = await readJson("../examples/digital-modeling/structure/interior-openings-and-circulation.json");
  assert.deepEqual(checkScene(scene, registry), { ok: true, issues: [] });
  assert.equal(composeScene(scene, registry).relations.filter(relation => relation.connected).length, 24);
  const stair = await doc("dogleg-stair");
  assert.deepEqual(checkComposition(stair), { ok: true, issues: [] });
  stair.parameters.nodes.find(node => node.id === "middle-landing").transform.position[1] += 0.05;
  assert.equal(checkComposition(stair).issues.filter(issue => issue.code.includes("GAP")).length, 2);
});
