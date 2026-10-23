// BATCH-PRESENT — real PPTX/ODP round trip and the honest fidelity statement (Paket 23, 24, 25).
//
// The oracle is the hand-written field list in `presentOfficeRoundTrip.ts`, written from the
// Present contract, plus the explicit "not preserved" assertions below. Nothing here is derived
// from the exporter, so an exporter regression cannot make these tests agree with it.
import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { readZip, writeStoredZip } from '../../../../platform/interop/zip';
import {
  PRESENT_OFFICE_FIDELITY_LIMITS,
  PRESENT_OFFICE_IMPORT_MAX_BYTES,
  PRESENT_OFFICE_MAX_SLIDES,
  PresentOfficeImportError,
  assertPresentOfficeImportBounds,
  comparePresentDeckFidelity,
  exportPresentDeck,
  importPresentDeckBytes,
  presentOfficeFormatFromFileName,
  verifyPresentRoundTrip,
} from '../../interchange/office/presentOfficeRoundTrip';

const model = (): PresentDocumentModel => ({
  themeId: 'midnight',
  theme: 'midnight',
  aspectRatio: '16:9',
  sections: [{ id: 'sec-1', name: 'Intro', color: '#123456' }],
  customShows: [{ id: 'show-1', name: 'Short', slideIds: ['slide-1'] }],
  slides: [
    {
      id: 'slide-1',
      title: 'Board Review',
      subtitle: 'Local-first',
      category: 'Intro',
      categoryTag: 'Intro',
      layout: 'cards',
      bulletPoints: ['first bullet', 'second bullet'],
      speakerNotes: 'Say the local-first sentence slowly.',
      masterId: 'master-clean',
      transition: { effect: 'fade', durationMs: 400, direction: 'left', sound: 'none' },
      timingSeconds: 12,
      cards: [{ id: 'card-1', title: 'Local', description: 'No vendor cloud', colorTheme: 'blue' }],
      sceneObjects: [
        {
          id: 'obj-text',
          kind: 'text',
          text: 'Sovereign text',
          fontSizePt: 22,
          fontWeight: 'semibold',
          color: '#f8fafc',
          xPercent: 12,
          yPercent: 28,
          widthPercent: 34,
          heightPercent: 12,
          zIndex: 20,
          rotation: 15,
          locked: false,
        },
        {
          id: 'obj-table',
          kind: 'table',
          columns: ['Metric', 'Q1'],
          rows: [['Users', '1240']],
          headerColor: '#1e3a8a',
          bodyColor: '#0f172a',
          textColor: '#f8fafc',
          xPercent: 16,
          yPercent: 42,
          widthPercent: 56,
          heightPercent: 26,
          zIndex: 16,
        },
      ],
      images: [
        { id: 'img-1', name: 'shot.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', altText: 'A screenshot', xPercent: 60, yPercent: 50, widthPercent: 28, heightPercent: 18, zIndex: 25 },
      ],
      animations: [{ id: 'anim-1', targetId: 'obj-text', effect: 'fade-in', trigger: 'on-click', durationMs: 500, delayMs: 100 }],
      presenterInk: [{ id: 'ink-1', tool: 'pen', color: '#ef4444', width: 3, opacity: 1, points: [{ xPercent: 1, yPercent: 1 }] }],
    },
    {
      id: 'slide-2',
      title: 'Numbers',
      subtitle: 'Live link',
      layout: 'bullet-list',
      bulletPoints: ['revenue up'],
      speakerNotes: 'Point at the chart.',
      hidden: false,
      sceneObjects: [],
      images: [],
      animations: [],
    },
  ],
});

const document = (presentData: PresentDocumentModel): WorkspaceDocument => ({
  schema_version: 1,
  id: 'doc-present-batch',
  title: 'Round trip deck',
  kind: 'Present',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'midnight',
  root_object_ids: [],
  objects: {},
  presentData,
});

describe('Present office import bounds', () => {
  it('resolves the format from the file name and rejects everything else', () => {
    expect(presentOfficeFormatFromFileName('deck.pptx')).toBe('pptx');
    expect(presentOfficeFormatFromFileName('DECK.PPTX')).toBe('pptx');
    expect(presentOfficeFormatFromFileName('deck.odp')).toBe('odp');
    expect(presentOfficeFormatFromFileName('deck.key')).toBeNull();
    expect(presentOfficeFormatFromFileName('deck')).toBeNull();
    expect(presentOfficeFormatFromFileName('')).toBeNull();
  });

  it('rejects an empty file, an oversized file, an unsupported extension and a hostile name', () => {
    expect(() => assertPresentOfficeImportBounds(new Uint8Array(0), 'deck.pptx')).toThrow(PresentOfficeImportError);
    expect(() => assertPresentOfficeImportBounds(new Uint8Array([1]), 'deck.pptx')).not.toThrow();
    expect(() => assertPresentOfficeImportBounds({ byteLength: PRESENT_OFFICE_IMPORT_MAX_BYTES + 1 } as Uint8Array, 'deck.pptx'))
      .toThrow(/limit is 64 MiB/);
    expect(() => assertPresentOfficeImportBounds(new Uint8Array([1]), 'deck.key')).toThrow(/\.pptx and \.odp/);
    expect(() => assertPresentOfficeImportBounds(new Uint8Array([1]), `${'a'.repeat(300)}.pptx`)).toThrow(/file name/);
    expect(() => assertPresentOfficeImportBounds(new Uint8Array([1]), '')).toThrow(PresentOfficeImportError);
  });

  it('refuses to export above the interoperable slide ceiling instead of truncating', () => {
    const big: PresentDocumentModel = {
      slides: Array.from({ length: PRESENT_OFFICE_MAX_SLIDES + 1 }, (_, index) => ({
        id: `s-${index}`,
        title: `S${index}`,
        subtitle: '',
        layout: 'blank' as const,
      })),
    };
    expect(() => exportPresentDeck(document(big), 'pptx')).toThrow(/interoperable limit is 512/);
  });

  it('refuses to export a document that is not a Present document', () => {
    expect(() => exportPresentDeck({ ...document(model()), kind: 'Grid' }, 'pptx')).toThrow(/Present document/);
  });
});

describe('Present PPTX round trip (canonical part)', () => {
  it('preserves every field of the fidelity oracle through export -> import', async () => {
    const source = model();
    const bytes = exportPresentDeck(document(source), 'pptx');
    expect(bytes.byteLength).toBeGreaterThan(1024);
    const imported = await importPresentDeckBytes(bytes, 'roundtrip.pptx');
    const comparison = comparePresentDeckFidelity(source, imported.model);
    expect(comparison.lostFields).toEqual([]);
    expect(comparison.changedFields).toEqual([]);
    expect(comparison.identical).toBe(true);
    expect(comparison.slideCountBefore).toBe(2);
    expect(imported.format).toBe('pptx');
  });

  it('preserves scene objects, images, speaker notes, animations, ink and master assignment', async () => {
    const source = model();
    const imported = await importPresentDeckBytes(exportPresentDeck(document(source), 'pptx'), 'd.pptx');
    const slide = imported.model.slides[0];
    expect(slide.speakerNotes).toBe('Say the local-first sentence slowly.');
    expect(slide.masterId).toBe('master-clean');
    expect(slide.sceneObjects?.map((object) => object.id)).toEqual(['obj-text', 'obj-table']);
    expect(slide.sceneObjects?.[0]).toMatchObject({ kind: 'text', text: 'Sovereign text', rotation: 15 });
    expect(slide.images?.[0]).toMatchObject({ id: 'img-1', altText: 'A screenshot' });
    expect(slide.animations?.[0]).toMatchObject({ id: 'anim-1', effect: 'fade-in' });
    expect(slide.presenterInk?.[0]?.points).toHaveLength(1);
    expect(slide.transition).toMatchObject({ effect: 'fade', durationMs: 400 });
    expect(imported.model.sections?.[0]?.id).toBe('sec-1');
    expect(imported.model.customShows?.[0]?.slideIds).toEqual(['slide-1']);
  });

  it('reports the round trip through the public verification entry point', async () => {
    const { comparison, bytes } = await verifyPresentRoundTrip(document(model()), 'pptx');
    expect(comparison.identical).toBe(true);
    expect(bytes).toBeGreaterThan(0);
  });

  it('keeps the slide id order stable across the round trip', async () => {
    const source = model();
    const imported = await importPresentDeckBytes(exportPresentDeck(document(source), 'pptx'), 'd.pptx');
    expect(imported.model.slides.map((slide) => slide.id)).toEqual(source.slides.map((slide) => slide.id));
  });
});

describe('Present ODP round trip (canonical part)', () => {
  it('preserves the same Present content as PPTX and reports the one measured asymmetry', async () => {
    const source = model();
    const imported = await importPresentDeckBytes(exportPresentDeck(document(source), 'odp'), 'roundtrip.odp');
    const comparison = comparePresentDeckFidelity(source, imported.model);
    // No Present content is lost or changed...
    expect(comparison.lostFields).toEqual([]);
    // ...but the ODP reader re-collects the package metadata part into `interopPreservedParts`, so
    // that single bookkeeping field differs. This is measured, not assumed.
    expect(comparison.changedFields).toEqual(['preservedParts']);
    expect(imported.model.interopPreservedParts?.length).toBeGreaterThan(0);
    expect(imported.format).toBe('odp');
    expect(imported.model.slides[0].sceneObjects?.map((object) => object.id)).toEqual(['obj-text', 'obj-table']);
    expect(imported.model.slides[0].speakerNotes).toBe('Say the local-first sentence slowly.');
  });
});

describe('Foreign deck fidelity: what is genuinely NOT preserved', () => {
  it('loses scene objects, images, notes and animations for a PPTX without the canonical part', async () => {
    const source = model();
    const entries = await readZip(exportPresentDeck(document(source), 'pptx'), {
      maxEntries: 4096,
      maxEntryBytes: 64 * 1024 * 1024,
      maxTotalUncompressedBytes: 128 * 1024 * 1024,
      maxCompressionRatio: 100,
      maxElapsedMs: 5_000,
    });
    // Simulate a foreign deck: strip the canonical Present part, keep the valid OOXML skeleton.
    const foreign = [...entries.entries()].filter(([name]) => name !== 'ppt/vgt-present.xml');
    expect(foreign.length).toBeGreaterThan(5);
    const foreignBytes = writeStoredZip(foreign.map(([name, data]) => ({ name, data })));
    const imported = await importPresentDeckBytes(foreignBytes, 'foreign.pptx');
    const comparison = comparePresentDeckFidelity(source, imported.model);

    // Text survives the fallback...
    expect(imported.model.slides[0].title).toBe('Board Review');
    expect(comparison.preservedFields).toContain('slides[].title');

    // ...and the fields the beta text fallback cannot map are reported as lost.
    for (const field of [
      'slides[].sceneObjects',
      'slides[].images',
      'slides[].speakerNotes',
      'slides[].animations',
      'slides[].presenterInk',
      'slides[].cards',
      'sections',
      'customShows',
    ]) {
      expect(comparison.lostFields, field).toContain(field);
    }
    // A transition is fabricated as "none" by the fallback, so it is a change rather than a loss.
    expect(comparison.changedFields).toContain('slides[].transition');
    expect(comparison.identical).toBe(false);

    // The measured content facts behind the classification.
    expect(imported.model.slides[0].sceneObjects).toEqual([]);
    expect(imported.model.slides[0].images).toEqual([]);
    expect(imported.model.slides[0].speakerNotes).toBe('');
    expect(imported.model.slides[0].masterId).toBeUndefined();
  });

  it('states the unverified external render explicitly and never softens it', () => {
    expect(PRESENT_OFFICE_FIDELITY_LIMITS.length).toBeGreaterThanOrEqual(6);
    const joined = PRESENT_OFFICE_FIDELITY_LIMITS.join('\n');
    expect(joined).toMatch(/NOT TESTED/);
    expect(joined).toMatch(/PowerPoint/);
    expect(joined).toMatch(/LibreOffice/);
    expect(joined).toMatch(/notesSlides/);
    expect(joined).toMatch(/512/);
  });
});
