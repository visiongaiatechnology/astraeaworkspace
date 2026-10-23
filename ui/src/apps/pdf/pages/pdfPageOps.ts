// STATUS: DIAMANT VGT SUPREME
// Canonical structured-PDF page operations with reference remapping.

import type {
  PdfAnnotation,
  PdfDocumentModel,
  PdfFormField,
  PdfPageBox,
  PdfPageDecorations,
  PdfPageModel,
  PdfRedaction,
} from '../../../shared/contracts/workspace';

const DEFAULT_MEDIA_BOX: PdfPageBox = { x: 0, y: 0, width: 595.28, height: 841.89 };
const MAX_PAGE_DIMENSION = 20_000;
/**
 * Exported so the persistence layer holds *the same* page bound instead of writing a second one. One fact,
 * one definition — the failure this project has paid for repeatedly.
 */
export const MAX_PAGE_COUNT = 10_000;

function normalizeBox(box: PdfPageBox | undefined, fallback: PdfPageBox = DEFAULT_MEDIA_BOX): PdfPageBox {
  if (!box) return { ...fallback };
  const finite = (value: number, fallbackValue: number) => Number.isFinite(value) ? value : fallbackValue;
  const x = Math.max(0, finite(box.x, fallback.x));
  const y = Math.max(0, finite(box.y, fallback.y));
  const width = Math.min(MAX_PAGE_DIMENSION, Math.max(1, finite(box.width, fallback.width)));
  const height = Math.min(MAX_PAGE_DIMENSION, Math.max(1, finite(box.height, fallback.height)));
  return { x, y, width, height };
}

function renumberModel(
  model: PdfDocumentModel,
  pages: PdfPageModel[],
  oldToNew: Map<number, number>,
  dropMissing = true
): PdfDocumentModel {
  const annotations = model.annotations
    .map((annotation): PdfAnnotation | null => {
      const page = oldToNew.get(annotation.page);
      return page ? { ...annotation, page } : dropMissing ? null : annotation;
    })
    .filter((annotation): annotation is PdfAnnotation => annotation !== null);
  const redactions = model.redactions
    .map((redaction): PdfRedaction | null => {
      const page = oldToNew.get(redaction.page);
      return page ? { ...redaction, page } : dropMissing ? null : redaction;
    })
    .filter((redaction): redaction is PdfRedaction => redaction !== null);
  const formFields = (model.formFields ?? [])
    .map((field): PdfFormField | null => {
      const page = oldToNew.get(field.page);
      return page ? { ...field, page } : dropMissing ? null : field;
    })
    .filter((field): field is PdfFormField => field !== null);
  return { ...model, numPages: pages.length, pages, annotations, redactions, formFields };
}

function shiftReferences(model: PdfDocumentModel, fromPage: number, delta: number): Pick<PdfDocumentModel, 'annotations' | 'redactions' | 'formFields'> {
  return {
    annotations: model.annotations.map((annotation) => ({ ...annotation, page: annotation.page >= fromPage ? annotation.page + delta : annotation.page })),
    redactions: model.redactions.map((redaction) => ({ ...redaction, page: redaction.page >= fromPage ? redaction.page + delta : redaction.page })),
    formFields: (model.formFields ?? []).map((field) => ({ ...field, page: field.page >= fromPage ? field.page + delta : field.page })),
  };
}

export function reorderPdfPage(model: PdfDocumentModel, sourcePage: number, targetPage: number): PdfDocumentModel {
  if (sourcePage === targetPage) return model;
  const current = [...model.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const sourceIndex = current.findIndex((page) => page.pageNumber === sourcePage);
  const targetIndex = current.findIndex((page) => page.pageNumber === targetPage);
  if (sourceIndex < 0 || targetIndex < 0) return model;
  const [moved] = current.splice(sourceIndex, 1);
  current.splice(targetIndex, 0, moved);
  const oldToNew = new Map<number, number>();
  const pages = current.map((page, index) => {
    oldToNew.set(page.pageNumber, index + 1);
    return { ...page, pageNumber: index + 1 };
  });
  return renumberModel(model, pages, oldToNew);
}

export function insertBlankPdfPage(model: PdfDocumentModel, atPage: number, title?: string): PdfDocumentModel {
  if (model.pages.length >= MAX_PAGE_COUNT) throw new Error('PDF page limit reached.');
  const insertAt = Math.max(1, Math.min(model.pages.length + 1, Math.trunc(atPage)));
  const shifted = shiftReferences(model, insertAt, 1);
  const blank: PdfPageModel = {
    pageNumber: insertAt,
    title: title?.trim().slice(0, 512) || `Page ${insertAt}`,
    sections: [],
    mediaBox: { ...DEFAULT_MEDIA_BOX },
  };
  const ordered = [...model.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const before = ordered.filter((page) => page.pageNumber < insertAt);
  const after = ordered
    .filter((page) => page.pageNumber >= insertAt)
    .map((page) => ({ ...page, pageNumber: page.pageNumber + 1 }));
  const pages = [...before, blank, ...after].map((page, index) => ({ ...page, pageNumber: index + 1 }));
  return { ...model, numPages: pages.length, pages, ...shifted };
}

export function deletePdfPage(model: PdfDocumentModel, pageNumber: number): PdfDocumentModel {
  if (model.pages.length <= 1) return model;
  const remaining = model.pages.filter((page) => page.pageNumber !== pageNumber).sort((a, b) => a.pageNumber - b.pageNumber);
  if (remaining.length === model.pages.length) return model;
  const oldToNew = new Map<number, number>();
  const pages = remaining.map((page, index) => {
    oldToNew.set(page.pageNumber, index + 1);
    return { ...page, pageNumber: index + 1 };
  });
  return renumberModel(model, pages, oldToNew);
}

export function duplicatePdfPage(model: PdfDocumentModel, pageNumber: number, now = Date.now()): PdfDocumentModel {
  if (model.pages.length >= MAX_PAGE_COUNT) throw new Error('PDF page limit reached.');
  const ordered = [...model.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const sourceIndex = ordered.findIndex((page) => page.pageNumber === pageNumber);
  if (sourceIndex < 0) return model;
  const source = ordered[sourceIndex];
  const duplicate: PdfPageModel = {
    ...source,
    pageNumber: pageNumber + 1,
    title: `${source.title} (Copy)`.slice(0, 512),
    sections: source.sections.map((section, index) => ({ ...section, id: `${section.id}-copy-${now}-${index}` })),
  };
  ordered.splice(sourceIndex + 1, 0, duplicate);
  const pages = ordered.map((page, index) => ({ ...page, pageNumber: index + 1 }));
  const shiftedAnnotations = model.annotations.map((annotation) => ({ ...annotation, page: annotation.page > pageNumber ? annotation.page + 1 : annotation.page }));
  const duplicatedAnnotations = model.annotations
    .filter((annotation) => annotation.page === pageNumber)
    .map((annotation, index) => ({ ...annotation, id: `${annotation.id}-copy-${now}-${index}`, page: pageNumber + 1, createdAt: now, modifiedAt: now }));
  const shiftedRedactions = model.redactions.map((redaction) => ({ ...redaction, page: redaction.page > pageNumber ? redaction.page + 1 : redaction.page }));
  const duplicatedRedactions = model.redactions
    .filter((redaction) => redaction.page === pageNumber)
    .map((redaction, index) => ({ ...redaction, id: `${redaction.id}-copy-${now}-${index}`, page: pageNumber + 1, timestamp: now }));
  const shiftedFormFields = (model.formFields ?? []).map((field) => ({ ...field, page: field.page > pageNumber ? field.page + 1 : field.page }));
  const duplicatedFormFields = (model.formFields ?? [])
    .filter((field) => field.page === pageNumber)
    .map((field, index) => ({
      ...field,
      id: `${field.id}-copy-${now}-${index}`,
      name: `${field.name}_copy_${now}_${index}`.slice(0, 128),
      page: pageNumber + 1,
    }));
  return {
    ...model,
    numPages: pages.length,
    pages,
    annotations: [...shiftedAnnotations, ...duplicatedAnnotations],
    redactions: [...shiftedRedactions, ...duplicatedRedactions],
    formFields: [...shiftedFormFields, ...duplicatedFormFields],
  };
}

export function rotatePdfPage(model: PdfDocumentModel, pageNumber: number, clockwise = true): PdfDocumentModel {
  const order: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber) return page;
      const current = page.rotation ?? 0;
      const index = order.indexOf(current);
      const next = clockwise ? order[(index + 1) % order.length] : order[(index + order.length - 1) % order.length];
      return { ...page, rotation: next };
    }),
  };
}

export function extractPdfPages(model: PdfDocumentModel, pageNumbers: readonly number[]): PdfDocumentModel {
  const wanted = new Set(pageNumbers.filter((page) => Number.isInteger(page) && page >= 1 && page <= model.pages.length));
  if (wanted.size === 0) throw new Error('No valid PDF pages selected for extraction.');
  assertFormSelectionClosed(model, wanted, 'Extraction');
  const selected = model.pages.filter((page) => wanted.has(page.pageNumber)).sort((a, b) => a.pageNumber - b.pageNumber);
  const oldToNew = new Map<number, number>();
  const pages = selected.map((page, index) => {
    oldToNew.set(page.pageNumber, index + 1);
    return { ...page, pageNumber: index + 1 };
  });
  return renumberModel(model, pages, oldToNew);
}


export interface PdfCrossDocumentTransferResult {
  source: PdfDocumentModel;
  target: PdfDocumentModel;
}

function assertStructuredTransferModel(model: PdfDocumentModel, label: string): void {
  if (model.rawPdfDataUrl) throw new Error(`${label} is a native/raw PDF; structured page transfer requires the standards parser.`);
  if (model.pages.length < 1 || model.pages.length > MAX_PAGE_COUNT) throw new Error(`${label} page count is outside the structured page-operation policy.`);
}

function normalizedPageSelection(model: PdfDocumentModel, pageNumbers: readonly number[], label: string): number[] {
  const available = new Set(model.pages.map((page) => page.pageNumber));
  const selected = [...new Set(pageNumbers.map((page) => Math.trunc(page)).filter((page) => available.has(page)))].sort((a, b) => a - b);
  if (!selected.length) throw new Error(`No valid ${label} pages selected.`);
  return selected;
}

function assertFormSelectionClosed(model: PdfDocumentModel, pageNumbers: ReadonlySet<number>, label: string): void {
  const allFields = model.formFields ?? [];
  if (!allFields.length) return;
  const keptFields = allFields.filter((field) => pageNumbers.has(field.page));
  const keptNames = new Set(keptFields.map((field) => field.name.toLocaleLowerCase('en-US')));
  for (const field of keptFields) {
    for (const dependency of field.calculation?.sourceFieldNames ?? []) {
      if (!keptNames.has(dependency.toLocaleLowerCase('en-US'))) {
        throw new Error(`${label} would leave form calculation ${field.name} with an unavailable dependency.`);
      }
    }
  }
}

function transferNamespace(value: string): string {
  const clean = value.normalize('NFKC').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return clean || 'transfer';
}

interface ClonedPageBundle {
  pages: PdfPageModel[];
  annotations: PdfAnnotation[];
  redactions: PdfRedaction[];
  formFields: PdfFormField[];
}

function cloneSelectedPages(
  source: PdfDocumentModel,
  sourcePageNumbers: readonly number[],
  destinationPageNumbers: readonly number[],
  namespace: string,
  reservedFormNames: ReadonlySet<string>,
): ClonedPageBundle {
  if (sourcePageNumbers.length !== destinationPageNumbers.length) throw new Error('Source/destination page mapping length mismatch.');
  const ns = transferNamespace(namespace);
  const pageMap = new Map<number, number>();
  sourcePageNumbers.forEach((page, index) => pageMap.set(page, destinationPageNumbers[index]));
  const sourcePages = new Map(source.pages.map((page) => [page.pageNumber, page]));
  const sectionMap = new Map<string, string>();
  const pages = sourcePageNumbers.map((sourcePageNumber, pageIndex): PdfPageModel => {
    const page = sourcePages.get(sourcePageNumber);
    if (!page) throw new Error(`Source page ${sourcePageNumber} disappeared during transfer.`);
    const destinationPageNumber = destinationPageNumbers[pageIndex];
    return {
      ...page,
      pageNumber: destinationPageNumber,
      sections: page.sections.map((section, sectionIndex) => {
        const id = `${ns}-p${destinationPageNumber}-s${sectionIndex}-${section.id}`.slice(0, 220);
        sectionMap.set(`${sourcePageNumber}:${section.id}`, id);
        return { ...section, id };
      }),
    };
  });

  const annotations = source.annotations
    .filter((annotation) => pageMap.has(annotation.page))
    .map((annotation, index): PdfAnnotation => ({
      ...annotation,
      id: `${ns}-annotation-${index}-${annotation.id}`.slice(0, 220),
      page: pageMap.get(annotation.page)!,
      sectionId: annotation.sectionId ? sectionMap.get(`${annotation.page}:${annotation.sectionId}`) : undefined,
      replies: annotation.replies?.map((reply, replyIndex) => ({ ...reply, id: `${ns}-reply-${index}-${replyIndex}-${reply.id}`.slice(0, 220) })),
    }));
  const redactions = source.redactions
    .filter((redaction) => pageMap.has(redaction.page))
    .map((redaction, index): PdfRedaction => ({
      ...redaction,
      id: `${ns}-redaction-${index}-${redaction.id}`.slice(0, 220),
      page: pageMap.get(redaction.page)!,
    }));

  const selectedFields = (source.formFields ?? []).filter((field) => pageMap.has(field.page));
  assertFormSelectionClosed(source, new Set(sourcePageNumbers), 'Page transfer');
  const names = new Set([...reservedFormNames].map((name) => name.toLocaleLowerCase('en-US')));
  const fieldNameMap = new Map<string, string>();
  for (const [index, field] of selectedFields.entries()) {
    const stem = `${field.name}_${ns}_${index}`.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 112) || `field_${index}`;
    let candidate = stem;
    let suffix = 1;
    while (names.has(candidate.toLocaleLowerCase('en-US'))) {
      candidate = `${stem.slice(0, 116)}_${suffix++}`.slice(0, 128);
    }
    names.add(candidate.toLocaleLowerCase('en-US'));
    fieldNameMap.set(field.name.toLocaleLowerCase('en-US'), candidate);
  }
  const formFields = selectedFields.map((field, index): PdfFormField => ({
    ...field,
    id: `${ns}-field-${index}-${field.id}`.slice(0, 220),
    name: fieldNameMap.get(field.name.toLocaleLowerCase('en-US'))!,
    page: pageMap.get(field.page)!,
    calculation: field.calculation ? {
      ...field.calculation,
      sourceFieldNames: field.calculation.sourceFieldNames.map((name) => fieldNameMap.get(name.toLocaleLowerCase('en-US')) ?? name),
    } : undefined,
  }));
  return { pages, annotations, redactions, formFields };
}

export function removePdfPages(model: PdfDocumentModel, pageNumbers: readonly number[]): PdfDocumentModel {
  assertStructuredTransferModel(model, 'Source document');
  const selected = new Set(normalizedPageSelection(model, pageNumbers, 'source'));
  if (selected.size >= model.pages.length) throw new Error('Move would remove every page from the source document.');
  const retainedPages = new Set(model.pages.filter((page) => !selected.has(page.pageNumber)).map((page) => page.pageNumber));
  assertFormSelectionClosed(model, retainedPages, 'Page removal');
  const remaining = model.pages.filter((page) => retainedPages.has(page.pageNumber)).sort((a, b) => a.pageNumber - b.pageNumber);
  const oldToNew = new Map<number, number>();
  const pages = remaining.map((page, index) => {
    oldToNew.set(page.pageNumber, index + 1);
    return { ...page, pageNumber: index + 1 };
  });
  return renumberModel(model, pages, oldToNew);
}

export function insertStructuredPdfPages(
  target: PdfDocumentModel,
  source: PdfDocumentModel,
  sourcePageNumbers: readonly number[],
  atPage: number,
  namespace = 'insert',
): PdfDocumentModel {
  assertStructuredTransferModel(target, 'Target document');
  assertStructuredTransferModel(source, 'Source document');
  const selected = normalizedPageSelection(source, sourcePageNumbers, 'source');
  if (target.pages.length + selected.length > MAX_PAGE_COUNT) throw new Error('Merged PDF would exceed the 10,000-page policy.');
  const insertAt = Math.max(1, Math.min(target.pages.length + 1, Math.trunc(atPage)));
  const shifted = shiftReferences(target, insertAt, selected.length);
  const destinationPages = selected.map((_, index) => insertAt + index);
  const reservedNames = new Set((target.formFields ?? []).map((field) => field.name));
  const imported = cloneSelectedPages(source, selected, destinationPages, namespace, reservedNames);
  const pages = [
    ...target.pages.filter((page) => page.pageNumber < insertAt),
    ...imported.pages,
    ...target.pages.filter((page) => page.pageNumber >= insertAt).map((page) => ({ ...page, pageNumber: page.pageNumber + selected.length })),
  ].sort((a, b) => a.pageNumber - b.pageNumber);
  return {
    ...target,
    numPages: pages.length,
    pages,
    annotations: [...shifted.annotations, ...imported.annotations],
    redactions: [...shifted.redactions, ...imported.redactions],
    formFields: [...(shifted.formFields ?? []), ...imported.formFields],
  };
}

export function mergeStructuredPdfModels(
  models: readonly PdfDocumentModel[],
  namespace = 'merge',
): PdfDocumentModel {
  if (models.length < 2) throw new Error('Merge requires at least two structured PDF documents.');
  let merged = models[0];
  assertStructuredTransferModel(merged, 'Merge base');
  for (let index = 1; index < models.length; index += 1) {
    const source = models[index];
    merged = insertStructuredPdfPages(merged, source, source.pages.map((page) => page.pageNumber), merged.pages.length + 1, `${namespace}-${index}`);
  }
  return merged;
}

export function replaceStructuredPdfPages(
  target: PdfDocumentModel,
  targetPageNumbers: readonly number[],
  source: PdfDocumentModel,
  sourcePageNumbers: readonly number[],
  namespace = 'replace',
): PdfDocumentModel {
  assertStructuredTransferModel(target, 'Target document');
  assertStructuredTransferModel(source, 'Source document');
  const targets = normalizedPageSelection(target, targetPageNumbers, 'target');
  const sources = normalizedPageSelection(source, sourcePageNumbers, 'source');
  if (targets.length !== sources.length) throw new Error('Replace requires the same number of target and source pages.');
  const targetSet = new Set(targets);
  const retainedTargetPages = new Set(target.pages.filter((page) => !targetSet.has(page.pageNumber)).map((page) => page.pageNumber));
  assertFormSelectionClosed(target, retainedTargetPages, 'Page replacement');
  const reservedNames = new Set((target.formFields ?? []).filter((field) => !targetSet.has(field.page)).map((field) => field.name));
  const imported = cloneSelectedPages(source, sources, targets, namespace, reservedNames);
  const importedByPage = new Map(imported.pages.map((page) => [page.pageNumber, page]));
  return {
    ...target,
    pages: target.pages.map((page) => importedByPage.get(page.pageNumber) ?? page),
    annotations: [...target.annotations.filter((annotation) => !targetSet.has(annotation.page)), ...imported.annotations],
    redactions: [...target.redactions.filter((redaction) => !targetSet.has(redaction.page)), ...imported.redactions],
    formFields: [...(target.formFields ?? []).filter((field) => !targetSet.has(field.page)), ...imported.formFields],
  };
}

export function transferStructuredPdfPages(
  source: PdfDocumentModel,
  target: PdfDocumentModel,
  sourcePageNumbers: readonly number[],
  atPage: number,
  mode: 'copy' | 'move',
  namespace = 'transfer',
): PdfCrossDocumentTransferResult {
  if (source === target) throw new Error('Cross-document page transfer requires distinct source and target models.');
  const selected = normalizedPageSelection(source, sourcePageNumbers, 'source');
  const nextTarget = insertStructuredPdfPages(target, source, selected, atPage, namespace);
  const nextSource = mode === 'move' ? removePdfPages(source, selected) : source;
  return { source: nextSource, target: nextTarget };
}

export function setPdfPageBoxes(
  model: PdfDocumentModel,
  pageNumbers: readonly number[],
  boxes: Partial<Pick<PdfPageModel, 'mediaBox' | 'cropBox' | 'trimBox' | 'bleedBox' | 'artBox'>>
): PdfDocumentModel {
  const selected = new Set(pageNumbers);
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (!selected.has(page.pageNumber)) return page;
      const mediaBox = boxes.mediaBox ? normalizeBox(boxes.mediaBox) : normalizeBox(page.mediaBox);
      const next = { ...page, mediaBox };
      for (const key of ['cropBox', 'trimBox', 'bleedBox', 'artBox'] as const) {
        const requested = boxes[key];
        if (requested) next[key] = normalizeBox(requested, mediaBox);
      }
      return next;
    }),
  };
}

export function setPdfPageLabel(model: PdfDocumentModel, pageNumbers: readonly number[], labels: readonly string[]): PdfDocumentModel {
  const mapping = new Map<number, string>();
  pageNumbers.forEach((page, index) => mapping.set(page, (labels[index] ?? '').replace(/\u0000/g, '').slice(0, 128)));
  return { ...model, pages: model.pages.map((page) => mapping.has(page.pageNumber) ? { ...page, pageLabel: mapping.get(page.pageNumber) || undefined } : page) };
}

export function applyPdfPageDecorations(
  model: PdfDocumentModel,
  pageNumbers: readonly number[],
  decorations: PdfPageDecorations
): PdfDocumentModel {
  const selected = new Set(pageNumbers);
  const clean = (value: string | undefined, max: number) => value?.replace(/\u0000/g, '').slice(0, max).trim() || undefined;
  const safeColor = decorations.backgroundColor && /^#[0-9a-fA-F]{6}$/.test(decorations.backgroundColor) ? decorations.backgroundColor : undefined;
  return {
    ...model,
    pages: model.pages.map((page) => selected.has(page.pageNumber) ? {
      ...page,
      decorations: {
        ...page.decorations,
        headerText: clean(decorations.headerText, 512),
        footerText: clean(decorations.footerText, 512),
        batesLabel: clean(decorations.batesLabel, 128),
        watermarkText: clean(decorations.watermarkText, 512),
        backgroundColor: safeColor,
      },
    } : page),
  };
}
