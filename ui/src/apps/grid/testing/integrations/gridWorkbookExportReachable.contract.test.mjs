// STATUS: PLATIN — Wächter: eine fertige Fähigkeit muss eine Oberfläche haben (W-308-Klasse)
//
// Der Arbeitsmappen-Export (`handleExportWorkbook('xlsx' | 'ods')`) war vollständig gebaut und getestet — und
// **unerreichbar**: `GridSheet.tsx` holte ihn nicht aus dem Hook ab, die Werkzeugleiste hatte keinen Menüpunkt.
// Für den Nutzer existierte die Funktion damit nicht. Dieser Wächter prüft die **Kette** vom Hook bis zum
// sichtbaren Bedienelement, damit dieselbe Lücke nicht zurückkommt.
//
// Warum kein Rendertest: Die Menüpunkte liegen in einem Portal, das erst nach dem Öffnen des Menüs entsteht
// (Zustand `moreToolsOpen`). Ohne jsdom gibt es keine Interaktion — ein Quellkontrakt prüft hier genau das,
// was sonst niemand prüft: dass die Kette **geschlossen** ist.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRID_TOOLBAR_COPY } from '../../locale/gridToolbarLocale';

const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const sheet = ohneKommentare(readFileSync('src/apps/grid/GridSheet.tsx', 'utf8'));
const bar = ohneKommentare(readFileSync('src/apps/grid/toolbar/GridFormulaBar.tsx', 'utf8'));

describe('die Exportkette ist geschlossen — vom Hook bis zum sichtbaren Knopf', () => {
  it('GridSheet holt handleExportWorkbook aus dem Hook ab', () => {
    expect(sheet, 'handleExportWorkbook wird nicht abgeholt').toContain('handleExportWorkbook');
    expect(sheet, 'nicht aus integrationActions destrukturiert').toMatch(/handleExportPdf,\s*\n\s*handleExportWorkbook,/u);
  });

  it('GridSheet reicht es an die Werkzeugleiste durch', () => {
    expect(sheet, 'onExportWorkbook wird nicht gesetzt').toContain('onExportWorkbook={handleExportWorkbook}');
  });

  it('die Werkzeugleiste bietet beide Formate an', () => {
    expect(bar).toContain("runWorkbookExport('xlsx')");
    expect(bar).toContain("runWorkbookExport('ods')");
    // Ein fehlender Handler darf **kein** totes Bedienelement erzeugen.
    expect(bar.match(/\{onExportWorkbook &&/gu)?.length, 'beide Knöpfe müssen am Handler hängen').toBe(2);
  });

  it('die Knöpfe sind während des Exports gesperrt und melden das', () => {
    // Ein zweiter Klick darf kein zweites Paket bauen; `aria-busy` sagt es der Hilfstechnik.
    expect(bar.match(/disabled=\{exportingWorkbook\}/gu)?.length).toBe(2);
    expect(bar.match(/aria-busy=\{exportingWorkbook/gu)?.length).toBe(2);
    expect(bar, 'Doppelklick-Schutz im Ausführer').toMatch(/if \(!onExportWorkbook \|\| exportingWorkbook\) return;/u);
  });

  it('jeder Knopf hat einen zugänglichen Namen aus dem Sprachkatalog', () => {
    expect(bar).toContain('aria-label={copy.downloadXlsx}');
    expect(bar).toContain('aria-label={copy.downloadOds}');
  });
});

describe('die Beschriftungen existieren in jeder Sprache', () => {
  const sprachen = Object.keys(GRID_TOOLBAR_COPY);

  it('es sind alle Sprachen vorhanden', () => {
    expect(sprachen.length).toBeGreaterThanOrEqual(7);
  });

  for (const sprache of sprachen) {
    it(`${sprache} nennt beide Formate und die Dateiendung`, () => {
      const copy = GRID_TOOLBAR_COPY[sprache];
      expect(copy.downloadXlsx, `${sprache}.downloadXlsx fehlt`).toBeTruthy();
      expect(copy.downloadOds, `${sprache}.downloadOds fehlt`).toBeTruthy();
      // Der Nutzer muss die **Dateiendung** sehen — daran erkennt er, was er bekommt.
      expect(copy.downloadXlsx).toContain('.xlsx');
      expect(copy.downloadOds).toContain('.ods');
    });
  }
});
