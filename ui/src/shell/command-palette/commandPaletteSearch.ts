// STATUS: DIAMANT VGT SUPREME — deterministic fuzzy search core for UX-077.
export function commandPaletteFuzzyScore(query: string, candidate: string): number {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return 1;
  const hay = candidate.toLocaleLowerCase();
  const direct = hay.indexOf(needle);
  if (direct >= 0) return 10_000 - direct * 2 - needle.length;
  let qi = 0;
  let score = 0;
  let last = -2;
  for (let i = 0; i < hay.length && qi < needle.length; i += 1) {
    if (hay[i] !== needle[qi]) continue;
    score += i === last + 1 ? 8 : 3;
    if (i === 0 || /\s|[-_/]/u.test(hay[i - 1] ?? '')) score += 5;
    last = i;
    qi += 1;
  }
  return qi === needle.length ? score - Math.max(0, hay.length - needle.length) * 0.02 : -1;
}
