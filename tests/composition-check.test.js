import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { checkComposition, compileCompositionSpec, createDefaultRegistry } from "../packages/core/src/index.js";

function cli(args, input) {
  const { stdout, stderr, status } = spawnSync(process.execPath, ["packages/cli/src/agentscene.mjs", "composition", "check", ...args], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", input,
  });
  assert.equal(stderr, "");
  return { status, report: JSON.parse(stdout) };
}

function withoutSourceRanges({ sourceRange, relatedLocations, ...issue }) {
  return relatedLocations
    ? { ...issue, relatedLocations: relatedLocations.map(({ sourceRange, ...location }) => location) }
    : issue;
}

test("reports independent errors on duplicate nodes, ambiguous references and unrelated cycles", () => {
  const spec = {
    id: "sample",
    nodes: [
      { id: "pipe", geometry: { type: "box", size: [1, -1, 1] } },
      { id: "pipe", parent: "missing", light: { type: "sun" } },
      { id: "child", parent: "pipe" },
      { id: "a", parent: "b" }, { id: "b", parent: "a" }, { id: "leaf", parent: "a" },
      { id: "clips", repetition: { type: "linear", count: 2, step: [0, 1, 0] } },
      { id: "nested", parent: "clips" },
    ],
    anchors: { "bad/key~": { node: "clips", position: [0,0,0], occurrence: 8 } },
  };
  const { status, report } = cli(["-"], JSON.stringify(spec));
  assert.equal(status, 2);
  assert.equal(report.ok, false);
  assert.deepEqual(new Map(report.issues.map(issue => [issue.path, issue.code])), new Map([
    ["/nodes/0/geometry/size/1", "GEOMETRY_INVALID"], ["/nodes/1/id", "NODE_ID_DUPLICATE"],
    ["/nodes/1/parent", "PARENT_MISSING"], ["/nodes/1/light/type", "LIGHT_INVALID"],
    ["/nodes/2/parent", "PARENT_AMBIGUOUS"], ["/nodes/3/parent", "PARENT_CYCLE"],
    ["/nodes/4/parent", "PARENT_CYCLE"], ["/nodes/7/parent", "PARENT_REPEATED"],
    ["/anchors/bad~1key~0/occurrence", "ANCHOR_OCCURRENCE_INVALID"],
  ]));
  assert.ok(report.issues.every(issue => issue.nodeId && issue.message));
  assert.throws(() => compileCompositionSpec(spec), /Duplicate/);
});

test("reports paths relative to the source envelope and keeps checking when IDs or nodes are invalid", () => {
  const spec = { nodes: [null, { geometry: { type: "unknown" } }, {
    id: "bad", repetition: { type: "grid", count: [2, 0, 2] }, transform: { position: [0], scale: false },
  }] };
  const doc = { component: "core.composition", parameters: spec };
  const manifest = { kind: "composition", editor: { document: doc } };
  for (const [value, root, base] of [[spec, "", ""], [doc, "", "/parameters"], [manifest, "/editor/document", "/editor/document/parameters"]]) {
    const paths = checkComposition(value).issues.map(issue => issue.path);
    for (const path of [root + "/id", ...["/nodes/0", "/nodes/1/id", "/nodes/1/geometry/type", "/nodes/2/repetition/count/1",
      "/nodes/2/transform/scale", "/nodes/2/transform/position"].map(part => base + part)]) {
      assert.ok(paths.includes(path), path);
    }
  }
});

test("composition diagnostics link duplicate declarations, ambiguous targets and cycle edges in a manifest", () => {
  const model = {
    id: "demo", component: "core.composition", parameters: {
      nodes: [
        { id: "tray" }, { id: "tray" }, { id: "child", parent: "tray" }, { id: "tray" },
        { id: "a", parent: "b" }, { id: "b", parent: "a" }, { id: "self", parent: "self" },
        { id: "orphan", parent: "gone" },
      ],
      anchors: { "out/~": { node: "tray", position: [0, 0, 0] } },
    },
  };
  const text = JSON.stringify({ kind: "composition", editor: { document: model } }, null, 2);
  const base = "/editor/document/parameters";
  const { status, report } = cli(["-", "--source-ranges"], text);
  assert.equal(status, 2);
  const issueAt = path => report.issues.find(issue => issue.path === base + path);
  const offsets = [...text.matchAll(/"id": "tray"/g)].map(match => match.index + '"id": '.length);
  for (const index of [1, 3]) {
    const duplicate = issueAt(`/nodes/${index}/id`);
    assert.equal(duplicate.code, "NODE_ID_DUPLICATE");
    assert.deepEqual(duplicate.relatedLocations.map(location => [location.kind, location.path, location.sourceRange.offset]),
      [["first-declaration", base + "/nodes/0/id", offsets[0]]]);
  }
  for (const [path, code] of [["/nodes/2/parent", "PARENT_AMBIGUOUS"], ["/anchors/out~1~0/node", "ANCHOR_NODE_AMBIGUOUS"]]) {
    const issue = issueAt(path);
    assert.equal(issue.code, code);
    assert.deepEqual(issue.relatedLocations.map(location => [location.kind, location.path, location.sourceRange.offset]),
      [0, 1, 3].map((index, occurrence) => ["candidate-declaration", base + `/nodes/${index}/id`, offsets[occurrence]]));
    assert.ok(issue.relatedLocations.every(location => location.sourceRange.matchedPath === location.path));
  }
  for (const [index, next, nextValue] of [[4, 5, "a"], [5, 4, "b"]]) {
    const cycle = issueAt(`/nodes/${index}/parent`);
    assert.equal(cycle.code, "PARENT_CYCLE");
    const [edge] = cycle.relatedLocations;
    assert.deepEqual([edge.kind, edge.path], ["cycle-edge", base + `/nodes/${next}/parent`]);
    assert.equal(text.slice(edge.sourceRange.offset, edge.sourceRange.offset + edge.sourceRange.length), JSON.stringify(nextValue));
  }
  assert.equal(issueAt("/nodes/6/parent").relatedLocations, undefined);
  assert.equal(issueAt("/nodes/7/parent").relatedLocations, undefined);
  const plain = cli(["-"], text);
  assert.deepEqual(report.issues.map(withoutSourceRanges), plain.report.issues);
});

test("composition check suggests only usable nearby node IDs and local anchor names", () => {
  const spec = {
    id: "reference-demo",
    nodes: [
      { id: "bracket" }, { id: "clamp", parent: "brakcet" }, { id: "brakce", parent: "clamp" },
      { id: "clip-bank", repetition: { type: "linear", count: 2, step: [0, 1, 0] } },
      { id: "bay3" }, { id: "bay1" }, { id: "bay0" }, { id: "bay2" }, { id: "stop", parent: "bayx" },
      { id: "🚧位点" }, { id: "unicode", parent: "🚧位错" },
    ],
    anchors: {
      mount: { node: "braket", position: [0, 0, 0] },
      selected: { node: "clip-bnak", occurrence: 1, position: [0, 0, 0] },
      unselected: { node: "clip-bnak", position: [0, 0, 0] },
      inlet: [0, 0, 0], outlet: [0, 0, 0],
    },
    attachments: [{ from: "inlte", to: "outelt" }],
  };
  const { status, report } = cli(["-", "--source-ranges"], JSON.stringify(spec, null, 2));
  assert.equal(status, 2);
  const byPath = new Map(report.issues.map(issue => [issue.path, issue]));
  for (const [path, values] of [
    ["/nodes/1/parent", ["bracket"]],
    ["/nodes/8/parent", ["bay0", "bay1", "bay2"]],
    ["/nodes/10/parent", ["🚧位点"]],
    ["/anchors/mount/node", ["bracket"]],
    ["/anchors/selected/node", ["clip-bank"]],
    ["/anchors/unselected/node", undefined],
    ["/attachments/0/from", ["inlet"]], ["/attachments/0/to", ["outlet"]],
  ]) {
    const issue = byPath.get(path);
    assert.deepEqual(issue.suggestedValues, values, path);
    assert.equal(issue.sourceRange.matchedPath, path);
  }
  spec.nodes[1].parent = byPath.get("/nodes/1/parent").suggestedValues[0];
  spec.nodes[8].parent = byPath.get("/nodes/8/parent").suggestedValues[0];
  spec.nodes[10].parent = byPath.get("/nodes/10/parent").suggestedValues[0];
  spec.anchors.mount.node = byPath.get("/anchors/mount/node").suggestedValues[0];
  spec.anchors.selected.node = byPath.get("/anchors/selected/node").suggestedValues[0];
  delete spec.anchors.unselected;
  spec.attachments[0].from = byPath.get("/attachments/0/from").suggestedValues[0];
  spec.attachments[0].to = byPath.get("/attachments/0/to").suggestedValues[0];
  assert.deepEqual(cli(["-"], JSON.stringify(spec)), { status: 0, report: { ok: true, issues: [] } });
});

test("CLI check handles valid manifests, stdin, parse errors and file errors with one JSON report", () => {
  const good = { status: 0, report: { ok: true, issues: [] } };
  assert.deepEqual(cli(["registry/compositions/cable-tray-elbow/manifest.json"]), good);
  assert.deepEqual(cli(["registry/methods/anchor-attachment/manifest.json"]), good);
  assert.deepEqual(cli(["registry/components/mep/pipe-clip/manifest.json"]), good);
  assert.deepEqual(cli(["-"], '{"id":"ok","nodes":[]}'), good);
  for (const [args, input, code] of [[["-"], "{", "JSON_INVALID"], [["./absent-composition-fixture.json"], "", "FILE_UNREADABLE"], [[], "", "INPUT_REQUIRED"]]) {
    const result = cli(args, input);
    assert.equal(result.status, 2);
    assert.equal(result.report.issues[0].code, code);
    assert.equal(result.report.issues[0].path, "");
  }
});

test("CLI source ranges locate the original wrapped fields, with UTF-16 offsets and missing-field fallback", () => {
  const lines = [
    "{",
    '  "kind": "composition",',
    '  "editor": { "document": {',
    '    "id": "demo", "component": "core.composition",',
    '    "parameters": {',
    '      "nodes": [{ "id": "管🐱" }, { "id": "管🐱", "parent": "first", "parent": "rack" }, {}],',
    '      "anchors": { "a~/": { "node": "missing", "position": [0, 0, 0] } }',
    "    }",
    "  } }",
    "}",
  ];
  const text = lines.join("\r\n");
  const { status, report } = cli(["-", "--source-ranges"], text);
  assert.equal(status, 2);
  const base = "/editor/document/parameters";
  const cases = [
    ["/nodes/1/id", "/nodes/1/id", '"管🐱"', 6, lines[5].lastIndexOf('"管🐱"')],
    ["/nodes/1/parent", "/nodes/1/parent", '"rack"', 6, lines[5].indexOf('"rack"')],
    ["/nodes/2/id", "/nodes/2", "{}", 6, lines[5].indexOf("{}")],
    ["/anchors/a~0~1/node", "/anchors/a~0~1/node", '"missing"', 7, lines[6].indexOf('"missing"')],
  ];
  for (const [path, matched, token, line, columnIndex] of cases) {
    const { sourceRange } = report.issues.find(issue => issue.path === base + path);
    assert.deepEqual(sourceRange, {
      offset: lines.slice(0, line - 1).join("\r\n").length + 2 + columnIndex,
      length: token.length, line, column: columnIndex + 1, endLine: line, endColumn: columnIndex + token.length + 1,
      matchedPath: base + matched,
    });
    assert.equal(text.slice(sourceRange.offset, sourceRange.offset + sourceRange.length), token);
  }
  const plain = cli(["-"], text);
  assert.deepEqual(report.issues.map(withoutSourceRanges), plain.report.issues);
});

test("source ranges point to a syntax token or EOF and preserve the input error contract", () => {
  const missingComma = '{\r\n  "id": "demo"\r\n  "nodes": []\r\n}';
  const incomplete = '{\r\n  "nodes": [\r\n';
  const cases = [
    [missingComma, "CommaExpected", { offset: missingComma.indexOf('"nodes"'), length: 7, line: 3, column: 3, endLine: 3, endColumn: 10 }],
    [incomplete, "CloseBracketExpected", { offset: incomplete.length, length: 0, line: 3, column: 1, endLine: 3, endColumn: 1 }],
  ];
  for (const [text, syntaxCode, expected] of cases) {
    const { status, report } = cli(["--source-ranges", "-"], text);
    assert.equal(status, 2);
    assert.equal(report.issues.length, 1);
    const [issue] = report.issues;
    assert.deepEqual([issue.code, issue.syntaxCode, issue.path, issue.sourceRange], ["JSON_INVALID", syntaxCode, "", expected]);
  }
  assert.deepEqual(cli(["--source-ranges", "-"], '{"id":"ok","nodes":[]}'), { status: 0, report: { ok: true, issues: [] } });
  for (const [args, code] of [[[], "INPUT_REQUIRED"], [["./absent-composition-fixture.json"], "FILE_UNREADABLE"]]) {
    const { status, report } = cli([...args, "--source-ranges"]);
    assert.equal(status, 2);
    assert.equal(report.issues[0].code, code);
    assert.equal(report.issues[0].sourceRange, undefined);
  }
  const deep = '{"nodes":[],"metadata":' + "[".repeat(10000) + "0" + "]".repeat(10000) + "}";
  const { status, report } = cli(["-", "--source-ranges"], deep);
  assert.equal(status, 2);
  assert.deepEqual(report.issues.map(issue => [issue.code, issue.path]), [["ID_INVALID", "/id"]]);
});

test("CLI returns JSON punctuation edits that can be applied together without changing formatting", () => {
  const lines = [
    "{",
    '  "id": "demo"',
    '  "nodes": [',
    '    { "id" "one" },',
    '    { "id": "two" "parent": "one" },',
    "  ],",
    '  "anchors": { "pin": [0, 0, 0,] }',
    "}",
  ];
  const text = lines.join("\r\n");
  const { status, report } = cli(["--source-ranges", "-"], text);
  assert.equal(status, 2);
  assert.equal(report.ok, false);
  assert.ok(report.issues.every(issue => issue.code === "JSON_INVALID" && issue.path === "" && issue.message));
  assert.deepEqual(report.issues.map(({ syntaxCode, sourceRange: range }) => [
    syntaxCode, range.line, range.column, text.slice(range.offset, range.offset + range.length),
  ]), [
    ["CommaExpected", 3, 3, '"nodes"'],
    ["ColonExpected", 4, lines[3].indexOf('"one"') + 1, '"one"'],
    ["CommaExpected", 5, lines[4].indexOf('"parent"') + 1, '"parent"'],
    ["TrailingComma", 5, lines[4].lastIndexOf(",") + 1, ","],
    ["TrailingComma", 7, lines[6].lastIndexOf(",") + 1, ","],
  ]);
  const plain = cli(["-"], text);
  assert.equal(plain.status, 2);
  assert.equal(plain.report.issues.length, 1);
  assert.equal(plain.report.issues[0].syntaxCode, undefined);
  assert.equal(plain.report.issues[0].fix, undefined);
  const edits = report.issues.map(issue => issue.fix);
  assert.deepEqual(edits, [
    { offset: text.indexOf('"demo"') + '"demo"'.length, length: 0, text: "," },
    { offset: text.indexOf('"id" "one"') + '"id"'.length, length: 0, text: ":" },
    { offset: text.indexOf('"two" "parent"') + '"two"'.length, length: 0, text: "," },
    { offset: text.indexOf(",\r\n  ]"), length: 1, text: "" },
    { offset: text.lastIndexOf(",]"), length: 1, text: "" },
  ]);
  const fixed = [...edits].sort((a, b) => b.offset - a.offset).reduce((source, edit) =>
    source.slice(0, edit.offset) + edit.text + source.slice(edit.offset + edit.length), text);
  assert.equal(fixed, text.replace('"demo"', '"demo",').replace('"id" "one"', '"id": "one"')
    .replace('"two" "parent"', '"two", "parent"').replace(/,(\s*\])/g, "$1"));
  assert.deepEqual(cli(["-", "--source-ranges"], fixed), { status: 0, report: { ok: true, issues: [] } });
});

test("syntax recovery keeps confirmed diagnostics and avoids cascades after a mismatched delimiter", () => {
  const text = '{"id":"demo" "nodes":[{"id":"a"],"extra" 2}';
  const { status, report } = cli(["-", "--source-ranges"], text);
  assert.equal(status, 2);
  assert.deepEqual(report.issues.map(({ syntaxCode, sourceRange }) => [syntaxCode, sourceRange.offset, sourceRange.length]), [
    ["CommaExpected", text.indexOf('"nodes"'), 7],
    ["UnexpectedClosingDelimiter", text.indexOf("]"), 1],
  ]);
  assert.equal(report.issues[0].fix.text, ",");
  assert.equal(report.issues[1].fix, undefined);
  const missingValue = '{"id":,}';
  const { report: missing } = cli(["-", "--source-ranges"], missingValue);
  assert.deepEqual(missing.issues.map(issue => [issue.syntaxCode, issue.sourceRange.offset]),
    [["ValueExpected", missingValue.indexOf(",")]]);
  assert.equal(missing.issues[0].fix, undefined);
});

test("JSON edits preserve ambiguous numeric tokens and distinguish a property from a missing value", () => {
  for (const [text, code] of [
    ['[01]', "CommaExpected"], ['[0-1]', "CommaExpected"],
    ['{"id" "nodes": []}', "ColonExpected"], ['["a",,"b"]', "UnexpectedComma"],
  ]) {
    const { status, report } = cli(["-", "--source-ranges"], text);
    assert.equal(status, 2);
    assert.equal(report.issues[0].syntaxCode, code);
    assert.ok(report.issues.every(issue => issue.fix === undefined));
  }
  const text = '{"id":"ok","nodes" []}';
  const { status, report } = cli(["-", "--source-ranges"], text);
  assert.equal(status, 2);
  assert.deepEqual(report.issues.map(issue => [issue.syntaxCode, issue.fix]), [
    ["ColonExpected", { offset: text.indexOf('"nodes"') + '"nodes"'.length, length: 0, text: ":" }],
  ]);
  const { offset, length, text: replacement } = report.issues[0].fix;
  const fixed = text.slice(0, offset) + replacement + text.slice(offset + length);
  assert.deepEqual(cli(["-", "--source-ranges"], fixed), { status: 0, report: { ok: true, issues: [] } });
});

test("duplicate JSON keys report each occurrence with its first key and keep semantic issues", () => {
  const lines = [
    "{",
    '  "kind": "composition",',
    '  "editor": { "document": { "id": "demo", "component": "core.composition", "parameters": {',
    String.raw`    "nodes": [{ "id": "one", "parent": "nowhere", "metadata": { "a~/": 1, "a\u007e\/": 2, "a~/": 3 } }],`,
    String.raw`    "metadata": [{ "0": 0, "0": 1, "": 1, "": 2, "__proto__": 1, "__proto__": 2 }, { "0": 0, "": 0 },`,
    String.raw`      { "note": "Text containing \"a~/\": 2 is a string" }]`,
    "  } } }",
    "}",
  ];
  const text = lines.join("\r\n");
  const { status, report } = cli(["--reject-duplicate-keys", "-", "--source-ranges"], text);
  assert.equal(status, 2);
  assert.equal(report.ok, false);
  const base = "/editor/document/parameters";
  const duplicates = report.issues.filter(issue => issue.code === "JSON_KEY_DUPLICATE");
  assert.deepEqual(duplicates.map(i => [i.path, i.key]), [
    [base + "/nodes/0/metadata/a~0~1", "a~/"], [base + "/nodes/0/metadata/a~0~1", "a~/"],
    [base + "/metadata/0/0", "0"], [base + "/metadata/0/", ""], [base + "/metadata/0/__proto__", "__proto__"],
  ]);
  const token = ({ offset, length }) => text.slice(offset, offset + length);
  assert.deepEqual(duplicates.map(i => [token(i.firstSourceRange), token(i.sourceRange), i.sourceRange.line]), [
    ['"a~/"', String.raw`"a\u007e\/"`, 4], ['"a~/"', '"a~/"', 4],
    ['"0"', '"0"', 5], ['""', '""', 5], ['"__proto__"', '"__proto__"', 5],
  ]);
  assert.deepEqual(duplicates[0].firstSourceRange, duplicates[1].firstSourceRange);
  const domain = report.issues.filter(issue => issue.code !== "JSON_KEY_DUPLICATE");
  assert.deepEqual(domain.map(i => [i.code, i.path, token(i.sourceRange)]), [["PARENT_MISSING", base + "/nodes/0/parent", '"nowhere"']]);
  const corrected = JSON.parse(text);
  delete corrected.editor.document.parameters.nodes[0].parent;
  assert.deepEqual(cli(["-", "--reject-duplicate-keys"], JSON.stringify(corrected)), { status: 0, report: { ok: true, issues: [] } });
});

test("duplicate key locations are available in deeply nested source", () => {
  const depth = 10000;
  const text = '{"id":"demo","nodes":[],"metadata":' + "[".repeat(depth) + '{"key":1,"key":2}' + "]".repeat(depth) + "}";
  const { status, report } = cli(["--source-ranges", "--reject-duplicate-keys", "-"], text);
  assert.equal(status, 2);
  assert.equal(report.issues.length, 1);
  const [issue] = report.issues;
  assert.equal(issue.code, "JSON_KEY_DUPLICATE");
  assert.equal(issue.path, "/metadata" + "/0".repeat(depth) + "/key");
  assert.equal(issue.firstSourceRange.offset, text.indexOf('"key"'));
  assert.equal(issue.sourceRange.offset, text.lastIndexOf('"key"'));
});

test("reports independent errors discovered after parent matrices are applied", () => {
  const spec = {
    id: "collapsed",
    nodes: [
      { id: "group", transform: { scale: [0, 1, 1] } },
      ...["one", "two"].map(id => ({ id, parent: "group", geometry: {
        type: "cylinder-between", start: [0,0,0], end: [1,0,0], radius: .1,
      } })),
    ],
    anchors: { port: { node: "group", position: [0,0,0], direction: [1,0,0] } },
  };
  assert.deepEqual(checkComposition(spec).issues.map(issue => [issue.nodeId, issue.path]), [
    ["one", "/nodes/1/geometry"], ["two", "/nodes/2/geometry"], ["group", "/anchors/port/direction"],
  ]);
  assert.throws(() => compileCompositionSpec(spec), /must differ/);
});

test("check and component build agree on generated IDs and instance-space anchor directions", () => {
  const registry = createDefaultRegistry();
  const geometry = { type: "box", size: [1, 1, 1] };
  const instance = {
    component: "core.composition", id: "demo", transform: { scale: [0, 1, 1] }, parameters: {
      nodes: [
        { id: "clip", geometry, repetition: { type: "linear", count: 2, step: [1, 0, 0] } },
        { id: "clip.000", geometry },
      ],
      anchors: { "out/~": { node: "clip.000", position: [0,0,0], direction: [1,0,0] } },
    },
  };
  const before = structuredClone(instance);
  const result = checkComposition(instance);
  assert.deepEqual(result.issues.map(i => [i.code, i.path, i.nodeId]), [
    ["GENERATED_ID_DUPLICATE", "/parameters/nodes/1/id", "clip.000"],
    ["ANCHOR_TRANSFORM_INVALID", "/parameters/anchors/out~1~0/direction", "clip.000"],
  ]);
  assert.deepEqual(instance, before);
  assert.throws(() => registry.build(instance), /Duplicate generated/);
  instance.parameters.nodes[1].id = instance.parameters.anchors["out/~"].node = "single";
  assert.throws(() => registry.build(instance), /must not be zero/);
  instance.transform.scale = [1,1,1];
  assert.deepEqual(checkComposition(instance), { ok: true, issues: [] });
  assert.doesNotThrow(() => registry.build(instance));
});

test("bad geometry and broken hierarchy do not hide unrelated placement errors", () => {
  const cylinder = { type: "cylinder-between", start: [0,0,0], end: [1,0,0], radius: .1 };
  const doc = { component: "core.composition", id: "branches", parameters: {
    nodes: [
      { id: "broken", parent: "missing" }, { id: "nested", parent: "broken", geometry: cylinder },
      { id: "rod", parent: "flat", geometry: cylinder },
      { id: "flat", transform: { scale: [0,1,1] }, geometry: { type: "sphere", radius: -1 } },
    ],
    anchors: { out: { node: "flat", position: [0,0,0], direction: [1,0,0] } },
  } };
  const result = cli(["-"], JSON.stringify({kind:"composition",editor:{document:doc}}));
  assert.equal(result.status, 2);
  assert.deepEqual(result.report.issues.map(i => i.path).sort(), [
    "nodes/0/parent", "nodes/2/geometry", "nodes/3/geometry/radius", "anchors/out/direction",
  ].map(path => "/editor/document/parameters/" + path).sort());
});
