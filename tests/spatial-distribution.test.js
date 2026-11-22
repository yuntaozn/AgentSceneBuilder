import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSceneSpatial, applyChangesetProposal, composeScene, createDefaultRegistry, proposeLinearDistribution,
} from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
const build = document => composeScene(document, registry);
const distribute = (document, axis = "x") => proposeLinearDistribution(build(document), {
  instanceIds: ["a", "b"], start: 0, axis, gap: 0.2,
});
function boxes() {
  return { revision: 3, instances: ["a", "b"].map((id, index) => ({
    id, component: "core.composition", transform: { position: [index * 4, 0, 0] },
    parameters: { nodes: [{ id: "body", geometry: { type: "box", size: [1, 1, 1] } }] },
  })) };
}
function datum(id) {
  return { id, component: "core.composition", parameters: { nodes: [], anchors: { origin: [0, 0, 0] } } };
}

test("distribution detects a resized box before apply and on replay, then regenerates the requested gap", () => {
  const doc = boxes();
  const proposal = JSON.parse(JSON.stringify(distribute(doc)));
  const placed = applyChangesetProposal(doc, proposal);
  for (const input of [doc, placed]) {
    input.instances[0].parameters.nodes[0].geometry.size[0] = 2;
    const before = structuredClone(input);
    assert.throws(() => applyChangesetProposal(input, proposal), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      const [conflict] = error.conflicts;
      assert.deepEqual([conflict.instanceId, conflict.axis, conflict.reason], ["a", "x", "bounds-changed"]);
      assert.deepEqual(conflict.expected, { min: 0, max: 1 });
      assert.deepEqual(conflict.actual, { min: -0.5, max: 1.5 });
      return true;
    });
    assert.deepEqual(input, before);
  }
  const fresh = distribute(doc);
  const result = applyChangesetProposal(doc, fresh);
  const [a, b] = build(result).instances;
  assert.ok(Math.abs(b.bounds.min[0] - a.bounds.max[0] - 0.2) < 1e-9);
  assert.equal(result.revision, 4);
  assert.deepEqual(applyChangesetProposal(result, fresh), result);
});

test("distribution checks both ends of the chosen axis and permits independent geometry edits", () => {
  const doc = boxes();
  const proposal = distribute(doc, "z");
  doc.instances[0].parameters.nodes[0].geometry.size[0] = 3;
  doc.instances.push(datum("origin"));
  assert.equal(applyChangesetProposal(doc, proposal).revision, 4);
  doc.instances[0].parameters.nodes[0].position = [0, 0, 0.5]; // Same size, different axial offset.
  doc.instances[1].parameters.nodes[0].geometry.size[2] = 0.8;
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.axis, c.reason]), [
      ["a", "z", "bounds-changed"], ["b", "z", "bounds-changed"],
    ]);
    return true;
  });
});

test("distribution measures signed gaps in placement order on first apply, partial apply and replay", () => {
  const doc = boxes();
  doc.instances.push({ ...structuredClone(doc.instances[1]), id: "c" });
  const request = { instanceIds: ["c", "a", "b"], axis: "z", start: 0, gap: 0 };
  const proposal = proposeLinearDistribution(build(doc), request);
  assert.deepEqual(proposal.facts.gapMeasurements.map(m => [m.fromInstanceId, m.toInstanceId, m.actual]),
    [["c", "a", 0], ["a", "b", 0]]);
  const placed = applyChangesetProposal(doc, proposal);
  delete proposal.facts.gapMeasurements; // Saved proposals still contain the gap and ordered placements.
  const partial = structuredClone(doc);
  partial.instances[2].transform = proposal.changes[0].after;
  for (const [input, changes] of [[doc, proposal.changes], [partial, proposal.changes.slice(1)], [placed, proposal.changes]]) {
    for (const instance of input.instances) {
      instance.parameters.nodes[0].position = [0, 0, instance.id === "a" ? -7.5e-10 : 7.5e-10];
    }
    const snapshot = structuredClone(input);
    assert.throws(() => applyChangesetProposal(input, { ...proposal, changes: [...changes].reverse() }), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.deepEqual(error.conflicts.map(c => [c.reason, c.path, c.measurement.fromInstanceId, c.measurement.toInstanceId]),
        [["distribution-gap-missed", "/instances/0", "c", "a"], ["distribution-gap-missed", "/instances/1", "a", "b"]]);
      const [overlap, separation] = error.conflicts.map(c => c.measurement);
      assert.ok(Math.abs(overlap.actual + 1.5e-9) < 1e-15 && Math.abs(separation.actual - 1.5e-9) < 1e-15);
      assert.equal(overlap.expected, 0);
      return true;
    });
    assert.deepEqual(input, snapshot);
  }
  const repaired = proposeLinearDistribution(build(doc), request, registry);
  const result = applyChangesetProposal(doc, repaired);
  assert.deepEqual(applyChangesetProposal(result, repaired), result);
});

test("distribution solves a small node offset from a large origin and preserves rotation and scale", () => {
  for (const rotation of [[0, 0, 0], [0, 0, 0.4]]) {
    const doc = boxes();
    doc.instances[0].transform = { position: [1e8, 3, 4], rotation, scale: [-1, 2, 1] };
    doc.instances[0].parameters.nodes[0].position = [0.013, 0, 0];
    const composed = build(doc);
    for (const projector of [undefined, registry]) {
      const proposal = proposeLinearDistribution(composed, { instanceIds: ["a", "b"], start: 0, gap: 0.2 }, projector);
      const [a, b] = build(applyChangesetProposal(doc, proposal)).instances;
      assert.ok(Math.abs(a.bounds.min[0]) <= 1e-9);
      assert.deepEqual(a.instance.transform.position.slice(1), [3, 4]);
      assert.deepEqual(a.instance.transform.rotation, rotation);
      assert.deepEqual(a.instance.transform.scale, [-1, 2, 1]);
      assert.equal(proposal.facts.end, b.bounds.max[0]);
      assert.equal(proposal.facts.gapMeasurements[0].actual, b.bounds.min[0] - a.bounds.max[0]);
    }
  }
});

test("distribution reports bounds that change when a custom component rebuilds in its proposed pose", () => {
  const custom = createDefaultRegistry().register({ id: "test.follower", title: "Follower", version: "1",
    build({ instanceId, transform, parameters }) {
      return { nodes: [{ id: instanceId + ".body", kind: "geometry", geometry: { type: "box", size: [1, 1, 1] },
        transform: { position: [transform.position[0] * parameters.factor, 0, 0] } }] };
    },
  });
  const doc = boxes();
  doc.instances[0] = { id: "a", component: "test.follower", parameters: { factor: 1 } };
  assert.throws(() => proposeLinearDistribution(composeScene(doc, custom), { instanceIds: ["a", "b"], start: 1.5 }, custom), error => {
    assert.equal(error.code, "SCENE_DISTRIBUTION_TARGET_MISSED");
    assert.deepEqual(error.measurement, { kind: "bounds", instanceId: "a", axis: "x", space: "world", unit: "meter", tolerance: 1e-9,
      expected: { min: 1.5, max: 2.5, size: 1 }, actual: { min: 3.5, max: 4.5, size: 1 } });
    return true;
  });
});

test("a legacy placement cannot collapse a metre of width when both recorded endpoints round to the same coordinate", () => {
  const doc = boxes();
  const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 0, gap: 0 });
  proposal.facts.start = proposal.facts.end = 1e16;
  delete proposal.facts.gapMeasurements;
  for (const placement of proposal.facts.placements) placement.proposedMin = 1e16;
  for (const change of proposal.changes) change.after.position[0] = 1e16;
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.reason, c.expectedSize, c.actualSize]),
      [["a", "bounds-changed", 1, 0], ["b", "bounds-changed", 1, 0]]);
    return true;
  });
});

test("spatial analysis skips only instances without geometry and preserves the remaining pairs", () => {
  const doc = boxes();
  const expected = analyzeSceneSpatial(build(doc));
  doc.instances.splice(1, 0, datum("origin"));
  doc.instances.push(datum("mount"));
  const result = analyzeSceneSpatial(build(doc));
  assert.deepEqual(result.pairs, expected.pairs);
  assert.equal(result.instanceCount, 4);
  assert.equal(result.pairCount, 1);
  assert.deepEqual(result.skippedInstanceIds, ["origin", "mount"]);
  for (const instances of [[], [datum("origin")], [datum("origin"), datum("mount")]]) {
    const empty = analyzeSceneSpatial(build({ instances }));
    assert.deepEqual(empty.skippedInstanceIds, instances.map(i => i.id));
    assert.deepEqual([empty.pairCount, empty.contacts, empty.collisions], [0, 0, 0]);
  }
  assert.throws(() => proposeLinearDistribution(build(doc), { instanceIds: ["origin", "a", "mount"] }), error => {
    assert.equal(error.code, "SCENE_BOUNDS_MISSING");
    assert.deepEqual(error.instanceIds, ["origin", "mount"]);
    return true;
  });
});

test("distribution still checks a stationary participant that loses its geometry", () => {
  const doc = boxes();
  const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], gap: 0.2 });
  assert.deepEqual(proposal.changes[0].before, proposal.changes[0].after);
  proposal.changes.shift(); // Removing the no-op still leaves its range in the placement list.
  doc.instances[0] = datum("a");
  assert.throws(() => applyChangesetProposal(doc, proposal), error =>
    error.code === "SCENE_PROPOSAL_CONFLICT" && error.conflicts.some(c => c.instanceId === "a" && c.reason === "bounds-missing"));
});

test("missing placement facts or an unbuildable model return actionable conflicts", () => {
  const doc = boxes();
  const proposal = distribute(doc);
  proposal.facts.placements.pop();
  doc.instances[0].parameters.nodes[0].geometry.size = [-1, 1, 1];
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.reason]), [
      ["a", "bounds-unavailable"], ["b", "distribution-bounds-missing"],
    ]);
    return true;
  });
});

test("malformed placement records identify every field and preserve the original adjacency", () => {
  const doc = boxes(), p = distribute(doc);
  const repeat = structuredClone(p.facts.placements[0]);
  p.facts.placements.splice(1, 0, null, { proposedMin: "bad", size: -2 }, repeat);
  p.facts.gap = -0.1;
  p.changes.push({ operation: "update-instance-transform", instanceId: "", before: {}, after: null });
  assert.throws(() => applyChangesetProposal(doc, p), e => {
    assert.equal(e.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(e.conflicts.map(c => c.path), [
      "/changes/2/instanceId", "/changes/2/after", "/facts/placements/1", "/facts/placements/2/instanceId",
      "/facts/placements/2/proposedMin", "/facts/placements/2/size", "/facts/placements/3/instanceId", "/facts/gap",
    ]);
    assert.equal(e.conflicts.find(c => c.reason === "placement-duplicate").firstPath, "/facts/placements/0/instanceId");
    return true;
  });
  p.changes = null;
  p.facts = distribute(doc).facts;
  assert.throws(() => applyChangesetProposal(doc, p), e => e.conflicts.length === 1 && e.conflicts[0].path === "/changes");
});

test("a partially applied distribution rechecks only the remaining moves against current joints", () => {
  const doc = boxes(); // Centers at 0 and 4. The requested centers are 2 and 3.
  doc.instances[0].parameters.anchors = { pin: [0.5, 0, 0] };
  doc.instances[1].parameters.anchors = { pin: [-1.5, 0, 0] };
  doc.attachments = [{ from: "a#pin", to: "b#pin" }];
  const request = { instanceIds: ["a", "b"], start: 1.5 };
  const proposal = proposeLinearDistribution(build(doc), request);
  const [joint] = proposal.facts.connectionImpact;
  assert.deepEqual([joint.before.gap, joint.after.gap], [2, 1]);
  const old = structuredClone(proposal);
  delete old.facts.connectionImpact;
  assert.equal(applyChangesetProposal(doc, old).revision, 4);

  doc.instances[0].transform = proposal.changes[0].after; // a#pin now meets b#pin.
  doc.attachments.unshift({ from: "a#pin", to: "a#pin" });
  const snapshot = structuredClone(doc);
  for (const p of [proposal, old]) {
    assert.throws(() => applyChangesetProposal(doc, p), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.path, c.reason, c.before.gap, c.after.gap]),
        [["b", "/attachments/1", "required-connection-disconnected", 0, 1]]);
      return true;
    });
    assert.deepEqual(doc, snapshot);
  }
  const fresh = proposeLinearDistribution(build(doc), request);
  assert.deepEqual(fresh.facts.connectionImpact.map(r => r.path), ["/attachments/1"]);
  const placed = applyChangesetProposal(doc, fresh);
  assert.equal(placed.revision, 4);
  assert.deepEqual(applyChangesetProposal(placed, old), placed);
  assert.deepEqual(proposeLinearDistribution(build(placed), request).facts.connectionImpact, []);
  doc.attachments[1].required = false;
  assert.equal(applyChangesetProposal(doc, old).revision, 4);
});

test("remaining distribution moves cannot increase an unchanged reviewed gap", () => {
  const doc = boxes();
  doc.instances[0].parameters.anchors = { pin: [0, 0, 0] };
  doc.instances[1].parameters.anchors = { pin: [-2.5, 0, 0] };
  doc.attachments = [{ from: "a#pin", to: "b#pin" }];
  const request = { instanceIds: ["a", "b"], start: 1.5 };
  const proposal = proposeLinearDistribution(build(doc), request);
  const [reviewed] = proposal.facts.connectionImpact;
  assert.deepEqual([reviewed.before.gap, reviewed.after.gap], [1.5, 1.5]);
  doc.instances[0].transform = proposal.changes[0].after;
  const snapshot = structuredClone(doc);
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.path, c.reason]),
      [["b", "/attachments/0", "required-connection-measurement-increased"]]);
    assert.deepEqual(error.conflicts[0].increasedMeasurements, [
      { code: "SCENE_CONNECTION_GAP", field: "effectiveGap", unit: "meter", before: 0.5, after: 1.5 },
    ]);
    return true;
  });
  assert.deepEqual(doc, snapshot);
  const fresh = proposeLinearDistribution(build(doc), request);
  const placed = applyChangesetProposal(doc, fresh);
  assert.equal(placed.revision, 4);
  assert.deepEqual(applyChangesetProposal(placed, proposal), placed);
});

test("a blocked endpoint suppresses only dependent measurements and still matches its reviewed repair", () => {
  const doc = boxes();
  doc.instances[0].parameters.anchors = { pin: [0, 0, 0], tip: [4, 0, 0] };
  doc.instances[1].parameters.anchors = { pin: [0, 0, 0] };
  for (const [id, x] of [["at2", 2], ["at4", 4]]) {
    doc.instances.push({ ...datum(id), transform: { position: [x, 0, 0] } });
  }
  doc.attachments = [{ id: "repair", from: "a#pin", to: "at2#origin" }];
  const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 1.5 });
  assert.equal(proposal.facts.connectionImpact[0].after.connected, true);
  doc.attachments.push({ id: "dependent", from: "a#tip", to: "b#pin" }, { id: "independent", from: "b#pin", to: "at4#origin" });

  for (const [reason, path, edit] of [
    ["transform-changed", "/instances/0/transform", (_input, p) => {
      const first = p.changes[0];
      p.changes.push({ ...first, before: { position: [7, 0, 0] }, after: { position: [8, 0, 0] } });
    }],
    ["transform-invalid", "/instances/0/transform/rotation/1", input => { input.instances[0].transform.rotation = [0, "bad", 0]; }],
    ["instance-missing", "/instances", input => { input.instances.shift(); }],
    ["bounds-unavailable", "/instances/0", input => { input.instances[0].parameters.nodes[0].geometry.size[0] = -1; }],
  ]) {
    const input = structuredClone(doc), p = structuredClone(proposal);
    edit(input, p);
    const snapshot = structuredClone(input);
    assert.throws(() => applyChangesetProposal(input, p), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.reason, c.path]), [
        ["a", reason, path], ["b", "required-connection-disconnected", "/attachments/2"],
      ]);
      assert.equal(error.conflicts[1].after.gap, 1);
      return true;
    });
    assert.deepEqual(input, snapshot);
  }
  doc.instances[0].transform.position[0] = -1;
  doc.attachments.shift(); // Removing the reviewed declaration is observable even with an unresolved pose.
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.deepEqual(error.conflicts.map(c => [c.reason, c.path]), [
      ["transform-changed", "/instances/0/transform"], ["required-connection-disconnected", "/attachments/1"],
      ["reviewed-connection-missing", "/attachments"],
    ]);
    return true;
  });
});

test("a replay still rechecks reviewed repairs alongside a geometry conflict with no remaining moves", () => {
  const doc = boxes();
  doc.instances[1].parameters.anchors = { pin: [0, 0, 0] };
  doc.instances.push({ ...datum("mount"), transform: { position: [3, 0, 0] } });
  doc.relations = [{ type: "connects", from: "b#pin", to: "mount#origin" }];
  const p = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 1.5 });
  const placed = applyChangesetProposal(doc, p);
  placed.instances[0].parameters.nodes[0].geometry.size[0] = 2;
  placed.instances[2].transform.position[0] += 0.25;
  const snapshot = structuredClone(placed);
  assert.throws(() => applyChangesetProposal(placed, { ...p, changes: [] }), error => {
    assert.deepEqual(error.conflicts.map(c => c.reason), ["bounds-changed", "required-connection-not-restored"]);
    const repair = error.conflicts[1];
    assert.deepEqual([repair.path, repair.reviewedAfter.gap, repair.after.gap], ["/relations/0", 0, 0.25]);
    return true;
  });
  p.facts.connectionImpact = {};
  assert.throws(() => applyChangesetProposal(placed, p), error => {
    assert.deepEqual(error.conflicts.map(c => [c.path, c.reason]),
      [["/instances/0", "bounds-changed"], ["/facts/connectionImpact", "connection-preview-invalid"]]);
    return true;
  });
  assert.deepEqual(placed, snapshot);
});

test("distribution rebuilds pose-dependent anchors for both ends of a joint with the supplied registry", () => {
  const custom = createDefaultRegistry().register({
    id: "test.slider", version: "1", title: "Slider",
    build({ instanceId, transform, parameters }) {
      const x = transform.position[0];
      return { parameters, anchors: { port: [parameters.offset, x, 0] }, nodes: [{
        id: instanceId + ".body", kind: "geometry", transform: { position: [0, 0, 0] },
        geometry: { type: "box", size: [1, 1, 1] },
      }] };
    },
  });
  const doc = {
    instances: [0, 3].map((x, i) => ({
      id: "s" + i, component: "test.slider", parameters: { offset: 0 }, transform: { position: [x, 0, 0] },
    })),
    attachments: [{ from: "s0#port", to: "s1#port", tolerance: 5 }],
  };
  const proposal = proposeLinearDistribution(composeScene(doc, custom), { instanceIds: ["s0", "s1"], start: 1.5, gap: 3 }, custom);
  const [joint] = proposal.facts.connectionImpact;
  assert.equal(joint.before.connected, true);
  assert.equal(joint.after.connected, false);
  const { measurement } = joint.after.issues[0];
  assert.deepEqual([measurement.fromPoint, measurement.toPoint], [[2, 2, 0], [6, 6, 0]]);
  const actual = composeScene(applyChangesetProposal(doc, proposal, custom), custom);
  assert.deepEqual(measurement, actual.issues[0].measurement);
});

test("a partial distribution rechecks a promised gap repair on an already placed joint with a residual issue", () => {
  const doc = boxes();
  doc.instances[0].parameters.anchors = { pin: [0, 0, 0] };
  const frame = datum("frame");
  frame.transform = { position: [2, 0, 0] };
  doc.instances.push(frame);
  doc.relations = [{ type: "connects", from: "frame#origin", to: "a#pin", contract: { outsideDiameter: "equal" } }];
  const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 1.5 });
  doc.instances[0].transform = proposal.changes.shift().after;
  doc.instances[2].transform.position[0] += 0.25;
  const snapshot = structuredClone(doc);
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.path, c.reason, c.reviewedAfter.gap, c.after.gap]),
      [["a", "/relations/0", "required-connection-issues-not-resolved", 0, 0.25]]);
    assert.deepEqual(error.conflicts[0].unresolvedIssueCodes, ["SCENE_CONNECTION_GAP"]);
    assert.deepEqual(error.conflicts[0].reviewedAfter.issues.map(i => i.code), ["SCENE_CONNECTION_DIAMETER_UNAVAILABLE"]);
    return true;
  });
  assert.deepEqual(doc, snapshot);
  frame.transform.position[0] = 2;
  const placed = applyChangesetProposal(doc, proposal);
  assert.equal(placed.revision, 4);
  assert.deepEqual(applyChangesetProposal(placed, proposal), placed);
  placed.relations = [];
  assert.throws(() => applyChangesetProposal(placed, proposal), error => {
    assert.deepEqual(error.conflicts.map(c => [c.path, c.reviewedPath, c.reason]),
      [["/relations", "/relations/0", "reviewed-connection-missing"]]);
    return true;
  });
});

test("a partial distribution detects a replacement failure at an already placed joint", () => {
  const doc = boxes();
  doc.instances[0].parameters.anchors = { pin: { position: [0, 0, 0], direction: [1, 0, 0], outsideDiameter: 0.05 } };
  const frame = datum("frame");
  frame.parameters.anchors.origin = { position: [0, 0, 0], direction: [0, 1, 0], outsideDiameter: 0.05 };
  doc.instances.push(frame);
  doc.attachments = [{ from: "a#pin", to: "frame#origin", contract: { direction: "aligned", outsideDiameter: "equal" } }];
  const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 1.5 });
  const [reviewed] = proposal.facts.connectionImpact;
  assert.deepEqual(reviewed.before.issues.map(i => i.code), ["SCENE_CONNECTION_DIRECTION"]);
  assert.deepEqual(reviewed.after.issues.map(i => i.code), ["SCENE_CONNECTION_GAP", "SCENE_CONNECTION_DIRECTION"]);
  doc.instances[0].transform = proposal.changes[0].after;
  frame.parameters.anchors.origin.position = [2, 0, 0];
  delete frame.parameters.anchors.origin.outsideDiameter;
  const snapshot = structuredClone(doc);
  assert.throws(() => applyChangesetProposal(doc, proposal), error => {
    assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
    assert.equal(error.conflicts.length, 1);
    const [conflict] = error.conflicts;
    assert.deepEqual([conflict.instanceId, conflict.path, conflict.reason, conflict.reviewedAfter.gap, conflict.after.gap],
      ["a", "/attachments/0", "reviewed-disconnection-changed", 2, 0]);
    assert.deepEqual(conflict.addedIssueCodes, ["SCENE_CONNECTION_DIAMETER_UNAVAILABLE"]);
    return true;
  });
  assert.deepEqual(doc, snapshot);
  frame.parameters.anchors.origin.outsideDiameter = 0.05;
  const placed = applyChangesetProposal(doc, proposal);
  assert.equal(placed.revision, 4);
  assert.deepEqual(placed.instances[1].transform.position, [3, 0, 0]);
  assert.deepEqual(build(placed).issues.map(i => i.code), ["SCENE_CONNECTION_DIRECTION"]);
  assert.deepEqual(applyChangesetProposal(placed, proposal), placed);
});

test("partial distribution checks a reviewed gap limit on an already placed joint", () => {
  for (const [frameX, endGap] of [[-0.25, 2.25], [3, 1]]) {
    const doc = boxes();
    doc.instances[0].parameters.anchors = { pin: [0, 0, 0] };
    const frame = { ...datum("frame"), transform: { position: [frameX, 0, 0] } };
    doc.instances.push(frame);
    doc.attachments = [{ from: "a#pin", to: "frame#origin" }];
    const proposal = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 1.5 });
    const [reviewed] = proposal.facts.connectionImpact;
    assert.deepEqual([reviewed.before.gap, reviewed.after.gap], [Math.abs(frameX), endGap]);
    doc.instances[0].transform = proposal.changes.shift().after;
    frame.transform.position[0] = -0.5;
    const snapshot = structuredClone(doc);
    assert.throws(() => applyChangesetProposal(doc, proposal), error => {
      assert.equal(error.code, "SCENE_PROPOSAL_CONFLICT");
      assert.deepEqual(error.conflicts.map(c => [c.instanceId, c.path, c.reason]),
        [["a", "/attachments/0", "reviewed-connection-measurement-exceeded"]]);
      assert.deepEqual(error.conflicts[0].exceededMeasurements, [
        { code: "SCENE_CONNECTION_GAP", field: "effectiveGap", unit: "meter", expected: endGap, actual: 2.5 },
      ]);
      return true;
    });
    assert.deepEqual(doc, snapshot);
    frame.transform.position[0] = 2;
    const placed = applyChangesetProposal(doc, proposal);
    assert.equal(placed.revision, 4);
    assert.deepEqual(applyChangesetProposal(placed, proposal), placed);
  }
});

test("partial distribution validates optional preview rows and preserves independent required repairs", () => {
  const doc = boxes();
  for (const instance of doc.instances) instance.parameters.anchors = { pin: [0, 0, 0] };
  doc.instances.push({ ...datum("frame"), transform: { position: [2, 0, 0] } });
  doc.relations = [{ type: "connects", from: "a#pin", to: "frame#origin" }];
  doc.attachments = [{ from: "b#pin", to: "frame#origin", required: false, contract: { outsideDiameter: "equal" } }];
  const p = proposeLinearDistribution(build(doc), { instanceIds: ["a", "b"], start: 1.5 });
  doc.instances[0].transform = p.changes.shift().after;
  doc.instances[2].transform.position[0] += 0.25;
  const broken = structuredClone(p);
  const [repair, advisory] = broken.facts.connectionImpact;
  assert.deepEqual([repair.path, advisory.path], ["/relations/0", "/attachments/0"]);
  advisory.after.issues[0].level = "error";
  advisory.after.issues[0].measurement.gap = 0;
  advisory.after.issues.pop();
  assert.throws(() => applyChangesetProposal(doc, broken), e => {
    assert.deepEqual(e.conflicts.map(c => [c.reason, c.path]), [
      ["connection-preview-invalid", "/facts/connectionImpact/1/after/issues/0/level"],
      ["connection-preview-invalid", "/facts/connectionImpact/1/after/issues/0/measurement/gap"],
      ["connection-preview-invalid", "/facts/connectionImpact/1/after/issues"],
      ["required-connection-not-restored", "/relations/0"],
    ]);
    assert.deepEqual([e.conflicts[1].expected, e.conflicts[1].actual], [advisory.after.gap, 0]);
    assert.deepEqual([e.conflicts[2].expected, e.conflicts[2].actual], ["SCENE_CONNECTION_DIAMETER_UNAVAILABLE", null]);
    assert.equal(e.conflicts[3].after.gap, 0.25);
    return true;
  });
  doc.instances[2].transform.position[0] = 2;
  const placed = applyChangesetProposal(doc, p);
  assert.deepEqual(applyChangesetProposal(placed, p), placed);
});
