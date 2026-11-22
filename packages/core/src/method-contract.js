const OUTPUT_TYPES = new Set([
  "facts",
  "candidates",
  "proposal",
  "generated-composition",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasComposition(value) {
  return isObject(value?.composition) && value.composition.component === "core.composition";
}

function hasCandidates(value) {
  return Array.isArray(value?.candidates) && Object.hasOwn(value, "selected");
}

function hasProposalShape(value) {
  return Array.isArray(value?.changes) && isObject(value?.facts);
}

export function classifyMethodResult(value) {
  if (!isObject(value)) return "unknown";
  if (hasComposition(value)) return "generated-composition";
  if (hasCandidates(value)) return "candidates";
  if (hasProposalShape(value)) return "proposal";
  return "facts";
}

export function methodResultContract(value, { expectedType } = {}) {
  const outputType = classifyMethodResult(value);
  const issues = [];
  if (expectedType !== undefined && !OUTPUT_TYPES.has(expectedType)) {
    issues.push({ code: "UNKNOWN_EXPECTED_METHOD_OUTPUT", message: `Unknown expected method output type: ${expectedType}` });
  }
  if (outputType === "unknown") {
    issues.push({ code: "METHOD_RESULT_NOT_OBJECT", message: "Method result must be an object." });
  }
  if (expectedType !== undefined && OUTPUT_TYPES.has(expectedType) && outputType !== expectedType) {
    issues.push({ code: "METHOD_RESULT_TYPE_MISMATCH", message: `Expected ${expectedType}, received ${outputType}.` });
  }
  if (outputType === "facts" && !value.kind && !value.method) {
    issues.push({ code: "FACTS_RESULT_MISSING_KIND", message: "Facts results should expose kind or method." });
  }
  if (outputType === "candidates" && value.selected !== null) {
    issues.push({ code: "CANDIDATES_SHOULD_NOT_AUTO_SELECT", message: "Candidate methods must leave selected as null unless a caller explicitly chooses." });
  }
  if (outputType === "proposal" && value.applied === true) {
    issues.push({ code: "PROPOSAL_MUST_NOT_BE_APPLIED", message: "Proposal results must describe changes without applying them." });
  }
  if (outputType === "generated-composition") {
    if (!value.method && !value.composition.parameters?.metrics?.method) {
      issues.push({ code: "GENERATED_COMPOSITION_MISSING_METHOD", message: "Generated compositions should identify the generating method." });
    }
    if (!Array.isArray(value.composition.parameters?.nodes)) {
      issues.push({ code: "GENERATED_COMPOSITION_MISSING_NODES", message: "Generated CompositionSpec must include parameters.nodes." });
    }
  }
  return {
    kind: "method-result-contract",
    outputType,
    ok: issues.length === 0,
    reviewRequired: outputType === "proposal" || outputType === "candidates",
    mutatesInput: false,
    issues,
  };
}

export function assertMethodResultContract(value, options = {}) {
  const contract = methodResultContract(value, options);
  if (!contract.ok) {
    const message = contract.issues.map(issue => issue.code).join(", ");
    throw new Error(`Method result contract failed: ${message}`);
  }
  return contract;
}
