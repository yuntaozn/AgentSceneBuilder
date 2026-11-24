import {
  compileForDiagnostics, compileGeometry, hierarchyIssues, occurrences,
  orientationMatrix, selectOccurrence, validateLight,
} from "./composition.js";
import { registerGeneratedId, worldAnchorDefinition } from "./component.js";
import { checkLocalAttachments } from "./connection-check.js";
import { geometryBounds, instanceGeometryBounds } from "./geometry.js";
import { resolveMepRouteBindings } from "./mep-route-bindings.js";
import { resolvePoseControls } from "./pose-controls.js";
import { checkMonitoring } from "./monitoring.js";
import { assertVec3, identityMatrix, normalizeVector } from "./math.js";
import { referenceSuggestions } from "./reference-suggestions.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const token = key => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

// Numeric validators can name nested fields, e.g. "repetition.count[1]".
// Only extend the pointer when the field belongs to the input being checked.
function fieldPointer(path, field, value) {
  if (!field) return path;
  const keys = field.replace(/\[(\d+)\]/g, ".$1").split(".");
  if (path.endsWith("/" + keys[0])) keys.shift();
  if (object(value) && keys.length && (Object.hasOwn(value, keys[0]) || keys.length === 1)) {
    return path + "/" + keys.map(token).join("/");
  }
  return path;
}

export function isCompositionManifest(input) {
  return !input?.component && (input?.kind === "composition" ||
    (["method", "component"].includes(input?.kind) && input.editor?.document?.component === "core.composition"));
}

export function checkComposition(input, { path = "", onWorldAnchor } = {}) {
  const issues = [];
  function report(code, path, message, nodeId, relatedLocations) {
    const issue = {
      code, path, message, ...(typeof nodeId === "string" ? { nodeId } : {}),
      ...(relatedLocations?.length ? { relatedLocations } : {}),
    };
    issues.push(issue);
    return issue;
  }
  const result = () => ({ ok: !issues.some(issue => issue.level !== "warning"), issues });
  function attempt(code, path, nodeId, value, check) {
    try { return check(); }
    catch (error) { report(code, fieldPointer(path, error.field, value), error.message, nodeId); }
  }

  const manifest = isCompositionManifest(input);
  const doc = manifest ? input.editor?.document : input;
  const root = path + (manifest ? "/editor/document" : "");
  if (!object(doc)) {
    report("DOCUMENT_INVALID", root, "Expected a composition object");
    return result();
  }
  const wrapped = Object.hasOwn(doc, "component");
  if (wrapped && doc.component !== "core.composition") {
    report("COMPONENT_INVALID", root + "/component", "Expected core.composition");
    return result();
  }
  const base = wrapped ? root + "/parameters" : root;
  const unavailableRoutePorts = new Set();
  const routeSpec = resolveMepRouteBindings(wrapped ? doc.parameters : doc, (path, message, id) => {
    report("ROUTE_BINDING_INVALID", base + path, message, id);
    if (path.startsWith("/nodes/")) unavailableRoutePorts.add(id);
  });
  const spec = resolvePoseControls(routeSpec, (path, message, id) => report("POSE_CONTROL_INVALID", base + path, message, id));
  if (typeof doc.id !== "string" || !doc.id) report("ID_INVALID", root + "/id", "Composition id must be a non-empty string");
  if (!object(spec)) {
    report("DOCUMENT_INVALID", base, "Expected composition parameters");
    return result();
  }

  function checkTransform(transform, path, nodeId) {
    if (transform === undefined) return;
    if (!object(transform)) { report("TRANSFORM_INVALID", path, "Expected a transform object", nodeId); return; }
    for (const key of ["position", "rotation", "scale"]) {
      if (transform[key] !== undefined) attempt("TRANSFORM_INVALID", path + "/" + key, nodeId, null, () => assertVec3(transform[key], key));
    }
  }
  const beforeInstanceTransform = issues.length;
  if (wrapped) checkTransform(doc.transform, root + "/transform");
  const validInstanceTransform = beforeInstanceTransform === issues.length;
  const indices = new Map(), nodesById = new Map(), idPaths = new Map(), ambiguous = new Set(), expanded = new Map();
  const candidates = new Map(), blocked = new Set(), invalidPlacements = new Set();
  const hasNodes = Array.isArray(spec.nodes);
  const nodesPath = base + "/nodes";
  const candidateLocations = id => idPaths.get(id).map(path => ({ path, kind: "candidate-declaration" }));
  if (!hasNodes) report("NODES_INVALID", nodesPath, "Expected an array of nodes");
  for (const [i, node] of (hasNodes ? spec.nodes : []).entries()) {
    const path = nodesPath + "/" + i;
    if (!object(node)) { report("NODE_INVALID", path, "Expected a node object"); continue; }
    indices.set(node, i);
    const id = node.id;
    if (typeof id !== "string" || !id) report("NODE_ID_INVALID", path + "/id", "Node id must be a non-empty string");
    else if (nodesById.has(id)) {
      ambiguous.add(id);
      const paths = idPaths.get(id);
      paths.push(path + "/id");
      report("NODE_ID_DUPLICATE", path + "/id", `ID also used at ${paths[0]}`, id, [{ path: paths[0], kind: "first-declaration" }]);
    } else {
      nodesById.set(id, node);
      idPaths.set(id, [path + "/id"]);
    }

    const beforeTransform = issues.length;
    checkTransform(node.transform, path + "/transform", id);
    for (const key of ["position", "pivot"]) {
      if (node[key] !== undefined) attempt("TRANSFORM_INVALID", path + "/" + key, id, null, () => assertVec3(node[key], key));
    }
    if (beforeTransform !== issues.length || typeof id !== "string" || !id) blocked.add(node);
    // A malformed payload still supplies a usable transform to descendants.
    const candidate = { ...node };
    if (node.geometry !== undefined && !attempt("GEOMETRY_INVALID", path + "/geometry", id, node.geometry, () => compileGeometry(node, "check", identityMatrix()))) {
      delete candidate.geometry;
    }
    const beforeLight = issues.length;
    if (node.light !== undefined) attempt("LIGHT_INVALID", path + "/light/type", id, null, () => validateLight(node.light ?? {}));
    if (beforeLight !== issues.length) delete candidate.light;
    const beforePlacement = issues.length;
    const placements = attempt("REPETITION_INVALID", path + "/repetition", id, node.repetition, () => occurrences(node.repetition));
    if (placements) {
      if (node.repetition) expanded.set(node, placements);
      if (node.orientation && placements.length) {
        attempt("ORIENTATION_INVALID", path + "/orientation", id, node.orientation, () => orientationMatrix(node.orientation, placements[0]));
      }
    }
    if (beforePlacement !== issues.length) {
      // Preserve only the parent frame. This node's outputs and bound anchors depend on its placement.
      invalidPlacements.add(node);
      delete candidate.geometry;
      delete candidate.light;
      delete candidate.orientation;
      delete candidate.repetition;
    }
    candidates.set(node, candidate);
  }
  const missingParents = [];
  for (const [node, code, reason] of hierarchyIssues(indices.keys(), nodesById, ambiguous)) {
    blocked.add(node);
    let relatedLocations;
    if (code === "PARENT_AMBIGUOUS") relatedLocations = candidateLocations(node.parent);
    if (code === "PARENT_CYCLE" && node.parent !== node.id) {
      const parentIndex = indices.get(nodesById.get(node.parent));
      relatedLocations = [{ path: nodesPath + "/" + parentIndex + "/parent", kind: "cycle-edge" }];
    }
    const issue = report(code, nodesPath + "/" + indices.get(node) + "/parent", reason, node.id, relatedLocations);
    if (code === "PARENT_MISSING") missingParents.push({ issue, parent: node.parent });
  }

  // Walk reachable branches once, irrespective of declaration order. Retain source
  // order for generated-ID ownership and map filtered indices back to source pointers.
  const children = new Map(), reachable = new Set();
  for (const node of candidates.keys()) {
    if (blocked.has(node) || ambiguous.has(node.id)) continue;
    if (!node.parent) reachable.add(node);
    else {
      if (!children.has(node.parent)) children.set(node.parent, []);
      children.get(node.parent).push(node);
    }
  }
  for (const node of reachable) {
    for (const child of children.get(node.id) ?? []) reachable.add(child);
  }
  for (const { issue, parent } of missingParents) {
    const values = referenceSuggestions(parent, nodesById.keys(), id => {
      const node = nodesById.get(id);
      return reachable.has(node) && !node.repetition;
    });
    if (values.length) issue.suggestedValues = values;
  }

  function selectAnchorOccurrence(node, selector) {
    return selectOccurrence(node.id, expanded.get(node).map(occurrence => ({ occurrence })), selector);
  }

  function canBindAnchor(id, selector) {
    const node = nodesById.get(id);
    if (!reachable.has(node) || invalidPlacements.has(node)) return false;
    if (!node.repetition) return true;
    if (selector === undefined) return false;
    try {
      selectAnchorOccurrence(node, selector);
      return true;
    } catch {
      return false;
    }
  }

  const sources = [...indices.keys()].filter(node => reachable.has(node));
  const anchors = [];
  if (spec.anchors !== undefined && !object(spec.anchors)) report("ANCHORS_INVALID", base + "/anchors", "Expected an object keyed by anchor id");
  for (const [name, anchor] of Object.entries(object(spec.anchors) ? spec.anchors : {})) {
    const path = base + "/anchors/" + token(name);
    const array = Array.isArray(anchor);
    const id = anchor?.node;
    const onGeometry = anchor?.onGeometry !== undefined;
    if (unavailableRoutePorts.has(id) && ["route-start", "route-end"].includes(anchor?.kind)) continue;
    const beforeAnchor = issues.length;
    if (!onGeometry) {
      attempt("ANCHOR_POSITION_INVALID", array ? path : path + "/position", id, null,
        () => assertVec3(array ? anchor : anchor?.position, "position"));
    }
    if (anchor?.direction !== undefined) {
      attempt("ANCHOR_DIRECTION_INVALID", path + "/direction", id, null, () => normalizeVector(anchor.direction, "direction"));
    }
    if (id === undefined) {
      if (onGeometry) report("ANCHOR_NODE_MISSING", path + "/node", "A geometry anchor requires a node");
      else if (beforeAnchor === issues.length) anchors.push([name, anchor]);
      continue;
    }
    if (!hasNodes) continue;
    const owner = nodesById.get(id);
    if (!owner || ambiguous.has(id)) {
      const issue = report(owner ? "ANCHOR_NODE_AMBIGUOUS" : "ANCHOR_NODE_MISSING", path + "/node",
        owner ? `Anchor node ID is duplicated: ${id}` : `Anchor refers to unknown node: ${id}`, id,
        owner ? candidateLocations(id) : undefined);
      if (!owner) {
        const values = referenceSuggestions(id, nodesById.keys(), name => canBindAnchor(name, anchor.occurrence));
        if (values.length) issue.suggestedValues = values;
      }
    } else if (owner.repetition && expanded.has(owner)) {
      attempt("ANCHOR_OCCURRENCE_INVALID", path + "/occurrence", id, null,
        () => selectAnchorOccurrence(owner, anchor.occurrence));
    }
    if (beforeAnchor === issues.length && reachable.has(owner) && !invalidPlacements.has(owner) &&
        (!onGeometry || !owner.geometry || candidates.get(owner).geometry)) anchors.push([name, anchor]);
  }
  const instanceId = typeof doc.id === "string" && doc.id ? doc.id : "check";
  const subset = { nodes: sources.map(node => candidates.get(node)), anchors: Object.fromEntries(anchors) };
  const build = attempt("COMPILE_FAILED", base, undefined, null, () => compileForDiagnostics(subset, instanceId, (code, keys, reason, id) => {
    if (keys[0] === "nodes") keys[1] = indices.get(sources[keys[1]]);
    report(code, base + "/" + keys.map(token).join("/"), reason, id);
  }));
  const worldAnchors = new Map();
  const finish = () => {
    checkMonitoring(spec, name => worldAnchors.get(name),
      (path, message, nodeId) => report("MONITORING_INVALID", base + path, message, nodeId));
    checkLocalAttachments(spec, base, name => worldAnchors.get(name), (code, path, message, context) => {
      issues.push({ code, path, message, level: "error", ...context });
    });
    return result();
  };
  if (!build) return finish();
  const generatedIds = new Set(), bounds = [];
  for (const node of build.nodes) {
    const id = node.metadata.compositionNodeId;
    const path = base + "/nodes/" + indices.get(nodesById.get(id));
    attempt("GENERATED_ID_DUPLICATE", path + "/id", id, null, () => registerGeneratedId(generatedIds, node.id, instanceId));
    if (node.kind === "geometry") {
      const box = attempt("BOUNDS_INVALID", path + "/geometry", id, null, () => geometryBounds(node));
      if (box) bounds.push({ node, bounds: box });
    }
  }
  if (validInstanceTransform) {
    const transform = wrapped ? doc.transform : undefined;
    attempt("BOUNDS_INVALID", wrapped ? root + "/transform" : base, undefined, null, () => instanceGeometryBounds(bounds, transform));
    for (const [name, anchor] of Object.entries(build.anchors)) {
      const definition = Array.isArray(anchor) ? { position: anchor } : anchor;
      const path = base + "/anchors/" + token(name) + (definition.direction ? "/direction" : "");
      const world = attempt("ANCHOR_TRANSFORM_INVALID", path, definition.node, null, () => worldAnchorDefinition(definition, transform));
      if (world) {
        worldAnchors.set(name, world);
        onWorldAnchor?.(name, world);
      }
    }
  }
  return finish();
}
