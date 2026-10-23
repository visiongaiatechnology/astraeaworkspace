// STATUS: PLATIN — Source contract: focus must stay visible (VGT UI/UX gate)
//
// The VGT UI/UX standard, section 12.1 and the implementation gate, require:
// "Browser-Fokus darf nicht entfernt werden, ohne einen mindestens gleichwertigen
// Ersatz zu liefern" and "Focus States sind sichtbar". A survey found 128 places in
// 43 Writer files that suppress the outline while only 8 places replaced it with a
// designed state; inputs replaced it with a border colour alone, which also breaks
// "Information nicht ausschließlich über Farbe".
//
// This file pins the page-setup dialog (fixed in this package) and ratchets the
// rest so the debt cannot grow unnoticed.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const writerRoot = path.resolve(here, '../../../..');        // apps/writer
const pageSetupDir = path.join(writerRoot, 'layout/page-setup');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [full] : [];
  });
}

const countOf = (text, needle) => text.split(needle).length - 1;

describe('Writer focus visibility contract', () => {
  it('never suppresses the outline in the page-setup dialog without a ring', () => {
    const offenders = [];
    for (const file of walk(pageSetupDir)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (line.includes('outline-none') && !line.includes('focus-visible:ring')) {
          offenders.push(`${path.basename(file)}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('gives every page-setup button style a keyboard-only focus ring', () => {
    const geometry = readFileSync(path.join(pageSetupDir, 'WriterPageSetupGeometryTab.tsx'), 'utf8');
    const columns = readFileSync(path.join(pageSetupDir, 'WriterPageSetupColumnsTab.tsx'), 'utf8');
    // Each style string opens a button's className. A looser "at least three
    // rings" check survived deleting one of them, so every style is pinned.
    const buttonStyles = [
      'text-left transition-all flex items-center justify-between',
      'text-xs text-center transition-all',
      'text-[11px] text-center transition-all',
      'text-xs text-center font-medium transition-all',
      'rounded-lg border px-3 py-1.5 text-[11px] transition-colors',
      'text-slate-300 hover:border-blue-500/60 hover:text-white',
    ];
    for (const source of [geometry, columns]) {
      for (const style of buttonStyles) {
        for (const line of source.split('\n')) {
          if (line.includes(style)) expect(line).toContain('focus-visible:ring-2');
        }
      }
    }
    expect(geometry).toContain('aria-pressed');
  });

  it('keeps a designed focus state on the dialog actions', () => {
    const modal = readFileSync(path.join(pageSetupDir, 'WriterPageSetupModal.tsx'), 'utf8');
    expect(modal).toContain('focus-visible:ring-2 focus-visible:ring-blue-300');
    expect(modal).toContain('focus-visible:ring-2 focus-visible:ring-red-300');
  });

  it('never suppresses the outline without a designed focus state, anywhere in the Writer', () => {
    // Measured after the app-wide sweep: 128 suppressions against 15 designed states
    // became 0 against 293. The window is no longer needed — the rule now holds for
    // every file, not just the dialog that was fixed first.
    const offenders = [];
    for (const file of walk(writerRoot)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (line.includes('outline-none') && !line.includes('focus-visible:ring')) {
          offenders.push(`${path.relative(writerRoot, file)}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('never takes a shortcut on the count of designed focus states', () => {
    let replaced = 0;
    for (const file of walk(writerRoot)) {
      replaced += countOf(readFileSync(file, 'utf8'), 'focus-visible:');
    }
    // A ratchet, not a target: the number may only go up.
    expect(replaced).toBeGreaterThanOrEqual(293);
  });
});
