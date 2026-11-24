# Open Source Release Plan

This checklist prepares AgentSceneBuilder for a GitHub open source release. It does not publish the repository or create a GitHub project by itself.

## Release position

AgentSceneBuilder should be introduced as:

> Open-source digital modeling infrastructure for AI large language models. Agents use the Skill and CLI to find, compose, calculate and validate reusable 3D models. Browser previews support review and parameter adjustments.

Avoid positioning it as:

- a Three.js framework;
- a GLB/GLTF model marketplace;
- a BIM/CAD replacement;
- a fixed teaching-courseware template;
- an MCP service.

## Repository readiness

- [x] README explains the product boundary.
- [x] `SKILL.md` defines Agent usage.
- [x] `packages/cli` exposes a stable CLI entry.
- [x] `.codex-plugin/plugin.json` validates.
- [x] Registry entries use Apache-2.0 in manifests.
- [x] Tests cover core, registry, editor transfer, CLI, and plugin packaging.
- [x] GitHub CI workflow exists.
- [x] Issue and PR templates exist.
- [x] Dependency directories are ignored; dependencies are restored from `package-lock.json`.
- [x] Public repository: `yuntaozn/AgentSceneBuilder`.
- [x] Copyright holder: yuntaozn.
- [x] License choice confirmed: Apache-2.0.
- [x] First public release tag: `v0.1.0-alpha.1`.

## Recommended GitHub repository settings

- Repository name: `AgentSceneBuilder` or `agentscene-builder`.
- Visibility: public when license/copyright are confirmed.
- Default branch: `main`.
- Enable Issues and Discussions if you want design proposals and model-library requests outside PRs.
- Enable branch protection after the first public push:
  - require CI;
  - require pull request review for registry changes;
  - disallow force-pushes to `main`.

## Suggested topics

```text
ai-agent
3d
digital-modeling
parametric-modeling
composition-spec
threejs
web-editor
open-registry
construction
engineering
```

## First release checklist

1. Confirm copyright holder.
2. Create the GitHub repository.
3. Push the current source.
4. Verify GitHub Actions passes.
5. Open one issue for each known boundary:
   - CompositionSpec schema stabilization;
   - repeated instance addressing;
   - plugin marketplace installation flow;
   - model registry contribution review;
   - editor UX polish.
6. Tag a pre-release such as `v0.1.0-alpha.1`.

## Release validation commands

```powershell
npm.cmd ci
npm.cmd run registry:check
npm.cmd run agentscene -- --help
node --test tests/*.test.js
npm.cmd run build:library
npm.cmd run build:editor
```

The build commands regenerate bundled web assets. Review bundle diffs before committing them.

## Dependency policy

Upload source files, `package.json`, and `package-lock.json`. Do not upload installed dependency folders or package-manager caches:

- `node_modules/`
- `.npm/`
- `.yarn/`
- `.pnp.*`
- package-manager debug logs

GitHub Actions will reinstall dependencies with `npm ci`.
