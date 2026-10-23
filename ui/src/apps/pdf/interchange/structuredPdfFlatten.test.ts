// STATUS: PLATIN — flatten is real: the value becomes page content and the interactive structure disappears.
//
// Before this batch the application had no flatten at all. The tracker's acceptance for AST-0842 is
// "Eingaben in externem Reader nachweisen, Flatten optional irreversibel warnen" — so the test has to show
// three things about the **bytes**, not about a flag:
//
//   1. with flattening enabled the document carries **no** interactive structure (`/AcroForm`, `/Widget`,
//      `/Annots`) and the field's value is drawn in the page content stream;
//   2. without flattening the same document keeps the widget and the `/AcroForm` catalog entry (the
//      counter-check: the test would pass trivially if the exporter simply dropped fields);
//   3. the outcome reports how many fields were flattened, so the UI can warn with a real number.
import { describe, expect, it } from 'vitest';
import type { PdfDocumentModel, PdfFormField } from '../../../shared/contracts/workspace';
import { pdfWinAnsiLiteral, pdfUnicodeTextString } from '../../../platform/interop/pdf/pdfTextStrings';
import { pdfTrailerDictionary } from '../security/pdfStructureInspector';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import { buildStructuredPdfBytes, buildStructuredPdfBytesDetailed } from './structuredPdfExport';

const field = (overrides: Partial<PdfFormField> = {}): PdfFormField => ({
  id: 'field-flatten',
  name: 'kunde_name',
  type: 'text',
  page: 1,
  bounds: { x: 54, y: 640, width: 220, height: 24 },
  value: 'Meier GmbH',
  options: [],
  required: false,
  readOnly: false,
  tabOrder: 1,
  ...overrides,
});

const modelWithFields = (fields: PdfFormField[]): PdfDocumentModel => ({
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: [],
  redactions: [],
  formFields: fields,
});

const decode = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

describe('flatten writes the value into the page and removes the interaction', () => {
  const model = modelWithFields([field(), field({ id: 'field-check', name: 'agb', type: 'checkbox', value: true, tabOrder: 2 })]);
  const flat = buildStructuredPdfBytesDetailed('Flatten-Abnahme', model, { flattenFormFields: true });
  const interactive = buildStructuredPdfBytesDetailed('Flatten-Abnahme', model, {});
  const flatText = decode(flat.bytes);
  const interactiveText = decode(interactive.bytes);

  it('reports the real numbers it produced', () => {
    expect(flat.flattenedFormFields).toBe(2);
    expect(flat.interactiveFormFields).toBe(0);
    expect(interactive.flattenedFormFields).toBe(0);
    expect(interactive.interactiveFormFields).toBe(2);
  });

  it('draws the value as page content at the field rectangle', () => {
    expect(flatText).toContain(pdfWinAnsiLiteral('Meier GmbH'));
    // The translation to the field's own rectangle is what places it: x=54, y=640.
    expect(flatText).toContain('1 0 0 1 54.00 640.00 cm');
    // The checkbox appearance is drawn too, with its 'X'.
    expect(flatText).toContain('(X) Tj');
  });

  it('removes every interactive structure', () => {
    expect(flatText).not.toContain('/AcroForm');
    expect(flatText).not.toContain('/Widget');
    expect(flatText).not.toContain('/Annots');
    expect(flatText).not.toContain('/FT /Tx');
  });

  it('keeps the interactive structures when flattening is not requested (counter-check)', () => {
    expect(interactiveText).toContain('/AcroForm');
    expect(interactiveText).toContain('/Widget');
    expect(interactiveText).toContain('/FT /Tx');
    expect(interactiveText).toContain(`/T ${pdfUnicodeTextString('kunde_name')}`);
    // The value lives in /V, i.e. as data, not as drawn page content.
    expect(interactiveText).toContain(`/V ${pdfUnicodeTextString('Meier GmbH')}`);
    expect(interactiveText).not.toContain('1 0 0 1 54.00 640.00 cm');
  });

  it('produces a structurally valid file in both modes', () => {
    for (const [label, bytes] of [['flattened', flat.bytes], ['interactive', interactive.bytes]] as const) {
      const text = decode(bytes);
      expect(text.startsWith('%PDF-1.4'), label).toBe(true);
      expect(text, label).toMatch(/startxref\s+\d+\s+%%EOF\s*$/u);
      // The trailer must still be resolvable: the flattened file is a normal classic-xref PDF.
      expect(() => pdfTrailerDictionary(text), label).not.toThrow();
      expect(text).toContain('/Root 1 0 R');
    }
  });

  it('keeps the flattened and interactive exports different, so the flag cannot be a no-op', () => {
    expect(flat.bytes.byteLength).not.toBe(interactive.bytes.byteLength);
    expect(flatText).not.toBe(interactiveText);
  });

  it('is a thin view of one exporter: the plain entry point returns exactly the detailed bytes', () => {
    expect(Array.from(buildStructuredPdfBytes('Flatten-Abnahme', model, { flattenFormFields: true })))
      .toEqual(Array.from(flat.bytes));
  });

  it('flattens nothing when the document has no fields', () => {
    const empty = buildStructuredPdfBytesDetailed('Leer', modelWithFields([]), { flattenFormFields: true });
    expect(empty.flattenedFormFields).toBe(0);
    expect(decode(empty.bytes)).not.toContain('/AcroForm');
  });

  it('still refuses an invalid field set before writing anything', () => {
    const broken = modelWithFields([field({ name: '' })]);
    expect(() => buildStructuredPdfBytesDetailed('Kaputt', broken, { flattenFormFields: true }))
      .toThrow(/Form field name is required|PDF form validation failed/u);
  });
});
