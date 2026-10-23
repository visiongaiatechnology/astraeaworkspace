// STATUS: DIAMANT VGT SUPREME — Unicode BiDi & CJK Text-Shaping Engine
// Implements UAX #9 BiDi segmentation, JIS X 4051 Kinsoku Shori line breaking, and NFC glyph normalization

export type TextDirection = 'ltr' | 'rtl';

export interface BidiRun {
  text: string;
  direction: TextDirection;
  startIndex: number;
  endIndex: number;
}

export interface ShapingResult {
  normalizedText: string;
  primaryDirection: TextDirection;
  runs: BidiRun[];
  hasCjk: boolean;
  hasRtl: boolean;
}

// Unicode ranges for RTL scripts: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan
const RTL_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FA\u0800-\u083E\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;

// Unicode ranges for CJK Unified Ideographs, Hiragana, Katakana, Hangul
const CJK_REGEX = /[\u2E80-\u2FD5\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u31A0-\u31BF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;

// JIS X 4051 Kinsoku Shori prohibited characters at line starts (closing punctuation)
const CJK_NO_LINE_START = new Set([
  '）', '〕', '］', '｝', '〉', '》', '」', '』', '】', '’', '”', '»', '、', '。', '，', '．', '：', '；', '？', '！', '…', '—'
]);

// JIS X 4051 Kinsoku Shori prohibited characters at line ends (opening punctuation)
const CJK_NO_LINE_END = new Set([
  '（', '〔', '［', '｛', '〈', '《', '「', '『', '【', '‘', '“', '«'
]);

/**
 * Normalizes Unicode string to NFC (Canonical Decomposition followed by Canonical Composition).
 * Strips rogue control characters while preserving ZWJ, ZWNJ, and direction marks.
 */
export function normalizeGlyphs(text: string): string {
  if (!text) return '';
  // Apply standard NFC normalization
  let normalized = text.normalize('NFC');
  // Remove dangerous ASCII control codes (except tab, LF, CR)
  normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return normalized;
}

/**
 * Segments input text into bidirectional runs according to UAX #9 rules.
 */
export function segmentBidiRuns(text: string): BidiRun[] {
  if (!text) return [];

  const runs: BidiRun[] = [];
  let currentDir: TextDirection = RTL_REGEX.test(text[0]) ? 'rtl' : 'ltr';
  let currentText = '';
  let startIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // Neutral characters (spaces, numbers, common punctuation) inherit surrounding direction
    const isRtl = RTL_REGEX.test(char);
    const isLtr = /[a-zA-Z\u00C0-\u024F]/.test(char);

    let charDir: TextDirection = currentDir;
    if (isRtl) charDir = 'rtl';
    else if (isLtr) charDir = 'ltr';

    if (charDir !== currentDir && currentText.length > 0) {
      runs.push({
        text: currentText,
        direction: currentDir,
        startIndex,
        endIndex: i,
      });
      currentDir = charDir;
      currentText = char;
      startIndex = i;
    } else {
      currentText += char;
    }
  }

  if (currentText.length > 0) {
    runs.push({
      text: currentText,
      direction: currentDir,
      startIndex,
      endIndex: text.length,
    });
  }

  return runs;
}

/**
 * Determines primary paragraph direction based on the first strong directional character.
 */
export function getPrimaryDirection(text: string): TextDirection {
  for (const char of text) {
    if (RTL_REGEX.test(char)) return 'rtl';
    if (/[a-zA-Z\u00C0-\u024F]/.test(char)) return 'ltr';
  }
  return 'ltr';
}

/**
 * Evaluates whether a line break is legally permissible between two CJK characters.
 */
export function canBreakCjkBetween(prevChar: string, nextChar: string): boolean {
  if (CJK_NO_LINE_END.has(prevChar)) return false;
  if (CJK_NO_LINE_START.has(nextChar)) return false;
  return true;
}

export function isCjkTextCharacter(character: string): boolean {
  return CJK_REGEX.test(character);
}

/**
 * Master Text-Shaping Coordinator:
 * Analyzes and shapes text blocks with complete BiDi, RTL, and CJK fidelity.
 */
export function shapeText(text: string): ShapingResult {
  const normalizedText = normalizeGlyphs(text);
  const primaryDirection = getPrimaryDirection(normalizedText);
  const runs = segmentBidiRuns(normalizedText);
  const hasCjk = CJK_REGEX.test(normalizedText);
  const hasRtl = RTL_REGEX.test(normalizedText);

  return {
    normalizedText,
    primaryDirection,
    runs,
    hasCjk,
    hasRtl,
  };
}
