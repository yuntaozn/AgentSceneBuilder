import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run } from "../packages/cli/src/agentscene.mjs";
import { applyChangesetProposal, composeScene, createDefaultRegistry, proposeAnchorAlignment, proposeLinearDistribution } from "../packages/core/src/index.js";

const example = fileURLToPath(new URL("../examples/digital-modeling/alignment-source.json", import.meta.url));
const scene = () => JSON.parse(readFileSync(example, "utf8"));
const build = doc => composeScene(doc, createDefaultRegistry());
const align = doc => proposeAnchorAlignment(build(doc), { instanceId: "pipe-b", source: "pipe-b#start", target: "pipe-a#end" });

test("scene proposal rejects a stale rotation and identifies the target in the CLI", () => {
  const doc = scene();
  doc.instances[1].transform.rotation = [0, 0.5, 0];
  const proposal = align(doc);
  let output = "";
  const status = run(["scene", "apply-proposal", example, JSON.stringify({ proposal })], { stdout: { write: chunk => { output += chunk; } } });
  const { error } = JSON.parse(output);
  assert.equal(status, 2);
  assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
  const [conflict] = error.conflicts;
  assert.equal(conflict.instanceId, "pipe-b");
  assert.equal(conflict.path, "/instances/1/transform");
  assert.equal(conflict.reason, "transform-changed");
  assert.deepEqual(conflict.expected.rotation, [0, 0.5, 0]);
  assert.deepEqual(conflict.actual.rotation, [0, 0, 0]);
});

test("scene proposal preserves unrelated edits, defaults and revision on retry", () => {
  const doc = scene();
  const proposal = align(doc);
  doc.instances[0].notes = "keep";
  doc.revision++;
  const result = applyChangesetProposal(doc, proposal);
  assert.equal(result.instances[0].notes, "keep");
  assert.equal(result.revision, doc.revision + 1);
  assert.deepEqual(result.instances[1].transform.position, [2, 0, 0]);
  assert.deepEqual(applyChangesetProposal(result, proposal), result);
  assert.deepEqual(applyChangesetProposal(result, { ...proposal, applied: true }), result);
  assert.throws(() => applyChangesetProposal(doc, { ...proposal, applied: true }), /already marked as applied/);
  assert.deepEqual(doc.instances[1].transform, { position: [5, 1, 0] });
});

test("an alignment proposal detects stale anchor positions, even on retry", () => {
  const doc = scene();
  const proposal = align(doc);
  const moved = applyChangesetProposal(doc, proposal);
  for (const input of [doc, moved]) {
    input.instances[0].parameters.path[1][0] = 3;
    const original = structuredClone(input);
    assert.throws(() => applyChangesetProposal(input, proposal), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      const conflict = error.conflicts.find(item => item.reference === "pipe-a#end");
      assert.deepEqual(conflict.expected, [2, 0, 0]);
      assert.deepEqual(conflict.actual, [3, 0, 0]);
      return true;
    });
    assert.deepEqual(input, original);
  }
});

test("a source belongs to the moving instance and is rechecked for a fixed target point", () => {
  const doc = scene();
  assert.throws(() => proposeAnchorAlignment(build(doc), {
    instanceId: "pipe-b", source: "pipe-a#start", target: "pipe-a#end",
  }), /source/i);
  const proposal = proposeAnchorAlignment(build(doc), { instanceId: "pipe-b", sourceAnchor: "start", targetPoint: [2, 0, 0] });
  doc.instances[0].parameters.path[1][0] = 3;
  const result = applyChangesetProposal(doc, proposal);
  assert.deepEqual(applyChangesetProposal(result, proposal), result);
  doc.instances[1].parameters.path[0][1] = 0.5;
  assert.throws(() => applyChangesetProposal(doc, proposal), error => error.conflicts.some(item => item.reference === "pipe-b#start"));
});

test("alignment compares the landing to the live named target when both anchors drift within tolerance", () => {
  const doc = scene();
  const proposal = align(doc);
  const placed = applyChangesetProposal(doc, proposal);
  for (const input of [doc, placed]) {
    input.instances[0].parameters.path[1][1] = -7.5e-10;
    input.instances[1].parameters.path[0][1] = 7.5e-10;
    assert.throws(() => applyChangesetProposal(input, proposal), error => {
      const [conflict] = error.conflicts;
      assert.equal(conflict.reason, "alignment-target-missed");
      assert.deepEqual(conflict.measurement.expected, [2, -7.5e-10, 0]);
      assert.deepEqual(conflict.measurement.actual, [2, 7.5e-10, 0]);
      assert.equal(conflict.measurement.gap, 1.5e-9);
      return true;
    });
  }
  const corrected = applyChangesetProposal(doc, align(doc));
  const rebuilt = build(corrected);
  assert.deepEqual(rebuilt.instances[1].anchors.world.start, rebuilt.instances[0].anchors.world.end);
});

test("alignment rebuilds a pose-dependent source using its input parameters on proposal, apply and retry", () => {
  const registry = createDefaultRegistry().register({
    id: "test.follower", title: "Follower", version: "1",
    build({ transform, parameters }) {
      return { nodes: [], parameters: { derivedOffset: parameters.offset },
        anchors: { pin: [parameters.offset, transform.position[0], 0] } };
    },
  });
  const doc = { revision: 2, instances: [{ id: "slide", component: "test.follower", parameters: { offset: 0.25 } }] };
  const request = { instanceId: "slide", sourceAnchor: "pin", targetPoint: [1.25, 0, 0] };
  const composed = composeScene(doc, registry);
  assert.throws(() => proposeAnchorAlignment(composed, request, registry), error => {
    assert.equal(error.code, "SCENE_ALIGNMENT_TARGET_MISSED");
    assert.deepEqual(error.measurement.actual, [1.25, 1, 0]);
    return true;
  });
  const rigidProposal = proposeAnchorAlignment(composed, request);
  assert.throws(() => applyChangesetProposal(doc, rigidProposal, registry), error => {
    const [conflict] = error.conflicts;
    assert.equal(conflict.reason, "alignment-target-missed");
    assert.deepEqual(conflict.measurement.actual, [1.25, 1, 0]);
    return true;
  });
  assert.equal(doc.revision, 2);
  doc.instances[0].transform = { scale: [1, 0, 1] };
  const reachable = proposeAnchorAlignment(composeScene(doc, registry), request, registry);
  const applied = applyChangesetProposal(doc, reachable, registry);
  assert.deepEqual(composeScene(applied, registry).instances[0].anchors.world.pin, request.targetPoint);
  assert.equal(applied.revision, 3);
  assert.deepEqual(applyChangesetProposal(applied, reachable, registry), applied);
});

test("batch distribution applies remaining targets once and reports conflicts atomically", () => {
  const doc = scene();
  const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["pipe-a", "pipe-b"], axis: "x", start: 12 });
  doc.instances[0].transform = proposal.changes[0].after;
  const applied = applyChangesetProposal(doc, proposal);
  assert.deepEqual(applied.instances[1].transform, proposal.changes[1].after);
  assert.equal(applied.revision, 4);
  assert.deepEqual(applyChangesetProposal(applied, proposal), applied);

  const edited = scene();
  edited.instances[1].transform.rotation = [0, 0.5, 0];
  const before = structuredClone(edited);
  assert.throws(() => applyChangesetProposal(edited, proposal), error => error.conflicts[0].instanceId === "pipe-b");
  assert.deepEqual(edited, before);
  edited.instances.pop();
  assert.throws(() => applyChangesetProposal(edited, proposal), error => error.conflicts[0].reason === "instance-missing");
});

test("missing, ambiguous or unbuildable anchor owners return structured conflicts", () => {
  const original = scene();
  const proposal = align(original);
  for (const [edit, reason] of [
    [doc => doc.instances.shift(), "instance-missing"],
    [doc => doc.instances.push(structuredClone(doc.instances[0])), "instance-ambiguous"],
    [doc => { doc.instances[0].component = "unknown"; }, "anchor-unavailable"],
    [doc => { doc.instances[0] = { id: "pipe-a", component: "core.composition", parameters: { nodes: [] } }; }, "anchor-missing"],
  ]) {
    const edited = structuredClone(original);
    edit(edited);
    assert.throws(() => applyChangesetProposal(edited, proposal), error =>
      error.code === "SCENE_PROPOSAL_CONFLICT" && error.conflicts.some(c => c.reference === "pipe-a#end" && c.reason === reason));
  }
  delete proposal.alignmentAnchors;
  assert.throws(() => applyChangesetProposal(original, proposal), error => error.conflicts[0].reason === "alignment-references-missing");
});

test("only edits that move an alignment anchor invalidate its geometric precondition", () => {
  const doc = scene();
  const proposal = align(doc);
  doc.instances[0].parameters.path[0][1] = -0.5; // opposite end of target pipe
  doc.instances[1].parameters.path[1][2] = 0.75; // opposite end of moving pipe
  const result = build(applyChangesetProposal(doc, proposal));
  assert.deepEqual(result.instances[1].anchors.world.start, result.instances[0].anchors.world.end);
});

test("replaying a sequence of transforms for one instance preserves the final revision", () => {
  const doc = scene();
  const p = align(doc);
  const first = p.changes[0];
  p.changes.push({ ...first, before: first.after, after: { ...first.after, position: [3, 0, 0] } });
  const updated = applyChangesetProposal(doc, p);
  assert.deepEqual(updated.instances[1].transform.position, [3, 0, 0]);
  assert.deepEqual(applyChangesetProposal(updated, p), updated);
});

test("a missing precondition cannot overwrite an edit or prevent an already completed retry", () => {
  const doc = scene();
  const p = align(doc);
  const updated = applyChangesetProposal(doc, p);
  delete p.changes[0].before;
  assert.throws(() => applyChangesetProposal(doc, p), error => error.conflicts[0].reason === "before-missing");
  assert.deepEqual(applyChangesetProposal(updated, p), updated);
});

test("a chained proposal reports all pending precondition errors and can resume past an omitted completed precondition", () => {
  const doc = scene();
  const p = align(doc);
  const first = p.changes[0];
  const partial = applyChangesetProposal(doc, p);
  p.changes.push({ ...first, before: { rotation: [false, null, 0] }, after: { position: [3, 0, 0] } });
  delete first.before;
  const snapshot = structuredClone(doc);
  assert.throws(() => applyChangesetProposal(doc, p), e => {
    assert.deepEqual(e.conflicts.map(c => c.path), ["/changes/0/before", "/changes/1/before/rotation/0", "/changes/1/before/rotation/1"]);
    assert.equal(e.conflicts[0].scenePath, "/instances/1/transform");
    return true;
  });
  assert.deepEqual(doc, snapshot);
  assert.throws(() => applyChangesetProposal(partial, p), e =>
    e.conflicts.length === 2 && e.conflicts.every(c => c.path.startsWith("/changes/1/before/")));
  p.changes[1].before = first.after;
  const placed = applyChangesetProposal(partial, p);
  assert.equal(placed.revision, partial.revision + 1);
  assert.deepEqual(applyChangesetProposal(placed, p), placed);
});

test("malformed anchor evidence reports both roles and still checks a valid target snapshot", () => {
  const doc = scene(), p = align(doc);
  p.changes.push(null);
  p.alignmentAnchors.source.reference = "broken";
  p.alignmentAnchors.source.position = [null, false, 0];
  p.alignmentAnchors.target.position[1] = "bad";
  const fails = paths => assert.throws(() => applyChangesetProposal(doc, p), e => {
    assert.equal(e.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(e.conflicts.map(c => c.path), paths);
    return true;
  });
  const sourceErrors = ["/changes/1", "/alignmentAnchors/source/reference", "/alignmentAnchors/source/position/0", "/alignmentAnchors/source/position/1"];
  fails([...sourceErrors, "/alignmentAnchors/target/position/1"]);
  p.alignmentAnchors.target.position[1] = 0;
  doc.instances[0].parameters.path[1][0] = 3;
  fails([...sourceErrors, "/instances/0"]);
});

test("a later malformed change preserves an earlier stale precondition on the same instance", () => {
  const doc = scene(), p = align(doc);
  const first = p.changes[0];
  p.changes.push({ ...first, before: first.after, after: null });
  doc.instances[1].transform.position[0] += 1;
  assert.throws(() => applyChangesetProposal(doc, p), e => {
    assert.deepEqual(e.conflicts.map(c => [c.reason, c.path]), [
      ["after-missing", "/changes/1/after"], ["transform-changed", "/instances/1/transform"],
    ]);
    return true;
  });
});

function chain() {
  const pipe = (id, start, diameter) => ({
    id, component: "mep.pipe-run", parameters: { diameter, path: [[start,0,0], [start+1,0,0]] },
  });
  return {
    instances: [pipe("pipe-a",0,0.05), pipe("pipe-b",2,0.075), pipe("pipe-c",3,0.075)],
    relations: [{ id: "ab", type: "connects", from: "pipe-a#end", to: "pipe-b#start", contract: { outsideDiameter: "equal" } }],
    attachments: [{ from: "pipe-b#end", to: "pipe-c#start" }],
  };
}

test("alignment reports residual failures, optional joints and both endpoints moving in the same frame", () => {
  const doc = chain();
  doc.attachments[0].required = false;
  doc.attachments.push({ id: "internal", from: "pipe-b#start", to: "pipe-b#end", tolerance: 1 });
  doc.relations.push({ type: "supports", from: "pipe-b#end", to: "pipe-a#end" });
  const snapshot = structuredClone(doc);
  const p = align(doc);
  const [ab, bc, internal] = p.facts.connectionImpact;
  assert.deepEqual(doc, snapshot);
  assert.equal(p.facts.connectionImpact.length, 3);
  assert.deepEqual(ab.before.issues.map(i => i.code), ["SCENE_CONNECTION_GAP", "SCENE_CONNECTION_DIAMETER_MISMATCH"]);
  assert.equal(ab.after.gap, 0);
  assert.equal(ab.after.connected, false);
  assert.deepEqual(ab.after.issues.map(i => i.code), ["SCENE_CONNECTION_DIAMETER_MISMATCH"]);
  assert.equal(bc.required, false);
  assert.equal(bc.after.issues[0].level, "warning");
  assert.deepEqual(internal.before, internal.after);
  delete doc.attachments[0].required;
  assert.throws(() => applyChangesetProposal(doc, p), e => e.conflicts[0].path === "/attachments/0");
});

test("revalidation handles anonymous duplicates, reordered declarations and new optional or unrelated edits", () => {
  const doc = chain();
  const p = align(doc);
  const bc = doc.attachments[0];
  doc.attachments.unshift({ ...bc, required: false }, { from: "pipe-a#start", to: "pipe-c#end" });
  doc.instances.push({ id: "unused", component: "unknown" });
  const applied = applyChangesetProposal(doc, p);
  assert.equal(applied.revision, 1);
  assert.deepEqual(applyChangesetProposal(applied, p), applied);
  doc.attachments.push(structuredClone(bc));
  const before = structuredClone(doc);
  assert.throws(() => applyChangesetProposal(doc, p), error => {
    assert.deepEqual(error.conflicts.map(c => [c.path, c.reason]), [["/attachments/3", "required-connection-disconnected"]]);
    return true;
  });
  assert.deepEqual(doc, before);
  doc.attachments.pop();
  doc.attachments[2] = { ...bc, contract: { gapTolerance: 2 } };
  doc.attachments.push({ ...bc, contract: { gapTolerance: 0.5 } });
  assert.throws(() => applyChangesetProposal(doc, p), error => error.conflicts[0].path === "/attachments/3");
});

test("older alignment proposals can apply unless they would break an unreviewed required joint", () => {
  const doc = chain();
  const p = align(doc);
  delete p.facts.connectionImpact;
  assert.throws(() => applyChangesetProposal(doc, p), error => error.conflicts[0].after.gap === 1);
  doc.attachments[0].required = false;
  assert.equal(applyChangesetProposal(doc, p).revision, 1);
  doc.attachments[0] = { from: "pipe-b#end", to: "pipe-c#missing" };
  assert.throws(() => applyChangesetProposal(doc, p), error => error.conflicts[0].reason === "connection-unavailable");
});

test("malformed connection rows return per-field diagnostics while other reviewed repairs are checked", () => {
  const doc = chain();
  doc.instances[1].parameters.diameter = 0.05;
  const p = align(doc);
  doc.instances[0].parameters.diameter = 0.075;
  const row = p.facts.connectionImpact[1];
  row.path = "/attachments/not-an-index";
  row.from = "missing-anchor-name";
  row.required = false;
  delete row.contract.embed;
  row.contract.gapTolerance = -1;
  row.before.connected = false; // Contradicts the empty list of issues.
  row.after.issues = [null];
  row.after.gap = "1";
  row.after.effectiveGap = -1;
  p.facts.connectionImpact.push(null);
  assert.throws(() => applyChangesetProposal(doc, p), e => {
    assert.equal(e.code, "SCENE_PROPOSAL_CONFLICT");
    const fields = e.conflicts.filter(c => c.source === "proposal");
    assert.deepEqual(fields.map(c => c.path).sort(), [
      "1/path", "1/from", "1/required", "1/contract/embed", "1/contract/gapTolerance", "1/before/connected",
      "1/after/gap", "1/after/effectiveGap", "1/after/issues/0", "2",
    ].map(field => "/facts/connectionImpact/" + field).sort());
    assert.ok(fields.every(c => c.reason === "connection-preview-invalid"));
    const [repair, loss] = e.conflicts.filter(c => c.source !== "proposal");
    assert.deepEqual([repair.reason, repair.after.issues[0].measurement.difference], ["required-connection-not-restored", 0.025]);
    assert.deepEqual([loss.reason, loss.after.gap], ["required-connection-disconnected", 1]);
    return true;
  });
});

test("gap review distinguishes a damaged summary, measurement and pair of endpoints", () => {
  const doc = chain();
  doc.attachments[0].contract = { embed: 0.08, gapTolerance: 0.02 };
  const original = align(doc);
  const phasePath = "/facts/connectionImpact/1/after";
  const detail = "/issues/0/measurement";
  const cases = [
    [(state) => { state.gap = 0.5; }, [["/gap", 1, 0.5]]],
    [(_, m) => { m.gap = 0.5; }, [[detail + "/gap", 1, 0.5]]],
    [(_, m) => { m.toPoint[0] += 0.5; }, [[detail, 1, 1.5]]],
    [(state, m) => {
      state.effectiveGap = 0;
      m.toPoint[1] = "bad";
      Object.assign(m, { space: "local", unit: "mm", embed: 0, gapTolerance: 2 });
    }, [
      [detail + "/toPoint/1", undefined, undefined], [detail + "/space", "world", "local"],
      [detail + "/unit", "meter", "mm"], [detail + "/embed", 0.08, 0],
      [detail + "/gapTolerance", 0.02, 2], ["/effectiveGap", 0.92, 0],
    ]],
    [(state) => { state.issues.push(structuredClone(state.issues[0])); }, [["/issues/1/code", undefined, undefined]]],
  ];
  for (const [edit, expected] of cases) {
    const proposal = structuredClone(original);
    const phase = proposal.facts.connectionImpact[1].after;
    edit(phase, phase.issues[0].measurement);
    assert.throws(() => applyChangesetProposal(doc, proposal), error => {
      const fields = error.conflicts.filter(c => c.source === "proposal");
      assert.ok(fields.every(c => c.reason === "connection-preview-invalid" && c.instanceId === "pipe-b"));
      assert.deepEqual(fields.map(c => [c.path, c.expected, c.actual]), expected.map(([key, ...values]) => [phasePath + key, ...values]));
      const live = error.conflicts.filter(c => c.source !== "proposal");
      assert.deepEqual(live.map(c => [c.path, c.reason]), [["/attachments/0", "required-connection-disconnected"]]);
      return true;
    });
  }
  const placed = applyChangesetProposal(doc, original);
  assert.deepEqual(applyChangesetProposal(placed, original), placed);
});

test("gap reviews accept a diagonal gap at the embed and tolerance limit and distinguish tiny separations", () => {
  const doc = {
    instances: [["a", [10000, -10000, 1e15]], ["b", [10000.003, -9999.996, 1e15]]].map(([id, pin]) => ({
      id, component: "core.composition", parameters: { nodes: [], anchors: { pin } },
    })),
    attachments: [{ from: "a#pin", to: "b#pin", contract: { embed: 0.003, gapTolerance: 0 } }],
  };
  const propose = () => proposeAnchorAlignment(build(doc), { instanceId: "b", sourceAnchor: "pin", target: "a#pin" });
  const issue = propose().facts.connectionImpact[0].before.issues[0];
  doc.attachments[0].contract.gapTolerance = 0.002;
  const boundary = propose();
  const before = boundary.facts.connectionImpact[0].before;
  assert.deepEqual([before.gap, before.effectiveGap, before.connected], [0.005, 0.002, true]);
  const placed = applyChangesetProposal(doc, boundary);
  assert.deepEqual(applyChangesetProposal(placed, boundary), placed);
  issue.measurement.gapTolerance = 0.002;
  before.issues.push(issue);
  before.connected = false;
  assert.throws(() => applyChangesetProposal(doc, boundary), error => {
    assert.deepEqual(error.conflicts.map(c => c.path), ["connected", "issues/0/code"].map(s => "/facts/connectionImpact/0/before/" + s));
    assert.equal(error.conflicts[0].expected, true);
    return true;
  });

  doc.instances[0].parameters.anchors.pin = [0, 0, 0];
  doc.instances[1].parameters.anchors.pin = [1e-15, 0, 0];
  doc.attachments[0].contract = { embed: 0, gapTolerance: 0 };
  const tiny = propose();
  const measurement = tiny.facts.connectionImpact[0].before.issues[0].measurement;
  assert.equal(measurement.gap, 1e-15);
  measurement.toPoint = [...measurement.fromPoint];
  assert.throws(() => applyChangesetProposal(doc, tiny), error => {
    assert.deepEqual(error.conflicts.map(c => [c.path, c.expected, c.actual]), [
      ["/facts/connectionImpact/0/before/issues/0/measurement", 1e-15, 0],
    ]);
    return true;
  });
});

test("port review reports independent field errors in both phases using the resolved contract", () => {
  const doc = chain();
  Object.assign(doc.relations[0].contract, { direction: "aligned", angularTolerance: 0.1, diameterTolerance: 0.001 });
  const original = align(doc);
  const p = structuredClone(original);
  const row = p.facts.connectionImpact[0];
  const direction = row.before.issues[1].measurement;
  Object.assign(direction, { space: "local", unit: "degree", angle: 0, deviation: 0, direction: "opposed", angularTolerance: 0.5,
    toDirection: [0, -1, 0] });
  const diameter = row.after.issues[1].measurement;
  Object.assign(diameter, { unit: "mm", from: 0.06, difference: 0, diameterTolerance: 0.1 });
  assert.throws(() => applyChangesetProposal(doc, p), error => {
    const fields = error.conflicts;
    assert.ok(fields.every(c => c.reason === "connection-preview-invalid" && c.instanceId === "pipe-b"));
    assert.deepEqual(fields.map(c => [c.path, c.expected, c.actual]), [
      ["before", "space", "world", "local"], ["before", "unit", "radian", "degree"],
      ["before", "direction", "aligned", "opposed"], ["before", "angularTolerance", 0.1, 0.5],
      ["before", "toDirection", [-1, 0, 0], [0, -1, 0]],
      ["before", "angle", Math.PI, 0], ["before", "deviation", Math.PI, 0],
      ["after", "unit", "meter", "mm"], ["after", "diameterTolerance", 0.001, 0.1],
      ["after", "from", 0.05, 0.06], ["after", "difference", 0.025, 0],
    ].map(([phase, key, ...values]) => [`/facts/connectionImpact/0/${phase}/issues/1/measurement/${key}`, ...values]));
    return true;
  });
  const applied = applyChangesetProposal(doc, original);
  assert.deepEqual(applyChangesetProposal(applied, original), applied);
});

test("legacy port issue details still distinguish missing data from a mismatch, and tolerance remains inclusive", () => {
  const doc = chain();
  Object.assign(doc.relations[0].contract, { direction: "opposed", diameterTolerance: 0.024 });
  const original = align(doc);
  const legacy = structuredClone(original);
  for (const phase of ["before", "after"]) delete legacy.facts.connectionImpact[0][phase].portMeasurements;
  const legacyApplied = applyChangesetProposal(doc, legacy);
  assert.deepEqual(applyChangesetProposal(legacyApplied, legacy), legacyApplied);
  const prefix = "/facts/connectionImpact/0/after/issues/";
  const mismatch = "SCENE_CONNECTION_DIAMETER_MISMATCH";
  const unavailable = "SCENE_CONNECTION_DIAMETER_UNAVAILABLE";
  const cases = [
    [(issue) => { issue.measurement.from = null; }, [["0/measurement/difference", null], ["0/code", unavailable]]],
    [(issue) => { issue.code = unavailable; }, [["0/code", mismatch]]],
    [(issue) => { Object.assign(issue.measurement, { from: 0, to: -1 }); }, [["0/measurement/from"], ["0/measurement/to"]]],
    [(issue, issues) => { issues.push(structuredClone(issue)); }, [["1/code"]]],
    [(issue) => { issue.code = "SCENE_CONNECTION_DIAMETER_UNKNOWN"; }, [["0/code"]]],
  ];
  for (const [edit, paths] of cases) {
    const p = structuredClone(legacy);
    const issues = p.facts.connectionImpact[0].after.issues;
    edit(issues[0], issues);
    assert.throws(() => applyChangesetProposal(doc, p), error => {
      assert.deepEqual(error.conflicts.map(c => [c.path, c.expected]), paths.map(([path, expected]) => [prefix + path, expected]));
      return true;
    });
  }
  doc.relations[0].contract.diameterTolerance = 0.025;
  const atLimit = align(doc);
  const after = atLimit.facts.connectionImpact[0].after;
  assert.equal(after.connected, true);
  const applied = applyChangesetProposal(doc, atLimit);
  assert.deepEqual(applyChangesetProposal(applied, atLimit), applied);
  const issue = structuredClone(original.facts.connectionImpact[0].after.issues[0]);
  issue.measurement.diameterTolerance = 0.025;
  after.issues.push(issue);
  assert.throws(() => applyChangesetProposal(doc, atLimit), e =>
    e.conflicts.length === 1 && e.conflicts[0].path === prefix + "0/code" && e.conflicts[0].expected === null);
});

test("port measurements identify removed issues and malformed evidence even when the gap passes", () => {
  const doc = chain();
  Object.assign(doc.relations[0].contract, { direction: "aligned", diameterTolerance: 0.001 });
  const original = align(doc);
  const prefix = "/facts/connectionImpact/0/";
  const checks = [
    [(row) => { Object.assign(row.after, { connected: true, issues: [] }); }, [
      ["after/connected", false, true],
      ["after/issues", "SCENE_CONNECTION_DIRECTION", null],
      ["after/issues", "SCENE_CONNECTION_DIAMETER_MISMATCH", null],
    ]],
    [(row) => { delete row.before.portMeasurements; }, [["before/portMeasurements"]]],
    [(row) => {
      row.after.portMeasurements.direction.toDirection[1] = "invalid";
      delete row.after.portMeasurements.outsideDiameter.from;
    }, [["after/portMeasurements/direction/toDirection/1"], ["after/portMeasurements/outsideDiameter/from"]]],
  ];
  for (const [edit, expected] of checks) {
    const p = structuredClone(original);
    const [row] = p.facts.connectionImpact;
    assert.equal(row.after.gap, 0);
    assert.notEqual(row.after.portMeasurements.direction.toDirection, row.after.issues[0].measurement.toDirection);
    edit(row);
    assert.throws(() => applyChangesetProposal(doc, p), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.ok(error.conflicts.every(c => c.reason === "connection-preview-invalid" && c.instanceId === "pipe-b"));
      assert.deepEqual(error.conflicts.map(c => [c.path, c.expected, c.actual]),
        expected.map(([path, expectedValue, actualValue]) => [prefix + path, expectedValue, actualValue]));
      return true;
    });
  }
});

test("direction review round-trips extreme, absent and near-opposed port directions", () => {
  const pin = (id, x, direction) => ({ id, component: "core.composition", parameters: { nodes: [],
    anchors: { pin: { position: [x, 0, 0], direction } } } });
  const doc = { instances: [pin("a", 0, [1, 0, 0]), pin("b", 1, [0, 1, 0])], attachments: [{
    from: "a#pin", to: "b#pin", contract: { direction: "opposed", angularTolerance: 0, outsideDiameter: "equal", required: false },
  }] };
  for (const vector of [[0, 1e-310, 0], [0, 1.7e308, 1.7e308], undefined, [-1, 1e-12, 0]]) {
    doc.instances[1].parameters.anchors.pin.direction = vector;
    const p = JSON.parse(JSON.stringify(proposeAnchorAlignment(build(doc), { instanceId: "b", sourceAnchor: "pin", target: "a#pin" })));
    const [direction, diameter] = p.facts.connectionImpact[0].after.issues;
    const m = direction.measurement;
    assert.deepEqual([direction.code, diameter.code, diameter.measurement.difference],
      ["SCENE_CONNECTION_DIRECTION", "SCENE_CONNECTION_DIAMETER_UNAVAILABLE", null]);
    if (vector) {
      assert.ok(m.toDirection.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...m.toDirection) - 1) <= 1e-15);
      assert.equal(m.deviation, vector[0] === -1 ? Math.atan2(1e-12, 1) : Math.PI / 2);
    } else {
      assert.deepEqual([m.toDirection, m.angle, m.deviation], [null, null, null]);
    }
    const applied = applyChangesetProposal(doc, p);
    assert.deepEqual(applyChangesetProposal(applied, p), applied);
    m.deviation = 0;
    assert.throws(() => applyChangesetProposal(applied, p), error => {
      assert.deepEqual(error.conflicts.map(c => c.path), ["/facts/connectionImpact/0/after/issues/0/measurement/deviation"]);
      return true;
    });
  }
});

test("an absent legacy preview and an explicit malformed preview both remeasure live disconnections", () => {
  const doc = chain(), p = align(doc);
  delete p.facts.connectionImpact;
  assert.throws(() => applyChangesetProposal(doc, p), e =>
    e.conflicts.length === 1 && e.conflicts[0].reason === "required-connection-disconnected");
  for (const malformed of [null, {}]) {
    p.facts.connectionImpact = malformed;
    assert.throws(() => applyChangesetProposal(doc, p), e => {
      assert.deepEqual(e.conflicts.map(c => [c.path, c.reason]), [
        ["/facts/connectionImpact", "connection-preview-invalid"], ["/attachments/0", "required-connection-disconnected"],
      ]);
      return true;
    });
  }
});

test("an alignment reports a stale target, an unresolved repair and an independent disconnection", () => {
  const doc = chain();
  const proposal = align(doc);
  doc.instances[0].parameters.path[1][0] = 0.5;
  doc.attachments.push(structuredClone(doc.attachments[0]));
  const snapshot = structuredClone(doc);
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(error.conflicts.map(c => [c.path, c.reason]), [
      ["/instances/0", "anchor-moved"], ["/relations/0", "required-connection-issues-not-resolved"],
      ["/attachments/1", "required-connection-disconnected"],
    ]);
    assert.deepEqual(error.conflicts[0].actual, [0.5, 0, 0]);
    assert.deepEqual(error.conflicts[1].unresolvedIssueCodes, ["SCENE_CONNECTION_GAP"]);
    assert.equal(error.conflicts[1].after.gap, 0.5);
    assert.equal(error.conflicts[2].after.gap, 1);
    return true;
  });
  assert.deepEqual(doc, snapshot);
});

test("reviewed repairs survive declaration reordering and require each equivalent declaration", () => {
  const doc = chain();
  doc.instances[1].parameters.diameter = 0.05;
  delete doc.relations;
  const joint = { from: "pipe-a#end", to: "pipe-b#start", contract: { outsideDiameter: "equal" } };
  doc.attachments = [joint, structuredClone(joint)];
  const proposal = align(doc);
  doc.attachments.unshift({ ...joint, required: false });
  assert.equal(applyChangesetProposal(doc, proposal).revision, 1);
  doc.attachments[1].contract = { outsideDiameter: "equal", diameterTolerance: 0.001 };
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(error.conflicts.map(c => [c.reason, c.path, c.reviewedPath, c.from, c.to]),
      [["reviewed-connection-missing", "/attachments", "/attachments/1", joint.from, joint.to]]);
    return true;
  });
  doc.attachments[1].contract = { outsideDiameter: "equal" };
  const placed = applyChangesetProposal(doc, proposal);
  delete placed.attachments;
  assert.throws(() => applyChangesetProposal(placed, proposal), error => {
    assert.deepEqual(error.conflicts.map(c => c.reviewedPath), ["/attachments/0", "/attachments/1"]);
    return true;
  });
});

test("an optional repair is advisory and a legacy proposal has no recorded repair outcome", () => {
  const doc = chain();
  doc.instances[1].parameters.diameter = 0.05;
  doc.attachments = [];
  const legacy = align(doc);
  delete legacy.facts.connectionImpact;
  doc.relations[0].required = false;
  const optional = align(doc);
  doc.instances[0].parameters.diameter = 0.075;
  assert.equal(optional.facts.connectionImpact[0].after.connected, true);
  assert.equal(applyChangesetProposal(doc, optional).revision, 1);
  doc.relations[0].required = true;
  assert.equal(applyChangesetProposal(doc, legacy).revision, 1);
});

test("an issue present in both reviewed poses cannot be reintroduced by a different live move", () => {
  const registry = createDefaultRegistry().register({
    id: "test.moving-port", title: "Moving port", version: "1",
    build({ transform }) {
      return { nodes: [], anchors: { pin: {
        position: [0, 0, 0], direction: [1, 0, 0], outsideDiameter: transform.position[0] < 1 ? 0.05 : 0.075,
      } } };
    },
  });
  const fixedPort = { position: [0.5, 0, 0], direction: [0, 1, 0], outsideDiameter: 0.05 };
  const doc = {
    instances: [
      { id: "slide", component: "test.moving-port" },
      { id: "frame", component: "core.composition", parameters: { nodes: [], anchors: { pin: fixedPort } } },
    ],
    relations: [{ type: "connects", from: "slide#pin", to: "frame#pin", contract: { direction: "aligned", outsideDiameter: "equal" } }],
  };
  const propose = () => proposeAnchorAlignment(composeScene(doc, registry), {
    instanceId: "slide", sourceAnchor: "pin", targetPoint: [2, 0, 0],
  }, registry);
  const old = propose();
  const [reviewed] = old.facts.connectionImpact;
  const codes = state => state.issues.map(i => i.code);
  const gap = "SCENE_CONNECTION_GAP", direction = "SCENE_CONNECTION_DIRECTION", diameter = "SCENE_CONNECTION_DIAMETER_MISMATCH";
  assert.deepEqual([codes(reviewed.before), codes(reviewed.after)], [[gap, direction], [gap, direction, diameter]]);
  fixedPort.position[0] = 0;
  assert.throws(() => applyChangesetProposal(doc, old, registry), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(error.conflicts.length, 1);
    const [c] = error.conflicts;
    assert.deepEqual([c.path, c.reason, c.addedIssueCodes], ["/relations/0", "reviewed-disconnection-changed", [gap]]);
    assert.deepEqual([c.reviewedBefore, c.reviewedAfter], [reviewed.before, reviewed.after]);
    assert.deepEqual([codes(c.before), codes(c.after)], [[direction], [gap, direction, diameter]]);
    return true;
  });
  const fresh = propose();
  const placed = applyChangesetProposal(doc, fresh, registry);
  assert.deepEqual(applyChangesetProposal(placed, fresh, registry), placed);
});

test("pose-dependent ports report exceeded or unavailable reviewed measurements", () => {
  const registry = createDefaultRegistry().register({
    id: "test.measured-port", title: "Measured port", version: "1",
    build({ transform, parameters }) {
      const atStart = transform.position[0] < 1;
      return { nodes: [], anchors: { pin: {
        position: [0, 0, 0],
        direction: atStart ? parameters.startDirection : parameters.finalDirection,
        outsideDiameter: atStart ? parameters.startDiameter : parameters.finalDiameter,
      } } };
    },
  });
  const doc = {
    instances: [
      { id: "slide", component: "test.measured-port", parameters: {
        startDirection: [1, 1, 0], startDiameter: 0.06, finalDirection: [0, 1, 0], finalDiameter: 0.075,
      } },
      { id: "frame", component: "core.composition", parameters: { nodes: [], anchors: { pin: {
        position: [0, 0, 0], direction: [1, 0, 0], outsideDiameter: 0.05,
      } } } },
    ],
    relations: [{ type: "connects", from: "slide#pin", to: "frame#pin",
      contract: { gapTolerance: 2, direction: "aligned", outsideDiameter: "equal" } }],
  };
  const propose = () => proposeAnchorAlignment(composeScene(doc, registry), {
    instanceId: "slide", sourceAnchor: "pin", targetPoint: [2, 0, 0],
  }, registry);
  const proposal = propose();
  const [review] = proposal.facts.connectionImpact;
  assert.deepEqual(review.before.issues.map(i => i.code), review.after.issues.map(i => i.code));
  const placed = applyChangesetProposal(doc, proposal, registry);
  assert.deepEqual(applyChangesetProposal(placed, proposal, registry), placed);
  for (const input of [doc, placed]) {
    Object.assign(input.instances[0].parameters, { finalDirection: [-1, 0, 0], finalDiameter: 0.09 });
    assert.throws(() => applyChangesetProposal(input, proposal, registry), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.equal(error.conflicts.length, 1);
      const [conflict] = error.conflicts;
      assert.equal(conflict.reason, "reviewed-connection-measurement-exceeded");
      assert.deepEqual(conflict.exceededMeasurements, [
        { code: "SCENE_CONNECTION_DIRECTION", field: "deviation", unit: "radian", expected: Math.PI / 2, actual: Math.PI },
        { code: "SCENE_CONNECTION_DIAMETER_MISMATCH", field: "difference", unit: "meter", expected: 0.025, actual: 0.04 },
      ]);
      return true;
    });
  }
  const port = doc.instances[0].parameters;
  Object.assign(port, { startDirection: [0, 1, 0], startDiameter: 0.09, finalDirection: [1, 1, 0], finalDiameter: 0.075 });
  const reduction = propose();
  const reduced = applyChangesetProposal(doc, reduction, registry);
  for (const input of [doc, reduced]) {
    const livePort = input.instances[0].parameters;
    livePort.finalDirection = [0, 1, 0];
    delete livePort.finalDiameter;
    assert.throws(() => applyChangesetProposal(input, reduction, registry), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.deepEqual(error.conflicts.map(c => c.reason),
        ["reviewed-connection-measurement-unavailable", "reviewed-connection-measurement-exceeded"]);
      const [unavailable, exceeded] = error.conflicts;
      assert.deepEqual(unavailable.unavailableMeasurements, [
        { code: "SCENE_CONNECTION_DIAMETER_MISMATCH", field: "difference", unit: "meter",
          expected: 0.025, actual: null, actualCode: "SCENE_CONNECTION_DIAMETER_UNAVAILABLE" },
      ]);
      assert.deepEqual(exceeded.exceededMeasurements, [
        { code: "SCENE_CONNECTION_DIRECTION", field: "deviation", unit: "radian", expected: Math.PI / 4, actual: Math.PI / 2 },
      ]);
      return true;
    });
  }
  Object.assign(port, { finalDirection: [1, 0, 0], finalDiameter: 0.05 });
  const repaired = applyChangesetProposal(doc, reduction, registry);
  assert.deepEqual(applyChangesetProposal(repaired, reduction, registry), repaired);

  Object.assign(port, { startDirection: [1, 1, 0], finalDirection: [1, 1, 0], startDiameter: 0.06, finalDiameter: 0.06 });
  const unchanged = propose();
  Object.assign(port, { finalDirection: [0, 1, 0], finalDiameter: 0.09 });
  assert.throws(() => applyChangesetProposal(doc, unchanged, registry), error => {
    assert.deepEqual(error.conflicts.map(c => c.reason), ["required-connection-measurement-increased"]);
    assert.deepEqual(error.conflicts[0].increasedMeasurements, [
      { code: "SCENE_CONNECTION_DIRECTION", field: "deviation", unit: "radian", before: Math.PI / 4, after: Math.PI / 2 },
      { code: "SCENE_CONNECTION_DIAMETER_MISMATCH", field: "difference", unit: "meter", before: 0.01, after: 0.04 },
    ]);
    return true;
  });

  Object.assign(port, { startDirection: [1, 0, 0], finalDirection: [1, 0, 0], finalDiameter: 0.075 });
  const diameterOnly = propose();
  Object.assign(port, { finalDirection: [0, 1, 0], finalDiameter: 0.09 });
  assert.throws(() => applyChangesetProposal(doc, diameterOnly, registry), error => {
    assert.deepEqual(error.conflicts.map(c => c.reason),
      ["reviewed-connection-measurement-exceeded", "required-connection-new-issues"]);
    assert.deepEqual(error.conflicts[0].exceededMeasurements.map(m => [m.code, m.expected, m.actual]),
      [["SCENE_CONNECTION_DIAMETER_MISMATCH", 0.025, 0.04]]);
    assert.deepEqual(error.conflicts[1].addedIssueCodes, ["SCENE_CONNECTION_DIRECTION"]);
    return true;
  });
});

test("a missing diameter fails its reviewed repair alongside a separate unreviewed change", () => {
  const registry = createDefaultRegistry().register({
    id: "test.diameter-port", title: "Diameter port", version: "1",
    build({ transform, parameters }) {
      const moving = transform.position[0] >= 1;
      return { nodes: [], anchors: { pin: {
        position: [0, 0, 0], direction: [1, 0, 0], outsideDiameter: moving ? parameters.finalDiameter : 0.075,
      } } };
    },
  });
  const fixedPort = { position: [0, 0, 0], direction: [1, 0, 0], outsideDiameter: 0.05 };
  const doc = {
    instances: [
      { id: "slide", component: "test.diameter-port", parameters: { finalDiameter: 0.05 } },
      { id: "frame", component: "core.composition", parameters: { nodes: [], anchors: { pin: fixedPort } } },
    ],
    attachments: [{ from: "slide#pin", to: "frame#pin", contract: { direction: "aligned", outsideDiameter: "equal" } }],
  };
  const propose = () => proposeAnchorAlignment(composeScene(doc, registry), {
    instanceId: "slide", sourceAnchor: "pin", targetPoint: [2, 0, 0],
  }, registry);
  const original = propose();
  const [review] = original.facts.connectionImpact;
  assert.deepEqual(review.before.issues.map(i => i.code), ["SCENE_CONNECTION_DIAMETER_MISMATCH"]);
  assert.deepEqual(review.after.issues.map(i => i.code), ["SCENE_CONNECTION_GAP"]);
  assert.equal(applyChangesetProposal(doc, original, registry).revision, 1);
  delete doc.instances[0].parameters.finalDiameter;
  fixedPort.direction = [0, 1, 0];
  assert.throws(() => applyChangesetProposal(doc, original, registry), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(error.conflicts.map(c => [c.path, c.reason]), [
      ["/attachments/0", "required-connection-issues-not-resolved"], ["/attachments/0", "reviewed-disconnection-changed"],
    ]);
    const [unresolved, added] = error.conflicts;
    assert.deepEqual(unresolved.unresolvedIssueCodes, ["SCENE_CONNECTION_DIAMETER_MISMATCH"]);
    assert.equal(unresolved.after.issues[2].code, "SCENE_CONNECTION_DIAMETER_UNAVAILABLE");
    assert.deepEqual(added.addedIssueCodes, ["SCENE_CONNECTION_DIRECTION"]);
    return true;
  });
  const fresh = propose();
  const placed = applyChangesetProposal(doc, fresh, registry);
  assert.deepEqual(applyChangesetProposal(placed, fresh, registry), placed);
});

test("a custom registry projects pose-dependent ports and checks the same final measurements", () => {
  const registry = createDefaultRegistry().register({
    id: "test.slide", title: "Slide", version: "1",
    build({ transform, parameters }) {
      return { nodes: [], parameters, anchors: { origin: [0,0,0], follower: [0,transform.position[0],0] } };
    },
  });
  const doc = {
    instances: [
      { id: "slide", component: "test.slide", transform: { position: [1,0,0], scale: [1,2,1] } },
      { id: "frame", component: "core.composition", parameters: { nodes: [], anchors: { pin: [1,2,0] } } },
    ],
    attachments: [{ from: "slide#follower", to: "frame#pin" }],
  };
  const make = () => proposeAnchorAlignment(composeScene(doc, registry), {
    instanceId: "slide", sourceAnchor: "origin", targetPoint: [3,0,0],
  }, registry);
  const p = make();
  const [row] = p.facts.connectionImpact;
  const applied = applyChangesetProposal(doc, p, registry);
  const after = composeScene(applied, registry);
  assert.equal(row.before.connected, true);
  assert.deepEqual(row.after.issues[0].measurement.fromPoint, [3,6,0]);
  assert.deepEqual(row.after.issues[0].measurement, after.issues[0].measurement);
  const old = { ...p, facts: { ...p.facts, connectionImpact: [] } };
  assert.throws(() => applyChangesetProposal(doc, old, registry), e => {
    assert.deepEqual(e.conflicts[0].after, row.after);
    return e.code === "SCENE_PROPOSAL_CONFLICT";
  });
});
