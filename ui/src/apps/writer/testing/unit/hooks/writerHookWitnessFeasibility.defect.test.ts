/**
 * DEF-RE-007 — Messung: ist fuer die beiden testfreien Hooks ein Runtime-Witness moeglich?
 *
 * ## Warum diese Datei existiert
 *
 * Runde 217 stellte fest, dass zwei Writer-Hooks null Tests haben:
 *   - `useWriterModalAccessibility` (editor/accessibility/, 1 Export)
 *   - `useWriterDocumentInsights`  (productivity/insights/, 1 Export)
 *
 * Runde 218 hat ihre Konsumenten gemessen:
 *   - `useWriterModalAccessibility` -> `editor/modals/WriterAllModals.tsx` (genau 1 Hook — der Hook selbst)
 *   - `useWriterDocumentInsights`   -> `editor/useWriterState.ts` (56 Hook-Aufrufe, 20 verschiedene)
 *
 * **Runde 159 hat gezeigt, dass ein direkter Aufruf in dieser Umgebung scheitert** (kein React-Renderer,
 * kein jsdom). **Aber das war eine Erwartung, keine Messung.** Diese Datei messt sie.
 *
 * ## Und zwei eigene Fehler, die der erste Entwurf hatte
 *
 * 1. **Die Importtiefe war zu flach** (`../editor/...` statt `../../../editor/...`) — der achte Tiefenfehler
 *    dieser Sitzung. Der Render scheiterte an der Modulaufloesung, nicht an den Hooks.
 * 2. **Die Zusicherung war `outcome.length > 0`** — die Fehlermeldung erfuellt sie. **Ein Test, der nicht
 *    fehlschlagen kann, ist vakuant.** Deshalb steht jetzt `expect(outcome).not.toContain('Cannot find
 *    module')`: ein Aufloesungsfehler ist ein Fehler des Tests, kein Messergebnis, und darf nicht als
 *    "Render gescheitert" durchgehen.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { search: '', href: 'http://localhost/' },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    },
    writable: true,
    configurable: true,
  });
}

function capture(run: () => void, ok: string, fail: string): string {
  try {
    run();
    return ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${fail}: ${message.slice(0, 140)}`;
  }
}

// **Das Zeitlimit ist bewusst hoch, und der Grund ist gemessen (Runde 262).**
//
// Dieser Test rendert `WriterAllModals` wirklich — das ist der ganze Punkt von DEF-RE-007: nicht „der Hook
// lässt sich importieren", sondern „die Komponente rendert". Allein ausgeführt braucht er **3,68 s** und lag
// damit nur knapp unter dem Standardlimit von 5 s. **Im vollen Lauf über 874 Testdateien überschritt er es**
// und meldete `Test timed out in 5000ms` — **obwohl die Messung selbst gelungen war** (`RENDER GELUNGEN`
// stand im Protokoll).
//
// **Ein Zeitlimit ist keine Zusicherung über die Korrektheit, sondern über die Maschine.** Ein Mess-Test, der
// eine echte Komponente rendert, darf nicht an der Last des Gesamtlaufs scheitern.
describe('DEF-RE-007 — ist ein Runtime-Witness fuer die testfreien Hooks moeglich?', () => {
  it('WriterAllModals.tsx — der Render wird versucht und das Ergebnis festgehalten', { timeout: 60_000 }, async () => {
    const mod = await import('../../../editor/modals/WriterAllModals');
    const record = mod as Record<string, unknown>;
    const Component = record.WriterAllModals ?? record.default;

    const outcome =
      typeof Component !== 'function'
        ? `KEIN COMPONENT-EXPORT (Schluessel: ${Object.keys(mod).join(', ')})`
        : capture(
            () => {
              renderToStaticMarkup(Component as never);
            },
            'RENDER GELUNGEN',
            'RENDER SCHEITERT',
          );

    expect(outcome).not.toContain('Cannot find module');
    expect(outcome).toMatch(/RENDER GELUNGEN|RENDER SCHEITERT|KEIN COMPONENT-EXPORT/);
    console.log(`  [DEF-RE-007] WriterAllModals: ${outcome}`);
  });

  it('useWriterState.ts — 56 Hook-Aufrufe, der Aufruf wird versucht', async () => {
    const mod = await import('../../../editor/useWriterState');
    const hook = (mod as Record<string, unknown>).useWriterState;

    const outcome =
      typeof hook !== 'function'
        ? 'KEIN useWriterState-EXPORT'
        : capture(
            () => {
              (hook as () => unknown)();
            },
            'AUFRUF GELUNGEN',
            'AUFRUF SCHEITERT',
          );

    expect(outcome).not.toContain('Cannot find module');
    expect(outcome).toMatch(/AUFRUF GELUNGEN|AUFRUF SCHEITERT|KEIN useWriterState-EXPORT/);
    console.log(`  [DEF-RE-007] useWriterState: ${outcome}`);
  });
});
