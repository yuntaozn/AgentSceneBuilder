import { length, normalizeTransform } from "./math.js";
import {
  anchorGap, anchorReference, connectionGapFits, diameterIssueCode, effectiveConnectionGap,
  measureConnectionDiameter, measureConnectionDirection, readConnectionContract,
} from "./scene.js";

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function proposalField(path, reason, message, instanceId) {
  return { source: "proposal", path, reason, message, ...(instanceId === undefined ? {} : { instanceId }) };
}

export function checkProposalVector(value, path, report) {
  if (!Array.isArray(value) || value.length !== 3) {
    report(path, "Expected exactly three numbers");
    return false;
  }
  let valid = true;
  for (let i = 0; i < 3; i++) {
    if (Number.isFinite(value[i])) continue;
    report(`${path}/${i}`, "Expected a finite number");
    valid = false;
  }
  return valid;
}

function readTransform(change, key, path, id, conflicts) {
  const value = change[key];
  const field = `${path}/${key}`;
  if (!record(value)) {
    conflicts.push(proposalField(field, value == null ? key + "-missing" : "transform-invalid", `Expected an object for ${key}`, id));
    return;
  }
  const count = conflicts.length;
  const report = (path, message) => conflicts.push(proposalField(path, "transform-invalid", message, id));
  for (const name of ["position", "rotation", "scale"]) {
    if (value[name] !== undefined) checkProposalVector(value[name], `${field}/${name}`, report);
  }
  if (conflicts.length === count) return normalizeTransform(value);
}

export function readProposalChanges(changes, conflicts) {
  const groups = new Map();
  if (!Array.isArray(changes)) {
    conflicts.push(proposalField("/changes", "changes-invalid", "Expected an array of changes"));
    return groups;
  }
  for (const [index, change] of changes.entries()) {
    const path = `/changes/${index}`;
    if (!record(change)) {
      conflicts.push(proposalField(path, "change-invalid", "Expected a change object"));
      continue;
    }
    const id = typeof change.instanceId === "string" && change.instanceId.length ? change.instanceId : undefined;
    if (id === undefined) conflicts.push(proposalField(path + "/instanceId", "instance-id-invalid", "Expected a non-empty instance ID"));
    else if (!groups.has(id)) groups.set(id, []);
    if (change.operation !== "update-instance-transform") {
      conflicts.push(proposalField(path + "/operation", "operation-unsupported", "Expected update-instance-transform", id));
      if (id !== undefined) groups.get(id).push({ index, change, beforeConflicts: [] });
      continue;
    }
    const proposed = readTransform(change, "after", path, id, conflicts);
    // A completed step no longer needs its precondition. Report it only once the live pose is known.
    const beforeConflicts = [];
    const expected = readTransform(change, "before", path, id, beforeConflicts);
    if (id === undefined) {
      conflicts.push(...beforeConflicts);
      continue;
    }
    groups.get(id).push({ index, change, proposed, expected, beforeConflicts });
  }
  return groups;
}

export function readDistributionPlacements(rows, conflicts) {
  const placements = new Map();
  const order = [];
  if (!Array.isArray(rows)) {
    conflicts.push(proposalField("/facts/placements", "distribution-bounds-missing", "Expected an array of placements"));
    return { placements, order };
  }
  const firstPaths = new Map();
  for (const [index, row] of rows.entries()) {
    const path = `/facts/placements/${index}`;
    const id = typeof row?.instanceId === "string" && row.instanceId.length ? row.instanceId : undefined;
    order.push(id); // Keep invalid rows in the input order so unrelated neighbours are never paired.
    if (!record(row)) {
      conflicts.push(proposalField(path, "placement-invalid", "Expected a placement object"));
      continue;
    }
    const count = conflicts.length;
    if (id === undefined) {
      conflicts.push(proposalField(path + "/instanceId", "instance-id-invalid", "Expected a non-empty instance ID"));
    } else if (firstPaths.has(id)) {
      conflicts.push({ ...proposalField(path + "/instanceId", "placement-duplicate", "Expected one placement per instance", id),
        firstPath: firstPaths.get(id) });
    } else firstPaths.set(id, path + "/instanceId");
    if (!Number.isFinite(row.proposedMin)) conflicts.push(proposalField(path + "/proposedMin", "distribution-bounds-missing", "Expected a finite lower bound", id));
    if (!Number.isFinite(row.size) || row.size < 0) conflicts.push(proposalField(path + "/size", "distribution-bounds-missing", "Expected a finite non-negative size", id));
    if (id !== undefined) placements.set(id, count === conflicts.length ? row : null);
  }
  return { placements, order };
}

const isDistance = value => Number.isFinite(value) && value >= 0;
const isAngle = value => isDistance(value) && value <= Math.PI;
const gapIssueCode = "SCENE_CONNECTION_GAP";
const portIssueKinds = new Map([
  ["SCENE_CONNECTION_DIRECTION", "direction"],
  ["SCENE_CONNECTION_DIAMETER_MISMATCH", "diameter"],
  ["SCENE_CONNECTION_DIAMETER_UNAVAILABLE", "diameter"],
]);

function gapFromRecordedPoints(measurement, path, report) {
  const fromValid = checkProposalVector(measurement.fromPoint, path + "/fromPoint", report);
  const toValid = checkProposalVector(measurement.toPoint, path + "/toPoint", report);
  if (!fromValid || !toValid) return;
  const distance = anchorGap(measurement.fromPoint, measurement.toPoint);
  if (Number.isFinite(distance)) return distance;
  report(path, "Distance between the recorded world points exceeds the finite metre range");
}

// Recorded inputs round-trip through JSON; norms and atan2 can differ by a few bits across engines.
function sameMagnitude(a, b) {
  return Math.abs(a - b) <= 4 * Number.EPSILON * Math.max(a, b);
}

function checkGapMeasurement(measurement, path, field, state, contract, unique, report) {
  const pointDistance = gapFromRecordedPoints(measurement, path, report);
  let gap = state.gap;
  if (isDistance(pointDistance) && isDistance(measurement.gap)) {
    if (sameMagnitude(pointDistance, measurement.gap)) {
      if (unique && isDistance(gap) && !sameMagnitude(pointDistance, gap)) {
        report(field + "/gap", "Phase gap disagrees with the recorded endpoints and issue measurement", { expected: measurement.gap, actual: gap });
        gap = measurement.gap;
      }
    } else if (!isDistance(gap) || !sameMagnitude(pointDistance, gap)) {
      report(path, "Distance between the recorded world points disagrees with measurement.gap", { expected: measurement.gap, actual: pointDistance });
    }
  }
  const effectiveGap = isDistance(gap) && isDistance(contract?.embed) ? effectiveConnectionGap(gap, contract.embed) : state.effectiveGap;
  for (const [key, expected] of Object.entries({
    space: "world", unit: "meter", gap, effectiveGap, embed: contract?.embed, gapTolerance: contract?.gapTolerance,
  })) {
    const actual = measurement[key];
    if (key !== "space" && key !== "unit") {
      if (!isDistance(actual)) {
        report(path + "/" + key, "Expected a finite non-negative distance in metres");
        continue;
      }
      if (!isDistance(expected)) continue;
    }
    if (actual !== expected) report(path + "/" + key, "Value disagrees with the reviewed gap measurement or contract", { expected, actual });
  }
  return gap;
}

function checkMeasuredFields(measurement, fields, path, report) {
  for (const [key, expected] of Object.entries(fields)) {
    const actual = measurement[key];
    if (expected === undefined || actual === expected) continue;
    const sameVector = Array.isArray(expected) && Array.isArray(actual) &&
      actual.length === expected.length && expected.every((component, i) => component === actual[i]);
    if (sameVector) continue;
    if ((key === "angle" || key === "deviation") && isAngle(expected) && isAngle(actual) && sameMagnitude(actual, expected)) continue;
    report(path + "/" + key, "Value disagrees with the reviewed port measurements or contract", { expected, actual });
  }
}

function checkWorldDirection(value, path, report) {
  if (value === null) return true;
  if (!checkProposalVector(value, path, report)) return false;
  if (Math.abs(length(value) - 1) <= 8 * Number.EPSILON) return true;
  report(path, "Expected a unit direction vector in world space or null");
  return false;
}

function checkOutsideDiameter(value, path, report) {
  if (value === null || (Number.isFinite(value) && value > 0)) return true;
  report(path, "Expected a positive outside diameter in metres or null");
  return false;
}

function readPortPair(pair, path, fields, validate, report) {
  if (!record(pair)) {
    report(path, "Expected measurements for both ports");
    return;
  }
  const fromValid = validate(pair[fields[0]], path + "/" + fields[0], report);
  const toValid = validate(pair[fields[1]], path + "/" + fields[1], report);
  if (fromValid && toValid) return pair;
}

const directionFields = ["fromDirection", "toDirection"];
const diameterFields = ["from", "to"];
const checksDirection = mode => mode === "aligned" || mode === "opposed";
const directionIssueCode = check => check.directionCompatible ? null : "SCENE_CONNECTION_DIRECTION";

function readPortMeasurements(measurements, contract, path, report) {
  if (!record(measurements)) {
    report(path, "Expected recorded port measurements for this phase");
    return {};
  }
  const checks = {};
  if (checksDirection(contract?.direction)) {
    const pair = readPortPair(measurements.direction, path + "/direction", directionFields, checkWorldDirection, report);
    if (pair) checks.direction = measureConnectionDirection(pair.fromDirection, pair.toDirection, {
      direction: contract.direction, angularTolerance: isAngle(contract.angularTolerance) ? contract.angularTolerance : undefined,
    });
  }
  if (contract?.outsideDiameter === "equal") {
    const pair = readPortPair(measurements.outsideDiameter, path + "/outsideDiameter", diameterFields, checkOutsideDiameter, report);
    if (pair) checks.diameter = measureConnectionDiameter(pair.from, pair.to, isDistance(contract.diameterTolerance) ? contract.diameterTolerance : undefined);
  }
  return checks;
}

// A known issue code means a failed check, null means the ports pass, and undefined means insufficient evidence.
function reviewedDirectionCode(measurement, contract, path, report, recorded) {
  if (contract?.direction === "any") return null;
  if (!record(measurement)) return;
  const modeValid = checksDirection(contract?.direction);
  const limitValid = isAngle(contract?.angularTolerance);
  checkMeasuredFields(measurement, {
    space: "world", unit: "radian", direction: modeValid ? contract.direction : undefined,
    angularTolerance: limitValid ? contract.angularTolerance : undefined,
  }, path, report);
  const pair = recorded ?? readPortPair(measurement, path, directionFields, checkWorldDirection, report);
  if (!modeValid || !pair) {
    for (const key of ["angle", "deviation"]) {
      if (measurement[key] !== null && !isAngle(measurement[key])) report(path + "/" + key, "Expected radians between 0 and PI, or null");
    }
    return;
  }
  const check = recorded ?? measureConnectionDirection(pair.fromDirection, pair.toDirection, {
    direction: contract.direction, angularTolerance: limitValid ? contract.angularTolerance : undefined,
  });
  if (recorded) checkMeasuredFields(measurement, { fromDirection: check.fromDirection, toDirection: check.toDirection }, path, report);
  checkMeasuredFields(measurement, { angle: check.directionAngle, deviation: check.directionDeviation }, path, report);
  if (limitValid) return directionIssueCode(check);
}

function reviewedDiameterCode(measurement, contract, path, report, recorded) {
  // Absence of outsideDiameter in a resolved contract denotes the default "any".
  if (record(contract) && (contract.outsideDiameter == null || contract.outsideDiameter === "any")) return null;
  if (!record(measurement)) return;
  const limitValid = isDistance(contract?.diameterTolerance);
  checkMeasuredFields(measurement, { unit: "meter", diameterTolerance: limitValid ? contract.diameterTolerance : undefined }, path, report);
  const pair = recorded ?? readPortPair(measurement, path, diameterFields, checkOutsideDiameter, report);
  if (!pair) {
    if (measurement.difference !== null && !isDistance(measurement.difference)) {
      report(path + "/difference", "Expected a finite non-negative distance in metres or null");
    }
    return;
  }
  const check = recorded ?? measureConnectionDiameter(pair.from, pair.to, limitValid ? contract.diameterTolerance : undefined);
  if (recorded) checkMeasuredFields(measurement, { from: check.from, to: check.to }, path, report);
  checkMeasuredFields(measurement, { difference: check.difference }, path, report);
  if (contract?.outsideDiameter === "equal" && limitValid) return diameterIssueCode(check);
}

function checkReviewedState(state, field, row, hasPortMeasurements, report) {
  if (!record(state)) {
    report(field, "Expected a connection measurement");
    return;
  }
  const { contract } = row;
  const required = row.required === contract?.required ? row.required : undefined;
  for (const key of ["gap", "effectiveGap"]) {
    if (!isDistance(state[key])) report(field + "/" + key, "Expected a finite non-negative distance in metres");
  }
  if (typeof state.connected !== "boolean") report(field + "/connected", "Expected a boolean connection status");
  const issues = Array.isArray(state.issues) ? state.issues : undefined;
  if (!issues) report(field + "/issues", "Expected an array of connection issues");
  const portChecks = hasPortMeasurements ? readPortMeasurements(state.portMeasurements, contract, field + "/portMeasurements", report) : {};
  const expectedPortCodes = {
    direction: portChecks.direction && isAngle(contract.angularTolerance) ? directionIssueCode(portChecks.direction) : undefined,
    diameter: portChecks.diameter && isDistance(contract.diameterTolerance) ? diameterIssueCode(portChecks.diameter) : undefined,
  };
  let gap = state.gap;
  const gapIndices = [];
  const seenPortKinds = new Set();
  let passingPortIssues = 0;
  for (const [i, issue] of (issues ?? []).entries()) {
    const path = `${field}/issues/${i}`;
    if (!record(issue)) {
      report(path, "Expected a connection issue object");
      continue;
    }
    if (typeof issue.code !== "string" || !issue.code.length) report(path + "/code", "Expected an issue code");
    if (!["error", "warning"].includes(issue.level)) report(path + "/level", "Expected error or warning");
    else if (typeof required === "boolean" && issue.level !== (required ? "error" : "warning")) {
      report(path + "/level", "Issue level disagrees with the reviewed contract");
    }
    if (!record(issue.measurement)) report(path + "/measurement", "Expected a measurement object");
    if (issue.code === gapIssueCode) {
      gapIndices.push(i);
      continue;
    }
    const kind = portIssueKinds.get(issue.code);
    if (!kind) {
      if (typeof issue.code === "string" && issue.code.length) report(path + "/code", "Unknown connection issue code");
      continue;
    }
    const check = kind === "direction" ? reviewedDirectionCode : reviewedDiameterCode;
    const issueCode = check(issue.measurement, contract, path + "/measurement", report, portChecks[kind]);
    const expected = expectedPortCodes[kind] === undefined ? issueCode : expectedPortCodes[kind];
    if (expected === null) {
      passingPortIssues++;
      report(path + "/code", "The reviewed ports satisfy this constraint", { expected, actual: issue.code });
    } else if (expected !== undefined && issue.code !== expected) {
      report(path + "/code", "Issue code disagrees with the recorded ports", { expected, actual: issue.code });
    } else if (seenPortKinds.has(kind)) {
      report(path + "/code", "This port constraint already has an issue for this phase");
    }
    seenPortKinds.add(kind);
  }
  for (const i of gapIndices) {
    const measurement = issues[i].measurement;
    if (record(measurement)) gap = checkGapMeasurement(measurement, `${field}/issues/${i}/measurement`, field, state, contract, gapIndices.length === 1, report);
  }
  // Ignore invalid contract fields here: their parser has reported them, and its defaults are not evidence.
  const knownEmbed = isDistance(gap) && isDistance(contract?.embed);
  if (knownEmbed && isDistance(state.effectiveGap)) {
    const expected = effectiveConnectionGap(gap, contract.embed);
    if (state.effectiveGap !== expected) report(field + "/effectiveGap", "Effective gap disagrees with the measured gap and embed distance", { expected, actual: state.effectiveGap });
  } else if (isDistance(gap) && isDistance(state.effectiveGap) && state.effectiveGap > gap) {
    report(field + "/effectiveGap", "Effective gap cannot exceed the measured gap");
  }
  const fits = knownEmbed && isDistance(contract.gapTolerance) ? connectionGapFits(gap, contract) : undefined;
  let expectedConnected;
  if (fits === false || Object.values(expectedPortCodes).some(Boolean)) expectedConnected = false;
  else if (issues) {
    const remainingIssues = issues.length - passingPortIssues - (fits === true ? gapIndices.length : 0);
    expectedConnected = remainingIssues === 0;
  }
  if (typeof state.connected === "boolean" && expectedConnected !== undefined && state.connected !== expectedConnected) {
    report(field + "/connected", "Connection status disagrees with the reviewed measurements or issues", { expected: expectedConnected, actual: state.connected });
  }
  if (fits === false && !gapIndices.length && issues?.every(issue => typeof issue?.code === "string" && issue.code)) {
    report(field + "/issues", "Expected SCENE_CONNECTION_GAP for a gap exceeding the reviewed tolerance");
  }
  if (issues) {
    for (const [kind, code] of Object.entries(expectedPortCodes)) {
      if (code && !seenPortKinds.has(kind)) {
        report(field + "/issues", `The reviewed ports require ${code}`, { expected: code, actual: null });
      }
    }
  }
  for (const [occurrence, i] of gapIndices.entries()) {
    if (fits === true) report(`${field}/issues/${i}/code`, "The reviewed gap is within tolerance");
    else if (occurrence > 0) report(`${field}/issues/${i}/code`, "The gap issue is already recorded for this state");
  }
}

function reviewedContract(row, report) {
  if (!record(row.contract)) {
    report("contract", "Expected the reviewed connection contract");
    return;
  }
  // A review records the effective limits used at the time. A missing limit cannot establish a match.
  const keys = ["required", "gapTolerance", "embed", "direction"];
  if (checksDirection(row.contract.direction)) keys.push("angularTolerance");
  if (row.contract.outsideDiameter === "equal") keys.push("diameterTolerance");
  for (const key of keys) {
    if (row.contract[key] == null) report("contract/" + key, "Missing reviewed contract value");
  }
  const contract = readConnectionContract({ contract: row.contract }, report);
  if (typeof row.required === "boolean" && typeof row.contract.required === "boolean" && row.required !== contract.required) {
    report("required", "Must agree with contract.required");
  }
  return contract;
}

export function readConnectionPreview(preview, reviewedOwner, conflicts) {
  const rows = { relations: [], attachments: [] };
  if (preview === undefined) return rows; // Proposals saved before joint previews existed.
  const root = "/facts/connectionImpact";
  if (!Array.isArray(preview)) {
    conflicts.push(proposalField(root, "connection-preview-invalid", "Expected an array of reviewed connections"));
    return rows;
  }
  const firstPaths = new Map();
  for (const [index, row] of preview.entries()) {
    const path = root + "/" + index;
    if (!record(row)) {
      conflicts.push(proposalField(path, "connection-preview-invalid", "Expected a reviewed connection object"));
      continue;
    }
    const id = reviewedOwner(row.from, row.to);
    const count = conflicts.length;
    const report = (field, message, details) => conflicts.push({ ...proposalField(path + "/" + field, "connection-preview-invalid", message, id), ...details });
    const location = typeof row.path === "string" && /^\/(relations|attachments)\/(?:0|[1-9]\d*)$/.exec(row.path);
    if (!location) report("path", "Expected /relations/<index> or /attachments/<index>");
    else if (firstPaths.has(row.path)) {
      conflicts.push({ ...proposalField(path + "/path", "connection-preview-duplicate", "A declaration can only be reviewed once", id),
        firstPath: firstPaths.get(row.path) });
    } else firstPaths.set(row.path, path + "/path");
    for (const field of ["from", "to"]) {
      try { anchorReference(row[field], field); }
      catch (error) { report(field, error.message); }
    }
    if (typeof row.required !== "boolean") report("required", "Expected a boolean");
    const contract = reviewedContract(row, report);
    const phases = ["before", "after"];
    const hasPortMeasurements = phases.some(phase => record(row[phase]) && Object.hasOwn(row[phase], "portMeasurements"));
    for (const phase of phases) checkReviewedState(row[phase], phase, row, hasPortMeasurements, report);
    if (conflicts.length === count) rows[location[1]].push({ ...row, contract });
  }
  return rows;
}
