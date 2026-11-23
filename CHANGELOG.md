# Changelog

All notable changes to AgentSceneBuilder will be documented here.

The project is currently pre-release.

## 0.1.0-alpha.3

- Expanded the public model library to 882 base components, 24 complete models, and 11 spatial methods. Added 53 assembly examples across structure, building services, site works, and prefabrication.
- Added catalog pagination, domain and type filters, and on-demand model loading. Previews share the editor's GPU renderer and studio lighting, with a Canvas fallback.
- Added direct editor import for compatible SceneSpec assemblies. Imports preserve editable nodes, anchors, connections, and animations.
- Added `--domain` and `--kind` filters to `registry search` and broadened the modeled geometry and assembly details supported by the core.
- Clarified the model library's focus on large language models and simplified its navigation.

## 0.1.0-alpha.2

- Added `composition check` and `scene check` for reporting multiple issues in one JSON response. Diagnostics include JSON Pointers, related declarations, reference suggestions, and optional source ranges and punctuation fixes. Use `--reject-duplicate-keys` to detect repeated JSON members.
- Added draft checking, batch punctuation repair with restore, and navigation to both occurrences of duplicate keys in the editor. Rebuilding a draft with duplicate keys reports an error and preserves the previous preview.
- Added `registry search` and an editable cable-tray elbow built with the new `sweep` geometry. The public catalog now has 44 entries.
- Added pipe outside-diameter checks and connection measurements. Editing a generated route updates its endpoint anchors, clip placements, and length. The pipe-reducer example demonstrates an assembly using these checks.
- Improved bounds for transformed geometry and added connection review to scene alignment and distribution proposals.
- Served the library and editor from the same local server and unified the editor build commands. CI verifies that the committed web bundles match the source.

## 0.1.0-alpha.1

- Established renderer-neutral CompositionSpec and digital modeling core.
- Added open registry for components, methods, and complete digital models.
- Added static model library and web editor.
- Added Skill + CLI route for Codex/YuntaoCode style Agent usage.
- Added Codex plugin skeleton without MCP or long-running services.
