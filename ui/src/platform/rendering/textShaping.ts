// STATUS: DIAMANT VGT SUPREME — shared bounded Unicode/bidi/CJK/OpenType shaping facade
import type { RenderTextStyle } from './renderTypes';
import { fontFeatureCss, fontVariationCss } from './fontResolver';

export interface ShapedGrapheme {
  text: string;
  start: number;
  end: number;
  advancePx: number;
  glyphIds?: readonly number[];
}

export interface ShapedTextRun {
  text: string;
  direction: 'ltr' | 'rtl';
  graphemes: ShapedGrapheme[];
  widthPx: number;
  start?: number;
  end?: number;
  script?: 'latin' | 'arabic' | 'hebrew' | 'cjk' | 'emoji' | 'other';
  shaping: 'adapter' | 'fallback';
}

export interface BidiTextRun { text: string; start: number; end: number; direction: 'ltr' | 'rtl'; }
export interface LineBreakOpportunity { index: number; required: boolean; reason: 'space' | 'hyphen' | 'cjk' | 'newline' | 'word-boundary'; }

const MAX_TEXT_CODE_UNITS = 1_000_000;
const MAX_SHAPING_RUNS = 65_536;
const RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const HEBREW_PATTERN = /[\u0590-\u05FF]/u;
const ARABIC_PATTERN = /[\u0600-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const CJK_PATTERN = /[\u2E80-\u2FFF\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/u;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

/**
 * A practical extended-grapheme-cluster split, used when `Intl.Segmenter` is not
 * available.
 *
 * Counting code points is **not** counting graphemes: `a` + combining diaeresis is
 * one grapheme (two code points), a family emoji joined by ZWJ is one grapheme
 * (seven), a regional-indicator flag is one (two). The measured example
 * `Hallo 👨‍👩‍👧‍👦 Welt` is 12 graphemes but 18 code points — a counter labelled
 * "characters" that reports 18 is simply wrong, and a line breaker that splits by
 * code point cuts an emoji family in half.
 *
 * This covers the cases that matter in practice: combining marks, ZWJ sequences,
 * variation selectors, skin-tone modifiers, regional-indicator pairs and CR LF.
 * It is deliberately small and bounded; `Intl.Segmenter` remains the preferred path.
 */
function fallbackGraphemeClusters(text: string): string[] {
  const clusters: string[] = [];
  let current = '';
  let previousRegionalIndicators = 0;

  const isRegionalIndicator = (codePoint: number) => codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF;
  const isSkinTone = (codePoint: number) => codePoint >= 0x1F3FB && codePoint <= 0x1F3FF;
  const isVariationSelector = (codePoint: number) =>
    (codePoint >= 0xFE00 && codePoint <= 0xFE0F) || (codePoint >= 0xE0100 && codePoint <= 0xE01EF);

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (current.length === 0) {
      current = character;
      previousRegionalIndicators = isRegionalIndicator(codePoint) ? 1 : 0;
      continue;
    }

    const joinsPrevious = current.endsWith('\u200D')
      // The zero-width joiner itself belongs to the cluster it glues together, and so
      // does the character after it. Missing this split the family emoji into four.
      || character === '\u200D'
      || /^\p{M}$/u.test(character)
      || isVariationSelector(codePoint)
      || isSkinTone(codePoint)
      || (isRegionalIndicator(codePoint) && previousRegionalIndicators === 1)
      || (current === '\r' && character === '\n');

    if (joinsPrevious) {
      current += character;
      previousRegionalIndicators = isRegionalIndicator(codePoint) && previousRegionalIndicators === 0
        ? 1
        : previousRegionalIndicators + (isRegionalIndicator(codePoint) ? 1 : 0);
      if (previousRegionalIndicators > 2) previousRegionalIndicators = 2;
      continue;
    }

    clusters.push(current);
    current = character;
    previousRegionalIndicators = isRegionalIndicator(codePoint) ? 1 : 0;
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

/**
 * Splits text into grapheme clusters. This is the **single** definition in the
 * codebase: layout, statistics and shaping all ask here, so a counter and a line
 * break can never disagree about what one character is.
 *
 * `Intl.Segmenter` is the spec implementation and is preferred. A malformed locale
 * tag makes it throw `RangeError`; that must not escape, because the statistics run
 * inside a render path — the fallback is used instead.
 */
export function segmentGraphemes(text: string, locale?: string): Array<{ segment: string; index: number }> {
  if (text.length > MAX_TEXT_CODE_UNITS) throw new Error('render_text_limit');
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' | 'word' }) => {
      segment: (value: string) => Iterable<{ segment: string; index: number; isWordLike?: boolean }>;
    };
  }).Segmenter;
  if (Segmenter) {
    try {
      return [...new Segmenter(locale, { granularity: 'grapheme' }).segment(text)]
        .map(({ segment, index }) => ({ segment, index }));
    } catch {
      // Fall through to the local split rather than letting a locale tag break layout.
    }
  }
  const output: Array<{ segment: string; index: number }> = [];
  let index = 0;
  for (const segment of fallbackGraphemeClusters(text)) {
    output.push({ segment, index });
    index += segment.length;
  }
  return output;
}

export function resolveTextDirection(text: string, requested: RenderTextStyle['direction'] = 'auto'): 'ltr' | 'rtl' {
  if (requested === 'ltr' || requested === 'rtl') return requested;
  return RTL_PATTERN.test(text) ? 'rtl' : 'ltr';
}

function charDirection(value: string): 'ltr' | 'rtl' | 'neutral' {
  if (RTL_PATTERN.test(value)) return 'rtl';
  if (/\p{Letter}|\p{Number}/u.test(value)) return 'ltr';
  return 'neutral';
}

export function segmentBidiRuns(text: string, requested: RenderTextStyle['direction'] = 'auto'): BidiTextRun[] {
  if (text.length > MAX_TEXT_CODE_UNITS) throw new Error('render_text_limit');
  if (!text) return [];
  const base = resolveTextDirection(text, requested);
  const graphemes = segmentGraphemes(text);
  const result: BidiTextRun[] = [];
  let currentDirection: 'ltr' | 'rtl' = base;
  let start = graphemes[0]?.index ?? 0;
  let end = start;
  let buffer = '';
  const flush = () => { if (buffer) result.push({ text: buffer, start, end, direction: currentDirection }); buffer = ''; };
  for (const g of graphemes) {
    const direction = charDirection(g.segment);
    const effective = direction === 'neutral' ? currentDirection : direction;
    if (buffer && effective !== currentDirection) { flush(); start = g.index; }
    currentDirection = effective;
    buffer += g.segment;
    end = g.index + g.segment.length;
    if (result.length > MAX_SHAPING_RUNS) throw new Error('render_bidi_run_limit');
  }
  flush();
  return base === 'rtl' ? result.reverse() : result;
}

function detectScript(text: string): ShapedTextRun['script'] {
  if (EMOJI_PATTERN.test(text)) return 'emoji';
  if (CJK_PATTERN.test(text)) return 'cjk';
  if (ARABIC_PATTERN.test(text)) return 'arabic';
  if (HEBREW_PATTERN.test(text)) return 'hebrew';
  if (/\p{Script=Latin}/u.test(text)) return 'latin';
  return 'other';
}

export function computeLineBreakOpportunities(text: string, locale?: string): LineBreakOpportunity[] {
  if (text.length > MAX_TEXT_CODE_UNITS) throw new Error('render_text_limit');
  const output: LineBreakOpportunity[] = [];
  const seen = new Set<number>();
  const add = (item: LineBreakOpportunity) => { if (!seen.has(item.index)) { seen.add(item.index); output.push(item); } };
  const graphemes = segmentGraphemes(text, locale);
  for (const g of graphemes) {
    const end = g.index + g.segment.length;
    if (g.segment === '\n') add({ index: end, required: true, reason: 'newline' });
    else if (/\s/u.test(g.segment)) add({ index: end, required: false, reason: 'space' });
    else if (/[-\u2010\u2011]/u.test(g.segment)) add({ index: end, required: false, reason: 'hyphen' });
    else if (CJK_PATTERN.test(g.segment)) add({ index: end, required: false, reason: 'cjk' });
  }
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity: 'word' }) => { segment: (value: string) => Iterable<{ segment: string; index: number; isWordLike?: boolean }> };
  }).Segmenter;
  if (Segmenter) {
    for (const part of new Segmenter(locale, { granularity: 'word' }).segment(text)) {
      if (part.isWordLike) add({ index: part.index + part.segment.length, required: false, reason: 'word-boundary' });
    }
  }
  return output.sort((a, b) => a.index - b.index);
}

export interface TextMeasureAdapter { measure(text: string, cssFont: string, letterSpacingPx: number, variationCss?: string, featureCss?: string): number; }
export interface OpenTypeShapeResult { glyphIds: readonly number[]; advancePx: number; }
export interface OpenTypeShaperAdapter {
  shape(text: string, options: { cssFont: string; direction: 'ltr' | 'rtl'; locale?: string; variations: Readonly<Record<string, number>>; features: Readonly<Record<string, boolean | number>> }): OpenTypeShapeResult;
}

function buildFont(style: RenderTextStyle): string {
  const weight = Math.max(100, Math.min(900, Math.trunc(style.fontWeight ?? 400)));
  return `${style.italic ? 'italic ' : ''}${weight} ${Math.max(1, Math.min(2048, style.fontSizePx))}px ${style.fontFamily}`;
}

export function shapeText(
  text: string,
  style: RenderTextStyle,
  adapter: TextMeasureAdapter,
  locale?: string,
  openTypeShaper?: OpenTypeShaperAdapter,
): ShapedTextRun {
  const segments = segmentGraphemes(text, locale ?? style.locale);
  const font = buildFont(style);
  const letterSpacing = Math.max(-8, Math.min(64, style.letterSpacingPx ?? 0));
  const variations = style.fontVariations ?? {};
  const features = style.fontFeatures ?? {};
  // These functions also validate axis/feature bounds before any adapter sees them.
  const variationCss = fontVariationCss(variations);
  const featureCss = fontFeatureCss(features);
  const direction = resolveTextDirection(text, style.direction);
  const graphemes = segments.map(({ segment, index }) => {
    const shaped = openTypeShaper?.shape(segment, { cssFont: font, direction, locale: locale ?? style.locale, variations, features });
    const advancePx = shaped?.advancePx ?? adapter.measure(segment, font, letterSpacing, variationCss, featureCss);
    if (!Number.isFinite(advancePx) || advancePx < 0 || advancePx > 1_000_000) throw new Error('render_text_advance_invalid');
    return { text: segment, start: index, end: index + segment.length, advancePx, glyphIds: shaped?.glyphIds };
  });
  return { text, direction, graphemes, widthPx: graphemes.reduce((sum, item) => sum + item.advancePx, 0), start: 0, end: text.length, script: detectScript(text), shaping: openTypeShaper ? 'adapter' : 'fallback' };
}

export function shapeTextBidiRuns(text: string, style: RenderTextStyle, adapter: TextMeasureAdapter, openTypeShaper?: OpenTypeShaperAdapter): ShapedTextRun[] {
  const runs = segmentBidiRuns(text, style.direction);
  return runs.map((run) => ({ ...shapeText(run.text, { ...style, direction: run.direction }, adapter, style.locale, openTypeShaper), start: run.start, end: run.end, direction: run.direction }));
}

export function browserCanvasTextMeasureAdapter(): TextMeasureAdapter {
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  const ensureContext = () => {
    if (context) return context;
    if (typeof OffscreenCanvas !== 'undefined') context = new OffscreenCanvas(1, 1).getContext('2d');
    if (!context && typeof document !== 'undefined') context = document.createElement('canvas').getContext('2d');
    return context;
  };
  return {
    measure(text, cssFont, letterSpacingPx, variationCss, featureCss) {
      const ctx = ensureContext();
      if (!ctx) return Array.from(text).length * 8 + Math.max(0, Array.from(text).length - 1) * letterSpacingPx;
      ctx.font = cssFont;
      if ('fontKerning' in ctx) ctx.fontKerning = 'normal';
      // Canvas currently exposes font variation/feature settings through CSS font strings inconsistently.
      // The validated values are retained for native/OpenType adapters; browser fallback never fetches fonts.
      void variationCss; void featureCss;
      const clusters = segmentGraphemes(text).length;
      return ctx.measureText(text).width + Math.max(0, clusters - 1) * letterSpacingPx;
    },
  };
}
