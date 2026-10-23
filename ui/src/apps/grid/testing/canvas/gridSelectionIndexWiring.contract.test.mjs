// STATUS: PLATIN — Wächter: die Auswahl wird einmal je Bild geprüft, nicht je Zelle neu zerlegt
//
// Der Renderer zerlegte für **jede** sichtbare Zelle jeden ausgewählten Bereich neu (`parseGridRange` **und**
// `parseCoord`). Bei ~1.500 Zellen und mehreren Bereichen sind das pro Bild mehrere tausend Zerlegungen für
// eine Antwort, die sich innerhalb des Bildes nicht ändert. Dieser Wächter hält den Umbau fest: die
// Zellenschleife darf die alte, zerlegende Prüfung nicht mehr aufrufen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const renderer = readFileSync('src/apps/grid/canvas/gridVirtualCanvasRenderer.ts', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** Nur der Rumpf der Zellenfunktion — der Import darf den Namen nicht mehr führen. */
const drawCellBody = (() => {
  const start = renderer.indexOf('const drawCell = (colIdx: number, displayRow: number): void => {');
  if (start < 0) return '';
  const rest = renderer.slice(start);
  const ende = rest.indexOf('\n  };');
  return ende < 0 ? rest : rest.slice(0, ende);
})();

describe('der Canvas prüft die Auswahl ohne erneutes Zerlegen', () => {
  it('findet den Rumpf der Zellenfunktion', () => {
    expect(drawCellBody.length).toBeGreaterThan(100);
  });

  it('ruft die zerlegende Prüfung in der Zellenschleife nicht mehr auf', () => {
    expect(drawCellBody, 'coordInGridRange wird wieder je Zelle gerufen').not.toContain('coordInGridRange');
    expect(drawCellBody, 'selectedRanges.some(...) ist zurück').not.toMatch(/selectedRanges\.some\(/u);
    expect(drawCellBody, 'selectedRanges.find(...) ist zurück').not.toMatch(/selectedRanges\.find\(/u);
  });

  it('benutzt den einmal zerlegten Auswahlindex', () => {
    expect(renderer).toContain('parseGridSelectionBounds(selectedRanges)');
    expect(renderer).toContain('gridSelectionIndexAt(selectionBounds, colIdx, sheetRow)');
  });

  it('zerlegt genau einmal je Bild', () => {
    // **Genau ein** Aufruf je Bild. (Der Import trägt keine Klammer und zählt hier bewusst nicht mit.)
    // Ein zweiter Aufruf im Zeichenlauf würde die Verbesserung wieder aufheben.
    expect(renderer.match(/parseGridSelectionBounds\(/gu)?.length).toBe(1);
  });
});
