// STATUS: DIAMANT VGT SUPREME — Bounded Writer Search / Replace Domain
import type { Paragraph, TextSpan, WriterParagraphStyleName } from '../../../../shared/contracts/workspace';
import { LinearPattern } from '../../../../shared/patterns/linearPattern';

export type WriterSearchMode = 'plain' | 'wildcard' | 'regex';

export interface WriterSearchFormatFilter {
  paragraphStyle?: WriterParagraphStyleName;
  characterStyleId?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
}

export interface WriterSearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  mode: WriterSearchMode;
  format?: WriterSearchFormatFilter;
}

export interface WriterSearchMatch {
  paragraphIndex: number;
  paragraphId: string;
  spanIndex: number;
  start: number;
  end: number;
  text: string;
}

export interface WriterSearchResult {
  matches: WriterSearchMatch[];
  error?: string;
}

export interface WriterReplaceResult {
  paragraphs: Paragraph[];
  count: number;
  error?: string;
}

const MAX_QUERY_LENGTH = 256;
const MAX_RESULTS = 2_000;
const MAX_SEARCHABLE_SPAN_CHARS = 131_072;
const MAX_WILDCARD_TOKENS = 32;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(value: string): string {
  let result = '';
  for (const char of value) {
    if (char === '*') result += '.*';
    else if (char === '?') result += '.';
    else result += escapeRegex(char);
  }
  return result;
}

function hasOversizedSpan(paragraphs: readonly Paragraph[]): boolean {
  return paragraphs.some((paragraph) => paragraph.spans.some((span) => span.text.length > MAX_SEARCHABLE_SPAN_CHARS));
}

function compilePattern(query: string, options: WriterSearchOptions): { pattern?: LinearPattern; error?: string } {
  if (query.length > MAX_QUERY_LENGTH) return { error: `Suchausdruck ist auf ${MAX_QUERY_LENGTH} Zeichen begrenzt.` };
  if (!query) return {};
  let source: string;
  if (options.mode === 'regex') {
    source = query;
  } else if (options.mode === 'wildcard') {
    const wildcardTokens = Array.from(query).filter((character) => character === '*' || character === '?').length;
    if (wildcardTokens > MAX_WILDCARD_TOKENS) return { error: `Wildcard-Suche ist auf ${MAX_WILDCARD_TOKENS} Platzhalter begrenzt.` };
    source = wildcardToRegex(query);
  } else {
    source = escapeRegex(query);
  }
  try {
    return {
      pattern: new LinearPattern(source, {
        caseInsensitive: !options.matchCase,
        wholeWord: options.wholeWord,
        limits: { maxPatternLength: MAX_QUERY_LENGTH * 3, maxInputLength: MAX_SEARCHABLE_SPAN_CHARS, maxStates: 4096, maxMatches: MAX_RESULTS, maxRepeat: 128 },
      }),
    };
  } catch {
    return { error: 'Ungültiger oder nicht linear ausführbarer Suchausdruck.' };
  }
}

function matchesFormat(paragraph: Paragraph, span: TextSpan, filter?: WriterSearchFormatFilter): boolean {
  if (!filter) return true;
  if (filter.paragraphStyle !== undefined && paragraph.style.style_name !== filter.paragraphStyle) return false;
  if (filter.characterStyleId !== undefined && span.character_style_id !== filter.characterStyleId) return false;
  if (filter.bold !== undefined && Boolean(span.bold) !== filter.bold) return false;
  if (filter.italic !== undefined && Boolean(span.italic) !== filter.italic) return false;
  if (filter.underline !== undefined && Boolean(span.underline) !== filter.underline) return false;
  if (filter.fontFamily !== undefined && span.font_family !== filter.fontFamily) return false;
  return true;
}

function hasFormatFilter(filter?: WriterSearchFormatFilter): boolean {
  return Boolean(filter && Object.values(filter).some((value) => value !== undefined && value !== ''));
}

export function findWriterSearchMatches(
  paragraphs: readonly Paragraph[],
  query: string,
  options: WriterSearchOptions,
): WriterSearchResult {
  if (hasOversizedSpan(paragraphs)) return { matches: [], error: `Ein Text-Span überschreitet das Suchlimit von ${MAX_SEARCHABLE_SPAN_CHARS} Zeichen.` };
  const compiled = compilePattern(query, options);
  if (compiled.error) return { matches: [], error: compiled.error };
  if (!compiled.pattern && !hasFormatFilter(options.format)) {
    return { matches: [], error: query ? undefined : 'Suchtext oder Format-/Style-Filter erforderlich.' };
  }
  const matches: WriterSearchMatch[] = [];
  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const paragraph = paragraphs[paragraphIndex];
    if (!paragraph) continue;
    for (let spanIndex = 0; spanIndex < paragraph.spans.length; spanIndex += 1) {
      const span = paragraph.spans[spanIndex];
      if (!span || !matchesFormat(paragraph, span, options.format)) continue;
      if (!compiled.pattern) {
        if (span.text.length > 0) matches.push({ paragraphIndex, paragraphId: paragraph.id, spanIndex, start: 0, end: span.text.length, text: span.text });
      } else {
        for (const match of compiled.pattern.findAll(span.text)) {
          matches.push({ paragraphIndex, paragraphId: paragraph.id, spanIndex, start: match.start, end: match.end, text: match.text });
          if (matches.length >= MAX_RESULTS) return { matches, error: `Ergebnisliste wurde bei ${MAX_RESULTS} Treffern begrenzt.` };
        }
      }
    }
  }
  return { matches };
}

export function replaceWriterSearchMatches(
  paragraphs: readonly Paragraph[],
  query: string,
  replacement: string,
  options: WriterSearchOptions,
): WriterReplaceResult {
  if (!query) return { paragraphs: [...paragraphs], count: 0, error: 'Replace benötigt einen Suchtext.' };
  if (hasOversizedSpan(paragraphs)) return { paragraphs: [...paragraphs], count: 0, error: `Ein Text-Span überschreitet das Suchlimit von ${MAX_SEARCHABLE_SPAN_CHARS} Zeichen.` };
  const compiled = compilePattern(query, options);
  if (compiled.error || !compiled.pattern) return { paragraphs: [...paragraphs], count: 0, error: compiled.error ?? 'Ungültige Suche.' };
  let count = 0;
  const next = paragraphs.map((paragraph) => {
    let paragraphChanged = false;
    const spans = paragraph.spans.map((span) => {
      if (!matchesFormat(paragraph, span, options.format)) return span;
      const replaced = compiled.pattern!.replace(span.text, replacement, true);
      if (replaced.count === 0) return span;
      const text = replaced.text;
      count += replaced.count;
      paragraphChanged = true;
      return { ...span, text };
    });
    return paragraphChanged ? { ...paragraph, spans } : paragraph;
  });
  return { paragraphs: next, count };
}

export interface WriterReplaceSelectionResult {
  readonly paragraphs: Paragraph[];
  /** Matches that were actually replaced. */
  readonly count: number;
  /** Matches that no longer fit the document and were left alone. */
  readonly skipped: number;
}

/**
 * Replaces **only the given matches** — the acceptance asks for "nur gewählte
 * Treffer ersetzen", and the document-wide replace could not express that.
 *
 * Every match is verified before it is applied: the target span must still carry
 * exactly `match.text` at `[start, end)`. A match that no longer fits (the user
 * edited the text after searching) is counted in `skipped` and left untouched —
 * replacing by a stale offset would corrupt unrelated text.
 *
 * Within one span the matches are applied **right to left**, so an earlier offset
 * stays valid while a later one is rewritten.
 */
export function replaceWriterSearchMatchesAtSelection(
  paragraphs: readonly Paragraph[],
  matches: readonly WriterSearchMatch[],
  replacement: string,
): WriterReplaceSelectionResult {
  if (matches.length === 0) return { paragraphs: [...paragraphs], count: 0, skipped: 0 };

  // paragraphIndex → spanIndex → matches, each list ordered by offset.
  const byParagraph = new Map<number, Map<number, WriterSearchMatch[]>>();
  for (const match of matches) {
    const spans = byParagraph.get(match.paragraphIndex) ?? new Map<number, WriterSearchMatch[]>();
    const list = spans.get(match.spanIndex) ?? [];
    list.push(match);
    spans.set(match.spanIndex, list);
    byParagraph.set(match.paragraphIndex, spans);
  }

  let count = 0;
  let skipped = 0;

  const next = paragraphs.map((paragraph, paragraphIndex) => {
    const spansForParagraph = byParagraph.get(paragraphIndex);
    if (!spansForParagraph) return paragraph;
    let paragraphChanged = false;

    const spans = paragraph.spans.map((span, spanIndex) => {
      const spanMatches = spansForParagraph.get(spanIndex);
      if (!spanMatches || spanMatches.length === 0) return span;

      let text = span.text;
      const ordered = [...spanMatches].sort((a, b) => b.start - a.start);
      let changed = false;
      for (const match of ordered) {
        if (match.paragraphId !== paragraph.id) { skipped += 1; continue; }
        if (match.start < 0 || match.end > text.length || match.start >= match.end) { skipped += 1; continue; }
        if (text.slice(match.start, match.end) !== match.text) { skipped += 1; continue; }
        text = `${text.slice(0, match.start)}${replacement}${text.slice(match.end)}`;
        count += 1;
        changed = true;
      }
      if (!changed) return span;
      paragraphChanged = true;
      return { ...span, text };
    });

    return paragraphChanged ? { ...paragraph, spans } : paragraph;
  });

  return { paragraphs: next, count, skipped };
}
