// STATUS: PLATIN
// Canonical text/typography contract for Whiteboard objects.
//
// ## Why this module exists
//
// The package "Text- und Schrifteditor" asks for text editing **and** typography. The editing half was
// present (double-click to edit on every text-bearing object kind); the typography half did not exist
// anywhere, because `WhiteboardObjectModel` has no style field at all. This module is the single place
// that defines the allowed values, the bounds and the one formatter every renderer uses — the renderer,
// the SVG export and the raster export must never invent their own font string or their own value list.
//
// ## Schema ownership (measured, not assumed)
//
// The field travels inside the **same** canonical carrier as every other Whiteboard object property
// (`whiteboardData.items`); it is not a second store, a second URI form or a second parser. The shared
// contract (`shared/contracts/whiteboard/workspaceWhiteboard.ts`) is owned by another agent, so the
// field is declared in this app's own schema (`types.ts`) with documented bounds and normalisation.
// A later promotion of `textStyle` into the shared contract is the migration path for cross-app
// consumers; until then, consumers that do not know the field simply see the untouched text.

import type { WhiteboardItem, WhiteboardTextStyle } from '../types';

export const WHITEBOARD_TEXT_SIZE_MIN = 8;
export const WHITEBOARD_TEXT_SIZE_MAX = 200;
export const WHITEBOARD_TEXT_SIZE_OPTIONS = Object.freeze([10, 12, 14, 16, 20, 28, 40, 64]);
export const WHITEBOARD_TEXT_WEIGHTS = Object.freeze(['normal', 'bold'] as const);
export const WHITEBOARD_TEXT_FAMILIES = Object.freeze(['sans', 'serif', 'mono'] as const);
export const WHITEBOARD_TEXT_ALIGNS = Object.freeze(['left', 'center', 'right'] as const);
export const WHITEBOARD_TEXT_MAX_STYLED_ITEMS = 4_096;

export const WHITEBOARD_TEXT_STYLE_DEFAULTS: WhiteboardTextStyle = Object.freeze({
  fontSize: 14,
  fontWeight: 'normal',
  fontFamily: 'sans',
  align: 'left',
});

const FAMILY_CSS: Readonly<Record<WhiteboardTextStyle['fontFamily'], string>> = Object.freeze({
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Mono", monospace',
});

/** Object kinds that actually paint a text label and can therefore carry a text style. */
const TEXT_BEARING_TYPES: ReadonlySet<string> = new Set([
  'sticky', 'process', 'decision', 'terminal', 'text', 'frame', 'shape', 'icon', 'table',
  'card', 'document', 'chart', 'code', 'media', 'reaction', 'live',
]);

export function whiteboardItemSupportsTextStyle(item: WhiteboardItem | undefined): boolean {
  return Boolean(item && TEXT_BEARING_TYPES.has(item.type));
}

/** Bounded, total normalisation: invalid or missing input becomes the documented default. */
export function normalizeWhiteboardTextStyle(raw: unknown): WhiteboardTextStyle {
  const candidate = (raw ?? {}) as Partial<WhiteboardTextStyle>;
  const size = Number(candidate.fontSize);
  const fontSize = Number.isFinite(size)
    ? Math.round(Math.max(WHITEBOARD_TEXT_SIZE_MIN, Math.min(WHITEBOARD_TEXT_SIZE_MAX, size)) * 10) / 10
    : WHITEBOARD_TEXT_STYLE_DEFAULTS.fontSize;
  const fontWeight = WHITEBOARD_TEXT_WEIGHTS.includes(candidate.fontWeight as 'normal' | 'bold')
    ? candidate.fontWeight as WhiteboardTextStyle['fontWeight']
    : WHITEBOARD_TEXT_STYLE_DEFAULTS.fontWeight;
  const fontFamily = WHITEBOARD_TEXT_FAMILIES.includes(candidate.fontFamily as 'sans' | 'serif' | 'mono')
    ? candidate.fontFamily as WhiteboardTextStyle['fontFamily']
    : WHITEBOARD_TEXT_STYLE_DEFAULTS.fontFamily;
  const align = WHITEBOARD_TEXT_ALIGNS.includes(candidate.align as 'left' | 'center' | 'right')
    ? candidate.align as WhiteboardTextStyle['align']
    : WHITEBOARD_TEXT_STYLE_DEFAULTS.align;
  return { fontSize, fontWeight, fontFamily, align };
}

/** Item-level normaliser used by the canonical mutation pipeline. */
export function normalizeWhiteboardItemTextStyle(item: WhiteboardItem): WhiteboardItem {
  if (item.textStyle === undefined) return item;
  if (!whiteboardItemSupportsTextStyle(item)) {
    const { textStyle: _discarded, ...rest } = item;
    void _discarded;
    return rest as WhiteboardItem;
  }
  return { ...item, textStyle: normalizeWhiteboardTextStyle(item.textStyle) };
}

/** The effective style of an object: its stored style or the documented default. */
export function whiteboardTextStyleForItem(item: WhiteboardItem | undefined): WhiteboardTextStyle {
  if (!item || !whiteboardItemSupportsTextStyle(item)) return WHITEBOARD_TEXT_STYLE_DEFAULTS;
  return item.textStyle ? normalizeWhiteboardTextStyle(item.textStyle) : WHITEBOARD_TEXT_STYLE_DEFAULTS;
}

/**
 * Applies a style patch to the selected text-bearing objects. Locked objects are never restyled, and
 * the selection is bounded so one action cannot restyle an unbounded number of objects.
 */
export function setWhiteboardTextStyle(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  patch: Partial<WhiteboardTextStyle>,
): WhiteboardItem[] {
  if (ids.size === 0 || ids.size > WHITEBOARD_TEXT_MAX_STYLED_ITEMS) return items;
  return items.map((item) => {
    if (!ids.has(item.id) || item.locked || !whiteboardItemSupportsTextStyle(item)) return item;
    return { ...item, textStyle: normalizeWhiteboardTextStyle({ ...whiteboardTextStyleForItem(item), ...patch }) };
  });
}

export function whiteboardTextFamilyCss(family: WhiteboardTextStyle['fontFamily']): string {
  return FAMILY_CSS[family] ?? FAMILY_CSS.sans;
}

/**
 * The one formatter for every renderer. `canvasFont` is a ready `ctx.font` value; the numeric parts are
 * what SVG needs (`font-size`, `font-weight`, `font-family`, `text-anchor`), and `css` is what the DOM
 * renderer needs. No renderer may compute these values itself.
 */
export function whiteboardTextRenderParams(style: WhiteboardTextStyle | undefined): {
  fontSize: number;
  fontWeight: WhiteboardTextStyle['fontWeight'];
  fontFamily: WhiteboardTextStyle['fontFamily'];
  align: WhiteboardTextStyle['align'];
  familyCss: string;
  canvasFont: string;
  svgFontWeight: string;
  svgTextAnchor: 'start' | 'middle' | 'end';
} {
  const safe = normalizeWhiteboardTextStyle(style);
  const familyCss = whiteboardTextFamilyCss(safe.fontFamily);
  return {
    fontSize: safe.fontSize,
    fontWeight: safe.fontWeight,
    fontFamily: safe.fontFamily,
    align: safe.align,
    familyCss,
    canvasFont: `${safe.fontWeight === 'bold' ? 'bold ' : ''}${safe.fontSize}px ${familyCss}`,
    svgFontWeight: safe.fontWeight === 'bold' ? '700' : '400',
    svgTextAnchor: safe.align === 'center' ? 'middle' : safe.align === 'right' ? 'end' : 'start',
  };
}
