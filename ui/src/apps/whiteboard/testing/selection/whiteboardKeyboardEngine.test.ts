import { describe, expect, it } from 'vitest';
import {
  WHITEBOARD_KEYBOARD_PAN_STEP,
  resolveWhiteboardKeyboardCommand,
} from '../../selection/whiteboardKeyboardEngine';

const base = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
const press = (key: string, overrides: Partial<typeof base> = {}) => ({ ...base, key, ...overrides });
const context = (overrides: Partial<{ step: number; editingText: boolean; hasSelection: boolean }> = {}) => ({
  step: 1,
  editingText: false,
  hasSelection: false,
  ...overrides,
});

describe('Whiteboard keyboard intent resolution', () => {
  it('keeps only Escape while a native text control owns the keystroke', () => {
    expect(resolveWhiteboardKeyboardCommand(press('Escape'), context({ editingText: true }))).toEqual({ kind: 'cancel' });
    for (const key of ['Delete', 'a', 'ArrowLeft', ']', 'F2']) {
      expect(resolveWhiteboardKeyboardCommand(press(key, { ctrlKey: true }), context({ editingText: true })), key).toBeNull();
    }
  });

  it('maps the essential selection commands', () => {
    expect(resolveWhiteboardKeyboardCommand(press('Escape'), context())).toEqual({ kind: 'cancel' });
    expect(resolveWhiteboardKeyboardCommand(press('Delete'), context())).toEqual({ kind: 'delete' });
    expect(resolveWhiteboardKeyboardCommand(press('Backspace'), context())).toEqual({ kind: 'delete' });
    expect(resolveWhiteboardKeyboardCommand(press('F2'), context())).toEqual({ kind: 'edit-text' });
    expect(resolveWhiteboardKeyboardCommand(press('a', { ctrlKey: true }), context())).toEqual({ kind: 'select-all' });
    expect(resolveWhiteboardKeyboardCommand(press('g', { ctrlKey: true }), context())).toEqual({ kind: 'group' });
    expect(resolveWhiteboardKeyboardCommand(press('g', { ctrlKey: true, shiftKey: true }), context())).toEqual({ kind: 'ungroup' });
    expect(resolveWhiteboardKeyboardCommand(press(']', { metaKey: true }), context())).toEqual({ kind: 'z-order', direction: 'front' });
    expect(resolveWhiteboardKeyboardCommand(press('[', { metaKey: true }), context())).toEqual({ kind: 'z-order', direction: 'back' });
  });

  it('cycles the selection on Alt+Arrow without hijacking Tab', () => {
    expect(resolveWhiteboardKeyboardCommand(press('ArrowDown', { altKey: true }), context())).toEqual({ kind: 'select-next' });
    expect(resolveWhiteboardKeyboardCommand(press('ArrowUp', { altKey: true }), context())).toEqual({ kind: 'select-previous' });
    expect(resolveWhiteboardKeyboardCommand(press('Tab'), context())).toBeNull();
  });

  it('moves the selection when something is selected and pans the canvas otherwise', () => {
    expect(resolveWhiteboardKeyboardCommand(press('ArrowRight'), context({ hasSelection: true, step: 24 })))
      .toEqual({ kind: 'move', dx: 24, dy: 0 });
    expect(resolveWhiteboardKeyboardCommand(press('ArrowRight', { shiftKey: true }), context({ hasSelection: true, step: 24 })))
      .toEqual({ kind: 'move', dx: 240, dy: 0 });
    expect(resolveWhiteboardKeyboardCommand(press('ArrowRight'), context()))
      .toEqual({ kind: 'pan', dx: -WHITEBOARD_KEYBOARD_PAN_STEP, dy: 0 });
    expect(resolveWhiteboardKeyboardCommand(press('ArrowUp'), context()))
      .toEqual({ kind: 'pan', dx: 0, dy: WHITEBOARD_KEYBOARD_PAN_STEP });
  });

  it('keeps zoom and fit available and never steals the history shortcuts', () => {
    expect(resolveWhiteboardKeyboardCommand(press('+'), context())).toEqual({ kind: 'zoom', factor: 1.15 });
    expect(resolveWhiteboardKeyboardCommand(press('-'), context())).toEqual({ kind: 'zoom', factor: 1 / 1.15 });
    expect(resolveWhiteboardKeyboardCommand(press('0'), context())).toEqual({ kind: 'fit-all' });
    expect(resolveWhiteboardKeyboardCommand(press('z', { ctrlKey: true }), context())).toBeNull();
    expect(resolveWhiteboardKeyboardCommand(press('y', { ctrlKey: true }), context())).toBeNull();
    expect(resolveWhiteboardKeyboardCommand(press('q'), context())).toBeNull();
  });

  it('rejects malformed events instead of throwing', () => {
    expect(resolveWhiteboardKeyboardCommand({ ...base, key: '' }, context())).toBeNull();
  });
});
