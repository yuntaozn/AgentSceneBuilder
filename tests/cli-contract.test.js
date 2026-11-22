import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cliPath = fileURLToPath(new URL("../packages/cli/src/agentscene.mjs", import.meta.url));
const legacyPath = fileURLToPath(new URL("../scripts/model.mjs", import.meta.url));

function runNode(script, args, cwd = root, input) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    input,
    encoding: "utf8",
  });
  return {
    ...result,
    json: JSON.parse(result.stdout),
  };
}

function padBytes(bytes, padValue) {
  const length = Math.ceil(bytes.byteLength / 4) * 4;
  const output = new Uint8Array(length);
  output.set(bytes);
  output.fill(padValue, bytes.byteLength);
  return output;
}

function createTinyGlb() {
  const encoder = new TextEncoder();
  const positions = new Float32Array([0, 0, 0, 1, 2, 3]);
  const bin = new Uint8Array(positions.buffer);
  const json = {
    asset: { version: "2.0", generator: "agentscene-cli-test" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ name: "cli-node", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: "cli-material", pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 1] } }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: "VEC3" }],
  };
  const jsonBytes = padBytes(encoder.encode(JSON.stringify(json)), 0x20);
  const binBytes = padBytes(bin, 0);
  const length = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength;
  const output = new Uint8Array(length);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, length, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.set(jsonBytes, 20);
  const binHeaderOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binHeaderOffset, binBytes.byteLength, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true);
  output.set(binBytes, binHeaderOffset + 8);
  return output;
}

test("package CLI exposes machine-readable component metadata", () => {
  const result = runNode(cliPath, ["component", "list"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.json.ok, true);
  assert.ok(result.json.components.some(component => component.id === "core.composition"));
});

test("registry search returns a composition manifest usable outside the project directory", () => {
  const cwd = tmpdir();
  const result = runNode(cliPath, ["registry", "search", "桥架", "ELBOW"], cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.json.count, result.json.results.length);
  const tray = result.json.results.find(entry => entry.id === "mep.cable-tray-elbow");
  assert.ok(tray);
  assert.equal(tray.kind, "composition");
  assert.ok(tray.summary);
  assert.ok(isAbsolute(tray.manifestPath));
  assert.deepEqual(runNode(cliPath, ["composition", "check", tray.manifestPath], cwd).json, { ok: true, issues: [] });
  const build = runNode(cliPath, ["component", "build", tray.manifestPath], cwd);
  assert.equal(build.status, 0);
  assert.ok(build.json.build.nodes.length > 0);
});

test("registry search hides internal entries and distinguishes empty results from missing input", () => {
  for (const query of ["character.basic-human-figure", "no-such-model-1234"]) {
    const result = runNode(cliPath, ["registry", "search", query]);
    assert.equal(result.status, 0);
    assert.deepEqual(result.json, { ok: true, count: 0, results: [] });
  }
  const missing = runNode(cliPath, ["registry", "search"]);
  assert.equal(missing.status, 2);
  assert.equal(missing.json.ok, false);
});

test("legacy model script delegates to the package CLI", () => {
  const result = runNode(legacyPath, ["component", "describe", "core.composition"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.component.id, "core.composition");
});

test("CLI failures remain JSON and use a stable error code", () => {
  const result = runNode(cliPath, ["unknown", "command"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "AGENTSCENE_CLI_ERROR");
});

test("CLI spatial analysis and distribution distinguish skipped instances, invalid targets and stale layouts", async t => {
  const source = "examples/digital-modeling/composed-scene.json";
  const request = "examples/digital-modeling/proposals/distribute-instances.json";
  const generated = runNode(cliPath, ["scene", "propose-distribute", source, request]);
  assert.equal(generated.status, 0);
  const proposal = JSON.stringify(generated.json);
  const doc = JSON.parse(await readFile(join(root, source), "utf8"));
  doc.instances.push({ id: "datum", component: "core.composition", parameters: { nodes: [], anchors: { origin: [0, 0, 0] } } });
  const folder = mkdtempSync(join(tmpdir(), "agentscene-distribution-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  writeFileSync(file, JSON.stringify(doc));
  const analysis = runNode(cliPath, ["scene", "analyze-spatial", file]);
  assert.equal(analysis.status, 0);
  assert.equal(analysis.json.analysis.pairCount, 1);
  assert.deepEqual(analysis.json.analysis.skippedInstanceIds, ["datum"]);

  const explicit = runNode(cliPath, ["scene", "propose-distribute", file, JSON.stringify({ instanceIds: ["datum", "cold-water-01"] })]);
  assert.equal(explicit.status, 2);
  assert.equal(explicit.json.error.code, "SCENE_BOUNDS_MISSING");
  assert.deepEqual(explicit.json.error.instanceIds, ["datum"]);
  assert.equal(runNode(cliPath, ["scene", "apply-proposal", file, proposal]).status, 0);

  doc.instances.find(instance => instance.id === "foundation-01").parameters.width += 1;
  writeFileSync(file, JSON.stringify(doc));
  const stale = runNode(cliPath, ["scene", "apply-proposal", file, proposal]);
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.deepEqual(stale.json.error.conflicts.map(c => [c.instanceId, c.axis, c.reason]), [["foundation-01", "x", "bounds-changed"]]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), doc);
});

test("CLI uses the physical beam faces for spatial analysis and distribution after opposite rotations", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-rotated-beam-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const angle = Math.PI / 4;
  const doc = { revision: 4, instances: [
    { id: "beam", component: "core.composition", transform: { rotation: [0, 0, -angle] },
      parameters: { nodes: [{ id: "body", transform: { rotation: [0, 0, angle] }, geometry: { type: "box", size: [4, 1, 1] } }] } },
    { id: "stop", component: "core.composition", transform: { position: [2.4, 0, 0] },
      parameters: { nodes: [{ id: "body", geometry: { type: "box", size: [0.2, 0.2, 0.2] } }] } },
  ] };
  writeFileSync(file, JSON.stringify(doc));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const [beam] = scene("build").json.scene.instances;
  assert.deepEqual(beam.bounds.size, [4, 1, 1]);
  const [pair] = scene("analyze-spatial").json.analysis.pairs;
  assert.equal(pair.state, "separated");
  assert.ok(Math.abs(pair.distance - 0.3) < 1e-12);
  const { proposal } = scene("propose-distribute", JSON.stringify({ instanceIds: ["beam", "stop"], start: -2, gap: 0.2 })).json;
  // A saved proposal from the old five-metre envelope placed the beam at x=0.5.
  const older = structuredClone(proposal);
  older.facts.placements[0].size = 5;
  older.facts.placements[1].proposedMin = 3.2;
  older.facts.end = 3.4;
  older.changes[0].after.position[0] = 0.5;
  older.changes[1].after.position[0] = 3.3;
  const stale = scene("apply-proposal", JSON.stringify(older));
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.deepEqual(stale.json.error.conflicts.map(c => [c.instanceId, c.reason, c.actual]),
    [["beam", "bounds-changed", { min: -1.5, max: 2.5 }]]);
  const result = scene("apply-proposal", JSON.stringify(proposal));
  assert.equal(result.status, 0);
  const placed = result.json.scene;
  // The beam's net rotation is zero, so its right face is at x=2.
  assert.ok(Math.abs((placed.instances[1].transform.position[0] - 0.1) - 2 - 0.2) < 1e-12);
  assert.equal(placed.revision, 5);
  writeFileSync(file, JSON.stringify(placed));
  assert.ok(Math.abs(scene("analyze-spatial").json.analysis.pairs[0].distance - 0.2) < 1e-12);
  assert.deepEqual(scene("apply-proposal", JSON.stringify(proposal)).json.scene, placed);
});

test("CLI distributes coaxial pipes by their flat ends and closes a joint at zero gap", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-pipe-clearance-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 7,
    instances: [0, 1.05].map((x, i) => ({
      id: i ? "b" : "a", component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { diameter: 0.2, path: [[0, 0, 0], [1, 0, 0]] },
    })),
    attachments: [{ id: "coupling", from: "a#end", to: "b#start" }],
  };
  const save = value => writeFileSync(file, JSON.stringify(value));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const propose = gap => scene("propose-distribute", JSON.stringify({ instanceIds: ["a", "b"], gap })).json.proposal;
  const apply = proposal => scene("apply-proposal", JSON.stringify(proposal));
  save(doc);
  const [pipe] = scene("build").json.scene.instances;
  assert.deepEqual([pipe.bounds.min, pipe.bounds.max], [[0, -0.1, -0.1], [1, 0.1, 0.1]]);
  const [pair] = scene("analyze-spatial").json.analysis.pairs;
  assert.equal(pair.state, "separated");
  assert.ok(Math.abs(pair.distance - 0.05) < 1e-12);
  assert.deepEqual(apply(propose(0.05)).json.scene, doc);
  const close = propose(0);
  assert.equal(close.facts.connectionImpact[0].after.connected, true);
  const closed = apply(close);
  assert.equal(closed.status, 0);
  save(closed.json.scene);
  assert.equal(closed.json.scene.revision, 8);
  assert.deepEqual(scene("check").json, { ok: true, issues: [] });
  assert.equal(scene("analyze-spatial").json.analysis.pairs[0].state, "touching");
  assert.deepEqual(apply(close).json.scene, closed.json.scene);
  const reopened = apply(propose(0.05));
  assert.equal(reopened.status, 0);
  save(reopened.json.scene);
  const [a, b] = scene("build").json.scene.instances;
  assert.ok(Math.abs(b.anchors.world.start[0] - a.anchors.world.end[0] - 0.05) < 1e-12);
});

test("CLI measures sphere-to-ring clearance and distributes from their rotated surfaces", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-sphere-ring-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const spin = { rotation: [0, Math.PI / 4, 0] };
  const doc = { revision: 2, instances: [
    { id: "ball", component: "core.composition", transform: spin,
      parameters: { nodes: [{ id: "body", geometry: { type: "sphere", radius: 1 } }] } },
    { id: "ring", component: "core.composition", transform: { position: [2.1, 0, 0] },
      parameters: { nodes: [{ id: "body", transform: spin, geometry: { type: "torus", majorRadius: 0.8, tubeRadius: 0.2 } }] } },
  ] };
  writeFileSync(file, JSON.stringify(doc));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const pair = () => scene("analyze-spatial").json.analysis.pairs[0];
  const initial = pair();
  assert.equal(initial.state, "separated");
  assert.ok(Math.abs(initial.distance - 0.1) < 1e-12);
  const request = JSON.stringify({ instanceIds: ["ball", "ring"], start: -1, gap: 0.2 });
  // Recreate the previous calculation, which rotated each primitive's enclosing box.
  const boxed = structuredClone(doc);
  boxed.instances[0].parameters.nodes[0].geometry = { type: "box", size: [2, 2, 2] };
  boxed.instances[1].parameters.nodes[0].geometry = { type: "box", size: [2, 0.4, 2] };
  writeFileSync(file, JSON.stringify(boxed));
  const older = scene("propose-distribute", request).json.proposal;
  writeFileSync(file, JSON.stringify(doc));
  const stale = scene("apply-proposal", JSON.stringify(older));
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.deepEqual(stale.json.error.conflicts.map(c => [c.instanceId, c.reason]),
    [["ball", "bounds-changed"], ["ring", "bounds-changed"]]);
  const { proposal } = scene("propose-distribute", request).json;
  assert.ok(proposal.facts.placements.every(item => Math.abs(item.size - 2) < 1e-12));
  const result = scene("apply-proposal", JSON.stringify(proposal));
  assert.equal(result.status, 0);
  const placed = result.json.scene;
  assert.equal(placed.revision, 3);
  const [ball, ring] = placed.instances;
  const centerDistance = ring.transform.position[0] - (ball.transform.position?.[0] ?? 0);
  assert.ok(Math.abs(centerDistance - 1 - (0.8 + 0.2) - 0.2) < 1e-12);
  writeFileSync(file, JSON.stringify(placed));
  assert.ok(Math.abs(pair().distance - 0.2) < 1e-12);
  assert.deepEqual(scene("apply-proposal", JSON.stringify(proposal)).json.scene, placed);
});

test("CLI verifies world-space alignment on apply and retry, including proposals without a landing measurement", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-alignment-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = { revision: 7, instances: [{ id: "base", component: "core.composition",
    transform: { scale: [1e9, 1, 1] }, parameters: { nodes: [], anchors: { pin: [0, 0, 0] } } }] };
  const save = input => writeFileSync(file, JSON.stringify(input));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const propose = () => scene("propose-align", JSON.stringify({ instanceId: "base", sourceAnchor: "pin", targetPoint: [1, 0, 0] }));
  const apply = p => scene("apply-proposal", JSON.stringify(p));
  save(doc);
  const proposal = propose().json.proposal;
  const placed = apply(proposal).json.scene;
  assert.equal(placed.revision, 8);
  delete proposal.facts.alignmentResult;
  for (const input of [doc, placed]) {
    input.instances[0].parameters.anchors.pin[0] = 5e-10;
    save(input);
    const stale = apply(proposal);
    assert.equal(stale.status, 2);
    assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(stale.json.scene, undefined);
    const [conflict] = stale.json.error.conflicts;
    assert.deepEqual([conflict.instanceId, conflict.reference, conflict.path, conflict.reason],
      ["base", "base#pin", "/instances/0", "alignment-target-missed"]);
    assert.deepEqual([conflict.measurement.expected, conflict.measurement.actual, conflict.measurement.gap],
      [[1, 0, 0], [1.5, 0, 0], 0.5]);
  }
  save(doc);
  const fresh = propose().json.proposal;
  const repaired = apply(fresh).json.scene;
  save(repaired);
  assert.deepEqual(scene("build").json.scene.instances[0].anchors.world.pin, [1, 0, 0]);
  assert.deepEqual(apply(fresh).json.scene, repaired);
});

test("CLI aligns a small local offset from a large origin and reports unrepresentable translations", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-alignment-precision-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const instance = { id: "base", component: "core.composition", transform: { position: [1e8, 0, 0] },
    parameters: { nodes: [], anchors: { pin: [0.013, 0, 0] } } };
  const save = () => writeFileSync(file, JSON.stringify({ instances: [instance] }));
  const propose = x => runNode(cliPath, ["scene", "propose-align", file, JSON.stringify({
    instanceId: "base", sourceAnchor: "pin", targetPoint: [x, 0, 0],
  })]);
  save();
  const { proposal } = propose(0).json;
  assert.equal(proposal.changes[0].after.position[0], -0.013);
  assert.equal(proposal.facts.alignmentResult.gap, 0);
  const applied = runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  writeFileSync(file, JSON.stringify(applied.json.scene));
  assert.deepEqual(runNode(cliPath, ["scene", "build", file]).json.scene.instances[0].anchors.world.pin, [0, 0, 0]);
  instance.transform.position[0] = 0;
  instance.parameters.anchors.pin[0] = 1e16;
  save();
  const impossible = propose(0.5);
  assert.equal(impossible.status, 2);
  assert.equal(impossible.json.proposal, undefined);
  assert.equal(impossible.json.error.code, "SCENE_ALIGNMENT_TARGET_MISSED");
  assert.deepEqual(impossible.json.error.measurement, { reference: "base#pin", space: "world", unit: "meter",
    expected: [0.5, 0, 0], actual: [0, 0, 0], gap: 0.5, tolerancePerAxis: 1e-9 });
});

test("CLI distribution verifies the measured gap when world coordinates round away a requested separation", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-distribution-gap-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = { revision: 5, instances: ["a", "b"].map(id => ({ id, component: "core.composition",
    parameters: { nodes: [{ id: "body", geometry: { type: "box", size: [4, 1, 1] } }] } })) };
  writeFileSync(file, JSON.stringify(doc));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const propose = gap => scene("propose-distribute", JSON.stringify({ instanceIds: ["a", "b"], start: 1e16, gap }));
  const impossible = propose(0.5);
  assert.equal(impossible.status, 2);
  assert.equal(impossible.json.proposal, undefined);
  assert.equal(impossible.json.error.code, "SCENE_DISTRIBUTION_TARGET_MISSED");
  const measurement = { kind: "gap", fromInstanceId: "a", toInstanceId: "b", axis: "x", space: "world",
    unit: "meter", expected: 0.5, actual: 0, tolerance: 1e-9 };
  assert.deepEqual(impossible.json.error.measurement, measurement);

  const saved = propose(0).json.proposal;
  saved.facts.gap = 0.5; // Earlier versions returned these touching placements for a half-metre gap.
  delete saved.facts.gapMeasurements;
  const stale = scene("apply-proposal", JSON.stringify(saved));
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.equal(stale.json.scene, undefined);
  assert.deepEqual(stale.json.error.conflicts, [{
    instanceId: "b", path: "/instances/1", reason: "distribution-gap-missed", measurement,
  }]);
  const fresh = propose(2).json.proposal;
  const placed = scene("apply-proposal", JSON.stringify(fresh)).json.scene;
  assert.equal(placed.revision, 6);
  writeFileSync(file, JSON.stringify(placed));
  const [a, b] = scene("build").json.scene.instances;
  assert.equal(b.bounds.min[0] - a.bounds.max[0], 2);
  assert.equal(fresh.facts.gapMeasurements[0].actual, 2);
  assert.equal(fresh.facts.end, b.bounds.max[0]);
  assert.deepEqual(scene("apply-proposal", JSON.stringify(fresh)).json.scene, placed);
});

test("CLI reports a stale size and an independent broken joint together, then applies a regenerated distribution", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-mixed-conflicts-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = { revision: 3, instances: ["a", "b", "frame"].map((id, i) => ({
    id, component: "core.composition", transform: { position: [i === 0 ? 0 : 4, 0, 0] },
    parameters: { anchors: { pin: [0, 0, 0] }, nodes: [{ id: "body", geometry: { type: "box", size: [1, 1, 1] } }] },
  })) };
  const save = input => writeFileSync(file, JSON.stringify(input));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const request = JSON.stringify({ instanceIds: ["a", "b"], start: 1.5 });
  save(doc);
  const earlier = scene("propose-distribute", request).json.proposal;
  doc.instances[0].parameters.nodes[0].geometry.size[0] = 2;
  doc.attachments = [{ id: "mount", from: "b#pin", to: "frame#pin" }];
  save(doc);
  const stale = scene("apply-proposal", JSON.stringify(earlier));
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.equal(stale.json.scene, undefined);
  const conflicts = stale.json.error.conflicts;
  assert.deepEqual(conflicts.map(c => [c.instanceId, c.path, c.reason]), [
    ["a", "/instances/0", "bounds-changed"], ["b", "/attachments/0", "required-connection-disconnected"],
  ]);
  assert.deepEqual([conflicts[0].expectedSize, conflicts[0].actualSize], [1, 2]);
  assert.deepEqual([conflicts[1].relationId, conflicts[1].before.gap, conflicts[1].after.gap], ["mount", 0, 1]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), doc);

  const fresh = scene("propose-distribute", request).json.proposal;
  const result = scene("apply-proposal", JSON.stringify(fresh));
  assert.equal(result.status, 0);
  const placed = result.json.scene;
  assert.equal(placed.revision, 4);
  save(placed);
  const built = scene("build").json.scene;
  assert.equal(built.relations[0].connected, true);
  assert.equal(built.instances[1].bounds.min[0], built.instances[0].bounds.max[0]);
  assert.deepEqual(scene("apply-proposal", JSON.stringify(fresh)).json.scene, placed);
});

test("scene apply reports proposal field pointers and independent live conflicts in the same CLI response", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-proposal-fields-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = { revision: 3, instances: ["a", "b", "frame"].map((id, i) => ({
    id, component: "core.composition", transform: { position: [i === 0 ? 0 : 4, 0, 0] },
    parameters: { anchors: { pin: [0, 0, 0] }, nodes: [{ id: "body", geometry: { type: "box", size: [1, 1, 1] } }] },
  })) };
  const save = input => writeFileSync(file, JSON.stringify(input));
  const scene = (action, ...args) => runNode(cliPath, ["scene", action, file, ...args]);
  const propose = () => scene("propose-distribute", JSON.stringify({ instanceIds: ["a", "b"], start: 1.5 })).json.proposal;
  save(doc);
  const edited = propose();
  edited.changes[0].after.position = [null, 0, "bad"];
  edited.changes[0].after.rotation = [0];
  edited.changes[0].before.scale = [1, false, 1];
  edited.changes.push({ instanceId: "a", operation: "move" },
    { instanceId: "missing", operation: "update-instance-transform", before: {}, after: {} });
  doc.instances[0].parameters.nodes[0].geometry.size[0] = 2;
  doc.attachments = [{ id: "mount", from: "b#pin", to: "frame#pin" }];
  save(doc);
  for (const input of [edited, { proposal: edited }]) {
    const result = scene("apply-proposal", JSON.stringify(input));
    assert.equal(result.status, 2);
    assert.equal(result.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(result.json.scene, undefined);
    const conflicts = result.json.error.conflicts;
    assert.deepEqual(conflicts.filter(c => c.source === "proposal").map(c => [c.path, c.reason, c.instanceId]), [
      ["/changes/0/after/position/0", "transform-invalid", "a"], ["/changes/0/after/position/2", "transform-invalid", "a"],
      ["/changes/0/after/rotation", "transform-invalid", "a"], ["/changes/2/operation", "operation-unsupported", "a"],
      ["/changes/0/before/scale/1", "transform-invalid", "a"],
    ]);
    assert.deepEqual(conflicts.filter(c => c.source !== "proposal").map(c => [c.path, c.reason, c.instanceId]),
      [["/instances", "instance-missing", "missing"], ["/attachments/0", "required-connection-disconnected", "b"]]);
    assert.equal(conflicts.at(-1).after.gap, 1);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), doc);
  }
  const fixed = propose();
  const placed = scene("apply-proposal", JSON.stringify(fixed)).json.scene;
  assert.equal(placed.revision, 4);
  save(placed);
  assert.equal(scene("build").json.scene.relations[0].connected, true);
  assert.deepEqual(scene("apply-proposal", JSON.stringify(fixed)).json.scene, placed);
});

test("CLI distribution measures joints in the final batch pose and rejects unreviewed disconnections", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-distribute-joints-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 4,
    instances: ["a", "b", "c", "d"].map((id, x) => ({
      id, component: "core.composition", transform: { position: [x, 0, 0] },
      parameters: { nodes: [{ id: "body", geometry: { type: "box", size: [1, 1, 1] } }],
        anchors: { left: [-0.5, 0, 0], right: [0.5, 0, 0] } },
    })),
    relations: [{ id: "bc", type: "connects", from: "b#right", to: "c#left" }],
    attachments: [{ id: "cd", from: "c#right", to: "d#left", required: false }],
  };
  const save = scene => writeFileSync(file, JSON.stringify(scene));
  const propose = () => runNode(cliPath, ["scene", "propose-distribute", file,
    JSON.stringify({ instanceIds: ["b", "c"], axis: "x", start: 2.5, gap: 0 })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify({ proposal })]);
  save(doc);
  const earlier = propose();
  doc.attachments.push({ id: "ab", from: "a#right", to: "b#left" });
  save(doc);
  const stale = apply(earlier);
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.equal(stale.json.scene, undefined);
  const fresh = propose();
  const rows = fresh.facts.connectionImpact;
  assert.deepEqual(rows.map(r => [r.relationId, r.path, r.before.gap, r.after.gap, r.after.connected]), [
    ["bc", "/relations/0", 0, 0, true],
    ["cd", "/attachments/0", 0, 2, false],
    ["ab", "/attachments/1", 0, 2, false],
  ]);
  assert.deepEqual(stale.json.error.conflicts, [{ instanceId: "b", reason: "required-connection-disconnected", ...rows[2] }]);
  const placed = apply(fresh);
  assert.equal(placed.status, 0);
  assert.equal(placed.json.scene.revision, 5);
  save(placed.json.scene);
  const check = runNode(cliPath, ["scene", "check", file]);
  assert.equal(check.status, 2);
  const diagnostics = check.json.issues.map(({ code, level, measurement }) => ({ code, level, measurement }));
  assert.deepEqual(diagnostics, rows.flatMap(r => r.after.issues));
  assert.deepEqual(diagnostics.map(i => i.level), ["warning", "error"]);
  assert.deepEqual(apply(fresh).json.scene, placed.json.scene);
});

test("CLI exposes MEP route, drain slope, and pressure test helpers", () => {
  const route = runNode(cliPath, ["mep", "route-with-clips", "{\"id\":\"cli-rough-in\",\"routes\":[{\"id\":\"cold\",\"system\":\"cold-water\",\"points\":[[0,0.4,0],[0,1.8,0],[2,1.8,0]],\"clipSpacing\":0.5}]}"]);
  assert.equal(route.status, 0);
  assert.equal(route.stderr, "");
  assert.equal(route.json.ok, true);
  assert.equal(route.json.result.kind, "mep-route-with-clips");
  assert.equal(route.json.result.composition.parameters.nodes.find(node => node.id === "cold-clip").repetition.type, "path");

  const slope = runNode(cliPath, ["mep", "drain-slope-check", "{\"points\":[[0,0.1,0],[2,0.08,0],[4,0.06,0]],\"options\":{\"minSlope\":0.005,\"maxSlope\":0.02}}"]);
  assert.equal(slope.status, 0);
  assert.equal(slope.json.ok, true);
  assert.equal(slope.json.analysis.kind, "mep-drain-slope-check");
  assert.equal(slope.json.analysis.ok, true);

  const pressure = runNode(cliPath, ["mep", "pressure-test-loop", "{\"id\":\"cli-pressure\",\"hotPort\":[-1.2,0.7,-0.2],\"coldPort\":[-1.2,0.7,-0.8]}"]);
  assert.equal(pressure.status, 0);
  assert.equal(pressure.stderr, "");
  assert.equal(pressure.json.ok, true);
  assert.equal(pressure.json.result.kind, "mep-pressure-test-loop");
  assert.ok(pressure.json.result.composition.parameters.anchors["gauge-read"]);
});

test("CLI checks and builds the edited centerline, clips, ports and downstream connection", t => {
  const request = { id: "rough", routes: [{ id: "cold", points: [[0,0,0], [2,0,0]], clipSpacing: 0.5 }] };
  const generated = runNode(cliPath, ["mep", "route-with-clips", JSON.stringify(request)]);
  assert.equal(generated.status, 0);
  const doc = generated.json.result.composition;
  const folder = mkdtempSync(join(tmpdir(), "agentscene-route-"));
  const file = join(folder, "document.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const scene = {
    instances: [doc, { id: "next", component: "mep.pipe-run", parameters: { path: [[2,0,0],[3,0,0]], diameter: 0.08 } }],
    relations: [{ type: "connects", from: "rough#cold-end", to: "next#start" }],
  };
  writeFileSync(file, JSON.stringify(scene));
  assert.equal(runNode(cliPath, ["scene", "check", file]).json.ok, true);
  doc.parameters.nodes.find(n => n.id === "cold").geometry.points[1] = [1,0,0];
  writeFileSync(file, JSON.stringify(doc));
  assert.equal(runNode(cliPath, ["composition", "check", file]).json.ok, true);
  const { build } = runNode(cliPath, ["component", "build", file]).json;
  assert.deepEqual(build.anchors.local["cold-end"], [1,0,0]);
  assert.equal(build.metrics.totalPipeLength.value, 1);
  assert.equal(build.nodes[0].metadata.centerlineLength, 1);
  assert.deepEqual(build.nodes.filter(n => n.metadata.supportsRoute === "cold").map(n => n.transform.position[0]), [0.16, 0.66, 0.84]);
  assert.deepEqual(build.instance.parameters.anchors["cold-end"].position, [1,0,0]);
  writeFileSync(file, JSON.stringify(scene));
  const checked = runNode(cliPath, ["scene", "check", file]);
  assert.equal(checked.status, 2);
  assert.deepEqual(checked.json.issues.map(i => i.code), ["SCENE_CONNECTION_GAP"]);
  const rebuilt = runNode(cliPath, ["scene", "build", file]).json.scene;
  assert.equal(rebuilt.ok, false);
  assert.equal(rebuilt.relations[0].gap, 1);
});

test("CLI returns request paths and measurements for rejected route requests", () => {
  const route = { id: "cold", points: [[0,0,0], [0.2,0,0]] };
  const generate = routes => runNode(cliPath, ["mep", "route-with-clips", JSON.stringify({ routes })]);
  const short = generate([route]);
  assert.equal(short.status, 2);
  const { message, ...fields } = short.json.error;
  assert.match(message, /cold/);
  assert.deepEqual(fields, {
    code: "MEP_ROUTE_INVALID", path: "/routes/0/clipEndOffset", routeId: "cold", length: 0.2, startOffset: 0.16, endOffset: 0.16,
  });
  const duplicate = generate([route, route]).json.error;
  assert.equal(duplicate.path, "/routes/1/id");
  assert.equal(duplicate.firstPath, "/routes/0/id");
  assert.equal(generate([{ ...route, clipEndOffset: 0, clipSize: [1,-1,1] }]).json.error.path, "/routes/0/clipSize/1");
  assert.equal(generate([{ ...route, clipEndOffset: 0, clipOffset: [1e20,0,0] }]).json.error.path, "/routes/0/clipOffset");
  assert.equal(generate([{ ...route, radialSegments: 1.5 }]).json.error.path, "/routes/0/radialSegments");
  assert.equal(generate([{ ...route, generateClips: false }]).json.ok, true);
});

test("CLI alignment previews match scene check and identify an unreviewed required joint on apply", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-align-impact-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const pipe = (id, x) => ({ id, component: "mep.pipe-run", parameters: { diameter: 0.05, path: [[x,0,0],[x+1,0,0]] } });
  const ab = { id: "ab", type: "connects", from: "a#end", to: "b#start" };
  const bc = { id: "bc", from: "b#end", to: "c#start" };
  const doc = { revision: 7, instances: [pipe("a",0),pipe("b",2),pipe("c",3)], relations: [ab] };
  const save = value => writeFileSync(file, JSON.stringify(value));
  const propose = () => runNode(cliPath, ["scene", "propose-align", file, JSON.stringify({
    instanceId: "b", source: "b#start", target: "a#end",
  })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify({ proposal })]);
  const check = () => runNode(cliPath, ["scene", "check", file]).json.issues;
  save(doc);
  const earlier = propose();
  doc.attachments = [bc];
  save(doc);
  const preview = propose();
  const rows = preview.facts.connectionImpact;
  assert.deepEqual(rows.map(r => [r.relationId, r.path, r.required, r.before.gap, r.after.gap, r.before.connected, r.after.connected]), [
    ["ab", "/relations/0", true, 1, 0, false, true], ["bc", "/attachments/0", true, 0, 1, true, false],
  ]);
  function compareIssues(side) {
    const actual = check();
    for (const row of rows) {
      const issues = actual.filter(i => i.path.startsWith(row.path + "/")).map(({ code, level, measurement }) => ({ code, level, measurement }));
      assert.deepEqual(row[side].issues, issues);
    }
  }
  compareIssues("before");
  const stale = apply(earlier);
  assert.equal(stale.status, 2);
  assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
  assert.deepEqual(stale.json.error.conflicts, [{ instanceId: "b", reason: "required-connection-disconnected", ...rows[1] }]);
  assert.equal(stale.json.scene, undefined);
  const approved = apply(preview);
  assert.equal(approved.status, 0);
  assert.equal(approved.json.scene.revision, 8);
  save(approved.json.scene);
  compareIssues("after");
  assert.deepEqual(apply(preview).json.scene, approved.json.scene);
});

test("CLI reports a damaged repair status and duplicate review without hiding a newly disconnected joint", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-review-rows-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = { revision: 3, instances: [["a", 0], ["b", 2], ["c", 3]].map(([id, x]) => ({
    id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
    parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.05 },
  })), attachments: [
    { id: "repair", from: "a#end", to: "b#start", contract: { outsideDiameter: "equal" } },
    { from: "b#end", to: "c#start" },
  ] };
  const save = input => writeFileSync(file, JSON.stringify(input));
  const scene = (action, value) => runNode(cliPath, ["scene", action, file, JSON.stringify(value)]);
  const propose = () => scene("propose-align", { instanceId: "b", sourceAnchor: "start", target: "a#end" }).json.proposal;
  const apply = p => scene("apply-proposal", { proposal: p });
  save(doc);
  const original = propose();
  const placed = apply(original).json.scene;
  const edited = structuredClone(original);
  edited.facts.connectionImpact[0].after.connected = "true";
  edited.facts.connectionImpact.push(structuredClone(edited.facts.connectionImpact[1]));
  for (const input of [doc, placed]) {
    input.instances[0].parameters.diameter = 0.075;
    input.attachments.push(structuredClone(input.attachments[1]));
    save(input);
    const result = apply(edited);
    assert.equal(result.status, 2);
    assert.equal(result.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(result.json.scene, undefined);
    const [status, duplicate, ...live] = result.json.error.conflicts;
    assert.deepEqual([status.source, status.path, status.reason, status.instanceId],
      ["proposal", "/facts/connectionImpact/0/after/connected", "connection-preview-invalid", "b"]);
    assert.deepEqual([duplicate.source, duplicate.path, duplicate.reason, duplicate.firstPath],
      ["proposal", "/facts/connectionImpact/2/path", "connection-preview-duplicate", "/facts/connectionImpact/1/path"]);
    assert.deepEqual(live.map(c => [c.path, c.reason, c.before.gap, c.after.gap]), input === doc
      ? [["/attachments/2", "required-connection-disconnected", 0, 1]] : []);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), input);
    const [repair] = apply(original).json.error.conflicts;
    assert.equal(repair.reason, "required-connection-not-restored");
    assert.equal(repair.after.issues[0].measurement.difference, 0.025);
  }
  doc.instances[0].parameters.diameter = 0.05;
  save(doc);
  const fresh = propose();
  assert.deepEqual(fresh.facts.connectionImpact.map(row => row.path), ["/attachments/0", "/attachments/1", "/attachments/2"]);
  const applied = apply(fresh);
  assert.equal(applied.status, 0);
  assert.equal(applied.json.scene.revision, 4);
  save(applied.json.scene);
  assert.deepEqual(apply(fresh).json.scene, applied.json.scene);
});

test("CLI identifies the joint and pose when a projected distance exceeds the JSON number range", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-joint-range-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = { instances: ["slide", "frame"].map(id => ({ id, component: "core.composition",
    parameters: { nodes: [], anchors: { pin: [0, 0, 0] } } })), attachments: [{ from: "slide#pin", to: "frame#pin" }] };
  const scene = (action, value) => runNode(cliPath, ["scene", action, file, JSON.stringify(value)]);
  const request = { instanceId: "slide", sourceAnchor: "pin", targetPoint: [-1e308, 0, 0] };
  writeFileSync(file, JSON.stringify(doc));
  const { proposal } = scene("propose-align", request).json;
  assert.equal(proposal.facts.connectionImpact[0].after.gap, 1e308);
  doc.instances[1].parameters.anchors.pin[0] = 1e308;
  writeFileSync(file, JSON.stringify(doc));
  const invalid = scene("propose-align", request);
  assert.equal(invalid.status, 2);
  assert.equal(invalid.json.proposal, undefined);
  assert.equal(invalid.json.error.code, "SCENE_CONNECTION_MEASUREMENT_INVALID");
  assert.deepEqual(invalid.json.error.measurement, { path: "/attachments/0", phase: "after", from: "slide#pin", to: "frame#pin", unit: "meter" });
  const replay = scene("apply-proposal", proposal);
  assert.equal(replay.status, 2);
  assert.equal(replay.json.scene, undefined);
  assert.equal(replay.json.error.conflicts[0].reason, "connection-unavailable");
  assert.deepEqual(replay.json.error.conflicts[0].measurement, invalid.json.error.measurement);
});

test("CLI rejects contradictory gap and port previews and detects the lost repair on apply and retry", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-reviewed-repair-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 3,
    instances: [0, 2].map((x, i) => ({
      id: i ? "b" : "a", component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.05 },
    })),
    attachments: [{ id: "ab", from: "a#end", to: "b#start", contract: { direction: "opposed", outsideDiameter: "equal", embed: 0.08, gapTolerance: 0.02 } }],
  };
  const save = input => writeFileSync(file, JSON.stringify(input));
  const propose = () => runNode(cliPath, ["scene", "propose-align", file,
    JSON.stringify({ instanceId: "b", sourceAnchor: "start", target: "a#end" })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify({ proposal })]);
  save(doc);
  const proposal = propose();
  const reviewed = proposal.facts.connectionImpact[0];
  assert.deepEqual([reviewed.before.connected, reviewed.after.connected], [false, true]);
  assert.deepEqual([reviewed.before.gap, reviewed.before.effectiveGap], [1, 0.92]);
  const edited = structuredClone(proposal);
  Object.assign(edited.facts.connectionImpact[0].before, { connected: true, issues: [] });
  const falseFailures = structuredClone(proposal);
  const after = falseFailures.facts.connectionImpact[0].after;
  after.connected = false;
  after.issues = [
    { code: "SCENE_CONNECTION_DIRECTION", level: "error", measurement: {
      space: "world", unit: "radian", fromDirection: [1, 0, 0], toDirection: [-1, 0, 0],
      angle: Math.PI, deviation: 0, direction: "opposed", angularTolerance: reviewed.contract.angularTolerance,
    } },
    { code: "SCENE_CONNECTION_DIAMETER_MISMATCH", level: "error", measurement: {
      unit: "meter", from: 0.05, to: 0.05, difference: 0, diameterTolerance: reviewed.contract.diameterTolerance,
    } },
  ];
  const applied = apply(proposal).json.scene;
  for (const input of [doc, applied]) {
    input.instances[0].parameters.diameter = 0.075;
    save(input);
    const invalid = apply(edited);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(invalid.json.scene, undefined);
    const conflicts = invalid.json.error.conflicts;
    assert.deepEqual(conflicts.map(c => c.path), ["connected", "issues"].map(k => "/facts/connectionImpact/0/before/" + k));
    assert.ok(conflicts.every(c => c.reason === "connection-preview-invalid" && c.instanceId === "b"));
    assert.deepEqual([conflicts[0].expected, conflicts[0].actual], [false, true]);
    const portResult = apply(falseFailures);
    assert.equal(portResult.status, 2);
    assert.equal(portResult.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(portResult.json.scene, undefined);
    const portConflicts = portResult.json.error.conflicts;
    assert.ok(portConflicts.every(c => c.source === "proposal" && c.reason === "connection-preview-invalid" && c.instanceId === "b"));
    assert.deepEqual(portConflicts.map(c => [c.path, c.expected, c.actual]), [
      ["/facts/connectionImpact/0/after/issues/0/code", null, "SCENE_CONNECTION_DIRECTION"],
      ["/facts/connectionImpact/0/after/issues/1/code", null, "SCENE_CONNECTION_DIAMETER_MISMATCH"],
      ["/facts/connectionImpact/0/after/connected", true, false],
    ]);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), input);
    const stale = apply(proposal);
    assert.equal(stale.status, 2);
    assert.equal(stale.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(stale.json.scene, undefined);
    const [conflict] = stale.json.error.conflicts;
    assert.deepEqual([conflict.instanceId, conflict.reason, conflict.path, conflict.relationId], [
      "b", "required-connection-not-restored", "/attachments/0", "ab",
    ]);
    assert.deepEqual(conflict.reviewedAfter, reviewed.after);
    assert.equal(conflict.before.gap, input === doc ? 1 : 0);
    assert.equal(conflict.after.gap, 0);
    assert.equal(conflict.after.connected, false);
    assert.deepEqual(conflict.after.issues.map(i => [i.code, i.measurement.difference]),
      [["SCENE_CONNECTION_DIAMETER_MISMATCH", 0.025]]);
  }
  save(doc);
  const fresh = propose();
  assert.equal(fresh.facts.connectionImpact[0].after.connected, false);
  const updated = apply(fresh);
  assert.equal(updated.status, 0);
  assert.equal(updated.json.scene.revision, 4);
  save(updated.json.scene);
  const [issue] = runNode(cliPath, ["scene", "check", file]).json.issues;
  assert.deepEqual(issue.measurement, fresh.facts.connectionImpact[0].after.issues[0].measurement);
  doc.instances[1].parameters.diameter = 0.075;
  save(doc);
  const repaired = apply(proposal);
  assert.equal(repaired.status, 0);
  save(repaired.json.scene);
  assert.deepEqual(runNode(cliPath, ["scene", "check", file]).json, { ok: true, issues: [] });
  assert.deepEqual(apply(proposal).json.scene, repaired.json.scene);
});

test("CLI reports a missed partial repair while preserving reviewed residual issues", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-partial-repair-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 3,
    instances: [["a", 0, 0.05], ["b", 2, 0.075]].map(([id, x, diameter]) => ({
      id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter },
    })),
    attachments: [{ id: "ab", from: "a#end", to: "b#start", contract: { outsideDiameter: "equal" } }],
  };
  const save = scene => writeFileSync(file, JSON.stringify(scene));
  const propose = () => runNode(cliPath, ["scene", "propose-align", file,
    JSON.stringify({ instanceId: "b", sourceAnchor: "start", targetPoint: [1, 0, 0] })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  const codes = state => state.issues.map(issue => issue.code);
  const gap = "SCENE_CONNECTION_GAP", diameter = "SCENE_CONNECTION_DIAMETER_MISMATCH";
  save(doc);
  const proposal = propose();
  const [reviewed] = proposal.facts.connectionImpact;
  assert.deepEqual([codes(reviewed.before), codes(reviewed.after)], [[gap, diameter], [diameter]]);
  const applied = apply(proposal);
  assert.equal(applied.status, 0);
  assert.equal(applied.json.scene.revision, 4);
  for (const input of [doc, applied.json.scene]) {
    input.instances[0].parameters.path[1][0] = 0.75;
    input.attachments.unshift({ from: "a#end", to: "a#end" });
    save(input);
    const rejected = apply(proposal);
    assert.equal(rejected.status, 2);
    assert.equal(rejected.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(rejected.json.scene, undefined);
    assert.equal(rejected.json.error.conflicts.length, 1);
    const [conflict] = rejected.json.error.conflicts;
    assert.deepEqual([conflict.path, conflict.reviewedPath, conflict.instanceId, conflict.reason],
      ["/attachments/1", "/attachments/0", "b", "required-connection-issues-not-resolved"]);
    assert.deepEqual(conflict.unresolvedIssueCodes, [gap]);
    assert.deepEqual([conflict.reviewedBefore, conflict.reviewedAfter], [reviewed.before, reviewed.after]);
    assert.equal(conflict.after.gap, 0.25);
    assert.deepEqual(codes(conflict.after), [gap, diameter]);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), input);
  }
  doc.instances[0].parameters.path[1][0] = 1;
  save(doc);
  const repaired = apply(proposal);
  assert.equal(repaired.status, 0);
  save(repaired.json.scene);
  assert.deepEqual(apply(proposal).json.scene, repaired.json.scene);
  const checked = runNode(cliPath, ["scene", "check", file]);
  assert.deepEqual(codes(checked.json), [diameter]);
});

test("CLI reports new failure codes for a reviewed disconnection on apply and replay", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-changed-disconnection-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 3,
    instances: [["a", 0], ["b", 1]].map(([id, x]) => ({
      id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.05 },
    })),
    attachments: [{ id: "ab", from: "a#end", to: "b#start", contract: { outsideDiameter: "equal", direction: "opposed" } }],
  };
  const save = scene => writeFileSync(file, JSON.stringify(scene));
  const propose = () => runNode(cliPath, ["scene", "propose-align", file,
    JSON.stringify({ instanceId: "b", sourceAnchor: "start", targetPoint: [2, 0, 0] })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  save(doc);
  const proposal = propose();
  const [reviewed] = proposal.facts.connectionImpact;
  assert.equal(reviewed.before.connected, true);
  assert.deepEqual(reviewed.after.issues.map(issue => issue.code), ["SCENE_CONNECTION_GAP"]);
  const placed = apply(proposal).json.scene;
  assert.equal(placed.revision, 4);
  for (const input of [doc, placed]) {
    input.attachments.unshift({ from: "a#end", to: "a#end" });
    const port = input.instances[0].parameters;
    port.diameter = 0.075;
    port.path[0] = [0, -1, 0];
    save(input);
    const rejected = apply(proposal);
    assert.equal(rejected.status, 2);
    assert.equal(rejected.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(rejected.json.scene, undefined);
    assert.equal(rejected.json.error.conflicts.length, 1);
    const [conflict] = rejected.json.error.conflicts;
    assert.deepEqual([conflict.reason, conflict.instanceId, conflict.path, conflict.reviewedPath, conflict.relationId],
      ["reviewed-disconnection-changed", "b", "/attachments/1", "/attachments/0", "ab"]);
    assert.deepEqual(conflict.addedIssueCodes, ["SCENE_CONNECTION_DIRECTION", "SCENE_CONNECTION_DIAMETER_MISMATCH"]);
    assert.deepEqual(conflict.reviewedAfter, reviewed.after);
    assert.equal(conflict.before.gap, input === doc ? 0 : 1);
    assert.equal(conflict.after.gap, 1);
    assert.equal(conflict.after.issues[1].measurement.deviation, Math.PI / 4);
    assert.equal(conflict.after.issues[2].measurement.difference, 0.025);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), input);
  }
  doc.instances[0].parameters = { path: [[0, 0, 0], [1.25, 0, 0]], diameter: 0.05 };
  save(doc);
  const updated = apply(proposal);
  assert.equal(updated.status, 0);
  assert.equal(updated.json.scene.revision, 4);
  save(updated.json.scene);
  const [gap] = runNode(cliPath, ["scene", "check", file]).json.issues;
  assert.equal(gap.measurement.gap, 0.75);
  assert.deepEqual(apply(proposal).json.scene, updated.json.scene);
});

test("CLI checks effective gaps for both new disconnections and reviewed reductions", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-reviewed-gap-limit-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const save = scene => writeFileSync(file, JSON.stringify(scene));
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  for (const [start, reviewedBefore, liveBefore] of [[1, 0, 0.45], [2, 0.95, 1.45]]) {
    const doc = {
      revision: 3,
      instances: [["a", 0], ["b", start]].map(([id, x]) => ({
        id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
        parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.05 },
      })),
      attachments: [{ from: "a#end", to: "b#start", contract: { embed: 0.05, gapTolerance: 0.02 } }],
    };
    save(doc);
    const { proposal } = runNode(cliPath, ["scene", "propose-align", file,
      JSON.stringify({ instanceId: "b", sourceAnchor: "start", targetPoint: [1.25, 0, 0] })]).json;
    const [reviewed] = proposal.facts.connectionImpact;
    assert.deepEqual([reviewed.before.effectiveGap, reviewed.after.effectiveGap], [reviewedBefore, 0.2]);
    const accepted = apply(proposal);
    assert.equal(accepted.status, 0);
    assert.equal(accepted.json.scene.revision, 4);
    for (const input of [doc, accepted.json.scene]) {
      input.instances[0].parameters.path[1][0] = 0.5;
      input.attachments.unshift({ from: "a#end", to: "a#end" });
      save(input);
      const result = apply(proposal);
      assert.equal(result.status, 2);
      assert.equal(result.json.error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.equal(result.json.scene, undefined);
      assert.equal(result.json.error.conflicts.length, 1);
      const [conflict] = result.json.error.conflicts;
      assert.deepEqual([conflict.reason, conflict.path, conflict.reviewedPath, conflict.before.effectiveGap],
        ["reviewed-connection-measurement-exceeded", "/attachments/1", "/attachments/0", input === doc ? liveBefore : 0.7]);
      assert.deepEqual(conflict.exceededMeasurements, [
        { code: "SCENE_CONNECTION_GAP", field: "effectiveGap", unit: "meter", expected: 0.2, actual: 0.7 },
      ]);
      assert.deepEqual(conflict.reviewedAfter, reviewed.after);
      assert.deepEqual(JSON.parse(await readFile(file, "utf8")), input);
    }
    doc.instances[0].parameters.path[1][0] = 1.01;
    save(doc);
    const smaller = apply(proposal);
    assert.equal(smaller.status, 0);
    save(smaller.json.scene);
    assert.deepEqual(apply(proposal).json.scene, smaller.json.scene);
  }
});

test("CLI distinguishes unreviewed growth from a larger but unchanged existing gap", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-unreviewed-gap-growth-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 3,
    instances: [["a", 0], ["b", 1]].map(([id, x]) => ({
      id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter: 0.05 },
    })),
    attachments: [{ from: "a#end", to: "b#start" }],
  };
  const setEnd = point => {
    doc.instances[0].parameters.path[1] = point;
    writeFileSync(file, JSON.stringify(doc));
  };
  const propose = () => runNode(cliPath, ["scene", "propose-align", file,
    JSON.stringify({ instanceId: "b", sourceAnchor: "start", targetPoint: [2, 0, 0] })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  setEnd([1.5, 0, 0]);
  const unchanged = propose();
  const [original] = unchanged.facts.connectionImpact;
  assert.deepEqual([original.before.effectiveGap, original.after.effectiveGap], [0.5, 0.5]);
  setEnd([3, 0, 0]);
  const improvement = propose();
  assert.equal(improvement.facts.connectionImpact[0].after.effectiveGap, 1);
  setEnd([1.25, 0, 0]);
  for (const proposal of [unchanged, improvement]) {
    const result = apply(proposal);
    assert.equal(result.status, 2);
    assert.equal(result.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(result.json.scene, undefined);
    assert.equal(result.json.error.conflicts.length, 1);
    const [conflict] = result.json.error.conflicts;
    assert.deepEqual([conflict.instanceId, conflict.path, conflict.reason],
      ["b", "/attachments/0", "required-connection-measurement-increased"]);
    assert.deepEqual(conflict.increasedMeasurements, [
      { code: "SCENE_CONNECTION_GAP", field: "effectiveGap", unit: "meter", before: 0.25, after: 0.75 },
    ]);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), doc);
  }
  const legacy = structuredClone(unchanged);
  delete legacy.facts.connectionImpact;
  assert.equal(apply(legacy).status, 0);
  const newlyReviewed = propose();
  const accepted = apply(newlyReviewed);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.json.scene.revision, 4);
  writeFileSync(file, JSON.stringify(accepted.json.scene));
  assert.deepEqual(apply(newlyReviewed).json.scene, accepted.json.scene);
  setEnd([1.5, 1, 0]);
  assert.equal(apply(unchanged).status, 0);
});

test("CLI rechecks new issues at a joint that stays disconnected", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-new-joint-issues-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 3,
    instances: [["a", 0, 0.5, 0.05], ["b", 1, 1, 0.075]].map(([id, x, length, diameter]) => ({
      id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { path: [[0, 0, 0], [length, 0, 0]], diameter },
    })),
    attachments: [{ from: "a#end", to: "b#start", contract: { outsideDiameter: "equal" } }],
  };
  const save = scene => writeFileSync(file, JSON.stringify(scene));
  const propose = () => runNode(cliPath, ["scene", "propose-align", file,
    JSON.stringify({ instanceId: "b", sourceAnchor: "start", targetPoint: [2, 0, 0] })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  const issueCodes = state => state.issues.map(issue => issue.code);
  const gapCode = "SCENE_CONNECTION_GAP";
  const diameterCode = "SCENE_CONNECTION_DIAMETER_MISMATCH";
  save(doc);
  const stale = propose();
  const [oldReview] = stale.facts.connectionImpact;
  assert.deepEqual([issueCodes(oldReview.before), issueCodes(oldReview.after)], [[gapCode, diameterCode], [gapCode, diameterCode]]);
  const legacy = structuredClone(stale);
  delete legacy.facts.connectionImpact;
  assert.equal(apply(legacy).status, 0);
  doc.instances[0].parameters.path[1][0] = 1;
  save(doc);
  for (const proposal of [stale, legacy]) {
    const rejected = apply(proposal);
    assert.equal(rejected.status, 2);
    assert.equal(rejected.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(rejected.json.scene, undefined);
    assert.equal(rejected.json.error.conflicts.length, 1);
    const [conflict] = rejected.json.error.conflicts;
    assert.deepEqual([conflict.instanceId, conflict.path, conflict.reason], ["b", "/attachments/0", "required-connection-new-issues"]);
    assert.deepEqual(conflict.addedIssueCodes, [gapCode]);
    assert.deepEqual([conflict.before.connected, conflict.before.gap, issueCodes(conflict.before)], [false, 0, [diameterCode]]);
    assert.deepEqual([conflict.after.connected, conflict.after.gap, issueCodes(conflict.after)], [false, 1, [gapCode, diameterCode]]);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), doc);
  }
  const reviewed = propose();
  const accepted = apply(reviewed);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.json.scene.revision, 4);
  save(accepted.json.scene);
  assert.deepEqual(apply(reviewed).json.scene, accepted.json.scene);
  doc.instances[0].parameters.diameter = 0.075;
  save(doc);
  const nowConnected = apply(reviewed);
  assert.equal(nowConnected.status, 2);
  assert.deepEqual(nowConnected.json.error.conflicts.map(c => c.reason), ["required-connection-disconnected"]);
});

test("CLI rejects an omitted port issue before it can approve a required disconnection", async t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-missing-port-issue-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    revision: 3,
    instances: [["a", 0, 0.075], ["b", 1, 0.05]].map(([id, x, diameter]) => ({
      id, component: "mep.pipe-run", transform: { position: [x, 0, 0] },
      parameters: { path: [[0, 0, 0], [1, 0, 0]], diameter },
    })),
    attachments: [{ from: "a#end", to: "b#start", contract: { outsideDiameter: "equal" } }],
  };
  const save = scene => writeFileSync(file, JSON.stringify(scene));
  const propose = () => runNode(cliPath, ["scene", "propose-align", file,
    JSON.stringify({ instanceId: "b", sourceAnchor: "start", targetPoint: [2, 0, 0] })]).json.proposal;
  const apply = proposal => runNode(cliPath, ["scene", "apply-proposal", file, JSON.stringify(proposal)]);
  save(doc);
  const original = propose();
  const [joint] = original.facts.connectionImpact;
  assert.deepEqual(joint.before.portMeasurements, { outsideDiameter: { from: 0.075, to: 0.05 } });
  assert.deepEqual([joint.before.connected, joint.before.gap, joint.after.connected], [false, 0, false]);
  const placed = apply(original).json.scene;
  assert.equal(placed.revision, 4);
  const damaged = structuredClone(original);
  Object.assign(damaged.facts.connectionImpact[0].before, { connected: true, issues: [] });
  for (const input of [doc, placed]) {
    input.instances[0].parameters.diameter = 0.05;
    save(input);
    const rejected = apply(damaged);
    assert.equal(rejected.status, 2);
    assert.equal(rejected.json.error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(rejected.json.scene, undefined);
    const [status, missing, ...live] = rejected.json.error.conflicts;
    assert.deepEqual([status.path, status.expected, status.actual], ["/facts/connectionImpact/0/before/connected", false, true]);
    assert.deepEqual([missing.path, missing.expected, missing.actual],
      ["/facts/connectionImpact/0/before/issues", "SCENE_CONNECTION_DIAMETER_MISMATCH", null]);
    assert.deepEqual(live.map(c => [c.path, c.reason, c.after.gap]),
      input === doc ? [["/attachments/0", "required-connection-disconnected", 1]] : []);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), input);
  }
  save(doc);
  const fresh = propose();
  assert.deepEqual(fresh.facts.connectionImpact[0].before.portMeasurements.outsideDiameter, { from: 0.05, to: 0.05 });
  assert.equal(fresh.facts.connectionImpact[0].before.connected, true);
  const result = apply(fresh);
  assert.equal(result.status, 0);
  assert.equal(result.json.scene.revision, 4);
  save(result.json.scene);
  assert.deepEqual(apply(fresh).json.scene, result.json.scene);
});

test("scene check and build return the same joint measurements and accept the repaired boundary values", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-joint-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const doc = {
    instances: [
      { id: "a", component: "mep.pipe-run", parameters: { path: [[0,0,0],[1,0,0]], diameter: 0.050 } },
      { id: "b", component: "mep.pipe-run", transform: { position: [2,0,0] },
        parameters: { path: [[0,0,0],[0,1,0]], diameter: 0.04899 } },
    ],
    attachments: [{ id: "joint", from: "a#end", to: "b#start", contract: {
      gapTolerance: 0.1, direction: "opposed", angularTolerance: 0, outsideDiameter: "equal", diameterTolerance: 0.001,
    } }],
  };
  writeFileSync(file, JSON.stringify(doc));
  const checked = runNode(cliPath, ["scene", "check", file]);
  assert.equal(checked.status, 2);
  const issues = checked.json.issues;
  assert.deepEqual(issues.map(i => i.code), ["SCENE_CONNECTION_GAP", "SCENE_CONNECTION_DIRECTION", "SCENE_CONNECTION_DIAMETER_MISMATCH"]);
  const [gap, direction, diameter] = issues.map(i => i.measurement);
  assert.deepEqual(gap, { space: "world", unit: "meter", fromPoint: [1,0,0], toPoint: [2,0,0], gap: 1, embed: 0, effectiveGap: 1, gapTolerance: 0.1 });
  assert.deepEqual(direction, { space: "world", unit: "radian", fromDirection: [1,0,0], toDirection: [0,-1,0],
    direction: "opposed", angle: Math.PI / 2, deviation: Math.PI / 2, angularTolerance: 0 });
  assert.deepEqual(diameter, { unit: "meter", from: 0.050, to: 0.04899, difference: 0.00101, diameterTolerance: 0.001 });
  const scene = runNode(cliPath, ["scene", "build", file]).json.scene;
  assert.equal(scene.ok, false);
  assert.deepEqual(scene.issues.map(i => i.measurement), [gap, direction, diameter]);

  doc.instances[1].transform.position[0] = 1.1;
  doc.instances[1].parameters.diameter = 0.049;
  doc.attachments[0].contract.angularTolerance = Math.PI / 2;
  writeFileSync(file, JSON.stringify(doc));
  assert.deepEqual(runNode(cliPath, ["scene", "check", file]).json, { ok: true, issues: [] });
  assert.equal(runNode(cliPath, ["scene", "build", file]).json.scene.relations[0].connected, true);
});

test("CLI reports independent route errors together and accepts one repair pass over stdin", t => {
  const request = { routes: [
    { id: "cold", points: [[0,0,0], [0.2,0,0]], clipSize: [1,-1,1] },
    { id: "cold", points: [[0,0,0], [2,0,0]], radius: -1, clipSpacing: 0 },
    { id: "hot", points: [[0,0,0], [null,0,0]], radialSegments: 1 },
  ] };
  const generate = () => runNode(cliPath, ["mep", "route-with-clips", "-"], root, JSON.stringify(request));
  const failed = generate();
  assert.equal(failed.status, 2);
  assert.equal(failed.stderr, "");
  const { ok, error, issues } = failed.json;
  assert.equal(ok, false);
  assert.equal(failed.json.result, undefined);
  assert.deepEqual(error, issues[0]);
  assert.equal(error.firstPath, "/routes/0/id");
  const fixes = new Map([
    ["/routes/1/id", "drain"], ["/routes/0/clipEndOffset", 0.02], ["/routes/0/clipSize/1", 0.1],
    ["/routes/1/radius", 0.05], ["/routes/1/clipSpacing", 0.5],
    ["/routes/2/points/1/0", 1], ["/routes/2/radialSegments", 16],
  ]);
  assert.deepEqual(issues.map(issue => issue.path), [...fixes.keys()]);
  for (const issue of issues) {
    const keys = issue.path.slice(1).split("/");
    const index = Number(keys[1]);
    assert.equal(issue.routeId, index === 2 ? "hot" : "cold");
    assert.equal(issue.code, "MEP_ROUTE_INVALID");
    assert.ok(issue.message);
    const key = keys.pop();
    const parent = keys.reduce((value, field) => value[field], request);
    parent[key] = fixes.get(issue.path);
  }
  const retried = generate();
  assert.equal(retried.status, 0);
  assert.equal(retried.json.ok, true);
  const doc = JSON.stringify(retried.json.result.composition);
  assert.deepEqual(runNode(cliPath, ["composition", "check", "-"], root, doc).json, { ok: true, issues: [] });
  const folder = mkdtempSync(join(tmpdir(), "agentscene-route-repair-"));
  const file = join(folder, "repaired.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  writeFileSync(file, doc);
  const built = runNode(cliPath, ["component", "build", file]);
  assert.equal(built.status, 0);
  assert.equal(built.json.build.metrics.routeCount, 3);
});

test("CLI exposes human pose and reach analysis for composition manifests", () => {
  const manifestPath = "registry/compositions/basic-human-figure/manifest.json";
  const pose = runNode(cliPath, ["composition", "analyze-human-pose", manifestPath]);
  assert.equal(pose.status, 0);
  assert.equal(pose.json.ok, true);
  assert.equal(pose.json.analysis.kind, "human-pose-rig-analysis");
  assert.equal(pose.json.analysis.boneCount, 25);
  assert.equal(pose.json.analysis.metrics.handDetail.fingerTipCount, 10);
  assert.deepEqual(pose.json.analysis.chains["right-hand"], ["right-thumb", "right-index-finger", "right-middle-finger", "right-ring-finger", "right-little-finger"]);

  const reach = runNode(cliPath, ["composition", "analyze-human-reach", manifestPath, "{\"side\":\"right\",\"target\":[0.45,1.12,0.22]}"]);
  assert.equal(reach.status, 0);
  assert.equal(reach.json.analysis.kind, "human-reach-analysis");
  assert.equal(reach.json.analysis.reachable, true);
  assert.equal(reach.json.analysis.facts.solver, "reach-envelope-analysis");

  const proposal = runNode(cliPath, ["composition", "propose-human-reach", manifestPath, "{\"side\":\"right\",\"target\":[0.45,1.12,0.22]}"]);
  assert.equal(proposal.status, 0);
  assert.equal(proposal.json.proposal.intent, "human-reach-pose");
  assert.equal(proposal.json.proposal.facts.solver, "preset-reach-not-ik");
  assert.deepEqual(proposal.json.proposal.facts.changedNodeIds, ["right-shoulder-pivot", "right-elbow-pivot", "right-wrist-pivot"]);

  const ikSolution = runNode(cliPath, ["composition", "solve-human-reach", manifestPath, "{\"side\":\"right\",\"target\":[0.45,1.12,0.22],\"solver\":\"ik-lite\",\"tolerance\":0.035}"]);
  assert.equal(ikSolution.status, 0);
  assert.equal(ikSolution.json.solution.kind, "human-ik-lite-solution");
  assert.equal(ikSolution.json.solution.facts.solver, "two-bone-ik-lite");
  assert.equal(ikSolution.json.solution.withinTolerance, true);

  const ikProposal = runNode(cliPath, ["composition", "propose-human-reach", manifestPath, "{\"side\":\"right\",\"target\":[0.45,1.12,0.22],\"solver\":\"ik-lite\",\"tolerance\":0.035}"]);
  assert.equal(ikProposal.status, 0);
  assert.equal(ikProposal.json.proposal.intent, "human-ik-reach-pose");
  assert.equal(ikProposal.json.proposal.facts.solver, "two-bone-ik-lite");
  assert.deepEqual(ikProposal.json.proposal.facts.changedNodeIds, ["right-shoulder-pivot", "right-elbow-pivot"]);

  const graspProposal = runNode(cliPath, ["composition", "propose-human-grasp", manifestPath, "{\"side\":\"right\",\"graspType\":\"power-grip\",\"target\":[0.45,1.12,0.22]}"]);
  assert.equal(graspProposal.status, 0);
  assert.equal(graspProposal.json.proposal.intent, "human-grasp-pose");
  assert.equal(graspProposal.json.proposal.facts.solver, "hand-grasp-pose-lite");
  assert.equal(graspProposal.json.proposal.facts.graspType, "power-grip");
  assert.ok(graspProposal.json.proposal.facts.changedNodeIds.includes("right-middle-finger-pivot"));
  assert.ok(graspProposal.json.proposal.facts.changedNodeIds.includes("right-wrist-pivot"));
});

test("CLI analyzes GLB files as reference evidence", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "agentscene-glb-"));
  try {
    const glbPath = join(tempDir, "tiny.glb");
    writeFileSync(glbPath, createTinyGlb());
    const result = runNode(cliPath, ["reference", "analyze-glb", glbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.json.ok, true);
    assert.equal(result.json.analysis.kind, "glb-reference-analysis");
    assert.equal(result.json.analysis.source.generator, "agentscene-cli-test");
    assert.deepEqual(result.json.analysis.effectiveBounds.size, [1, 2, 3]);
    assert.equal(result.json.analysis.materialGroups[0].name, "cli-material");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI exposes human geometry surface generation", () => {
  const profile = runNode(cliPath, ["human-geometry", "profile", "{\"height\":1.78}"]);
  assert.equal(profile.status, 0);
  assert.equal(profile.json.ok, true);
  assert.equal(profile.json.profile.kind, "human-surface-profile");
  assert.equal(profile.json.profile.expansion.noNewGeometryTypeRequired, false);
  assert.deepEqual(profile.json.profile.expansion.addedGeometryTypes, ["tapered-cylinder-between", "lofted-surface"]);
  assert.equal(profile.json.profile.expansion.primarySurfaceGeometry, "lofted-surface");
  assert.ok(profile.json.profile.expansion.surfaceFeatures.includes("section-loft-head"));
  assert.ok(profile.json.profile.expansion.surfaceFeatures.includes("section-loft-hands"));
  assert.ok(profile.json.profile.sections.some(section => section.id === "waist"));

  const part = runNode(cliPath, ["human-geometry", "generate-part", "{\"part\":\"hand\",\"side\":\"right\",\"id\":\"cli-right-hand\"}"]);
  assert.equal(part.status, 0);
  assert.equal(part.stderr, "");
  assert.equal(part.json.ok, true);
  assert.equal(part.json.result.kind, "human-part-geometry");
  assert.equal(part.json.result.composition.id, "cli-right-hand");
  assert.equal(part.json.result.composition.parameters.nodes.find(node => node.id === "right-hand").geometry.type, "lofted-surface");
  assert.ok(part.json.result.composition.parameters.anchors["hand-grip"]);

  const result = runNode(cliPath, ["human-geometry", "generate-lowpoly-worker", "{\"id\":\"cli-worker\",\"height\":1.78}"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.json.ok, true);
  assert.equal(result.json.result.method, "character.human-surface-lowpoly");
  assert.equal(result.json.result.composition.id, "cli-worker");
  assert.equal(result.json.result.composition.parameters.nodes.find(node => node.id === "chest").geometry.type, "lofted-surface");
  assert.equal(result.json.result.composition.parameters.nodes.find(node => node.id === "head").geometry.type, "lofted-surface");
  assert.equal(result.json.result.composition.parameters.nodes.find(node => node.id === "right-hand").geometry.type, "lofted-surface");
  assert.equal(result.json.result.composition.parameters.nodes.find(node => node.id === "right-index-finger").geometry.type, "tapered-cylinder-between");
  assert.equal(result.json.result.composition.parameters.surfaceProfile.kind, "human-surface-profile");
  assert.ok(result.json.result.composition.parameters.anchors["right-hand-grip"]);

  const quality = runNode(cliPath, ["composition", "analyze-human-quality", "registry/compositions/basic-human-figure/manifest.json"]);
  assert.equal(quality.status, 0);
  assert.equal(quality.stderr, "");
  assert.equal(quality.json.ok, true);
  assert.equal(quality.json.analysis.kind, "human-model-quality-analysis");
  assert.equal(quality.json.analysis.rating, "usable-baseline");
});

test("CLI package declares an installable agentscene binary", async () => {
  const pkg = JSON.parse(await readFile(new URL("../packages/cli/package.json", import.meta.url), "utf8"));
  assert.equal(pkg.name, "@agentscene/cli");
  assert.equal(pkg.bin.agentscene, "./src/agentscene.mjs");
});
