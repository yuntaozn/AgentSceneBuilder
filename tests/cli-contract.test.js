import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cliPath = fileURLToPath(new URL("../packages/cli/src/agentscene.mjs", import.meta.url));
const legacyPath = fileURLToPath(new URL("../scripts/model.mjs", import.meta.url));

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
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
