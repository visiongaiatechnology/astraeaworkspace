import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { DEFAULT_PRESENT_SLIDES } from '../../contracts/types';

// Ergänzung 7, verbindlich: "Present hat eine echte frei gestaltbare Folienfläche mit frei platzierbaren,
// skalierbaren und verschiebbaren Objekten."
//
// Die Maschinerie ist vollständig (Runde 145): `canvas/model/presentScene.ts` als Szenenmodell,
// `presentTransform.ts` mit `resizePresentSelection:90` für die Skalierung, `presentObjectExtensions.ts`
// mit `presentObjectTransform:158` für Platzierung und Verschiebung. **Aber kein einziger Present-Test
// rendert eine Komponente** — dieselbe Lücke, die PdfStudio bis Runde 142 hatte.
//
// ## Warum hier möglicherweise kein Shim nötig ist — gemessen, nicht angenommen
//
// `PresentCanvas.tsx` (452 Zeilen) wurde in Runde 146 auf globale Zugriffe geprüft:
//
//   window          keine einzige Referenz
//   localStorage    keine
//   document.*      ausschliesslich die **Prop** (document.title, document.version, document.presentData,
//                   document.objects, document.root_object_ids, document.id) - nicht `window.document`
//   crypto.*        crypto.randomUUID (Zeilen 115, 134, 153, 162) - in modernem Node als globalThis.crypto
//                   vorhanden
//
// Der einzige Global ist damit `crypto.randomUUID`. Sollte der Lauf dennoch an einem fehlenden Global
// scheitern, ist der Fehler die Messung - nicht die Annahme.
//
// ## Was diese Datei zusichert
//
// Nicht `html.length > 0` (das ist blind für eine leere Hülle - die Lehre aus Runde 133), sondern **Struktur**:
// das Markup muss Present-eigene Anker tragen. Gemessen: 74 verschiedene `data-present-*`, darunter
// `data-present-blank-deck` und `data-present-armed-tool`.

// Filesystem-scanning contracts in this repository exceed the 5000 ms default under a full parallel run.
vi.setConfig({ testTimeout: 60_000 });

const document: WorkspaceDocument = {
  id: 'present-startup-witness',
  title: 'Present startup witness',
  kind: 'Present',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function render(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(PresentCanvas, {
      document,
      onUpdateDocument: vi.fn(),
      workspaceDocuments: [],
      networkCapability: 'offline',
      keyVaultUnlocked: false,
      ...props,
    } as never),
  );
}

describe('PresentCanvas startup contract (Ergänzung 7)', () => {
  it('renders without throwing', () => {
    const html = render();
    expect(html.length).toBeGreaterThan(0);
  });

  it('is deterministic — two renders of the same document agree', () => {
    expect(render()).toEqual(render());
  });

  it('renders the slide canvas, not an empty shell', () => {
    const html = render();
    // At least one Present-own anchor must be present. A passenger shell would carry none.
    expect(html).toMatch(/data-present-[a-z-]+/);
  });

  it('never renders the built-in demo deck for a deck the user did not author', () => {
    // The `DEF-RE-004` residual, measured on the render (not on the payload): `PresentCanvas` used to
    // fall back to `DEFAULT_PRESENT_SLIDES` whenever `presentData.slides` was empty, so a document
    // with `presentData: { slides: [] }` came up as the three-slide built-in demo deck — and because
    // `updateSlides` writes `presentData` back, the first click would have persisted it.
    const authoredSlide: PresentSlide = {
      id: 'authored-1',
      title: 'AUTHORED-ONLY-SLIDE',
      subtitle: 'AUTHORED-ONLY-SUBTITLE',
      layout: 'blank',
    };
    const demoDeckTitles = DEFAULT_PRESENT_SLIDES.map((slide) => slide.title);

    const absent = render();
    const emptyAuthored = render({ document: { ...document, presentData: { slides: [] } } });
    const oneAuthored = render({ document: { ...document, presentData: { slides: [authoredSlide] } } });

    for (const [label, html] of [['absent presentData', absent], ['authored empty deck', emptyAuthored], ['one authored slide', oneAuthored]] as const) {
      for (const title of demoDeckTitles) {
        expect(html, `${label} must not render the built-in demo slide "${title}"`).not.toContain(title);
      }
    }
    // The authored slide is what the third case shows, and it is shown instead of the demo deck.
    expect(oneAuthored).toContain('AUTHORED-ONLY-SLIDE');
    // The first two cases are *both* nought slides, so they render the same named empty deck. The
    // former defect was not that the two were identical, but which deck they were identical *as*.
    expect(absent).toContain('data-present-empty-deck="true"');
    expect(emptyAuthored).toContain('data-present-empty-deck="true"');
    expect(emptyAuthored).toEqual(absent);
  });
});
