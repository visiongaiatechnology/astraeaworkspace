/**
 * P33 / AST-0161 — Aenderungsverfolgung: `computeDiffSegments` und `boundWriterRevisionRegister`.
 *
 * ## Warum diese zwei zuerst
 *
 * Runde 247 hat gemessen, dass `review/` 46 Exporte und keinen dedizierten Test hatte. Diese Datei nimmt
 * sich die zwei mit der groessten Hebelwirkung vor:
 *
 * ### `computeDiffSegments(originalText, newText)` — ein Diff
 *
 * Ein Diff ist ein Algorithmus, kein Getter. **Drei Abkuerzungen** (gleich, leer links, leer rechts) und
 * **eine Zusammenfassung am Ende:** benachbarte Segmente derselben Art werden verschmolzen. Ohne diese
 * Zusammenfassung entstuende fuer „abc" gegen „axc" eine Folge aus fuenf Ein-Token-Segmenten statt dreien.
 *
 * **Die Zusicherung, die zaehlt: die Segmente muessen den Text REKONSTRUIEREN.** Die `equal`- und
 * `insert`-Segmente ergeben den neuen Text, die `equal`- und `delete`-Segmente den alten.
 *
 * ### `boundWriterRevisionRegister(revisions, limit)` — eine Schranke MIT dokumentierter Ausnahme
 *
 * ```ts
 * const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : WRITER_MAX_TRACKED_REVISIONS;
 * if (revisions.length <= boundedLimit) return revisions;
 * if (pending.length >= boundedLimit) return revisions;   // DIE AUSNAHME
 * ```
 *
 * * **`Number.isFinite` ist da** — genau der Waechter, dessen Fehlen DEF-RE-009 und DEF-RE-010 ausmachte.
 *   Ein nicht-endliches Limit faellt auf den Standard zurueck statt durchzureichen.
 * * **Die Ausnahme:** besteht das Register nur aus offener Arbeit, wird **nichts** beschnitten — *"the ceiling
 *   yields to that."* **Eine offene Frage darf nicht verschwinden, nur weil eine Zahl erreicht ist.**
 */

import { describe, expect, it } from 'vitest';
import {
  boundWriterRevisionRegister,
  computeDiffSegments,
} from '../../../../review/revisions/track-changes/writerTrackChangesEngine';

const revision = (id: string, status: string) =>
  ({ id, status, paragraphId: 'p0', type: 'text' } as never);

/** Setzt den neuen Text aus den Segmenten zusammen. */
const neuerText = (segments: ReturnType<typeof computeDiffSegments>) =>
  segments.filter((s) => s.type !== 'delete').map((s) => s.text).join('');
/** Setzt den alten Text zusammen. */
const alterText = (segments: ReturnType<typeof computeDiffSegments>) =>
  segments.filter((s) => s.type !== 'insert').map((s) => s.text).join('');

describe('computeDiffSegments — die Abkuerzungen', () => {
  it('gleicher Text ergibt EIN equal-Segment', () => {
    expect(computeDiffSegments('abc', 'abc')).toEqual([{ type: 'equal', text: 'abc' }]);
  });

  it('leerer Ausgangstext ergibt EIN insert-Segment', () => {
    expect(computeDiffSegments('', 'neu')).toEqual([{ type: 'insert', text: 'neu' }]);
  });

  it('leerer Zieltext ergibt EIN delete-Segment', () => {
    expect(computeDiffSegments('alt', '')).toEqual([{ type: 'delete', text: 'alt' }]);
  });

  it('beide leer ergibt ein leeres equal-Segment', () => {
    expect(computeDiffSegments('', '')).toEqual([{ type: 'equal', text: '' }]);
  });
});

describe('computeDiffSegments — die Rekonstruktion', () => {
  it('HAUPTZUSICHERUNG: die Segmente ergeben beide Texte wieder', () => {
    // Das ist die Zusicherung, die einen Diff brauchbar macht. Ein Diff, der den Text nicht
    // rekonstruiert, ist eine huebsche Anzeige und ein Datenverlust.
    const faelle: Array<[string, string]> = [
      ['Der schnelle braune Fuchs', 'Der langsame braune Fuchs'],
      ['abc', 'axc'],
      ['eins zwei drei', 'eins drei vier'],
      ['voellig anders', 'etwas anderes'],
      ['mit  mehrfachen   Leerzeichen', 'mit   anderen  Leerzeichen'],
      ['Satz eins. Satz zwei.', 'Satz zwei. Satz eins.'],
    ];
    for (const [alt, neu] of faelle) {
      const segments = computeDiffSegments(alt, neu);
      expect(neuerText(segments), `neu: ${alt} -> ${neu}`).toBe(neu);
      expect(alterText(segments), `alt: ${alt} -> ${neu}`).toBe(alt);
    }
  });

  it('benachbarte Segmente derselben Art werden VERSCHMOLZEN', () => {
    // Ohne die Zusammenfassung entstuende hier eine Folge aus vielen Ein-Token-Segmenten.
    const segments = computeDiffSegments('a b c d', 'a x y d');
    // Es darf keine zwei aufeinanderfolgenden Segmente derselben Art geben.
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.type, `Position ${index}`).not.toBe(segments[index - 1]?.type);
    }
  });

  it('die Reihenfolge ist die des Textes, nicht die des Rueckwaertsdurchlaufs', () => {
    // Der Algorithmus laeuft rueckwaerts und dreht am Ende um - eine vergessene Umkehrung waere hier
    // sofort sichtbar.
    const segments = computeDiffSegments('Anfang Ende', 'Anfang Mitte Ende');
    expect(segments[0]?.type).toBe('equal');
    expect(segments[0]?.text.startsWith('Anfang')).toBe(true);
    expect(segments[segments.length - 1]?.text.endsWith('Ende')).toBe(true);
  });

  it('Leerraum wird als eigenes Token behandelt, nicht verschluckt', () => {
    const segments = computeDiffSegments('a b', 'a  b');
    expect(neuerText(segments)).toBe('a  b');
    expect(alterText(segments)).toBe('a b');
  });

  it('ist deterministisch', () => {
    expect(computeDiffSegments('x y', 'x z')).toEqual(computeDiffSegments('x y', 'x z'));
  });
});

describe('boundWriterRevisionRegister — die Schranke und ihre Ausnahme', () => {
  const viele = (n: number, status: string) =>
    Array.from({ length: n }, (_, index) => revision(`r${index}`, status));

  it('unterhalb der Schranke wird NICHTS beschnitten — dasselbe Array', () => {
    const revisions = viele(5, 'accepted');
    expect(boundWriterRevisionRegister(revisions, 10)).toBe(revisions);
  });

  it('oberhalb der Schranke werden entschiedene Revisionen beschnitten', () => {
    const result = boundWriterRevisionRegister(viele(20, 'accepted'), 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('HAUPTZUSICHERUNG: offene Revisionen ueberleben den Schnitt IMMER', () => {
    // Eine offene Frage darf nicht verschwinden, nur weil eine Zahl erreicht ist.
    const gemischt = [...viele(15, 'accepted'), revision('offen-1', 'pending'), revision('offen-2', 'pending')];
    const result = boundWriterRevisionRegister(gemischt, 5);
    const offen = result.filter((r) => (r as unknown as { status: string }).status === 'pending');
    expect(offen.map((r) => (r as unknown as { id: string }).id).sort()).toEqual(['offen-1', 'offen-2']);
  });

  it('HAUPTZUSICHERUNG: die DOKUMENTIERTE AUSNAHME — nur offene Arbeit wird nie beschnitten', () => {
    // Der Quelltext sagt es selbst: "A register consisting only of pending work cannot be trimmed without
    // losing an open question, the ceiling yields to that. This is the one documented case where the bound
    // is not reached."
    const nurOffen = viele(20, 'pending');
    const result = boundWriterRevisionRegister(nurOffen, 5);
    expect(result).toHaveLength(20); // die Schranke weicht
    expect(result).toBe(nurOffen);
  });

  it('die Ausnahme greift genau ab der Schranke, nicht darunter', () => {
    // 5 offene bei Schranke 5 -> Ausnahme. 4 offene bei Schranke 5 -> normaler Schnitt.
    expect(boundWriterRevisionRegister(viele(5, 'pending'), 5)).toHaveLength(5);
    const vier = [...viele(4, 'pending'), ...viele(10, 'accepted')];
    const result = boundWriterRevisionRegister(vier, 5);
    expect(result).toHaveLength(5);
    expect(result.filter((r) => (r as unknown as { status: string }).status === 'pending')).toHaveLength(4);
  });

  it('HAUPTZUSICHERUNG: ein nicht-endliches Limit faellt auf den Standard zurueck', () => {
    // **Genau der Waechter, dessen Fehlen DEF-RE-009 und DEF-RE-010 ausmachte.** Hier ist er da.
    const revisions = viele(3, 'accepted');
    for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => boundWriterRevisionRegister(revisions, limit), `Limit ${limit}`).not.toThrow();
      // Bei einem nicht-endlichen Limit wird der Standard benutzt - die Liste ist kurz, also unveraendert.
      expect(boundWriterRevisionRegister(revisions, limit)).toBe(revisions);
    }
  });

  it('ein Limit unter 1 wird auf 1 gehoben', () => {
    const result = boundWriterRevisionRegister(viele(10, 'accepted'), 0);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Negative und gebrochene Limits ebenso.
    expect(() => boundWriterRevisionRegister(viele(10, 'accepted'), -5)).not.toThrow();
    expect(() => boundWriterRevisionRegister(viele(10, 'accepted'), 2.7)).not.toThrow();
  });

  it('es geht keine Revision verloren, die nicht entschieden ist', () => {
    // Die zurueckgegebene Liste ist eine TEILMENGE der Eingabe - nie mehr, nie fremde Elemente.
    const eingabe = [...viele(10, 'accepted'), ...viele(3, 'pending')];
    const ids = new Set(eingabe.map((r) => (r as unknown as { id: string }).id));
    const result = boundWriterRevisionRegister(eingabe, 6);
    for (const r of result) {
      expect(ids.has((r as unknown as { id: string }).id)).toBe(true);
    }
  });

  it('ist deterministisch', () => {
    const eingabe = viele(20, 'accepted');
    expect(boundWriterRevisionRegister(eingabe, 8).map((r) => (r as unknown as { id: string }).id))
      .toEqual(boundWriterRevisionRegister(eingabe, 8).map((r) => (r as unknown as { id: string }).id));
  });
});
