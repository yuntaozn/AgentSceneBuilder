# AgentSceneBuilder

AgentSceneBuilder is open-source digital modeling infrastructure for AI large language models (LLMs). It provides a renderer-neutral modeling kernel, a searchable model registry, a Skill, and a local CLI.

An LLM-powered Agent can find reusable objects, describe their geometry and relationships in CompositionSpec, call deterministic spatial methods, and use JSON diagnostics to revise and verify the result.

中文说明见[产品定位](docs/product-positioning-v3.md)和[大模型接入](docs/ai-integration.md)。

## How an Agent uses it

```text
LLM-powered Agent with task intent, dimensions and constraints
        ↓
Skill + CLI: search the registry, build and check CompositionSpec
        ↓
Core: reusable components, spatial calculations and diagnostics
        ↓
Structured results for Agent review and revision
        ↓
Optional Web preview and review
```

CompositionSpec is the editable source of the model. Geometry graphs, previews and screenshots are derived from that source.

## Why it exists

AI Agents need repeatable modeling operations across tasks. The core and registry capture recurring work in:

- coordinate systems, transforms, pivots, and hierarchy;
- primitive geometry and parameter validation;
- linear, grid, radial, and path-based repetition;
- pipe/path sampling and routing candidates;
- anchors, attachments, gaps, and connection checks;
- dimensions, quantities, bounds, and semantic queries;
- read-only reference extraction from GLB files when an Agent needs proportions, material groups, and outlier warnings without adopting the mesh as source geometry;
- rebuilding the same model facts for different renderers or formats.

AgentSceneBuilder turns those recurring pieces into reusable data structures and deterministic methods.

## Core ideas

- Digital models are the source of truth; rendered output is derived.
- Reusable components, standalone models and spatial methods support many different scenarios.
- Repetition keeps its rule and prototype, instead of only storing expanded geometry.
- Methods return facts, candidates, reviewable proposals, or generated CompositionSpec models; they do not silently make domain decisions for the Agent.
- Three.js and Canvas provide the current Web preview. Additional format adapters can build on the same geometry graph.
- The current Agent integration path is Skill + CLI.

## What is included

- `@agentscene/core`: renderer-neutral CompositionSpec compiler and spatial methods.
- `@agentscene/cli`: JSON-output command line interface for Agents and scripts.
- `registry/`: open digital model library with components, methods, and complete parametric models.
- `apps/library`: browser preview for checking registry entries and copying their model data.
- `apps/editor`: browser workspace for reviewing Agent output, diagnosing issues and adjusting CompositionSpec.
- `SKILL.md`: Agent-facing skill instructions for Codex/YuntaoCode-style hosts.
- `.codex-plugin/plugin.json`: minimal Codex plugin manifest that exposes the Skill + CLI route.

## Quick start

Install dependencies from the lockfile:

```powershell
npm ci
```

List available core components:

```powershell
node packages/cli/src/agentscene.mjs component list
```

Find a public model, check it for errors and build the cable tray example.

```powershell
node packages/cli/src/agentscene.mjs registry search 桥架
node packages/cli/src/agentscene.mjs registry search --domain mep --kind component 滑移
node packages/cli/src/agentscene.mjs composition check registry/compositions/cable-tray-elbow/manifest.json
node packages/cli/src/agentscene.mjs component build registry/compositions/cable-tray-elbow/manifest.json
```

Check an assembly, then build the scene.

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene build examples/digital-modeling/composed-scene.json
```

Analyze a pipe/path example:

```powershell
node packages/cli/src/agentscene.mjs path analyze examples/digital-modeling/paths/analyze-water-pipe.json
```

Generate MEP route pipes with reusable pipe-clip repetition:

```powershell
node packages/cli/src/agentscene.mjs mep route-with-clips examples/digital-modeling/mep/route-with-clips.json
```

Check a drain route's slope facts:

```powershell
node packages/cli/src/agentscene.mjs mep drain-slope-check examples/digital-modeling/mep/drain-slope-check.json
```

Analyze a GLB as reference evidence without importing it as the model:

```powershell
node packages/cli/src/agentscene.mjs reference analyze-glb path/to/reference.glb
```

These commands write one JSON object to stdout. Agents can use the JSON Pointers from a check to revise the source and run the check again. Proposals are advisory and should be reviewed before being applied.

## Model library

The registry gives LLM-powered Agents reusable modeling resources. Agents can search by name, semantic type or capability, read the model manifest, and use the generated `agent` guidance in `registry/registry.json` to choose and check an entry.

Current public scope: architecture, construction, MEP, industrial teaching, and engineering-scene digital models. Experimental `character.*` entries may remain in the repository for internal research, but they are hidden from the default library and editor until their quality is good enough for the product direction.

Registry entries can be:

- `component`: reusable parameterized building blocks;
- `method`: reusable spatial or modeling procedures;
- `composition`: complete editable objects or systems made from structured geometry.

Complete models describe a recognizable object or bounded system, such as a drone, excavator, keyboard or pipe support assembly. Standalone models give Agents building blocks they can position and connect in scenario examples.

The library can also contain agent-usable modeling methods where the useful output is rules, dimensions, paths, anchors, quantities, risk facts, layout candidates, or reviewable changesets rather than a fixed mesh asset.

See [registry/README.md](registry/README.md) for contribution rules.

## Optional Web review tools

The browser library and editor let reviewers inspect Agent-generated models and fine-tune the same CompositionSpec used by the CLI. Both can be served as static pages.

- [Model library](apps/library/README.md)
- [Editor](apps/editor/README.md)

You can serve them with any static HTTP server, such as `live-server`, Python, Nginx, IIS, Caddy, or the included development server.

## Agent integration

AgentSceneBuilder can be used as:

- a repository-root Skill through [SKILL.md](SKILL.md);
- a local CLI through `node packages/cli/src/agentscene.mjs ...` or `npm run --silent agentscene -- ...`;
- a host plugin wrapper through [.codex-plugin/plugin.json](.codex-plugin/plugin.json).

The plugin layer is only for installation, discovery, versioning, and permission boundaries. The reusable modeling capability lives in the Skill, CLI, core package, and registry.

See [docs/ai-integration.md](docs/ai-integration.md) and [docs/host-plugin-packaging.md](docs/host-plugin-packaging.md).

## Documentation

- [Product positioning](docs/product-positioning-v3.md)
- [Architecture](docs/architecture.md)
- [CompositionSpec](docs/composition-spec.md)
- [Core method contract](docs/core-method-contract.md)
- [Open model library plan](docs/open-source-model-library.md)
- [CLI package](packages/cli/README.md)
- [Open-source release checklist](docs/open-source-release.md)

## Contributing

Contributions are welcome when they make AI-authored digital modeling more reliable and reusable.

Good contributions include:

- reusable spatial methods;
- parameterized components;
- complete digital models with clear semantics and editable parts;
- model-library quality checks;
- editor or library improvements that keep CompositionSpec as the source of truth.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
