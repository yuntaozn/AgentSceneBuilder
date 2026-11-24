import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeMonitoring, checkComposition, createDefaultRegistry, monitoringFrameDocument } from "../packages/core/src/index.js";
import { run } from "../packages/cli/src/agentscene.mjs";

const registry = createDefaultRegistry();
const manifestUrl = new URL("../registry/compositions/two-storey-structural-monitoring/manifest.json", import.meta.url);
const load = async () => JSON.parse(await readFile(manifestUrl, "utf8")).editor.document;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} does not match ${b}`);

test("four measurement channels use one timeline and only sustained threshold crossings open alarms", async () => {
  const document = await load();
  assert.deepEqual(checkComposition(document), { ok: true, issues: [] });
  const { frames, series, alarms } = analyzeMonitoring(document, registry);
  const byId = new Map(series.map(item => [item.pointId, item]));
  assert.deepEqual(series.map(({ pointId, unit }) => [pointId, unit]), [
    ["S-01", "με"], ["D-01", "mm"], ["A-01", "m/s²"], ["T-01", "°"],
  ]);
  for (const item of series) assert.deepEqual(item.samples.map(sample => sample.timeSeconds), frames.map(frame => frame.timeSeconds));
  assert.equal(byId.get("S-01").samples[9].value, 210);
  close(byId.get("D-01").samples[10].value, -12);
  close(byId.get("T-01").samples[10].value, 0.009 * 180 / Math.PI);
  const vibration = byId.get("A-01").samples;
  assert.equal(vibration[0].state, "unavailable");
  assert.equal(vibration.at(-1).value, null);
  assert.ok(vibration.some(sample => Math.abs(sample.value) > 0.001));
  close(vibration[10].value, 0);
  assert.equal(byId.get("D-01").samples[9].state, "above-limit");
  assert.equal(byId.get("D-01").samples[10].state, "alarm");
  assert.equal(byId.get("D-01").samples.at(-1).state, "normal");
  assert.deepEqual(alarms.map(({ pointId, timeSeconds, firstAboveSeconds }) => [pointId, timeSeconds, firstAboveSeconds]), [
    ["S-01", 2.25, 1.75], ["D-01", 2.5, 1.75], ["T-01", 2.5, 2],
  ]);
});

test("beam sweep and displacement probe move together against a fixed reference with a separate display factor", async () => {
  const document = await load();
  const source = structuredClone(document);
  const base = registry.build(document);
  const physical = registry.build(monitoringFrameDocument(document, 1));
  const display = registry.build(monitoringFrameDocument(document, 1, { display: true }));
  const y = (build, id) => build.anchors.world[id][1];
  const reference = "reference-stand.instrument-seat", tip = "displacement-gauge.tip", beam = "deflection-axis-target";
  for (const result of [base, physical, display]) {
    close(y(result, reference), y(base, reference));
    close(y(result, tip), y(result, beam));
  }
  close(y(physical, beam) - y(base, beam), -0.012);
  close(y(display, beam) - y(base, beam), -0.096);
  const path = build => build.nodes.find(node => node.metadata.compositionNodeId === "loaded-beam").geometry.points;
  assert.deepEqual(path(base)[0], path(display)[0]);
  assert.deepEqual(path(base).at(-1), path(display).at(-1));
  close(path(display)[5][1] - path(base)[5][1], -0.096);
  assert.deepEqual(document, source);
  document.parameters.monitoring.displayScale = 4;
  const { series } = analyzeMonitoring(document, registry, { pointId: "D-01" });
  close(series[0].samples[10].value, -12);
});

test("invalid field references, movement and sensor alignment are returned as monitor diagnostics together", async () => {
  const document = await load();
  const { monitoring, anchors } = document.parameters;
  anchors["strain-gauge.measure-axis"].direction = [0, 1, 0];
  monitoring.points[1].reference = "displacement-gauge.tip";
  monitoring.points[2].sensor = "missing-axis";
  monitoring.motions[0].pathOffsets.pop();
  const checked = checkComposition(document);
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.issues.map(issue => [issue.code, issue.path]), [
    ["MONITORING_INVALID", "/parameters/monitoring/motions/0/pathOffsets"],
    ["MONITORING_INVALID", "/parameters/monitoring/points/0/sensor"],
    ["MONITORING_INVALID", "/parameters/monitoring/points/1/reference"],
    ["MONITORING_INVALID", "/parameters/monitoring/points/2/sensor"],
  ]);
  assert.throws(() => registry.build(document), { code: "MONITORING_INVALID" });
});

test("composition monitor serves the selected point as JSON through the CLI", () => {
  const path = fileURLToPath(manifestUrl);
  const invoke = point => {
    let output = "";
    const status = run(["composition", "monitor", path, point], { stdout: { write(chunk) { output += chunk; } } });
    return [status, JSON.parse(output)];
  };
  const [status, { analysis }] = invoke("D-01");
  assert.equal(status, 0);
  assert.deepEqual(analysis.series.map(item => item.pointId), ["D-01"]);
  assert.equal(analysis.series[0].targetNode, "loaded-beam");
  assert.equal(analysis.alarms[0].pointId, "D-01");
  const [unknown, outcome] = invoke("missing");
  assert.equal(unknown, 2);
  assert.equal(outcome.ok, false);
});
