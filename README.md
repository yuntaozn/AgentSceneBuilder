# AgentSceneBuilder

AgentSceneBuilder is an agent-native digital modeling kernel and open model registry for AI-authored 3D scenes.

It helps coding agents build editable, renderer-neutral 3D models from structured data instead of repeatedly writing low-level geometry, layout, path, anchor, and measurement code.

## What it is

AgentSceneBuilder sits between an AI Agent and rendering or export targets:

```text
Intent / dimensions / relationships
        ↓
CompositionSpec
        ↓
Spatial methods and reusable components
        ↓
Renderer-neutral geometry graph
        ↓
Web / Three.js / CAD / BIM / other adapters
```

The source of truth is the digital model, not a mesh file, screenshot, or renderer-specific scene.

## Why it exists

AI Agents can already write Three.js or other 3D code, but they tend to repeat fragile work in every task:

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
- A small set of generic components and spatial methods is more valuable than a huge list of fixed templates.
- Repetition keeps its rule and prototype, instead of only storing expanded geometry.
- Methods return facts, candidates, reviewable proposals, or generated CompositionSpec models; they do not silently make domain decisions for the Agent.
- Three.js, GLB/GLTF, CAD, BIM, and web pages are adapters, not the project boundary.
- The current Agent integration path is Skill + CLI.

## What is included

- `@agentscene/core`: renderer-neutral CompositionSpec compiler and spatial methods.
- `@agentscene/cli`: JSON-output command line interface for Agents and scripts.
- `registry/`: open digital model library with components, methods, and complete parametric models.
- `apps/library`: static model library website for previewing and copying model code.
- `apps/editor`: static web editor for viewing and lightly editing CompositionSpec models.
- `SKILL.md`: Agent-facing skill instructions for Codex/YuntaoCode-style hosts.
- `.codex-plugin/plugin.json`: minimal Codex plugin manifest that exposes the Skill + CLI route.

## Quick start

Install dependencies from the lockfile:

```powershell
npm ci
```

List available core components:

```powershell
npm run agentscene -- component list
```

Find a public model, check it for errors and build the cable tray example.

```powershell
npm run agentscene -- registry search 桥架
npm run agentscene -- registry search --domain mep --kind component 滑移
npm run agentscene -- composition check registry/compositions/cable-tray-elbow/manifest.json
npm run agentscene -- component build registry/compositions/cable-tray-elbow/manifest.json
```

Check an assembly, then build the scene.

```powershell
npm run agentscene -- scene check examples/digital-modeling/composed-scene.json
npm run agentscene -- scene build examples/digital-modeling/composed-scene.json
```

Analyze a pipe/path example:

```powershell
npm run agentscene -- path analyze examples/digital-modeling/paths/analyze-water-pipe.json
```

Generate MEP route pipes with reusable pipe-clip repetition:

```powershell
npm run agentscene -- mep route-with-clips examples/digital-modeling/mep/route-with-clips.json
```

Check a drain route's slope facts:

```powershell
npm run agentscene -- mep drain-slope-check examples/digital-modeling/mep/drain-slope-check.json
```

Analyze a GLB as reference evidence without importing it as the model:

```powershell
npm run agentscene -- reference analyze-glb path/to/reference.glb
```

The CLI writes one JSON object to stdout. Proposals are advisory and should be reviewed before being applied.

## Model library

The registry is an open content source for people and Agents. It is not a downloaded mesh asset folder.

Current public scope: architecture, construction, MEP, industrial teaching, and engineering-scene digital models. Experimental `character.*` entries may remain in the repository for internal research, but they are hidden from the default library and editor until their quality is good enough for the product direction.

Registry entries can be:

- `component`: reusable parameterized building blocks;
- `method`: reusable spatial or modeling procedures;
- `composition`: complete editable objects or systems made from structured geometry.

Complete models should describe a single recognizable object or system, such as a fire extinguisher, excavator, flatbed truck, keyboard, monitor, pipe support layout, or construction assembly. They should not be arbitrary scenes filled with unrelated props.

The library can also contain agent-usable modeling methods where the useful output is rules, dimensions, paths, anchors, quantities, risk facts, layout candidates, or reviewable changesets rather than a fixed mesh asset.

See [registry/README.md](registry/README.md) for contribution rules.

## Web tools

The library and editor are static web apps. They do not define the model protocol and do not require a specific server.

- [Model library](apps/library/README.md)
- [Editor](apps/editor/README.md)

You can serve them with any static HTTP server, such as `live-server`, Python, Nginx, IIS, Caddy, or the included development server.

## Agent integration

AgentSceneBuilder can be used as:

- a repository-root Skill through [SKILL.md](SKILL.md);
- a local CLI through `npm run agentscene -- ...`;
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
- [GitHub release plan](docs/open-source-release.md)

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
