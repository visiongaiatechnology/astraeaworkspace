// STATUS: DIAMANT VGT SUPREME — bounded local Notes search, ranking, filters and hit highlighting

import type { NoteNotebook, NotePage, NotePropertyValue, NoteSavedSearch } from '../../../shared/contracts/workspace';
import { noteMediaSearchText } from '../media/notesMediaModel';

export type NotesSearchScope = 'page' | 'section' | 'notebook' | 'all';
export type NotesSearchField = 'title' | 'text' | 'tag' | 'property' | 'attachment' | 'ocr' | 'handwriting' | 'transcript' | 'embed';

export interface NoteSearchHit {
  field: NotesSearchField;
  label: string;
  text: string;
  ranges: Array<{ start: number; end: number }>;
}

export interface NoteSearchResult {
  notebookId: string;
  notebookTitle: string;
  sectionId: string;
  sectionTitle: string;
  page: NotePage;
  score: number;
  hits: NoteSearchHit[];
}

export interface NotesSearchOptions {
  query?: string;
  tag?: string | null;
  scope?: NotesSearchScope;
  activeNotebookId?: string;
  activeSectionId?: string;
  activePageId?: string;
  includeArchived?: boolean;
  favoritesOnly?: boolean;
  includeTrashed?: boolean;
  dateFrom?: number | null;
  dateTo?: number | null;
  limit?: number;
  /**
   * **Der Bezugszeitpunkt des Rangs** (Register **W-429/W-369**).
   *
   * Vorher las `scorePage` den Zeitgeber **selbst** (`Date.now()`) — und zwar **je Seite**, mitten in der
   * Schleife. Damit hing der Rang zweier Seiten mit gleichem Inhalt davon ab, wie viele Millisekunden zwischen
   * ihrem Besuch lagen, und **kein** Aufrufer konnte eine Reihenfolge reproduzieren ✗. Der Zeitpunkt ist jetzt
   * ein **Eingang**: einmal je Aufruf aufgelöst und an **jede** Seite derselbe. *Die Aktualität bleibt eine
   * echte Eigenschaft — sie ist nur nicht mehr heimlich.* Der Aufrufer, der eine feste Reihenfolge braucht,
   * reicht die Zeit, zu der er die Suche begonnen hat.
   */
  now?: number;
}

interface SearchFieldValue {
  field: NotesSearchField;
  label: string;
  text: string;
  weight: number;
}

interface ParsedQuery {
  terms: string[];
  phrases: string[];
  tags: string[];
  properties: Array<{ key: string; value: string }>;
  files: string[];
  mimes: string[];
  sources: Set<NotesSearchField>;
  dateFrom: number | null;
  dateTo: number | null;
  requiredFlags: Set<'favorite' | 'pinned' | 'archived'>;
}

const MAX_QUERY_CHARS = 1024;
const MAX_QUERY_PARTS = 64;
const MAX_RESULTS = 10_000;
const MAX_HITS_PER_RESULT = 4;
const MAX_SNIPPET_CHARS = 180;
const MAX_OCCURRENCES_PER_FIELD = 32;
/**
 * AST-0684: the scan over user data is bounded as well, not only the result count. A document with an
 * unbounded number of pages would otherwise make one keystroke cost unbounded time.
 */
export const NOTES_SEARCH_MAX_SCANNED_PAGES = 20_000;

/** Measured scan cost of one search call, so a truncated scan can be reported instead of hidden. */
export interface NotesSearchScan {
  budget: number;
  scannedPages: number;
  truncated: boolean;
}

export function createNotesSearchScan(budget = NOTES_SEARCH_MAX_SCANNED_PAGES): NotesSearchScan {
  const safe = Number.isFinite(budget) ? Math.trunc(budget) : NOTES_SEARCH_MAX_SCANNED_PAGES;
  return { budget: Math.max(1, safe), scannedPages: 0, truncated: false };
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function parseDateBoundary(value: string, inclusiveEnd: boolean): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return inclusiveEnd ? parsed + 86_400_000 - 1 : parsed;
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function parseNotesSearchQuery(rawQuery: string): ParsedQuery {
  const query = rawQuery.normalize('NFKC').slice(0, MAX_QUERY_CHARS);
  const parts = query.match(/"[^"\n]{1,256}"|\S+/g)?.slice(0, MAX_QUERY_PARTS) ?? [];
  const parsed: ParsedQuery = {
    terms: [], phrases: [], tags: [], properties: [], files: [], mimes: [], sources: new Set(),
    dateFrom: null, dateTo: null, requiredFlags: new Set(),
  };

  for (const rawPart of parts) {
    if (rawPart.startsWith('"') && rawPart.endsWith('"')) {
      const phrase = normalize(stripOuterQuotes(rawPart)).trim();
      if (phrase) parsed.phrases.push(phrase);
      continue;
    }
    const separator = rawPart.indexOf(':');
    if (separator > 0) {
      const key = normalize(rawPart.slice(0, separator));
      const value = normalize(stripOuterQuotes(rawPart.slice(separator + 1))).trim();
      if (!value) continue;
      if (key === 'tag') { parsed.tags.push(value); continue; }
      if (key === 'file' || key === 'attachment') { parsed.files.push(value); continue; }
      if (key === 'mime') { parsed.mimes.push(value); continue; }
      if (key === 'source' && ['title', 'text', 'tag', 'property', 'attachment', 'ocr', 'handwriting', 'transcript', 'embed'].includes(value)) {
        parsed.sources.add(value as NotesSearchField); continue;
      }
      if (key === 'after' || key === 'from') { parsed.dateFrom = parseDateBoundary(value, false); continue; }
      if (key === 'before' || key === 'to') { parsed.dateTo = parseDateBoundary(value, true); continue; }
      if (key === 'is' && ['favorite', 'pinned', 'archived'].includes(value)) {
        parsed.requiredFlags.add(value as 'favorite' | 'pinned' | 'archived'); continue;
      }
      if (key === 'prop' || key === 'property') {
        const equals = value.indexOf('=');
        if (equals > 0) parsed.properties.push({ key: value.slice(0, equals).trim(), value: value.slice(equals + 1).trim() });
        else parsed.properties.push({ key: value, value: '' });
        continue;
      }
    }
    const term = normalize(rawPart).trim();
    if (term) parsed.terms.push(term);
  }
  return parsed;
}

function propertyText(properties: Record<string, NotePropertyValue> | undefined): SearchFieldValue[] {
  return Object.entries(properties ?? {}).slice(0, 128).map(([key, value]) => ({
    field: 'property' as const,
    label: `Property: ${key}`,
    text: `${key} ${String(value ?? '')}`,
    weight: 12,
  }));
}

function pageSearchFields(page: NotePage): SearchFieldValue[] {
  const fields: SearchFieldValue[] = [
    { field: 'title', label: 'Title', text: page.title, weight: 24 },
    { field: 'text', label: 'Page text', text: page.content, weight: 9 },
    ...page.tags.slice(0, 128).map((tag) => ({ field: 'tag' as const, label: 'Tag', text: tag, weight: 18 })),
    ...(page.aliases ?? []).slice(0, 128).map((alias) => ({ field: 'text' as const, label: 'Alias', text: alias, weight: 11 })),
    ...propertyText(page.properties),
    ...(page.attachments ?? []).slice(0, 256).map((attachment) => ({
      field: 'attachment' as const,
      label: 'Attachment',
      text: `${attachment.name} ${attachment.mimeType} ${attachment.sizeBytes}`,
      weight: 13,
    })),
  ];

  for (const block of (page.canvas?.blocks ?? []).slice(0, 2048)) {
    if (block.kind === 'text') fields.push({ field: 'text', label: 'Canvas text', text: block.text, weight: 8 });
    else if (block.kind === 'list') fields.push({ field: 'text', label: 'Canvas list', text: block.items.join(' '), weight: 8 });
    else if (block.kind === 'table') fields.push({ field: 'text', label: 'Canvas table', text: block.rows.flat().join(' '), weight: 8 });
    else if (block.kind === 'image') {
      if (block.altText) fields.push({ field: 'text', label: 'Image alt text', text: block.altText, weight: 7 });
      if (block.ocr?.fullText) fields.push({ field: 'ocr', label: 'OCR', text: block.ocr.fullText, weight: 12 });
    } else if (block.kind === 'ink') {
      const recognized = block.recognizedText ?? block.ink?.recognition?.text ?? '';
      if (recognized) fields.push({ field: 'handwriting', label: 'Handwriting', text: recognized, weight: 12 });
    } else if (block.kind === 'media') {
      const transcript = noteMediaSearchText(block.memo);
      if (transcript) fields.push({ field: 'transcript', label: 'Transcript', text: transcript, weight: 12 });
    } else if (block.kind === 'file') {
      fields.push({ field: 'attachment', label: 'Attachment', text: `${block.name} ${block.mimeType}`, weight: 13 });
    } else if (block.kind === 'embed') {
      fields.push({ field: 'embed', label: 'Embed', text: `${block.title} ${block.reference}`, weight: 7 });
    } else if (block.kind === 'toggle') {
      fields.push({ field: 'text', label: 'Toggle', text: `${block.title} ${block.text}`, weight: 8 });
    }
  }
  return fields;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (count < MAX_OCCURRENCES_PER_FIELD) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    count += 1;
    offset = found + Math.max(1, needle.length);
  }
  return count;
}

function findRanges(text: string, needles: readonly string[]): Array<{ start: number; end: number }> {
  const normalized = normalize(text);
  const rawRanges: Array<{ start: number; end: number }> = [];
  for (const needle of needles) {
    if (!needle) continue;
    let offset = 0;
    for (let count = 0; count < 8; count += 1) {
      const found = normalized.indexOf(needle, offset);
      if (found < 0) break;
      rawRanges.push({ start: found, end: found + needle.length });
      offset = found + Math.max(1, needle.length);
    }
  }
  rawRanges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of rawRanges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged.slice(0, 8);
}

function createSnippet(field: SearchFieldValue, needles: readonly string[]): NoteSearchHit | null {
  const normalized = normalize(field.text);
  let first = -1;
  for (const needle of needles) {
    const found = normalized.indexOf(needle);
    if (found >= 0 && (first < 0 || found < first)) first = found;
  }
  if (first < 0) return null;
  const start = Math.max(0, first - 55);
  const end = Math.min(field.text.length, start + MAX_SNIPPET_CHARS);
  const text = field.text.slice(start, end).replace(/\s+/g, ' ').trim();
  const ranges = findRanges(text, needles);
  return { field: field.field, label: field.label, text, ranges };
}

function matchesPropertyFilters(page: NotePage, filters: ParsedQuery['properties']): boolean {
  if (!filters.length) return true;
  const entries = Object.entries(page.properties ?? {}).map(([key, value]) => [normalize(key), normalize(String(value ?? ''))] as const);
  return filters.every((filter) => entries.some(([key, value]) => key === filter.key && (!filter.value || value.includes(filter.value))));
}

function pageMatchesFilters(page: NotePage, fields: SearchFieldValue[], query: ParsedQuery, options: NotesSearchOptions): boolean {
  if (!options.includeTrashed && page.trashedAt) return false;
  if (!options.includeArchived && page.archived) return false;
  if (options.favoritesOnly && !page.favorite) return false;
  if (options.tag && !page.tags.some((tag) => normalize(tag) === normalize(options.tag ?? ''))) return false;
  if (query.tags.length && !query.tags.every((wanted) => page.tags.some((tag) => normalize(tag) === wanted))) return false;
  if (!matchesPropertyFilters(page, query.properties)) return false;
  if (query.files.length) {
    const fileText = normalize(fields.filter((field) => field.field === 'attachment').map((field) => field.text).join(' '));
    if (!query.files.every((needle) => fileText.includes(needle))) return false;
  }
  if (query.mimes.length) {
    const mimes = (page.attachments ?? []).map((attachment) => normalize(attachment.mimeType));
    const canvasMimes = (page.canvas?.blocks ?? []).filter((block) => block.kind === 'file').map((block) => normalize(block.mimeType));
    if (!query.mimes.every((needle) => [...mimes, ...canvasMimes].some((mime) => mime.includes(needle)))) return false;
  }
  if (query.requiredFlags.has('favorite') && !page.favorite) return false;
  if (query.requiredFlags.has('pinned') && !page.pinned) return false;
  if (query.requiredFlags.has('archived') && !page.archived) return false;
  const from = options.dateFrom ?? query.dateFrom;
  const to = options.dateTo ?? query.dateTo;
  if (from != null && page.last_modified < from) return false;
  if (to != null && page.last_modified > to) return false;
  return true;
}

/**
 * **W-429/W-369:** `now` ist ein **Parameter**, kein Aufruf des Zeitgebers. *Eine Note, die den Rang von einer
 * Uhr abhängig macht, die niemand reichen kann, ist nicht reproduzierbar.*
 */
function scorePage(page: NotePage, fields: SearchFieldValue[], query: ParsedQuery, now: number): { score: number; hits: NoteSearchHit[] } | null {
  const activeFields = query.sources.size ? fields.filter((field) => query.sources.has(field.field)) : fields;
  const needles = [...query.phrases, ...query.terms];
  if (!needles.length) {
    return { score: (page.pinned ? 5 : 0) + (page.favorite ? 3 : 0), hits: [] };
  }
  let score = 0;
  const hitCandidates: Array<{ score: number; hit: NoteSearchHit }> = [];
  for (const needle of needles) {
    let matchedNeedle = false;
    for (const field of activeFields) {
      const normalized = normalize(field.text);
      const occurrences = countOccurrences(normalized, needle);
      if (!occurrences) continue;
      matchedNeedle = true;
      const phraseBoost = query.phrases.includes(needle) ? 2.2 : 1;
      const fieldScore = field.weight * phraseBoost * Math.min(occurrences, 6);
      score += fieldScore;
      const hit = createSnippet(field, [needle]);
      if (hit) hitCandidates.push({ score: fieldScore, hit });
    }
    if (!matchedNeedle) return null;
  }
  if (page.pinned) score += 5;
  if (page.favorite) score += 3;
  const freshnessDays = Math.max(0, (now - page.last_modified) / 86_400_000);
  score += Math.max(0, 4 - Math.min(4, freshnessDays / 30));
  const hits = hitCandidates.sort((a, b) => b.score - a.score).slice(0, MAX_HITS_PER_RESULT).map(({ hit }) => hit);
  return { score, hits };
}

export function searchNotesDetailed(
  notebooks: readonly NoteNotebook[],
  options: NotesSearchOptions = {},
  scan: NotesSearchScan = createNotesSearchScan(),
): NoteSearchResult[] {
  const parsed = parseNotesSearchQuery(options.query ?? '');
  const scope = options.scope ?? 'section';
  const results: NoteSearchResult[] = [];
  const limit = Math.max(1, Math.min(MAX_RESULTS, options.limit ?? MAX_RESULTS));
  // **Einmal je Aufruf** — nicht je Seite. Der Zeitgeber wird hier genau **einmal** gelesen (W-429/W-369).
  const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
  scan.scannedPages = 0;
  scan.truncated = false;

  outer: for (const notebook of notebooks) {
    if ((scope === 'page' || scope === 'section' || scope === 'notebook') && options.activeNotebookId && notebook.id !== options.activeNotebookId) continue;
    for (const section of notebook.sections) {
      if ((scope === 'page' || scope === 'section') && options.activeSectionId && section.id !== options.activeSectionId) continue;
      for (const page of section.pages) {
        if (scan.scannedPages >= scan.budget) {
          // Report the truncation; the caller decides whether to narrow the scope. Never silently pretend
          // that the returned result set is the complete answer.
          scan.truncated = true;
          break outer;
        }
        scan.scannedPages += 1;
        if (scope === 'page' && options.activePageId && page.id !== options.activePageId) continue;
        const fields = pageSearchFields(page);
        if (!pageMatchesFilters(page, fields, parsed, options)) continue;
        const scored = scorePage(page, fields, parsed, now);
        if (!scored) continue;
        results.push({ notebookId: notebook.id, notebookTitle: notebook.title, sectionId: section.id, sectionTitle: section.title, page, score: scored.score, hits: page.sensitiveMode ? [{ field: 'text', label: 'Sensitive note', text: 'Sensitive note preview hidden', ranges: [] }] : scored.hits });
        if (results.length >= limit) break outer;
      }
    }
  }

  return results.sort((a, b) => b.score - a.score || b.page.last_modified - a.page.last_modified || a.page.title.localeCompare(b.page.title));
}

export interface NoteSavedSearchInput {
  id: string;
  name: string;
  query: string;
  scope: NotesSearchScope;
  tag?: string | null;
  dateFrom?: number | null;
  dateTo?: number | null;
  includeArchived?: boolean;
  favoritesOnly?: boolean;
  now?: number;
}

export function createNoteSavedSearch(input: NoteSavedSearchInput): NoteSavedSearch {
  const now = input.now ?? Date.now();
  const name = input.name.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 96);
  if (!name) throw new Error('Saved search name is required.');
  return {
    id: input.id.slice(0, 160),
    name,
    query: input.query.normalize('NFKC').slice(0, MAX_QUERY_CHARS),
    scope: input.scope,
    tag: input.tag ? input.tag.normalize('NFKC').trim().slice(0, 96) : null,
    dateFrom: typeof input.dateFrom === 'number' && Number.isFinite(input.dateFrom) ? input.dateFrom : null,
    dateTo: typeof input.dateTo === 'number' && Number.isFinite(input.dateTo) ? input.dateTo : null,
    includeArchived: Boolean(input.includeArchived),
    favoritesOnly: Boolean(input.favoritesOnly),
    createdAt: now,
    updatedAt: now,
  };
}
