import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkComposition, checkScene, composeScene, createDefaultRegistry, generateMepRouteWithClips } from "../packages/core/src/index.js";

const registry = createDefaultRegistry();
const pipe = (id, path, diameter) => ({ id, component: "mep.pipe-run", parameters: { path, diameter } });
const small = pipe("a", [[0,0,0],[1,0,0]], .025);
function direct(other, contract) {
  return composeScene({instances:[small,other], relations:[{type:"connects",from:"a#end",to:"b#start",contract}]}, registry);
}

test("pipe ports use the first and last distinct segments, including in generated routes", () => {
  const path = [[0,0,0],[0,0,0],[0,1,0],[2,1,0],[2,1,0]];
  const instance = pipe("bend", path, .025);
  instance.transform = {position:[3,2,1],rotation:[0,0,Math.PI/2]};
  const built = registry.build(instance);
  assert.deepEqual(built.anchors.definitions.start.direction, [0,-1,0]);
  assert.deepEqual(built.anchors.definitions.end.direction, [1,0,0]);
  assert.ok(Math.abs(built.anchors.worldDefinitions.start.direction[0] - 1) < 1e-12);
  assert.equal(built.anchors.worldDefinitions.end.outsideDiameter, .025);
  const route = generateMepRouteWithClips({routes:[{id:"bend",points:path,radius:.0125,generateClips:false}]});
  const anchors = registry.build(route.composition).anchors.definitions;
  assert.deepEqual(anchors["bend-start"].direction, [0,-1,0]);
  assert.deepEqual(anchors["bend-end"].direction, [1,0,0]);
  assert.equal(anchors["bend-end"].outsideDiameter,.025);
});

test("route diagnostics collect coordinates and avoid cascading errors from invalid defaults and geometry", () => {
  const request = { defaultClipSpacing: 0, routes: [
    null,
    { id: "a", points: [[null,0,null],[0,1], [2,0,0]], radius: -1, clipStartOffset: -2, clipSize: [-1,0,1] },
    { id: "b", points: [[0,0,0],[0.01,0,0]], generateClips: false, clipOffset: [-1], clipStartOffset: -2 },
    { points: [[0,0,0],[1,0,0]], clipSpacing: -1 },
  ] };
  const before = structuredClone(request);
  assert.throws(() => generateMepRouteWithClips(request), error => {
    assert.deepEqual(error.issues.map(i => i.path), [
      "/defaultClipSpacing", "/routes/0", "/routes/1/points/0/0", "/routes/1/points/0/2",
      "/routes/1/points/1", "/routes/1/radius", "/routes/1/clipStartOffset", "/routes/1/clipSize/0",
      "/routes/1/clipSize/1", "/routes/3/clipSpacing",
    ]);
    assert.equal(error.issues.at(-1).routeId, "route-4");
    return true;
  });
  assert.deepEqual(request, before);
  assert.throws(() => generateMepRouteWithClips({ defaultClipSpacing: 0, routes: {} }), error =>
    error.issues.map(i => i.path).join(",") === "/defaultClipSpacing,/routes");
  assert.throws(() => generateMepRouteWithClips(null), error => error.issues.length === 1 && error.issues[0].path === "");
});

test("generated routes reserve explicit IDs and occurrence namespaces before assigning clip IDs", () => {
  const routes = [undefined, "route-1", "cold", "cold-clip", "cold-clip-2.000", "bend", "bend-clip.000"]
    .map(id => ({ id, points: [[0,0,0], [1,0,0]] }));
  const generated = generateMepRouteWithClips({ routes });
  assert.deepEqual(generated.routes.map(r => r.id), ["route-1-2", ...routes.slice(1).map(r => r.id)]);
  assert.equal(generated.routes.find(r => r.id === "cold").clipPrototypeId, "cold-clip-3");
  assert.equal(generated.routes.find(r => r.id === "bend").clipPrototypeId, "bend-clip-2");
  const doc = generated.composition;
  assert.deepEqual(checkComposition(doc), { ok: true, issues: [] });
  assert.deepEqual(generateMepRouteWithClips({ routes }), generated);
  const built = registry.build(doc);
  for (const route of generated.routes) {
    assert.ok(built.nodes.some(n => n.id === doc.id + "." + route.clipPrototypeId + ".000" && n.parent === route.id));
    assert.ok(built.anchors.local[route.id + "-end"]);
  }
});

test("saved generated routes keep custom offsets, hierarchy, dimensions and endpoint tangents after edits", () => {
  const original = generateMepRouteWithClips({ routes: [
    { id: "a", points: [[1,0,0],[3,0,0]], radius: 0.1, clipOffset: [0,0,0.25], clipSpacing: 0.5 },
    { id: "b", points: [[0,0,0],[0,0.3,0]], clipStartOffset: 0.1, clipEndOffset: 0.2 },
  ] }).composition;
  for (const legacy of [false, true]) {
    const doc = JSON.parse(JSON.stringify(original));
    const [pipe, clip] = doc.parameters.nodes;
    if (legacy) {
      delete doc.parameters.routeBindings;
      for (const node of doc.parameters.nodes) delete node.parent;
    }
    pipe.parent = "frame";
    pipe.transform = { position: [0,2,0] };
    doc.parameters.nodes.push({ id: "frame", transform: { position: [4,0,0] } });
    pipe.geometry.points = [[0,0,0],[0,0.5,0],[0,0.5,0.5]];
    pipe.geometry.radius = 0.04;
    clip.repetition.spacing = 0.25;
    clip.repetition.includeEnd = false;
    doc.parameters.anchors["a-end"].label = "service";
    doc.parameters.anchors.survey = { node: "a", position: [8,0,0] };
    const before = structuredClone(doc);
    assert.deepEqual(checkComposition(doc), { ok: true, issues: [] });
    const built = registry.build(doc);
    assert.deepEqual(doc, before);
    assert.equal(built.metrics.totalPipeLength.value, 1.3);
    const end = built.anchors.definitions["a-end"];
    assert.deepEqual(end.position, [4,2.5,0.5]);
    assert.deepEqual(end.direction, [0,0,1]);
    assert.equal(end.outsideDiameter, 0.08);
    assert.equal(end.label, "service");
    assert.deepEqual(built.anchors.definitions["a-start"].direction, [0,-1,0]);
    assert.deepEqual(built.anchors.local.survey, [12,2,0]);
    const clips = built.nodes.filter(n => n.metadata.supportsRoute === "a");
    assert.equal(clips.length, 3);
    for (const [index, clip] of clips.entries()) {
      assert.ok(Math.abs(clip.metadata.pathDistance - [0.16, 0.41, 0.66][index]) < 1e-12);
    }
    assert.deepEqual(clips[0].transform.position, [4,2.16,0.25]);
    assert.deepEqual(clips.at(-1).metadata.tangent, [0,0,1]);
    assert.equal(built.nodes.filter(n => n.metadata.supportsRoute === "b").length, 1);
    assert.deepEqual(registry.build(built.instance).nodes, built.nodes);
  }
});

test("binding diagnostics identify broken route references and preserve independent issues", () => {
  const doc = generateMepRouteWithClips().composition;
  doc.parameters.routeBindings[0].clip = "missing";
  doc.parameters.routeBindings[1].clipOffset = [0,1];
  doc.parameters.routeBindings[2].node = "missing";
  const { ok, issues } = checkComposition(doc);
  assert.equal(ok, false);
  assert.deepEqual(issues.map(i => i.path), ["/parameters/routeBindings/0/clip", "/parameters/routeBindings/1/clipOffset", "/parameters/routeBindings/2/node"]);
  assert.throws(() => registry.build(doc), /routeBindings\/0\/clip/);
});

test("same-diameter joins pass; mismatched specs are optional unless requested", () => {
  const other = pipe("b", [[1,0,0],[2,0,0]], .025);
  const contract = {direction:"opposed",outsideDiameter:"equal"};
  assert.equal(direct(other,contract).relations[0].connected,true);
  other.parameters.diameter = .05;
  const scene = direct(other,contract);
  assert.equal(scene.ok,false);
  assert.deepEqual(scene.issues.map(issue=>issue.code),["SCENE_CONNECTION_DIAMETER_MISMATCH"]);
  assert.deepEqual(scene.relations[0].outsideDiameterCheck,{from:.025,to:.05,difference:.025,unit:"meter",compatible:false});
  assert.equal(direct(other,{}).ok,true);
  assert.equal(direct(other,{...contract,diameterTolerance:.025}).ok,true);
  assert.throws(()=>direct(other,{...contract,diameterTolerance:-1}),/diameterTolerance/);
});

test("decimal gap and diameter limits are inclusive and reject larger differences", () => {
  const doc = {
    instances: [pipe("a", [[0,0,0],[1,0,0]], 0.050), pipe("b", [[1.1,0,0],[2,0,0]], 0.049)],
    attachments: [{ from: "a#end", to: "b#start", contract: { gapTolerance: 0.02, embed: 0.08, outsideDiameter: "equal", diameterTolerance: 0.001 } }],
  };
  assert.deepEqual(checkScene(doc, registry), { ok: true, issues: [] });
  assert.equal(composeScene(doc, registry).relations[0].connected, true);
  doc.instances[1].parameters.path[0][0] = 1.10001;
  doc.instances[1].parameters.diameter = 0.04899;
  for (const report of [checkScene(doc, registry), composeScene(doc, registry)]) {
    assert.deepEqual(report.issues.map(i => i.code), ["SCENE_CONNECTION_GAP", "SCENE_CONNECTION_DIAMETER_MISMATCH"]);
    assert.equal(report.ok, false);
  }
});

test("gap boundaries work for offset diagonal spans without masking small real separations", () => {
  const anchors = { a: [10000, -10000, 1e15], b: [10000.003, -9999.996, 1e15] };
  const contract = { gapTolerance: 0.005 };
  const spec = { id: "datums", nodes: [], anchors, attachments: [{ from: "a", to: "b", contract }] };
  assert.equal(checkComposition(spec).ok, true);
  anchors.b[0] += 1e-8;
  assert.equal(checkComposition(spec).ok, false);
  anchors.a = [0,0,1e15];
  anchors.b = [1e-12,0,1e15];
  contract.gapTolerance = 0;
  assert.equal(checkComposition(spec).ok, false);
  contract.gapTolerance = 1e-13;
  assert.equal(checkComposition(spec).ok, false);
  anchors.a = [1e16,0,0];
  anchors.b = [1e16 + 2,0,0];
  contract.gapTolerance = 1.1;
  assert.equal(checkComposition(spec).ok, false);
});

test("angle limits distinguish collinear and perpendicular boundaries from real angular errors", () => {
  const anchors = {
    a: { position: [0,0,0], direction: [1,1,0] },
    b: { position: [0,0,0], direction: [-1,-1,0] },
  };
  const contract = { direction: "opposed", angularTolerance: 0 };
  const spec = { id: "directions", nodes: [], anchors, attachments: [{ from: "a", to: "b", contract }] };
  const check = () => checkComposition(spec);
  assert.equal(check().ok, true);
  anchors.b.direction = [-1,-1,1e-12];
  const tiny = check().issues[0].measurement;
  assert.ok(tiny.deviation > 0 && tiny.deviation < 1e-12);
  anchors.b.direction = [1,-1,0];
  for (const mode of ["aligned", "opposed"]) {
    contract.direction = mode;
    contract.angularTolerance = Math.PI / 2;
    assert.equal(check().ok, true);
    contract.angularTolerance -= 1e-10;
    const m = check().issues[0].measurement;
    assert.equal(m.unit, "radian");
    assert.equal(m.angle, Math.PI / 2);
    assert.equal(m.deviation, Math.PI / 2);
  }
});

test("gap, direction, and missing diameter produce independent issues with the correct severity", () => {
  const unknown = {id:"b",component:"core.composition",parameters:{nodes:[],anchors:{start:{position:[2,0,0],direction:[1,0,0]}}}};
  const scene = direct(unknown,{direction:"opposed",outsideDiameter:"equal",required:false});
  assert.equal(scene.ok,true);
  assert.equal(scene.relations[0].connected,false);
  assert.deepEqual(scene.issues.map(issue=>issue.code),["SCENE_CONNECTION_GAP","SCENE_CONNECTION_DIRECTION","SCENE_CONNECTION_DIAMETER_UNAVAILABLE"]);
  assert.ok(scene.issues.every(issue=>issue.level==="warning"));
  assert.deepEqual(scene.issues[2].measurement, {
    unit: "meter", from: 0.025, to: null, difference: null, diameterTolerance: 1e-6,
  });
  assert.equal(scene.issues[1].measurement.angle, 0);
  assert.equal(scene.issues[1].measurement.deviation, Math.PI);
});

test("a collapsed pipe still supplies a position when its world tangent is unavailable", () => {
  const other = pipe("b", [[0, 0, 0], [1, 0, 0]], 0.025);
  other.transform = { position: [1, 0, 0], scale: [0, 1, 1] };
  const scene = direct(other, { outsideDiameter: "equal" });
  assert.equal(scene.ok, true);
  assert.equal(scene.instances[1].anchors.worldDefinitions.start.direction, null);
  const opposed = direct(other, { direction: "opposed" });
  assert.deepEqual(opposed.issues.map(issue => issue.code), ["SCENE_CONNECTION_DIRECTION"]);
  assert.equal(opposed.relations[0].gap, 0);
  assert.deepEqual(opposed.issues[0].measurement, {
    space: "world", unit: "radian", direction: "opposed", fromDirection: [1,0,0], toDirection: null,
    angle: null, deviation: null, angularTolerance: Math.PI / 18,
  });
});

test("a 25-to-50 mm reducer matches each pipe at its own port", () => {
  const url = new URL("../examples/digital-modeling/mep/pipe-reducer-connection.json",import.meta.url);
  const doc = JSON.parse(readFileSync(url));
  const scene = composeScene(doc,registry);
  assert.equal(scene.ok,true);
  assert.deepEqual(scene.relations.map(r=>r.outsideDiameterCheck.from),[.025,.05]);
  assert.ok(scene.relations.every(r=>r.directionDot===-1 && r.outsideDiameterCheck.compatible));
});
