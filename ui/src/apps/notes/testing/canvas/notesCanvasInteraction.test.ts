// STATUS: PLATIN — AST-0686/AST-0689: keyboard geometry and the note-page → canvas card transfer.
import { describe, expect, it } from 'vitest';
import type { NoteCanvasState } from '../../../../shared/contracts/workspace';
import { NOTE_CANVAS_MAX_BLOCKS, NOTE_CANVAS_MAX_EXTENT } from '../../canvas/notesCanvasModel';
import {
  NOTE_CANVAS_KEYBOARD_COARSE_STEP,
  NOTE_CANVAS_KEYBOARD_STEP,
  NOTE_CANVAS_MIN_HEIGHT,
  NOTE_CANVAS_MIN_WIDTH,
  nextCanvasBlockId,
  resolveCanvasKeyboardCommand,
  resolveCanvasMovePatch,
  resolveCanvasResizePatch,
} from '../../canvas/notesCanvasKeyboard';
import {
  NOTE_PAGE_DRAG_MIME,
  NOTE_PAGE_DRAG_SCHEMA,
  addNotePageCard,
  createNotePageDragPayload,
  notePageCardLinkText,
  parseNotePageDragPayload,
  serializeNotePageDragPayload,
} from '../../canvas/notesCanvasDrop';

const block = { x: 100, y: 100, width: 320, height: 160 };
const key = (over: Partial<Parameters<typeof resolveCanvasKeyboardCommand>[0]> = {}) => ({
  key: 'ArrowRight', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...over,
});

describe('AST-0686 canvas keyboard movement', () => {
  it('moves the card by the fine or coarse step', () => {
    expect(resolveCanvasMovePatch('ArrowRight', { block, shiftKey: false, altKey: false })).toEqual({ x: 100 + NOTE_CANVAS_KEYBOARD_STEP });
    expect(resolveCanvasMovePatch('ArrowLeft', { block, shiftKey: false, altKey: false })).toEqual({ x: 100 - NOTE_CANVAS_KEYBOARD_STEP });
    expect(resolveCanvasMovePatch('ArrowDown', { block, shiftKey: false, altKey: true })).toEqual({ y: 100 + NOTE_CANVAS_KEYBOARD_COARSE_STEP });
    expect(resolveCanvasMovePatch('ArrowUp', { block, shiftKey: false, altKey: true })).toEqual({ y: 100 - NOTE_CANVAS_KEYBOARD_COARSE_STEP });
    expect(resolveCanvasMovePatch('Enter', { block, shiftKey: false, altKey: false })).toBeNull();
  });

  it('never pushes a card out of the canvas extent', () => {
    const atOrigin = { x: 0, y: 0, width: 320, height: 160 };
    expect(resolveCanvasMovePatch('ArrowLeft', { block: atOrigin, shiftKey: false, altKey: false })).toEqual({ x: 0 });
    expect(resolveCanvasMovePatch('ArrowUp', { block: atOrigin, shiftKey: false, altKey: false })).toEqual({ y: 0 });
    const atEdge = { x: NOTE_CANVAS_MAX_EXTENT - 320, y: NOTE_CANVAS_MAX_EXTENT - 160, width: 320, height: 160 };
    expect(resolveCanvasMovePatch('ArrowRight', { block: atEdge, shiftKey: false, altKey: false })).toEqual({ x: NOTE_CANVAS_MAX_EXTENT - 320 });
    expect(resolveCanvasMovePatch('ArrowDown', { block: atEdge, shiftKey: false, altKey: false })).toEqual({ y: NOTE_CANVAS_MAX_EXTENT - 160 });
  });

  it('survives a hostile geometry instead of producing NaN', () => {
    const broken = { x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN };
    const patch = resolveCanvasMovePatch('ArrowRight', { block: broken, shiftKey: false, altKey: false });
    expect(patch).toEqual({ x: NOTE_CANVAS_KEYBOARD_STEP });
  });
});

describe('AST-0686 canvas keyboard resizing', () => {
  it('resizes with Shift+arrows and honours the minimum size', () => {
    expect(resolveCanvasResizePatch('ArrowRight', { block, shiftKey: true, altKey: false })).toEqual({ width: 320 + NOTE_CANVAS_KEYBOARD_STEP });
    expect(resolveCanvasResizePatch('ArrowDown', { block, shiftKey: true, altKey: false })).toEqual({ height: 160 + NOTE_CANVAS_KEYBOARD_STEP });
    const tiny = { x: 0, y: 0, width: NOTE_CANVAS_MIN_WIDTH, height: NOTE_CANVAS_MIN_HEIGHT };
    expect(resolveCanvasResizePatch('ArrowLeft', { block: tiny, shiftKey: true, altKey: false })).toEqual({ width: NOTE_CANVAS_MIN_WIDTH });
    expect(resolveCanvasResizePatch('ArrowUp', { block: tiny, shiftKey: true, altKey: false })).toEqual({ height: NOTE_CANVAS_MIN_HEIGHT });
  });

  it('never resizes past the canvas extent', () => {
    const wide = { x: 0, y: 0, width: NOTE_CANVAS_MAX_EXTENT, height: NOTE_CANVAS_MAX_EXTENT };
    expect(resolveCanvasResizePatch('ArrowRight', { block: wide, shiftKey: true, altKey: false })).toEqual({ width: NOTE_CANVAS_MAX_EXTENT });
    expect(resolveCanvasResizePatch('ArrowDown', { block: wide, shiftKey: true, altKey: false })).toEqual({ height: NOTE_CANVAS_MAX_EXTENT });
  });
});

describe('AST-0686/AST-0689 one canvas key decision', () => {
  it('routes move, resize, remove, deselect and tab order', () => {
    expect(resolveCanvasKeyboardCommand(key(), { block, shiftKey: false, altKey: false })).toEqual({ type: 'move', patch: { x: 108 } });
    expect(resolveCanvasKeyboardCommand(key({ shiftKey: true }), { block, shiftKey: true, altKey: false })).toEqual({ type: 'resize', patch: { width: 328 } });
    expect(resolveCanvasKeyboardCommand(key({ key: 'Delete' }), { block, shiftKey: false, altKey: false })).toEqual({ type: 'remove' });
    expect(resolveCanvasKeyboardCommand(key({ key: 'Escape' }), { block, shiftKey: false, altKey: false })).toEqual({ type: 'deselect' });
    expect(resolveCanvasKeyboardCommand(key({ key: 'Tab' }), { block, shiftKey: false, altKey: false })).toEqual({ type: 'select-next', delta: 1 });
    expect(resolveCanvasKeyboardCommand(key({ key: 'Tab', shiftKey: true }), { block, shiftKey: true, altKey: false })).toEqual({ type: 'select-next', delta: -1 });
  });

  it('ignores IME composition, browser/shell chords and unrelated keys', () => {
    expect(resolveCanvasKeyboardCommand(key({ isComposing: true }), { block, shiftKey: false, altKey: false })).toBeNull();
    expect(resolveCanvasKeyboardCommand(key({ ctrlKey: true }), { block, shiftKey: false, altKey: false })).toBeNull();
    expect(resolveCanvasKeyboardCommand(key({ metaKey: true }), { block, shiftKey: false, altKey: false })).toBeNull();
    expect(resolveCanvasKeyboardCommand(key({ key: 'a' }), { block, shiftKey: false, altKey: false })).toBeNull();
  });

  it('walks the focus order by z-index and wraps only at the ends', () => {
    const blocks = [{ id: 'b', zIndex: 2 }, { id: 'a', zIndex: 1 }, { id: 'c', zIndex: 3 }];
    expect(nextCanvasBlockId(blocks, 'a', 1)).toBe('b');
    expect(nextCanvasBlockId(blocks, 'b', 1)).toBe('c');
    expect(nextCanvasBlockId(blocks, 'c', 1)).toBeNull();
    expect(nextCanvasBlockId(blocks, 'a', -1)).toBeNull();
    expect(nextCanvasBlockId(blocks, 'c', -1)).toBe('b');
    expect(nextCanvasBlockId(blocks, null, 1)).toBe('a');
    expect(nextCanvasBlockId(blocks, null, -1)).toBe('c');
    expect(nextCanvasBlockId(blocks, 'ghost', 1)).toBe('a');
    expect(nextCanvasBlockId([], 'a', 1)).toBeNull();
  });
});

describe('AST-0686 note page → canvas card', () => {
  const page = { id: 'page-finding-01', title: 'Finding 01' };

  it('round-trips a bounded drag payload and rejects a hostile one', () => {
    const payload = createNotePageDragPayload(page);
    expect(NOTE_PAGE_DRAG_MIME).toBe('application/x-astraea-notes-page');
    expect(payload).toEqual({ schema: NOTE_PAGE_DRAG_SCHEMA, pageId: 'page-finding-01', title: 'Finding 01' });
    expect(parseNotePageDragPayload(serializeNotePageDragPayload(payload))).toEqual(payload);
    expect(parseNotePageDragPayload('not json')).toBeNull();
    expect(parseNotePageDragPayload(null)).toBeNull();
    expect(parseNotePageDragPayload('{"schema":"other","pageId":"a","title":"b"}')).toBeNull();
    expect(parseNotePageDragPayload('{"schema":"astraea.notes.page","pageId":"","title":"b"}')).toBeNull();
    expect(parseNotePageDragPayload(`{"schema":"astraea.notes.page","pageId":"a","title":"${'x'.repeat(300)}"}`)).toBeNull();
    expect(parseNotePageDragPayload('{"schema":"astraea.notes.page","pageId":"a","title":"b","extra":1}')).toBeNull();
    expect(parseNotePageDragPayload('x'.repeat(2000))).toBeNull();
  });

  it('creates one text card that links back through the canonical wiki link', () => {
    const canvas = addNotePageCard(undefined, createNotePageDragPayload(page), { x: 120, y: 90 });
    expect(canvas).not.toBeNull();
    expect(canvas!.blocks).toHaveLength(1);
    const card = canvas!.blocks[0];
    expect(card.kind).toBe('text');
    if (card.kind !== 'text') return;
    expect(card.text).toBe('[[Finding 01]]');
    expect({ x: card.x, y: card.y }).toEqual({ x: 120, y: 90 });
    expect(notePageCardLinkText(createNotePageDragPayload(page))).toBe('[[Finding 01]]');
  });

  it('clamps a hostile drop position and refuses at the block bound', () => {
    const clamped = addNotePageCard(undefined, createNotePageDragPayload(page), { x: Number.NaN, y: -50 });
    expect(clamped!.blocks[0]).toMatchObject({ x: 56, y: 0 });
    const full: NoteCanvasState = {
      pageMode: 'infinite', pageSize: 'A4', background: 'plain', backgroundColor: '#0a0d14',
      blocks: Array.from({ length: NOTE_CANVAS_MAX_BLOCKS }, (_, index) => ({
        id: `b${index}`, kind: 'text' as const, x: 0, y: 0, width: 320, height: 160, zIndex: index + 1, text: 'x',
      })),
    };
    expect(addNotePageCard(full, createNotePageDragPayload(page), { x: 10, y: 10 })).toBeNull();
  });
});
