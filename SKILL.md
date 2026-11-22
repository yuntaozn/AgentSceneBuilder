---
name: agentscene-builder
description: Build and inspect renderer-neutral parametric digital models for AI-authored 3D, engineering, teaching, and equipment scenes. Use when Codex needs CompositionSpec modeling, reusable geometry composition, dimensions and quantities, paths, spatial repetition, alignment proposals, attachment checks, semantic components, open model-library entries, CLI-based validation, or optional renderer/file-format adaptation.
---

# AgentSceneBuilder

Use this skill as a renderer-neutral digital modeling and spatial-method kernel. Do not treat it as a fixed courseware template, a Three.js workflow, a GLB/GLTF library, or a long-running local service.

## Core rules

- Keep the digital model as the source of truth. Treat renderer code, screenshots, GLB/GLTF, and exported pages as derived artifacts.
- Prefer `core.composition`, parametric components, path methods, repetition, anchors, attachments, and spatial proposals over ad hoc geometry calculations in task code.
- Run `agentscene composition check <file>` on a composition or registry composition manifest. Use each issue's JSON Pointer to repair the source, then check again before building.
- Run `agentscene scene check <file or ->` on multi-instance scenes. Fix errors at the reported JSON Pointers and inspect warnings on optional connections. Read `issues[].measurement` for world-space port positions, angular deviations and outside diameter differences with their tolerances.
- For duplicate IDs, ambiguous references and parent cycles, use `relatedLocations` to inspect the first declaration, each candidate declaration or the next parent edge in the cycle. The paths are relative to the original input root.
- For missing references, inspect `suggestedValues` when present. Each string is a candidate for the whole field at `path`, including `instance#anchor` for a scene endpoint.
- Add `--source-ranges` to either check to locate issues in the original JSON text. Read the reported `path` to identify the field and `sourceRange.matchedPath` to identify the value selected when a field is missing.
- For malformed JSON with `--source-ranges`, read each `JSON_INVALID` entry's `syntaxCode` and `sourceRange`. When using the optional `fix` edits, apply them to the original text in descending `offset` order. Run the check again to verify parsing and domain validation.
- Use `--reject-duplicate-keys` to catch JSON members with the same decoded name in one object. With `--source-ranges`, compare `firstSourceRange` and `sourceRange` for the two key tokens before deciding which value to keep.
- Review `proposal.facts.connectionImpact` before applying an anchor alignment or linear distribution. Inspect each joint's before and after gap, connection status and remaining issues. For a distribution, the preview evaluates both ends at their final positions in the batch.
- If `scene apply-proposal` returns `SCENE_PROPOSAL_CONFLICT`, read every entry in `error.conflicts`. The same response can identify an invalid transform field, a changed anchor or bound, and a separate required joint that would disconnect. For `required-connection-not-restored`, compare `reviewedAfter` with the current `after.issues`. For `reviewed-connection-missing`, check the declaration and its contract. Correct the scene and retry, or regenerate the proposal to review the changed outcome. A successful retry of completed transforms preserves the revision.
- For `required-connection-new-issues`, inspect `addedIssueCodes` for failures the move introduces at a joint that was already disconnected. For `reviewed-disconnection-changed`, compare `before` and `after` against `reviewedBefore` and `reviewedAfter`. Use `path` to find the current declaration and `reviewedPath` to locate it in the reviewed scene.
- For `required-connection-measurement-increased`, compare the live `before` and `after` values in `increasedMeasurements`. Regenerate the proposal from the current scene to review the increase.
- For `reviewed-connection-measurement-exceeded`, compare each `exceededMeasurements` entry's `expected` reviewed value and `actual` final value in the reported unit.
- For `reviewed-connection-measurement-unavailable`, use `unavailableMeasurements` and its `actualCode` to identify the current failure that prevents verification of a reviewed reduction.
- For `required-connection-issues-not-resolved`, use `unresolvedIssueCodes` and the current `after.issues` to find constraints that the proposal was expected to satisfy. A diameter mismatch and a missing diameter both fail the outside diameter check.
- For conflicts with `source: "proposal"`, resolve `path` against the proposal object inside the CLI envelope. For example, `/changes/0/after/position/2` identifies the Z coordinate to correct in the first change.
- For `connection-preview-invalid` on a gap measurement, compare `expected` and `actual` at the reported path. A gap exceeding the contract's embed distance plus tolerance requires `SCENE_CONNECTION_GAP` in that phase's issues. The recorded endpoints are world coordinates in metres.
- For direction and outside diameter diagnostics, use radians and metres respectively. When a conflict on an issue's `code` reports `expected: null`, the recorded measurements satisfy the contract and the issue should be removed.
- Keep `portMeasurements` in both phases of a connection preview. A conflict on the phase's `issues` array with an issue code in `expected` and `null` in `actual` identifies an omitted failure.
- For `connection-preview-duplicate`, compare `path` with `firstPath`. Each joint declaration has one review row. Regenerate a damaged preview from the current scene to review its predicted repairs and disconnections.
- Use `agentscene registry search <terms>` to find public models by name, ID or capability. Pass a composition result's `manifestPath` to `composition check` and `component build`.
- Classify method results using the core method contract: facts, candidates, proposal, or generated composition. Candidates and proposals require explicit Agent/user review before selection or application.
- Let the host Agent decide the domain choice and final composition. AgentSceneBuilder returns facts, candidates, and changesets; it should not silently choose ambiguous engineering solutions.
- Preserve task-specific code when the core does not fit. Do not force a bad abstraction just to use the skill.
- Current product route is Skill + CLI + static Web editor/library. Do not add MCP or a long-running local service unless the user explicitly changes the product direction.

## Primary workflow

1. Identify the intended object or space, dimensions, units, relationships, delivery target, and constraints.
2. Search the model library or component registry before inventing a new structure.
3. Read each candidate registry entry's generated `agent` context first: `intent`, `useWhen`, `avoidWhen`, `editableParts`, `qualityChecks`, and `structure`.
4. Express editable results as data-only `core.composition` / CompositionSpec when possible.
5. Use the CLI for deterministic build, query, path, spatial, alignment, and distribution work.
6. Treat candidates and proposals as advisory. Inspect facts and changes before selecting or applying them.
7. Use the static Web editor/library when a person needs to view, copy, or lightly edit the result.

## CLI contract

All Agent-facing CLI commands write one JSON object to stdout. A failed command returns `{ "ok": false, "error": ... }` and exits nonzero.

Prefer the package CLI:

```powershell
node packages/cli/src/agentscene.mjs component list
node packages/cli/src/agentscene.mjs component describe core.composition
node packages/cli/src/agentscene.mjs component build examples/digital-modeling/independent-foundation.json
node packages/cli/src/agentscene.mjs reference analyze-glb path/to/reference.glb
node packages/cli/src/agentscene.mjs scene build examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene query examples/digital-modeling/composed-scene.json examples/digital-modeling/queries/rebar.json
node packages/cli/src/agentscene.mjs scene analyze-spatial examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene propose-align examples/digital-modeling/alignment-source.json examples/digital-modeling/proposals/align-pipes.json
node packages/cli/src/agentscene.mjs path analyze examples/digital-modeling/paths/analyze-water-pipe.json
node packages/cli/src/agentscene.mjs path orthogonal-candidates examples/digital-modeling/paths/orthogonal-candidates.json
node packages/cli/src/agentscene.mjs path sample examples/digital-modeling/paths/sample-supports.json
node packages/cli/src/agentscene.mjs mep route-with-clips examples/digital-modeling/mep/route-with-clips.json
node packages/cli/src/agentscene.mjs mep drain-slope-check examples/digital-modeling/mep/drain-slope-check.json
node packages/cli/src/agentscene.mjs mep pressure-test-loop examples/digital-modeling/mep/pressure-test-loop.json
```

`scripts/model.mjs` is a compatibility wrapper around the package CLI:

```powershell
node scripts/model.mjs component list
```

Use `reference analyze-glb` only as a read-only reference extractor. GLB/GLTF meshes are not the source of truth for the registry; the useful output is structured evidence such as material groups, node groups, bounds, proportions, colors, and outlier warnings that help an Agent rebuild an editable CompositionSpec.

Current public scope is architecture, construction, MEP, industrial teaching, and engineering-scene digital models. Do not surface internal `character.*` registry entries unless the user explicitly asks to inspect or continue that experimental modeling line.

For MEP rough-in or water/electric teaching scenes, prefer the dedicated MEP helpers before writing ad hoc geometry:

- `mep route-with-clips` returns editable pipe routes plus path-repeated pipe clips. On request validation failure, use every JSON Pointer in `issues[]` to repair the input, then pass the revised JSON to `mep route-with-clips -` on stdin. Edit the pipe's `geometry.points` and `radius` for the centerline and ports. Edit `routeBindings[].clipOffset` and the clip repetition's spacing and end offsets for supports. Read the allocated clip ID from `routes[].clipPrototypeId`.
- `mep drain-slope-check` returns slope facts and issues for drain or condensate routes.
- `mep pressure-test-loop` returns an editable pressure-test pump, hoses, gauge, ports, and metrics.

Use the Python probe script for read-only catalog, asset, and experimental scene checks. Resolve a Python 3.10+ interpreter available in the host environment (`python3`, `python`, or `py -3`).

```powershell
<python> scripts/agentscene.py catalog search "pipe support"
<python> scripts/agentscene.py catalog list
<python> scripts/agentscene.py asset inspect path/to/model.glb
<python> scripts/agentscene.py scene validate path/to/scene.json
```

## References

- Read `docs/product-positioning-v3.md` for product boundary and architecture decisions.
- Read `docs/core-method-contract.md` when adding or interpreting method outputs.
- Read `docs/ai-integration.md` for Codex/YuntaoCode Skill + CLI integration.
- Read `docs/composition-spec.md` when creating data-only models, anchors, attachments, repetition, or animations.
- Read `registry/README.md` before contributing or modifying open model-library entries.
- Read `docs/legacy-courseware-reference-analysis.md` only when mining historical teaching projects.
- Read `schemas/scene.schema.json` only for the older experimental Scene Document. Do not treat it as the CompositionSpec schema.
