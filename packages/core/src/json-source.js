import { createScanner, parseTree, printParseErrorCode, ScanError, SyntaxKind } from "jsonc-parser";

const syntaxMessages = {
  InvalidSymbol: "Expected a JSON token",
  InvalidNumberFormat: "Expected a valid JSON number",
  PropertyNameExpected: "Expected a quoted property name",
  ValueExpected: "Expected a JSON value",
  ColonExpected: "Expected a colon after the property name",
  CommaExpected: "Expected a comma between items",
  CloseBraceExpected: "Expected a closing brace",
  CloseBracketExpected: "Expected a closing bracket",
  EndOfFileExpected: "Expected the end of the document after the root value",
  InvalidCommentToken: "Remove the comment from the JSON input",
  UnexpectedEndOfComment: "Unexpected end of a comment",
  UnexpectedEndOfString: "Expected a closing double quote",
  UnexpectedEndOfNumber: "Expected more digits in the number",
  InvalidUnicode: "Expected four hexadecimal digits in the Unicode escape",
  InvalidEscapeCharacter: "Expected a valid JSON escape sequence",
  InvalidCharacter: "Escape the control character in the JSON string",
  TrailingComma: "Remove the trailing comma",
  UnexpectedComma: "Remove the unexpected comma",
  UnexpectedClosingDelimiter: "Unexpected closing delimiter",
};

function syntaxTokenContext(text, errorOffsets) {
  const scanner = createScanner(text, true);
  const expected = [];
  const delimiterIssues = new Map();
  const contexts = new Map();
  let previous;
  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    const offset = scanner.getTokenOffset();
    const current = { token, offset, end: offset + scanner.getTokenLength(), error: scanner.getTokenError() };
    const previousContext = contexts.get(previous?.offset);
    if (previousContext) previousContext.nextToken = token;
    if (errorOffsets.has(offset)) contexts.set(offset, { current, previous });
    if (token === SyntaxKind.OpenBraceToken) expected.push(SyntaxKind.CloseBraceToken);
    if (token === SyntaxKind.OpenBracketToken) expected.push(SyntaxKind.CloseBracketToken);
    if (token === SyntaxKind.CloseBraceToken || token === SyntaxKind.CloseBracketToken) {
      if (expected.pop() !== token) {
        delimiterIssues.set(offset, { syntaxCode: "UnexpectedClosingDelimiter", offset, length: 1 });
        break;
      }
      if (previous?.token === SyntaxKind.CommaToken) {
        delimiterIssues.set(offset, { syntaxCode: "TrailingComma", offset: previous.offset, length: 1 });
      }
    }
    if (token === SyntaxKind.CommaToken &&
        [SyntaxKind.OpenBraceToken, SyntaxKind.OpenBracketToken, SyntaxKind.CommaToken].includes(previous?.token)) {
      delimiterIssues.set(offset, { syntaxCode: "UnexpectedComma", offset, length: 1 });
    }
    previous = current;
  }
  return { delimiterIssues, contexts };
}

const literalTokens = [
  SyntaxKind.StringLiteral, SyntaxKind.NumericLiteral, SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword, SyntaxKind.NullKeyword,
];
const valueStartTokens = new Set([...literalTokens, SyntaxKind.OpenBraceToken, SyntaxKind.OpenBracketToken]);
const valueEndTokens = new Set([...literalTokens, SyntaxKind.CloseBraceToken, SyntaxKind.CloseBracketToken]);

function punctuationFix(diagnostic, context) {
  const { syntaxCode, offset, length } = diagnostic;
  if (syntaxCode === "TrailingComma") return { offset, length, text: "" };
  if (syntaxCode !== "ColonExpected" && syntaxCode !== "CommaExpected") return;
  const { current, previous, nextToken } = context ?? {};
  if (current?.error !== ScanError.None || previous?.error !== ScanError.None || !valueStartTokens.has(current.token)) return;
  if (syntaxCode === "ColonExpected") {
    // A quoted token followed by a colon can be the next property, rather than the missing value.
    if (previous.token === SyntaxKind.StringLiteral && nextToken !== SyntaxKind.ColonToken) {
      return { offset: previous.end, length: 0, text: ":" };
    }
    return;
  }
  if (!valueEndTokens.has(previous.token)) return;
  // A leading zero or an adjacent minus sign can belong to a malformed number.
  if (previous.token === SyntaxKind.NumericLiteral && current.token === SyntaxKind.NumericLiteral && previous.end === current.offset) return;
  return { offset: previous.end, length: 0, text: "," };
}

const recoverableSyntaxCodes = new Set([
  "CommaExpected", "TrailingComma", "UnexpectedComma", "InvalidCommentToken",
  "InvalidUnicode", "InvalidEscapeCharacter", "UnexpectedEndOfNumber",
]);

function canContinueSyntaxCheck(syntaxCode, token) {
  if (recoverableSyntaxCodes.has(syntaxCode)) return true;
  if (syntaxCode === "ColonExpected") return /^[-"0-9tfn]/.test(token ?? "");
  if (syntaxCode === "ValueExpected") return token === "," || token === "}" || token === "]";
  return syntaxCode === "PropertyNameExpected" && token === ",";
}

// Each reported token has one diagnostic. Stop once recovery can lose track of the surrounding JSON structure.
export function describeJsonSyntax(text, errors) {
  if (!errors.length) return [];
  const byOffset = new Map();
  for (const error of errors) {
    if (!byOffset.has(error.offset)) byOffset.set(error.offset, []);
    byOffset.get(error.offset).push(error);
  }
  const { delimiterIssues, contexts } = syntaxTokenContext(text, byOffset);
  const reported = new Map();
  for (const [offset, candidates] of byOffset) {
    let diagnostic = delimiterIssues.get(offset);
    if (!diagnostic) {
      let [error] = candidates;
      // When a token is also invalid in a property position, a comma by itself won't make it valid.
      if (printParseErrorCode(error.error) === "CommaExpected") {
        const expectedToken = candidates.find(candidate =>
          ["PropertyNameExpected", "ValueExpected"].includes(printParseErrorCode(candidate.error)));
        error = expectedToken ?? error;
      }
      diagnostic = { syntaxCode: printParseErrorCode(error.error), offset, length: error.length };
    }
    const { syntaxCode } = diagnostic;
    if (!reported.has(diagnostic.offset)) {
      const fix = punctuationFix(diagnostic, contexts.get(offset));
      reported.set(diagnostic.offset, {
        ...diagnostic, message: syntaxMessages[syntaxCode] ?? "Invalid JSON syntax", ...(fix ? { fix } : {}),
      });
    }
    if (!canContinueSyntaxCheck(syntaxCode, text[offset])) break;
  }
  return [...reported.values()].sort((a, b) => a.offset - b.offset);
}

function appendPointer(path, key) {
  return path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1");
}

// The caller has already parsed strict JSON. Track containers iteratively so duplicate
// discovery also works for documents too deeply nested for the source tree.
export function findDuplicateJsonKeys(text) {
  const scanner = createScanner(text, true);
  const containers = [];
  const duplicates = [];
  let previousToken;
  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    const container = containers.at(-1);
    switch (token) {
      case SyntaxKind.OpenBraceToken:
      case SyntaxKind.OpenBracketToken: {
        let path = "";
        if (container) path = container.keys ? container.valuePath : `${container.path}/${container.index}`;
        containers.push(token === SyntaxKind.OpenBraceToken ? { path, keys: new Map() } : { path, index: 0 });
        break;
      }
      case SyntaxKind.StringLiteral: {
        if (!container?.keys || (previousToken !== SyntaxKind.OpenBraceToken && previousToken !== SyntaxKind.CommaToken)) break;
        const key = scanner.getTokenValue();
        const path = appendPointer(container.path, key);
        container.valuePath = path;
        const range = { offset: scanner.getTokenOffset(), length: scanner.getTokenLength() };
        const firstRange = container.keys.get(key);
        if (firstRange) duplicates.push({ key, path, firstRange, range });
        else container.keys.set(key, range);
        break;
      }
      case SyntaxKind.CommaToken:
        if (!container.keys) container.index++;
        break;
      case SyntaxKind.CloseBraceToken:
      case SyntaxKind.CloseBracketToken:
        containers.pop();
        break;
    }
    previousToken = token;
  }
  return duplicates;
}

export function duplicateJsonKeyDiagnostics(text, { level, locate } = {}) {
  return findDuplicateJsonKeys(text).map(({ key, path, firstRange, range }) => ({
    code: "JSON_KEY_DUPLICATE", path, key, message: `Property ${JSON.stringify(key)} was already declared in this object`,
    ...(level ? { level } : {}),
    ...(locate ? { sourceRange: locate(range), firstSourceRange: locate(firstRange) } : {}),
  }));
}

function lineStarts(text) {
  const starts = [0];
  for (const newline of text.matchAll(/\r\n|\r|\n/g)) {
    starts.push(newline.index + newline[0].length);
  }
  return starts;
}

function positionAt(starts, offset) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (starts[middle] > offset) high = middle;
    else low = middle;
  }
  return { line: low + 1, column: offset - starts[low] + 1 };
}

export function jsonRangeLocator(text) {
  let starts;
  return ({ offset, length, matchedPath }) => {
    starts ??= lineStarts(text);
    const start = positionAt(starts, offset);
    const end = positionAt(starts, offset + length);
    return {
      offset, length, line: start.line, column: start.column, endLine: end.line, endColumn: end.column,
      ...(matchedPath === undefined ? {} : { matchedPath }),
    };
  };
}

export function indexJsonSource(text) {
  const errors = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });

  // A missing field has no source token. Select the nearest existing value along the pointer.
  function rangeForPointer(pointer = "") {
    let node = root;
    if (!node) return;
    let matchedPath = "";
    for (const part of pointer.split("/").slice(1)) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      let child;
      if (node.type === "array" && /^(0|[1-9]\d*)$/.test(key)) child = node.children?.[Number(key)];
      if (node.type === "object") {
        // JSON.parse uses the last property if a key occurs more than once.
        child = node.children?.findLast(property => property.children[0].value === key)?.children[1];
      }
      if (!child) break;
      node = child;
      matchedPath += "/" + part;
    }
    return { offset: node.offset, length: node.length, matchedPath };
  }

  return { syntaxErrors: errors, rangeForPointer };
}
