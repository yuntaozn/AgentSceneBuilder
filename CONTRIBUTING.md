# Contributing to AgentSceneBuilder

Thanks for considering a contribution. AgentSceneBuilder is an AI-facing digital modeling kernel, not a mesh asset dump or a fixed courseware template. Contributions should help Agents avoid repeated low-level geometry, spatial, and validation work.

## Good contributions

- A reusable spatial method, parameterized component, or complete digital model.
- A registry entry with clear `agent` guidance and quality checks.
- A CLI/Core improvement with deterministic JSON output.
- Editor or model-library improvements that keep CompositionSpec as the source of truth.
- Tests that prevent regressions in model scale, hierarchy, anchors, repetition, or plugin packaging.

## Before opening a pull request

Run:

```powershell
npm.cmd ci
npm.cmd run registry:check
npm.cmd run agentscene -- --help
node --test tests/*.test.js
```

Commit `package-lock.json` when dependencies change, but never commit installed dependency directories such as `node_modules/`.

If you changed editor or library source code, also run:

```powershell
npm.cmd run build:editor
npm.cmd run build:library
```

## Registry contribution rules

Use `registry/README.md` as the source of truth. In short:

- Prefer parameterized geometry and CompositionSpec over imported mesh files.
- Complete models should express one recognizable object or system, not a scene full of unrelated props.
- Preserve semantic IDs, units, anchors, editable parts, and quality checks.
- Keep generated/repeated structures declarative when possible.
- Do not add GLB/GLTF assets as the primary source of a model.

## Pull request expectations

- Explain what the contribution helps an Agent do more reliably.
- Include tests for new reusable behavior.
- Keep plugin integration on the Skill + CLI route; do not add MCP or long-running services unless the product direction is explicitly changed.
- Avoid unrelated formatting or large generated diffs.

## License

By contributing, you agree that your contribution is provided under the repository license.
