// STATUS: DIAMANT VGT SUPREME — Deterministic, bounded paragraph and list sorting domain
import type { Paragraph } from '../../../../shared/contracts/workspace';

export type WriterSortDataType = 'text' | 'number' | 'date';
export type WriterSortDirection = 'ascending' | 'descending';
export type WriterSortKeySeparator = 'whole' | 'tab' | 'comma' | 'semicolon';

export interface WriterSortOptions {
  dataType: WriterSortDataType;
  direction: WriterSortDirection;
  keySeparator: WriterSortKeySeparator;
  keyIndex: number;
  caseSensitive: boolean;
  locale: string;
}

export interface WriterSortRange {
  startIndex: number;
  endIndex: number;
  unitCount: number;
  paragraphCount: number;
  kind: 'paragraphs' | 'list';
  label: string;
  sortable: boolean;
  reason?: string;
}

export interface WriterSortResult {
  paragraphs: Paragraph[];
  range: WriterSortRange;
  changed: boolean;
}

interface SortUnit {
  root: Paragraph;
  paragraphs: Paragraph[];
  originalIndex: number;
}

const MAX_SORT_KEY_LENGTH = 4_096;
const MAX_FIELD_INDEX = 16;

const paragraphText = (paragraph: Paragraph): string =>
  paragraph.spans.map((span) => span.text).join('').trim().slice(0, MAX_SORT_KEY_LENGTH);

const listLevel = (paragraph: Paragraph): number =>
  Math.max(0, Math.min(8, Math.trunc(paragraph.style.list_level ?? 0)));

const isStructuralBoundary = (paragraph: Paragraph, boundaryIds: ReadonlySet<string>): boolean =>
  Boolean(
    paragraph.style.heading_level ||
    paragraph.style.page_break_before ||
    paragraph.style.column_break_before ||
    boundaryIds.has(paragraph.id),
  );

const unsortableRange = (index: number, reason: string): WriterSortRange => ({
  startIndex: Math.max(0, index),
  endIndex: Math.max(0, index),
  unitCount: 0,
  paragraphCount: 0,
  kind: 'paragraphs',
  label: 'Kein sortierbarer Bereich',
  sortable: false,
  reason,
});

export function resolveWriterSortRange(
  paragraphs: readonly Paragraph[],
  activeParagraphId: string | null | undefined,
  boundaryParagraphIds: readonly string[] = [],
): WriterSortRange {
  const activeIndex = paragraphs.findIndex((paragraph) => paragraph.id === activeParagraphId);
  if (activeIndex < 0) return unsortableRange(0, 'Kein aktiver Absatz vorhanden.');
  const active = paragraphs[activeIndex];
  const boundaries = new Set(boundaryParagraphIds);
  if (isStructuralBoundary(active, boundaries)) {
    return unsortableRange(activeIndex, 'Überschriften, Seitenumbrüche und Abschnittsanfänge bilden feste Sortiergrenzen.');
  }

  if (active.style.list_style) {
    const targetStyle = active.style.list_style;
    const targetLevel = listLevel(active);
    let startIndex = activeIndex;
    let endIndex = activeIndex;
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      const candidate = paragraphs[index];
      const candidateLevel = listLevel(candidate);
      if (
        isStructuralBoundary(candidate, boundaries) ||
        !candidate.style.list_style ||
        candidateLevel < targetLevel ||
        (candidateLevel === targetLevel && candidate.style.list_style !== targetStyle)
      ) break;
      if (candidateLevel === targetLevel) startIndex = index;
    }
    for (let index = activeIndex + 1; index < paragraphs.length; index += 1) {
      const candidate = paragraphs[index];
      const candidateLevel = listLevel(candidate);
      if (
        isStructuralBoundary(candidate, boundaries) ||
        !candidate.style.list_style ||
        candidateLevel < targetLevel ||
        (candidateLevel === targetLevel && candidate.style.list_style !== targetStyle)
      ) break;
      endIndex = index;
    }
    const unitCount = paragraphs
      .slice(startIndex, endIndex + 1)
      .filter((paragraph) => listLevel(paragraph) === targetLevel).length;
    return {
      startIndex,
      endIndex,
      unitCount,
      paragraphCount: endIndex - startIndex + 1,
      kind: 'list',
      label: `Aktuelle ${targetStyle === 'number' ? 'Nummerierung' : targetStyle === 'checklist' ? 'Checkliste' : 'Aufzählung'} · Ebene ${targetLevel + 1}`,
      sortable: unitCount >= 2,
      reason: unitCount >= 2 ? undefined : 'Der aktuelle Listenbereich enthält weniger als zwei gleichrangige Einträge.',
    };
  }

  let startIndex = activeIndex;
  let endIndex = activeIndex;
  const isPlainSortable = (paragraph: Paragraph): boolean =>
    !paragraph.style.list_style && !isStructuralBoundary(paragraph, boundaries);
  while (startIndex > 0 && isPlainSortable(paragraphs[startIndex - 1])) startIndex -= 1;
  while (endIndex + 1 < paragraphs.length && isPlainSortable(paragraphs[endIndex + 1])) endIndex += 1;
  const unitCount = endIndex - startIndex + 1;
  return {
    startIndex,
    endIndex,
    unitCount,
    paragraphCount: unitCount,
    kind: 'paragraphs',
    label: 'Aktueller Absatzblock',
    sortable: unitCount >= 2,
    reason: unitCount >= 2 ? undefined : 'Der aktuelle Absatzblock enthält weniger als zwei Absätze.',
  };
}

function buildSortUnits(paragraphs: readonly Paragraph[], range: WriterSortRange): SortUnit[] {
  const slice = paragraphs.slice(range.startIndex, range.endIndex + 1);
  if (range.kind === 'paragraphs') {
    return slice.map((paragraph, originalIndex) => ({ root: paragraph, paragraphs: [paragraph], originalIndex }));
  }
  const rootLevel = listLevel(slice[0]);
  const units: SortUnit[] = [];
  for (const paragraph of slice) {
    if (listLevel(paragraph) === rootLevel || units.length === 0) {
      units.push({ root: paragraph, paragraphs: [paragraph], originalIndex: units.length });
    } else {
      units.at(-1)?.paragraphs.push(paragraph);
    }
  }
  return units;
}

function extractSortKey(text: string, separator: WriterSortKeySeparator, requestedIndex: number): string {
  if (separator === 'whole') return text;
  const delimiter = separator === 'tab' ? '\t' : separator === 'comma' ? ',' : ';';
  const index = Math.max(1, Math.min(MAX_FIELD_INDEX, Math.trunc(requestedIndex))) - 1;
  return (text.split(delimiter, MAX_FIELD_INDEX)[index] ?? '').trim().slice(0, MAX_SORT_KEY_LENGTH);
}

function localeSeparators(locale: string): { decimal: string; group: string } {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12_345.6);
    return {
      decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
      group: parts.find((part) => part.type === 'group')?.value ?? ',',
    };
  } catch {
    return { decimal: ',', group: '.' };
  }
}

export function parseWriterSortNumber(value: string, locale: string): number | null {
  const separators = localeSeparators(locale);
  let normalized = value.normalize('NFKC').trim().replace(/−/gu, '-');
  const negativeParentheses = /^\(.*\)$/u.test(normalized);
  if (negativeParentheses) normalized = normalized.slice(1, -1);
  normalized = normalized.replace(/^[\p{Sc}\s]+|[\p{Sc}%\s]+$/gu, '');
  normalized = normalized.split(separators.group).join('').replaceAll('\u00A0', '').replaceAll('\u202F', '');
  if (separators.decimal !== '.') normalized = normalized.replace(separators.decimal, '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negativeParentheses ? -Math.abs(parsed) : parsed;
}

function validUtcDate(year: number, month: number, day: number): number | null {
  if (year < 1 || year > 9_999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.getTime()
    : null;
}

export function parseWriterSortDate(value: string, locale: string): number | null {
  const normalized = value.normalize('NFKC').trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u.exec(normalized);
  if (iso) return validUtcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const localized = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/u.exec(normalized);
  if (!localized) return null;
  const monthFirst = /^en-US(?:$|-)/iu.test(locale);
  const first = Number(localized[1]);
  const second = Number(localized[2]);
  return validUtcDate(Number(localized[3]), monthFirst ? first : second, monthFirst ? second : first);
}

function safeCollator(locale: string, caseSensitive: boolean): Intl.Collator {
  try {
    return new Intl.Collator(locale, {
      usage: 'sort',
      sensitivity: caseSensitive ? 'variant' : 'base',
      numeric: false,
      ignorePunctuation: false,
    });
  } catch {
    return new Intl.Collator('de-DE', {
      usage: 'sort',
      sensitivity: caseSensitive ? 'variant' : 'base',
      numeric: false,
      ignorePunctuation: false,
    });
  }
}

export function sortWriterParagraphs(
  paragraphs: readonly Paragraph[],
  activeParagraphId: string | null | undefined,
  options: WriterSortOptions,
  boundaryParagraphIds: readonly string[] = [],
): WriterSortResult {
  const range = resolveWriterSortRange(paragraphs, activeParagraphId, boundaryParagraphIds);
  if (!range.sortable) return { paragraphs: [...paragraphs], range, changed: false };
  const collator = safeCollator(options.locale, options.caseSensitive);
  const direction = options.direction === 'descending' ? -1 : 1;
  const keyed = buildSortUnits(paragraphs, range).map((unit) => {
    const key = extractSortKey(paragraphText(unit.root), options.keySeparator, options.keyIndex);
    const value = options.dataType === 'number'
      ? parseWriterSortNumber(key, options.locale)
      : options.dataType === 'date'
        ? parseWriterSortDate(key, options.locale)
        : key.normalize('NFKC');
    return { unit, key, value };
  });
  keyed.sort((left, right) => {
    const leftInvalid = left.value === null || left.value === '';
    const rightInvalid = right.value === null || right.value === '';
    if (leftInvalid !== rightInvalid) return leftInvalid ? 1 : -1;
    if (leftInvalid && rightInvalid) return left.unit.originalIndex - right.unit.originalIndex;
    const compared = typeof left.value === 'number' && typeof right.value === 'number'
      ? left.value - right.value
      : collator.compare(String(left.value), String(right.value));
    return compared === 0 ? left.unit.originalIndex - right.unit.originalIndex : Math.sign(compared) * direction;
  });
  const sortedRange = keyed.flatMap(({ unit }) => unit.paragraphs);
  const originalRange = paragraphs.slice(range.startIndex, range.endIndex + 1);
  const changed = sortedRange.some((paragraph, index) => paragraph.id !== originalRange[index]?.id);
  return {
    paragraphs: [
      ...paragraphs.slice(0, range.startIndex),
      ...sortedRange,
      ...paragraphs.slice(range.endIndex + 1),
    ],
    range,
    changed,
  };
}
