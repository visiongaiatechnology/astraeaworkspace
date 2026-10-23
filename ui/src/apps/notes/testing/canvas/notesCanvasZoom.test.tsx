// STATUS: PLATIN — Notes · W-430: das **Rendering** des Leinwand-Zooms (die Quelltext-Eigenschaften stehen in
// `notesCanvasZoomWiring.contract.test.mjs` — eine `.tsx` hat keine Node-Typen für `node:fs`).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotesFreeCanvas } from '../../canvas/NotesFreeCanvas';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

function renderCanvas(): string {
  return renderToStaticMarkup(
    <NotesFreeCanvas
      canvas={{ background: 'grid', pageMode: 'infinite', pageSize: 'A4', blocks: [] }}
      onChange={noop}
      onDropFiles={asyncNoop}
    />,
  );
}

describe('W-430 — die Leinwand hat ein Zoom mit **Wort** und erreichbarer Tastatur', () => {
  it('rendert die benannte Zoom-Gruppe', () => {
    const markup = renderCanvas();
    expect(markup).toContain('aria-label="Canvas zoom"');
    expect(markup).toContain('aria-label="Zoom in canvas"');
    expect(markup).toContain('aria-label="Zoom out canvas"');
    // **Nicht allein über Farbe:** die Prozentzahl steht als Text da.
    expect(markup).toContain('Canvas zoom 100%, reset to 100 percent');
    expect(markup).toContain('100%');
  });

  it('bei 100 % sind **beide** Schritte möglich — die Ränder sind 50 % und 400 %', () => {
    // **Meine erste Erwartung war falsch:** ich hatte „bei 100 % ist Zoom-aus deaktiviert" geschrieben (aus dem
    // Tinten-Test übernommen) — aber das Minimum ist `NOTE_INK_MIN_ZOOM` = 0,5, also ist bei 100 % **beides**
    // möglich. Gemessen statt angenommen.
    const markup = renderCanvas();
    const zoomOut = markup.slice(markup.indexOf('aria-label="Zoom out canvas"') - 120, markup.indexOf('aria-label="Zoom out canvas"'));
    const zoomIn = markup.slice(markup.indexOf('aria-label="Zoom in canvas"') - 120, markup.indexOf('aria-label="Zoom in canvas"'));
    expect(zoomOut).not.toContain('disabled');
    expect(zoomIn).not.toContain('disabled');
  });

  it('die Fläche ist per Tastatur erreichbar und die gezoomte Fläche wächst im Layout', () => {
    const markup = renderCanvas();
    // Die Tastatur erreicht die Fläche …
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Free canvas surface"');
    // … und der Layout-Kasten ist **skaliert**, sonst gäbe es keinen Schwenkbereich (Zoom ohne Pan).
    expect(markup).toContain('transform:scale(1)');
    expect(markup).toContain('transform-origin:top left');
  });
});
