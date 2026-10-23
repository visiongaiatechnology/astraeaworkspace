// STATUS: PLATIN — Structural equality for Writer style values
//
// Two callers ask the same question about a style value — "is this the same as
// that?" — and both must answer identically: the patch path decides whether a
// command changes anything (and therefore whether a history step exists), and
// the range reader decides whether a marked range agrees with itself. A second
// comparison would let the surface report a disagreement the patch then ignores.
export function sameWriterStyleValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => sameWriterStyleValue(entry, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left as Record<string, unknown>);
    const rightKeys = Object.keys(right as Record<string, unknown>);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => sameWriterStyleValue(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ));
  }
  return false;
}
