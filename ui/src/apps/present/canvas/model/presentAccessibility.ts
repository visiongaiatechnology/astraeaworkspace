// STATUS: PLATIN — accessible reading order, alt-text coverage and contrast (Paket 29).
//
// "Folienscreenreader-Reihenfolge, Bild-Alternativtexte und Kontrast prüfen".
//
// Measured before this module: only images carried `altText` (editable in the inspector). Scene
// objects had no accessible description, nothing defined the order a screen reader should announce
// them in, and nothing checked whether the chosen text colour is readable on the slide background.
// Present's z-order is a *painting* order; the reading order has to be a separate, explicit decision
// because an object can be visually in front while logically later.

import type { PresentSceneObject } from '../../../../shared/contracts/workspace';
import { readPresentAltText, readPresentGroupId, readPresentLink } from './presentObjectExtensions';
import { sortPresentLayers } from './presentScene';

export interface PresentReadingOrderEntry {
  id: string;
  kind: PresentSceneObject['kind'] | 'image';
  /** 1-based announcement position. */
  position: number;
  /** Accessible name the screen reader should use; never empty. */
  label: string;
  /** True when the object carries an author-written alt text. */
  hasAltText: boolean;
  /** True when the object is a link, so the announcement must add "link". */
  isLink: boolean;
  zIndex: number;
}

export interface PresentReadingOrderObject {
  id: string;
  /** Scene-object kind, or `image` for the freeform images of `slide.images[]` (Paket 29 includes them). */
  kind?: PresentSceneObject['kind'] | 'image';
  hidden?: boolean;
  zIndex?: number;
  text?: string;
  name?: string;
  altText?: string;
  link?: unknown;
  label?: string;
  title?: string;
}

const KIND_LABELS: Record<string, string> = {
  text: 'Text',
  shape: 'Shape',
  widget: 'Widget',
  chart: 'Chart',
  table: 'Table',
  diagram: 'Diagram',
  code: 'Code block',
  workspace: 'Workspace reference',
  image: 'Image',
};

function fallbackName(object: PresentReadingOrderObject): string {
  const kind = KIND_LABELS[String(object.kind ?? 'image')] ?? 'Object';
  const detail =
    (typeof object.text === 'string' && object.text.trim()) ||
    (typeof object.title === 'string' && object.title.trim()) ||
    (typeof object.label === 'string' && object.label.trim()) ||
    (typeof object.name === 'string' && object.name.trim()) ||
    '';
  return detail ? `${kind}: ${detail.slice(0, 80)}` : `${kind} object`;
}

/**
 * Reading order: back-to-front by z-order, ties in document order (the same order the layers pane
 * shows, reversed), skipping hidden objects. This is deliberately *not* the DOM order, which is a
 * rendering detail.
 */
export function buildPresentReadingOrder(
  objects: readonly PresentReadingOrderObject[],
  options: { includeHidden?: boolean } = {},
): PresentReadingOrderEntry[] {
  const visible = objects.filter((object) => options.includeHidden === true || object.hidden !== true);
  return sortPresentLayers(visible.map((object) => ({ ...object, zIndex: object.zIndex ?? 1 })) as Array<PresentReadingOrderObject & { zIndex: number }>)
    .map((object, index) => {
      const altText = readPresentAltText(object);
      const isLink = readPresentLink(object) !== null && readPresentLink(object) !== undefined;
      const groupId = readGroupIdSafely(object);
      return {
        id: object.id,
        kind: (object.kind ?? 'image') as PresentReadingOrderEntry['kind'],
        position: index + 1,
        label: altText || `${fallbackName(object)}${groupId ? ' (grouped)' : ''}`,
        hasAltText: Boolean(altText),
        isLink,
        zIndex: object.zIndex ?? 1,
      };
    });
}

function readGroupIdSafely(object: unknown): string | null {
  try {
    return readPresentGroupId(object);
  } catch {
    return null;
  }
}

export interface PresentAltTextReport {
  total: number;
  withAltText: number;
  /** Objects that need an author-written description: images and everything that is a link. */
  missing: Array<{ id: string; kind: string; label: string }>;
  /** Objects whose description is decorative-only (a shape used purely as a divider). */
  decorative: string[];
}

/** Which objects still need an alternative text; the inspector and any acceptance run use this. */
export function auditPresentAltText(objects: readonly PresentReadingOrderObject[]): PresentAltTextReport {
  const visible = objects.filter((object) => object.hidden !== true);
  const missing: PresentAltTextReport['missing'] = [];
  const decorative: string[] = [];
  let withAltText = 0;
  for (const object of visible) {
    const altText = readPresentAltText(object);
    const isLink = readPresentLink(object) !== null && readPresentLink(object) !== undefined;
    if (altText) {
      withAltText += 1;
      continue;
    }
    const kind = String(object.kind ?? 'image');
    const needsText = kind === 'image' || kind === 'chart' || kind === 'table' || kind === 'diagram' || kind === 'workspace' || isLink;
    if (needsText) missing.push({ id: object.id, kind, label: fallbackName(object) });
    else decorative.push(object.id);
  }
  return { total: visible.length, withAltText, missing, decorative };
}

// ---------------------------------------------------------------------------------------------
// Contrast (WCAG 2.1 relative luminance / contrast ratio)
// ---------------------------------------------------------------------------------------------

export interface PresentRgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb`, `#rrggbb` and `#rrggbbaa`; anything else returns `null` (fail-closed). */
export function parsePresentColor(value: unknown): PresentRgb | null {
  if (typeof value !== 'string') return null;
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  const expand = hex.length === 3 ? hex.split('').map((character) => `${character}${character}`).join('') : hex.slice(0, 6);
  return {
    r: parseInt(expand.slice(0, 2), 16),
    g: parseInt(expand.slice(2, 4), 16),
    b: parseInt(expand.slice(4, 6), 16),
  };
}

/** WCAG 2.1 relative luminance. */
export function presentRelativeLuminance(color: PresentRgb): number {
  const channel = (raw: number): number => {
    const value = Math.min(255, Math.max(0, raw)) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG contrast ratio, 1..21. Returns `null` when either colour cannot be parsed. */
export function presentContrastRatio(foreground: unknown, background: unknown): number | null {
  const front = parsePresentColor(foreground);
  const back = parsePresentColor(background);
  if (!front || !back) return null;
  const light = Math.max(presentRelativeLuminance(front), presentRelativeLuminance(back));
  const dark = Math.min(presentRelativeLuminance(front), presentRelativeLuminance(back));
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

export interface PresentContrastFinding {
  objectId: string;
  ratio: number | null;
  /** WCAG AA for large text is 3:1, for normal text 4.5:1. */
  required: number;
  passes: boolean;
  message: string;
}

/**
 * Checks every text object's colour against the slide background. An unparseable colour is a
 * finding too ("could not be checked"), never a silent pass.
 */
export function auditPresentContrast(
  objects: readonly PresentReadingOrderObject[],
  slideBackground: string,
): PresentContrastFinding[] {
  const findings: PresentContrastFinding[] = [];
  for (const object of objects) {
    if (object.hidden === true || object.kind !== 'text') continue;
    const record = object as unknown as { color?: unknown; fontSizePt?: unknown; backgroundColor?: unknown };
    const background = typeof record.backgroundColor === 'string' && record.backgroundColor !== 'transparent'
      ? record.backgroundColor
      : slideBackground;
    const fontSize = typeof record.fontSizePt === 'number' ? record.fontSizePt : 18;
    const required = fontSize >= 18 ? 3 : 4.5;
    const ratio = presentContrastRatio(record.color, background);
    findings.push({
      objectId: object.id,
      ratio,
      required,
      passes: ratio !== null && ratio >= required,
      message:
        ratio === null
          ? `Object ${object.id}: contrast could not be checked (unparseable colour).`
          : `Object ${object.id}: contrast ${ratio}:1 (needs ${required}:1).`,
    });
  }
  return findings;
}
