// Banded edit distance, including an adjacent transposition as one edit.
function editDistance(left, right, limit) {
  const outside = limit + 1;
  if (Math.abs(left.length - right.length) > limit) return outside;
  let previous = new Map();
  let twoRowsBack;
  for (let column = 0; column <= Math.min(right.length, limit); column++) previous.set(column, column);
  for (let row = 1; row <= left.length; row++) {
    const current = new Map();
    if (row <= limit) current.set(0, row);
    for (let column = Math.max(1, row - limit); column <= Math.min(right.length, row + limit); column++) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let distance = Math.min(
        (current.get(column - 1) ?? outside) + 1,
        (previous.get(column) ?? outside) + 1,
        (previous.get(column - 1) ?? outside) + cost,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        distance = Math.min(distance, (twoRowsBack.get(column - 2) ?? outside) + 1);
      }
      current.set(column, distance);
    }
    twoRowsBack = previous;
    previous = current;
  }
  return previous.get(right.length) ?? outside;
}

export function referenceSuggestions(value, candidates, isUsable) {
  if (typeof value !== "string" || !value) return [];
  const name = Array.from(value.toLowerCase());
  // Very short identifiers get case-only suggestions to avoid matching unrelated names.
  let bestDistance = name.length <= 2 ? 0 : name.length <= 6 ? 1 : 2;
  const matches = new Set();
  for (const candidate of candidates) {
    if (!candidate || candidate === value) continue;
    const distance = editDistance(name, Array.from(candidate.toLowerCase()), bestDistance);
    if (distance > bestDistance || (isUsable && !isUsable(candidate))) continue;
    if (distance < bestDistance) matches.clear();
    bestDistance = distance;
    matches.add(candidate);
  }
  return [...matches].sort().slice(0, 3);
}
