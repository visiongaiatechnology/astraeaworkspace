// STATUS: DIAMANT VGT SUPREME
import type { Paragraph } from '../../../shared/contracts/workspace';
import { segmentGraphemes } from '../../../platform/rendering/index';
import { LinearPattern } from '../../../shared/patterns/linearPattern';
import type {
  WriterCitation,
  WriterCitationSource,
  CitationStyle,
  TableBlockData,
  MailMergeRecord,
} from '../types';

export interface TextStatistics {
  words: number;
  charsWithSpaces: number;
  charsWithoutSpaces: number;
  paragraphsCount: number;
  pages: number;
  sentences: number;
  tables: number;
  readingTimeMinutes: number;
  speakingTimeMinutes: number;
  characters: number;
  paragraphs: number;
  readingTimeMin: number;
}

export interface TextStatisticsOptions {
  pageCount?: number;
  tableCount?: number;
  additionalTexts?: readonly string[];
  locale?: string;
}

/**
 * Counts segments of one granularity.
 *
 * Graphemes come from `segmentGraphemes`, the single definition in the codebase —
 * the statistics used to carry their own `Intl.Segmenter` call with a code-point
 * fallback, so the counter could disagree with the layout about what one character
 * is. Words and sentences keep using the segmenter, with the regex paths as the
 * bounded fallback for a runtime without it or with an unusable locale.
 */
/** The most code units one statistics pass will segment at once (W-142, mirrors `platform/rendering`). */
export const WRITER_STATISTICS_MAX_SEGMENTED_CODE_UNITS = 1_000_000;

function countSegments(text: string, locale: string, granularity: 'grapheme' | 'word' | 'sentence'): number {
  if (!text) return 0;
  if (granularity === 'grapheme') {
    // W-142: `segmentGraphemes` throws above one million code units (`render_text_limit`) and the
    // statistics did not catch it, so a single enormous paragraph aborted the whole calculation — the
    // status bar showed nothing instead of a number. The text is counted in bounded windows instead:
    // the result is a full count, not a truncated one, and no input can make it throw.
    let count = 0;
    for (let start = 0; start < text.length;) {
      let end = Math.min(text.length, start + WRITER_STATISTICS_MAX_SEGMENTED_CODE_UNITS);
      // Never split a surrogate pair at the window edge: a lone half would be counted as one grapheme
      // and the following window would count its partner as another.
      const lastUnit = text.charCodeAt(end - 1);
      if (end < text.length && lastUnit >= 0xD800 && lastUnit <= 0xDBFF) end -= 1;
      count += segmentGraphemes(text.slice(start, end), locale).length;
      start = end;
    }
    return count;
  }

  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity: 'word' | 'sentence' }) => {
      segment: (value: string) => Iterable<{ segment: string; isWordLike?: boolean }>;
    };
  }).Segmenter;
  if (Segmenter) {
    try {
      const segments = new Segmenter(locale, { granularity }).segment(text);
      if (granularity === 'word') {
        let count = 0;
        for (const segment of segments) if (segment.isWordLike) count += 1;
        return count;
      }
      let count = 0;
      for (const segment of segments) {
        if (segment.segment.trim()) count += 1;
      }
      return count;
    } catch {
      // A malformed locale tag must not break counting; fall through to the patterns.
    }
  }
  if (granularity === 'word') {
    return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }
  return text.match(/[^.!?]+(?:[.!?]+|$)/gu)?.length ?? 0;
}

/**
 * Calculates comprehensive text statistics for the document.
 */
export function calculateTextStatistics(
  paragraphs: readonly Paragraph[],
  options: TextStatisticsOptions = {},
): TextStatistics {
  let words = 0;
  let charsWithSpaces = 0;
  let charsWithoutSpaces = 0;
  let sentences = 0;
  const paragraphsCount = paragraphs.length;
  const locale = options.locale ?? 'de-DE';
  const texts = [
    ...paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join('')),
    ...(options.additionalTexts ?? []),
  ];

  for (const text of texts) {
    words += countSegments(text, locale, 'word');
    charsWithSpaces += countSegments(text, locale, 'grapheme');
    charsWithoutSpaces += countSegments(text.replace(/\p{White_Space}/gu, ''), locale, 'grapheme');
    sentences += countSegments(text, locale, 'sentence');
  }

  const readingTimeMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
  const speakingTimeMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 130));
  const pages = Math.max(1, Math.trunc(options.pageCount ?? 1));

  return {
    words,
    charsWithSpaces,
    charsWithoutSpaces,
    paragraphsCount,
    pages,
    sentences,
    tables: Math.max(0, Math.trunc(options.tableCount ?? 0)),
    readingTimeMinutes,
    speakingTimeMinutes,
    characters: charsWithSpaces,
    paragraphs: paragraphsCount,
    readingTimeMin: readingTimeMinutes,
  };
}

export interface SearchMatch {
  paragraphIndex: number;
  paragraphId: string;
  spanIndex: number;
  start: number;
  end: number;
  text: string;
}

const WRITER_UTIL_SEARCH_MAX_QUERY = 256;
const WRITER_UTIL_SEARCH_MAX_SPAN = 131_072;

function escapeWriterLinearLiteral(value: string): string {
  let out = '';
  for (const char of value) out += '.+*?^$()[]{}|\\'.includes(char) ? `\\${char}` : char;
  return out;
}

function compileWriterUtilityPattern(
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; isRegex: boolean },
): LinearPattern | null {
  if (!query || query.length > WRITER_UTIL_SEARCH_MAX_QUERY) return null;
  try {
    return new LinearPattern(options.isRegex ? query : escapeWriterLinearLiteral(query), {
      caseInsensitive: !options.matchCase,
      wholeWord: options.wholeWord,
      limits: { maxPatternLength: WRITER_UTIL_SEARCH_MAX_QUERY * 2, maxInputLength: WRITER_UTIL_SEARCH_MAX_SPAN, maxStates: 4096, maxMatches: 2_000, maxRepeat: 128 },
    });
  } catch {
    return null;
  }
}

/**
 * Finds all occurrences of a search term across paragraphs with case/word/regex support.
 * Untrusted regex mode is executed by the bounded linear matcher, never JavaScript RegExp.
 */
export function findTextMatches(
  paragraphs: Paragraph[],
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; isRegex: boolean }
): SearchMatch[] {
  const pattern = compileWriterUtilityPattern(query, options);
  if (!pattern) return [];
  const matches: SearchMatch[] = [];
  paragraphs.forEach((p, pIdx) => {
    p.spans.forEach((span, sIdx) => {
      if (span.text.length > WRITER_UTIL_SEARCH_MAX_SPAN) return;
      for (const match of pattern.findAll(span.text)) {
        matches.push({ paragraphIndex: pIdx, paragraphId: p.id, spanIndex: sIdx, start: match.start, end: match.end, text: match.text });
      }
    });
  });
  return matches;
}

/** Replaces all occurrences using literal replacement text and the bounded linear matcher. */
export function replaceAllText(
  paragraphs: Paragraph[],
  query: string,
  replacement: string,
  options: { matchCase: boolean; wholeWord: boolean; isRegex: boolean }
): { paragraphs: Paragraph[]; count: number } {
  const pattern = compileWriterUtilityPattern(query, options);
  if (!pattern || replacement.length > WRITER_UTIL_SEARCH_MAX_SPAN) return { paragraphs, count: 0 };
  let totalCount = 0;
  const newParagraphs = paragraphs.map((p) => {
    let changed = false;
    const newSpans = p.spans.map((span) => {
      if (span.text.length > WRITER_UTIL_SEARCH_MAX_SPAN) return span;
      const result = pattern.replace(span.text, replacement, true);
      if (!result.count) return span;
      totalCount += result.count;
      changed = true;
      return { ...span, text: result.text };
    });
    return changed ? { ...p, spans: newSpans } : p;
  });
  return { paragraphs: newParagraphs, count: totalCount };
}

/**
 * The dynamic fields a header, footer or text field may carry. The names live
 * here once so that evaluation and detection cannot drift apart.
 */
export const WRITER_FIELD_NAMES = [
  'PAGE',
  'NUMPAGES',
  'DATE',
  'TIME',
  'TITLE',
  'AUTHOR',
  'WORDCOUNT',
] as const;

export type WriterFieldName = (typeof WRITER_FIELD_NAMES)[number];

export interface WriterFieldContext {
  pageNumber: number;
  totalPages: number;
  title: string;
  author?: string;
  words: number;
}

function fieldPattern(): RegExp {
  // A fresh pattern per call: a shared global regex would carry `lastIndex`
  // between calls and silently skip fields.
  return new RegExp(`\\{(${WRITER_FIELD_NAMES.join('|')})\\}`, 'gi');
}

/**
 * W-128: the escape for a field that must be shown literally.
 *
 * A backslash in front of the field keeps the braces in the text: `\{PAGE}` renders as `{PAGE}` and is
 * **not** evaluated. Before this there was no way to write a literal `{PAGE}` at all — the field was
 * always substituted, so a document that had to *show* the syntax could not say it.
 *
 * Two patterns, one per direction, because a single "escaped or not" pattern cannot work at one
 * position: whatever it matches, the other spelling stays unmatched. The escape is stripped first, then
 * the ordinary fields are substituted in the text that remains — so an escaped field is never a
 * candidate, and no pattern has to look backwards.
 *
 * The regex source is `\\\{([A-Za-z]+)\}`: one literal backslash, then `{NAME}`. The triple backslash
 * is what it takes to say "one literal backslash" in a regex — the first version of this line had one
 * backslash too few, so it matched the **unescaped** field and every field test went red.
 */
const WRITER_ESCAPED_FIELD_SOURCE = '\\\\\\{([A-Za-z]+)\\}';

function escapedFieldPattern(): RegExp {
  // Case-insensitive on purpose: `{page}` is the same field as `{PAGE}`.
  return new RegExp(WRITER_ESCAPED_FIELD_SOURCE, 'gi');
}

function knownFieldName(rawName: string): WriterFieldName | null {
  const name = rawName.toUpperCase();
  return (WRITER_FIELD_NAMES as readonly string[]).includes(name) ? (name as WriterFieldName) : null;
}

/** True when a text carries at least one recognised field that is not escaped. */
export function hasWriterFields(text: string): boolean {
  if (text.length === 0) return false;
  return writerFieldNames(text).length > 0;
}

/** The field names a text uses, in order of first appearance. Escaped fields are literal text. */
export function writerFieldNames(text: string): WriterFieldName[] {
  // Remove the escaped fields first: what is left cannot contain an escape, so the ordinary pattern is
  // enough and cannot mistake an escaped field for a real one.
  let withoutEscapes = text;
  for (const match of text.matchAll(escapedFieldPattern())) {
    if (knownFieldName(match[1] ?? '') !== null) withoutEscapes = withoutEscapes.replace(match[0], '');
  }
  const found: WriterFieldName[] = [];
  for (const match of withoutEscapes.matchAll(fieldPattern())) {
    const name = knownFieldName(match[1] ?? '');
    if (name !== null && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Evaluates dynamic fields in a text string.
 *
 * The clock is injected so the result is reproducible: a header containing
 * `{DATE}` must be verifiable, and a test cannot pin the current time. Unknown
 * fields are left untouched so a typo stays visible instead of disappearing, and
 * `\{FIELD}` (W-128) stays literal instead of being substituted.
 */
export function evaluateFields(
  text: string,
  context: WriterFieldContext,
  now: Date = new Date(),
): string {
  const values: Record<WriterFieldName, string> = {
    PAGE: String(context.pageNumber),
    NUMPAGES: String(context.totalPages),
    DATE: now.toLocaleDateString(),
    TIME: now.toLocaleTimeString(),
    TITLE: context.title || 'Untitled Document',
    AUTHOR: context.author || 'Astraea Author',
    WORDCOUNT: String(context.words),
  };
  // The escaped fields are parked first under a name that cannot be a field, because "remove the
  // backslash, then substitute" would evaluate the field one step later (measured: `\{PAGE}` became
  // `3`). The placeholder survives the substitution and is restored at the end.
  const parked: string[] = [];
  let parkedText = text;
  for (const match of text.matchAll(escapedFieldPattern())) {
    const name = knownFieldName(match[1] ?? '');
    if (name === null) continue;
    parkedText = parkedText.replace(match[0], `\u0000${parked.length}\u0000`);
    parked.push(match[0].slice(1));
  }
  const substituted = parkedText.replace(fieldPattern(), (match, rawName: string) => {
    const name = knownFieldName(rawName);
    // An unknown field stays word for word, so a typo is visible instead of disappearing.
    return name === null ? match : values[name];
  });
  return substituted.replace(/\u0000(\d+)\u0000/g, (_, index: string) => parked[Number(index)] ?? '');
}

/**
 * Performs mail merge interpolation on text using record values.
 */
export function mergeTextRecord(text: string, record: MailMergeRecord): string {
  if (!record) return text;
  return text.replace(/«([A-Za-z0-9_]+)»|\{\{([A-Za-z0-9_]+)\}\}/g, (_, k1, k2) => {
    const key = k1 || k2;
    return record[key] !== undefined ? record[key] : `«${key}»`;
  });
}

/**
 * Formats a citation reference according to the selected citation style.
 */
export function formatCitationText(
  citation: WriterCitation,
  source: WriterCitationSource,
  style: CitationStyle,
  citationIndex: number = 1
): string {
  const prefix = citation.prefix ? `${citation.prefix} ` : '';
  const suffix = citation.suffix ? ` ${citation.suffix}` : '';
  const locator = citation.locator ? `, ${citation.locator}` : '';

  switch (style) {
    case 'IEEE':
      return `[${citationIndex}${locator}]`;
    case 'MLA':
      return `(${prefix}${source.author.split(' ').pop() || 'Unknown'}${locator}${suffix})`;
    case 'Chicago':
      return `(${prefix}${source.author.split(' ').pop() || 'Unknown'} ${source.year || 'n.d.'}${locator}${suffix})`;
    case 'ISO690':
      return `(${prefix}${source.author.toUpperCase()} ${source.year || 's.d.'}${locator}${suffix})`;
    case 'APA':
    default:
      return `(${prefix}${source.author.split(' ').pop() || 'Unknown'}, ${source.year || 'n.d.'}${locator}${suffix})`;
  }
}

/**
 * Formats a bibliography entry for a source according to the selected style.
 */
export function formatBibliographyEntry(source: WriterCitationSource, style: CitationStyle, index: number = 1): string {
  const author = source.author || 'Anonymous';
  const title = source.title || 'Untitled';
  const year = source.year || 'n.d.';
  const publisher = source.publisher ? `, ${source.publisher}` : '';
  const journal = source.journal ? ` In: *${source.journal}*` : '';
  const doi = source.doi ? ` DOI: ${source.doi}` : '';

  switch (style) {
    case 'IEEE':
      return `[${index}] ${author}, "${title}," ${source.journal || source.publisher || 'Pub'}, ${year}.${doi}`;
    case 'MLA':
      return `${author}. *${title}*. ${source.publisher || source.journal || 'n.p.'}, ${year}.${doi}`;
    case 'Chicago':
      return `${author}. ${year}. *${title}*${journal}${publisher}.${doi}`;
    case 'ISO690':
      return `${author.toUpperCase()}. *${title}* [online]. ${year}${publisher}.${doi}`;
    case 'APA':
    default:
      return `${author} (${year}). *${title}*${journal}${publisher}.${doi}`;
  }
}

/**
 * Evaluates basic spreadsheet formulas inside table cells (=SUM(ABOVE), =AVERAGE(ABOVE), =COUNT(ABOVE)).
 */
export function evaluateTableCellFormula(formula: string, colIdx: number, rowIdx: number, table: TableBlockData): string {
  const clean = formula.trim().toUpperCase().replace(/^=/, '');
  const aboveNumbers: number[] = [];

  for (let r = 0; r < rowIdx; r++) {
    const raw = table.rows[r]?.cells[colIdx]?.content ?? '';
    const num = parseFloat(raw.replace(/[^0-9.-]+/g, ''));
    if (!isNaN(num)) aboveNumbers.push(num);
  }

  if (clean === 'SUM(ABOVE)') {
    const sum = aboveNumbers.reduce((a, b) => a + b, 0);
    return sum.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (clean === 'AVERAGE(ABOVE)') {
    if (aboveNumbers.length === 0) return '0';
    const avg = aboveNumbers.reduce((a, b) => a + b, 0) / aboveNumbers.length;
    return avg.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (clean === 'COUNT(ABOVE)') {
    return String(aboveNumbers.length);
  }
  if (clean === 'MAX(ABOVE)') {
    return aboveNumbers.length ? String(Math.max(...aboveNumbers)) : '0';
  }
  if (clean === 'MIN(ABOVE)') {
    return aboveNumbers.length ? String(Math.min(...aboveNumbers)) : '0';
  }

  return formula;
}
