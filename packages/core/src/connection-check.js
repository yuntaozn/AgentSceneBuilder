import { connectionIssues, evaluateConnection, isConnectionType, readConnectionContract } from "./scene.js";
import { referenceSuggestions } from "./reference-suggestions.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const named = value => typeof value === "string" && value.length > 0;

export function checkConnectionList(entries, base, { attachmentsOnly, endpoint, report }) {
  if (entries === undefined) return;
  if (!Array.isArray(entries)) {
    report("SCENE_RELATIONS_INVALID", base, "Expected an array");
    return;
  }
  for (const [index, relation] of entries.entries()) {
    const path = `${base}/${index}`;
    if (!object(relation)) { report("SCENE_RELATION_INVALID", path, "Expected a relation object"); continue; }
    const context = named(relation.id) ? { relationId: relation.id } : {};
    if (attachmentsOnly) {
      if (relation.type !== undefined && !isConnectionType(relation.type)) {
        report("ATTACHMENT_TYPE_INVALID", path + "/type", "Expected attachment or connects", context);
      }
    } else if (!isConnectionType(relation.type)) {
      if (!named(relation.type)) report("SCENE_RELATION_INVALID", path + "/type", "Expected a non-empty relation type", context);
      continue;
    }
    const from = endpoint(relation.from, path + "/from", context);
    const to = endpoint(relation.to, path + "/to", context);
    const invalid = new Set();
    const contract = readConnectionContract(relation, (field, message) => {
      invalid.add(field);
      report("SCENE_CONTRACT_INVALID", path + "/" + field, message, context);
    });
    if (!from || !to || invalid.has("contract")) continue;
    const connection = evaluateConnection(relation, from.definition, to.definition, contract);
    for (const { code, message, level, measurement } of connectionIssues(connection, path)) {
      let field;
      if (code === "SCENE_CONNECTION_GAP") {
        if (invalid.has("contract/gapTolerance") || invalid.has("contract/embed") || invalid.has("tolerance")) continue;
        field = relation.contract?.gapTolerance != null ? "contract/gapTolerance" : relation.tolerance != null ? "tolerance" : "to";
      } else if (code === "SCENE_CONNECTION_DIRECTION") {
        if (invalid.has("contract/angularTolerance")) continue;
        field = "contract/direction";
      } else {
        if (invalid.has("contract/diameterTolerance")) continue;
        field = "contract/outsideDiameter";
      }
      report(code, path + "/" + field, message, {
        ...context, level, measurement, from: relation.from, to: relation.to,
        ...(from.instanceId ? { instanceIds: [...new Set([from.instanceId, to.instanceId])] } : {}),
      });
    }
  }
}

export function checkLocalAttachments(spec, base, lookup, report) {
  let anchorNames;
  function endpoint(name, path, context) {
    if (!named(name)) {
      report("ATTACHMENT_REFERENCE_INVALID", path, "Expected a local anchor name", context);
    } else if (!Object.hasOwn(spec.anchors ?? {}, name)) {
      anchorNames ??= object(spec.anchors) ? Object.keys(spec.anchors) : [];
      const suggestedValues = referenceSuggestions(name, anchorNames, candidate => {
        try { return Boolean(lookup(candidate)); } catch { return false; }
      });
      report("ATTACHMENT_ANCHOR_MISSING", path, `Unknown local anchor: ${name}`, {
        ...context, ...(suggestedValues.length ? { suggestedValues } : {}),
      });
    } else {
      const definition = lookup(name);
      if (definition) return { definition };
    }
  }
  checkConnectionList(spec.attachments, base + "/attachments", { attachmentsOnly: true, endpoint, report });
}
