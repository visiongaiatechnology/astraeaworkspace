// BATCH-PRESENT — the WOM/Persistenz layer (AST-0478 … AST-0638, the third layer of all 33 Present
// packages) and the live-link reopen path of Paket 15.
//
// ## What this file answers, and with which oracle ✓✓
//
// The acceptance sentence of every third layer is "Prüfe **Save → Close → Reopen** auf **identische
// Nutzdaten**". The Save→Close→Reopen *cycle* of this app is: the deck is carried as
// `WorkspaceDocument.presentData`, the host writes it through the canonical boundary
// (`platform/workspace/model/workspaceObjectModelDocumentPersistence.ts:234`
// `serializeWorkspaceDocumentCanonical` → `:246` `deserializeWorkspaceDocumentCanonical`), and
// `PresentCanvas.tsx:51` reads it back through `ensurePresentDesign`.
//
// So the honest, executable measurement available here is: **serialize with the platform's own
// canonical writer, deserialize with the platform's own canonical reader, run the app's reopen read,
// and compare the payload**. No second serializer is written for the test ✗ — the oracle is the
// shipping one, which is the only way "identical payload" can mean anything.
//
// What stays NOT_TESTED is named at the bottom of this file and in every `notes.md`: the encrypted
// *container* (KeyVault/VWC), the atomic write of the host, and the visible click-through.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';
import { ensurePresentDesign } from '../../design/presentDesign';
import { createEmptyPresentDeck, createPresentSlide } from '../../contracts/presentDeckFactory';
import { DEFAULT_PRESENT_SLIDES } from '../../contracts/types';
import { PresentCanvas } from '../../PresentCanvas';
import { createPresentDiagramObject, createPresentTextObject } from '../../canvas/model/presentScene';
import { withPresentAltText, withPresentFlip, withPresentGroupId } from '../../canvas/model/presentObjectExtensions';
import { withPresentLink } from '../../canvas/model/presentObjectExtensions';
import { resolvePresentSlideDesign, resolvePresentMasterId, listPresentMasterDependents } from '../../design/presentDesign';
import { resolvePresentLinkStatus } from '../../integrations/presentLinkStatus';
import { refreshPresentLiveLinks, describePresentLiveLinkFailures } from '../../integrations/presentLiveLinkRefresh';
import { registerWorkspaceSnapshotProvider } from '../../../../platform/workspace/integrations/workspaceSnapshot';
import { createPresentWorkspaceObject } from '../../integrations/presentWorkspaceIntegration';
import { initialDocs } from '../../../../app/bootstrap/seedData';

/** The exact document envelope the shell hands to the app. */
const envelope = (presentData: PresentDocumentModel, id = 'present-persist-doc'): WorkspaceDocument => ({
  schema_version: 2,
  id,
  title: 'Persistence deck',
  kind: 'Present',
  created_at: 1_700_000_000_000,
  modified_at: 1_700_000_000_000,
  version: 1,
  theme_id: 'midnight',
  root_object_ids: [],
  objects: {},
  presentData,
});

/**
 * The full Save → Close → Reopen cycle through the **shipping** boundary, plus the app's own reopen
 * read. `canonical` is deliberately not used here: the writer sorts keys, drops `undefined` and
 * rejects non-finite numbers itself, and that behaviour is part of what is being measured.
 */
function saveCloseReopen(model: PresentDocumentModel): { reopened: PresentDocumentModel; serialized: string } {
  const serialized = serializeWorkspaceDocumentCanonical(envelope(model));
  const parsed = deserializeWorkspaceDocumentCanonical(serialized);
  return { reopened: ensurePresentDesign(parsed.presentData as PresentDocumentModel), serialized };
}

/**
 * The *second* half of "Save → Close → Reopen": the reopen is not only a payload, it is a render.
 * `PresentCanvas.tsx` reads the model back through `ensurePresentDesign` and then decides what to put
 * on screen; a round trip that returns the right array is worthless if the renderer seeds over it.
 * Without jsdom there is no click to dispatch, so `renderToStaticMarkup` is the honest upper bound
 * here: it proves what the reopen *puts on screen*, not what a user can click.
 */
function renderPresentCanvas(model: PresentDocumentModel): string {
  return renderToStaticMarkup(
    createElement(PresentCanvas, {
      document: envelope(model),
      onUpdateDocument: () => undefined,
      onSelectSelectionType: () => undefined,
      workspaceDocuments: {},
    } as never),
  );
}

/** The titles of the built-in demo deck that must never appear in a deck the user did not author. */
const DEMO_DECK_MARKERS = DEFAULT_PRESENT_SLIDES.map((slide) => slide.title);

/** A deck that uses every documented `PresentDocumentModel` field the layer owns. */
function fullDeck(): PresentDocumentModel {
  const slides: PresentSlide[] = [
    {
      ...createPresentSlide('title', { id: 'slide-a', sequence: 1 }),
      title: 'Astraea FY26',
      subtitle: 'Board review',
      speakerNotes: 'Open slowly, note "ölçüm – Ω – 漢字".',
      masterId: 'master-board',
      transition: { effect: 'wipe', durationMs: 600, direction: 'left', sound: 'none' },
      timingSeconds: 42,
      hidden: false,
      animations: [{ id: 'anim-a', targetId: 'obj-a', effect: 'fade-in', trigger: 'on-click', durationMs: 500, delayMs: 100, scope: 'object' }],
      cards: [{ id: 'card-a', title: 'Local first', description: 'No vendor cloud', colorTheme: 'blue' }],
      bulletPoints: ['one', 'two'],
      images: [{
        id: 'img-a',
        name: 'shot.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        altText: 'A screenshot',
        xPercent: 60, yPercent: 50, widthPercent: 28, heightPercent: 18, zIndex: 25,
        cropTop: 5, cropLeft: 10, intrinsicWidthPx: 1920, intrinsicHeightPx: 1080,
      } as never],
      presenterInk: [{ id: 'ink-a', tool: 'pen', color: '#ef4444', width: 3, opacity: 1, points: [{ xPercent: 1, yPercent: 2 }] }],
      comments: [{ id: 'c-a', slideId: 'slide-a', author: 'Reviewer', text: 'Tighten the subtitle.', timestamp: 1_700_000_000_500 }],
    },
    {
      ...createPresentSlide('blank', { id: 'slide-b', sequence: 2 }),
      title: 'Numbers',
      sceneObjects: [
        withPresentLink(
          withPresentGroupId(
            withPresentFlip(withPresentAltText(createPresentTextObject('obj-b', { xPercent: 12, yPercent: 30 }), 'Takeaway'), { flipX: true }),
            'present-group-1',
          ),
          { kind: 'slide', targetId: 'slide-a', label: 'Back to the cover' },
        ) as never,
        withPresentAltText(createPresentDiagramObject('obj-diagram', 'process'), 'Delivery pipeline') as never,
      ] as never,
    },
  ];
  return ensurePresentDesign({
    slides,
    themeId: 'executive',
    theme: 'executive',
    aspectRatio: '16:9',
    sections: [{ id: 'sec-1', name: 'Intro', color: '#123456' }],
    customShows: [{ id: 'show-1', name: 'Short', slideIds: ['slide-a'] }],
    collaboration: {
      activity: [{ id: 'act-1', timestamp: 1_700_000_000_000, actor: 'Reviewer', action: 'comment', slideId: 'slide-a', summary: 'Left one note' }],
      // **`layout: 'blank'` statt `'title'`** ✗✓✓ — *gemessen (Runde 363): es gibt **zwei** Layout-Vokabeln.*
    // *Die **Speicher**-Vokabel ist `PRESENT_LAYOUTS = ['cards','chart','split','bullet-list','blank']`
    // (`interoperability/presentModelValidation.ts:4` ✓); die **Anzeige**-Vokabel ist `PresentSlideLayoutKind`
    // (`contracts/presentDeckFactory.ts:22`: `'title' | 'title-content' | 'two-column' | 'cards' | 'blank'` ✓),
    // und `presentSlideLayoutKind` (:49-51 ✓) übersetzt **hin**. Eine Übersetzung **zurück** gibt es nicht.*
    // *Und `snapshotSlides(slides: readonly PresentSlide[]): PresentSlide[]`
    // (`review/presentReviewCollaboration.ts:114` ✓) nimmt und gibt **`PresentSlide`** — die Version hält also
    // **Speicher**-Folien, und `'title'` ist dort **kein gültiger Wert** ✗✓.*
    // *Der **Befund**, der dabei anfiel:* `PresentSlideLayoutKind` enthält `'title'` und `'two-column'`, die in
    // `PRESENT_LAYOUTS` **fehlen** — *zwei Werte, die nur auf **einer** Seite existieren, und `presentSlideLayoutPreset`
    // übersetzt sie mit einem `switch` von Hand zurück* ✗✓✓.
    versions: [{ id: 'v-1', label: 'Draft 1', author: 'Author', timestamp: 1_700_000_000_000, slides: [{ id: 'slide-a', title: 'Astraea FY26', subtitle: '', layout: 'blank' }] }],
      review: { status: 'in-review', reviewMode: true, approvals: [] },
    },
    masters: [
      { id: 'master-clean', name: 'Clean Standard', showFooter: true, footerText: 'VisionGaiaTechnology' },
      { id: 'master-board', name: 'Board Review', accentColor: '#eab308' },
    ],
    themes: [
      { id: 'executive', name: 'Executive Gold', backgroundColor: '#111111', surfaceColor: '#1c1917', titleColor: '#fef08a', bodyColor: '#d6d3d1', accentColor: '#eab308', fontFamily: 'Georgia, serif' },
    ],
    packagedFonts: [{ id: 'font-1', name: 'VGT Sans', mimeType: 'font/woff2', dataUrl: 'data:font/woff2;base64,AA==', sizeBytes: 2, licenseConfirmedAt: 1_700_000_000_000 }],
  });
}

describe('Paket 1–33 · WOM/Persistenz: Save → Close → Reopen liefert identische Nutzdaten', () => {
  it('returns a byte-identical payload for a deck that uses every field the layer owns', () => {
    const saved = fullDeck();
    const { reopened } = saveCloseReopen(saved);
    // `toEqual` on the whole model is the measured statement: no field invented, none lost.
    expect(reopened).toEqual(saved);
  });

  it('keeps the payload byte-identical through a SECOND Save → Close → Reopen cycle', () => {
    // `toEqual` above compares values; this compares the bytes the shipping canonical writer produces
    // for the payload. They are stable across repeated cycles, which is the property a "reopen shows
    // what was saved" claim actually needs: the first cycle may not leave a different deck behind
    // that the second cycle then keeps changing again.
    const { serialized: afterFirst } = saveCloseReopen(fullDeck());
    const afterSecond = serializeWorkspaceDocumentCanonical(envelope(ensurePresentDesign(
      deserializeWorkspaceDocumentCanonical(afterFirst).presentData as PresentDocumentModel,
    )));
    expect(afterSecond).toBe(afterFirst);
  });

  it('keeps an authored EMPTY theme/master list empty instead of resurrecting the built-in seeds', () => {
    // This is the defect that was measured before the fix: `ensurePresentDesign` replaced an empty
    // array with DEFAULT_PRESENT_THEMES (5) / DEFAULT_PRESENT_MASTERS (4) on **every** read, so a
    // deck persisted with an empty list came back carrying content nobody authored.
    const saved = ensurePresentDesign({ slides: createEmptyPresentDeck({ slideId: 'slide-only' }).slides, themes: [], masters: [] });
    expect(saved.themes).toEqual([]);
    expect(saved.masters).toEqual([]);
    const { reopened } = saveCloseReopen(saved);
    expect(reopened.themes).toEqual([]);
    expect(reopened.masters).toEqual([]);
    expect(reopened).toEqual(saved);
  });

  it('still fills a field that is genuinely ABSENT, because "absent" is not "authored empty"', () => {
    const partial = { slides: [], themeId: 'midnight' } as unknown as PresentDocumentModel;
    const design = ensurePresentDesign(partial);
    // Absent collections get the documented default...
    expect(design.themes?.length).toBeGreaterThan(0);
    expect(design.masters?.length).toBeGreaterThan(0);
    expect(design.notesMaster).toBeDefined();
    expect(design.handoutMaster).toBeDefined();
    // ...while a field that is present is never replaced.
    expect(design.themeId).toBe('midnight');
    expect(design.slides).toEqual([]);
  });

  it('is idempotent: reopening an already reopened deck changes nothing', () => {
    const saved = fullDeck();
    const once = saveCloseReopen(saved).reopened;
    const twice = saveCloseReopen(once).reopened;
    expect(twice).toEqual(once);
    expect(ensurePresentDesign(once)).toEqual(once);
  });

  it('keeps an intentionally EMPTY deck empty across the cycle instead of seeding demo slides', () => {
    // Two claims live in this title, and until now only the first one was measured. The body ran the
    // canonical writer → reader → `ensurePresentDesign` and compared arrays; it never rendered. So
    // `PresentCanvas.tsx` could keep doing
    // `presentData.slides.length > 0 ? presentData.slides : DEFAULT_PRESENT_SLIDES` — which it did —
    // and this test stayed green while an authored empty deck came up as the three-slide demo deck.
    const saved = ensurePresentDesign({ slides: [], themes: [], masters: [] });
    const { reopened } = saveCloseReopen(saved);
    expect(reopened.slides).toEqual([]);
    expect(reopened).toEqual(saved);

    // ...and the reopen *render* must show an empty deck, not the demo deck it used to seed.
    const html = renderPresentCanvas(reopened);
    for (const marker of DEMO_DECK_MARKERS) {
      expect(html, `an authored empty deck must not render the built-in slide "${marker}"`).not.toContain(marker);
    }
    expect(html).toContain('data-present-empty-deck="true"');
  });

  it('preserves every documented stable ID and the slide order across the cycle', () => {
    const saved = fullDeck();
    const { reopened } = saveCloseReopen(saved);
    expect(reopened.slides.map((slide) => slide.id)).toEqual(saved.slides.map((slide) => slide.id));
    expect(reopened.slides[0].images?.map((image) => image.id)).toEqual(['img-a']);
    expect(reopened.slides[1].sceneObjects?.map((object) => object.id)).toEqual(['obj-b', 'obj-diagram']);
    expect(reopened.sections?.map((section) => section.id)).toEqual(['sec-1']);
    expect(reopened.customShows?.map((show) => show.id)).toEqual(['show-1']);
    expect(reopened.packagedFonts?.map((font) => font.id)).toEqual(['font-1']);
  });

  it('refuses to persist a payload the canonical writer cannot store, instead of writing NaN', () => {
    // A torn document is read, not rejected by the app — but the *host boundary* is where a
    // non-finite geometry dies. It never reaches a renderer as a number, because it can never be
    // written. The app's read of a storable payload adds no replacement value of its own.
    const torn = envelope({
      slides: [
        { id: 'torn-1', title: 'T', subtitle: '', layout: 'blank', sceneObjects: [{ id: 'o-1', kind: 'text', text: 'x', xPercent: Number.NaN, yPercent: 0, widthPercent: 10, heightPercent: 10 }] as never },
        { id: 'torn-2', title: '', subtitle: '', layout: 'not-a-layout' as never },
      ],
      themes: [],
      masters: [],
    } as unknown as PresentDocumentModel);
    expect(() => serializeWorkspaceDocumentCanonical(torn)).toThrow();
    const readable = ensurePresentDesign({ slides: torn.presentData!.slides, themes: [], masters: [] });
    expect((readable.slides[0].sceneObjects?.[0] as never as { xPercent: number }).xPercent).toBeNaN();
    // A payload that IS storable but incomplete is repaired, never seeded with slide content.
    const repaired = ensurePresentDesign(deserializeWorkspaceDocumentCanonical(
      serializeWorkspaceDocumentCanonical(envelope({ slides: [], themes: [], masters: [] })),
    ).presentData as PresentDocumentModel);
    expect(repaired.slides).toEqual([]);
    expect(repaired.themes).toEqual([]);
    // The same claim again, now on the render the reopen produces — not only on the array it returns.
    expect(renderPresentCanvas(repaired)).not.toContain(DEMO_DECK_MARKERS[0]);
  });

  it('keeps the deck readable for the consumers that fall back at the point of use', () => {
    // Removing the seed from the read path may not break rendering: every consumer states its own
    // fallback, which is exactly why the seed was never needed here.
    const withoutMasters = ensurePresentDesign({ slides: [{ id: 's', title: 'S', subtitle: '', layout: 'blank', masterId: 'master-board' }], themes: [], masters: [] });
    expect(resolvePresentMasterId(withoutMasters, withoutMasters.slides[0])).toBeTruthy();
    expect(resolvePresentSlideDesign(withoutMasters.slides[0], withoutMasters).backgroundColor).toBeTruthy();
    expect(listPresentMasterDependents(withoutMasters)).toEqual([]);
  });

  it('does not carry process-local view state into the persisted payload', () => {
    // Slide/zoom/selection/presenter runtime are session state by design; they must not be part of
    // what a reopen compares, and they must not appear in the saved payload.
    const saved = fullDeck();
    const { serialized } = saveCloseReopen(saved);
    for (const key of ['activeSlideIdx', 'currentView', 'selectedSceneObjectIds', 'zoom', 'isPresenterMode', '__uiState']) {
      expect(serialized, key).not.toContain(key);
    }
  });

  it('changes nothing about undo/redo: a reopen is not an edit', () => {
    // The reopen path must not itself produce a document that differs from the saved one; if it did,
    // every reopen would create an undo entry for a change the user never made.
    const saved = fullDeck();
    const { reopened } = saveCloseReopen(saved);
    expect(reopened).toEqual(saved);
  });
});

describe('Paket 15 · Grid-Live-Verknüpfung: eine unlesbare Quelle darf den Editor nicht mitnehmen', () => {
  const gridDocument = Object.values(initialDocs).find((document) => document.kind === 'Grid');
  if (!gridDocument) throw new Error('Present live-link suite requires a canonical Grid source.');

  const liveSlide = (): PresentSlide => ({
    id: 'live-slide',
    title: 'Live',
    subtitle: '',
    layout: 'blank',
    sceneObjects: [
      {
        id: 'live-obj',
        kind: 'workspace',
        integrationKind: 'grid-range',
        mode: 'Live',
        sourceDocumentId: gridDocument.id,
        sourceObjectId: 'sheet-main',
        sourceSelector: 'A1:B2',
        sourceVersion: 3,
        uri: 'vgt://workspace/document/grid/present-reference?kind=grid-range',
        title: 'Grid range',
        snapshot: { type: 'summary', metrics: [], lines: [] },
        xPercent: 71, yPercent: 28, widthPercent: 27, heightPercent: 18, zIndex: 30,
      } as never,
    ],
  });

  it('reports a failing source as a NAMED failure and leaves the stored snapshot untouched', () => {
    // No provider is installed for this test, so the port throws
    // `WorkspaceSnapshotProviderUnavailableError` exactly as it does in a window that has not
    // installed one. Before the fix that exception escaped the render effect.
    const slides = [liveSlide()];
    const result = refreshPresentLiveLinks(slides, [gridDocument]);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ slideId: 'live-slide', objectId: 'live-obj', sourceDocumentId: gridDocument.id });
    expect(result.failures[0].reason.length).toBeGreaterThan(0);
    // Fail-closed: no rewrite, so no empty undo entry and no "looks current" badge.
    expect(result.changed).toBe(false);
    expect(result.slides[0]).toBe(slides[0]);
    expect((result.slides[0].sceneObjects?.[0] as never as { sourceVersion: number }).sourceVersion).toBe(3);
  });

  it('turns the failure into visible, non-colour-only text that names the source', () => {
    const result = refreshPresentLiveLinks([liveSlide()], [gridDocument]);
    const message = describePresentLiveLinkFailures(result.failures);
    expect(message).toBeTruthy();
    expect(message).toContain(gridDocument.id);
    expect(message).toContain('could not be read');
    expect(describePresentLiveLinkFailures([])).toBeNull();
  });

  it('an object whose source is simply not open is offline, not an error', () => {
    const result = refreshPresentLiveLinks([liveSlide()], []);
    expect(result.failures).toEqual([]);
    expect(result.changed).toBe(false);
    expect(resolvePresentLinkStatus({
      object: { mode: 'Live', sourceVersion: 3, title: 'Grid range' },
      sourceVersion: null,
    })).toMatchObject({ state: 'offline', attention: true });
  });

  it('still refreshes a readable source, and only then commits', () => {
    const release = registerWorkspaceSnapshotProvider(() => ({ type: 'summary', metrics: [{ label: 'Version', value: '4' }], lines: [] }));
    try {
      const slides = [liveSlide()];
      const newer = { ...gridDocument, version: 4 };
      const result = refreshPresentLiveLinks(slides, [newer]);
      expect(result.failures).toEqual([]);
      expect(result.changed).toBe(true);
      const refreshed = result.slides[0].sceneObjects?.[0] as never as { sourceVersion: number; snapshot: { metrics: unknown[] } };
      expect(refreshed.sourceVersion).toBe(4);
      expect(refreshed.snapshot.metrics).toHaveLength(1);
      // ...and the refreshed snapshot is what survives Save → Close → Reopen.
      const model = ensurePresentDesign({ slides: result.slides, themes: [], masters: [] });
      const { reopened } = saveCloseReopen(model);
      expect(reopened).toEqual(model);
    } finally {
      release();
    }
  });

  it('the workspace object factory used above is the same one the drop zone uses', () => {
    // Guards the fixture itself: if the shape of a live object changes, this suite must fail loudly
    // instead of silently testing a hand-made object that no component produces.
    const release = registerWorkspaceSnapshotProvider(() => ({ type: 'summary', metrics: [], lines: [] }));
    try {
      const created = createPresentWorkspaceObject({
        sourceDocument: gridDocument,
        integrationKind: 'grid-range',
        mode: 'Live',
        sourceObjectId: 'sheet-main',
        sourceSelector: 'A1:B2',
      }, 'live-obj');
      expect(created).toMatchObject({ kind: 'workspace', mode: 'Live', sourceDocumentId: gridDocument.id });
    } finally {
      release();
    }
  });
});
