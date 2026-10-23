// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer M02-Z0470 im Betrieb.
//
// Der bisherige Nachweis dieses Punktes ist ein Markup-Vertrag: `gridSheetStartupWitness.test.tsx`
// rendert nach `renderToStaticMarkup` und prueft mit `toContain('role="grid"')`. Dieselbe Datei sagt
// in ihren Kommentaren selbst, was sie nicht kann: „It statically renders React to a string once;
// it dispatches no event … The ~25 DOM handlers on GridTableCanvas are still executed by nothing."
//
// Diese Datei fuehrt genau das aus. Sie rendert die **echte** `GridSheet` in ein DOM, setzt den
// Tastaturfokus und schickt echte `keydown`-Ereignisse. Geprueft wird die Wirkung am lebenden
// DOM-Knoten, nicht eine Zeichenkette in einer Datei. Faellt die Verdrahtung
// (`GridSheet.tsx:380-385`: `tabIndex={0}` und `onKeyDown={handleKeyDownGrid}`), wird dieser Test rot.

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument, patchSheetInDocument } from '../../workbook/gridWorkbookOperations';

/** Zellinhalt, den kein Chrome-Token enthaelt: nur echter Zelltext kann ihn treffen. */
const ZELLTEXT = 'Astraea-Zelle-7f3a';

const AUSGANGSDOKUMENT: WorkspaceDocument = {
  id: 'grid-keyboard-focus-witness',
  title: 'Grid Tastatur- und Fokuswitness',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

/**
 * Ein belegtes Blatt, das der **Produktionsschreiber** baut. Ein handgeschriebenes Dokument, dessen
 * Form die Anwendung nie erzeugt, war die Ursache von DEF-RE-003 (`root_object_ids: []` ohne
 * `gridData` laesst `activeSheetModel` leer, dann rendert die Rasterflaeche gar nicht).
 */
function belegtesDokument(zoom = 100): WorkspaceDocument {
  const { updatedDocument, newSheetId } = addSheetToDocument(AUSGANGSDOKUMENT, [], 'Sheet 1', {
    cells: { A1: { value: ZELLTEXT } },
  });
  return patchSheetInDocument(updatedDocument, newSheetId, { zoom });
}

const OHNE_WIRKUNG = (): void => undefined;

interface GerendertesGrid {
  readonly container: HTMLElement;
  /** Die fokussierbare Wurzel aus `GridSheet.tsx:380-385`. */
  readonly wurzel: HTMLElement;
  readonly tabelle: HTMLTableElement;
  readonly abbauen: () => Promise<void>;
}

/** Rendert die echte Anwendung in ein hanging DOM und laesst React und die Effekte durchlaufen. */
async function rendereGrid(zoom = 100): Promise<GerendertesGrid> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactWurzel = createRoot(container);

  await act(async () => {
    reactWurzel.render(
      <GridSheet
        document={belegtesDokument(zoom)}
        workspaceDocuments={{}}
        onUpdateDocument={OHNE_WIRKUNG}
        onSelectSelectionType={OHNE_WIRKUNG}
        onCreateChart={OHNE_WIRKUNG}
        networkCapability="None"
        keyVaultUnlocked={false}
      />,
    );
  });
  // Zweiter Durchlauf: Zustand aus Effekten (aktives Blatt, Zellmodell) wird nachgereicht.
  await act(async () => {
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });

  const wurzel = container.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  const tabelle = container.querySelector<HTMLTableElement>('table[role="grid"]');
  if (!wurzel || !tabelle) {
    throw new Error('Das Grid hat seine Wurzel oder seine Rasterflaeche nicht gerendert.');
  }

  return {
    container,
    wurzel,
    tabelle,
    abbauen: async () => {
      await act(async () => {
        reactWurzel.unmount();
      });
      container.remove();
    },
  };
}

/** Schickt einen echten Tastendruck auf ein Element und laesst React durchlaufen. */
async function taste(ziel: HTMLElement, key: string): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  return ereignis;
}

/**
 * Die Datenzeilen des Rasters. Bewusst ueber `querySelectorAll` und nicht ueber
 * `HTMLTableElement.tBodies`/`rows`: happy-dom implementiert diese Sammlungen nicht
 * (gemessen — `tBodies` ist dort `undefined`), der DOM-Baum selbst ist vollstaendig.
 */
function datenzeilen(tabelle: HTMLTableElement): Element[] {
  return Array.from(tabelle.querySelectorAll('tbody tr'));
}

/** Die Kopfzeile der Spaltenbeschriftungen. */
function kopfzeile(tabelle: HTMLTableElement): Element | null {
  return tabelle.querySelector('thead tr');
}

/** Die Datenzelle der Zeile `zeile`/Spalte `spalte` (Index 0 ist der Zeilenkopf). */
function datenzelle(tabelle: HTMLTableElement, zeile: number, spalte: number): Element | null {
  const reihe = datenzeilen(tabelle)[zeile];
  return reihe ? Array.from(reihe.children)[spalte] ?? null : null;
}

describe('M02-Z0470 — das Grid ist im Betrieb bedienbar', () => {
  it('ist als Tastaturziel ausgezeichnet und bedient von dort die Auswahl', async () => {
    const grid = await rendereGrid();
    try {
      // GEMESSEN: happy-dom setzt `document.activeElement` auch fuer ein Element ohne
      // `tabIndex` — `expect(document.activeElement).toBe(wurzel)` allein ist dort also NICHT
      // falsifizierbar. Die Zusicherung, dass die Wurzel ein Tastaturziel ist, traegt deshalb
      // die Auszeichnung am lebenden Knoten; der Tastendruck darunter belegt, dass genau
      // dieses Ziel die Auswahl bedient.
      expect(grid.wurzel.getAttribute('tabindex')).toBe('0');
      grid.wurzel.focus();
      expect(document.activeElement).toBe(grid.wurzel);

      const ereignis = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      await act(async () => {
        document.activeElement?.dispatchEvent(ereignis);
        await new Promise((erfuellt) => setTimeout(erfuellt, 0));
      });
      expect(ereignis.defaultPrevented).toBe(true);
      expect(datenzelle(grid.tabelle, 0, 2)?.getAttribute('data-vgt-grid-selection')).toBe('active-cell');
    } finally {
      await grid.abbauen();
    }
  });

  it('bewegt die aktive Zelle mit einem echten ArrowDown im DOM', async () => {
    const grid = await rendereGrid();
    try {
      const vorher = datenzelle(grid.tabelle, 0, 1);
      expect(vorher).not.toBeNull();
      expect(vorher?.getAttribute('data-vgt-grid-selection')).toBe('active-cell');
      expect(vorher?.getAttribute('aria-selected')).toBe('true');

      const ereignis = await taste(grid.wurzel, 'ArrowDown');
      // Der Tastendruck ist wirklich verarbeitet worden, nicht nur durchgereicht.
      expect(ereignis.defaultPrevented).toBe(true);

      const nachher = datenzelle(grid.tabelle, 1, 1);
      expect(nachher).not.toBeNull();
      expect(nachher?.getAttribute('data-vgt-grid-selection')).toBe('active-cell');
      expect(nachher?.getAttribute('aria-selected')).toBe('true');
      // Genau eine Zelle ist die aktive.
      expect(grid.tabelle.querySelectorAll('[data-vgt-grid-selection="active-cell"]').length).toBe(1);
    } finally {
      await grid.abbauen();
    }
  });

  it('oeffnet mit F2 den Inline-Editor in der aktiven Zelle und zieht den Fokus hinein', async () => {
    // GR-003 (M1): Enter gehoert der Navigation (eine Zeile nach unten, wie in Excel/Calc),
    // der Editor oeffnet mit F2 bzw. Doppelklick. Der alte Test kodierte Enter und damit die
    // falsche Richtung — die Fokusfuehrung selbst ist unveraendert.
    const grid = await rendereGrid();
    try {
      expect(grid.tabelle.querySelector('input')).toBeNull();

      await taste(grid.wurzel, 'F2');

      const eingabe = grid.tabelle.querySelector<HTMLInputElement>('input');
      expect(eingabe).not.toBeNull();
      expect(eingabe?.closest('td')?.getAttribute('data-vgt-grid-selection')).toBe('active-cell');
      // Die Fokusfuehrung selbst: `state/useGridState.ts:179-181` zieht den Fokus in den Editor.
      expect(document.activeElement).toBe(eingabe);

      // Und Enter navigiert weiter, statt den Editor zu oeffnen.
      await taste(grid.wurzel, 'Escape');
      await taste(grid.wurzel, 'Enter');
      expect(grid.tabelle.querySelector('input'), 'Enter startet keine Bearbeitung').toBeNull();
    } finally {
      await grid.abbauen();
    }
  });

  it('traegt die Screenreader-Semantik am lebenden Rasterknoten', async () => {
    const grid = await rendereGrid();
    try {
      expect(grid.tabelle.getAttribute('role')).toBe('grid');
      expect(grid.tabelle.getAttribute('aria-label')).toBe('Grid Sheet 1');
      expect(Number(grid.tabelle.getAttribute('aria-rowcount'))).toBeGreaterThan(0);
      expect(Number(grid.tabelle.getAttribute('aria-colcount'))).toBeGreaterThan(0);

      // Spalten- und Zeilenkoepfe tragen ihre Indizes (GridTableCanvas.tsx:244, 308).
      expect(Array.from(kopfzeile(grid.tabelle)?.children ?? [])[1]?.getAttribute('aria-colindex')).toBe('1');
      expect(datenzelle(grid.tabelle, 0, 0)?.getAttribute('aria-rowindex')).toBe('1');

      // Der sichtbare Zelltext steht im lebenden Knoten, nicht nur im Markup.
      expect(datenzelle(grid.tabelle, 0, 1)?.textContent).toContain(ZELLTEXT);
    } finally {
      await grid.abbauen();
    }
  });

  it('setzt den Blatt-Zoom auf die gerenderte Flaeche (skalierbare UI)', async () => {
    const vergroessert = await rendereGrid(200);
    try {
      expect(vergroessert.tabelle.style.getPropertyValue('zoom')).toBe('2');
    } finally {
      await vergroessert.abbauen();
    }

    const normal = await rendereGrid(100);
    try {
      expect(normal.tabelle.style.getPropertyValue('zoom')).toBe('1');
    } finally {
      await normal.abbauen();
    }
  });
});
