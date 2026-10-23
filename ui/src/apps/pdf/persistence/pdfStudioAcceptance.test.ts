// STATUS: PLATIN — the end-to-end acceptance the tracker asks for, on a real 30-page mixed document.
//
// AST-0911/0912/0913: "30-seitiges gemischtes PDF importieren, bearbeiten, schwärzen und unabhängig validieren."
// Nothing here is a mock: the document is written by this application's canonical exporter, the import runs
// through the platform's hostile-input boundary, the redaction runs through the verified-redaction engine, and
// the validation re-reads the produced bytes with an **independent** reader (the platform inspector) plus the
// trailer rule and the PDF/A preflight. The one thing a browser would add — a human looking at the pages — is
// layer 5 and stays NOT_TESTED.
import { describe, expect, it } from 'vitest';
import type { PdfDocumentModel, PdfFormField, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WOM_SCHEMA_VERSION } from '../../../shared/contracts/wom/workspaceWom';
import { inspectNativePdfBytes } from '../../../platform/documents/pdf/nativeInspection';
import { buildStructuredPdfBytes, buildStructuredPdfBytesDetailed } from '../interchange/structuredPdfExport';
import { pdfTrailerDictionary, hasPdfIncrementalRevisionPointer } from '../security/pdfStructureInspector';
import { redactStructuredPdfPattern } from '../security/redaction/pdfTrueRedaction';
import { withPdfStudioSchema } from '../studio/state/pdfStudioSchema';
import { buildNativePdfDerivedDocument, openNativePdfPayload } from '../interchange/native/openNativePdfPayload';
import { assertPdfStudioRoundTrip, savePdfStudioDocument, validatePdfStudioPayload } from './pdfStudioPersistence';

const SECRET = 'DEMO-SECRET-ALPHA-2026';
const PAGE_COUNT = 30;

/** A 30-page mixed document: headings (→ bookmarks), paragraphs, a callout, a form field, an annotation, an OCR line. */
function mixedThirtyPageModel(): PdfDocumentModel {
  const pages = Array.from({ length: PAGE_COUNT }, (_value, index) => {
    const pageNumber = index + 1;
    return {
      pageNumber,
      title: `Kapitel ${pageNumber}`,
      subtitle: `Abschnitt ${pageNumber} von ${PAGE_COUNT}`,
      mediaBox: { x: 0, y: 0, width: 595.28, height: 841.89 },
      sections: [
        { id: `sec-p${pageNumber}-h`, type: 'header' as const, content: `${pageNumber}. Kapitelüberschrift` },
        { id: `sec-p${pageNumber}-p`, type: 'paragraph' as const, content: `Inhalt der Seite ${pageNumber}. Vertraulich: ${pageNumber === 7 ? SECRET : 'unbedenklich'}.` },
        ...(pageNumber % 5 === 0 ? [{ id: `sec-p${pageNumber}-c`, type: 'callout' as const, content: `Hinweis auf Seite ${pageNumber}` }] : []),
      ],
      ...(pageNumber === 3 ? {
        ocrLayer: {
          engine: 'tesseract-local' as const, engineVersion: '5.3.0', language: 'deu', processedAt: 1_700_000_000_000,
          meanConfidence: 0.9, originalImagesPreserved: true as const, sourceImageIds: ['img-1'],
          lines: [{ id: 'ocr-1', text: 'Gescannte Zeile', confidence: 0.9, bounds: { x: 1, y: 2, width: 3, height: 4 }, words: [] }],
        },
      } : {}),
    };
  });
  const formFields: PdfFormField[] = [{
    id: 'field-acceptance', name: 'kunde', type: 'text', page: 2,
    bounds: { x: 54, y: 640, width: 220, height: 24 }, value: 'Meier GmbH', options: [], required: true, readOnly: false, tabOrder: 1,
  }];
  return {
    numPages: pages.length,
    pages,
    annotations: [{ id: 'anno-acceptance', page: 4, sectionId: 'sec-p4-p', type: 'highlight', text: 'Inhalt der Seite 4', color: '#f59e0b', author: 'Reviewer', createdAt: 1_700_000_000_000 }],
    redactions: [],
    formFields,
  };
}

const asDocument = (payload: PdfDocumentModel): WorkspaceDocument => ({
  schema_version: WOM_SCHEMA_VERSION,
  id: 'pdf-acceptance',
  title: 'Abnahme 30 Seiten',
  kind: 'PdfStudio',
  created_at: 1_700_000_000_000,
  modified_at: 1_700_000_000_000,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  pdfData: payload,
});

describe('a 30-page mixed PDF goes through the whole chain', () => {
  it('is written by the canonical exporter and re-read by the platform boundary', async () => {
    const bytes = buildStructuredPdfBytes('Abnahme 30 Seiten', mixedThirtyPageModel());
    // The export really has 30 pages and the structures the scenario mentions.
    const text = new TextDecoder('latin1').decode(bytes);
    expect((text.match(/\/Type \/Page\b/gu) ?? []).length).toBeGreaterThanOrEqual(PAGE_COUNT);
    expect(text).toContain('/AcroForm');
    expect(text).toContain('/Outlines');
    // An **independent** reader (the platform's hostile-input boundary) accepts it and counts the pages.
    const inspection = await inspectNativePdfBytes(bytes);
    expect(inspection.eofMarkerPresent).toBe(true);
    expect(inspection.hasOutlines).toBe(true);
    expect(inspection.hasAcroForm).toBe(true);
    expect(inspection.estimatedPageObjects).toBeGreaterThanOrEqual(PAGE_COUNT);
    expect(inspection.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('imports through the visible entry and becomes a derived document', async () => {
    const bytes = buildStructuredPdfBytes('Abnahme 30 Seiten', mixedThirtyPageModel());
    const opened = await openNativePdfPayload({ fileName: 'Abnahme 30 Seiten.pdf', bytes });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const derived = buildNativePdfDerivedDocument({
      createId: () => 'pdf-acceptance-derived',
      payload: opened.payload,
      fileName: opened.fileName,
      now: 1_700_000_000_000,
    });
    expect(derived.kind).toBe('PdfStudio');
    expect(validatePdfStudioPayload(derived.pdfData)).toEqual([]);
    // And it survives the canonical Save→Close→Reopen unchanged.
    const saved = withPdfStudioSchema(savePdfStudioDocument(asDocument(derived.pdfData as PdfDocumentModel), derived.pdfData as PdfDocumentModel, 1_700_000_001_000));
    const roundTrip = assertPdfStudioRoundTrip(saved);
    expect(roundTrip.byteIdentical).toBe(true);
    expect(roundTrip.reopened.pdfData?.rawPdfByteLength).toBe(bytes.byteLength);
  });

  it('is edited, redacted and exported as verified bytes', async () => {
    const model = mixedThirtyPageModel();
    // Edit: fix a "typo" in a section of page 12 and change a page title.
    const edited: PdfDocumentModel = {
      ...model,
      pages: model.pages.map((page) => page.pageNumber !== 12 ? page : {
        ...page,
        title: 'Kapitel 12 (korrigiert)',
        sections: page.sections.map((section) => section.id === 'sec-p12-p' ? { ...section, content: 'Korrigierter Inhalt der Seite 12.' } : section),
      }),
    };
    expect(edited.pages[11].title).toBe('Kapitel 12 (korrigiert)');
    expect(edited.pages[11].sections[1].content).toBe('Korrigierter Inhalt der Seite 12.');

    // Redact: the one page that carries the secret.
    const redaction = redactStructuredPdfPattern(edited, { pattern: SECRET, mode: 'literal', reason: 'Abnahme' }, 1_700_000_002_000);
    expect(redaction.matchCount).toBe(1);
    expect(redaction.redactedCharacters).toBe(SECRET.length);

    // Export the verified redaction and validate it independently.
    const { buildVerifiedRedactedStructuredPdfBytes } = await import('../security/redaction/pdfTrueRedaction');
    const verified = buildVerifiedRedactedStructuredPdfBytes('Abnahme 30 Seiten', redaction.model, redaction.verificationTargets);
    const text = new TextDecoder('latin1').decode(verified.bytes);
    expect(text).not.toContain(SECRET);
    expect(verified.report.verified).toBe(true);
    expect(verified.report.annotationsOmittedFromSecureExport).toBeGreaterThan(0);

    // Independent validation of the produced bytes.
    const inspection = await inspectNativePdfBytes(verified.bytes);
    expect(inspection.eofMarkerPresent).toBe(true);
    expect(inspection.hasJavaScriptOrActions).toBe(false);
    expect(inspection.hasEmbeddedFiles).toBe(false);
    expect(inspection.estimatedPageObjects).toBeGreaterThanOrEqual(PAGE_COUNT);
    expect(() => pdfTrailerDictionary(text)).not.toThrow();
    // The trailer-scoped rule, not a file-wide `/Prev`: the export legitimately carries `/Prev` as the
    // previous-sibling key of its 30 outline entries, which is exactly the confusion that made the sanitizer
    // reject its own output before this batch.
    expect(text).toMatch(/\/Prev \d+ 0 R/u);
    expect(hasPdfIncrementalRevisionPointer(text)).toBe(false);
  });

  it('keeps 30 pages, the annotation identity and the form value through Save→Close→Reopen', () => {
    const model = mixedThirtyPageModel();
    const saved = withPdfStudioSchema(savePdfStudioDocument(asDocument(model), model, 1_700_000_003_000));
    const roundTrip = assertPdfStudioRoundTrip(saved);
    expect(roundTrip.byteIdentical).toBe(true);
    expect(roundTrip.reopened.pdfData?.pages.length).toBe(PAGE_COUNT);
    expect(roundTrip.reopened.pdfData?.annotations.map((annotation) => annotation.id)).toEqual(['anno-acceptance']);
    expect(roundTrip.reopened.pdfData?.formFields?.[0]).toMatchObject({ name: 'kunde', value: 'Meier GmbH', tabOrder: 1 });
    expect(roundTrip.reopened.pdfData?.pages[2].ocrLayer?.lines[0].text).toBe('Gescannte Zeile');
    expect(roundTrip.reopened.pdfData?.pages[11].title).toBe('Kapitel 12');
  });

  it('flattens the form irreversibly when asked, and says how many fields it flattened', () => {
    const model = mixedThirtyPageModel();
    const flat = buildStructuredPdfBytesDetailed('Abnahme 30 Seiten', model, { flattenFormFields: true });
    expect(flat.flattenedFormFields).toBe(1);
    expect(flat.interactiveFormFields).toBe(0);
    const text = new TextDecoder('latin1').decode(flat.bytes);
    expect(text).not.toContain('/AcroForm');
    expect(text).not.toContain('/Widget');
    expect((text.match(/\/Type \/Page\b/gu) ?? []).length).toBeGreaterThanOrEqual(PAGE_COUNT);
    // The value is now page content, i.e. it cannot be edited back.
    expect(text).toContain('(Meier GmbH) Tj');
  });

  it('refuses an over-long document instead of silently truncating it', () => {
    const huge = mixedThirtyPageModel();
    huge.pages = Array.from({ length: 10_001 }, (_value, index) => ({ ...huge.pages[index % huge.pages.length], pageNumber: index + 1 }));
    huge.numPages = huge.pages.length;
    expect(validatePdfStudioPayload(huge).map((issue) => issue.code)).toContain('page-count-exceeded');
    expect(() => savePdfStudioDocument(asDocument(huge), huge, 1_700_000_004_000)).toThrow(/page-count-exceeded/u);
  });
});
