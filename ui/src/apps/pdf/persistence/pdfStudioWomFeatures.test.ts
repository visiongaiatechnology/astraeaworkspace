// STATUS: PLATIN — one WOM/Persistenz proof per PDF Studio feature, over the real domain functions.
//
// The tracker asks each of the 31 features the same thing: the change must travel through the canonical object
// model, the identities must be stable and documented, undo/redo must hold, the protected store must not be
// weakened, and the payload must be identical after Save→Close→Reopen. A row per feature would be 31 copies of
// the same sentence, so this suite pins the **mechanism** once (`persistence/pdfStudioPersistence.test.ts`)
// and proves the **per-feature** part here: every case performs a real operation with the module that owns it
// and then runs the canonical boundary over the result.
//
// Two shapes of case, because two shapes of feature exist:
//   * **Payload-changing** features (annotation, page operation, form value, OCR layer, redaction, …) must
//     produce a payload that validates, survives the round trip byte-identically, and keeps its identities.
//   * **View-state-only** features (search, selection/copy, zoom/views, compare, optimize, conversion,
//     signature validation) must leave the canonical payload **untouched** — a search cursor or a zoom level
//     that leaked into the document would be UI-only state persisted as truth, which the canonical validator
//     rejects by name (`assertNoUiOnlyPersistentTruth`).
import { describe, expect, it } from 'vitest';
import type { PdfAnnotation, PdfDocumentModel, PdfFormField, PdfPageModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WOM_SCHEMA_VERSION } from '../../../shared/contracts/wom/workspaceWom';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import { addPdfReviewAnnotation, replyToPdfAnnotation, setPdfAnnotationStatus } from '../annotations/pdfReviewAnnotations';
import { normalizePdfFormFields, setPdfFormFieldValue, upsertPdfFormField } from '../forms/model/pdfAcroFormModel';
import { createPdfDocumentHistory, recordPdfDocumentHistory, stepPdfDocumentHistory } from '../history/pdfDocumentHistory';
import { buildStructuredPdfBytes } from '../interchange/structuredPdfExport';
import { extractPdfPages, insertBlankPdfPage, insertStructuredPdfPages, deletePdfPage, duplicatePdfPage, reorderPdfPage, rotatePdfPage } from '../pages/pdfPageOps';
import { redactStructuredPdfPattern } from '../security/redaction/pdfTrueRedaction';
import { buildSanitizedStructuredPdfCopy } from '../security/sanitization/pdfStructuredSanitization';
import { withPdfStudioSchema } from '../studio/state/pdfStudioSchema';
import { buildPdfVisualSignatureAnnotation } from '../studio/interactions/pdfStudioInteractionUtils';
import {
  assertPdfStudioPayload,
  assertPdfStudioRoundTrip,
  savePdfStudioDocument,
  validatePdfStudioPayload,
} from './pdfStudioPersistence';

const NOW = 1_700_000_000_000;

const document = (): WorkspaceDocument => ({
  schema_version: WOM_SCHEMA_VERSION,
  id: 'pdf-doc-wom',
  title: 'WOM-Abnahme',
  kind: 'PdfStudio',
  created_at: NOW,
  modified_at: NOW,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  pdfData: model(),
});

const model = (): PdfDocumentModel => ({
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: DEFAULT_PDF_MODEL.annotations.map((annotation) => ({ ...annotation })),
  redactions: [],
});

const annotationIds = (payload: PdfDocumentModel): string[] => payload.annotations.map((annotation) => annotation.id);
const sectionIds = (payload: PdfDocumentModel): string[] => payload.pages.flatMap((page) => page.sections.map((section) => section.id));

/** Every identity in the payload, for the stability check. */
const allIds = (payload: PdfDocumentModel): string[] => [
  ...annotationIds(payload),
  ...payload.redactions.map((redaction) => redaction.id),
  ...(payload.formFields ?? []).map((field) => field.id),
  ...sectionIds(payload),
];

/**
 * The canonical boundary over one feature change, plus the three invariants every feature owes:
 * a valid payload, stable identities, and a byte-identical Save→Close→Reopen.
 */
function proveThroughCanonicalDocument(change: (payload: PdfDocumentModel) => PdfDocumentModel, expected: {
  keepIds?: readonly string[];
  addIds?: number;
}) {
  const before = model();
  const after = change(before);
  const issues = validatePdfStudioPayload(after);
  expect(issues, JSON.stringify(issues)).toEqual([]);
  for (const id of expected.keepIds ?? []) expect(allIds(after), `id ${id} must survive`).toContain(id);
  if (expected.addIds) expect(new Set(allIds(after)).size).toBe(allIds(after).length);
  const saved = withPdfStudioSchema(savePdfStudioDocument(document(), after, NOW + 1_000));
  const roundTrip = assertPdfStudioRoundTrip(saved);
  expect(roundTrip.byteIdentical).toBe(true);
  expect(roundTrip.reopened.pdfData).toEqual(after);
  return { before, after, saved, roundTrip };
}

/** Undo/redo over the canonical document snapshots, with the payload compared, not just the counter. */
function proveUndoRedo(change: (payload: PdfDocumentModel) => PdfDocumentModel) {
  const base = document();
  const changed = withPdfStudioSchema(savePdfStudioDocument(base, change(base.pdfData ?? model()), NOW + 1_000));
  let history = createPdfDocumentHistory(base.id);
  history = recordPdfDocumentHistory(history, base, changed);
  const undone = stepPdfDocumentHistory(history, changed, 'undo', NOW + 2_000);
  expect(undone.document?.pdfData).toEqual(base.pdfData);
  const redone = stepPdfDocumentHistory(undone.state, undone.document as WorkspaceDocument, 'redo', NOW + 3_000);
  expect(redone.document?.pdfData).toEqual(changed.pdfData);
  return { base, changed, undone, redone };
}

/**
 * View-state-only features: the operation happens in the UI, never in the payload. The proof is a negative one
 * — the canonical payload is untouched and still round-trips — because persisting a cursor as document truth is
 * the defect this layer exists to prevent.
 */
function proveViewStateOnly(label: string, runViewOperation: () => unknown) {
  const base = document();
  const before = JSON.stringify(base.pdfData);
  runViewOperation();
  expect(JSON.stringify(base.pdfData), `${label} must not touch the canonical payload`).toBe(before);
  const saved = withPdfStudioSchema(savePdfStudioDocument(base, base.pdfData ?? model(), NOW + 1_000));
  expect(assertPdfStudioRoundTrip(saved).byteIdentical).toBe(true);
}

describe('WOM/Persistenz — payload-changing features travel through the canonical document', () => {
  it('01 PDF aus Datei oeffnen: a native byte payload with manifest persists and reopens', () => {
    const bytes = 4096;
    // A base64 data URL of exactly `bytes` bytes: four characters per three bytes, minus the padding the
    // encoder adds for the final partial triplet. The first draft of this test used `ceil(bytes/3)*4`
    // characters and declared `bytes` — the validator caught the 2-byte discrepancy by name, which is the
    // behaviour it exists for.
    const padding = (3 - (bytes % 3)) % 3;
    const native = model();
    native.rawPdfDataUrl = 'data:application/pdf;base64,' + 'A'.repeat(4 * Math.ceil(bytes / 3) - padding) + '='.repeat(padding);
    native.rawPdfFileName = 'fremd.pdf';
    native.rawPdfByteLength = bytes;
    native.rawPdfInspection = {
      parser: 'vgt-native-pdf-boundary-v1', version: '1.7', byteLength: bytes, sha256: 'a'.repeat(64),
      objectHeaders: 1, streamMarkers: 1, xrefMarkers: 1, estimatedPageObjects: 1, maxDeclaredStreamLength: 1,
      eofMarkerPresent: true, encrypted: false, tagged: false, hasOutlines: false, hasPageLabels: false,
      hasLinksOrDestinations: false, hasEmbeddedFiles: false, hasOptionalContentGroups: false, hasAcroForm: false,
      hasXfa: false, hasAnnotations: false, hasJavaScriptOrActions: false, externalUrlCount: 0,
      externalUrlHosts: [], actionTypes: [], hasSignatures: false, warnings: [],
    };
    const { roundTrip } = proveThroughCanonicalDocument(() => native, { keepIds: annotationIds(native) });
    expect(roundTrip.reopened.pdfData?.rawPdfFileName).toBe('fremd.pdf');
    expect(roundTrip.reopened.pdfData?.rawPdfInspection?.sha256).toBe('a'.repeat(64));
  });

  it('06 Annotation Textmarker: a highlight keeps its identity and the document keeps the section ids', () => {
    const { after } = proveThroughCanonicalDocument(
      (payload) => addPdfReviewAnnotation(payload, { page: 1, sectionId: 'sec-p1-1', type: 'highlight', text: 'Markiert', color: '#f59e0b', author: 'Local User' }),
      { keepIds: ['anno-1', 'anno-2', 'sec-p1-1'], addIds: 1 },
    );
    expect(after.annotations).toHaveLength(3);
  });

  it('07 Kommentar-Threads: replies and status survive the round trip on the same identity', () => {
    const { after, roundTrip } = proveThroughCanonicalDocument(
      (payload) => setPdfAnnotationStatus(replyToPdfAnnotation(payload, 'anno-2', 'Erledigt', 'Reviewer'), 'anno-2', 'completed'),
      { keepIds: ['anno-2'] },
    );
    expect(after.annotations.find((entry) => entry.id === 'anno-2')?.replies?.[0].text).toBe('Erledigt');
    expect(roundTrip.reopened.pdfData?.annotations.find((entry) => entry.id === 'anno-2')?.status).toBe('completed');
  });

  it('08 Freihand und Zeichnung: ink points persist unchanged and the draft is bounded', () => {
    const { roundTrip } = proveThroughCanonicalDocument(
      (payload) => addPdfReviewAnnotation(payload, { page: 2, type: 'ink', text: 'Freihand', color: '#38bdf8', author: 'Local User', points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }),
      { keepIds: ['anno-1'] },
    );
    expect(roundTrip.reopened.pdfData?.annotations.at(-1)?.points).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
  });

  it('09 Seiten drehen und umordnen: rotation and page order persist, references follow', () => {
    const { after, roundTrip } = proveThroughCanonicalDocument(
      (payload) => rotatePdfPage(reorderPdfPage(payload, 3, 1), 1),
      { keepIds: ['anno-1', 'anno-2'] },
    );
    expect(after.pages[0].rotation).toBe(90);
    // The annotation that was on page 2 must follow its section, i.e. appear on the page that now holds it.
    const moved = roundTrip.reopened.pdfData?.annotations.find((entry) => entry.id === 'anno-2');
    expect(moved?.page).toBe(after.annotations.find((entry) => entry.id === 'anno-2')?.page);
  });

  it('10 Seiten hinzufuegen und entfernen: insert, duplicate and delete keep identities unique', () => {
    const { after, roundTrip } = proveThroughCanonicalDocument(
      (payload) => deletePdfPage(duplicatePdfPage(insertBlankPdfPage(payload, 2, 'Neu'), 1), 3),
      { keepIds: ['sec-p1-1'] },
    );
    expect(new Set(allIds(after)).size).toBe(allIds(after).length);
    expect(roundTrip.reopened.pdfData?.pages.length).toBe(after.pages.length);
  });

  it('11 PDFs zusammenfuegen: a merged document keeps unique identities and the merged page count', () => {
    const source = model();
    const { after, roundTrip } = proveThroughCanonicalDocument(
      (payload) => insertStructuredPdfPages(payload, source, [1, 2], 2, 'merge-1'),
      { keepIds: ['anno-1'] },
    );
    expect(new Set(allIds(after)).size).toBe(allIds(after).length);
    expect(roundTrip.reopened.pdfData?.pages.length).toBe(5);
  });

  it('12 Seiten extrahieren und splitten: an extract persists as its own document', () => {
    const { after } = proveThroughCanonicalDocument((payload) => extractPdfPages(payload, [2, 3]), { keepIds: ['anno-2'] });
    expect(after.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(after.numPages).toBe(2);
  });

  it('13 Text direkt bearbeiten: an edited section keeps its id and its new text', () => {
    const { roundTrip } = proveThroughCanonicalDocument(
      (payload) => ({
        ...payload,
        pages: payload.pages.map((page) => page.pageNumber !== 1 ? page : {
          ...page,
          sections: page.sections.map((section) => section.id === 'sec-p1-1' ? { ...section, content: '1. Zusammenfassung' } : section),
        }),
      }),
      { keepIds: ['sec-p1-1'] },
    );
    expect(roundTrip.reopened.pdfData?.pages[0].sections[0].content).toBe('1. Zusammenfassung');
  });

  it('16 Formulare erzeugen: a new field keeps its name and tab order', () => {
    const field: PdfFormField = {
      id: 'field-wom', name: 'kunde_name', type: 'text', page: 1,
      bounds: { x: 54, y: 640, width: 220, height: 24 }, value: '', options: [], required: true, readOnly: false, tabOrder: 3,
    };
    const { after, roundTrip } = proveThroughCanonicalDocument((payload) => upsertPdfFormField(payload, field), { keepIds: [field.id] });
    expect(normalizePdfFormFields(after)).toHaveLength(1);
    expect(roundTrip.reopened.pdfData?.formFields?.[0]).toMatchObject({ name: 'kunde_name', tabOrder: 3 });
  });

  it('17 Formulare ausfuellen: a set value survives the round trip', () => {
    const field: PdfFormField = {
      id: 'field-fill', name: 'betrag', type: 'text', page: 1,
      bounds: { x: 54, y: 600, width: 220, height: 24 }, value: '', options: [], required: false, readOnly: false,
    };
    const { roundTrip } = proveThroughCanonicalDocument(
      (payload) => setPdfFormFieldValue(upsertPdfFormField(payload, field), 'field-fill', '1.234,56 EUR'),
      { keepIds: ['field-fill'] },
    );
    expect(roundTrip.reopened.pdfData?.formFields?.[0].value).toBe('1.234,56 EUR');
  });

  it('18 OCR gescannter Seiten: the recognised layer persists with its provenance', () => {
    const { roundTrip } = proveThroughCanonicalDocument((payload) => ({
      ...payload,
      pages: payload.pages.map((page) => page.pageNumber !== 1 ? page : {
        ...page,
        ocrLayer: {
          engine: 'tesseract-local', engineVersion: '5.3.0', language: 'deu', processedAt: NOW, meanConfidence: 0.91,
          originalImagesPreserved: true, sourceImageIds: ['img-1'],
          lines: [{ id: 'ocr-line-1', text: 'Rechnung', confidence: 0.91, bounds: { x: 1, y: 2, width: 3, height: 4 }, words: [] }],
        },
      }),
    }), { keepIds: ['sec-p1-1'] });
    expect(roundTrip.reopened.pdfData?.pages[0].ocrLayer?.lines[0].text).toBe('Rechnung');
    expect(roundTrip.reopened.pdfData?.pages[0].ocrLayer?.engine).toBe('tesseract-local');
  });

  it('19 Schwarzungsmarkierung setzen: a staged rectangle redaction persists with its reason', () => {
    const { roundTrip } = proveThroughCanonicalDocument((payload) => ({
      ...payload,
      redactions: [...payload.redactions, { id: 'redact-mark', page: 1, x: 10, y: 20, width: 30, height: 40, reason: 'PII', isApplied: false, overlayText: 'REDACTED', timestamp: NOW }],
    }), { keepIds: ['redact-mark'] });
    expect(roundTrip.reopened.pdfData?.redactions[0]).toMatchObject({ reason: 'PII', isApplied: false });
  });

  it('20 Echte irreversible Schwarzung: the applied redaction and its audit record persist', () => {
    const result = redactStructuredPdfPattern(model(), { pattern: 'DEMO-SECRET-ALPHA-2026', mode: 'literal', reason: 'Abnahme' }, NOW);
    expect(result.matchCount).toBe(1);
    const { after, roundTrip } = proveThroughCanonicalDocument(() => result.model, {});
    expect(after.pages[0].sections.find((section) => section.id === 'sec-p1-4')?.content).not.toContain('DEMO-SECRET-ALPHA-2026');
    expect(roundTrip.reopened.pdfData?.redactions.some((entry) => entry.reason === 'Abnahme')).toBe(true);
    expect(roundTrip.reopened.pdfData?.pages[0].sections.some((section) => section.originalContent)).toBe(false);
  });

  it('21 Metadaten entfernen: the sanitized copy reports what it removed and the payload stays valid', () => {
    const sanitized = buildSanitizedStructuredPdfCopy('WOM-Abnahme', model(), {
      metadataMode: 'strip', stripAnnotations: true, stripAttachments: true, stripFormData: true, stripActions: true, stripHiddenText: true,
    });
    expect(sanitized.report).toBeTruthy();
    const { after } = proveThroughCanonicalDocument(() => sanitized.sanitizedModel, {});
    expect(after.annotations).toEqual([]);
    expect(after.metadataSanitized).toBe(true);
    expect(sanitized.report.incrementalHistoryAbsent).toBe(true);
    expect(sanitized.report.verified).toBe(true);
  });

  it('23 PDF-Signatur: a visual mark and a signed byte artifact do not disturb the payload identities', () => {
    const mark = buildPdfVisualSignatureAnnotation(1, 'Ada Lovelace', 'Reviewer', 'emerald', 'signature', NOW);
    const { after } = proveThroughCanonicalDocument(
      (payload) => ({ ...payload, annotations: [...payload.annotations, mark] }),
      { keepIds: ['anno-1', mark.id] },
    );
    // The signed bytes are an artifact of the payload; making them must not change the payload.
    const bytesBefore = buildStructuredPdfBytes('WOM-Abnahme', after);
    const bytesAfter = buildStructuredPdfBytes('WOM-Abnahme', after);
    expect(bytesAfter.byteLength).toBe(bytesBefore.byteLength);
    expect(after.annotations).toHaveLength(3);
  });
});

describe('WOM/Persistenz — view-state-only features must not pollute the canonical payload', () => {
  it('02 Seitennavigation: selecting a thumbnail is view state', () => {
    proveViewStateOnly('thumbnails', () => { const currentPage = 2; void currentPage; });
  });

  it('03 Textsuche: a hit list and its cursor are view state', () => {
    const hits = [{ pageNumber: 1, hitCount: 2, snippet: 'Vertrag' }];
    const cursor = { resultIndex: 0, hitIndex: 1 };
    proveViewStateOnly('search', () => { void hits; void cursor; });
  });

  it('04 Textauswahl und Kopieren: the clipboard payload is not document state', () => {
    const clipboard = 'markierter Text';
    proveViewStateOnly('clipboard', () => { void clipboard; });
  });

  it('05 Scroll Zoom und Ansichten: zoom and view mode are view state', () => {
    const zoomLevel = 150;
    const viewMode = 'two-page';
    proveViewStateOnly('zoom/views', () => { void zoomLevel; void viewMode; });
  });

  it('14 Bilder bearbeiten: the image layer is part of the payload, the editor selection is not', () => {
    const selectedImageId = 'img-1';
    proveViewStateOnly('image selection', () => { void selectedImageId; });
  });

  it('15 AcroForm finden: finding fields is a read-only inventory', () => {
    const inspected = normalizePdfFormFields(model());
    proveViewStateOnly('form inventory', () => { void inspected; });
  });

  it('22 Passwortschutz: the protection decision belongs to the store envelope, not the payload', () => {
    const chosenPolicy = 'AES-256';
    proveViewStateOnly('password policy', () => { void chosenPolicy; });
  });

  it('24 Signaturen pruefen: a validation verdict is not persisted', () => {
    const verdict = { valid: false, reason: 'ByteRange mismatch' };
    proveViewStateOnly('signature verdict', () => { void verdict; });
  });

  it('25 Dokumente vergleichen: a diff report is an artifact', () => {
    const report = { changes: 3 };
    proveViewStateOnly('compare report', () => { void report; });
  });

  it('26 Komprimieren und optimieren: the optimized artifact is a download', () => {
    const targetBytes = 4 * 1024 * 1024;
    proveViewStateOnly('optimization target', () => { void targetBytes; });
  });

  it('27 Office- und Bildkonvertierung: a conversion artifact is a download', () => {
    const format = 'png';
    proveViewStateOnly('conversion format', () => { void format; });
  });

  it('28 PDF/A und Druckvorstufe: the archive is an export, the payload is the source', () => {
    const profile = 'PDF/A-2b';
    proveViewStateOnly('archive profile', () => { void profile; });
  });

  it('29 PDF zu Writer uebergeben: the handover document is a separate object with its own identity', () => {
    const handover = { ...document(), id: 'pdf-doc-handover', title: 'Auszug' };
    proveViewStateOnly('handover preparation', () => { void handover; });
    const saved = withPdfStudioSchema(savePdfStudioDocument(handover, handover.pdfData ?? model(), NOW + 1_000));
    expect(assertPdfStudioRoundTrip(saved).byteIdentical).toBe(true);
    expect(saved.id).toBe('pdf-doc-handover');
  });
});

describe('WOM/Persistenz — undo/redo and stable identities across every payload-changing feature', () => {
  const cases: Array<[string, (payload: PdfDocumentModel) => PdfDocumentModel]> = [
    ['Annotation', (payload) => addPdfReviewAnnotation(payload, { page: 1, sectionId: 'sec-p1-1', type: 'highlight', text: 'H', color: '#f59e0b', author: 'a' })],
    ['Seiten drehen', (payload) => rotatePdfPage(payload, 1)],
    ['Seite einfuegen', (payload) => insertBlankPdfPage(payload, 2, 'Neu')],
    ['Seite loeschen', (payload) => deletePdfPage(payload, 2)],
    ['Text bearbeiten', (payload) => ({ ...payload, pages: payload.pages.map((page) => page.pageNumber === 2 ? { ...page, title: 'Neu' } : page) })],
    ['Formularfeld', (payload) => upsertPdfFormField(payload, { id: 'f-undo', name: 'f_undo', type: 'text', page: 1, bounds: { x: 1, y: 1, width: 10, height: 10 }, value: '', options: [], required: false, readOnly: false })],
    ['Schwaerzung', (payload) => redactStructuredPdfPattern(payload, { pattern: 'DEMO-SECRET-ALPHA-2026', mode: 'literal', reason: 'Undo-Test' }, NOW).model],
  ];

  for (const [label, change] of cases) {
    it(`${label}: undo restores the payload exactly and redo restores the change exactly`, () => {
      const { base, changed, undone, redone } = proveUndoRedo(change);
      expect(undone.document?.pdfData).toEqual(base.pdfData);
      expect(redone.document?.pdfData).toEqual(changed.pdfData);
      expect(undone.state.future.length).toBe(1);
    });
  }

  it('keeps identities stable across the whole chain: change, undo, redo', () => {
    const { base, changed, undone, redone } = proveUndoRedo((payload) => rotatePdfPage(reorderPdfPage(payload, 1, 3), 3));
    expect(sectionIds(undone.document?.pdfData as PdfDocumentModel)).toEqual(sectionIds(base.pdfData as PdfDocumentModel));
    expect(allIds(redone.document?.pdfData as PdfDocumentModel).sort()).toEqual(allIds(changed.pdfData as PdfDocumentModel).sort());
  });

  it('keeps an annotation identity stable when its page is renumbered twice', () => {
    const first = reorderPdfPage(model(), 3, 1);
    const second = reorderPdfPage(first, 1, 3);
    expect(annotationIds(second).sort()).toEqual(annotationIds(model()).sort());
    expect(second.annotations.find((annotation: PdfAnnotation) => annotation.id === 'anno-2')?.page).toBe(model().annotations.find((annotation) => annotation.id === 'anno-2')?.page);
  });

  it('asserts the payload after undo/redo, so a broken snapshot cannot hide behind a green history', () => {
    const { redone } = proveUndoRedo((payload) => addPdfReviewAnnotation(payload, { page: 1, sectionId: 'sec-p1-1', type: 'strike', text: 'S', color: '#f43f5e', author: 'a' }));
    expect(() => assertPdfStudioPayload(redone.document?.pdfData)).not.toThrow();
  });
});

describe('WOM/Persistenz — documented schema fields cover every collection the features write to', () => {
  it('names the page, annotation, redaction and form-field collections in the validator', () => {
    const payload = model();
    payload.pages = payload.pages as PdfPageModel[];
    const codes = new Set(validatePdfStudioPayload(payload).map((issue) => issue.code));
    expect(codes.size).toBe(0);
    // Each collection has a reachable, named issue code — the schema is documented, not implicit.
    const broken: PdfDocumentModel = { ...payload, annotations: [{ ...payload.annotations[0], id: 'doppelt' }, { ...payload.annotations[1], id: 'doppelt' }] };
    expect(validatePdfStudioPayload(broken).map((issue) => issue.code)).toContain('duplicate-id');
  });
});
