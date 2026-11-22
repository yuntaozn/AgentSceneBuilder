import { createBounds, cross, dot, length, normalizeTransform, subtract, unionBounds } from "./math.js";

// Custom components may report derived parameters that cannot be used to rebuild them.
const sourceParameters = new WeakMap();

export function rebuildAtTransform(registry, build, transform) {
  const parameters = sourceParameters.has(build) ? sourceParameters.get(build) : build.instance.parameters;
  return registry.build({ ...build.instance, parameters, transform });
}

export function anchorReference(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be an anchor reference string`);
  const marker = value.lastIndexOf("#");
  if (marker <= 0 || marker === value.length - 1) {
    throw new TypeError(`${name} must use instance-id#anchor-id syntax`);
  }
  return { instanceId: value.slice(0, marker), anchorId: value.slice(marker + 1) };
}

export function resolveAnchor(buildsById, reference) {
  const { instanceId, anchorId } = anchorReference(reference, "anchor reference");
  const build = buildsById.get(instanceId);
  if (!build) throw new Error(`Anchor instance does not exist: ${instanceId}`);
  if (!Object.hasOwn(build.anchors.world, anchorId)) throw new Error(`Anchor does not exist: ${reference}`);
  return build.anchors.world[anchorId];
}

export function resolveAnchorDefinition(buildsById, reference) {
  const { instanceId, anchorId } = anchorReference(reference, "anchor reference");
  const build = buildsById.get(instanceId);
  if (!build) throw new Error(`Anchor instance does not exist: ${instanceId}`);
  if (!Object.hasOwn(build.anchors.worldDefinitions ?? {}, anchorId)) throw new Error(`Anchor does not exist: ${reference}`);
  return build.anchors.worldDefinitions[anchorId];
}

export function translationToAlignAnchors(sourcePoint, targetPoint) {
  return subtract(targetPoint, sourcePoint);
}

export function isConnectionType(type) {
  return type === "connects" || type === "attachment";
}

export function readConnectionContract(relation, invalid) {
  let input = relation.contract ?? {};
  if (typeof input !== "object" || Array.isArray(input)) {
    invalid("contract", "Expected a connection contract object");
    input = {};
  }
  function value(key, fallback, valid, reason, legacyKey) {
    const legacy = legacyKey && input[key] == null && relation[legacyKey] != null;
    const candidate = (legacy ? relation[legacyKey] : input[key]) ?? fallback;
    if (valid(candidate)) return candidate;
    invalid(legacy ? legacyKey : "contract/" + key, reason);
    return fallback;
  }
  const nonnegative = number => Number.isFinite(number) && number >= 0;
  const contract = {
    contact: input.contact ?? "point",
    gapTolerance: value("gapTolerance", 1e-6, nonnegative, "Expected a finite non-negative gap tolerance", "tolerance"),
    embed: value("embed", 0, nonnegative, "Expected a finite non-negative embed distance"),
    required: value("required", true, v => typeof v === "boolean", "Expected a boolean", "required"),
    direction: value("direction", "any", v => ["any", "aligned", "opposed"].includes(v), "Expected any, aligned or opposed"),
    angularTolerance: value("angularTolerance", Math.PI / 18, v => nonnegative(v) && v <= Math.PI, "Expected radians between 0 and PI"),
  };
  const diameterMode = value("outsideDiameter", "any", v => ["any", "equal"].includes(v), "Expected any or equal");
  const diameterTolerance = value("diameterTolerance", 1e-6, nonnegative, "Expected a finite non-negative diameter tolerance");
  if (diameterMode === "equal") Object.assign(contract, { outsideDiameter: diameterMode, diameterTolerance });
  return contract;
}

export function sceneConnectionContract(relation, location) {
  return readConnectionContract(relation, (field, message) => {
    throw new TypeError(`${location}.${field.replace("/", ".")}: ${message}`);
  });
}

function decimalParts(value) {
  const [mantissa, exponent] = value.toExponential().split("e");
  const places = mantissa.split(".")[1]?.length ?? 0;
  return { digits: BigInt(mantissa.replace(".", "")), exponent: Number(exponent) - places };
}

// Nearby JSON numbers can lose significant decimal places on subtraction.
// In that case subtract their decimal coefficients before rounding the span.
function decimalSpan(a, b) {
  const span = Math.abs(a - b);
  if (a === b || (Number.isInteger(a) && Number.isInteger(b)) ||
      span >= Math.max(Math.abs(a), Math.abs(b)) / 2 || !Number.isFinite(span)) return span;
  const left = decimalParts(a), right = decimalParts(b);
  const exponent = Math.min(left.exponent, right.exponent);
  const leftDigits = left.digits * 10n ** BigInt(left.exponent - exponent);
  const rightDigits = right.digits * 10n ** BigInt(right.exponent - exponent);
  const digits = leftDigits - rightDigits;
  return Math.abs(Number(`${digits}e${exponent}`));
}

export function withinDistance(measured, limit) {
  // Allow the rounding of the norm and the limit at their own length scale.
  return Number.isFinite(measured) && measured - limit <= 4 * Number.EPSILON * limit;
}

export function withinAngle(measured, limit) {
  return measured !== null && measured <= limit + 4 * Number.EPSILON;
}

export function anchorGap(fromPoint, toPoint) {
  return length(fromPoint.map((value, axis) => decimalSpan(value, toPoint[axis])));
}

export function effectiveConnectionGap(gap, embed) {
  return gap > embed ? decimalSpan(gap, embed) : 0;
}

export function connectionGapFits(gap, { embed, gapTolerance }) {
  return withinDistance(gap, embed + gapTolerance);
}

export function measureConnectionDirection(fromDirection, toDirection, { direction, angularTolerance }) {
  const directionsAvailable = Boolean(fromDirection && toDirection);
  let directionDot = null, directionAngle = null, directionDeviation = null;
  if (directionsAvailable) {
    directionDot = Math.max(-1, Math.min(1, dot(fromDirection, toDirection)));
    const sine = length(cross(fromDirection, toDirection));
    directionAngle = Math.atan2(sine, directionDot);
    // Measuring from the desired axis directly retains tiny errors near 0 and PI.
    if (direction === "opposed") directionDeviation = Math.atan2(sine, -directionDot);
    if (direction === "aligned") directionDeviation = directionAngle;
  }
  const directionCompatible = direction === "any" || withinAngle(directionDeviation, angularTolerance);
  return { directionsAvailable, fromDirection, toDirection, directionDot, directionAngle, directionDeviation, directionCompatible };
}

export function measureConnectionDiameter(from, to, diameterTolerance) {
  const difference = from !== null && to !== null ? decimalSpan(from, to) : null;
  const compatible = difference !== null && withinDistance(difference, diameterTolerance);
  return { from, to, difference, unit: "meter", compatible };
}

export function diameterIssueCode(check) {
  if (check.compatible) return null;
  return check.difference === null ? "SCENE_CONNECTION_DIAMETER_UNAVAILABLE" : "SCENE_CONNECTION_DIAMETER_MISMATCH";
}

export function evaluateConnection(relation, fromDefinition, toDefinition, contract) {
  const fromPoint = fromDefinition.position, toPoint = toDefinition.position;
  const gap = anchorGap(fromPoint, toPoint);
  const effectiveGap = effectiveConnectionGap(gap, contract.embed);
  const positionCompatible = connectionGapFits(gap, contract);
  const orientation = measureConnectionDirection(fromDefinition.direction ?? null, toDefinition.direction ?? null, contract);
  const outsideDiameterCheck = contract.outsideDiameter === "equal"
    ? measureConnectionDiameter(declaredDiameter(fromDefinition), declaredDiameter(toDefinition), contract.diameterTolerance)
    : undefined;
  return {
    ...relation,
    contract,
    fromPoint,
    toPoint,
    gap,
    effectiveGap,
    positionCompatible,
    ...orientation,
    ...(outsideDiameterCheck ? { outsideDiameterCheck } : {}),
    connected: positionCompatible && orientation.directionCompatible && (outsideDiameterCheck?.compatible ?? true),
  };
}

function declaredDiameter(anchor) {
  return Number.isFinite(anchor.outsideDiameter) && anchor.outsideDiameter > 0 ? anchor.outsideDiameter : null;
}

export function connectionIssues(connection, location) {
  const issues = [];
  function add(code, reason, measurement) {
    issues.push({
      level: connection.contract.required ? "error" : "warning",
      code, message: `Connection ${connection.from} -> ${connection.to} failed: ${reason}`, location, measurement,
    });
  }
  if (!connection.positionCompatible) {
    add("SCENE_CONNECTION_GAP", `effective gap ${connection.effectiveGap} exceeds ${connection.contract.gapTolerance}`, {
      space: "world", unit: "meter", fromPoint: connection.fromPoint, toPoint: connection.toPoint,
      gap: connection.gap, embed: connection.contract.embed, effectiveGap: connection.effectiveGap,
      gapTolerance: connection.contract.gapTolerance,
    });
  }
  if (!connection.directionCompatible) {
    add("SCENE_CONNECTION_DIRECTION", connection.directionsAvailable
      ? `anchor directions do not satisfy ${connection.contract.direction}` : "anchor directions are missing", {
      space: "world", unit: "radian", fromDirection: connection.fromDirection, toDirection: connection.toDirection,
      direction: connection.contract.direction, angle: connection.directionAngle, deviation: connection.directionDeviation,
      angularTolerance: connection.contract.angularTolerance,
    });
  }
  const diameter = connection.outsideDiameterCheck;
  if (diameter && !diameter.compatible) {
    const measurement = {
      unit: diameter.unit, from: diameter.from, to: diameter.to, difference: diameter.difference,
      diameterTolerance: connection.contract.diameterTolerance,
    };
    const code = diameterIssueCode(diameter);
    if (diameter.difference === null) {
      const missing = [diameter.from === null && connection.from, diameter.to === null && connection.to].filter(Boolean);
      add(code, `positive outside diameter in metres required at ${missing.join(", ")}`, measurement);
    } else {
      add(code, `outside diameters ${diameter.from} m and ${diameter.to} m differ by ${diameter.difference} m`, measurement);
    }
  }
  return issues;
}

export function composeScene(document, registry) {
  if (!document || typeof document !== "object") throw new TypeError("scene document must be an object");
  if (!Array.isArray(document.instances)) throw new TypeError("scene instances must be an array");
  const builds = [];
  const buildsById = new Map();
  for (const instance of document.instances) {
    if (buildsById.has(instance.id)) throw new Error(`Duplicate scene instance id: ${instance.id}`);
    const build = registry.build({ ...instance, transform: normalizeTransform(instance.transform) });
    if (instance.parameters !== build.instance.parameters) sourceParameters.set(build, instance.parameters);
    builds.push(build);
    buildsById.set(instance.id, build);
  }

  const relations = [];
  const issues = [];
  const attachments = document.attachments === undefined ? [] : document.attachments;
  if (!Array.isArray(attachments)) throw new TypeError("attachments must be an array");
  const declaredRelations = [
    ...(document.relations ?? []),
    ...attachments.map((attachment, index) => {
      if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) throw new TypeError(`attachments[${index}] must be an object`);
      if (attachment.type !== undefined && !isConnectionType(attachment.type)) throw new TypeError(`attachments[${index}].type must be attachment or connects`);
      return { ...attachment, type: attachment.type ?? "attachment" };
    }),
  ];
  const relationCount = document.relations?.length ?? 0;
  for (const [index, relation] of declaredRelations.entries()) {
    const location = index < relationCount ? `relations[${index}]` : `attachments[${index - relationCount}]`;
    if (!relation || typeof relation !== "object") throw new TypeError(`${location} must be an object`);
    if (isConnectionType(relation.type)) {
      const from = resolveAnchorDefinition(buildsById, relation.from);
      const to = resolveAnchorDefinition(buildsById, relation.to);
      const contract = sceneConnectionContract(relation, location);
      const resolved = evaluateConnection(relation, from, to, contract);
      resolved.sourcePath = index < relationCount ? `/relations/${index}` : `/attachments/${index - relationCount}`;
      relations.push(resolved);
      if (!resolved.connected) issues.push(...connectionIssues(resolved, location));
    } else {
      relations.push({ ...relation });
    }
  }

  const bounds = unionBounds(builds.map((build) => build.bounds));
  return {
    contractVersion: "0.1",
    metadata: document.metadata ?? {},
    instances: builds,
    bounds: bounds ?? createBounds([0, 0, 0], [0, 0, 0]),
    relations,
    issues,
    ok: !issues.some((item) => item.level === "error"),
  };
}

function matches(value, expected) {
  if (expected === undefined) return true;
  if (Array.isArray(value)) return value.includes(expected);
  return value === expected;
}

export function queryScene(scene, query = {}) {
  const results = [];
  for (const build of scene.instances) {
    if (!matches(build.instance.component, query.component)) continue;
    if (query.instanceId && build.instance.id !== query.instanceId) continue;
    if (!query.semanticType && !query.nodeIdPrefix) {
      results.push({ kind: "instance", instance: build.instance, bounds: build.bounds, anchors: build.anchors.world, metrics: build.metrics });
      continue;
    }
    for (const node of build.nodes) {
      if (!matches(node.semanticType, query.semanticType)) continue;
      if (query.nodeIdPrefix && !node.id.startsWith(query.nodeIdPrefix)) continue;
      results.push({ kind: "node", instanceId: build.instance.id, node });
    }
  }
  return results;
}
