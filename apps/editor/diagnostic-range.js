import { checkComposition } from "../../packages/core/src/composition-check.js";
import { describeJsonSyntax, duplicateJsonKeyDiagnostics, indexJsonSource, jsonRangeLocator } from "../../packages/core/src/json-source.js";
import { checkEditableScene, isSceneDocument } from "./scene-import.js";

function readSourceIndex(text) {
  try {
    return indexJsonSource(text);
  } catch (error) {
    // Deep input can exceed the range parser's stack even when native parsing succeeds.
    if (!(error instanceof RangeError)) throw error;
  }
}

export function syntaxDiagnostics(text, message) {
  const fallback = { code: "JSON_INVALID", path: "", message };
  const source = readSourceIndex(text);
  if (!source?.syntaxErrors.length) return [fallback];
  const locate = jsonRangeLocator(text);
  return describeJsonSyntax(text, source.syntaxErrors).map(({ offset, length, ...diagnostic }) => ({
    ...fallback, ...diagnostic, sourceRange: locate({ offset, length }),
  }));
}

export function checkSourceDraft(text, { registry } = {}) {
  let input;
  try {
    input = JSON.parse(text);
  } catch (error) {
    return { issues: syntaxDiagnostics(text, error.message) };
  }

  const duplicates = duplicateJsonKeyDiagnostics(text, { locate: jsonRangeLocator(text) });
  const issues = duplicates.map(({ firstSourceRange, ...issue }) => ({
    ...issue, relatedLocations: [{ kind: "first-declaration", sourceRange: firstSourceRange }],
  }));
  try {
    const result = isSceneDocument(input) ? checkEditableScene(input, registry) : checkComposition(input);
    return { input, issues: [...issues, ...result.issues] };
  } catch (error) {
    issues.push({ code: "COMPILE_FAILED", path: "", message: error.message });
    return { input, issues };
  }
}

export function applySyntaxFixes(source, issues) {
  const fixes = issues.map(issue => issue.fix).filter(Boolean);
  if (!fixes.length) return;
  fixes.sort((a, b) => a.offset - b.offset);
  const parts = [];
  let cursor = 0;
  let previousOffset = -1;
  for (const { offset, length, text } of fixes) {
    if (!Number.isInteger(offset) || !Number.isInteger(length) || length < 0 ||
        offset < cursor || offset === previousOffset || offset + length > source.length ||
        typeof text !== "string") return;
    parts.push(source.slice(cursor, offset), text);
    cursor = offset + length;
    previousOffset = offset;
  }
  parts.push(source.slice(cursor));
  return { text: parts.join(""), count: fixes.length };
}

export function diagnosticRange(text, issue) {
  if (issue.sourceRange) {
    const { offset, length } = issue.sourceRange;
    return { offset, length };
  }
  const source = readSourceIndex(text);
  if (source?.syntaxErrors.length) return source.syntaxErrors[0];
  const range = source?.rangeForPointer(issue.path ?? "");
  return { offset: range?.offset ?? 0, length: range?.length ?? 0 };
}
