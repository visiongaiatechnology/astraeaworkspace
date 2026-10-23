// STATUS: PLATIN — Notes · Wächter: **jeder** Produktionsdialog trägt den einen Dialogvertrag (W-432)
//
// ## Warum eine Quelltext-Prüfung und kein Verhaltenstest
//
// Der Vertrag ist ein **Hook** (Fokus-Eintritt, Escape, Tab-Falle, Fokus-Rückgabe). Ob er an einem Dialog
// **hängt**, ist keine Laufzeiteigenschaft, die ein kopfloser Test sehen könnte — es ist eine **Kante** im
// Quelltext. *Genau diese Kante fehlte: der Vertrag existierte und wurde von drei Dialogen benutzt, während
// dreizehn weitere `role="dialog"` trugen und ihn nicht riefen.* Ein Verhaltenstest kann das nicht fangen; er
// ruft den Vertrag selbst und wäre damit sein einziger Aufrufer (dieselbe Lehre wie beim `.vnote`-Leser).
//
// Der Registereintrag sprach von **sieben** Dialogen. Gemessen sind es **dreizehn** — *eine Zahl, die niemand
// nachzählt, ist auch eine Behauptung.* Diese Datei zählt nach und pinnt die Nicht-Leerheit der Messung.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const notes = path.resolve(here, '../..');

/** Kommentare entfernen — *ein Satz über eine verbotene Sache ist nicht die Sache*. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full).forEach((file) => found.push(file));
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/u.test(entry.name) && !/\.(test|spec)\./u.test(entry.name)) found.push(full);
  }
  return found;
}

const files = walk(notes);
const relative = (file) => path.relative(notes, file).replace(/\\/gu, '/');
const sources = files.map((file) => ({ file: relative(file), code: code(readFileSync(file, 'utf8')) }));

/** Jede Datei, die einen echten Dialog rendert. */
const dialogFiles = sources.filter((entry) => /aria-modal="true"/u.test(entry.code));

describe('Notes · W-432 — der Dialogvertrag hängt an **jedem** Dialog', () => {
  it('die Messung ist nicht leer (ein Tor, das nichts sieht, ist grüner als keines)', () => {
    expect(files.length).toBeGreaterThan(60);
    expect(dialogFiles.length).toBeGreaterThanOrEqual(13);
  });

  it('**keine** Produktionsdatei rendert einen Dialog ohne `useNotesDialogA11y`', () => {
    const unbound = dialogFiles
      .filter((entry) => !entry.code.includes('useNotesDialogA11y('))
      .map((entry) => entry.file)
      // Der Vertrag selbst ist kein Dialog — er **ist** der Vertrag.
      .filter((file) => file !== 'editor/useNotesDialogA11y.ts');
    expect(unbound).toEqual([]);
  });

  it('jeder gebundene Dialog verdrahtet **alle vier** Teile: ref, tabIndex, onKeyDown — und gibt den Fokus zurück', () => {
    const incomplete = dialogFiles
      .filter((entry) => entry.file !== 'editor/useNotesDialogA11y.ts')
      .filter((entry) => !(/ref=\{dialogA11y\.ref\}/u.test(entry.code)
        && /tabIndex=\{-1\}/u.test(entry.code)
        && /onKeyDown=\{dialogA11y\.onKeyDown\}/u.test(entry.code)))
      .map((entry) => entry.file);
    expect(incomplete).toEqual([]);
  });

  it('der Vertrag selbst besitzt die Fokus-Rückgabe und die Tab-Falle (nicht nur Escape)', () => {
    const contract = sources.find((entry) => entry.file === 'editor/useNotesDialogA11y.ts');
    expect(contract).toBeDefined();
    const text = contract.code;
    // Fokus-Eintritt, Fokus-Rückgabe, Escape, Tab-Falle — vier Teile, vier Belege.
    expect(text).toContain('target?.focus()');
    expect(text).toContain('previouslyFocused.current?.focus?.()');
    expect(text).toContain("event.key === 'Escape'");
    expect(text).toContain("event.key !== 'Tab'");
    // W-435: die Sichtbarkeit ist eine **benannte** Entscheidung, kein nackter `offsetParent`-Vergleich.
    expect(text).toContain('notesDialogElementIsRendered');
    expect(text).toContain('checkVisibility');
  });

  it('der Fokus-Eintritt geht auf das **benannte** Feld, nicht auf den Schließen-Knopf', () => {
    // Ohne diesen Vorrang fokussiert der Vertrag das erste fokussierbare Element — hier der X-Knopf.
    const contract = sources.find((entry) => entry.file === 'editor/useNotesDialogA11y.ts');
    expect(contract.code).toContain('data-notes-dialog-initial-focus');
    expect(contract.code.indexOf('INITIAL_FOCUS_SELECTOR')).toBeLessThan(contract.code.indexOf('FOCUSABLE)'));
    // **Die Eigenschaft, nicht eine Zahl:** jedes `autoFocus` in einem Dialog trägt auch die benannte Marke.
    // Gemessen sind das drei Stellen in `notebooks/NotesModals.tsx`; *eine erfundene Untergrenze wäre eine
    // Behauptung, eine Eigenschaft ist eine Prüfung.*
    const autoFocusSites = dialogFiles.flatMap((entry) =>
      (entry.code.match(/autoFocus/gu) ?? []).map(() => entry.file));
    const marked = dialogFiles.filter((entry) => entry.code.includes('data-notes-dialog-initial-focus')).map((entry) => entry.file);
    for (const file of new Set(autoFocusSites)) {
      expect(marked, file).toContain(file);
    }
    // Und der benannte Eintritt wird überhaupt benutzt — sonst wäre der Vorrang toter Code.
    expect(marked.length).toBeGreaterThan(0);
    expect(autoFocusSites.length).toBe(3);
  });
});
