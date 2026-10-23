// STATUS: PLATIN — Present's bounded Office import wrapper and its round-trip fidelity proof.
//
// Paket 23 "PPTX-Datei importieren", Paket 24 "PPTX exportieren und vergleichen", Paket 25
// "ODP Interoperabilität".
//
// The byte-level reading lives in `platform/interop/{pptx,odp}.ts` and is owned by another
// workstream. This module adds what Present itself owes:
//   * a bounded intake (size, emptiness, extension) before a hostile package reaches the parser,
//   * one honest, executable statement of what a round trip does and does not preserve,
//   * an in-process round trip (`exportPresentDeck` -> `importPresentDeckBytes`) whose result is
//     compared field by field with a hand-written field list, so "round trip fidelity" is a
//     measurement and not a comment.

import type { PresentDocumentModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { importOdp, exportOdp } from '../../../../platform/interop/odp';
import { importPptx, exportPptx } from '../../../../platform/interop/pptx';

export type PresentOfficeFormat = 'pptx' | 'odp';

export interface PresentOfficeFormatSpec {
  format: PresentOfficeFormat;
  extension: string;
  mimeType: string;
  maxBytes: number;
}

/** 64 MiB matches the per-entry zip bound of the platform readers. */
export const PRESENT_OFFICE_IMPORT_MAX_BYTES = 64 * 1024 * 1024;

export const PRESENT_OFFICE_FORMATS: readonly PresentOfficeFormatSpec[] = [
  {
    format: 'pptx',
    extension: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    maxBytes: PRESENT_OFFICE_IMPORT_MAX_BYTES,
  },
  {
    format: 'odp',
    extension: 'odp',
    mimeType: 'application/vnd.oasis.opendocument.presentation',
    maxBytes: PRESENT_OFFICE_IMPORT_MAX_BYTES,
  },
];

export type PresentOfficeImportErrorCode =
  | 'unsupported-extension'
  | 'empty-file'
  | 'file-too-large'
  | 'invalid-name';

export class PresentOfficeImportError extends Error {
  readonly code: PresentOfficeImportErrorCode;
  constructor(code: PresentOfficeImportErrorCode, message: string) {
    super(message);
    this.name = 'PresentOfficeImportError';
    this.code = code;
  }
}

/** Resolves the office format from a file name, or `null` for anything Present does not open. */
export function presentOfficeFormatFromFileName(fileName: string): PresentOfficeFormat | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(fileName ?? '').trim());
  if (!match) return null;
  const extension = match[1].toLowerCase();
  return PRESENT_OFFICE_FORMATS.find((spec) => spec.extension === extension)?.format ?? null;
}

/**
 * Fail-closed intake bounds. Rejects rather than truncating, so a hostile or oversized package
 * never reaches the XML parser and never silently produces a partial deck.
 */
export function assertPresentOfficeImportBounds(bytes: Uint8Array, fileName: string): PresentOfficeFormatSpec {
  const name = String(fileName ?? '').trim();
  if (!name || name.length > 260) throw new PresentOfficeImportError('invalid-name', 'The file name is not usable.');
  const format = presentOfficeFormatFromFileName(name);
  if (!format) {
    throw new PresentOfficeImportError('unsupported-extension', 'Present opens .pptx and .odp packages only.');
  }
  const spec = PRESENT_OFFICE_FORMATS.find((candidate) => candidate.format === format) as PresentOfficeFormatSpec;
  if (!bytes || bytes.byteLength === 0) {
    throw new PresentOfficeImportError('empty-file', 'The selected file is empty.');
  }
  if (bytes.byteLength > spec.maxBytes) {
    throw new PresentOfficeImportError(
      'file-too-large',
      `The selected file is ${Math.round(bytes.byteLength / (1024 * 1024))} MiB; the limit is ${Math.round(spec.maxBytes / (1024 * 1024))} MiB.`,
    );
  }
  return spec;
}

export interface PresentOfficeImportResult {
  document: WorkspaceDocument;
  model: PresentDocumentModel;
  format: PresentOfficeFormat;
  bytes: number;
}

/** Bounded import through the canonical platform readers. Never truncates silently. */
export async function importPresentDeckBytes(bytes: Uint8Array, fileName: string): Promise<PresentOfficeImportResult> {
  const spec = assertPresentOfficeImportBounds(bytes, fileName);
  const document = spec.format === 'pptx' ? await importPptx(bytes, fileName) : await importOdp(bytes, fileName);
  const model = document.presentData;
  if (!model || !model.slides?.length) {
    throw new PresentOfficeImportError('empty-file', 'The package contains no readable slides.');
  }
  return { document, model, format: spec.format, bytes: bytes.byteLength };
}

/** Export through the canonical writers, bounded to the same slide ceiling as the readers. */
export function exportPresentDeck(document: WorkspaceDocument, format: PresentOfficeFormat): Uint8Array {
  if (document.kind !== 'Present') throw new Error('Present export requires a Present document.');
  const slides = document.presentData?.slides ?? [];
  if (!slides.length) throw new Error('Presentation contains no slides.');
  if (slides.length > PRESENT_OFFICE_MAX_SLIDES) {
    throw new Error(`Presentation has ${slides.length} slides; the interoperable limit is ${PRESENT_OFFICE_MAX_SLIDES}.`);
  }
  return format === 'pptx' ? exportPptx(document) : exportOdp(document);
}

/** Slide ceiling of both platform readers and of `isValidPresentInteropModel`. */
export const PRESENT_OFFICE_MAX_SLIDES = 512;

export interface PresentFidelityFieldResult {
  field: string;
  status: 'preserved' | 'lost' | 'changed';
  detail?: string;
}

export interface PresentFidelityComparison {
  fields: PresentFidelityFieldResult[];
  preservedFields: string[];
  lostFields: string[];
  changedFields: string[];
  slideCountBefore: number;
  slideCountAfter: number;
  identical: boolean;
}

const stable = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '"<unserialisable>"';
  }
};

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.length === 0;
  return false;
}

function classify(before: unknown, after: unknown): 'preserved' | 'lost' | 'changed' {
  if (isEmptyValue(before) && isEmptyValue(after)) return 'preserved';
  if (stable(before) === stable(after)) return 'preserved';
  if (isEmptyValue(after)) return 'lost';
  return 'changed';
}

/**
 * Per-field classification across all slides. A field is `lost` only when *every* slide value
 * became empty - that is the honest statement for "scene objects did not survive", while a single
 * slide that still carries something makes the field `changed`.
 */
function classifySeries(before: readonly unknown[], after: readonly unknown[]): 'preserved' | 'lost' | 'changed' {
  if (stable(before) === stable(after)) return 'preserved';
  const beforeAllEmpty = before.length === 0 || before.every(isEmptyValue);
  const afterAllEmpty = after.length === 0 || after.every(isEmptyValue);
  if (beforeAllEmpty && afterAllEmpty) return 'preserved';
  if (afterAllEmpty) return 'lost';
  return 'changed';
}

/**
 * Hand-written fidelity oracle. The field list is written from the Present contract
 * (`workspacePresentDocument.ts`), not derived from the exporter, so a new exporter bug cannot
 * make the oracle agree with it.
 */
export function comparePresentDeckFidelity(
  before: PresentDocumentModel,
  after: PresentDocumentModel,
): PresentFidelityComparison {
  const fields: PresentFidelityFieldResult[] = [];
  const push = (field: string, status: 'preserved' | 'lost' | 'changed', detail?: string) => {
    fields.push(detail ? { field, status, detail } : { field, status });
  };

  push('themeId', classify(before.themeId, after.themeId));
  push('aspectRatio', classify(before.aspectRatio, after.aspectRatio));
  push('sections', classify(before.sections, after.sections));
  push('customShows', classify(before.customShows, after.customShows));
  push('masters', classify(before.masters, after.masters));
  push('notesMaster', classify(before.notesMaster, after.notesMaster));
  push('handoutMaster', classify(before.handoutMaster, after.handoutMaster));
  push('packagedFonts', classify(before.packagedFonts, after.packagedFonts));

  const beforeSlides = before.slides ?? [];
  const afterSlides = after.slides ?? [];
  push(
    'slideCount',
    beforeSlides.length === afterSlides.length ? 'preserved' : afterSlides.length === 0 ? 'lost' : 'changed',
    `${beforeSlides.length} -> ${afterSlides.length}`,
  );
  push('slideOrder', classify(beforeSlides.map((slide) => slide.id), afterSlides.map((slide) => slide.id)));

  const pairs = Math.min(beforeSlides.length, afterSlides.length);
  const perSlideFields: Array<[string, (slide: (typeof beforeSlides)[number]) => unknown]> = [
    ['title', (slide) => slide.title],
    ['subtitle', (slide) => slide.subtitle],
    ['layout', (slide) => slide.layout],
    ['bulletPoints', (slide) => slide.bulletPoints],
    ['cards', (slide) => slide.cards],
    ['speakerNotes', (slide) => slide.speakerNotes],
    ['backgroundColor', (slide) => slide.backgroundColor],
    ['backgroundGradient', (slide) => slide.backgroundGradient],
    ['masterId', (slide) => slide.masterId],
    ['transition', (slide) => slide.transition],
    ['hidden', (slide) => slide.hidden],
    ['timingSeconds', (slide) => slide.timingSeconds],
    ['sceneObjects', (slide) => slide.sceneObjects],
    ['images', (slide) => slide.images],
    ['animations', (slide) => slide.animations],
    ['comments', (slide) => slide.comments],
    ['presenterInk', (slide) => slide.presenterInk],
    ['audioMedia', (slide) => slide.audioMedia],
    ['videoMedia', (slide) => slide.videoMedia],
    ['recording', (slide) => slide.recording],
  ];

  for (const [name, read] of perSlideFields) {
    const beforeValues = beforeSlides.slice(0, pairs).map(read);
    const afterValues = afterSlides.slice(0, pairs).map(read);
    const status = classifySeries(beforeValues, afterValues);
    push(`slides[].${name}`, status, status === 'preserved' ? undefined : `${pairs} slide(s) compared`);
  }

  // Media bytes are compared by size, not by content, so a 4 MiB image does not blow up the report.
  push(
    'mediaBytes',
    classify(
      beforeSlides.map((slide) => (slide.images ?? []).reduce((total, image) => total + (image.dataUrl?.length ?? 0), 0)),
      afterSlides.map((slide) => (slide.images ?? []).reduce((total, image) => total + (image.dataUrl?.length ?? 0), 0)),
    ),
  );
  push('preservedParts', classify(before.interopPreservedParts, after.interopPreservedParts));

  const preservedFields = fields.filter((field) => field.status === 'preserved').map((field) => field.field);
  const lostFields = fields.filter((field) => field.status === 'lost').map((field) => field.field);
  const changedFields = fields.filter((field) => field.status === 'changed').map((field) => field.field);
  return {
    fields,
    preservedFields,
    lostFields,
    changedFields,
    slideCountBefore: beforeSlides.length,
    slideCountAfter: afterSlides.length,
    identical: lostFields.length === 0 && changedFields.length === 0,
  };
}

/**
 * Export -> import in-process and compare. This is the strongest round-trip evidence available
 * without PowerPoint/LibreOffice, and it is exactly what the export centre shows the user.
 */
export async function verifyPresentRoundTrip(
  document: WorkspaceDocument,
  format: PresentOfficeFormat = 'pptx',
): Promise<{ comparison: PresentFidelityComparison; bytes: number }> {
  const bytes = exportPresentDeck(document, format);
  const imported = await importPresentDeckBytes(bytes, `roundtrip.${format}`);
  return { comparison: comparePresentDeckFidelity(document.presentData as PresentDocumentModel, imported.model), bytes: bytes.byteLength };
}

/**
 * The honest statement of what is and is not preserved. Rendered verbatim in the export centre and
 * quoted by the evidence notes; never softened, never claimed as verified.
 */
export const PRESENT_OFFICE_FIDELITY_LIMITS: readonly string[] = [
  'PPTX: the canonical part ppt/vgt-present.xml carries the whole Present model, so a VGT->VGT export/import preserves every field listed by comparePresentDeckFidelity.',
  'ODP: the canonical part vgt/present.json carries the whole Present model, with the same guarantee.',
  'Foreign PPTX read through the text fallback maps only slide title, subtitle and bullets. Speaker notes (ppt/notesSlides/*), images, embedded media, SmartArt, master/layout geometry and theme colours are NOT mapped.',
  'exportPptx writes one title shape and one body text shape per slide plus an empty master, one blank layout and one theme. Scene objects (shapes, tables, charts, widgets, code, cross-workspace references), images, animations and transitions are NOT written as native DrawingML and are therefore invisible in PowerPoint/LibreOffice.',
  'A deck with more than 512 slides cannot round trip: the OOXML slide parts and the canonical part importer both stop at 512, so Present refuses the export instead of truncating.',
  'Measured asymmetry: an ODP round trip re-collects the package metadata part (meta.xml) into interopPreservedParts, so the imported model reports preservedParts as changed even though no Present content is lost. The PPTX round trip has no such asymmetry.',
  'Rendering the exported file in Microsoft PowerPoint or LibreOffice Impress and comparing the visual result is NOT TESTED in this environment.',
];
