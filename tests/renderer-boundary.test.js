import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("digital modeling core stays renderer-independent", async () => {
  const core = await readJson("../packages/core/package.json");
  assert.equal(core.dependencies?.three, undefined);
  assert.equal(core.peerDependencies?.three, undefined);
});

test("Three.js is isolated behind the optional renderer adapter", async () => {
  const adapter = await readJson("../adapters/three/package.json");
  assert.match(adapter.peerDependencies.three, /^>=/);
  const source = await readFile(new URL("../adapters/three/src/renderer.js", import.meta.url), "utf8");
  assert.match(source, /from "three"/);
  assert.match(source, /InstancedMesh/);
});
