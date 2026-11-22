import test from "node:test";
import assert from "node:assert/strict";
import { applySyntaxFixes, checkSourceDraft, diagnosticRange, syntaxDiagnostics } from "../apps/editor/diagnostic-range.js";

test("source ranges locate the precise occurrence in the original JSON text", () => {
  const source = `{\n "nodes": [ { "id": "same" }, { "id" : "same" } ], "a~/": {"0": "\\u4e2d"} }`;
  const range = diagnosticRange(source, { path: "/nodes/1/id" });
  assert.equal(range.offset, source.lastIndexOf('"same"'));
  assert.equal(range.length, 6);
  const escaped = diagnosticRange(source, { path: "/a~0~1/0" });
  assert.equal(source.slice(escaped.offset, escaped.offset + escaped.length), '"\\u4e2d"');
  const missing = diagnosticRange(source, { path: "/nodes/1/geometry/type" });
  assert.equal(source.slice(missing.offset, missing.offset + missing.length), '{ "id" : "same" }');
});

test("syntax diagnostics point to the offending token or the end of an incomplete draft", () => {
  const missingComma = '{"one":1 "two":2}';
  assert.equal(diagnosticRange(missingComma, { path: "" }).offset, missingComma.indexOf('"two"'));
  const unfinished = '{"nodes":[';
  assert.equal(diagnosticRange(unfinished, { path: "" }).offset, unfinished.length);
});

test("editor syntax diagnostics retain a separate selectable range for each issue", () => {
  const text = '{\n  "id": "demo"\n  "nodes": [{ "id" "one" },]\n}';
  const issues = syntaxDiagnostics(text, "Invalid input");
  assert.deepEqual(issues.map(issue => issue.syntaxCode), ["CommaExpected", "ColonExpected", "TrailingComma"]);
  assert.deepEqual(issues.map(issue => {
    const { offset, length } = diagnosticRange(text, issue);
    return [text.slice(offset, offset + length), issue.sourceRange.line];
  }), [['"nodes"', 3], ['"one"', 3], [",", 3]]);
  assert.deepEqual(syntaxDiagnostics('{"id":"demo","nodes":[]}', "Fallback"), [
    { code: "JSON_INVALID", path: "", message: "Fallback" },
  ]);
});

test("editor applies punctuation edits together at their original UTF-16 offsets", () => {
  const text = ['{', '  "id": "管🐱"', '  "nodes": [{ "id" "one" },]', '}'].join("\r\n");
  const issues = syntaxDiagnostics(text, "Invalid input");
  const expected = ['{', '  "id": "管🐱",', '  "nodes": [{ "id": "one" }]', '}'].join("\r\n");
  assert.deepEqual(applySyntaxFixes(text, issues.reverse()), { text: expected, count: 3 });
  assert.deepEqual(JSON.parse(expected), { id: "管🐱", nodes: [{ id: "one" }] });
});

test("editor leaves ambiguous syntax for review after applying other fixes", () => {
  const text = '{"id":"demo" "nodes":[],"value":[01]}';
  const expected = '{"id":"demo", "nodes":[],"value":[01]}';
  const issues = syntaxDiagnostics(text, "Invalid input");
  assert.deepEqual(applySyntaxFixes(text, issues), { text: expected, count: 1 });
  const remaining = syntaxDiagnostics(expected, "Invalid input");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].syntaxCode, "CommaExpected");
  assert.equal(applySyntaxFixes(expected, remaining), undefined);
});

test("editor rejects overlapping and out-of-range edits as a batch", () => {
  const text = '[1,]';
  const issue = { fix: { offset: 2, length: 1, text: "" } };
  for (const fix of [
    { offset: 2, length: 0, text: ":" },
    { offset: 1, length: 2, text: "" },
    { offset: 4, length: 1, text: "" },
  ]) {
    assert.equal(applySyntaxFixes(text, [issue, { fix }]), undefined);
  }
});

test("draft checking locates both spellings of a repeated key and keeps model diagnostics", () => {
  const text = [
    '{ "id": "demo", "nodes": [',
    '  { "id": "base" },',
    String.raw`  { "id": "child🐱", "parent": "base", "par\u0065nt": "missing" }`,
    '] }',
  ].join("\r\n");
  const { input, issues } = checkSourceDraft(text);
  assert.equal(input.nodes[1].parent, "missing");
  assert.deepEqual(issues.map(issue => [issue.code, issue.path]), [
    ["JSON_KEY_DUPLICATE", "/nodes/1/parent"], ["PARENT_MISSING", "/nodes/1/parent"],
  ]);
  const [duplicate, missingParent] = issues;
  const [first] = duplicate.relatedLocations;
  assert.equal(first.kind, "first-declaration");
  assert.equal(duplicate.sourceRange.line, 3);
  const selected = issue => {
    const { offset, length } = diagnosticRange(text, issue);
    return text.slice(offset, offset + length);
  };
  assert.deepEqual([selected(first), selected(duplicate), selected(missingParent)], [
    '"parent"', String.raw`"par\u0065nt"`, '"missing"',
  ]);
});

test("draft checking reports duplicate keys immediately after punctuation repair", () => {
  const text = '{"id":"before" "id":"after","nodes":[]}';
  const { issues } = checkSourceDraft(text);
  assert.deepEqual(issues.map(issue => issue.syntaxCode), ["CommaExpected"]);
  const fixed = applySyntaxFixes(text, issues).text;
  assert.deepEqual(checkSourceDraft(fixed).issues.map(issue => issue.code), ["JSON_KEY_DUPLICATE"]);
  assert.deepEqual(checkSourceDraft('{"id":"after","nodes":[{"id":"one"},{"id":"two"}]}').issues, []);
});
