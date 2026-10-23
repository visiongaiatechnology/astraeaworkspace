/**
 * P32 / AST-0156 — Wort- und Zeichenzaehlung: der Vertrag von `useWriterDocumentInsights`. Mutationsgeprueft.
 *
 * ## Warum dieser Witness so aussieht
 *
 * Der Hook (64 Zeilen) ist eine `useMemo`-Huelle ueber **zwei reine Funktionen**:
 *
 * ```
 * paginateWriterSections(paragraphs, pageSetup, styles, sections,
 *                        { tables, images, mediaObjects, equations, footnotes })
 * calculateTextStatistics(paragraphs, { pageCount: pages.length, tableCount: tables.length,
 *                                       additionalTexts: [ ... ] })
 * ```
 *
 * **Der Vertrag ist deshalb nicht die Berechnung — die liegt in den beiden Funktionen. Der Vertrag ist die
 * VERDRAHTUNG: welche Quelle in welches Argument geht.**
 *
 * **Und die kritische Stelle ist `additionalTexts`:** dort speisen **fuenf** Quellen ein —
 * Tabellenspalten und -zellen, Fussnoten, Bild-Alternativtexte und -Beschriftungen, Medienobjekte und
 * Formelbeschriftungen. **Faellt eine heraus, ist die Wortzaehlung still falsch** — kein Fehler, keine
 * leere Ausgabe, nur eine zu kleine Zahl.
 *
 * ## Die Grenze, die im Test steht
 *
 * `useWriterDocumentInsights` ist ein Hook; in dieser Umgebung gibt es kein jsdom. **Dieser Witness sichert
 * die Verdrahtung im Quelltext zu, nicht die Ausgabe im Betrieb.** Die beiden delegierten Funktionen sind
 * rein und fuer sich testbar; **hier wird zugesichert, dass der Hook sie mit den richtigen Argumenten ruft.**
 *
 * ## Und die Lehre aus dem a11y-Witness (Runde 219), hier von Anfang an angewandt
 *
 * **Runde 219 hat vier Entwuerfe gebraucht, weil `toContain` auf der ganzen Datei zwei Mutationen verdeckte.**
 * Deshalb schneidet dieser Witness **Funktionskoerper heraus** und prueft die Argumentliste **innerhalb** des
 * Aufrufs — nicht irgendwo in der Datei.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = resolve(here, '../../../productivity/insights/useWriterDocumentInsights.ts');
const source = readFileSync(hookPath, 'utf8');

/** Der Text eines Aufrufs, von `name(` bis zur schliessenden Klammer auf gleicher Einrueckung. */
function callOf(callee: string): string {
  const start = source.indexOf(`${callee}(`);
  expect(start, `${callee}-Aufruf nicht gefunden`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Klammer von ${callee} nicht geschlossen`);
}

const paginateCall = callOf('paginateWriterSections');
const statsCall = callOf('calculateTextStatistics');

describe('useWriterDocumentInsights — die Verdrahtung, zugesichert', () => {
  it('delegiert die Paginierung mit allen fuenf Zusatzquellen', () => {
    expect(paginateCall).toContain('[...paragraphs]');
    expect(paginateCall).toContain('pageSetup');
    expect(paginateCall).toContain('[...styles]');
    expect(paginateCall).toContain('[...sections]');
    for (const source of ['tables', 'images', 'mediaObjects', 'equations', 'footnotes']) {
      expect(paginateCall, `${source} fehlt im Paginierungsaufruf`).toContain(`${source}: [...${source}]`);
    }
  });

  it('delegiert die Statistik mit Seitenzahl und Tabellenzahl', () => {
    expect(statsCall).toContain('[...paragraphs]');
    expect(statsCall).toContain('pageCount: pages.length');
    expect(statsCall).toContain('tableCount: tables.length');
    expect(statsCall).toContain('additionalTexts:');
  });

  it('speist ALLE FUENF Quellen in additionalTexts — die kritische Stelle', () => {
    // Eine fehlende Quelle macht die Wortzaehlung still falsch, ohne Fehler und ohne leere Ausgabe.
    expect(statsCall, 'Tabellenspalten').toContain('...table.columns');
    expect(statsCall, 'Tabellenzellen').toContain('row.cells.map((cell) => cell.content)');
    expect(statsCall, 'Fussnoten').toContain('footnotes.map((footnote) => footnote.text)');
    expect(statsCall, 'Bild-Alt-Text und Beschriftung').toContain('image.altText');
    expect(statsCall, 'Bild-Beschriftung').toContain('image.caption');
    expect(statsCall, 'Medienname').toContain('media.name');
    expect(statsCall, 'Medien-Beschriftung').toContain('media.caption');
    expect(statsCall, 'Formel-Beschriftung').toContain('equation.caption');
    // Nicht-textliche Eintraege duerfen die Zaehlung nicht verfaelschen.
    expect(statsCall, '.filter(Boolean)').toBeTruthy();
  });

  it('gibt genau beide Ergebnisse zurueck und berechnet nichts selbst', () => {
    expect(source).toContain('return { pages, stats };');
    // Der Hook darf die Statistik nicht nachrechnen - er delegiert.
    expect(source).not.toContain('split(/\\s+/)');
    expect(source).not.toContain('charCount =');
    // Genau zwei useMemo-Aufrufe, je einer pro Delegation.
    expect((source.match(/useMemo\(/g) ?? []).length).toBe(2);
  });

  it('GRENZE: Wirkung in useMemo — der Betrieb braucht ein DOM, das diese Umgebung nicht hat', () => {
    expect(source).toContain("import { useMemo } from 'react'");
    expect(source).not.toContain('useEffect');
  });
});
