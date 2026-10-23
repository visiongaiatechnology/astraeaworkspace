/**
 * P33 / AST-0161 — Kommentare: `writerCommentsEngine`.
 *
 * ## Warum dieses Modul zuerst aus der Luecke
 *
 * Runde 247 hat gemessen, dass `review/` 46 Exporte und keinen dedizierten Test hatte. Dieses Modul traegt
 * neun davon — und es verarbeitet **Text aus feindlicher Quelle** (Kommentare, Antworten, Erwaehnungen).
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * * **Fuenf Schranken:** `MAX_AUTHOR_LENGTH` 128 · `MAX_COMMENT_LENGTH` 4000 · `MAX_REPLY_LENGTH` 2000 ·
 *   `MAX_REPLIES` 256 · **`MAX_MENTIONS` 64**.
 * * **`normalizeText`:** NFKC-Normalisierung, dann **NUL-Zeichen entfernen**, trimmen, schneiden.
 * * **`normalizeAuthor` faellt auf `'Reviewer'` zurueck**, wenn nach der Normalisierung nichts bleibt.
 *   Ein leerer Autor ist kein Autor.
 * * **`MENTION_PATTERN`** = `@` gefolgt von einem Unicode-Buchstaben, einer Ziffer oder einem Unterstrich,
 *   dann bis zu 63 weitere Zeichen aus Buchstaben, Ziffern, Unterstrich, Punkt und Bindestrich.
 *   **Also 1 bis 64 Zeichen gesamt** — und `@` allein ist keine Erwaehnung.
 * * **`extractWriterMentions` dedupliziert OHNE Ruecksicht auf die Schreibweise**, behaelt aber die
 *   **erste** Schreibweise bei.
 * * **`resolveWriterCommentAuthors` zaehlt zwei Schreibweisen, die sich nur in Gross-/Kleinschreibung oder
 *   umgebenden Leerzeichen unterscheiden, als EINE Person** — und zwar ueber Kommentare **und** Antworten.
 */

import { describe, expect, it } from 'vitest';
import {
  countOpenWriterComments,
  extractWriterMentions,
  filterWriterCommentsByAuthor,
  normalizeWriterComments,
  resolveWriterCommentAuthors,
  setWriterCommentResolved,
} from '../../../../review/comments/writerCommentsEngine';
import type { WriterComment } from '../../../../types';

const comment = (over: Record<string, unknown> = {}): WriterComment =>
  ({ id: 'c1', author: 'Anna', text: 'Text', resolved: false, replies: [], mentions: [], ...over } as unknown as WriterComment);

describe('extractWriterMentions — das Muster und die Deduplizierung', () => {
  it('findet einfache Erwaehnungen', () => {
    expect(extractWriterMentions('Hallo @Anna und @Ben')).toEqual(['Anna', 'Ben']);
  });

  it('HAUPTZUSICHERUNG: dedupliziert OHNE Ruecksicht auf die Schreibweise, behaelt die erste', () => {
    // Ein Name, der zweimal anders geschrieben auftaucht, ist eine Person - und die erste Form bleibt.
    expect(extractWriterMentions('@Anna und @anna und @ANNA')).toEqual(['Anna']);
  });

  it('erlaubt Punkte, Bindestriche und Unterstriche im Namen', () => {
    expect(extractWriterMentions('@anna.marie und @ben-otto und @carla_3'))
      .toEqual(['anna.marie', 'ben-otto', 'carla_3']);
  });

  it('HAUPTZUSICHERUNG: ein blosses @ ist keine Erwaehnung', () => {
    // Das Muster verlangt ein Zeichen nach dem @.
    expect(extractWriterMentions('ein @ allein')).toEqual([]);
    expect(extractWriterMentions('@ mit Leerzeichen')).toEqual([]);
    expect(extractWriterMentions('@1')).toEqual(['1']); // eine Ziffer genuegt
  });

  it('nimmt Unicode-Buchstaben an', () => {
    // Der ganze Grund fuer die Unicode-Zeichenklassen im Muster.
    expect(extractWriterMentions('@Jürgen und @Müller und @Ægir')).toEqual(['Jürgen', 'Müller', 'Ægir']);
  });

  it('behandelt ein @ in einer E-Mail-Adresse als Erwaehnung — mit Punkt', () => {
    // GEMESSEN und zunaechst falsch erwartet: das Muster erlaubt Punkte IM Namen, also ergibt
    // 'a@b.de' die Erwaehnung 'b.de' und nicht 'b'. Festgehalten, weil es ueberraschend ist.
    expect(extractWriterMentions('mail an a@b.de')).toEqual(['b.de']);
    // Ohne Punkt im Namen bleibt es beim einfachen Fall.
    expect(extractWriterMentions('mail an a@ben')).toEqual(['ben']);
  });

  it('HAUPTZUSICHERUNG: hoechstens 64 Erwaehnungen', () => {
    const viele = Array.from({ length: 100 }, (_, i) => `@person${i}`).join(' ');
    expect(extractWriterMentions(viele)).toHaveLength(64);
  });

  it('ein leerer oder fehlender Text ergibt eine leere Liste', () => {
    expect(extractWriterMentions('')).toEqual([]);
    expect(extractWriterMentions('kein Klammeraffe')).toEqual([]);
  });

  it('ist deterministisch', () => {
    expect(extractWriterMentions('@a @b @a')).toEqual(extractWriterMentions('@a @b @a'));
  });
});

describe('normalizeWriterComments — die Schranken und der Autor-Rueckfall', () => {
  it('HAUPTZUSICHERUNG: ein leerer Autor wird zu Reviewer', () => {
    // Ein leerer Autor ist kein Autor - und eine Anzeige mit leerem Namen ist ein stiller Fehler.
    const [normalisiert] = normalizeWriterComments([comment({ author: '   ' })]);
    expect(normalisiert?.author).toBe('Reviewer');
    const [leer] = normalizeWriterComments([comment({ author: '' })]);
    expect(leer?.author).toBe('Reviewer');
  });

  it('entfernt NUL-Zeichen und trimmt', () => {
    const [normalisiert] = normalizeWriterComments([comment({ text: '  a\u0000b  ' })]);
    expect(normalisiert?.text).toBe('ab');
  });

  it('HAUPTZUSICHERUNG: die Textlaenge wird begrenzt', () => {
    const [normalisiert] = normalizeWriterComments([comment({ text: 'a'.repeat(5000) })]);
    expect(normalisiert?.text.length).toBe(4000);
  });

  it('die Antwortlaenge wird ebenfalls begrenzt', () => {
    const [normalisiert] = normalizeWriterComments([
      comment({ replies: [{ id: 'r1', author: 'Ben', text: 'b'.repeat(3000), mentions: [] }] }),
    ]);
    expect(normalisiert?.replies[0]?.text.length).toBe(2000);
  });

  it('HAUPTZUSICHERUNG: hoechstens 256 Antworten je Kommentar', () => {
    const viele = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, author: 'A', text: 'x', mentions: [] }));
    const [normalisiert] = normalizeWriterComments([comment({ replies: viele })]);
    expect(normalisiert?.replies).toHaveLength(256);
  });

  it('die Erwaehnungen werden aus dem NORMALISIERTEN Text neu gebildet', () => {
    // Ein Aufrufer koennte eine veraltete Erwaehnungsliste mitgeben.
    const [normalisiert] = normalizeWriterComments([comment({ text: 'Hallo @Anna', mentions: ['Falsch'] })]);
    expect(normalisiert?.mentions).toEqual(['Anna']);
  });

  it('eine leere Liste ergibt eine leere Liste', () => {
    expect(normalizeWriterComments([])).toEqual([]);
  });
});

describe('resolveWriterCommentAuthors — eine Person, eine Schreibweise', () => {
  it('HAUPTZUSICHERUNG: zwei Schreibweisen sind EINE Person', () => {
    const autoren = resolveWriterCommentAuthors([
      comment({ author: 'Anna' }),
      comment({ id: 'c2', author: 'anna' }),
      comment({ id: 'c3', author: '  ANNA  ' }),
    ]);
    expect(autoren).toHaveLength(1);
    expect(autoren[0]?.toLowerCase()).toBe('anna');
  });

  it('HAUPTZUSICHERUNG: Antwortautoren zaehlen mit', () => {
    // Der Kommentar stammt von Anna, die Antwort von Ben - beide sind Beteiligte.
    const autoren = resolveWriterCommentAuthors([
      comment({ author: 'Anna', replies: [{ id: 'r1', author: 'Ben', text: 'x', mentions: [] }] }),
    ]);
    expect(autoren).toHaveLength(2);
    expect(autoren.map((a) => a.toLowerCase()).sort()).toEqual(['anna', 'ben']);
  });

  it('die Liste ist stabil sortiert', () => {
    const autoren = resolveWriterCommentAuthors([
      comment({ author: 'Zoe' }),
      comment({ id: 'c2', author: 'Anna' }),
      comment({ id: 'c3', author: 'Ben' }),
    ]);
    expect(autoren).toEqual([...autoren].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  });

  it('ein leerer Autor wird nicht als Person gefuehrt', () => {
    expect(resolveWriterCommentAuthors([comment({ author: '   ' })])).toEqual([]);
  });

  it('ohne Kommentare gibt es keine Autoren', () => {
    expect(resolveWriterCommentAuthors([])).toEqual([]);
  });
});

describe('setWriterCommentResolved, filterWriterCommentsByAuthor, countOpenWriterComments', () => {
  it('setzt den Erledigt-Zustand, ohne den Kommentar zu veraendern', () => {
    const original = comment();
    const erledigt = setWriterCommentResolved(original, true);
    expect(erledigt.resolved).toBe(true);
    expect(erledigt.text).toBe(original.text);
    expect(original.resolved).toBe(false); // die Eingabe bleibt unberuehrt
  });

  it('zaehlt nur die offenen Kommentare', () => {
    expect(countOpenWriterComments([
      comment({ resolved: false }),
      comment({ id: 'c2', resolved: true }),
      comment({ id: 'c3', resolved: false }),
    ])).toBe(2);
    expect(countOpenWriterComments([])).toBe(0);
  });

  it('filtert ohne Ruecksicht auf die Schreibweise des Autors', () => {
    const kommentare = [
      comment({ author: 'Anna' }),
      comment({ id: 'c2', author: 'Ben' }),
      comment({ id: 'c3', author: 'anna' }),
    ];
    const gefiltert = filterWriterCommentsByAuthor(kommentare, 'ANNA');
    expect(gefiltert).toHaveLength(2);
    for (const k of gefiltert) expect(k.author.toLowerCase()).toBe('anna');
  });

  it('der Alles-Filter behaelt jeden Kommentar', () => {
    const kommentare = [comment({ author: 'Anna' }), comment({ id: 'c2', author: 'Ben' })];
    expect(filterWriterCommentsByAuthor(kommentare, 'all')).toHaveLength(2);
  });

  it('ein unbekannter Autor ergibt eine leere Liste, nicht alle', () => {
    // Fail-closed: ein Filter, der nichts trifft, darf nicht alles zurueckgeben.
    expect(filterWriterCommentsByAuthor([comment({ author: 'Anna' })], 'gibt-es-nicht')).toEqual([]);
  });
});
