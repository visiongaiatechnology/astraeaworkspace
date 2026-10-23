// STATUS: PLATIN — Unicode-aware Writer line-break semantics
import type { WriterHyphenationMode, WriterLanguageTag, WriterLineBreakMode } from '../../../../shared/contracts/workspace';
import { getHyphenationPoints, hyphenateText } from '../typography/hyphenation/writerHyphenation';
import { canBreakCjkBetween, isCjkTextCharacter } from '../typography/writerTextShaping';
import { writerHyphenationPatternLanguage } from '../../productivity/language/writerLinguistics';
import { segmentGraphemes } from '../../../../platform/rendering/index';

const SOFT_HYPHEN = '\u00AD';
const WORD_JOINER = '\u2060';

export interface WriterTextLanguageRange {
  start: number;
  end: number;
  language: WriterLanguageTag;
}

export interface WriterTextLayoutOptions {
  lineBreakMode?: WriterLineBreakMode;
  hyphenationMode?: WriterHyphenationMode;
  language?: WriterLanguageTag;
  languageRanges?: readonly WriterTextLanguageRange[];
}

type NormalizedWriterTextLayoutOptions = {
  lineBreakMode: WriterLineBreakMode;
  hyphenationMode: WriterHyphenationMode;
  language: WriterLanguageTag;
  languageRanges: readonly WriterTextLanguageRange[];
};

function normalizedLayoutOptions(options?: WriterTextLayoutOptions): NormalizedWriterTextLayoutOptions {
  return {
    lineBreakMode: options?.lineBreakMode ?? 'normal',
    hyphenationMode: options?.hyphenationMode ?? 'manual',
    language: options?.language ?? 'en-US',
    languageRanges: options?.languageRanges ?? [],
  };
}

function hyphenationLanguage(language: WriterLanguageTag): 'de' | 'en' | null {
  // Shared with the linguistics module so the manual and the automatic path cannot
  // drift — the manual one used to hyphenate every non-German text with English
  // patterns.
  return writerHyphenationPatternLanguage(language);
}

function automaticHyphenationBreaks(
  text: string,
  options: NormalizedWriterTextLayoutOptions,
): Set<number> {
  if (options.hyphenationMode !== 'auto') return new Set();
  const breaks = new Set<number>();
  const sourceRanges = options.languageRanges.length > 0
    ? options.languageRanges
    : [{ start: 0, end: text.length, language: options.language }];
  for (const sourceRange of sourceRanges) {
    const start = Math.max(0, Math.min(text.length, Math.trunc(sourceRange.start)));
    const end = Math.max(start, Math.min(text.length, Math.trunc(sourceRange.end)));
    const segment = text.slice(start, end);
    const wordPattern = /[a-zA-Z\u00C0-\u024F]+/g;
    let match: RegExpExecArray | null;
    while ((match = wordPattern.exec(segment)) !== null) {
      const language = hyphenationLanguage(sourceRange.language);
      if (!language) continue;
      const points = getHyphenationPoints(match[0], {
        language,
        minLeft: 2,
        minRight: 2,
        hyphenChar: SOFT_HYPHEN,
      });
      for (const point of points) breaks.add(start + match.index + point);
    }
  }
  return breaks;
}

function visibleText(text: string): string {
  return text.replaceAll(SOFT_HYPHEN, '').replaceAll(WORD_JOINER, '');
}

function visibleLength(text: string): number {
  return Array.from(visibleText(text)).length;
}

function graphemeClusters(text: string): string[] {
  return segmentGraphemes(text).map((entry) => entry.segment);
}

function containsCjk(text: string): boolean {
  return graphemeClusters(text).some((cluster) => [...cluster].some(isCjkTextCharacter));
}

function splitCjkPiece(piece: string, maximumCharacters: number): string[] {
  const clusters = graphemeClusters(piece);
  if (clusters.length <= maximumCharacters) return [piece];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < clusters.length) {
    let cut = Math.min(offset + maximumCharacters, clusters.length);
    if (cut < clusters.length) {
      while (
        cut > offset + 1 &&
        !canBreakCjkBetween(clusters[cut - 1]!, clusters[cut]!)
      ) cut -= 1;
      if (
        cut === offset + 1 &&
        !canBreakCjkBetween(clusters[cut - 1]!, clusters[cut]!)
      ) {
        cut = Math.min(offset + maximumCharacters, clusters.length);
        while (
          cut < clusters.length &&
          !canBreakCjkBetween(clusters[cut - 1]!, clusters[cut]!)
        ) cut += 1;
      }
    }
    if (cut <= offset) cut = Math.min(offset + 1, clusters.length);
    chunks.push(clusters.slice(offset, cut).join(''));
    offset = cut;
  }
  return chunks;
}

function splitAtSoftHyphens(
  token: string,
  maximumCharacters: number,
  hyphenationMode: WriterHyphenationMode,
): string[] {
  if (
    hyphenationMode === 'none' ||
    !token.includes(SOFT_HYPHEN) ||
    visibleLength(token) <= maximumCharacters
  ) return [visibleText(token)];
  const syllables = token.split(SOFT_HYPHEN);
  const lines: string[] = [];
  let current = '';
  for (const syllable of syllables) {
    const candidate = current + syllable;
    if (current && visibleLength(candidate) > maximumCharacters) {
      lines.push(`${visibleText(current)}-`);
      current = syllable;
    } else {
      current = candidate;
    }
  }
  if (current || lines.length === 0) lines.push(visibleText(current));
  return lines;
}

function splitLongPiece(piece: string, maximumCharacters: number, mode: WriterLineBreakMode): string[] {
  if (visibleLength(piece) <= maximumCharacters) {
    return [piece];
  }
  if (containsCjk(piece) && mode !== 'anywhere') {
    return splitCjkPiece(piece, maximumCharacters);
  }
  if (mode !== 'break-word' && mode !== 'anywhere') return [piece];
  const characters = graphemeClusters(piece);
  const chunks: string[] = [];
  for (let offset = 0; offset < characters.length; offset += maximumCharacters) {
    chunks.push(characters.slice(offset, offset + maximumCharacters).join(''));
  }
  return chunks;
}

function wrapLogicalLine(
  line: string,
  maximumCharacters: number,
  options: NormalizedWriterTextLayoutOptions,
): string[] {
  const autoLanguage = hyphenationLanguage(options.language);
  const preparedLine = options.hyphenationMode === 'auto' && autoLanguage
    ? hyphenateText(line, {
        language: autoLanguage,
        minLeft: 2,
        minRight: 2,
        hyphenChar: SOFT_HYPHEN,
      })
    : line;
  const effectiveHyphenationMode: WriterHyphenationMode = options.hyphenationMode === 'auto' ? 'manual' : options.hyphenationMode;
  const tokens = preparedLine.split(/[\u0020\t\f\v]+/u).filter(Boolean);
  if (tokens.length === 0) return [''];
  const output: string[] = [];
  let current = '';

  for (const token of tokens) {
    const softHyphenPieces = splitAtSoftHyphens(token, maximumCharacters, effectiveHyphenationMode);
    for (const softHyphenPiece of softHyphenPieces) {
      const pieces = splitLongPiece(softHyphenPiece, maximumCharacters, options.lineBreakMode);
      for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (current && visibleLength(candidate) > maximumCharacters) {
        output.push(current);
        current = piece;
      } else {
        current = candidate;
      }
      if (piece.endsWith('-') && current) {
        output.push(current);
        current = '';
      }
      }
    }
  }
  if (current || output.length === 0) output.push(current);
  return output;
}

export function wrapWriterText(
  text: string,
  maximumCharacters: number,
  options?: WriterTextLayoutOptions,
): string[] {
  const safeMaximum = Math.max(1, Math.trunc(maximumCharacters));
  const normalizedOptions = normalizedLayoutOptions(options);
  return text.split(/\r?\n/u).flatMap((line) => wrapLogicalLine(line, safeMaximum, normalizedOptions));
}

export interface WriterTextLineRange {
  start: number;
  end: number;
}


function graphemeBoundaries(text: string): number[] {
  const boundaries = [0];
  for (const entry of segmentGraphemes(text)) {
    const end = entry.index + entry.segment.length;
    if (end > boundaries[boundaries.length - 1]!) boundaries.push(end);
  }
  if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);
  return boundaries;
}

function nextBoundary(boundaries: readonly number[], offset: number, textLength: number): number {
  let low = 0;
  let high = boundaries.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = boundaries[middle]!;
    if (value <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return low < boundaries.length ? boundaries[low]! : textLength;
}

function firstCodePoint(text: string): string {
  return Array.from(text)[0] ?? '';
}

function lastCodePoint(text: string): string {
  const points = Array.from(text);
  return points[points.length - 1] ?? '';
}

/**
 * Produces lossless UTF-16 source ranges for editable page fragments. Every source
 * code unit belongs to exactly one range, so pagination never normalizes or drops
 * whitespace, newlines, joiners, or soft hyphens while the user edits a fragment.
 */
export function wrapWriterTextRangesVariable(
  text: string,
  maximumCharactersForLine: (lineIndex: number, lineStart: number) => number,
  options?: WriterTextLayoutOptions,
): WriterTextLineRange[] {
  const normalizedOptions = normalizedLayoutOptions(options);
  if (text.length === 0) return [{ start: 0, end: 0 }];
  const autoHyphenBreaks = automaticHyphenationBreaks(text, normalizedOptions);
  const boundaries = graphemeBoundaries(text);

  const ranges: WriterTextLineRange[] = [];
  let lineStart = 0;
  while (lineStart < text.length) {
    const safeMaximum = Math.max(1, Math.trunc(maximumCharactersForLine(ranges.length, lineStart)));
    let cursor = lineStart;
    let visibleCharacters = 0;
    let lastWhitespaceBreak = -1;
    let lastSoftHyphenBreak = -1;
    let lastCjkBreak = -1;
    let forcedBreak = -1;

    while (cursor < text.length) {
      const next = nextBoundary(boundaries, cursor, text.length);
      const character = text.slice(cursor, next);
      if (character === '\r' || character === '\n' || character === '\r\n') {
        forcedBreak = next;
        cursor = next;
        break;
      }
      if (/^[\u0020\t\f\v]$/u.test(character)) lastWhitespaceBreak = next;
      if (character === SOFT_HYPHEN && normalizedOptions.hyphenationMode !== 'none') {
        lastSoftHyphenBreak = next;
      }
      if (normalizedOptions.hyphenationMode === 'auto' && autoHyphenBreaks.has(next)) {
        lastSoftHyphenBreak = next;
      }
      if (next < text.length && character !== WORD_JOINER && text[next] !== WORD_JOINER) {
        const afterNext = nextBoundary(boundaries, next, text.length);
        const nextCharacter = text.slice(next, afterNext);
        const previousPoint = lastCodePoint(character);
        const nextPoint = firstCodePoint(nextCharacter);
        if (
          (isCjkTextCharacter(character) || isCjkTextCharacter(nextCharacter)) &&
          canBreakCjkBetween(previousPoint, nextPoint)
        ) lastCjkBreak = next;
      }
      if (character !== SOFT_HYPHEN && character !== WORD_JOINER) visibleCharacters += 1;
      cursor = next;
      if (visibleCharacters >= safeMaximum) break;
    }

    let lineEnd: number;
    if (forcedBreak >= 0) {
      lineEnd = forcedBreak;
    } else if (cursor >= text.length) {
      lineEnd = text.length;
    } else if (normalizedOptions.lineBreakMode === 'anywhere') {
      lineEnd = cursor;
    } else if (lastWhitespaceBreak > lineStart) {
      lineEnd = lastWhitespaceBreak;
    } else if (lastSoftHyphenBreak > lineStart) {
      lineEnd = lastSoftHyphenBreak;
    } else if (lastCjkBreak > lineStart) {
      lineEnd = lastCjkBreak;
    } else if (normalizedOptions.lineBreakMode === 'break-word') {
      lineEnd = cursor;
    } else {
      lineEnd = cursor;
      while (lineEnd < text.length) {
        const next = nextBoundary(boundaries, lineEnd, text.length);
        const character = text.slice(lineEnd, next);
        lineEnd = next;
        if (/^[\r\n\u0020\t\f\v]$/u.test(character)) break;
      }
    }
    if (lineEnd <= lineStart) lineEnd = nextBoundary(boundaries, lineStart, text.length);
    ranges.push({ start: lineStart, end: lineEnd });
    lineStart = lineEnd;
  }
  return ranges;
}

export function wrapWriterTextRanges(
  text: string,
  maximumCharacters: number,
  options?: WriterTextLayoutOptions,
): WriterTextLineRange[] {
  const safeMaximum = Math.max(1, Math.trunc(maximumCharacters));
  return wrapWriterTextRangesVariable(text, () => safeMaximum, options);
}

export function writerPdfSafeText(text: string): string {
  return text
    .replace(/[\u00A0\u202F]/gu, ' ')
    .replaceAll('\u2011', '-')
    .replace(/[\u00AD\u2060]/gu, '');
}
