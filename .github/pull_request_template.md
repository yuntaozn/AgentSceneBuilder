## Summary

What can an LLM-powered Agent find, build, calculate or verify more reliably after this change? For browser changes, describe the model review workflow they support.

## Type of change

- [ ] Core / CompositionSpec
- [ ] CLI / Skill / plugin packaging
- [ ] Registry model or spatial method
- [ ] Editor / library UI
- [ ] Documentation
- [ ] Tests

## Checks

- [ ] `npm.cmd run registry:check`
- [ ] `npm.cmd run agentscene -- --help`
- [ ] `node --test tests/*.test.js`
- [ ] `npm.cmd run build:library` if UI/library code changed
- [ ] `npm.cmd run build:editor` if editor code changed

## Model-library quality

If this changes `registry/`, confirm:

- [ ] The entry expresses a reusable digital model or method, not a one-off visual scene.
- [ ] IDs, units, semantic types, anchors, and editable parts are clear.
- [ ] Agent guidance and quality checks are present.
- [ ] GLB/GLTF is not used as the primary model source.
