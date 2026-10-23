// STATUS: PLATIN — Wächter: die Validierungsliste im Canvas nutzt das begrenzte, tastaturfähige Modell (W-313)
//
// Vorher rendere der Canvas **alle** Optionen einer Listenvalidierung (`matchingValidation.options.map(...)`),
// ohne Obergrenze, ohne Filterung, **ohne Tastaturbedienung** und mit hartkodiertem deutschen Titel. Das
// gemeinsame Modul bringt: höchstens 40 sichtbare Zeilen, auf 256 Zeichen gekürzte Labels, Markierung der
// Auswahl und eine **reine** Tastenzustandsmaschine (Pfeile, Pos1/Ende, Enter, Escape, Tabulator,
// Alt+Pfeil unten).
//
// Dieser Wächter hält die Kette fest — die Tastenzustandsmaschine selbst ist in
// `testing/data/gridInputValidation*.test.*` geprüft.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const canvas = ohneKommentare(readFileSync('src/apps/grid/canvas/GridTableCanvas.tsx', 'utf8'));

describe('die Validierungsliste ist begrenzt und mit der Tastatur bedienbar', () => {
  it('nutzt das gemeinsame Modul', () => {
    expect(canvas).toMatch(/import \{[^}]*buildDropdownModel[^}]*\} from '\.\.\/data\/gridInputValidation'/u);
    expect(canvas).toContain('buildDropdownModel(options, validationDropdownState');
    expect(canvas).toContain('applyDropdownKey(options, validationDropdownState, key');
  });

  it('rendert die Optionen nicht mehr unbegrenzt selbst', () => {
    expect(canvas, 'unbegrenztes options.map ist zurück').not.toMatch(/matchingValidation\.options\.map\(/u);
    expect(canvas, 'die Zeilen kommen nicht aus dem Modell').toContain('model.rows.map(');
  });

  it('ist für Hilfstechnik als Liste ausgezeichnet', () => {
    expect(canvas).toMatch(/role="listbox"/u);
    expect(canvas).toMatch(/role="option"/u);
    expect(canvas).toMatch(/aria-selected=\{row\.selected\}/u);
  });

  it('markiert die hervorgehobene Zeile sichtbar (nicht nur über Farbe allein)', () => {
    expect(canvas).toMatch(/row\.index === model\.activeVisibleIndex/u);
    // Die Markierung ist an eine Klasse gebunden, nicht an einen bloßen Zustand ohne Darstellung.
    expect(canvas).toMatch(/bg-blue-600 text-white/u);
  });

  it('kennt jede Taste, die das Modell versteht', () => {
    for (const taste of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', 'Tab']) {
      expect(canvas, `${taste} fehlt`).toContain(`case '${taste}'`);
    }
    expect(canvas).toContain("'Alt+ArrowDown'");
  });

  it('schreibt bei Enter genau die vorgeschlagene Option', () => {
    expect(canvas).toMatch(/result\.commit !== undefined/u);
    expect(canvas).toContain('onCommitValue?.(coord, result.commit)');
  });
});
