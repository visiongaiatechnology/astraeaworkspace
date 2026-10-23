// STATUS: PLATIN — the single definition of Present's presentation-mode keyboard.
//
// Before this module the presenter key handling lived inline in `PresenterModeModal` and covered
// only Escape, ArrowLeft/Right, Space, PageUp/Down, B, W and L. Paket 20 additionally requires
// Home/End, a slide-number jump, and every one of them to be provable from a table instead of a
// comment. `resolvePresenterKey` is that table.

export type PresenterCommandType =
  | 'exit'
  | 'next'
  | 'previous'
  | 'first-slide'
  | 'last-slide'
  | 'goto-slide'
  | 'black'
  | 'white'
  | 'laser'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'no-tool'
  | 'toggle-pause'
  | 'zoom-in'
  | 'zoom-out'
  | 'clear-ink'
  | 'help';

export interface PresenterCommand {
  type: PresenterCommandType;
  /** Only for `goto-slide`: the 1-based slide number typed by the presenter. */
  slideNumber?: number;
}

export interface PresenterKeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface PresenterKeyContext {
  /** Digit buffer already typed (from consecutive number keys). Empty when none. */
  digitBuffer?: string;
  blackScreen?: boolean;
  whiteScreen?: boolean;
  kioskMode?: boolean;
}

/** Consecutive digits longer than this cannot be a slide number. */
export const PRESENTER_MAX_DIGIT_BUFFER = 4;

export function isPresenterDigit(key: string): boolean {
  return /^[0-9]$/.test(key);
}

/**
 * Appends a digit to the presenter's slide-number buffer.
 * Returns `null` when the key is not a digit, so callers can distinguish "not mine".
 */
export function appendPresenterDigit(buffer: string, key: string): string | null {
  if (!isPresenterDigit(key)) return null;
  const next = `${buffer}${key}`.slice(-PRESENTER_MAX_DIGIT_BUFFER);
  return next.replace(/^0+(?=\d)/, '');
}

/**
 * Total, deterministic resolution of a presentation-mode keystroke.
 * The function never inspects global state; everything it needs is in `context`.
 */
export function resolvePresenterKey(
  input: PresenterKeyInput,
  context: PresenterKeyContext = {},
): PresenterCommand | null {
  const key = String(input.key ?? '');
  const lower = key.toLowerCase();
  const ctrl = Boolean(input.ctrlKey || input.metaKey);
  const shift = Boolean(input.shiftKey);
  const buffer = context.digitBuffer ?? '';

  if (key === 'Escape') return { type: 'exit' };
  if (key === 'ArrowRight' || key === ' ' || key === 'Spacebar' || key === 'PageDown' || key === 'ArrowDown') {
    return { type: 'next' };
  }
  if (key === 'ArrowLeft' || key === 'PageUp' || key === 'ArrowUp') return { type: 'previous' };
  if (key === 'Home') return { type: 'first-slide' };
  if (key === 'End') return { type: 'last-slide' };
  if (key === 'Enter' && buffer) return { type: 'goto-slide', slideNumber: Number(buffer) };

  if (ctrl) {
    if (lower === 'p') return { type: 'pen' };
    if (lower === 'h') return { type: 'highlighter' };
    if (lower === 'e') return { type: 'eraser' };
    if (lower === 'a') return { type: 'no-tool' };
    if (key === '=' || key === '+') return { type: 'zoom-in' };
    if (key === '-' || key === '_') return { type: 'zoom-out' };
    return null;
  }

  if (lower === 'b') return { type: 'black' };
  if (lower === 'w') return { type: 'white' };
  if (lower === 'l') return { type: 'laser' };
  if (lower === 'p') return { type: 'pen' };
  if (lower === 'e') return { type: 'eraser' };
  if (lower === 'c') return { type: 'clear-ink' };
  if (lower === 'k') return { type: 'toggle-pause' };
  if (key === '?' || (shift && key === '/')) return { type: 'help' };
  if (key === '+' || key === '=') return { type: 'zoom-in' };
  if (key === '-' || key === '_') return { type: 'zoom-out' };

  return null;
}

export interface PresentationStartInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Start keys for the *editor*: F5 starts from the first slide, Shift+F5 from the active one.
 * Returns `null` for every other key so the editor keymap stays authoritative for the rest.
 */
export function resolvePresentationStartKey(
  input: PresentationStartInput,
): { fromCurrent: boolean } | null {
  if (input.key !== 'F5') return null;
  return { fromCurrent: Boolean(input.shiftKey) };
}

export interface PresenterBinding {
  fn: string;
  binding: string;
  commandType: PresenterCommandType;
}

/** The presentation-mode keyboard contract; a test asserts the resolver honours every row. */
export const PRESENTER_BINDINGS: readonly PresenterBinding[] = [
  { fn: 'exit-presentation', binding: 'Escape', commandType: 'exit' },
  { fn: 'next-slide', binding: 'ArrowRight / Space / PageDown', commandType: 'next' },
  { fn: 'previous-slide', binding: 'ArrowLeft / PageUp', commandType: 'previous' },
  { fn: 'first-slide', binding: 'Home', commandType: 'first-slide' },
  { fn: 'last-slide', binding: 'End', commandType: 'last-slide' },
  { fn: 'goto-slide', binding: '<number> Enter', commandType: 'goto-slide' },
  { fn: 'black-screen', binding: 'B', commandType: 'black' },
  { fn: 'white-screen', binding: 'W', commandType: 'white' },
  { fn: 'laser-pointer', binding: 'L', commandType: 'laser' },
  { fn: 'pen', binding: 'P or Ctrl+P', commandType: 'pen' },
  { fn: 'highlighter', binding: 'Ctrl+H', commandType: 'highlighter' },
  { fn: 'eraser', binding: 'E or Ctrl+E', commandType: 'eraser' },
  { fn: 'arrow-pointer', binding: 'Ctrl+A', commandType: 'no-tool' },
  { fn: 'clear-ink', binding: 'C', commandType: 'clear-ink' },
  { fn: 'pause-timer', binding: 'K', commandType: 'toggle-pause' },
  { fn: 'zoom', binding: '+ / -', commandType: 'zoom-in' },
  { fn: 'shortcut-help', binding: '?', commandType: 'help' },
];

export const PRESENTER_BINDING_INPUTS: Record<string, PresenterKeyInput> = {
  'exit-presentation': { key: 'Escape' },
  'next-slide': { key: 'ArrowRight' },
  'previous-slide': { key: 'ArrowLeft' },
  'first-slide': { key: 'Home' },
  'last-slide': { key: 'End' },
  'goto-slide': { key: 'Enter' },
  'black-screen': { key: 'b' },
  'white-screen': { key: 'w' },
  'laser-pointer': { key: 'l' },
  pen: { key: 'p' },
  highlighter: { key: 'h', ctrlKey: true },
  eraser: { key: 'e' },
  'arrow-pointer': { key: 'a', ctrlKey: true },
  'clear-ink': { key: 'c' },
  'pause-timer': { key: 'k' },
  zoom: { key: '+' },
  'shortcut-help': { key: '?' },
};
