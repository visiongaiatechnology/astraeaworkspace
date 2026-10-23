/**
 * DEF-RE-007 (Fortsetzung) — der a11y-Vertrag: gemessen, nicht behauptet.
 *
 * ## Was Runde 218 gemessen hat
 *
 * `WriterAllModals` rendert ueber `renderToStaticMarkup` **erfolgreich** — entgegen meiner Annahme aus
 * Runde 159. Der Konsument des Hooks ist also renderbar.
 *
 * ## Was Runde 219 gemessen hat: der Hook wirkt in `useEffect`
 *
 * `useWriterModalAccessibility` (92 Zeilen) ist eine Fokusfalle mit Screenreader-Grenze: ARIA-Dialog-Semantik,
 * Tab- und Shift-Tab-Zyklus, Fokus-Wiederherstellung. **Alles in `useEffect`** — und `renderToStaticMarkup`
 * fuehrt keine Effekte aus. Der Hook koennte also selbst dann nicht wirken, wenn die Komponente rendert.
 *
 * ## Und warum die Zusicherungen auf FUNKTIONSKOERPER verengt sind
 *
 * **Der erste Entwurf benutzte `expect(source).toContain(...)` auf der ganzen Datei — und die Mutationsprobe
 * hat ihn widerlegt:**
 *
 * ```
 * ARIA-Modal entfernt                exit 1  |  1 failed | 5 passed   <- faengt es
 * Shift-Tab-Zweig entfernt           exit 0  |  6 passed (6)          <- faengt es NICHT
 * Fokus-Wiederherstellung entfernt   exit 0  |  6 passed (6)          <- faengt es NICHT
 * ```
 *
 * **Zwei Gruende, beide dieselbe Schwaeche:**
 *   1. `if (false) {` deaktiviert den Zweig, **aber die Zeichenkette steht weiterhin im toten Block.**
 *   2. Die Fokus-Wiederherstellung existiert **zweimal** — in der Schliesslogik *und* im Cleanup.
 *
 * **Eine `toContain`-Zusicherung auf einer ganzen Datei besteht, wenn die Zeichenkette *irgendwo* steht.**
 * Deshalb schneidet dieser Witness jetzt die **Funktionskoerper** heraus und sichert innerhalb ihrer zu.
 *
 * **Die Grenze bleibt:** das ist ein Verdrahtungsnachweis, kein Verhaltensnachweis. **Die Fokusfalle im
 * Betrieb braucht ein DOM, das diese Umgebung nicht hat — und das steht als eigene Zusicherung drin.**
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const hookPath = resolve(here, '../../../editor/accessibility/useWriterModalAccessibility.ts');
const source = readFileSync(hookPath, 'utf8');

/**
 * Schneidet den Koerper einer Funktion heraus: von ihrer Deklaration bis zu der Zeile, die auf **derselben
 * Einrueckung** mit `}` oder `};` schliesst.
 *
 * **Zwei gescheiterte Entwuerfe, beide festgehalten:**
 *   1. Der erste suchte nur `function NAME(` und scheiterte an `sync` — der Quelltext definiert
 *      `const sync = () => {`. Nur `normalizeDialogSemantics` ist eine echte `function`.
 *   2. Der zweite verlangte das schliessende `}` in **Spalte 0**. Der Quelltext ist durchgehend eingerueckt,
 *      also fand er nicht das Ende von `sync`, sondern ein spaeteres — und der herausgeschnittene Koerper
 *      enthielt den Cleanup. **Die Fokus-Wiederherstellung erschien dadurch zweimal statt einmal**, was die
 *      Basis-Zusicherung rot machte und die dritte Mutation unentdeckt liess.
 */
function bodyOf(name: string): string {
  const declarations = [`function ${name}(`, `const ${name} = (`];
  const marker = declarations.find((candidate) => source.includes(candidate));
  expect(marker, `${name} weder als function noch als const deklariert`).toBeDefined();

  const start = source.indexOf(marker as string);
  // Die Einrueckung der Deklarationszeile bestimmt, welche schliessende Klammer das Ende markiert.
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indent = source.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? '';

  const rest = source.slice(start + (marker as string).length);
  const closer = new RegExp(`\\n${indent}\\};?\\n`);
  const end = rest.search(closer);
  expect(end, `Ende von ${name} auf Einrueckung "${indent}" nicht gefunden`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

const syncBody = bodyOf('sync');
const onKeyDownBody = bodyOf('onKeyDown');
const normalizeBody = bodyOf('normalizeDialogSemantics');

describe('useWriterModalAccessibility — der Vertrag, koerperweise zugesichert', () => {
  it('normalizeDialogSemantics setzt die ARIA-Dialog-Semantik vollstaendig', () => {
    expect(normalizeBody).toContain("dialog.setAttribute('role', 'dialog')");
    expect(normalizeBody).toContain("dialog.setAttribute('aria-modal', 'true')");
    expect(normalizeBody).toContain('dialog.tabIndex = -1');
    expect(normalizeBody).toContain("dialog.setAttribute('aria-labelledby', heading.id)");
    expect(normalizeBody).toContain("dialog.setAttribute('aria-label', 'Astraea Writer Dialog')");
  });

  it('onKeyDown faengt Tab und Shift-Tab und wickelt in BEIDEN Richtungen', () => {
    expect(onKeyDownBody).toContain("if (event.key !== 'Tab' || !currentDialog) return;");
    // Beide Zweige muessen im Koerper stehen - nicht irgendwo in der Datei.
    expect(onKeyDownBody).toContain('if (event.shiftKey && (active === first || active === currentDialog))');
    expect(onKeyDownBody).toContain('event.preventDefault(); last.focus();');
    expect(onKeyDownBody).toContain('} else if (!event.shiftKey && active === last) {');
    expect(onKeyDownBody).toContain('event.preventDefault(); first.focus();');
    // Ein Dialog ohne fokussierbare Elemente darf den Fokus nicht entkommen lassen.
    expect(onKeyDownBody).toContain('if (focusable.length === 0) {');
    expect(onKeyDownBody).toContain('currentDialog.focus();');
  });

  it('sync stellt den vorherigen Fokus wieder her, wenn der Dialog schliesst', () => {
    // Genau EINMAL im sync-Koerper - die zweite Fundstelle liegt im Cleanup und darf nicht mitzaehlen.
    const restores = syncBody.split('if (previousFocus?.isConnected) previousFocus.focus();').length - 1;
    expect(restores).toBe(1);
    expect(syncBody).toContain('if (!currentDialog) {');
  });

  it('registriert Beobachter und Ereignis und raeumt in der Effekt-Rueckgabe auf', () => {
    const effectBody = source.slice(source.indexOf('useEffect('));
    expect(effectBody).toContain('const observer = new MutationObserver(sync);');
    expect(effectBody).toContain('observer.observe(host, { childList: true, subtree: true });');
    expect(effectBody).toContain("globalThis.document?.addEventListener('keydown', onKeyDown, true);");
    // Die Aufraeumfunktion muss beide wieder abmelden.
    expect(effectBody).toContain('observer.disconnect();');
    expect(effectBody).toContain("globalThis.document?.removeEventListener('keydown', onKeyDown, true);");
  });

  it('der Fokus-Selektor deckt die sechs fokussierbaren Arten ab', () => {
    const selectorBlock = source.slice(0, source.indexOf('].join'));
    for (const part of [
      "'button:not([disabled])'",
      "'a[href]'",
      "'input:not([disabled])'",
      "'select:not([disabled])'",
      "'textarea:not([disabled])'",
      '\'[tabindex]:not([tabindex="-1"])\'',
      '\'[contenteditable="true"]\'',
    ]) {
      expect(selectorBlock).toContain(part);
    }
  });

  it('GRENZE: die Wirkung liegt in useEffect — ohne DOM ist sie nicht messbar', () => {
    expect(source).toContain('useEffect(');
    expect(source).toContain('hostRef.current');
    expect(source).not.toContain('useLayoutEffect');
  });
});
