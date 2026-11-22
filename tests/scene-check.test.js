import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkComposition, checkScene, composeScene, createDefaultRegistry } from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
const example = fileURLToPath(new URL("../examples/digital-modeling/mep/pipe-reducer-connection.json", import.meta.url));
const cli = fileURLToPath(new URL("../packages/cli/src/agentscene.mjs", import.meta.url));
const reducer = () => JSON.parse(readFileSync(example, "utf8"));
const joint = () => JSON.parse(readFileSync(new URL("../registry/methods/anchor-attachment/manifest.json", import.meta.url))).editor.document;
function run(args, input) {
  const result = spawnSync(process.execPath, [cli, "scene", "check", ...args], { input, encoding: "utf8" });
  assert.equal(result.stderr, "");
  return [result.status, JSON.parse(result.stdout)];
}

test("scene check aggregates a duplicate, ambiguous endpoint, typo and independent diameter mismatch", () => {
  const doc = reducer();
  doc.instances.push(structuredClone(doc.instances[0]));
  doc.instances[2].parameters.diameter = 0.025;
  doc.attachments[0].to = "reducer#typo";
  const [status, result] = run(["-"], JSON.stringify(doc));
  assert.equal(status, 2);
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map(i => [i.code, i.path]), [
    ["SCENE_INSTANCE_ID_DUPLICATE", "/instances/3/id"],
    ["SCENE_INSTANCE_AMBIGUOUS", "/attachments/0/from"],
    ["SCENE_ANCHOR_MISSING", "/attachments/0/to"],
    ["SCENE_CONNECTION_DIAMETER_MISMATCH", "/attachments/1/contract/outsideDiameter"],
  ]);
  assert.equal(result.issues[2].instanceId, "reducer");
  assert.equal(result.issues[3].to, "large-pipe#start");
  assert.deepEqual(result.issues[3].instanceIds, ["reducer", "large-pipe"]);
  const [duplicate, reference] = result.issues;
  assert.deepEqual(duplicate.relatedLocations, [{ path: "/instances/0/id", kind: "first-declaration" }]);
  assert.deepEqual(reference.relatedLocations, [0, 3].map(index => ({ path: `/instances/${index}/id`, kind: "candidate-declaration" })));
  const text = JSON.stringify(doc, null, 2);
  const [rangedStatus, ranged] = run(["-", "--source-ranges"], text);
  assert.equal(rangedStatus, 2);
  const candidates = ranged.issues[1].relatedLocations;
  const expectedToken = JSON.stringify(doc.instances[0].id);
  for (const [index, { path, sourceRange }] of candidates.entries()) {
    assert.equal(path, reference.relatedLocations[index].path);
    assert.equal(sourceRange.matchedPath, path);
    assert.equal(text.slice(sourceRange.offset, sourceRange.offset + sourceRange.length), expectedToken);
  }
  assert.deepEqual(ranged.issues[0].relatedLocations[0].sourceRange, candidates[0].sourceRange);
  assert.notEqual(candidates[0].sourceRange.offset, candidates[1].sourceRange.offset);
  assert.deepEqual(run([example]), [0, { ok: true, issues: [] }]);
});

test("scene check suggests complete endpoint values from usable instances and anchors", () => {
  const doc = reducer();
  doc.attachments[0].from = "samll-pipe#end";
  doc.attachments[0].to = "reducer#inlte";
  const [status, report] = run(["-", "--source-ranges"], JSON.stringify(doc, null, 2));
  assert.equal(status, 2);
  assert.deepEqual(report.issues.map(issue => [issue.code, issue.path, issue.suggestedValues, issue.sourceRange.matchedPath]), [
    ["SCENE_INSTANCE_MISSING", "/attachments/0/from", ["small-pipe#end"], "/attachments/0/from"],
    ["SCENE_ANCHOR_MISSING", "/attachments/0/to", ["reducer#inlet"], "/attachments/0/to"],
  ]);
  const unusable = structuredClone(doc);
  unusable.instances.push(structuredClone(unusable.instances[0]));
  unusable.attachments[1].from = "reudcer#start";
  unusable.attachments[1].to = "large-pipe#zz";
  const issues = checkScene(unusable, registry).issues;
  for (const path of ["/attachments/0/from", "/attachments/1/from", "/attachments/1/to"]) {
    assert.equal(issues.find(issue => issue.path === path).suggestedValues, undefined);
  }
  doc.attachments[0].from = report.issues[0].suggestedValues[0];
  doc.attachments[0].to = report.issues[1].suggestedValues[0];
  assert.deepEqual(run(["-"], JSON.stringify(doc)), [0, { ok: true, issues: [] }]);
});

test("optional connections return warnings with exit code zero and locate the contract in a source file", t => {
  const doc = reducer();
  doc.attachments[1].contract.required = false;
  doc.instances[2].parameters.diameter = 0.025;
  const [status, result] = run(["-"], JSON.stringify(doc));
  assert.equal(status, 0);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues.map(i => [i.code, i.level]), [["SCENE_CONNECTION_DIAMETER_MISMATCH", "warning"]]);
  const folder = mkdtempSync(join(tmpdir(), "agentscene-check-source-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const source = JSON.stringify(doc, null, 2);
  writeFileSync(file, source, "utf8");
  const [rangedStatus, ranged] = run([file, "--source-ranges"]);
  assert.equal(rangedStatus, 0);
  assert.equal(ranged.ok, true);
  assert.equal(ranged.issues.length, 1);
  const [{ sourceRange, ...issue }] = ranged.issues;
  assert.deepEqual(issue, result.issues[0]);
  assert.equal(sourceRange.matchedPath, "/attachments/1/contract/outsideDiameter");
  assert.equal(sourceRange.offset, source.lastIndexOf('"equal"'));
  assert.equal(source.slice(sourceRange.offset, sourceRange.offset + sourceRange.length), '"equal"');
  const prefix = source.slice(0, sourceRange.offset).split("\n");
  assert.deepEqual([sourceRange.line, sourceRange.column, sourceRange.endLine, sourceRange.endColumn],
    [prefix.length, prefix.at(-1).length + 1, prefix.length, prefix.at(-1).length + 8]);
  assert.equal(readFileSync(file, "utf8"), source);

  const malformed = '{\n  "instances": []\n  "attachments": [{ "from" "a#pin", "to": "b#pin" }],\n}';
  writeFileSync(file, malformed, "utf8");
  const [badStatus, bad] = run([file, "--source-ranges"]);
  assert.equal(badStatus, 2);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.issues.map(i => [i.level, i.code, i.syntaxCode, i.path, i.sourceRange.line]), [
    ["error", "JSON_INVALID", "CommaExpected", "", 3],
    ["error", "JSON_INVALID", "ColonExpected", "", 3],
    ["error", "JSON_INVALID", "TrailingComma", "", 3],
  ]);
  assert.deepEqual(bad.issues.map(i => i.fix.text), [",", ":", ""]);
  assert.equal(readFileSync(file, "utf8"), malformed);
});

test("scene check optionally rejects duplicate keys before the last value can hide them", t => {
  const folder = mkdtempSync(join(tmpdir(), "agentscene-duplicate-keys-"));
  const file = join(folder, "scene.json");
  t.after(() => { rmSync(file, { force: true }); rmdirSync(folder); });
  const text = String.raw`{
  "instances": [{
    "id": "pipe", "component": "mep.pipe-run",
    "parameters": { "path": [[0, 0, 0], [1, 0, 0]], "diameter": -1, "diam\u0065ter": 0.05 }
  }]
}`;
  writeFileSync(file, text, "utf8");
  assert.deepEqual(run([file, "--source-ranges"]), [0, { ok: true, issues: [] }]);
  const [status, report] = run(["--reject-duplicate-keys", file]);
  assert.equal(status, 2);
  assert.equal(report.ok, false);
  assert.equal(report.issues.length, 1);
  const [issue] = report.issues;
  assert.deepEqual([issue.code, issue.level, issue.path, issue.key],
    ["JSON_KEY_DUPLICATE", "error", "/instances/0/parameters/diameter", "diameter"]);
  assert.equal(issue.sourceRange, undefined);
  assert.equal(issue.firstSourceRange, undefined);
  const [rangedStatus, ranged] = run([file, "--reject-duplicate-keys", "--source-ranges"]);
  assert.equal(rangedStatus, 2);
  assert.equal(ranged.issues.length, 1);
  const [{ sourceRange, firstSourceRange, ...rangedIssue }] = ranged.issues;
  assert.deepEqual(rangedIssue, issue);
  assert.deepEqual([firstSourceRange.offset, firstSourceRange.length, firstSourceRange.line], [text.indexOf('"diameter"'), 10, 4]);
  assert.deepEqual([sourceRange.offset, sourceRange.length, sourceRange.line], [text.indexOf(String.raw`"diam\u0065ter"`), 15, 4]);
  assert.equal(readFileSync(file, "utf8"), text);
  const [malformedStatus, malformed] = run(["-", "--reject-duplicate-keys", "--source-ranges"], text.slice(0, -1));
  assert.equal(malformedStatus, 2);
  assert.deepEqual(malformed.issues.map(i => i.code), ["JSON_INVALID"]);
});

test("a misspelled attachment type cannot hide independent endpoint errors", () => {
  const doc = reducer();
  Object.assign(doc.attachments[1], { type: "attachement", to: "large-pipe#typo" });
  assert.deepEqual(checkScene(doc, registry).issues.map(i => i.path), ["/attachments/1/type", "/attachments/1/to"]);
  assert.throws(() => composeScene(doc, registry), /type/);
  doc.relations = [{ type: "supports", from: "floor", to: "leg" }];
  delete doc.attachments;
  assert.equal(checkScene(doc, registry).ok, true);
});

test("local attachment diagnostics point into raw, wrapped, registry and scene inputs", () => {
  const model = joint();
  assert.deepEqual(checkComposition(model), { ok: true, issues: [] });
  Object.assign(model.parameters.attachments[0], { type: "attachement", from: "missing", to: "typo" });
  for (const [report, prefix] of [
    [checkComposition({ ...model.parameters, id: model.id }), ""],
    [checkComposition(model), "/parameters"],
    [checkComposition({ kind: "composition", editor: { document: model } }), "/editor/document/parameters"],
    [checkScene({ instances: [model] }, registry), "/instances/0/parameters"],
  ]) {
    assert.equal(report.ok, false);
    assert.deepEqual(report.issues.map(i => i.path), ["type", "from", "to"].map(field => prefix + "/attachments/0/" + field));
  }
  assert.throws(() => registry.build(model), /attachments/);
});

test("scene check reuses nested diagnostics and keeps valid anchors on independent branches", () => {
  const doc = reducer();
  doc.instances[1].parameters.nodes.push({ id: "bad", parent: "absent" });
  doc.instances[1].parameters.anchors["/~"] = { node: "bad", position: [0, 0, 0] };
  doc.instances[2].parameters.diameter = 0.025;
  doc.relations = [{ type: "connects", from: "reducer#/~", to: "large-pipe#start" }];
  const original = structuredClone(doc);
  const result = checkScene(doc, registry);
  assert.deepEqual(result.issues.map(i => i.code), ["PARENT_MISSING", "SCENE_CONNECTION_DIAMETER_MISMATCH"]);
  const nested = result.issues[0];
  assert.deepEqual([nested.instanceId, nested.nodeId, nested.path], ["reducer", "bad", "/instances/1/parameters/nodes/1/parent"]);
  assert.deepEqual(doc, original);
  const model = { id: "frame", component: "core.composition", parameters: {
    nodes: [{ id: "port" }, { id: "port" }, { id: "bracket", parent: "port" }],
  } };
  const nestedPaths = checkScene({ instances: [model] }, registry).issues.map(issue =>
    [issue.instanceId, issue.path, issue.relatedLocations.map(location => location.path)]);
  const nodesPath = "/instances/0/parameters/nodes";
  assert.deepEqual(nestedPaths, [
    ["frame", nodesPath + "/1/id", [nodesPath + "/0/id"]],
    ["frame", nodesPath + "/2/parent", [nodesPath + "/0/id", nodesPath + "/1/id"]],
  ]);
});

test("local connection contracts use world positions and respect optional severity", () => {
  const model = joint();
  const jointContract = model.parameters.attachments[0].contract;
  model.parameters.anchors["moving-inlet"].position[0] = 0.01;
  model.transform = { scale: [2, 1, 1] };
  jointContract.gapTolerance = 0.015;
  jointContract.embed = 0;
  const required = checkComposition(model);
  assert.equal(required.ok, false);
  const expected = { space: "world", unit: "meter", fromPoint: [0,1,0], toPoint: [0.02,1,0],
    gap: 0.02, effectiveGap: 0.02, embed: 0, gapTolerance: 0.015 };
  assert.deepEqual(required.issues[0].measurement, expected);
  assert.throws(() => registry.build(model), error => {
    assert.deepEqual(error.measurement, expected);
    return error.code === "SCENE_CONNECTION_GAP";
  });
  jointContract.required = false;
  for (const report of [checkComposition(model), checkScene({ instances: [model] }, registry)]) {
    assert.equal(report.ok, true);
    assert.deepEqual(report.issues.map(i => [i.code, i.level]), [["SCENE_CONNECTION_GAP", "warning"]]);
    assert.deepEqual(report.issues[0].measurement, expected);
  }
  assert.equal(registry.build(model).warnings[0].level, "warning");
  assert.deepEqual(registry.build(model).warnings[0].measurement, expected);
  model.transform.scale = [1, 1, 1];
  assert.deepEqual(checkComposition(model), { ok: true, issues: [] });
});

test("malformed references and contract fields are checked independently, including legacy tolerance", () => {
  const doc = reducer();
  doc.relations = [{ id: "joint", type: "connects", from: "oops", to: "missing#port", tolerance: -1,
    contract: { angularTolerance: 4, diameterTolerance: -1 } }];
  doc.attachments[0].contract.direction = "invalid";
  const { issues } = checkScene(doc, registry);
  const paths = issues.filter(i => i.relationId === "joint").map(i => i.path);
  assert.deepEqual(paths, ["from", "to", "tolerance", "contract/angularTolerance", "contract/diameterTolerance"].map(p => "/relations/0/" + p));
  assert.equal(issues.at(-1).path, "/attachments/0/contract/direction");
});

test("scene check diagnoses unreadable input, invalid containers and failed native instances", () => {
  for (const [args, input, code] of [[[], "", "INPUT_REQUIRED"], [["-"], "{", "JSON_INVALID"], [[example + ".missing"], "", "FILE_UNREADABLE"]]) {
    const [status, result] = run(args, input);
    assert.equal(status, 2);
    assert.equal(result.issues[0].code, code);
    assert.equal(result.issues[0].path, "");
  }
  assert.equal(checkScene(null, registry).ok, false);
  assert.deepEqual(checkScene({ instances: {}, attachments: 1 }, registry).issues.map(i => i.path), ["/instances", "/attachments"]);
  const doc = reducer();
  doc.instances[0].parameters.diameter = 0;
  doc.instances.push({ id: "other", component: "missing" });
  assert.deepEqual(checkScene(doc, registry).issues.map(i => i.path), ["/instances/0/parameters/diameter", "/instances/3/component"]);
});

test("built-in components report independent parameter and transform errors in one pass", () => {
  const { issues } = checkScene({ instances: [
    { id: "pipe", component: "mep.pipe-run", transform: { rotation: [] }, parameters: { path: [[0], [0, "x", 0]], diameter: -1 } },
    { id: "footing", component: "construction.independent-foundation", parameters: { height: -1, rebarSpacing: 0, columnWidth: 10 } },
  ] }, registry);
  assert.deepEqual(issues.map(i => [i.instanceId, i.path]), [
    ["pipe", "/instances/0/transform/rotation"], ["pipe", "/instances/0/parameters/path/0"],
    ["pipe", "/instances/0/parameters/path/1/1"], ["pipe", "/instances/0/parameters/diameter"],
    ["footing", "/instances/1/parameters/height"], ["footing", "/instances/1/parameters/rebarSpacing"],
    ["footing", "/instances/1/parameters/columnWidth"],
  ]);
});
