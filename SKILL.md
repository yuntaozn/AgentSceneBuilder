---
name: agentscene-builder
description: Build and inspect renderer-neutral parametric digital models for AI-authored 3D, engineering, teaching, and equipment scenes. Use when Codex needs CompositionSpec modeling, reusable geometry composition, dimensions and quantities, paths, spatial repetition, alignment proposals, attachment checks, semantic components, open model-library entries, CLI-based validation, or optional renderer/file-format adaptation.
---

# AgentSceneBuilder

Use this skill as a renderer-neutral digital modeling and spatial-method kernel. Do not treat it as a fixed courseware template, a Three.js workflow, a GLB/GLTF library, or a long-running local service.

## Core rules

- Keep the digital model as the source of truth. Treat renderer code, screenshots, GLB/GLTF, and exported pages as derived artifacts.
- Prefer `core.composition`, parametric components, path methods, repetition, anchors, attachments, and spatial proposals over ad hoc geometry calculations in task code.
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

- `mep route-with-clips` returns editable pipe routes plus path-repeated pipe clips.
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
