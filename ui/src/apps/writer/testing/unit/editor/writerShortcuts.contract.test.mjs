// STATUS: PLATIN — Source contract for the Writer shortcut wiring
//
// The map and the target filter are pure and unit-tested. What unit tests cannot
// reach is that the window listener actually consults them, and that the two break
// actions really come from the editor state — a pure rule nobody calls protects
// nothing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const hook = read('../../../editor/useWriterKeyboardShortcuts.ts');
const editor = read('../../../editor/WriterEditor.tsx');
const pagePaper = read('../../../layout/pages/WriterPagePaper.tsx');

describe('Writer shortcut wiring contract', () => {
  it('applies the target filter inside the key listener', () => {
    expect(hook).toContain('filterWriterShortcut(resolveWriterShortcut(e), describeShortcutTarget(e.target))');
    // WR-017 (native M4 probe): the editing **root** has the focus while typing, the flow items
    // are its descendants — the selector has to know both, or every editor shortcut is filtered
    // out as if the user were in a dialog.
    expect(hook).toContain('[data-writer-rich-surface=\"true\"], [data-writer-flow-item]');
    expect(hook).toContain("const FORM_FIELD_SELECTOR = 'input, textarea, select, [contenteditable=\"true\"]';");
    expect(hook).toContain('data-writer-header-zone');
  });

  it('no longer resolves a command without looking at the focused element', () => {
    expect(hook).not.toContain('const command = resolveWriterShortcut(e);');
  });

  it('wires both break actions from the editor state', () => {
    expect(editor).toContain('handleInsertPageBreak: isHistoricalReview ? () => undefined : state.handleInsertPageBreak,');
    expect(editor).toContain('handleInsertColumnBreak: isHistoricalReview ? () => undefined : state.handleInsertColumnBreak,');
  });

  it('keeps the writing surface reachable for shortcuts', () => {
    // The paragraph flow items are what makes a textarea part of the document.
    expect(pagePaper).toContain('data-writer-flow-item="paragraph"');
  });

  it('documents the new bindings where the user can find them', () => {
    // Ctrl+Enter must be discoverable, not just implemented.
    const shortcuts = read('../../../editor/writerShortcuts.ts');
    expect(shortcuts).toContain("if (isCtrlOrCmd && !input.shiftKey && key === 'Enter') return { kind: 'insert-page-break' };");
    expect(shortcuts).toContain("if (key === 'Enter') return { kind: 'insert-column-break' };");
  });
});
