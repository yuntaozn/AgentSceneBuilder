#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  analyzeSceneSpatial,
  analyzeHumanPoseRig,
  analyzeHumanReach,
  analyzeHumanModelQuality,
  analyzeGlbReferenceBytes,
  analyzePath,
  applyCompositionChangesetProposal,
  applyChangesetProposal,
  composeScene,
  createDefaultRegistry,
  createHumanSurfaceProfile,
  generateMepPressureTestLoop,
  generateMepRouteWithClips,
  generateHumanPart,
  generateLowPolyWorkerHuman,
  analyzeDrainSlope,
  orthogonalPathCandidates,
  proposeAnchorAlignment,
  proposeHumanGraspChangeset,
  proposeHumanIkReachChangeset,
  proposeHumanPoseChangeset,
  proposeHumanReachChangeset,
  proposeHumanSurfaceRefinement,
  proposeLinearDistribution,
  queryScene,
  samplePath,
  solveHumanArmIkLite,
} from "../../core/src/index.js";

const supportedCommands = [
  "component list",
  "component describe <id>",
  "component build <instance.json>",
  "reference analyze-glb <model.glb> [options.json|json]",
  "human-geometry profile [request.json|json]",
  "human-geometry generate-part [request.json|json]",
  "human-geometry generate-lowpoly-worker [request.json|json]",
  "human-geometry propose-surface-refinement <composition.json|manifest.json> [request.json|json]",
  "composition analyze-human-quality <composition.json|manifest.json>",
  "composition analyze-human-pose <composition.json|manifest.json>",
  "composition analyze-human-reach <composition.json|manifest.json> <request.json|json>",
  "composition solve-human-reach <composition.json|manifest.json> <request.json|json>",
  "composition propose-human-pose <composition.json|manifest.json> <request.json|json>",
  "composition propose-human-grasp <composition.json|manifest.json> <request.json|json>",
  "composition propose-human-reach <composition.json|manifest.json> <request.json|json>",
  "composition propose-human-ik-reach <composition.json|manifest.json> <request.json|json>",
  "composition apply-proposal <composition.json|manifest.json> <proposal.json|json>",
  "scene build <scene.json>",
  "scene query <scene.json> [query.json|json]",
  "scene analyze-spatial <scene.json>",
  "scene propose-align <scene.json> <request.json|json>",
  "scene propose-distribute <scene.json> <request.json|json>",
  "scene apply-proposal <scene.json> <proposal.json|json>",
  "path analyze <request.json|json>",
  "path orthogonal-candidates <request.json|json>",
  "path sample <request.json|json>",
  "mep route-with-clips [request.json|json]",
  "mep drain-slope-check <request.json|json>",
  "mep pressure-test-loop [request.json|json]",
];

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readJsonFile(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readJsonArgument(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const path = value.startsWith("@") ? value.slice(1) : value;
  if (fs.existsSync(path)) return readJsonFile(path);
  return JSON.parse(value);
}

function readCompositionDocument(path) {
  const value = readJsonFile(path);
  return value.editor?.document ?? value;
}

function helpPayload() {
  return {
    ok: true,
    kind: "agentscene-cli-help",
    description: "Renderer-neutral digital modeling CLI for AgentSceneBuilder.",
    contract: {
      stdout: "one JSON object",
      failureExitCode: 2,
      proposals: "advisory changesets; inspect before applying",
    },
    commands: supportedCommands,
  };
}

export function run(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const registry = createDefaultRegistry();
  const [group, action, ...args] = argv;

  try {
    if (!group || group === "help" || group === "--help" || group === "-h") {
      writeJson(stdout, helpPayload());
      return 0;
    }

    if (group === "path" && action === "analyze") {
      const request = readJsonArgument(args[0], "path request");
      writeJson(stdout, { ok: true, analysis: analyzePath(request.points, request.options) });
      return 0;
    }

    if (group === "path" && action === "orthogonal-candidates") {
      const request = readJsonArgument(args[0], "path request");
      writeJson(stdout, { ok: true, result: orthogonalPathCandidates(request.start, request.end, request.options) });
      return 0;
    }

    if (group === "path" && action === "sample") {
      const request = readJsonArgument(args[0], "path request");
      writeJson(stdout, { ok: true, result: samplePath(request.points, request.options) });
      return 0;
    }

    if (group === "mep" && action === "route-with-clips") {
      const request = args[0] ? readJsonArgument(args[0], "MEP route request") : {};
      writeJson(stdout, { ok: true, result: generateMepRouteWithClips(request) });
      return 0;
    }

    if (group === "mep" && action === "drain-slope-check") {
      const request = readJsonArgument(args[0], "drain slope request");
      writeJson(stdout, { ok: true, analysis: analyzeDrainSlope(request.points, request.options) });
      return 0;
    }

    if (group === "mep" && action === "pressure-test-loop") {
      const request = args[0] ? readJsonArgument(args[0], "pressure test request") : {};
      writeJson(stdout, { ok: true, result: generateMepPressureTestLoop(request) });
      return 0;
    }

    if (group === "component" && action === "list") {
      writeJson(stdout, { ok: true, components: registry.list() });
      return 0;
    }

    if (group === "component" && action === "describe") {
      if (!args[0]) throw new Error("component describe requires an id");
      writeJson(stdout, { ok: true, component: registry.describe(args[0]) });
      return 0;
    }

    if (group === "component" && action === "build") {
      if (!args[0]) throw new Error("component build requires an instance JSON file");
      writeJson(stdout, { ok: true, build: registry.build(readJsonFile(args[0])) });
      return 0;
    }

    if (group === "reference" && action === "analyze-glb") {
      if (!args[0]) throw new Error("reference analyze-glb requires a GLB file path");
      const options = args[1] ? readJsonArgument(args[1], "GLB reference options") : {};
      writeJson(stdout, { ok: true, analysis: analyzeGlbReferenceBytes(fs.readFileSync(args[0]), options) });
      return 0;
    }

    if (group === "human-geometry" && action === "profile") {
      const request = args[0] ? readJsonArgument(args[0], "human surface profile request") : {};
      writeJson(stdout, { ok: true, profile: createHumanSurfaceProfile(request) });
      return 0;
    }

    if (group === "human-geometry" && action === "generate-part") {
      const request = args[0] ? readJsonArgument(args[0], "human part request") : {};
      writeJson(stdout, { ok: true, result: generateHumanPart(request) });
      return 0;
    }

    if (group === "human-geometry" && action === "generate-lowpoly-worker") {
      const request = args[0] ? readJsonArgument(args[0], "human geometry request") : {};
      writeJson(stdout, { ok: true, result: generateLowPolyWorkerHuman(request) });
      return 0;
    }

    if (group === "human-geometry" && action === "propose-surface-refinement") {
      if (!args[0]) throw new Error("human-geometry propose-surface-refinement requires a composition JSON or manifest JSON file");
      const request = args[1] ? readJsonArgument(args[1], "human surface refinement request") : {};
      writeJson(stdout, { ok: true, proposal: proposeHumanSurfaceRefinement(readCompositionDocument(args[0]), request) });
      return 0;
    }

    if (group === "composition" && action === "analyze-human-quality") {
      if (!args[0]) throw new Error("composition analyze-human-quality requires a composition JSON or manifest JSON file");
      writeJson(stdout, { ok: true, analysis: analyzeHumanModelQuality(readCompositionDocument(args[0])) });
      return 0;
    }

    if (group === "composition" && action === "analyze-human-pose") {
      if (!args[0]) throw new Error("composition analyze-human-pose requires a composition JSON or manifest JSON file");
      writeJson(stdout, { ok: true, analysis: analyzeHumanPoseRig(readCompositionDocument(args[0])) });
      return 0;
    }

    if (group === "composition" && action === "analyze-human-reach") {
      if (!args[0] || !args[1]) throw new Error("composition analyze-human-reach requires composition and request JSON files");
      writeJson(stdout, { ok: true, analysis: analyzeHumanReach(readCompositionDocument(args[0]), readJsonArgument(args[1], "human reach request")) });
      return 0;
    }

    if (group === "composition" && action === "solve-human-reach") {
      if (!args[0] || !args[1]) throw new Error("composition solve-human-reach requires composition and request JSON files");
      writeJson(stdout, { ok: true, solution: solveHumanArmIkLite(readCompositionDocument(args[0]), readJsonArgument(args[1], "human reach IK request")) });
      return 0;
    }

    if (group === "composition" && action === "propose-human-pose") {
      if (!args[0] || !args[1]) throw new Error("composition propose-human-pose requires composition and request JSON files");
      writeJson(stdout, { ok: true, proposal: proposeHumanPoseChangeset(readCompositionDocument(args[0]), readJsonArgument(args[1], "human pose request")) });
      return 0;
    }

    if (group === "composition" && action === "propose-human-grasp") {
      if (!args[0] || !args[1]) throw new Error("composition propose-human-grasp requires composition and request JSON files");
      writeJson(stdout, { ok: true, proposal: proposeHumanGraspChangeset(readCompositionDocument(args[0]), readJsonArgument(args[1], "human grasp request")) });
      return 0;
    }

    if (group === "composition" && action === "propose-human-reach") {
      if (!args[0] || !args[1]) throw new Error("composition propose-human-reach requires composition and request JSON files");
      writeJson(stdout, { ok: true, proposal: proposeHumanReachChangeset(readCompositionDocument(args[0]), readJsonArgument(args[1], "human reach request")) });
      return 0;
    }

    if (group === "composition" && action === "propose-human-ik-reach") {
      if (!args[0] || !args[1]) throw new Error("composition propose-human-ik-reach requires composition and request JSON files");
      writeJson(stdout, { ok: true, proposal: proposeHumanIkReachChangeset(readCompositionDocument(args[0]), readJsonArgument(args[1], "human reach IK request")) });
      return 0;
    }

    if (group === "composition" && action === "apply-proposal") {
      if (!args[0] || !args[1]) throw new Error("composition apply-proposal requires composition and proposal JSON files");
      const proposalEnvelope = readJsonArgument(args[1], "composition proposal");
      const proposal = proposalEnvelope.proposal ?? proposalEnvelope;
      writeJson(stdout, { ok: true, composition: applyCompositionChangesetProposal(readCompositionDocument(args[0]), proposal) });
      return 0;
    }

    if (group === "scene" && action === "build") {
      if (!args[0]) throw new Error("scene build requires a scene JSON file");
      writeJson(stdout, { ok: true, scene: composeScene(readJsonFile(args[0]), registry) });
      return 0;
    }

    if (group === "scene" && action === "query") {
      if (!args[0]) throw new Error("scene query requires a scene JSON file");
      const scene = composeScene(readJsonFile(args[0]), registry);
      const query = args[1] ? readJsonArgument(args[1], "scene query") : {};
      const results = queryScene(scene, query);
      writeJson(stdout, { ok: true, query, count: results.length, results });
      return 0;
    }

    if (group === "scene" && action === "analyze-spatial") {
      if (!args[0]) throw new Error("scene analyze-spatial requires a scene JSON file");
      writeJson(stdout, { ok: true, analysis: analyzeSceneSpatial(composeScene(readJsonFile(args[0]), registry)) });
      return 0;
    }

    if (group === "scene" && action === "propose-align") {
      if (!args[0] || !args[1]) throw new Error("scene propose-align requires scene and request JSON files");
      const document = readJsonFile(args[0]);
      const request = readJsonArgument(args[1], "alignment request");
      writeJson(stdout, { ok: true, proposal: proposeAnchorAlignment(composeScene(document, registry), request) });
      return 0;
    }

    if (group === "scene" && action === "propose-distribute") {
      if (!args[0] || !args[1]) throw new Error("scene propose-distribute requires scene and request JSON files");
      const document = readJsonFile(args[0]);
      const request = readJsonArgument(args[1], "distribution request");
      writeJson(stdout, { ok: true, proposal: proposeLinearDistribution(composeScene(document, registry), request) });
      return 0;
    }

    if (group === "scene" && action === "apply-proposal") {
      if (!args[0] || !args[1]) throw new Error("scene apply-proposal requires scene and proposal JSON files");
      const document = readJsonFile(args[0]);
      const proposalEnvelope = readJsonArgument(args[1], "proposal");
      const proposal = proposalEnvelope.proposal ?? proposalEnvelope;
      writeJson(stdout, { ok: true, scene: applyChangesetProposal(document, proposal) });
      return 0;
    }

    throw new Error(`Unsupported command: ${[group, action].filter(Boolean).join(" ")}`);
  } catch (error) {
    writeJson(stdout, {
      ok: false,
      error: {
        code: "AGENTSCENE_CLI_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
