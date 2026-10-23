// STATUS: PLATIN
// Pure keyboard intent resolution for the Whiteboard canvas.
//
// Every essential canvas function must have a keyboard path, never pointer-only. Draw resolves the
// same class of intents in `apps/draw/interactions/drawSelectionEngine.ts`
// (`resolveDrawSelectionCommand`), and the command *shape* is intentionally mirrored here so both
// canvases behave alike. The command set differs, so the modules stay separate:
//  * Draw owns a page/layer model with `forward`/`backward` z-order and page navigation; Whiteboard's
//    canonical commit path exposes one z-order step per direction (`layerWhiteboardSelection`).
//  * Draw claims Tab for object cycling. Whiteboard's canvas is a *focus stop inside a larger shell*
//    (toolbar, panels, dialogs), so hijacking Tab would trap keyboard users in the canvas. Object
//    cycling therefore lives on Alt+ArrowDown / Alt+ArrowUp, and the visible keyboard object list
//    (`WhiteboardObjectList`) is the documented, fully reachable list of board objects.

export interface WhiteboardKeyboardEventLike {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

export type WhiteboardKeyboardCommand =
  | { readonly kind: 'cancel' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'edit-text' }
  | { readonly kind: 'select-next' }
  | { readonly kind: 'select-previous' }
  | { readonly kind: 'select-all' }
  | { readonly kind: 'move'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'group' }
  | { readonly kind: 'ungroup' }
  | { readonly kind: 'z-order'; readonly direction: 'front' | 'back' }
  | { readonly kind: 'add-child-node' }
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'zoom'; readonly factor: number }
  | { readonly kind: 'fit-all' };

export interface WhiteboardKeyboardContext {
  /** Movement step in world units: the grid size when snapping is on, otherwise one unit. */
  readonly step: number;
  /** True while a native text control inside the canvas owns the keystroke. */
  readonly editingText: boolean;
  /** True when at least one object is selected. */
  readonly hasSelection: boolean;
}

export const WHITEBOARD_KEYBOARD_PAN_STEP = 48;
export const WHITEBOARD_KEYBOARD_FAST_PAN_FACTOR = 3.333;
export const WHITEBOARD_KEYBOARD_MOVE_FACTOR = 10;

const MOVE_KEYS: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Maps a key event to a canvas command. `null` means "not ours" so the caller lets the event bubble
 * to the shell. Pass `editingText: true` while a text object is being edited so the canvas only keeps
 * Escape (leaving the editor) and never steals typing keys.
 */
export function resolveWhiteboardKeyboardCommand(
  event: WhiteboardKeyboardEventLike,
  context: WhiteboardKeyboardContext,
): WhiteboardKeyboardCommand | null {
  if (!event || typeof event.key !== 'string' || event.key.length === 0) return null;
  if (context.editingText) return event.key === 'Escape' ? { kind: 'cancel' } : null;

  const key = event.key;
  const lower = key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  const step = Number.isFinite(context.step) && context.step > 0 ? context.step : 1;

  if (key === 'Escape') return { kind: 'cancel' };
  if (key === 'Delete' || key === 'Backspace') return { kind: 'delete' };
  if (key === 'F2') return { kind: 'edit-text' };

  if (event.altKey && !mod) {
    if (key === 'ArrowDown') return { kind: 'select-next' };
    if (key === 'ArrowUp') return { kind: 'select-previous' };
  }

  if (mod) {
    if (lower === 'a') return { kind: 'select-all' };
    if (lower === 'g') return { kind: event.shiftKey ? 'ungroup' : 'group' };
    if (key === 'Enter') return context.hasSelection ? { kind: 'add-child-node' } : null;
    if (key === ']') return { kind: 'z-order', direction: 'front' };
    if (key === '[') return { kind: 'z-order', direction: 'back' };
    return null;
  }

  const direction = MOVE_KEYS[key];
  if (direction) {
    if (event.altKey) return null;
    if (context.hasSelection) {
      const factor = event.shiftKey ? WHITEBOARD_KEYBOARD_MOVE_FACTOR : 1;
      return { kind: 'move', dx: direction.x * step * factor, dy: direction.y * step * factor };
    }
    const panStep = event.shiftKey
      ? WHITEBOARD_KEYBOARD_PAN_STEP * WHITEBOARD_KEYBOARD_FAST_PAN_FACTOR
      : WHITEBOARD_KEYBOARD_PAN_STEP;
    // Sign helper keeps untouched axes at a plain zero instead of a negative zero.
    const along = (component: number) => (component === 0 ? 0 : -component * panStep);
    return { kind: 'pan', dx: along(direction.x), dy: along(direction.y) };
  }

  if (key === '+' || key === '=') return { kind: 'zoom', factor: 1.15 };
  if (key === '-') return { kind: 'zoom', factor: 1 / 1.15 };
  if (key === '0') return { kind: 'fit-all' };
  return null;
}

/** Localized-by-caller help text contract; the canvas renders this through `aria-describedby`. */
export const WHITEBOARD_KEYBOARD_HELP =
  'Arrow keys move the selected objects, or pan the canvas when nothing is selected. Shift and arrow keys move further, '
  + 'Alt and arrow keys cycle the selection, Shift plus Alt plus arrow keys is the same in reverse, plus and minus zoom, '
  + 'zero fits all objects, F2 edits the selected text, Control or Command plus Enter adds a mind-map child node to the '
  + 'selected node, Escape clears the selection, and Control or Command shortcuts cover select all, group, ungroup, layer '
  + 'order, undo and redo.';
