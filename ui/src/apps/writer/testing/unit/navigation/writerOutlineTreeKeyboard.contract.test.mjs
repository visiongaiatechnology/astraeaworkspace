// STATUS: PLATIN — Source contract: the tree answers keys, and moving is not pointer-only (W-270, W-271)
//
// W-270: the outline declared `role="tree"`/`role="treeitem"` with `aria-level`, but nothing answered the
// keys a tree promises — ARIA described a structure the interface did not provide. The decision now lives in
// `writerOutlineKeyboard.ts` (pure, unit-tested); this pins that the panel actually uses it, keeps one tab
// stop, and moves the focus.
//
// W-271: dragging was the only way to move a heading, which `vgt-ui-ux-supreme` forbids for an essential
// function. `Alt`+Arrow is the alternative, and the hint is visible text.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');
const sidebar = read('../../../navigation/toc/WriterTocSidebar.tsx');
const keyboard = read('../../../navigation/writerOutlineKeyboard.ts');

/** Comments removed: the file explains the former behaviour, and prose is not code. */
const sidebarCode = sidebar.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

describe('the tree answers the keys it promises', () => {
  it('routes key presses through the pure decision', () => {
    expect(sidebarCode).toContain("import { resolveWriterOutlineKeyCommand } from '../writerOutlineKeyboard';");
    expect(sidebarCode).toContain('const command = resolveWriterOutlineKeyCommand({');
    expect(sidebarCode).toContain("if (command.kind === 'focus') {");
    expect(sidebarCode).toContain("if (command.kind === 'activate') {");
  });

  it('handles every key the pattern names', () => {
    for (const key of ["'ArrowDown'", "'ArrowUp'", "'ArrowLeft'", "'ArrowRight'", "'Home'", "'End'", "'Enter'", "' '"]) {
      expect(keyboard, key).toContain(`case ${key}:`);
    }
  });

  it('keeps one tab stop and moves it with the focus', () => {
    expect(sidebarCode).toContain('tabIndex={(focusedHeadingId ? focusedHeadingId === item.id : item.id === filteredHeadings[0]?.id) ? 0 : -1}');
    expect(sidebarCode).toContain('onFocus={() => setFocusedHeadingId(item.id)}');
    // A roving tabindex needs a way to move the DOM focus, or the stop moves without the user.
    expect(sidebarCode).toContain('outlineTreeRef.current?.querySelector<HTMLButtonElement>(');
    expect(sidebarCode).toContain('node?.focus();');
  });

  it('keeps the tree reachable before anything is focused', () => {
    // Without the `filteredHeadings[0]` fallback the whole tree would be `tabIndex={-1}` on first open.
    expect(sidebarCode).toContain('item.id === filteredHeadings[0]?.id');
  });

  it('prevents the default only for keys it handles', () => {
    expect(sidebarCode).toContain('if (!command) return;');
    expect(sidebarCode.indexOf('if (!command) return;')).toBeLessThan(sidebarCode.indexOf('event.preventDefault();'));
  });
});

describe('moving a heading is not pointer-only — W-271', () => {
  it('moves with Alt+Arrow through the same reorder the drag uses', () => {
    expect(keyboard).toContain('if (request.altKey && (request.key === \'ArrowUp\' || request.key === \'ArrowDown\')) {');
    expect(sidebarCode).toContain('onReorderOutline(source.id, target.id);');
  });

  it('keeps dragging as a second path, not the only one', () => {
    expect(sidebarCode).toContain('onDragStart={() => setDraggedHeadingId(item.id)}');
    expect(sidebarCode).toContain('if (draggedHeadingId && draggedHeadingId !== item.id && onReorderOutline) onReorderOutline(draggedHeadingId, item.id);');
  });

  it('says so in visible text rather than a tooltip', () => {
    expect(sidebarCode).toContain('Pfeiltasten wandern durch die Gliederung');
    expect(sidebarCode).toContain('verschiebt');
    // Only where reordering exists, and only when there is something to move.
    expect(sidebarCode).toContain("activeTab === 'toc' && onReorderOutline && filteredHeadings.length > 0");
  });
});
