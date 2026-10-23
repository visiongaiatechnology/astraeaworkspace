// STATUS: PLATIN — the direct-edit domain path is real, bounded, deterministic and fail-closed: measured.
//
// AST-0822 asks to check the domain path for "Text direkt bearbeiten" and to ensure a real action, a type
// contract, validated inputs, deterministic processing and clean error propagation — no mock, no timer, no bare
// status change. The engine (`editing/pdfDirectContentEditing.ts`, 379 lines with 14 exported operations and 10
// bounds) existed, but **nothing in the tree executed it**: no test called `upsertPdfTextBlock`. This suite is
// that execution, so the module cannot silently rot into an unused claim.
//
// The acceptance sentence — "Typo im PDF ändern, fremde Textbox bleibt nicht bloßer Overlay-Schatten" — is met
// for the canonical structured model, where the edit changes the model and therefore the exported **text** (not
// an overlay). For arbitrary foreign bytes the module refuses with a named reason, and that refusal is asserted
// here rather than glossed over. What only a browser can show (the inline edit in the rendered page) is layer 5
// and stays NOT_TESTED.
import { describe, expect, it } from 'vitest';
import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import { buildStructuredPdfBytes } from '../interchange/structuredPdfExport';
import { layoutPositionedPdfSection } from './structuredPdfEditRendering';
import {
  deletePdfTextBlock,
  insertPdfImage,
  inspectPdfEditFidelity,
  reflowPdfText,
  resolvePdfBase14Font,
  updatePdfImage,
  upsertPdfLink,
  upsertPdfTextBlock,
} from './pdfDirectContentEditing';

const model = (): PdfDocumentModel => ({
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: [],
  redactions: [],
  formFields: [],
});

const positionedDraft = (content: string) => ({
  page: 1,
  type: 'paragraph' as const,
  content,
  bounds: { x: 60, y: 700, width: 300, height: 40 },
  style: { requestedFont: 'Helvetica', fontSize: 11 },
});

describe('editing a text block is a real, deterministic model change', () => {
  it('inserts a positioned block with a fresh stable id and the given content', () => {
    const edited = upsertPdfTextBlock(model(), 1, positionedDraft('Korrigierter Satz.'));
    const sections = edited.pages[0].sections;
    const inserted = sections.at(-1);
    expect(sections).toHaveLength(model().pages[0].sections.length + 1);
    expect(inserted?.content).toBe('Korrigierter Satz.');
    expect(inserted?.id).toMatch(/^pdf-text-[0-9a-f-]{36}$/u);
    expect(inserted?.bounds).toEqual({ x: 60, y: 700, width: 300, height: 40 });
    expect(inserted?.style?.resolvedFont).toBe('Helvetica');
  });

  it('is deterministic: the same draft id yields the same result twice', () => {
    const draft = { ...positionedDraft('Idempotent.'), id: 'pdf-text-fixed' };
    const first = upsertPdfTextBlock(model(), 1, draft);
    const second = upsertPdfTextBlock(model(), 1, draft);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // Upsert with the same id replaces instead of appending.
    const updated = upsertPdfTextBlock(first, 1, { ...draft, content: 'Geändert.' });
    expect(updated.pages[0].sections.filter((section) => section.id === 'pdf-text-fixed')).toHaveLength(1);
    expect(updated.pages[0].sections.find((section) => section.id === 'pdf-text-fixed')?.content).toBe('Geändert.');
  });

  it('changes the exported TEXT, so the edit is not an overlay shadow', () => {
    // Replace an existing block: this is the "fix the typo" case. The old sentence must be gone from the
    // exported content stream — an overlay would leave it in place and draw on top of it.
    const originalText = model().pages[0].sections.find((section) => section.id === 'sec-p1-2')?.content ?? '';
    expect(originalText.length).toBeGreaterThan(0);
    const edited = upsertPdfTextBlock(model(), 1, { ...positionedDraft('Der neue Wortlaut steht im Inhalt.'), id: 'sec-p1-2' });
    const text = new TextDecoder('latin1').decode(buildStructuredPdfBytes('Direktbearbeitung', edited));
    expect(text).toContain('Der neue Wortlaut steht im Inhalt.');
    // The first half of the replaced sentence is a distinctive phrase that must no longer be drawn.
    expect(text).not.toContain('This sample document exists to exercise editing');
    const layout = layoutPositionedPdfSection(edited.pages[0].sections.find((section) => section.id === 'sec-p1-2')!);
    expect(layout.lines.join(' ')).toContain('Der neue Wortlaut');
  });

  it('propagates a named refusal for a foreign byte document instead of pretending', () => {
    const native = { ...model(), rawPdfDataUrl: 'data:application/pdf;base64,AAAA' };
    expect(() => upsertPdfTextBlock(native, 1, positionedDraft('x')))
      .toThrow(/Direct structured editing is unavailable for arbitrary native PDFs/u);
    expect(() => deletePdfTextBlock(native, 1, 'sec-p1-1')).toThrow(/unavailable for arbitrary native PDFs/u);
    expect(() => insertPdfImage(native, 1, { id: 'img', dataUrl: 'data:image/jpeg;base64,AAAA', bounds: { x: 1, y: 1, width: 10, height: 10 } } as never))
      .toThrow(/unavailable for arbitrary native PDFs/u);
  });

  it('bounds the text and the page budget with named reasons', () => {
    expect(() => upsertPdfTextBlock(model(), 1, positionedDraft('x'.repeat(2 * 1024 * 1024 + 1))))
      .toThrow(/Text block exceeds/u);
    const tooManyPages: PdfDocumentModel = { ...model(), pages: Array.from({ length: 10_001 }, (_value, index) => ({ pageNumber: index + 1, title: 'p', sections: [] })), numPages: 10_001 };
    expect(() => upsertPdfTextBlock(tooManyPages, 1, positionedDraft('x'))).toThrow(/page editing budget/u);
  });

  it('clamps a box into the media box and a style into the supported ranges instead of storing nonsense', () => {
    const edited = upsertPdfTextBlock(model(), 1, {
      ...positionedDraft('Randfall.'),
      bounds: { x: -50, y: -50, width: 99_999, height: 99_999 },
      style: { requestedFont: 'Unknown-Font', fontSize: 9_999, lineHeight: 99 },
    });
    const inserted = edited.pages[0].sections.at(-1);
    expect(inserted?.bounds?.x).toBeGreaterThanOrEqual(0);
    expect(inserted?.bounds?.width).toBeLessThanOrEqual(20_000);
    expect(inserted?.style?.fontSize).toBeLessThanOrEqual(144);
    expect(inserted?.style?.lineHeight).toBeLessThanOrEqual(3);
    // An unknown font resolves to a base-14 font that can actually be embedded-free.
    expect(resolvePdfBase14Font('Unknown-Font', false).resolved).toMatch(/^(Helvetica|Times-Roman|Courier)$/u);
  });

  it('reflows text to the given width with a real measurement', () => {
    const lines = reflowPdfText('Ein längerer Satz, der über mehrere Zeilen laufen muss.', 120, { resolvedFont: 'Helvetica', fontSize: 11 });
    expect(lines.length).toBeGreaterThan(1);
    const measured = reflowPdfText('Kurz.', 400, { resolvedFont: 'Helvetica', fontSize: 11 });
    expect(measured).toEqual(['Kurz.']);
  });

  it('deletes a block together with the annotations that belonged to it', () => {
    const withAnnotation: PdfDocumentModel = {
      ...model(),
      annotations: [{ id: 'anno-direct', page: 1, sectionId: 'sec-p1-1', type: 'comment', text: 'dazu', color: '#fff', author: 'a', createdAt: 1 }],
    };
    const deleted = deletePdfTextBlock(withAnnotation, 1, 'sec-p1-1');
    expect(deleted.pages[0].sections.some((section) => section.id === 'sec-p1-1')).toBe(false);
    expect(deleted.annotations).toEqual([]);
  });

  it('reports the edit-fidelity limits as data instead of a claim', () => {
    const report = inspectPdfEditFidelity(model());
    expect(report).toBeTruthy();
    const nativeReport = inspectPdfEditFidelity({ ...model(), rawPdfDataUrl: 'data:application/pdf;base64,AAAA' });
    expect(JSON.stringify(nativeReport)).not.toBe(JSON.stringify(report));
  });

  it('validates image and link inputs rather than storing them unchecked', () => {
    const withLink = upsertPdfLink(model(), 1, { id: 'link-1', bounds: { x: 1, y: 1, width: 10, height: 10 }, target: { kind: 'url', url: 'https://example.org/a' } } as never);
    expect(withLink.pages[0].links?.some((link) => link.id === 'link-1')).toBe(true);
    // A JPEG that cannot be measured is **refused**, not stored with invented dimensions.
    expect(() => insertPdfImage(model(), 1, { id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAAA', bounds: { x: 10, y: 10, width: 20, height: 20 } } as never))
      .toThrow(/Image dimensions exceed policy|not a valid JPEG/u);
    // An update of an unknown image id is a named refusal, not a silent no-op.
    expect(() => updatePdfImage(model(), 1, 'img-unbekannt', { x: 1 } as never)).toThrow(/not found|unbekannt/iu);
  });
});
