import { checkComposition } from "./composition-check.js";
import { assertVec3 } from "./math.js";
import { anchorReference } from "./scene.js";
import { checkConnectionList } from "./connection-check.js";
import { referenceSuggestions } from "./reference-suggestions.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const named = value => typeof value === "string" && value.length > 0;

export function checkScene(document, registry) {
  const issues = [];
  function report(code, path, message, context = {}) {
    issues.push({ code, path, message, level: "error", ...context });
  }
  if (!object(document)) {
    report("SCENE_DOCUMENT_INVALID", "", "Expected a scene object");
    return { ok: false, issues };
  }

  const knownComponents = new Map(registry.list().map(component => [component.id, component]));
  const idPaths = new Map();
  const ports = new Map();
  if (!Array.isArray(document.instances)) report("SCENE_INSTANCES_INVALID", "/instances", "Expected an array of instances");
  for (const [index, instance] of (Array.isArray(document.instances) ? document.instances : []).entries()) {
    const path = "/instances/" + index;
    if (!object(instance)) {
      report("SCENE_INSTANCE_INVALID", path, "Expected an instance object");
      continue;
    }
    const { id, component } = instance;
    const context = named(id) ? { instanceId: id } : {};
    if (!named(id)) report("SCENE_INSTANCE_ID_INVALID", path + "/id", "Expected a non-empty instance ID");
    else if (idPaths.has(id)) {
      const paths = idPaths.get(id);
      paths.push(path + "/id");
      report("SCENE_INSTANCE_ID_DUPLICATE", path + "/id", `ID also used at ${paths[0]}`, {
        ...context, relatedLocations: [{ path: paths[0], kind: "first-declaration" }],
      });
    } else idPaths.set(id, [path + "/id"]);

    if (component === "core.composition" && knownComponents.has(component)) {
      const anchors = new Map();
      const result = checkComposition({ ...instance, id: named(id) ? id : "check" }, {
        path, onWorldAnchor: (key, value) => anchors.set(key, value),
      });
      for (const issue of result.issues) issues.push({ level: "error", ...issue, ...context });
      // A declared anchor on a broken branch has already been diagnosed at its source.
      const declared = instance.parameters?.anchors;
      if (object(instance.parameters) && (declared === undefined || object(declared))) {
        ports.set(id, { anchors, declared });
      }
      continue;
    }

    let transform = instance.transform;
    if (transform !== undefined) {
      const before = issues.length;
      if (!object(transform)) report("TRANSFORM_INVALID", path + "/transform", "Expected a transform object", context);
      else for (const key of ["position", "rotation", "scale"]) {
        if (transform[key] === undefined) continue;
        try { assertVec3(transform[key], key); }
        catch (error) { report("TRANSFORM_INVALID", path + "/transform/" + key, error.message, context); }
      }
      if (before !== issues.length) transform = undefined;
    }
    if (!knownComponents.has(component)) {
      report("SCENE_COMPONENT_UNKNOWN", path + "/component", named(component) ? `Unknown component: ${component}` : "Expected a component ID", context);
      continue;
    }
    if (instance.parameters !== undefined && !object(instance.parameters)) {
      report("SCENE_PARAMETERS_INVALID", path + "/parameters", "Expected a parameters object", context);
      continue;
    }
    try {
      const build = registry.build({ ...instance, id: named(id) ? id : "check", transform });
      if (transform === instance.transform) {
        ports.set(id, { anchors: new Map(Object.entries(build.anchors.worldDefinitions)) });
      }
    } catch (error) {
      for (const issue of error.parameterIssues ?? [error]) {
        const keys = typeof issue.field === "string" ? issue.field.replace(/\[(\d+)\]/g, ".$1").split(".") : [];
        const knownField = keys.length && Object.hasOwn(knownComponents.get(component).parameters ?? {}, keys[0]);
        const suffix = knownField ? "/" + keys.map(key => key.replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : "";
        report("SCENE_INSTANCE_BUILD_INVALID", path + "/parameters" + suffix, issue.message, context);
      }
    }
  }

  function endpoint(reference, path, context) {
    let parsed;
    try { parsed = anchorReference(reference, "anchor reference"); }
    catch (error) { report("SCENE_REFERENCE_INVALID", path, error.message, context); return; }
    const { instanceId, anchorId } = parsed;
    const owner = { ...context, instanceId };
    const paths = idPaths.get(instanceId);
    if (!paths) {
      if (Array.isArray(document.instances)) {
        const ids = referenceSuggestions(instanceId, idPaths.keys(), id => idPaths.get(id).length === 1 && ports.get(id)?.anchors.has(anchorId));
        const suggestedValues = ids.map(id => `${id}#${anchorId}`);
        report("SCENE_INSTANCE_MISSING", path, `Unknown instance: ${instanceId}`, {
          ...owner, ...(suggestedValues.length ? { suggestedValues } : {}),
        });
      }
      return;
    }
    if (paths.length > 1) {
      const relatedLocations = paths.map(path => ({ path, kind: "candidate-declaration" }));
      report("SCENE_INSTANCE_AMBIGUOUS", path, `Duplicate instance ID: ${instanceId}`, { ...owner, relatedLocations });
      return;
    }
    const record = ports.get(instanceId);
    if (!record) return;
    const definition = record.anchors.get(anchorId);
    if (!definition && !Object.hasOwn(record.declared ?? {}, anchorId)) {
      const names = referenceSuggestions(anchorId, record.anchors.keys(), name => !name.includes("#"));
      const suggestedValues = names.map(name => `${instanceId}#${name}`);
      report("SCENE_ANCHOR_MISSING", path, `Unknown anchor: ${reference}`, {
        ...owner, ...(suggestedValues.length ? { suggestedValues } : {}),
      });
    }
    if (definition) return { instanceId, definition };
  }

  checkConnectionList(document.relations, "/relations", { attachmentsOnly: false, endpoint, report });
  checkConnectionList(document.attachments, "/attachments", { attachmentsOnly: true, endpoint, report });
  return { ok: !issues.some(issue => issue.level === "error"), issues };
}
