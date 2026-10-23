// BATCH-PRESENT — export selection order and office import/export bounds (Paket 23/24/25/26).
import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { resolvePresentSlideSelection } from '../../interchange/render/presentExport';
import {
  PRESENT_OFFICE_FIDELITY_LIMITS,
  PRESENT_OFFICE_IMPORT_MAX_BYTES,
  PRESENT_OFFICE_MAX_SLIDES,
  PresentOfficeImportError,
  assertPresentOfficeImportBounds,
  comparePresentDeckFidelity,
  exportPresentDeck,
  presentOfficeFormatFromFileName,
} from '../../interchange/office/presentOfficeRoundTrip';
import { presentImportFidelityNote } from '../../productivity/PresentProductivityModal';

const model = (): PresentDocumentModel => ({
  slides: ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id.toUpperCase(), subtitle: '', layout: 'blank' as const })),
});

const document = (patch: Partial<PresentDocumentModel> = {}, kind = 'Present'): WorkspaceDocument => ({
  id: 'doc-1',
  kind,
  title: 'Deck',
  version: 1,
  modified_at: 0,
  presentData: { ...model(), ...patch },
} as unknown as WorkspaceDocument);

describe('resolvePresentSlideSelection (Paket 26)', () => {
  it('exports every slide in deck order when nothing is selected', () => {
    expect(resolvePresentSlideSelection(model()).map((slide) => slide.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(resolvePresentSlideSelection(model(), []).map((slide) => slide.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(resolvePresentSlideSelection(model(), null).map((slide) => slide.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps deck order even when the selection arrives in another order', () => {
    expect(resolvePresentSlideSelection(model(), ['d', 'b']).map((slide) => slide.id)).toEqual(['b', 'd']);
  });

  it('ignores unknown and duplicate ids instead of adding or repeating a slide', () => {
    expect(resolvePresentSlideSelection(model(), ['b', 'b', 'ghost']).map((slide) => slide.id)).toEqual(['b']);
    expect(resolvePresentSlideSelection(model(), ['ghost'])).toEqual([]);
  });

  it('returns a copy, so a caller cannot mutate the deck through the result', () => {
    const slides = resolvePresentSlideSelection(model());
    slides.pop();
    expect(model().slides).toHaveLength(4);
  });
});

describe('office import bounds (Paket 23/25)', () => {
  it('refuses an empty file, an oversized file, a wrong extension and an unusable name', () => {
    expect(() => assertPresentOfficeImportBounds(new Uint8Array(0), 'deck.pptx')).toThrow(PresentOfficeImportError);
    expect(() => assertPresentOfficeImportBounds(new Uint8Array([1]), 'deck.key')).toThrow(/\.pptx and \.odp/);
    expect(() => assertPresentOfficeImportBounds(new Uint8Array([1]), `${'a'.repeat(300)}.pptx`)).toThrow(/file name/);
    expect(() => assertPresentOfficeImportBounds({ byteLength: PRESENT_OFFICE_IMPORT_MAX_BYTES + 1 } as Uint8Array, 'deck.pptx'))
      .toThrow(/limit is 64 MiB/);
    expect(assertPresentOfficeImportBounds(new Uint8Array([1]), 'deck.odp').format).toBe('odp');
  });

  it('resolves the format from the file name and nothing else', () => {
    expect(presentOfficeFormatFromFileName('Report.PPTX')).toBe('pptx');
    expect(presentOfficeFormatFromFileName('report.odp')).toBe('odp');
    expect(presentOfficeFormatFromFileName('report.pdf')).toBeNull();
    expect(presentOfficeFormatFromFileName('no-extension')).toBeNull();
  });
});

describe('office export bounds (Paket 24)', () => {
  it('refuses a deck above the interoperable ceiling instead of truncating it', () => {
    const big = document({ slides: Array.from({ length: PRESENT_OFFICE_MAX_SLIDES + 1 }, (_, index) => ({ id: `s${index}`, title: 't', subtitle: '', layout: 'blank' as const })) });
    expect(() => exportPresentDeck(big, 'pptx')).toThrow(/interoperable limit is 512/);
  });

  it('refuses a document that is not a Present document and an empty deck', () => {
    expect(() => exportPresentDeck(document({}, 'Grid'), 'pptx')).toThrow(/Present document/);
    expect(() => exportPresentDeck(document({ slides: [] }), 'pptx')).toThrow(/no slides/);
  });
});

describe('fidelity comparison and its honest limits (Paket 24)', () => {
  it('classifies identical models as fully preserved', () => {
    const comparison = comparePresentDeckFidelity(model(), model());
    expect(comparison.identical).toBe(true);
    expect(comparison.lostFields).toEqual([]);
    expect(comparison.changedFields).toEqual([]);
  });

  it('reports lost scene objects and images as lost rather than "changed"', () => {
    const before = model();
    before.slides[0] = {
      ...before.slides[0],
      sceneObjects: [{ id: 'o1', kind: 'shape', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', strokeWidth: 1, xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }],
      images: [{ id: 'i1', name: 'a.png', dataUrl: 'data:image/png;base64,AA', xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }],
    };
    const after = model();
    const comparison = comparePresentDeckFidelity(before, after);
    expect(comparison.identical).toBe(false);
    expect(comparison.lostFields).toContain('slides[].sceneObjects');
    expect(comparison.lostFields).toContain('slides[].images');
  });

  it('states the limits verbatim, including the explicit NOT TESTED sentence', () => {
    const joined = PRESENT_OFFICE_FIDELITY_LIMITS.join('\n');
    expect(joined).toContain('Foreign PPTX read through the text fallback');
    expect(joined).toContain('NOT TESTED');
    expect(joined).toContain('cannot round trip');
  });

  it('quotes the untested rendering claim at the moment of import', () => {
    const note = presentImportFidelityNote('pptx');
    expect(note).toContain('PPTX');
    expect(note).toContain('Foreign PPTX read through the text fallback');
    expect(note).toContain('Scene objects');
  });
});
