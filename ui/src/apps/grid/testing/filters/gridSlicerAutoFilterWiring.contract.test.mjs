// STATUS: PLATIN — Wächter: der Slicer sammelt Filterwerte nicht mehr selbst (W-313, Teil 1)
//
// `data/gridAutoFilter.ts` war **implementiert und getestet, aber von keiner Produktionsdatei importiert** — für
// den Nutzer existierte das begrenzte Wertemodell damit nicht. Der Slicer sammelte stattdessen **inline**:
// Abbruch bei 10 000 Werten **ohne Hinweis**, Sortierung über `localeCompare` (sprachabhängig!) und die
// Sammlung lief bei **jedem** Rendern.
//
// Dieser Wächter hält die Verkabelung fest. Die inhaltliche Prüfung des Modells liegt in dessen eigenem Test
// (`testing/data/gridAutoFilter.test.ts`) — hier geht es um die **Kette**, die vorher fehlte.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const slicer = ohneKommentare(readFileSync('src/apps/grid/filters/GridSlicerModal.tsx', 'utf8'));

describe('der Slicer nutzt das gemeinsame, begrenzte AutoFilter-Modell', () => {
  it('importiert und ruft es auf', () => {
    expect(slicer).toMatch(/import \{[^}]*buildAutoFilterValues[^}]*\} from '\.\.\/data\/gridAutoFilter'/u);
    expect(slicer).toContain('buildAutoFilterValues({ cells, dataRowIndices, column: slicer.column, blankLabel: copy.blanks })');
    // Das Etikett für leere Zellen muss **übersetzt** sein, nicht das englische Standardetikett des Modells.
    expect(slicer, 'Leerzellen-Etikett nicht übersetzt').toContain('blankLabel: copy.blanks');
  });

  it('sammelt die Werte nicht mehr selbst', () => {
    expect(slicer, 'eigene Sammlung ist zurück').not.toMatch(/const getDistinctValues/u);
    expect(slicer, 'eigene Set-Sammlung ist zurück').not.toMatch(/new Set<string>\(\)/u);
    // Der frühere stille Abbruch bei 10 000 Werten darf nicht zurückkommen.
    expect(slicer, 'stiller Abbruch bei 10 000 ist zurück').not.toMatch(/10_000/u);
    // Die sprachabhängige Sortierung war Teil der eigenen Sammlung.
    expect(slicer, 'localeCompare-Sortierung ist zurück').not.toMatch(/localeCompare\(/u);
  });

  it('rechnet die Werte einmal je Datenlage, nicht bei jedem Rendern', () => {
    // `useMemo` mit den Daten und der Slicer-Liste als Abhängigkeiten — vorher stand die Sammlung im Renderrumpf.
    expect(slicer).toMatch(/const filterValues = useMemo\(/u);
    expect(slicer).toMatch(/\}, \[cells, dataRowIndices, slicers\]\);/u);
    expect(slicer).toMatch(/const dataRowIndices = useMemo\(/u);
  });

  it('macht eine gekappte Werteliste sichtbar, statt sie zu verschweigen', () => {
    expect(slicer, 'Kappungshinweis fehlt').toContain('copy.valueLimit(');
    expect(slicer, 'Kappung wird nicht abgefragt').toMatch(/truncated: result\.value\.scanTruncated \|\| result\.value\.valueCapped/u);
    // Der Hinweis ist für Hilfstechnik erreichbar.
    expect(slicer).toMatch(/role="status"/u);
  });

  it('zeigt die Anzahl je Wert, damit Mehrfachbelegungen erkennbar sind', () => {
    expect(slicer).toContain('entry.count');
    expect(slicer).toContain('entry.label');
  });
});
