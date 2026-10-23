// STATUS: PLATIN — bounded, pure Present object formatting for the *visible selection*.
//
// Paket 5 "Textbox mit WYSIWYG bearbeiten": "Schrift, Zeilenabstand und Ausrichtung auf sichtbare
// Auswahl anwenden". The "visible selection" is the canvas selection (`selectedSceneObjectIds`), so
// the formatting rule has to be a pure function of (objects, selection, patch) — otherwise the
// inspector could format one object while the canvas highlights three.
//
// Honest boundary: a text object stores one plain string, so formatting applies to the **whole
// object**, not to a sub-string range. Range-level rich text would need a per-run model in the
// shared contract, which this app does not own. That is documented, not hidden.

import type { PresentSceneObject, PresentTextSceneObject } from '../../../../shared/contracts/workspace';
import {
  PRESENT_MAX_FONT_FAMILY_LENGTH,
  readPresentTextStyle,
  withPresentTextStyle,
} from './presentObjectExtensions';
import { normalizePresentSelection, type PresentSelectableObject } from './presentSelection';

export interface PresentTextFormatPatch {
  fontSizePt?: number;
  fontWeight?: PresentTextSceneObject['fontWeight'];
  color?: string;
  textAlign?: PresentTextSceneObject['textAlign'];
  backgroundColor?: string;
  /** Multiplier of the font size. */
  lineHeight?: number;
  /** CSS font family stack. */
  fontFamily?: string;
}

export interface PresentTextFormatResult {
  objects: PresentSceneObject[];
  changedIds: string[];
  /** Selected objects that are not text objects and were therefore left alone. */
  skippedNonTextIds: string[];
}

export const PRESENT_FONT_SIZE_MIN_PT = 6;
export const PRESENT_FONT_SIZE_MAX_PT = 400;
export const PRESENT_LINE_HEIGHT_MIN = 0.5;
export const PRESENT_LINE_HEIGHT_MAX = 4;

/** `#rgb`, `#rrggbb`, `#rrggbbaa`; anything else is rejected rather than stored. */
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function normalizePresentFontSizePt(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.min(PRESENT_FONT_SIZE_MAX_PT, Math.max(PRESENT_FONT_SIZE_MIN_PT, Math.round(numeric * 10) / 10));
}

export function normalizePresentLineHeight(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.min(PRESENT_LINE_HEIGHT_MAX, Math.max(PRESENT_LINE_HEIGHT_MIN, Math.round(numeric * 100) / 100));
}

export function normalizePresentFontFamily(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // A font stack is a list of names plus generic keywords; reject anything that could leave the
  // style attribute (quotes, braces, semicolons, angle brackets).
  const cleaned = value.replace(/[^A-Za-z0-9 ,\-_'"]/g, '').trim().slice(0, PRESENT_MAX_FONT_FAMILY_LENGTH);
  return cleaned || undefined;
}

export function normalizePresentColor(value: unknown): string | undefined {
  return typeof value === 'string' && COLOR_PATTERN.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

/**
 * Applies a text format to every selected text object. Invalid values are dropped field by field
 * (fail-closed, never stored), non-text objects are reported instead of silently ignored, and
 * locked objects are left unchanged.
 */
export function applyPresentTextFormat(
  objects: readonly PresentSceneObject[],
  ids: readonly string[],
  patch: PresentTextFormatPatch,
): PresentTextFormatResult {
  const selection = new Set(normalizePresentSelection(objects as unknown as PresentSelectableObject[], ids));
  const next: PresentTextFormatPatch = {};
  if (patch.fontSizePt !== undefined) {
    const size = normalizePresentFontSizePt(patch.fontSizePt);
    if (size !== undefined) next.fontSizePt = size;
  }
  if (patch.lineHeight !== undefined) {
    const lineHeight = normalizePresentLineHeight(patch.lineHeight);
    if (lineHeight !== undefined) next.lineHeight = lineHeight;
  }
  if (patch.fontFamily !== undefined) {
    const fontFamily = normalizePresentFontFamily(patch.fontFamily);
    if (fontFamily !== undefined) next.fontFamily = fontFamily;
  }
  if (patch.color !== undefined) {
    const color = normalizePresentColor(patch.color);
    if (color !== undefined) next.color = color;
  }
  if (patch.backgroundColor !== undefined) {
    const backgroundColor = normalizePresentColor(patch.backgroundColor);
    if (backgroundColor !== undefined) next.backgroundColor = backgroundColor;
  }
  if (patch.fontWeight !== undefined) next.fontWeight = patch.fontWeight;
  if (patch.textAlign !== undefined) next.textAlign = patch.textAlign;

  const changedIds: string[] = [];
  const skippedNonTextIds: string[] = [];
  const result = objects.map((object) => {
    if (!selection.has(object.id)) return object;
    if (object.kind !== 'text') {
      skippedNonTextIds.push(object.id);
      return object;
    }
    if (object.locked) return object;
    const currentStyle = readPresentTextStyle(object);
    const merged = { ...currentStyle, ...next };
    // "Changed" must mean "a requested field actually differs", otherwise an unchanged format call
    // would still create an undo entry and report a change that did not happen.
    const requested: Array<[unknown, unknown]> = (
      [
        [next.fontSizePt, object.fontSizePt],
        [next.fontWeight, object.fontWeight],
        [next.color, object.color],
        [next.textAlign, object.textAlign],
        [next.backgroundColor, object.backgroundColor],
        [next.lineHeight, currentStyle.lineHeight],
        [next.fontFamily, currentStyle.fontFamily],
      ] as Array<[unknown, unknown]>
    ).filter(([wanted]) => wanted !== undefined);
    if (requested.every(([wanted, existing]) => wanted === existing)) return object;
    changedIds.push(object.id);
    const styled = withPresentTextStyle(object, merged);
    return {
      ...styled,
      fontSizePt: merged.fontSizePt ?? object.fontSizePt,
      fontWeight: merged.fontWeight ?? object.fontWeight,
      color: merged.color ?? object.color,
      textAlign: merged.textAlign ?? object.textAlign,
      backgroundColor: merged.backgroundColor ?? object.backgroundColor,
    } as PresentSceneObject;
  });

  return { objects: result, changedIds, skippedNonTextIds };
}
