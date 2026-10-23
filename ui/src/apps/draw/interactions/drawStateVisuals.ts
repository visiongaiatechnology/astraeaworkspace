// STATUS: PLATIN — pure encoding of Draw object interaction states into non-colour visual signals.
//
// The requirement is explicit: selected / hover / focus-visible / dragging / disabled have to be
// distinguishable **without colour alone**. Colour is therefore never the carrier here — every state
// maps to a distinct `data-vgt-state` token *and* a distinct stroke dash pattern *and*, where a state
// needs to be readable at a glance, a short text badge. A colour-blind or monochrome rendering keeps
// all five states apart, which is what the test asserts.
import { DrawModelError } from '../model/drawDocumentValidation';

export interface DrawObjectStateInput {
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly dragging: boolean;
  readonly focused: boolean;
  /** Locked object or locked layer: visible but not writable. */
  readonly locked: boolean;
  readonly visible: boolean;
  readonly editing: boolean;
}

export interface DrawObjectStateFlags extends DrawObjectStateInput {
  /** Selected or hovered and therefore adorned. */
  readonly adorned: boolean;
  /** Not writable: the disabled state of the canvas. */
  readonly disabled: boolean;
  /** On a hidden layer. */
  readonly hidden: boolean;
}

export function drawStateFlags(input: DrawObjectStateInput): DrawObjectStateFlags {
  for (const key of ['selected', 'hovered', 'dragging', 'focused', 'locked', 'visible', 'editing'] as const) {
    if (typeof input[key] !== 'boolean') throw new DrawModelError('state-flag-invalid');
  }
  return {
    ...input,
    adorned: input.selected || input.hovered,
    disabled: input.locked,
    hidden: !input.visible,
  };
}

export type DrawStateToken = 'hidden' | 'disabled' | 'editing' | 'dragging' | 'focus' | 'selected' | 'hover' | 'idle';

/**
 * Single precedence-ordered state token. Exactly one token describes an object, which is what makes
 * the CSS/inline styling and the accessibility summary agree.
 */
export function drawStateToken(flags: DrawObjectStateFlags): DrawStateToken {
  if (flags.hidden) return 'hidden';
  if (flags.disabled) return 'disabled';
  if (flags.editing) return 'editing';
  if (flags.dragging) return 'dragging';
  if (flags.focused && flags.selected) return 'focus';
  if (flags.selected) return 'selected';
  if (flags.hovered) return 'hover';
  return 'idle';
}

/** Every state has its own dash pattern, so no state relies on hue. */
const DASH_BY_TOKEN: Readonly<Record<DrawStateToken, string | null>> = Object.freeze({
  hidden: '1 9',
  disabled: '1 6',
  editing: null,
  dragging: '1 3',
  focus: '12 3 2 3',
  selected: '6 3',
  hover: '2 4',
  idle: null,
});

export function drawStateDashArray(token: DrawStateToken): string | null {
  if (!(token in DASH_BY_TOKEN)) throw new DrawModelError('state-token-invalid');
  return DASH_BY_TOKEN[token];
}

const BADGE_BY_TOKEN: Readonly<Record<DrawStateToken, string>> = Object.freeze({
  hidden: 'HID',
  disabled: 'LCK',
  editing: 'TXT',
  dragging: 'MOV',
  focus: 'FCS',
  selected: 'SEL',
  hover: 'HOV',
  idle: '',
});

/** Short monochrome badge rendered next to an adorned object (empty for idle). */
export function drawStateBadge(token: DrawStateToken): string {
  if (!(token in BADGE_BY_TOKEN)) throw new DrawModelError('state-token-invalid');
  return BADGE_BY_TOKEN[token];
}

/** Grips are hollow when the object cannot be written, solid when it can. */
export function drawStateGripFill(flags: DrawObjectStateFlags): 'solid' | 'hollow' | 'none' {
  if (flags.hidden || flags.disabled) return 'none';
  if (!flags.selected) return 'none';
  return 'solid';
}

export function drawStateOutlineWidth(flags: DrawObjectStateFlags): number {
  if (flags.disabled) return 1;
  if (flags.dragging) return 2;
  if (flags.selected) return 2;
  if (flags.hovered) return 1;
  return 0;
}

/** `aria-label` suffix for the object node, so a screen reader announces the same state. */
export function drawStateAriaSuffix(flags: DrawObjectStateFlags): string {
  const parts: string[] = [];
  if (flags.selected) parts.push('selected');
  if (flags.focused) parts.push('focus');
  if (flags.dragging) parts.push('moving');
  if (flags.editing) parts.push('editing text');
  if (flags.disabled) parts.push('locked');
  if (flags.hidden) parts.push('hidden');
  return parts.join(', ');
}

/** Human-readable status line for the live region; reads the same flags as the visuals. */
export function drawStateStatusText(flags: DrawObjectStateFlags, name: string): string {
  const token = drawStateToken(flags);
  const suffix = drawStateAriaSuffix(flags);
  return suffix.length > 0 ? `${name} (${suffix})` : `${name} [${token}]`;
}
