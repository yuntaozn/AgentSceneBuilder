#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { publicRegistryDomains, searchPublicRegistry } from "../../../registry/catalog.js";
import { describeJsonSyntax, duplicateJsonKeyDiagnostics, indexJsonSource, jsonRangeLocator } from "../../core/src/json-source.js";
import {
  analyzeSceneSpatial,
  analyzeHumanPoseRig,
  analyzeHumanReach,
  analyzeHumanModelQuality,
  analyzeMonitoring,
  analyzeGlbReferenceBytes,
  analyzePath,
  applyCompositionChangesetProposal,
  applyChangesetProposal,
  composeScene,
  checkComposition,
  isCompositionManifest,
  checkScene,
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
  "registry search [query] [--kind <component|method|composition>] [--domain <domain>]",
  "component list",
  "component describe <id>",
  "component build <instance.json|manifest.json>",
  "composition check <composition.json|manifest.json|-> [--source-ranges] [--reject-duplicate-keys]",
  "composition monitor <composition.json|manifest.json> [pointId]",
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
  "scene check <scene.json|-> [--source-ranges] [--reject-duplicate-keys]",
  "scene build <scene.json>",
  "scene query <scene.json> [query.json|json]",
  "scene analyze-spatial <scene.json>",
  "scene propose-align <scene.json> <request.json|json>",
  "scene propose-distribute <scene.json> <request.json|json>",
  "scene apply-proposal <scene.json> <proposal.json|json>",
  "path analyze <request.json|json>",
  "path orthogonal-candidates <request.json|json>",
  "path sample <request.json|json>",
  "mep route-with-clips [request.json|json|-]",
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

function withCheckSourceRanges(result, text, locate) {
  if (!result.issues.length) return result;
  let source;
  try {
    source = indexJsonSource(text);
  } catch (error) {
    // The source parser can exhaust the JS stack on deeply nested documents accepted by JSON.parse.
    if (error instanceof RangeError) return result;
    throw error;
  }
  const [first] = result.issues;
  if (first.code === "JSON_INVALID") {
    const issues = describeJsonSyntax(text, source.syntaxErrors).map(({ offset, length, ...diagnostic }) => ({
      ...first, ...diagnostic, sourceRange: locate({ offset, length }),
    }));
    return issues.length ? { ...result, issues } : result;
  }
  const locateIssue = location => {
    const range = source.rangeForPointer(location.path);
    return range ? { ...location, sourceRange: locate(range) } : location;
  };
  const issues = result.issues.map(issue => {
    const located = locateIssue(issue);
    return issue.relatedLocations ? { ...located, relatedLocations: issue.relatedLocations.map(locateIssue) } : located;
  });
  return { ...result, issues };
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
      let request = {};
      if (args[0]) request = args[0] === "-" ? readJsonFile(0) : readJsonArgument(args[0], "MEP route request");
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

    if (group === "registry" && action === "search") {
      const { positionals, values: { kind, domain } } = parseArgs({
        args,
        allowPositionals: true,
        options: {
          kind: { type: "string", default: "all" },
          domain: { type: "string", default: "all" },
        },
      });
      const query = positionals.join(" ").trim();
      if (!query && kind === "all" && domain === "all") throw new Error("registry search requires a search term or filter");
      if (!["all", "component", "method", "composition"].includes(kind)) {
        throw new Error("registry search --kind must be component, method, composition, or all");
      }
      const root = new URL("../../../", import.meta.url);
      const catalog = readJsonFile(new URL("registry/registry.json", root));
      if (domain !== "all" && !publicRegistryDomains(catalog).some(([key]) => key === domain)) {
        throw new Error(`Unknown public registry domain: ${domain}`);
      }
      const results = searchPublicRegistry(catalog, query, kind, domain).map(({ id, kind, title, summary, source }) => ({
        id, kind, title, summary, manifestPath: fileURLToPath(new URL(source, root)),
      }));
      writeJson(stdout, { ok: true, count: results.length, results });
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
      const input = readJsonFile(args[0]);
      const instance = isCompositionManifest(input) ? input.editor?.document ?? input : input;
      writeJson(stdout, { ok: true, build: registry.build(instance) });
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

    if ((group === "composition" || group === "scene") && action === "check") {
      const level = group === "scene" ? { level: "error" } : {};
      const withRanges = args.includes("--source-ranges");
      const rejectDuplicates = args.includes("--reject-duplicate-keys");
      const sourcePath = args.find(arg => arg !== "--source-ranges" && arg !== "--reject-duplicate-keys");
      if (!sourcePath) {
        writeJson(stdout, { ok: false, issues: [{ code: "INPUT_REQUIRED", path: "", message: "Expected a JSON file or - for stdin", ...level }] });
        return 2;
      }
      let text, input;
      try {
        text = fs.readFileSync(sourcePath === "-" ? 0 : sourcePath, "utf8");
        input = JSON.parse(text);
      } catch (error) {
        const code = error instanceof SyntaxError ? "JSON_INVALID" : "FILE_UNREADABLE";
        const result = { ok: false, issues: [{ code, path: "", message: error.message, ...level }] };
        writeJson(stdout, withRanges && code === "JSON_INVALID" ? withCheckSourceRanges(result, text, jsonRangeLocator(text)) : result);
        return 2;
      }
      let result = group === "scene" ? checkScene(input, registry) : checkComposition(input);
      const locate = withRanges ? jsonRangeLocator(text) : undefined;
      if (locate) result = withCheckSourceRanges(result, text, locate);
      if (rejectDuplicates) {
        const issues = duplicateJsonKeyDiagnostics(text, { level: level.level, locate });
        if (issues.length) result = { ...result, ok: false, issues: [...issues, ...result.issues] };
      }
      writeJson(stdout, result);
      return result.ok ? 0 : 2;
    }

    if (group === "composition" && action === "monitor") {
      if (!args[0] || args.length > 2) throw new Error("composition monitor requires a document path and optionally one point ID");
      const input = readJsonFile(args[0]);
      const result = checkComposition(input);
      if (!result.ok) {
        writeJson(stdout, result);
        return 2;
      }
      const source = isCompositionManifest(input) ? input.editor.document : input;
      const document = source.component ? source : { id: source.id, component: "core.composition", parameters: source };
      writeJson(stdout, { ok: true, analysis: analyzeMonitoring(document, registry, { pointId: args[1] }) });
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
      writeJson(stdout, { ok: true, proposal: proposeAnchorAlignment(composeScene(document, registry), request, registry) });
      return 0;
    }

    if (group === "scene" && action === "propose-distribute") {
      if (!args[0] || !args[1]) throw new Error("scene propose-distribute requires scene and request JSON files");
      const document = readJsonFile(args[0]);
      const request = readJsonArgument(args[1], "distribution request");
      writeJson(stdout, { ok: true, proposal: proposeLinearDistribution(composeScene(document, registry), request, registry) });
      return 0;
    }

    if (group === "scene" && action === "apply-proposal") {
      if (!args[0] || !args[1]) throw new Error("scene apply-proposal requires scene and proposal JSON files");
      const document = readJsonFile(args[0]);
      const proposalEnvelope = readJsonArgument(args[1], "proposal");
      const proposal = proposalEnvelope != null && Object.hasOwn(proposalEnvelope, "proposal") ? proposalEnvelope.proposal : proposalEnvelope;
      writeJson(stdout, { ok: true, scene: applyChangesetProposal(document, proposal, registry) });
      return 0;
    }

    throw new Error(`Unsupported command: ${[group, action].filter(Boolean).join(" ")}`);
  } catch (error) {
    let details = { code: "AGENTSCENE_CLI_ERROR" };
    if (error.code === "MEP_ROUTE_INVALID") details = { code: error.code, ...error.details };
    if (error.code === "SCENE_PROPOSAL_CONFLICT") details = { code: error.code, conflicts: error.conflicts };
    if (["SCENE_ALIGNMENT_TARGET_MISSED", "SCENE_DISTRIBUTION_TARGET_MISSED", "SCENE_CONNECTION_MEASUREMENT_INVALID"].includes(error.code)) {
      details = { code: error.code };
    }
    if (error.code === "SCENE_BOUNDS_MISSING") details = { code: error.code, instanceIds: error.instanceIds };
    writeJson(stdout, {
      ok: false,
      ...(error.code === "MEP_ROUTE_INVALID" ? { issues: error.issues } : {}),
      error: {
        ...details,
        ...(error.measurement ? { measurement: error.measurement } : {}),
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
