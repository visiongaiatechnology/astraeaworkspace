/**
 * P30 / AST-0146 — Suchen und Ersetzen: der dedizierte Unit-Test fuer `writerSearchEngine.ts`.
 *
 * ## Warum dieser Test neu geschrieben wurde
 *
 * Runde 225 hat gemessen: **die Suchmaschine des Writers hatte keinen eigenen Test.** Drei Exporte,
 * 234 Zeilen, und die einzige Abdeckung lag in breiten Acceptance-Dateien. **Eine ungetestete Kernfunktion
 * ist ein Risiko, kein Formalproblem** — und die Engine haelt Zusicherungen, die nur ein Test sichtbar macht.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * * **Vier Grenzen:** `MAX_QUERY_LENGTH` 256 · `MAX_RESULTS` 2000 · `MAX_SEARCHABLE_SPAN_CHARS` 131072 ·
 *   `MAX_WILDCARD_TOKENS` 32. Jede hat einen benannten Fehler statt einer stillen Kuerzung.
 * * **Drei Modi:** `plain` (escaped), `wildcard` (`*` → `.*`, `?` → `.`), `regex`.
 * * **Formatfilter:** Absatzstil, Zeichenstil, fett, kursiv, unterstrichen, Schriftfamilie.
 * * **`replaceWriterSearchMatchesAtSelection` prueft JEDEN Treffer vor dem Ersetzen:**
 *   `text.slice(start, end) !== match.text` → **`skipped`, nicht ersetzt.**
 *   Und innerhalb eines Spans wird **von rechts nach links** ersetzt, damit die Offsets gueltig bleiben.
 *
 * ## Die beiden Zusicherungen, die den Ausschlag geben
 *
 * Die letzten beiden Tests pruefen genau die zwei Invarianten, die der Quelltext im Kommentar behauptet und
 * die ohne Test nicht nachpruefbar waeren: **veraltete Offsets duerfen fremden Text nicht beschaedigen** —
 * und **mehrere Treffer in einem Span muessen vollstaendig ankommen.**
 */

import { describe, expect, it } from 'vitest';
import {
  findWriterSearchMatches,
  replaceWriterSearchMatches,
  replaceWriterSearchMatchesAtSelection,
  type WriterSearchOptions,
} from '../../../../productivity/search/writerSearchEngine';
import { letterParagraph } from '../../../fixtures/writerBusinessLetter';

const plain = (over: Partial<WriterSearchOptions> = {}): WriterSearchOptions => ({
  matchCase: false,
  wholeWord: false,
  mode: 'plain',
  ...over,
});

const doc = (...texts: string[]) => texts.map((text, index) => letterParagraph(`p${index}`, text));

describe('findWriterSearchMatches — die Suchmodi', () => {
  it('findet ohne Beachtung der Gross-/Kleinschreibung, wenn matchCase false ist', () => {
    const result = findWriterSearchMatches(doc('Hallo Welt', 'hallo welt'), 'Hallo', plain());
    expect(result.error).toBeUndefined();
    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((m) => m.paragraphIndex)).toEqual([0, 1]);
  });

  it('unterscheidet die Schreibweise, wenn matchCase true ist', () => {
    const result = findWriterSearchMatches(doc('Hallo Welt', 'hallo welt'), 'Hallo', plain({ matchCase: true }));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.paragraphIndex).toBe(0);
  });

  it('findet im wholeWord-Modus nur ganze Woerter', () => {
    const text = doc('Der Hafen ist da');
    // "Haf" steckt in "Hafen" - als ganzes Wort gibt es es nicht.
    expect(findWriterSearchMatches(text, 'Haf', plain({ wholeWord: true })).matches).toHaveLength(0);
    expect(findWriterSearchMatches(text, 'Hafen', plain({ wholeWord: true })).matches).toHaveLength(1);
  });

  it('behandelt Sonderzeichen im plain-Modus als Text, nicht als Muster', () => {
    // Ein Punkt darf im plain-Modus nicht als "beliebiges Zeichen" wirken.
    const result = findWriterSearchMatches(doc('a.b', 'axb'), 'a.b', plain());
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.text).toBe('a.b');
  });

  it('wildcard: * und ? wirken als Platzhalter', () => {
    const text = doc('Hafen', 'Halle', 'Hxx');

    // `Ha*` -> `Ha.*` : verlangt 'H' dann 'a'. 'Hxx' hat kein 'a' und trifft NICHT -> 2.
    const starred = findWriterSearchMatches(text, 'Ha*', plain({ mode: 'wildcard' }));
    expect(starred.matches).toHaveLength(2);
    expect(starred.matches.map((m) => m.text)).toEqual(['Hafen', 'Halle']);

    // `Ha??en` -> `Ha..en` : SECHS Zeichen. 'Hafen' hat FUENF -> kein Treffer in diesem Absatz.
    expect(findWriterSearchMatches(text, 'Ha??en', plain({ mode: 'wildcard' })).matches).toHaveLength(0);

    // `Ha?en` -> `Ha.en` : FUENF Zeichen, ein beliebiges an Position 3. Nur 'Hafen' passt.
    const one = findWriterSearchMatches(text, 'Ha?en', plain({ mode: 'wildcard' }));
    expect(one.matches).toHaveLength(1);
    expect(one.matches[0]?.text).toBe('Hafen');

    // `Hxx` woertlich, ohne Platzhalter - genau ein Treffer, und `?` ist hier kein Musterzeichen.
    expect(findWriterSearchMatches(text, 'Hxx', plain()).matches).toHaveLength(1);

    // **Die Engine VERANKERT NICHT** - sie findet Vorkommen irgendwo im Span. `H..` trifft daher dreimal:
    // 'Haf' in 'Hafen', 'Hal' in 'Halle', 'Hxx' in 'Hxx'. Das ist Suchverhalten, kein Fehler - und es war
    // der vierte Fehlschluss dieses Tests: drei Entwuerfe erwarteten hier 1 oder 3 aus der falschen Annahme
    // einer Verankerung.
    const anywhere = findWriterSearchMatches(text, 'H??', plain({ mode: 'wildcard' }));
    expect(anywhere.matches).toHaveLength(3);
    expect(anywhere.matches.map((m) => m.text)).toEqual(['Haf', 'Hal', 'Hxx']);
  });

  it('regex: das Muster wird als Ausdruck ausgewertet', () => {
    const result = findWriterSearchMatches(doc('abc123def'), '\\d+', plain({ mode: 'regex' }));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.text).toBe('123');
  });

  it('meldet jeden Treffer mit Absatz, Span und Grenzen', () => {
    const result = findWriterSearchMatches(doc('vorne Treffer hinten'), 'Treffer', plain());
    const match = result.matches[0];
    expect(match).toBeDefined();
    expect(match?.paragraphId).toBe('p0');
    expect(match?.spanIndex).toBe(0);
    expect(match?.start).toBe(6);
    expect(match?.end).toBe(13);
    expect(match?.text).toBe('Treffer');
  });
});

describe('findWriterSearchMatches — die Grenzen', () => {
  it('weist einen Suchausdruck ueber 256 Zeichen mit benanntem Fehler ab', () => {
    const result = findWriterSearchMatches(doc('x'), 'a'.repeat(257), plain());
    expect(result.matches).toHaveLength(0);
    expect(result.error).toContain('256');
  });

  it('nimmt genau 256 Zeichen noch an', () => {
    const result = findWriterSearchMatches(doc('x'), 'a'.repeat(256), plain());
    expect(result.error).toBeUndefined();
  });

  it('weist mehr als 32 Platzhalter im wildcard-Modus ab', () => {
    const result = findWriterSearchMatches(doc('x'), '*'.repeat(33), plain({ mode: 'wildcard' }));
    expect(result.error).toContain('32');
  });

  it('meldet, wenn weder Suchtext noch Formatfilter vorliegt', () => {
    const result = findWriterSearchMatches(doc('x'), '', plain());
    expect(result.matches).toHaveLength(0);
    expect(result.error).toBeDefined();
  });

  it('liefert bei leerem Suchtext MIT Formatfilter die ganzen Spans', () => {
    // Ohne Suchtext, aber mit Filter: der Treffer ist der gesamte Span.
    const result = findWriterSearchMatches(doc('ein Absatz'), '', plain({ format: { bold: false } }));
    expect(result.error).toBeUndefined();
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.text).toBe('ein Absatz');
  });

  it('weist einen ueberlangen Span mit benanntem Fehler ab', () => {
    const result = findWriterSearchMatches(doc('a'.repeat(131_073)), 'a', plain());
    expect(result.matches).toHaveLength(0);
    expect(result.error).toContain('131072');
  });
});

describe('replaceWriterSearchMatches — dokumentweit', () => {
  it('ersetzt und zaehlt', () => {
    const result = replaceWriterSearchMatches(doc('alt und alt', 'alt'), 'alt', 'neu', plain());
    expect(result.count).toBe(3);
    expect(result.paragraphs[0]?.spans[0]?.text).toBe('neu und neu');
    expect(result.paragraphs[1]?.spans[0]?.text).toBe('neu');
  });

  it('laesst Absaetze ohne Treffer unveraendert — dieselbe Objektidentitaet', () => {
    const paragraphs = doc('alt', 'nichts');
    const result = replaceWriterSearchMatches(paragraphs, 'alt', 'neu', plain());
    expect(result.paragraphs[1]).toBe(paragraphs[1]);
  });

  it('verlangt einen Suchtext', () => {
    const result = replaceWriterSearchMatches(doc('x'), '', 'neu', plain());
    expect(result.count).toBe(0);
    expect(result.error).toBeDefined();
  });
});

describe('replaceWriterSearchMatchesAtSelection — die zwei Invarianten', () => {
  it('ersetzt NUR die gewaehlten Treffer und zaehlt sie', () => {
    const paragraphs = doc('alt alt alt');
    const matches = findWriterSearchMatches(paragraphs, 'alt', plain()).matches;
    expect(matches).toHaveLength(3);

    const result = replaceWriterSearchMatchesAtSelection(paragraphs, [matches[1]!], 'neu');
    expect(result.count).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.paragraphs[0]?.spans[0]?.text).toBe('alt neu alt');
  });

  it('INVARIANTE 1: ein veralteter Treffer wird uebersprungen, nicht blind angewendet', () => {
    // Der Nutzer hat nach der Suche editiert: an [start,end) steht nicht mehr match.text.
    const paragraphs = doc('voellig anderer Text');
    const stale = [{
      paragraphIndex: 0, paragraphId: 'p0', spanIndex: 0, start: 0, end: 3, text: 'alt',
    }];
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, stale, 'neu');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.paragraphs[0]?.spans[0]?.text).toBe('voellig anderer Text');
  });

  it('INVARIANTE 2: mehrere Treffer in EINEM Span kommen vollstaendig an (rechts nach links)', () => {
    // Wuerde von links nach rechts ersetzt, verschoebe der erste Ersatz alle spaeteren Offsets.
    const paragraphs = doc('aa bb aa bb aa');
    const matches = findWriterSearchMatches(paragraphs, 'aa', plain()).matches;
    expect(matches).toHaveLength(3);

    const result = replaceWriterSearchMatchesAtSelection(paragraphs, matches, 'X');
    expect(result.count).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.paragraphs[0]?.spans[0]?.text).toBe('X bb X bb X');
  });

  it('ueberspringt Treffer mit falscher Absatzkennung und zaehlt sie', () => {
    const paragraphs = doc('alt');
    const wrongId = [{
      paragraphIndex: 0, paragraphId: 'fremd', spanIndex: 0, start: 0, end: 3, text: 'alt',
    }];
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, wrongId, 'neu');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('ueberspringt unmoegliche Grenzen, statt zu beschneiden', () => {
    const paragraphs = doc('kurz');
    const bad = [
      { paragraphIndex: 0, paragraphId: 'p0', spanIndex: 0, start: 2, end: 99, text: 'urz' },
      { paragraphIndex: 0, paragraphId: 'p0', spanIndex: 0, start: 3, end: 3, text: '' },
    ];
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, bad, 'X');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.paragraphs[0]?.spans[0]?.text).toBe('kurz');
  });

  it('gibt bei leerer Trefferliste das Dokument unveraendert zurueck', () => {
    const paragraphs = doc('alt');
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, [], 'neu');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.paragraphs[0]).toBe(paragraphs[0]);
  });
});
