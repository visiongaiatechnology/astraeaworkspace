// STATUS: DIAMANT VGT SUPREME — Shortcut map: target filtering, precedence, exhaustiveness
//
// W-078: a page break could only be inserted with the pointer. Without a DOM test
// runner the old if/else chain inside the window listener was unreachable, so the
// whole map had no test at all. It is a pure function now, and this file pins it.
//
// W-083: header/footer fields and dialog inputs are separate focus areas — a
// shortcut must not reach the document while one of them is focused.
import { describe, expect, it } from 'vitest';
import {
  filterWriterShortcut,
  resolveWriterShortcut,
  type WriterShortcutKeyInput,
  type WriterShortcutTargetInfo,
} from '../../../editor/writerShortcuts';

const key = (overrides: Partial<WriterShortcutKeyInput> = {}): WriterShortcutKeyInput => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

const ctrl = (k: string, shiftKey = false) => resolveWriterShortcut(key({ key: k, ctrlKey: true, shiftKey }));

const DOCUMENT_TEXTAREA: WriterShortcutTargetInfo = { isFormField: true, inDocumentSurface: true };
const HEADER_FIELD: WriterShortcutTargetInfo = { isFormField: true, inDocumentSurface: false };
const PAGE_SURFACE: WriterShortcutTargetInfo = { isFormField: false, inDocumentSurface: true };

describe('Writer shortcut map', () => {
  it('inserts a page break on Ctrl+Enter and a column break on Ctrl+Shift+Enter', () => {
    expect(ctrl('Enter')).toEqual({ kind: 'insert-page-break' });
    expect(ctrl('Enter', true)).toEqual({ kind: 'insert-column-break' });
  });

  it('never reports a shifted Enter as a page break', () => {
    // Each branch guards on `shiftKey` explicitly, so this holds whatever the
    // order of the branches is — the property that matters is that Shift is
    // honoured, not the sequence of the checks.
    const shifted = ctrl('Enter', true);
    expect(shifted?.kind).not.toBe('insert-page-break');
    expect(ctrl('Enter')?.kind).not.toBe('insert-column-break');
  });

  it('accepts Cmd on macOS for both break bindings', () => {
    expect(resolveWriterShortcut(key({ key: 'Enter', metaKey: true }))).toEqual({ kind: 'insert-page-break' });
    expect(resolveWriterShortcut(key({ key: 'Enter', metaKey: true, shiftKey: true })))
      .toEqual({ kind: 'insert-column-break' });
  });

  it('leaves a bare Enter to the editor', () => {
    expect(resolveWriterShortcut(key({ key: 'Enter' }))).toBeNull();
  });

  it('keeps every existing binding', () => {
    expect(ctrl('b')).toEqual({ kind: 'toggle-span', property: 'bold' });
    expect(ctrl('i')).toEqual({ kind: 'toggle-span', property: 'italic' });
    expect(ctrl('u')).toEqual({ kind: 'toggle-span', property: 'underline' });
    expect(ctrl('f')).toEqual({ kind: 'find-replace', replace: false });
    expect(ctrl('h')).toEqual({ kind: 'find-replace', replace: true });
    expect(ctrl('p')).toEqual({ kind: 'export' });
    expect(ctrl('z')).toEqual({ kind: 'undo' });
    expect(ctrl('y')).toEqual({ kind: 'redo' });
    expect(ctrl('z', true)).toEqual({ kind: 'redo' });
    expect(ctrl('e', true)).toEqual({ kind: 'toggle-track-changes' });
    expect(resolveWriterShortcut(key({ key: 'F9' }))).toEqual({ kind: 'update-fields' });
    expect(resolveWriterShortcut(key({ key: 'Escape' }))).toEqual({ kind: 'escape' });
  });

  it('matches letters while Shift is held', () => {
    // `event.key` is 'B' with Shift down; the binding must still resolve.
    expect(resolveWriterShortcut(key({ key: 'B', ctrlKey: true }))).toEqual({ kind: 'toggle-span', property: 'bold' });
  });

  it('does not treat Ctrl+Shift+Z as undo', () => {
    expect(ctrl('z', true)?.kind).not.toBe('undo');
  });

  it('ignores unrelated keys and modified keys without a binding', () => {
    for (const input of [
      key({ key: 'a' }),
      key({ key: 'Enter', shiftKey: true }),
      key({ key: 'ArrowDown' }),
      key({ key: 'Tab' }),
      key({ key: 'b' }),
      key({ key: 'z' }),
      key({ key: 'F5' }),
    ]) {
      expect(resolveWriterShortcut(input)).toBeNull();
    }
  });
});

describe('Writer shortcut target filtering', () => {
  it('runs in the document writing surface', () => {
    expect(filterWriterShortcut({ kind: 'toggle-span', property: 'bold' }, DOCUMENT_TEXTAREA))
      .toEqual({ kind: 'toggle-span', property: 'bold' });
    expect(filterWriterShortcut({ kind: 'insert-page-break' }, DOCUMENT_TEXTAREA))
      .toEqual({ kind: 'insert-page-break' });
  });

  it('keeps a header or footer field to itself', () => {
    // The acceptance: "In Header/Footer klicken, Felder ändern, getrennten
    // Bereichsfokus behalten." Ctrl+B in the header must not bold the body text,
    // and Ctrl+Enter must not break the page behind the user's back.
    expect(filterWriterShortcut({ kind: 'toggle-span', property: 'bold' }, HEADER_FIELD)).toBeNull();
    expect(filterWriterShortcut({ kind: 'insert-page-break' }, HEADER_FIELD)).toBeNull();
    expect(filterWriterShortcut({ kind: 'insert-column-break' }, HEADER_FIELD)).toBeNull();
    expect(filterWriterShortcut({ kind: 'undo' }, HEADER_FIELD)).toBeNull();
    expect(filterWriterShortcut({ kind: 'export' }, HEADER_FIELD)).toBeNull();
  });

  it('still lets Escape leave a field', () => {
    expect(filterWriterShortcut({ kind: 'escape' }, HEADER_FIELD)).toEqual({ kind: 'escape' });
  });

  it('runs outside any form field', () => {
    expect(filterWriterShortcut({ kind: 'undo' }, PAGE_SURFACE)).toEqual({ kind: 'undo' });
    expect(filterWriterShortcut({ kind: 'undo' }, { isFormField: false, inDocumentSurface: false }))
      .toEqual({ kind: 'undo' });
  });

  it('passes nothing through when no command was resolved', () => {
    expect(filterWriterShortcut(null, HEADER_FIELD)).toBeNull();
    expect(filterWriterShortcut(null, DOCUMENT_TEXTAREA)).toBeNull();
  });
});
