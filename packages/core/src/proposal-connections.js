import { worldAnchorDefinition } from "./component.js";
import { readConnectionPreview } from "./proposal-input.js";
import {
  anchorReference, connectionIssues, evaluateConnection, isConnectionType, rebuildAtTransform, resolveAnchorDefinition, sceneConnectionContract,
  withinAngle, withinDistance,
} from "./scene.js";

function endpointInstance(reference) {
  const marker = typeof reference === "string" ? reference.lastIndexOf("#") : -1;
  if (marker > 0) return reference.slice(0, marker);
}

function portMeasurements(connection) {
  const measurements = {};
  if (connection.contract.direction !== "any") {
    measurements.direction = {
      fromDirection: connection.fromDirection?.slice() ?? null,
      toDirection: connection.toDirection?.slice() ?? null,
    };
  }
  if (connection.outsideDiameterCheck) {
    const { from, to } = connection.outsideDiameterCheck;
    measurements.outsideDiameter = { from, to };
  }
  if (measurements.direction || measurements.outsideDiameter) return measurements;
}

function impactOf(relation, path, beforeAnchor, afterAnchor, contract = sceneConnectionContract(relation, path)) {
  function measure(anchor, phase) {
    const connection = evaluateConnection(relation, anchor(relation.from), anchor(relation.to), contract);
    if (!Number.isFinite(connection.gap)) {
      throw Object.assign(new RangeError(`Cannot represent the ${phase} gap at ${path} as a finite number of metres`), {
        code: "SCENE_CONNECTION_MEASUREMENT_INVALID", measurement: { path, phase, from: relation.from, to: relation.to, unit: "meter" },
      });
    }
    const ports = portMeasurements(connection);
    return {
      connected: connection.connected, gap: connection.gap, effectiveGap: connection.effectiveGap,
      ...(ports ? { portMeasurements: ports } : {}),
      issues: connectionIssues(connection, path).map(({ code, level, measurement }) => ({ code, level, measurement })),
    };
  }
  return {
    path, ...(relation.id !== undefined ? { relationId: relation.id } : {}),
    from: relation.from, to: relation.to, required: contract.required, contract,
    before: measure(beforeAnchor, "before"), after: measure(afterAnchor, "after"),
  };
}

export function previewConnectionImpact(scene, builds, transforms, registry, projected = new Map()) {
  if (!transforms.size) return [];
  const before = reference => resolveAnchorDefinition(builds, reference);
  function after(reference) {
    const { instanceId, anchorId } = anchorReference(reference, "proposal connection");
    if (!transforms.has(instanceId)) return before(reference);
    const moving = builds.get(instanceId);
    const transform = transforms.get(instanceId);
    if (registry) {
      if (!projected.has(instanceId)) projected.set(instanceId, rebuildAtTransform(registry, moving, transform));
      return resolveAnchorDefinition(projected, reference);
    }
    return worldAnchorDefinition(moving.anchors.definitions[anchorId], transform);
  }
  const rows = [];
  for (const [i, relation] of (scene.relations ?? []).entries()) {
    if (!isConnectionType(relation.type)) continue;
    if (!transforms.has(endpointInstance(relation.from)) && !transforms.has(endpointInstance(relation.to))) continue;
    rows.push(impactOf(relation, relation.sourcePath ?? `/relations/${i}`, before, after));
  }
  return rows;
}

// A declaration's array index can change between review and application.
// Count equivalent declarations so a second, identical joint still needs review.
function jointIdentity(id, from, to) {
  return JSON.stringify([id ?? null, from, to]);
}

function jointKey(identity, contract) {
  const { gapTolerance, embed, direction, angularTolerance, outsideDiameter, diameterTolerance } = contract;
  return JSON.stringify([
    identity, gapTolerance, embed,
    direction, direction === "any" ? null : angularTolerance, outsideDiameter, diameterTolerance,
  ]);
}

function introducedIssueCodes(before, afterCodes) {
  const existing = new Set(before.issues.map(issue => issue.code));
  return afterCodes.filter(code => !existing.has(code));
}

function issueConstraint(code) {
  if (code === "SCENE_CONNECTION_DIAMETER_MISMATCH" || code === "SCENE_CONNECTION_DIAMETER_UNAVAILABLE") return "outsideDiameter";
  return code;
}

const measuredIssueFields = new Map([
  ["SCENE_CONNECTION_GAP", "effectiveGap"],
  ["SCENE_CONNECTION_DIRECTION", "deviation"],
  ["SCENE_CONNECTION_DIAMETER_MISMATCH", "difference"],
]);

function issueMeasurements(state) {
  const values = new Map();
  for (const { code, measurement } of state.issues) {
    const field = measuredIssueFields.get(code);
    if (field && Number.isFinite(measurement[field])) {
      values.set(code, { code, field, unit: measurement.unit, value: measurement[field] });
    }
  }
  return values;
}

function exceedsMeasurement(actual, limit) {
  return limit.unit === "radian" ? !withinAngle(actual, limit.value) : !withinDistance(actual, limit.value);
}

function increasedIssueMeasurements(before, afterCodes, measurements) {
  const previous = issueMeasurements(before);
  const increases = [];
  for (const code of afterCodes) {
    const prior = previous.get(code);
    const current = measurements.get(code);
    if (prior && current && exceedsMeasurement(current.value, prior)) {
      increases.push({ code, field: current.field, unit: current.unit, before: prior.value, after: current.value });
    }
  }
  return increases;
}

function measurementIncreaseConflict(increasedMeasurements) {
  return { reason: "required-connection-measurement-increased", increasedMeasurements };
}

function reviewedMeasurementLimits(row, introducedCodes) {
  const before = issueMeasurements(row.before);
  const limits = [];
  for (const limit of issueMeasurements(row.after).values()) {
    const prior = before.get(limit.code);
    const reduction = prior !== undefined && exceedsMeasurement(prior.value, limit);
    if (introducedCodes.has(limit.code) || reduction || (prior && exceedsMeasurement(limit.value, prior))) {
      limits.push({ ...limit, reduction });
    }
  }
  return limits;
}

function unavailableReducedMeasurements(review, failedChecks, measurements) {
  const unavailable = [];
  for (const { code, field, unit, value: expected, reduction } of review.measurementLimits) {
    if (!reduction || measurements.has(code)) continue;
    const actualCode = failedChecks.get(issueConstraint(code));
    if (actualCode !== undefined) unavailable.push({ code, field, unit, expected, actual: null, actualCode });
  }
  return unavailable;
}

function reviewedChanges(preview) {
  const regressions = new Map();
  const repairs = new Map();
  const reviewedIdentities = new Set();
  for (const row of preview) {
    if (!row.required || (row.before.connected && row.after.connected)) continue;
    const afterCodes = row.after.issues.map(issue => issue.code);
    const introducedCodes = new Set(introducedIssueCodes(row.before, afterCodes));
    const failingChecks = new Set(afterCodes.map(issueConstraint));
    const resolvedIssueCodes = row.before.issues.map(issue => issue.code).filter(code => !failingChecks.has(issueConstraint(code)));
    const measurementLimits = reviewedMeasurementLimits(row, introducedCodes);
    if (!introducedCodes.size && !resolvedIssueCodes.length && !measurementLimits.length) continue;
    const identity = jointIdentity(row.relationId, row.from, row.to);
    const key = jointKey(identity, row.contract);
    reviewedIdentities.add(identity);
    const review = { row, afterCodes: new Set(afterCodes), introducedCodes, resolvedIssueCodes, measurementLimits };
    if (resolvedIssueCodes.length || measurementLimits.some(limit => limit.reduction)) {
      if (!repairs.has(key)) repairs.set(key, { identity, rows: [], matched: 0 });
      repairs.get(key).rows.push(review);
    } else {
      if (!regressions.has(key)) regressions.set(key, []);
      regressions.get(key).push(review);
    }
  }
  return { regressions, repairs, reviewedIdentities };
}

function unreviewedIssueCodes(review, afterCodes, introduced) {
  return afterCodes.filter(code => !review.afterCodes.has(code) || (introduced.has(code) && !review.introducedCodes.has(code)));
}

function reviewedOutcome(review) {
  return { reviewedPath: review.row.path, reviewedBefore: review.row.before, reviewedAfter: review.row.after };
}

function reviewedRegressionConflicts(review, afterCodes, introduced, measurements, increases) {
  const conflicts = [];
  const addedIssueCodes = review.introducedCodes.size ? unreviewedIssueCodes(review, afterCodes, introduced) : [];
  if (addedIssueCodes.length) {
    conflicts.push({ reason: "reviewed-disconnection-changed", ...reviewedOutcome(review), addedIssueCodes });
  }
  const exceededMeasurements = [];
  for (const limit of review.measurementLimits) {
    const { code, field, unit, value: expected } = limit;
    if (addedIssueCodes.includes(code)) continue;
    const actual = measurements.get(code)?.value;
    if (actual !== undefined && exceedsMeasurement(actual, limit)) {
      exceededMeasurements.push({ code, field, unit, expected, actual });
    }
  }
  if (exceededMeasurements.length) {
    conflicts.push({ reason: "reviewed-connection-measurement-exceeded", ...reviewedOutcome(review), exceededMeasurements });
  }
  if (increases.length) {
    const reviewedIncreases = new Set(review.measurementLimits.filter(limit => !limit.reduction).map(limit => limit.code));
    const exceededCodes = new Set(exceededMeasurements.map(item => item.code));
    const unreviewedIncreases = increases.filter(({ code }) =>
      !reviewedIncreases.has(code) && !exceededCodes.has(code) && !addedIssueCodes.includes(code));
    if (unreviewedIncreases.length) {
      conflicts.push({ ...measurementIncreaseConflict(unreviewedIncreases), ...reviewedOutcome(review) });
    }
  }
  return conflicts;
}

function matchReviewedRegression(reviews, wasConnected, afterCodes, introduced, measurements, increases) {
  // A known issue is only approved as an effect of the move if the review also introduced it.
  // Equivalent declarations can move in the array. Prefer an approval covering the live changes.
  let fallback;
  let measurementOnly;
  for (const [index, review] of reviews.entries()) {
    // A currently connected joint needs an explicit review of the disconnection.
    if (wasConnected && !review.row.before.connected) continue;
    const conflicts = reviewedRegressionConflicts(review, afterCodes, introduced, measurements, increases);
    // Keep the numeric review usable when an independent new failure still needs its own diagnostic.
    if (introduced.size && !review.introducedCodes.size) {
      measurementOnly ??= { index, conflicts, checkIntroduced: true };
      continue;
    }
    if (!conflicts.length) {
      reviews.splice(index, 1);
      return { conflicts };
    }
    fallback ??= { index, conflicts };
  }
  const match = fallback ?? measurementOnly;
  if (!match) return;
  reviews.splice(match.index, 1);
  return match;
}

export function connectionImpactConflicts(document, proposal, { moved, targets, currentBuilds, stagedBuilds, unavailablePoses }) {
  const reviewedOwner = (from, to) => [endpointInstance(from), endpointInstance(to)].find(id => targets.has(id)) ?? endpointInstance(from) ?? endpointInstance(to);
  const before = ref => resolveAnchorDefinition(currentBuilds, ref);
  const after = ref => resolveAnchorDefinition(moved.has(endpointInstance(ref)) ? stagedBuilds : currentBuilds, ref);
  const conflicts = [];
  const connectionImpact = proposal.facts?.connectionImpact;
  const hasPreview = Array.isArray(connectionImpact);
  const preview = readConnectionPreview(connectionImpact, reviewedOwner, conflicts);
  for (const field of ["relations", "attachments"]) {
    const { regressions, repairs, reviewedIdentities } = reviewedChanges(preview[field]);
    if (!moved.size && !reviewedIdentities.size) continue;
    const entries = document[field] === undefined ? [] : document[field];
    if (!Array.isArray(entries)) {
      conflicts.push({ instanceId: moved.values().next().value ?? targets.keys().next().value, path: "/" + field,
        reason: "connection-unavailable", message: `Expected ${field} to be an array` });
      continue;
    }
    const unreadableDeclarations = new Set();
    for (const [i, relation] of entries.entries()) {
      if (!relation || (field === "relations" && !isConnectionType(relation.type))) continue;
      if ((relation.contract?.required ?? relation.required) === false) continue;
      const endpoints = [endpointInstance(relation.from), endpointInstance(relation.to)];
      const movingOwner = endpoints.find(id => moved.has(id));
      const identity = jointIdentity(relation.id, relation.from, relation.to);
      if (movingOwner === undefined && !reviewedIdentities.has(identity)) continue;
      const instanceId = movingOwner ?? reviewedOwner(relation.from, relation.to);
      const path = `/${field}/${i}`;
      let key, repair, regressionReviews, row;
      try {
        if (relation.type !== undefined && !isConnectionType(relation.type)) throw new TypeError(`${path}/type must be attachment or connects`);
        const contract = sceneConnectionContract(relation, path);
        key = jointKey(identity, contract);
        const group = repairs.get(key);
        if (group && group.matched < group.rows.length) repair = group.rows[group.matched++];
        regressionReviews = regressions.get(key);
        if (movingOwner === undefined && !repair && !regressionReviews?.length) continue;
        // Match reviewed declarations even when an endpoint has no measurable final pose.
        if (!Array.isArray(proposal.changes) || endpoints.some(id => unavailablePoses.has(id))) continue;
        row = impactOf(relation, path, before, after, contract);
      }
      catch (error) {
        if (key === undefined) unreadableDeclarations.add(identity);
        conflicts.push({ instanceId, path, relationId: relation.id, from: relation.from, to: relation.to,
          reason: "connection-unavailable", message: error.message, ...(error.measurement ? { measurement: error.measurement } : {}) });
        continue;
      }
      if (row.after.connected) continue;
      if (repair?.row.after.connected) {
        conflicts.push({ instanceId, reason: "required-connection-not-restored", reviewedAfter: repair.row.after, ...row });
        continue;
      }
      let afterCodes = row.after.issues.map(issue => issue.code);
      const checkIncreases = hasPreview && movingOwner !== undefined && !row.before.connected;
      const measurements = repair || regressionReviews?.length || checkIncreases ? issueMeasurements(row.after) : undefined;
      if (repair) {
        const failedChecks = new Map(afterCodes.map(code => [issueConstraint(code), code]));
        const unresolvedIssueCodes = repair.resolvedIssueCodes.filter(code => failedChecks.has(issueConstraint(code)));
        if (unresolvedIssueCodes.length) {
          conflicts.push({ instanceId, reason: "required-connection-issues-not-resolved", ...reviewedOutcome(repair), unresolvedIssueCodes, ...row });
        }
        const unavailableMeasurements = unavailableReducedMeasurements(repair, failedChecks, measurements);
        if (unavailableMeasurements.length) {
          conflicts.push({ instanceId, reason: "reviewed-connection-measurement-unavailable", ...reviewedOutcome(repair), unavailableMeasurements, ...row });
        }
        // The repair diagnostics cover these constraints even if their live issue codes have changed.
        if (unresolvedIssueCodes.length || unavailableMeasurements.length) {
          const covered = new Set([...unresolvedIssueCodes, ...unavailableMeasurements.map(m => m.actualCode)].map(issueConstraint));
          afterCodes = afterCodes.filter(code => !covered.has(issueConstraint(code)));
        }
      }
      const introduced = introducedIssueCodes(row.before, afterCodes);
      let increases = checkIncreases ? increasedIssueMeasurements(row.before, afterCodes, measurements) : [];
      if (repair && !row.before.connected) {
        for (const conflict of reviewedRegressionConflicts(repair, afterCodes, new Set(introduced), measurements, increases)) {
          conflicts.push({ instanceId, ...conflict, ...row });
        }
        if (repair.introducedCodes.size) continue;
        increases = [];
      }
      if (!repair && regressionReviews?.length) {
        const match = matchReviewedRegression(regressionReviews, row.before.connected, afterCodes, new Set(introduced), measurements, increases);
        if (match) {
          for (const conflict of match.conflicts) conflicts.push({ instanceId, ...conflict, ...row });
          if (!match.checkIntroduced) continue;
          increases = [];
        }
      }
      if (movingOwner !== undefined && row.before.connected) {
        conflicts.push({ instanceId, reason: "required-connection-disconnected", ...row });
      } else if (movingOwner !== undefined && introduced.length) {
        conflicts.push({ instanceId, reason: "required-connection-new-issues", addedIssueCodes: introduced, ...row });
      }
      if (increases.length) conflicts.push({ instanceId, ...measurementIncreaseConflict(increases), ...row });
    }
    for (const { identity, rows, matched } of repairs.values()) {
      if (unreadableDeclarations.has(identity)) continue;
      for (const { row: repair } of rows.slice(matched)) {
        conflicts.push({ instanceId: reviewedOwner(repair.from, repair.to), reason: "reviewed-connection-missing",
          path: "/" + field, reviewedPath: repair.path, relationId: repair.relationId, from: repair.from, to: repair.to,
          contract: repair.contract, reviewedAfter: repair.after });
      }
    }
  }
  return conflicts;
}
