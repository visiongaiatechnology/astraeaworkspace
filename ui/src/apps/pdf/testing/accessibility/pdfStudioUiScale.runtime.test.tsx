// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer M05-Z1113 ("skalierbare UI" im PDF Studio).
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { PdfDocumentModel } from '../../../../shared/contracts/notes-pdf/pdf/workspacePdf';
import { PdfStudio } from '../../../../apps/pdf/studio/PdfStudio';

/**
 * M05-Z1113 — "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und skalierbare
 * UI gehoeren zum Definition-of-Done."
 *
 * Der Zeugenbericht (`evidence/pdf-studio-partial-7.md`, Runde 258) nennt den fehlenden Teil beim Namen:
 *
 *   "Der PDF-Block hat davon **nichts Modulspezifisches**: `data-astraea-scale-band` kommt in
 *    `ui/src/apps/pdf/**` **0-mal** vor (gemessen) ... Die Typografie der Modul-Oberflaeche skaliert
 *    **nicht** mit: 334 feste `text-[Npx]`-Klassen gegenueber 141 rem-basierten `text-*`-Klassen."
 *
 * Der vorhandene Nachweis war ein Quelltextvertrag auf CSS und Markup
 * (`pdfStudioTheme.test.mjs`, `PdfToolbar.layout.test.tsx`) — beide lesen Zeichenketten.
 *
 * DIESER Test rendert `PdfStudio` in einem DOM, laesst die Effekte laufen, aendert die Skalierung des
 * Arbeitsbereichs **im Betrieb** und misst am gerenderten Knoten, was ankommt.
 *
 * Beide Renderpfade werden geprueft: der strukturierte (`[data-vgt-pdf-root="true"]`) und der native
 * (`document.pdfData.rawPdfDataUrl`, der ohne dieses Merkmal rendert).
 */

const BASIS_PX = 16;

// Filesystem-nahe Vertraege dieser Suite sprengen unter Volllast die 30-s-Vorgabe der Konfiguration.
vi.setConfig({ testTimeout: 60_000 });

function pdfDokument(): WorkspaceDocument {
  return {
    id: 'pdf-ui-scale-witness',
    title: 'PDF UI scale witness',
    kind: 'PdfStudio',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

function nativerPdfDokument(): WorkspaceDocument {
  const base = pdfDokument();
  // Der native Pfad haengt an `pdfData.rawPdfDataUrl`; das Modell muss vollstaendig sein, weil der
  // Studio-Zustand `redactions` und `pages` liest, bevor er rendert.
  const pdfData: PdfDocumentModel = {
    numPages: 0,
    pages: [],
    annotations: [],
    redactions: [],
    rawPdfDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
    rawPdfFileName: 'fremd.pdf',
    rawPdfByteLength: 9,
  };
  return { ...base, pdfData };
}

function renderPdfStudio(document: WorkspaceDocument): ReactElement {
  return <PdfStudio document={document} onUpdateDocument={vi.fn()} />;
}

/**
 * Schreibt die Skalierung so auf das Wurzelelement, wie der Shell-Lebenszyklus es tut
 * (`workspaceShellAppearanceLifecycle.ts:31-33`).
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

function pdfWurzel(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('[data-vgt-pdf-root="true"]');
  expect(root, 'PdfStudio muss seine PDF-Wurzel rendern').not.toBeNull();
  if (!root) throw new Error('PDF-Wurzel fehlt');
  return root;
}

/** Die gemessene Schriftgroesse — die Wirkung, nicht der Quelltext. */
function gemesseneSchriftgroesse(element: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(element).fontSize);
}

describe('die PDF-Studio-Oberflaeche folgt der Arbeitsbereichsskalierung (M05-Z1113)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  async function baueAuf(quellDokument: WorkspaceDocument): Promise<void> {
    document.documentElement.style.fontSize = `${BASIS_PX}px`;
    delete document.documentElement.dataset.astraeaScalePercent;
    delete document.documentElement.dataset.astraeaScaleBand;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const element = renderPdfStudio(quellDokument);
    await act(async () => {
      root.render(element);
    });
  }

  beforeEach(async () => {
    await baueAuf(pdfDokument());
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
    expect(pdfWurzel(container).getAttribute('data-astraea-scale-percent')).toBe('100');
  });

  it('setzt die Schriftgroesse der Wurzel als Prozentwert, nicht als feste Pixelzahl', () => {
    const wurzel = pdfWurzel(container);
    expect(wurzel.style.fontSize).toBe('100%');
    expect(getComputedStyle(wurzel).fontSize).toBe(`${BASIS_PX}px`);
    // Ein festes `16px` waere die Falle: es wuerde die geerbte Groesse ueberschreiben.
    expect(wurzel.style.fontSize).not.toBe(`${BASIS_PX}px`);
  });

  it('skaliert die Oberflaeche mit, wenn der Arbeitsbereich vergroessert wird', async () => {
    await setzeArbeitsbereichsskalierung(150, 'increased');
    const wurzel = pdfWurzel(container);
    expect(wurzel.getAttribute('data-astraea-scale-percent')).toBe('150');
    expect(wurzel.style.fontSize).toBe('150%');
  });

  it('nimmt die Skalierung an, die der Shell-Lebenszyklus selbst schreibt', async () => {
    const bei100 = gemesseneSchriftgroesse(pdfWurzel(container));
    await setzeArbeitsbereichsskalierung(200, 'maximum');
    const wurzel = pdfWurzel(container);
    expect(wurzel.style.fontSize).toBe('200%');
    // Gemessen am Knoten: die Schriftgroesse hat sich gegenueber 100 % bewegt und ist groesser.
    const bei200 = gemesseneSchriftgroesse(wurzel);
    expect(bei200).not.toBe(bei100);
    expect(bei200).toBeGreaterThan(bei100);
  });

  it('hebt die gemessene Schriftgroesse bis zur Obergrenze des Arbeitsbereichs an', async () => {
    const bei100 = gemesseneSchriftgroesse(pdfWurzel(container));
    await setzeArbeitsbereichsskalierung(400, 'maximum');
    const wurzel = pdfWurzel(container);
    const bei400 = gemesseneSchriftgroesse(wurzel);
    expect(wurzel.getAttribute('data-astraea-scale-percent')).toBe('400');
    expect(wurzel.style.fontSize).toBe('400%');
    expect(bei400).toBeGreaterThan(bei100);
    expect(bei400).not.toBe(bei100);
  });

  it('skaliert auch den nativen Betrachterpfad, nicht nur den strukturierten', async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    await baueAuf(nativerPdfDokument());

    // Der native Pfad traegt kein `data-vgt-pdf-root`; er ist der erste Kindknoten der Wurzel.
    const nativ = container.firstElementChild;
    expect(nativ, 'der native Betrachterpfad muss rendern').not.toBeNull();
    if (!nativ || !(nativ instanceof HTMLElement)) throw new Error('nativer Pfad fehlt');
    expect(nativ.getAttribute('data-astraea-scale-percent')).toBe('100');
    await setzeArbeitsbereichsskalierung(300, 'maximum');
    expect(nativ.getAttribute('data-astraea-scale-percent')).toBe('300');
    expect(nativ.style.fontSize).toBe('300%');
    expect(gemesseneSchriftgroesse(nativ)).toBeGreaterThan(BASIS_PX);
  });
});
