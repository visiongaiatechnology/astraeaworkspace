// STATUS: PLATIN — the single definition of Present's editor keyboard.
//
// Every essential canvas/editor function has exactly one binding here, and the binding table is
// exported so a test can prove that no essential function is pointer-only. Components stay thin:
// they translate a DOM event into this resolver's input and execute the returned command.
//
// Design rule: inside a text field only Escape, undo/redo and the presentation starters survive.
// Everything else returns `null` so typing a "d" or an arrow key never moves or deletes an object.

export type PresentEditorCommand =
  | { type: 'select-next' }
  | { type: 'select-previous' }
  | { type: 'select-all' }
  | { type: 'clear-selection' }
  /** Pointer selection of one object, resolved here so pointer and keyboard use one definition. */
  | { type: 'toggle-object-selection'; id: string; additive: boolean }
  | { type: 'nudge'; dxPercent: number; dyPercent: number }
  | { type: 'resize'; dxPercent: number; dyPercent: number }
  | { type: 'rotate'; deltaDeg: number }
  | { type: 'flip'; axis: 'x' | 'y' }
  | { type: 'delete-selection' }
  | { type: 'duplicate-selection' }
  | { type: 'layer'; action: 'front' | 'back' | 'forward' | 'backward' }
  | { type: 'group' }
  | { type: 'ungroup' }
  | { type: 'toggle-lock' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'next-slide' }
  | { type: 'previous-slide' }
  | { type: 'first-slide' }
  | { type: 'last-slide' }
  /** Moves the active slide one position up/down in the deck (Paket 3, keyboard parity to drag). */
  | { type: 'move-slide'; delta: -1 | 1 }
  | { type: 'start-presentation'; fromCurrent: boolean }
  /**
   * PR-010 (M1 keyboard-only): opens the caret of the selected text object — the keyboard parity
   * of double-click / Enter on the focused text box.
   */
  | { type: 'edit-selected-text' }
  | { type: 'dismiss' };

export interface PresentEditorKeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface PresentEditorKeyContext {
  /** The event target is an input/textarea/contenteditable: typing must win over commands. */
  editableTarget: boolean;
  hasSelection: boolean;
}

const NUDGE_STEP = 0.25;
const NUDGE_COARSE_STEP = 2;
const RESIZE_STEP = 1;
const ROTATE_STEP = 5;
const ROTATE_COARSE_STEP = 15;

const ARROWS: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};

/**
 * Resolves a keystroke to a Present editor command, or `null` when the keystroke is not Present's.
 * The function is total and deterministic: identical input always yields the identical command.
 */
export function resolvePresentEditorCommand(
  input: PresentEditorKeyInput,
  context: PresentEditorKeyContext,
): PresentEditorCommand | null {
  const key = String(input.key ?? '');
  const lower = key.toLowerCase();
  const ctrl = Boolean(input.ctrlKey || input.metaKey);
  const shift = Boolean(input.shiftKey);
  const alt = Boolean(input.altKey);

  // Always available, even while a text field has focus.
  if (key === 'F5') return { type: 'start-presentation', fromCurrent: shift };
  /**
   * PR-008 (M1) — a focused text caret owns its own undo/redo.
   *
   * Ctrl+Z/Y used to be resolved before the `editableTarget` guard, so typing into a text box
   * and pressing Ctrl+Z undid the whole *document* operation while the browser's native text
   * undo was suppressed — the masterplan's negative condition ("no shortcut fires wrongly while
   * the caret is in a text field"). Inside the caret the field keeps the keys; outside it the
   * document history keeps them.
   */
  if (ctrl && (lower === 'z' || lower === 'y')) {
    if (context.editableTarget) return null;
    if (lower === 'y') return { type: 'redo' };
    return shift ? { type: 'redo' } : { type: 'undo' };
  }
  if (key === 'Escape') return { type: 'dismiss' };

  if (context.editableTarget) return null;

  // PR-010 (M1 keyboard-only): F2 opens the caret of the selected text object. Inside a caret the
  // guard above wins, so F2 never fights the text field.
  if (key === 'F2') return { type: 'edit-selected-text' };

  const arrow = ARROWS[lower];
  if (arrow) {
    if (ctrl) {
      // Ctrl/Cmd+Up/Down moves the active *slide* - the keyboard equivalent of dragging the
      // thumbnail, which was drag-only before. Left/Right have no slide meaning and stay untouched.
      if (arrow.y === -1) return { type: 'move-slide', delta: -1 };
      if (arrow.y === 1) return { type: 'move-slide', delta: 1 };
      return null;
    }
    if (alt) {
      return { type: 'resize', dxPercent: arrow.x * RESIZE_STEP, dyPercent: arrow.y * RESIZE_STEP };
    }
    const step = shift ? NUDGE_COARSE_STEP : NUDGE_STEP;
    return { type: 'nudge', dxPercent: arrow.x * step, dyPercent: arrow.y * step };
  }

  if (key === 'PageDown') return { type: 'next-slide' };
  if (key === 'PageUp') return { type: 'previous-slide' };
  if (key === 'Home') return { type: 'first-slide' };
  if (key === 'End') return { type: 'last-slide' };

  if (key === 'Tab') return shift ? { type: 'select-previous' } : { type: 'select-next' };
  if (key === 'Delete' || key === 'Backspace') return { type: 'delete-selection' };

  if (!ctrl && key === '[') return { type: 'rotate', deltaDeg: shift ? -ROTATE_COARSE_STEP : -ROTATE_STEP };
  if (!ctrl && key === ']') return { type: 'rotate', deltaDeg: shift ? ROTATE_COARSE_STEP : ROTATE_STEP };

  if (alt && lower === 'h') return { type: 'flip', axis: 'x' };
  if (alt && lower === 'v') return { type: 'flip', axis: 'y' };

  if (ctrl) {
    if (lower === 'a') return { type: 'select-all' };
    if (lower === 'd') return { type: 'duplicate-selection' };
    if (lower === 'g') return shift ? { type: 'ungroup' } : { type: 'group' };
    if (lower === 'l') return { type: 'toggle-lock' };
    // Layer order is checked after the rotate branch, so `[`/`]` must be gated on `!ctrl`
    // above; otherwise Ctrl+] would rotate instead of bringing the object forward.
    if (key === ']') return { type: 'layer', action: shift ? 'front' : 'forward' };
    if (key === '[') return { type: 'layer', action: shift ? 'back' : 'backward' };
  }

  return null;
}

/** True when the keystroke belongs to Present at all; used to decide `preventDefault`. */
export function isPresentEditorShortcut(
  input: PresentEditorKeyInput,
  context: PresentEditorKeyContext,
): boolean {
  return resolvePresentEditorCommand(input, context) !== null;
}

export interface PresentEditorBinding {
  /** Stable id of the essential function. */
  fn: string;
  binding: string;
  commandType: PresentEditorCommand['type'];
}

/**
 * The keyboard contract. A test asserts that every essential editor function appears here and
 * resolves to a command, and that no two functions claim the same binding.
 */
export const PRESENT_ESSENTIAL_EDITOR_FUNCTIONS = [
  'select-next',
  'select-previous',
  'select-all',
  'clear-selection',
  'move-by-key',
  'move-coarse-by-key',
  'resize-by-key',
  'rotate-by-key',
  'flip-horizontal-by-key',
  'flip-vertical-by-key',
  'delete-selection',
  'duplicate-selection',
  'layer-forward',
  'layer-backward',
  'layer-front',
  'layer-back',
  'group',
  'ungroup',
  'toggle-lock',
  'undo',
  'redo',
  'next-slide',
  'previous-slide',
  'first-slide',
  'last-slide',
  'move-slide-up',
  'move-slide-down',
  'start-presentation-from-start',
  'start-presentation-from-current',
  // PR-010 (M1 keyboard-only): keyboard parity for "double-click a text object to type into it".
  'edit-selected-text',
] as const;

export type PresentEssentialEditorFunction = (typeof PRESENT_ESSENTIAL_EDITOR_FUNCTIONS)[number];

export const PRESENT_EDITOR_BINDINGS: readonly PresentEditorBinding[] = [
  { fn: 'select-next', binding: 'Tab', commandType: 'select-next' },
  { fn: 'select-previous', binding: 'Shift+Tab', commandType: 'select-previous' },
  { fn: 'select-all', binding: 'Ctrl/Cmd+A', commandType: 'select-all' },
  { fn: 'clear-selection', binding: 'Escape', commandType: 'dismiss' },
  { fn: 'move-by-key', binding: 'Arrow', commandType: 'nudge' },
  { fn: 'move-coarse-by-key', binding: 'Shift+Arrow', commandType: 'nudge' },
  { fn: 'resize-by-key', binding: 'Alt+Arrow', commandType: 'resize' },
  { fn: 'rotate-by-key', binding: '[ / ]', commandType: 'rotate' },
  { fn: 'flip-horizontal-by-key', binding: 'Alt+H', commandType: 'flip' },
  { fn: 'flip-vertical-by-key', binding: 'Alt+V', commandType: 'flip' },
  { fn: 'delete-selection', binding: 'Delete / Backspace', commandType: 'delete-selection' },
  { fn: 'duplicate-selection', binding: 'Ctrl/Cmd+D', commandType: 'duplicate-selection' },
  { fn: 'layer-forward', binding: 'Ctrl/Cmd+]', commandType: 'layer' },
  { fn: 'layer-backward', binding: 'Ctrl/Cmd+[', commandType: 'layer' },
  { fn: 'layer-front', binding: 'Ctrl/Cmd+Shift+]', commandType: 'layer' },
  { fn: 'layer-back', binding: 'Ctrl/Cmd+Shift+[', commandType: 'layer' },
  { fn: 'group', binding: 'Ctrl/Cmd+G', commandType: 'group' },
  { fn: 'ungroup', binding: 'Ctrl/Cmd+Shift+G', commandType: 'ungroup' },
  { fn: 'toggle-lock', binding: 'Ctrl/Cmd+L', commandType: 'toggle-lock' },
  { fn: 'undo', binding: 'Ctrl/Cmd+Z', commandType: 'undo' },
  { fn: 'redo', binding: 'Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y', commandType: 'redo' },
  { fn: 'next-slide', binding: 'PageDown', commandType: 'next-slide' },
  { fn: 'previous-slide', binding: 'PageUp', commandType: 'previous-slide' },
  { fn: 'first-slide', binding: 'Home', commandType: 'first-slide' },
  { fn: 'last-slide', binding: 'End', commandType: 'last-slide' },
  { fn: 'move-slide-up', binding: 'Ctrl/Cmd+ArrowUp', commandType: 'move-slide' },
  { fn: 'move-slide-down', binding: 'Ctrl/Cmd+ArrowDown', commandType: 'move-slide' },
  { fn: 'start-presentation-from-start', binding: 'F5', commandType: 'start-presentation' },
  { fn: 'start-presentation-from-current', binding: 'Shift+F5', commandType: 'start-presentation' },
  { fn: 'edit-selected-text', binding: 'F2', commandType: 'edit-selected-text' },
];

/** Representative key input per essential function, used by the coverage test. */
export const PRESENT_EDITOR_BINDING_INPUTS: Record<PresentEssentialEditorFunction, PresentEditorKeyInput> = {
  'select-next': { key: 'Tab' },
  'select-previous': { key: 'Tab', shiftKey: true },
  'select-all': { key: 'a', ctrlKey: true },
  'clear-selection': { key: 'Escape' },
  'move-by-key': { key: 'ArrowRight' },
  'move-coarse-by-key': { key: 'ArrowRight', shiftKey: true },
  'resize-by-key': { key: 'ArrowRight', altKey: true },
  'rotate-by-key': { key: ']' },
  'flip-horizontal-by-key': { key: 'h', altKey: true },
  'flip-vertical-by-key': { key: 'v', altKey: true },
  'delete-selection': { key: 'Delete' },
  'duplicate-selection': { key: 'd', ctrlKey: true },
  'layer-forward': { key: ']', ctrlKey: true },
  'layer-backward': { key: '[', ctrlKey: true },
  'layer-front': { key: ']', ctrlKey: true, shiftKey: true },
  'layer-back': { key: '[', ctrlKey: true, shiftKey: true },
  group: { key: 'g', ctrlKey: true },
  ungroup: { key: 'g', ctrlKey: true, shiftKey: true },
  'toggle-lock': { key: 'l', ctrlKey: true },
  undo: { key: 'z', ctrlKey: true },
  redo: { key: 'y', ctrlKey: true },
  'next-slide': { key: 'PageDown' },
  'previous-slide': { key: 'PageUp' },
  'first-slide': { key: 'Home' },
  'last-slide': { key: 'End' },
  'move-slide-up': { key: 'ArrowUp', ctrlKey: true },
  'move-slide-down': { key: 'ArrowDown', ctrlKey: true },
  'start-presentation-from-start': { key: 'F5' },
  'start-presentation-from-current': { key: 'F5', shiftKey: true },
  'edit-selected-text': { key: 'F2' },
};

export const PRESENT_EDITOR_CANVAS_CONTEXT: PresentEditorKeyContext = { editableTarget: false, hasSelection: true };
