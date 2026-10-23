import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canEditText, canPersistParagraphMutation } from '../../../security/protection/writerProtectionEngine';

// AST-0002 · Masterplan Zeile 118 · Paket 01 „Leeres Dokument unmittelbar beschreiben".
//
// Die Anforderung verlangt unter anderem **saubere Fehlerpropagation statt … bloßem Statuswechsel oder
// No-op**.
//
// ## Die Geschichte dieser Datei, in drei Runden
//
// * **Runde 189** — erste Fassung. Behauptete, der Meldeweg fehle in der Zustandsschicht, und **bestand**.
// * **Runde 190** — korrigiert. `useWriterState.ts:921` gibt `handleBlockedEditAttempt` zurück; die erste
//   Fassung hatte nur nach `onBlockedEditAttempt` gesucht, dem Namen der **Komponenten**. **Ein Präfix
//   entschied über einen Befund.**
// * **Runde 193** — die Reparatur ist angewandt, und diese Fassung hält sie fest.
//
// **Der Test hat dabei genau gewirkt, wofür er gebaut wurde:** nach der Reparatur war er **rot**
// (`the guard is a bare return - this is the silent refusal`) und musste **bewusst** nachgezogen werden.
// Ohne ihn wäre die Reparatur unbemerkt geblieben.
//
// ## Warum zwei Ebenen
//
// `persistParagraphs` liegt in einem Hook, der ohne React-Render keinen Dispatcher hat (gemessen in Runde
// 159: `Cannot read properties of null (reading 'useState')`). Die **Entscheidung** ist eine reine Funktion
// und prüfbar; das **Melden** ist eine Eigenschaft des Aufrufers und statisch prüfbar.

const EDITOR_DIR = path.resolve(__dirname, '../../../editor');

function source(name: string): string {
  return fs.readFileSync(path.join(EDITOR_DIR, name), 'utf8');
}

describe('AST-0002 — the refusal reports instead of staying silent', () => {
  it('refuses persistence for a protection mode that forbids editing', () => {
    // The pure half, unchanged. `review` allows editing but demands a revisions patch; anything else that is
    // not `none`/undefined refuses outright.
    expect(canEditText('none')).toBe(true);
    expect(canEditText(undefined)).toBe(true);
    expect(canPersistParagraphMutation('none')).toBe(true);
    expect(canPersistParagraphMutation(undefined)).toBe(true);
    expect(canPersistParagraphMutation('review')).toBe(false);
    expect(canPersistParagraphMutation('review', {})).toBe(false);
    expect(canEditText('readOnly' as never)).toBe(false);
    expect(canPersistParagraphMutation('readOnly' as never)).toBe(false);
  });

  it('reports the refusal through the handler the state layer already exposes', () => {
    // The repair, pinned. `handleBlockedEditAttempt` checks for itself whether a lock is active and records
    // the attempt in `protectionEditAttempted`, which the surface reads.
    const state = source('useWriterState.ts');
    const guard = state.indexOf('if (!canPersistParagraphMutation(');
    expect(guard, 'persistParagraphs must still guard on canPersistParagraphMutation').toBeGreaterThanOrEqual(0);

    // The guarded block: from the `if` to the closing brace of its body.
    const block = state.slice(guard, state.indexOf('persistParagraphsRaw(', guard));
    expect(block, 'the refusal must call the report handler').toContain('handleBlockedEditAttempt()');
    expect(block, 'and it must still return - nothing may be persisted').toContain('return;');
  });

  it('does not persist anything on the refusing path', () => {
    // Order matters: the report precedes the return, and `persistParagraphsRaw` follows the whole guard. If a
    // future edit moved the raw call above the guard, a locked document would be written.
    const state = source('useWriterState.ts');
    const guard = state.indexOf('if (!canPersistParagraphMutation(');
    const report = state.indexOf('handleBlockedEditAttempt()', guard);
    const raw = state.indexOf('persistParagraphsRaw(', guard);
    expect(report, 'the report must precede the raw write').toBeLessThan(raw);
  });

  it('shows the report path reaches the component that takes the keystroke', () => {
    // The prop is threaded down to `WriterPagePaper`, whose onKeyDown receives the keystroke. The state layer
    // now calls the handler it already exposed.
    const writerRoot = path.resolve(__dirname, '../../..');
    const holders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          if (fs.readFileSync(full, 'utf8').includes('onBlockedEditAttempt')) holders.push(full);
        }
      }
    };
    walk(writerRoot);

    expect(holders.length, 'the prop must be threaded through the component tree').toBeGreaterThanOrEqual(3);
    expect(
      holders.some((file) => file.includes('WriterPagePaper')),
      'it must reach the component whose onKeyDown takes the keystroke',
    ).toBe(true);
  });
});
