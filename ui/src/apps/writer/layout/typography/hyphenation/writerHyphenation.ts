// STATUS: DIAMANT VGT SUPREME — Liang TeX Hyphenation Engine
// Deterministic in-memory word hyphenation and soft-hyphen insertion

export interface HyphenationOptions {
  language: 'de' | 'en';
  minLeft: number;
  minRight: number;
  hyphenChar: string; // default is soft hyphen '\u00AD'
}

export const DEFAULT_HYPHEN_OPTIONS: HyphenationOptions = {
  language: 'en',
  minLeft: 2,
  minRight: 2,
  hyphenChar: '\u00AD',
};

// Compact Liang TeX pattern subsets for German & English high-frequency syllabic breaks
const PATTERNS_EN: Record<string, number[]> = {
  'tion': [0, 4, 0, 0, 0],
  'ing': [0, 3, 0, 0],
  'ment': [0, 4, 0, 0, 0],
  'able': [0, 4, 0, 0, 0],
  'ence': [0, 4, 0, 0, 0],
  'ance': [0, 4, 0, 0, 0],
  'tive': [0, 4, 0, 0, 0],
  'ness': [0, 4, 0, 0, 0],
  'full': [0, 4, 0, 0, 0],
  'less': [0, 4, 0, 0, 0],
  'inter': [0, 2, 0, 3, 0, 0],
  'trans': [0, 2, 0, 0, 3, 0],
  'anti': [0, 2, 0, 3, 0],
  'over': [0, 2, 0, 3, 0],
  'under': [0, 2, 0, 3, 0, 0],
  'com': [0, 3, 0, 0],
  'con': [0, 3, 0, 0],
  'per': [0, 3, 0, 0],
  'pro': [0, 3, 0, 0],
  're': [0, 2, 0],
  'de': [0, 2, 0],
};

const PATTERNS_DE: Record<string, number[]> = {
  'ung': [0, 3, 0, 0],
  'keit': [0, 4, 0, 0, 0],
  'heit': [0, 4, 0, 0, 0],
  'schaft': [0, 6, 0, 0, 0, 0, 0],
  'lich': [0, 4, 0, 0, 0],
  'isch': [0, 4, 0, 0, 0],
  'bar': [0, 3, 0, 0],
  'sam': [0, 3, 0, 0],
  'tion': [0, 4, 0, 0, 0],
  'ent': [0, 3, 0, 0],
  'ver': [0, 3, 0, 0],
  'be': [0, 2, 0],
  'ge': [0, 2, 0],
  'zer': [0, 3, 0, 0],
  'über': [0, 2, 0, 3, 0],
  'unter': [0, 2, 0, 3, 0, 0],
  'system': [0, 2, 0, 3, 0, 0, 0],
  'architektur': [0, 2, 0, 3, 0, 0, 2, 0, 3, 0, 0, 0],
};

/**
 * Computes hyphenation breakpoints for a single word.
 * Returns array of indices where a hyphen can be placed.
 */
export function getHyphenationPoints(word: string, options: HyphenationOptions = DEFAULT_HYPHEN_OPTIONS): number[] {
  const len = word.length;
  if (len < options.minLeft + options.minRight) return [];

  const lower = word.toLowerCase();
  const patterns = options.language === 'de' ? PATTERNS_DE : PATTERNS_EN;
  const levels = new Uint8Array(len + 1);

  for (const [pat, scores] of Object.entries(patterns)) {
    let idx = lower.indexOf(pat);
    while (idx !== -1) {
      for (let j = 0; j < scores.length; j++) {
        const pos = idx + j;
        if (pos <= len && scores[j] > levels[pos]) {
          levels[pos] = scores[j];
        }
      }
      idx = lower.indexOf(pat, idx + 1);
    }
  }

  const points: number[] = [];
  // Syllable break if level is odd
  for (let i = options.minLeft; i <= len - options.minRight; i++) {
    if (levels[i] % 2 === 1) {
      points.push(i);
    }
  }

  return points;
}

/**
 * Injects soft hyphens (\u00AD) into a word based on Liang points.
 */
export function hyphenateWord(word: string, options: HyphenationOptions = DEFAULT_HYPHEN_OPTIONS): string {
  const points = getHyphenationPoints(word, options);
  if (points.length === 0) return word;

  let result = '';
  let lastIdx = 0;

  for (const pt of points) {
    result += word.slice(lastIdx, pt) + options.hyphenChar;
    lastIdx = pt;
  }
  result += word.slice(lastIdx);

  return result;
}

/**
 * Hyphenates all eligible words in a paragraph text string.
 */
export function hyphenateText(text: string, options: HyphenationOptions = DEFAULT_HYPHEN_OPTIONS): string {
  return text.replace(/[a-zA-Z\u00C0-\u024F]+/g, (match) => {
    return hyphenateWord(match, options);
  });
}
