// BATCH-PRESENT — the editor keyboard contract (Paket 4, 5, 8, 9, 20, 31).
// This suite is the counter-measure for "a pointer-only essential function is a defect": it proves
// that every essential function is reachable from a keystroke.
import { describe, expect, it } from 'vitest';
import {
  PRESENT_EDITOR_BINDING_INPUTS,
  PRESENT_EDITOR_BINDINGS,
  PRESENT_EDITOR_CANVAS_CONTEXT,
  PRESENT_ESSENTIAL_EDITOR_FUNCTIONS,
  isPresentEditorShortcut,
  resolvePresentEditorCommand,
} from '../../editor/presentEditorCommands';

const canvas = PRESENT_EDITOR_CANVAS_CONTEXT;
const typing = { editableTarget: true, hasSelection: true };

describe('Present editor keyboard', () => {
  it('binds every essential editor function to at least one keystroke', () => {
    const bound = new Set(PRESENT_EDITOR_BINDINGS.map((entry) => entry.fn));
    const missing = PRESENT_ESSENTIAL_EDITOR_FUNCTIONS.filter((fn) => !bound.has(fn));
    expect(missing).toEqual([]);
  });

  it('resolves the representative keystroke of every essential function to a command', () => {
    for (const fn of PRESENT_ESSENTIAL_EDITOR_FUNCTIONS) {
      const input = PRESENT_EDITOR_BINDING_INPUTS[fn];
      expect(input, `missing representative input for ${fn}`).toBeTruthy();
      const command = resolvePresentEditorCommand(input, canvas);
      expect(command, `${fn} is pointer-only`).not.toBeNull();
      const declared = PRESENT_EDITOR_BINDINGS.find((entry) => entry.fn === fn);
      expect(command?.type, `${fn} resolves to the wrong command`).toBe(declared?.commandType);
    }
  });

  it('never claims the same binding for two essential functions', () => {
    const bindings = PRESENT_EDITOR_BINDINGS.map((entry) => entry.binding);
    expect(new Set(bindings).size).toBe(bindings.length);
  });

  it('moves by 0.25 %, by 2 % with Shift and resizes with Alt', () => {
    expect(resolvePresentEditorCommand({ key: 'ArrowRight' }, canvas)).toEqual({ type: 'nudge', dxPercent: 0.25, dyPercent: 0 });
    expect(resolvePresentEditorCommand({ key: 'ArrowUp' }, canvas)).toEqual({ type: 'nudge', dxPercent: 0, dyPercent: -0.25 });
    expect(resolvePresentEditorCommand({ key: 'ArrowRight', shiftKey: true }, canvas)).toEqual({ type: 'nudge', dxPercent: 2, dyPercent: 0 });
    expect(resolvePresentEditorCommand({ key: 'ArrowDown', altKey: true }, canvas)).toEqual({ type: 'resize', dxPercent: 0, dyPercent: 1 });
  });

  it('orders layers the way PowerPoint does and keeps the four directions distinct', () => {
    expect(resolvePresentEditorCommand({ key: ']', ctrlKey: true }, canvas)).toEqual({ type: 'layer', action: 'forward' });
    expect(resolvePresentEditorCommand({ key: '[', ctrlKey: true }, canvas)).toEqual({ type: 'layer', action: 'backward' });
    expect(resolvePresentEditorCommand({ key: ']', ctrlKey: true, shiftKey: true }, canvas)).toEqual({ type: 'layer', action: 'front' });
    expect(resolvePresentEditorCommand({ key: '[', ctrlKey: true, shiftKey: true }, canvas)).toEqual({ type: 'layer', action: 'back' });
  });

  it('starts a presentation with F5 and from the active slide with Shift+F5', () => {
    expect(resolvePresentEditorCommand({ key: 'F5' }, canvas)).toEqual({ type: 'start-presentation', fromCurrent: false });
    expect(resolvePresentEditorCommand({ key: 'F5', shiftKey: true }, canvas)).toEqual({ type: 'start-presentation', fromCurrent: true });
    // F5 also works while a text field has focus, which is where a presenter usually is.
    expect(resolvePresentEditorCommand({ key: 'F5' }, typing)).toEqual({ type: 'start-presentation', fromCurrent: false });
  });

  it('lets typing win inside a text field and only keeps Escape and F5', () => {
    expect(resolvePresentEditorCommand({ key: 'a' }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'ArrowRight' }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'Delete' }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'Tab' }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'Escape' }, typing)).toEqual({ type: 'dismiss' });
    /**
     * PR-008 (M1) — the text field owns Ctrl+Z/Y while the caret is in it.
     *
     * Until this round the resolver answered with the document history *before* the
     * `editableTarget` guard, so native text undo was suppressed and the whole slide operation
     * was undone instead. Inside a caret these keys now belong to the field (`null`); outside the
     * caret the document history keeps them.
     */
    expect(resolvePresentEditorCommand({ key: 'z', ctrlKey: true }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'z', ctrlKey: true, shiftKey: true }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'y', ctrlKey: true }, typing)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'z', ctrlKey: true }, canvas)).toEqual({ type: 'undo' });
    expect(resolvePresentEditorCommand({ key: 'y', ctrlKey: true }, canvas)).toEqual({ type: 'redo' });
  });

  it('navigates slides with PageUp/PageDown/Home/End', () => {
    expect(resolvePresentEditorCommand({ key: 'PageDown' }, canvas)).toEqual({ type: 'next-slide' });
    expect(resolvePresentEditorCommand({ key: 'PageUp' }, canvas)).toEqual({ type: 'previous-slide' });
    expect(resolvePresentEditorCommand({ key: 'Home' }, canvas)).toEqual({ type: 'first-slide' });
    expect(resolvePresentEditorCommand({ key: 'End' }, canvas)).toEqual({ type: 'last-slide' });
  });

  it('groups, ungroups, locks, duplicates and deletes from the keyboard', () => {
    expect(resolvePresentEditorCommand({ key: 'g', ctrlKey: true }, canvas)).toEqual({ type: 'group' });
    expect(resolvePresentEditorCommand({ key: 'g', ctrlKey: true, shiftKey: true }, canvas)).toEqual({ type: 'ungroup' });
    expect(resolvePresentEditorCommand({ key: 'l', ctrlKey: true }, canvas)).toEqual({ type: 'toggle-lock' });
    expect(resolvePresentEditorCommand({ key: 'd', ctrlKey: true }, canvas)).toEqual({ type: 'duplicate-selection' });
    expect(resolvePresentEditorCommand({ key: 'Delete' }, canvas)).toEqual({ type: 'delete-selection' });
    expect(resolvePresentEditorCommand({ key: 'Backspace' }, canvas)).toEqual({ type: 'delete-selection' });
  });

  it('rotates and flips from the keyboard without stealing text keys', () => {
    expect(resolvePresentEditorCommand({ key: ']' }, canvas)).toEqual({ type: 'rotate', deltaDeg: 5 });
    expect(resolvePresentEditorCommand({ key: '[', shiftKey: true }, canvas)).toEqual({ type: 'rotate', deltaDeg: -15 });
    expect(resolvePresentEditorCommand({ key: 'h', altKey: true }, canvas)).toEqual({ type: 'flip', axis: 'x' });
    expect(resolvePresentEditorCommand({ key: 'v', altKey: true }, canvas)).toEqual({ type: 'flip', axis: 'y' });
    expect(resolvePresentEditorCommand({ key: 'h' }, canvas)).toBeNull();
  });

  it('reports its own shortcut detection so a handler can decide on preventDefault', () => {
    expect(isPresentEditorShortcut({ key: 'Tab' }, canvas)).toBe(true);
    expect(isPresentEditorShortcut({ key: 'q' }, canvas)).toBe(false);
    expect(isPresentEditorShortcut({ key: 'q' }, typing)).toBe(false);
  });

  it('moves the active slide with Ctrl/Cmd+ArrowUp/Down and leaves the other Ctrl+arrows alone', () => {
    // Paket 3: reordering a slide was pointer-only (HTML5 drag on the thumbnail). This is the
    // keyboard parity path, and it must not collide with the plain arrow nudge.
    expect(resolvePresentEditorCommand({ key: 'ArrowUp', ctrlKey: true }, canvas)).toEqual({ type: 'move-slide', delta: -1 });
    expect(resolvePresentEditorCommand({ key: 'ArrowDown', metaKey: true }, canvas)).toEqual({ type: 'move-slide', delta: 1 });
    expect(resolvePresentEditorCommand({ key: 'ArrowLeft', ctrlKey: true }, canvas)).toBeNull();
    expect(resolvePresentEditorCommand({ key: 'ArrowRight', ctrlKey: true }, canvas)).toBeNull();
    // Plain and Shift+arrow stay a geometry nudge.
    expect(resolvePresentEditorCommand({ key: 'ArrowUp' }, canvas)).toEqual({ type: 'nudge', dxPercent: 0, dyPercent: -0.25 });
    expect(resolvePresentEditorCommand({ key: 'ArrowDown', shiftKey: true }, canvas)).toEqual({ type: 'nudge', dxPercent: 0, dyPercent: 2 });
    // Inside a text field the caret keeps Ctrl+Arrow.
    expect(resolvePresentEditorCommand({ key: 'ArrowUp', ctrlKey: true }, typing)).toBeNull();
  });
});
