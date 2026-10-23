// STATUS: PLATIN
// Bounded structured-document diff engine; presentation and view projection remain separate.

import type {
  PdfAnnotation,
  PdfDocumentModel,
  PdfFormField,
  PdfPageModel,
  PdfRedaction,
  PdfSectionModel,
} from '../../../shared/contracts/workspace';

import type { PdfCompareCategory, PdfCompareDifference, PdfCompareOptions, PdfComparePageSummary, PdfCompareResult, PdfCompareSummary, PdfCompareTextDelta } from './pdfCompareTypes';

const MAX_PAGES = 10_000;

const MAX_SECTIONS_PER_PAGE = 4_096;

const MAX_DIFFS = 50_000;

const MAX_TEXT_CHARS = 32 * 1024 * 1024;

const MAX_TOKEN_DIFF = 2_048;

interface SectionLocation {
  page: number;
  index: number;
  section: PdfSectionModel;
  normalizedText: string;
  identity: string;
}

function normalizeText(value: string, options: Required<PdfCompareOptions>): string {
  let out = value;
  if (options.ignoreWhitespace) out = out.replace(/\s+/gu, ' ').trim();
  if (options.ignoreCase) out = out.toLocaleLowerCase();
  return out;
}

function normalizeOptions(options: PdfCompareOptions | undefined): Required<PdfCompareOptions> {
  return {
    ignoreCategories: Array.from(new Set(options?.ignoreCategories ?? [])),
    ignoreWhitespace: options?.ignoreWhitespace ?? false,
    ignoreCase: options?.ignoreCase ?? false,
  };
}

function assertModelBounds(model: PdfDocumentModel, label: string): void {
  if (!Array.isArray(model.pages) || model.pages.length > MAX_PAGES) {
    throw new Error(`${label}: page count exceeds compare policy.`);
  }
  let chars = 0;
  for (const page of model.pages) {
    if (!Array.isArray(page.sections) || page.sections.length > MAX_SECTIONS_PER_PAGE) {
      throw new Error(`${label}: page ${page.pageNumber} exceeds section budget.`);
    }
    for (const section of page.sections) {
      chars += section.content.length + section.id.length;
      if (chars > MAX_TEXT_CHARS) throw new Error(`${label}: text budget exceeded.`);
    }
  }
}

function sectionIdentity(section: PdfSectionModel): string {
  return section.id.trim() || `anonymous:${stableFingerprint(`${section.type}\u0000${section.content}`)}`;
}

function stableFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function collectSections(model: PdfDocumentModel, options: Required<PdfCompareOptions>): SectionLocation[] {
  const out: SectionLocation[] = [];
  for (const page of model.pages) {
    page.sections.forEach((section, index) => {
      out.push({
        page: page.pageNumber,
        index,
        section,
        normalizedText: normalizeText(section.content, options),
        identity: sectionIdentity(section),
      });
    });
  }
  return out;
}

function tokenize(value: string): string[] {
  return value.match(/[\p{L}\p{N}_-]+|[^\s]/gu)?.slice(0, MAX_TOKEN_DIFF) ?? [];
}

/**
 * Bounded token delta. This intentionally avoids an O(n*m) LCS over arbitrary document text.
 * It reports multiset additions/removals, while the visual compare preserves full before/after text.
 */
function buildTextDelta(before: string, after: string): PdfCompareTextDelta {
  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  const afterCounts = new Map<string, number>();
  const beforeCounts = new Map<string, number>();
  for (const token of afterTokens) afterCounts.set(token, (afterCounts.get(token) ?? 0) + 1);
  for (const token of beforeTokens) beforeCounts.set(token, (beforeCounts.get(token) ?? 0) + 1);

  const removedTokens: string[] = [];
  for (const token of beforeTokens) {
    const count = afterCounts.get(token) ?? 0;
    if (count > 0) afterCounts.set(token, count - 1);
    else if (removedTokens.length < 256) removedTokens.push(token);
  }

  const addedTokens: string[] = [];
  for (const token of afterTokens) {
    const count = beforeCounts.get(token) ?? 0;
    if (count > 0) beforeCounts.set(token, count - 1);
    else if (addedTokens.length < 256) addedTokens.push(token);
  }
  return { before, after, removedTokens, addedTokens };
}

function canonicalPageMeta(page: PdfPageModel): string {
  return JSON.stringify({
    title: page.title,
    subtitle: page.subtitle ?? '',
    rotation: page.rotation ?? 0,
    pageLabel: page.pageLabel ?? '',
    mediaBox: page.mediaBox ?? null,
    cropBox: page.cropBox ?? null,
    trimBox: page.trimBox ?? null,
    bleedBox: page.bleedBox ?? null,
    artBox: page.artBox ?? null,
  });
}

function canonicalDecorations(page: PdfPageModel): string {
  return JSON.stringify(page.decorations ?? {});
}

function canonicalAnnotation(annotation: PdfAnnotation): string {
  return JSON.stringify({
    id: annotation.id,
    page: annotation.page,
    type: annotation.type,
    text: annotation.text,
    color: annotation.color,
    status: annotation.status ?? 'open',
    targetText: annotation.targetText ?? '',
    replacementText: annotation.replacementText ?? '',
    shapeKind: annotation.shapeKind ?? null,
    bounds: annotation.bounds ?? null,
    stampLabel: annotation.stampLabel ?? '',
    measurement: annotation.measurement ?? null,
    attachment: annotation.attachment
      ? {
          fileName: annotation.attachment.fileName,
          mimeType: annotation.attachment.mimeType,
          byteLength: annotation.attachment.byteLength,
          sha256: annotation.attachment.sha256,
        }
      : null,
    replies: (annotation.replies ?? []).map((reply) => ({ id: reply.id, text: reply.text, author: reply.author })),
  });
}

function canonicalForm(field: PdfFormField): string {
  return JSON.stringify({
    id: field.id,
    name: field.name,
    type: field.type,
    page: field.page,
    bounds: field.bounds,
    label: field.label ?? '',
    tooltip: field.tooltip ?? '',
    value: field.value,
    options: field.options ?? [],
    required: field.required ?? false,
    readOnly: field.readOnly ?? false,
    tabOrder: field.tabOrder ?? null,
    validation: field.validation ?? null,
    calculation: field.calculation ?? null,
    submitUrl: field.submitUrl ?? '',
  });
}

function canonicalRedaction(redaction: PdfRedaction): string {
  return JSON.stringify({
    id: redaction.id,
    page: redaction.page,
    x: redaction.x,
    y: redaction.y,
    width: redaction.width,
    height: redaction.height,
    reason: redaction.reason,
    isApplied: redaction.isApplied,
  });
}

function pushDifference(target: PdfCompareDifference[], difference: PdfCompareDifference): void {
  if (target.length >= MAX_DIFFS) throw new Error('PDF compare difference budget exceeded.');
  target.push(difference);
}

function diffMapCategory<T>(
  category: PdfCompareCategory,
  before: T[],
  after: T[],
  getId: (item: T) => string,
  canonical: (item: T) => string,
  getPage: (item: T) => number | undefined,
  differences: PdfCompareDifference[]
): void {
  const beforeMap = new Map(before.map((item) => [getId(item), item]));
  const afterMap = new Map(after.map((item) => [getId(item), item]));
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const id of ids) {
    const left = beforeMap.get(id);
    const right = afterMap.get(id);
    if (!left && right) {
      pushDifference(differences, {
        id: `${category}:inserted:${id}`,
        kind: 'inserted',
        category,
        pageAfter: getPage(right),
        summary: `${category} inserted: ${id}`,
      });
    } else if (left && !right) {
      pushDifference(differences, {
        id: `${category}:deleted:${id}`,
        kind: 'deleted',
        category,
        pageBefore: getPage(left),
        summary: `${category} deleted: ${id}`,
      });
    } else if (left && right && canonical(left) !== canonical(right)) {
      pushDifference(differences, {
        id: `${category}:changed:${id}`,
        kind: 'changed',
        category,
        pageBefore: getPage(left),
        pageAfter: getPage(right),
        summary: `${category} changed: ${id}`,
      });
    }
  }
}

export function compareStructuredPdfDocuments(
  sourceTitle: string,
  source: PdfDocumentModel,
  targetTitle: string,
  target: PdfDocumentModel,
  inputOptions?: PdfCompareOptions
): PdfCompareResult {
  assertModelBounds(source, 'source');
  assertModelBounds(target, 'target');
  const options = normalizeOptions(inputOptions);
  const ignored = new Set<PdfCompareCategory>(options.ignoreCategories);
  const differences: PdfCompareDifference[] = [];

  if (!ignored.has('text')) {
    const beforeSections = collectSections(source, options);
    const afterSections = collectSections(target, options);
    const beforeById = new Map(beforeSections.map((entry) => [entry.identity, entry]));
    const afterById = new Map(afterSections.map((entry) => [entry.identity, entry]));
    const matchedBefore = new Set<string>();
    const matchedAfter = new Set<string>();

    for (const [identity, before] of beforeById) {
      const after = afterById.get(identity);
      if (!after) continue;
      matchedBefore.add(identity);
      matchedAfter.add(identity);
      const textChanged = before.normalizedText !== after.normalizedText || before.section.type !== after.section.type;
      const locationChanged = before.page !== after.page || before.index !== after.index;
      if (textChanged) {
        pushDifference(differences, {
          id: `text:changed:${identity}`,
          kind: 'changed',
          category: 'text',
          pageBefore: before.page,
          pageAfter: after.page,
          indexBefore: before.index,
          indexAfter: after.index,
          sectionId: identity,
          summary: `Section ${identity} changed`,
          textDelta: buildTextDelta(before.section.content, after.section.content),
        });
      }
      if (locationChanged) {
        pushDifference(differences, {
          id: `text:moved:${identity}`,
          kind: 'moved',
          category: 'text',
          pageBefore: before.page,
          pageAfter: after.page,
          indexBefore: before.index,
          indexAfter: after.index,
          sectionId: identity,
          summary: `Section ${identity} moved from page ${before.page} to ${after.page}`,
        });
      }
    }

    // Match identical content with changed IDs as moves, which is useful after external normalization.
    const unmatchedBefore = beforeSections.filter((entry) => !matchedBefore.has(entry.identity));
    const unmatchedAfter = afterSections.filter((entry) => !matchedAfter.has(entry.identity));
    const afterByFingerprint = new Map<string, SectionLocation[]>();
    for (const entry of unmatchedAfter) {
      const key = `${entry.section.type}:${stableFingerprint(entry.normalizedText)}`;
      const bucket = afterByFingerprint.get(key) ?? [];
      bucket.push(entry);
      afterByFingerprint.set(key, bucket);
    }
    const consumedAfter = new Set<string>();
    for (const before of unmatchedBefore) {
      const key = `${before.section.type}:${stableFingerprint(before.normalizedText)}`;
      const bucket = afterByFingerprint.get(key) ?? [];
      const after = bucket.find((entry) => !consumedAfter.has(entry.identity));
      if (!after) continue;
      consumedAfter.add(after.identity);
      matchedBefore.add(before.identity);
      matchedAfter.add(after.identity);
      pushDifference(differences, {
        id: `text:moved:${before.identity}:${after.identity}`,
        kind: 'moved',
        category: 'text',
        pageBefore: before.page,
        pageAfter: after.page,
        indexBefore: before.index,
        indexAfter: after.index,
        sectionId: after.identity,
        summary: `Equivalent content moved from page ${before.page} to ${after.page}`,
      });
    }

    for (const before of beforeSections) {
      if (matchedBefore.has(before.identity)) continue;
      pushDifference(differences, {
        id: `text:deleted:${before.identity}`,
        kind: 'deleted',
        category: 'text',
        pageBefore: before.page,
        indexBefore: before.index,
        sectionId: before.identity,
        summary: `Section ${before.identity} deleted`,
        textDelta: buildTextDelta(before.section.content, ''),
      });
    }
    for (const after of afterSections) {
      if (matchedAfter.has(after.identity)) continue;
      pushDifference(differences, {
        id: `text:inserted:${after.identity}`,
        kind: 'inserted',
        category: 'text',
        pageAfter: after.page,
        indexAfter: after.index,
        sectionId: after.identity,
        summary: `Section ${after.identity} inserted`,
        textDelta: buildTextDelta('', after.section.content),
      });
    }
  }

  if (!ignored.has('page-meta')) {
    const beforePages = new Map(source.pages.map((page) => [page.pageNumber, page]));
    const afterPages = new Map(target.pages.map((page) => [page.pageNumber, page]));
    const pageNumbers = new Set([...beforePages.keys(), ...afterPages.keys()]);
    for (const pageNumber of pageNumbers) {
      const before = beforePages.get(pageNumber);
      const after = afterPages.get(pageNumber);
      if (!before && after) {
        pushDifference(differences, { id: `page-meta:inserted:${pageNumber}`, kind: 'inserted', category: 'page-meta', pageAfter: pageNumber, summary: `Page ${pageNumber} inserted` });
      } else if (before && !after) {
        pushDifference(differences, { id: `page-meta:deleted:${pageNumber}`, kind: 'deleted', category: 'page-meta', pageBefore: pageNumber, summary: `Page ${pageNumber} deleted` });
      } else if (before && after && canonicalPageMeta(before) !== canonicalPageMeta(after)) {
        pushDifference(differences, { id: `page-meta:changed:${pageNumber}`, kind: 'changed', category: 'page-meta', pageBefore: pageNumber, pageAfter: pageNumber, summary: `Page ${pageNumber} metadata or boxes changed` });
      }
    }
  }

  if (!ignored.has('decorations')) {
    const beforePages = new Map(source.pages.map((page) => [page.pageNumber, page]));
    const afterPages = new Map(target.pages.map((page) => [page.pageNumber, page]));
    for (const pageNumber of new Set([...beforePages.keys(), ...afterPages.keys()])) {
      const before = beforePages.get(pageNumber);
      const after = afterPages.get(pageNumber);
      if (before && after && canonicalDecorations(before) !== canonicalDecorations(after)) {
        pushDifference(differences, { id: `decorations:changed:${pageNumber}`, kind: 'changed', category: 'decorations', pageBefore: pageNumber, pageAfter: pageNumber, summary: `Page ${pageNumber} decorations changed` });
      }
    }
  }

  if (!ignored.has('annotations')) {
    diffMapCategory('annotations', source.annotations ?? [], target.annotations ?? [], (item) => item.id, canonicalAnnotation, (item) => item.page, differences);
  }
  if (!ignored.has('forms')) {
    diffMapCategory('forms', source.formFields ?? [], target.formFields ?? [], (item) => item.id, canonicalForm, (item) => item.page, differences);
  }
  if (!ignored.has('redactions')) {
    diffMapCategory('redactions', source.redactions ?? [], target.redactions ?? [], (item) => item.id, canonicalRedaction, (item) => item.page, differences);
  }

  const summary: PdfCompareSummary = { inserted: 0, deleted: 0, changed: 0, moved: 0, total: differences.length, pagesTouched: 0 };
  const pageMap = new Map<number, PdfComparePageSummary>();
  const touched = new Set<number>();
  for (const difference of differences) {
    summary[difference.kind] += 1;
    for (const page of [difference.pageBefore, difference.pageAfter]) {
      if (!page) continue;
      touched.add(page);
      const current = pageMap.get(page) ?? { pageNumber: page, inserted: 0, deleted: 0, changed: 0, moved: 0, differenceIds: [] };
      current[difference.kind] += 1;
      current.differenceIds.push(difference.id);
      pageMap.set(page, current);
    }
  }
  summary.pagesTouched = touched.size;

  return {
    schema: 'vgt-pdf-compare-v1',
    generatedAt: Date.now(),
    sourceTitle: sourceTitle.slice(0, 512),
    targetTitle: targetTitle.slice(0, 512),
    options,
    summary,
    pageSummaries: [...pageMap.values()].sort((a, b) => a.pageNumber - b.pageNumber),
    differences,
  };
}
