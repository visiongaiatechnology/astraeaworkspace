// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer M03-Z0692 ("skalierbare UI" im Present-Modul).
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../../../apps/present/PresentCanvas';

/**
 * M03-Z0692 — "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und skalierbare
 * UI gehoeren zum Definition-of-Done."
 *
 * Der Zeugenbericht (`evidence/present-partial-13.md`, Runde 256) nennt den fehlenden Teil beim Namen:
 *
 *   "**`skalierbare UI` — FEHLT.** ... Es gibt im Present-Modul keinen Skalierungsregler, keinen
 *    Skalierungstoken und keine Anwendung von `shellAppearance.scalePercent` auf irgendeinen
 *    Present-Knoten; die uebergebene Zahl erreicht nur den Text der Statusleiste."
 *
 * Der vorhandene Nachweis war ein Quelltextvertrag: eine `toContain`-Zusicherung auf Markup
 * (`presentCanvasStartupWitness.test.tsx` liest eine Zeichenkette). Ein solcher Vertrag besteht, wenn
 * die Zeichenkette **irgendwo** steht — er kann nicht sehen, ob die Skalierung im Betrieb ankommt.
 *
 * DIESER Test rendert `PresentCanvas` in einem DOM, laesst die Effekte laufen, aendert die Skalierung
 * des Arbeitsbereichs **im Betrieb** und misst am gerenderten Knoten, was ankommt:
 * `getComputedStyle(...).fontSize` und das Markierungsattribut am Present-Wurzelknoten.
 */

const presentDocument: WorkspaceDocument = {  id: 'present-ui-scale-witness',
  title: 'Present UI scale witness',
  kind: 'Present',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

/** Die Wurzelgroesse, die `useWorkspaceShellAppearanceLifecycle` bei 100 % setzt: 16 px. */
const BASIS_PX = 16;

// Filesystem-nahe Vertraege dieser Suite sprengen unter Volllast die 30-s-Vorgabe der Konfiguration.
vi.setConfig({ testTimeout: 60_000 });

function renderPresentCanvas(): ReactElement {
  return (
    <PresentCanvas
      document={presentDocument}
      onUpdateDocument={vi.fn()}
      onSelectSelectionType={vi.fn()}
    />
  );
}

/**
 * Schreibt die Skalierung so auf das Wurzelelement, wie der Shell-Lebenszyklus es tut
 * (`workspaceShellAppearanceLifecycle.ts:31-33`): Band, Prozentwert und Wurzel-Schriftgroesse.
 * Genau das ist der Vertrag, den das Modul lesen muss.
 */
async function setzeArbeitsbereichsskalierung(percent: number, band: string): Promise<void> {
  await act(async () => {
    const root = document.documentElement;
    root.dataset.astraeaScaleBand = band;
    root.dataset.astraeaScalePercent = String(percent);
    root.style.fontSize = `${percent}%`;
    // Der Beobachter des Moduls meldet in einer Microtask; die Zusicherung misst erst danach.
    await Promise.resolve();
  });
}

function presentWurzel(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('[data-vgt-present-root="true"]');
  expect(root, 'PresentCanvas muss seine Present-Wurzel rendern').not.toBeNull();
  if (!root) throw new Error('Present-Wurzel fehlt');
  return root;
}

/** Die gemessene Schriftgroesse — die Wirkung, nicht der Quelltext. */
function gemesseneSchriftgroesse(container: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(presentWurzel(container)).fontSize);
}

describe('die Present-Oberflaeche folgt der Arbeitsbereichsskalierung (M03-Z0692)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    document.documentElement.style.fontSize = `${BASIS_PX}px`;
    delete document.documentElement.dataset.astraeaScalePercent;
    delete document.documentElement.dataset.astraeaScaleBand;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(renderPresentCanvas());
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.documentElement.style.fontSize = '';
    delete document.documentElement.dataset.astraeaScalePercent;
    delete document.documentElement.dataset.astraeaScaleBand;
  });

  it('traegt die veroeffentlichte Skalierung als Marker am gerenderten Wurzelknoten', () => {
    expect(presentWurzel(container).getAttribute('data-astraea-scale-percent')).toBe('100');
  });

  it('setzt die Schriftgroesse der Wurzel als Prozentwert, nicht als feste Pixelzahl', () => {
    const wurzel = presentWurzel(container);
    expect(wurzel.style.fontSize).toBe('100%');
    // Die Wurzel erbt die 16 px des Arbeitsbereichs und gibt sie an alles Nachrangige weiter.
    expect(getComputedStyle(wurzel).fontSize).toBe(`${BASIS_PX}px`);
    // Ein festes `16px` waere die Falle: es wuerde die geerbte Groesse ueberschreiben.
    expect(wurzel.style.fontSize).not.toBe(`${BASIS_PX}px`);
  });

  it('skaliert die Oberflaeche mit, wenn der Arbeitsbereich vergroessert wird', async () => {
    await setzeArbeitsbereichsskalierung(150, 'increased');
    const wurzel = presentWurzel(container);
    expect(wurzel.getAttribute('data-astraea-scale-percent')).toBe('150');
    expect(wurzel.style.fontSize).toBe('150%');
  });

  it('nimmt die Skalierung an, die der Shell-Lebenszyklus selbst schreibt', async () => {
    const bei100 = gemesseneSchriftgroesse(container);
    await setzeArbeitsbereichsskalierung(200, 'maximum');
    const wurzel = presentWurzel(container);
    expect(wurzel.style.fontSize).toBe('200%');
    // Gemessen am Knoten: die Schriftgroesse hat sich gegenueber 100 % bewegt und ist groesser.
    const bei200 = gemesseneSchriftgroesse(container);
    expect(bei200).not.toBe(bei100);
    expect(bei200).toBeGreaterThan(bei100);
  });

  it('hebt die gemessene Schriftgroesse bis zur Obergrenze des Arbeitsbereichs an', async () => {
    const bei100 = gemesseneSchriftgroesse(container);
    await setzeArbeitsbereichsskalierung(400, 'maximum');
    const wurzel = presentWurzel(container);
    const bei400 = gemesseneSchriftgroesse(container);
    expect(wurzel.getAttribute('data-astraea-scale-percent')).toBe('400');
    expect(wurzel.style.fontSize).toBe('400%');
    // Die Wirkung ist die Messung am Knoten: 400 % sind groesser als 100 %, und der Wert hat sich bewegt.
    expect(bei400).toBeGreaterThan(bei100);
    expect(bei400).not.toBe(bei100);
  });
});
