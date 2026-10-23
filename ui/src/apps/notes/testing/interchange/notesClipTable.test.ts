// STATUS: PLATIN — Notes · W-434: eine Clip-Tabelle ist eine **Tabelle**, keine Folge von Strichen
//
// ## Der Defekt, gemessen
//
// Für `<table><thead><tr><th>Name</th><th>Wert</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></tbody></table>`
// lieferte `sanitizeNoteClip().markdown`:
//
//     "|\n| Name\n| Wert\n\n|\n| A\n| 1\n|\n| B\n| 2"
//
// — **jede Zelle auf einer eigenen Zeile**, kein Trennstrich, keine Kopfzeile ✗. Ursache zeilengenau:
// `interchange/notesHtmlClip.ts:148-149` rief in den `td`/`th`/`tr`-Zweigen **zuerst** `flushInline()` und schrieb
// dann `'| '` in denselben Puffer — die vorige Zelle war damit bereits eine fertige Zeile. *Das Ergebnis sah aus
// wie eine Tabelle und war keine.*
//
// Der Registereintrag W-434 nannte das „nur angenähert". Gemessen ist es eine **Einebnung**: nichts konnte es
// zurücklesen.
//
// ## Der Zeuge für die Behebung ist ein **zweiter Codepfad**, keine zweite Zusicherung
//
// Geprüft wird nicht nur, dass Striche in der Zeichenkette stehen, sondern dass der **vorhandene**
// Markdown-Tabelleneditor des Produkts (`notesMarkdownEditing`/`notesTableEditing`) die Ausgabe als Tabelle
// **erkennt** und strukturell bearbeiten kann. *Vorher war genau das der Fehlschlag.*
import { describe, expect, it } from 'vitest';
import { sanitizeNoteClip } from '../../interchange/notesHtmlClip';
import { editMarkdownTable, locateMarkdownTable } from '../../editor/markdown/notesTableEditing';

const TABLE = '<table><thead><tr><th>Name</th><th>Wert</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></tbody></table>';

describe('W-434 — die Clip-Tabelle ist eine Markdown-Tabelle', () => {
  it('Kopfzeile, Trennzeile, Datenzeilen — keine Zelle auf einer eigenen Zeile', () => {
    const clip = sanitizeNoteClip(TABLE);
    expect(clip.markdown).toBe('| Name | Wert |\n| --- | --- |\n| A | 1 |\n| B | 2 |');
    // Und ausdrücklich **nicht** die eingeebnete Form von vorher.
    expect(clip.markdown).not.toContain('|\n| Name');
  });

  it('**der vorhandene Tabelleneditor erkennt sie** — der Zeuge ist ein zweiter Codepfad', () => {
    const clip = sanitizeNoteClip(TABLE);
    const lines = clip.markdown.split('\n');
    expect(locateMarkdownTable(lines, 0)).toEqual({ headerLineIndex: 0, columns: 2, rows: 4 });
    // Eine strukturelle Bearbeitung gelingt — vorher scheiterte sie an „not the header of a Markdown table".
    const edited = editMarkdownTable(clip.markdown, 0, 'add-row-below');
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.content.split('\n')).toHaveLength(5);
      expect(edited.content).toContain('|  |  |');
    }
  });

  it('ungleich lange Zeilen werden auf die Spaltenzahl gebracht — sonst ist die Tabelle kaputt', () => {
    const clip = sanitizeNoteClip('<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td></tr></table>');
    expect(clip.markdown).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |');
  });

  it('eine Tabelle ganz **ohne** `thead` nimmt die erste Zeile als Kopfzeile — dieselbe Annahme wie der Editor', () => {
    const clip = sanitizeNoteClip('<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>');
    expect(clip.markdown).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('eine leere Tabelle erfindet keine Zeile', () => {
    const clip = sanitizeNoteClip('<table></table>');
    expect(clip.markdown).toBe('');
  });

  it('Zellinhalt bleibt lesbar: Links und Betonung überleben **innerhalb** der Tabelle', () => {
    const clip = sanitizeNoteClip('<table><tr><th>Quelle</th></tr><tr><td><a href="https://example.com/x">gut</a></td></tr></table>');
    expect(clip.markdown).toBe('| Quelle |\n| --- |\n| [gut](https://example.com/x) |');
    expect(clip.markdown).toContain('https://example.com/x');
  });

  it('die Sanitisierung gilt **auch in** einer Tabelle — aktiver Inhalt wird weiterhin entfernt', () => {
    const clip = sanitizeNoteClip('<table><tr><th>A</th></tr><tr><td>ok<script>steal()</script></td></tr></table>');
    expect(clip.markdown).toBe('| A |\n| --- |\n| ok |');
    expect(clip.markdown).not.toContain('steal');
    expect(clip.sanitized).toBe(true);
    expect(clip.removedElements).toContain('script');
  });

  it('Text **um** eine Tabelle bleibt erhalten — die Tabelle frisst ihren Absatz nicht', () => {
    const clip = sanitizeNoteClip('<p>Vorher</p><table><tr><th>A</th></tr><tr><td>1</td></tr></table><p>Nachher</p>');
    expect(clip.markdown).toBe('Vorher\n\n| A |\n| --- |\n| 1 |\n\nNachher');
  });
});
