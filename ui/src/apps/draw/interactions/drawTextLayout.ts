// STATUS: PLATIN — pure Draw text wrapping/measurement feeding the canonical rich-text engine.
import type { DrawObject, DrawRichText, DrawTextRun } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../model/drawDocumentValidation';
import { autoFitDrawText, normalizeDrawRichText, setObjectRichText } from '../model/drawContentEngine';

/** Default UI font size for shapes that carry no explicit run size. */
export const DEFAULT_DRAW_FONT_SIZE = 14;
/** Average glyph advance as a fraction of font size for the bundled system UI stack. */
const AVERAGE_ADVANCE_RATIO = 0.55;
const LINE_HEIGHT_RATIO = 1.25;
export const MAX_DRAW_TEXT_LINES = 4096;

export function drawObjectPlainText(object: Pick<DrawObject, 'richText' | 'name'>): string {
  if (object.richText) return object.richText.runs.map((run) => run.text).join('');
  return object.name;
}

export function drawObjectFontSize(object: Pick<DrawObject, 'richText'>): number {
  const size = object.richText?.runs[0]?.fontSize ?? DEFAULT_DRAW_FONT_SIZE;
  return Number.isFinite(size) && size >= 4 && size <= 512 ? size : DEFAULT_DRAW_FONT_SIZE;
}

/**
 * Greedy word wrap that also breaks over-long single words. Pure and deterministic so the wrapping
 * shown in the direct-edit overlay matches the committed model text.
 *
 * Argument order `(text, maxWidth, fontSize)` is shared with `measureDrawText`.
 */
export function wrapDrawText(text: string, maxWidth: number, fontSize: number): string[] {
  if (typeof text !== 'string') throw new DrawModelError('text-invalid');
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new DrawModelError('text-width-invalid');
  const size = Number.isFinite(fontSize) && fontSize >= 4 ? fontSize : DEFAULT_DRAW_FONT_SIZE;
  const charactersPerLine = Math.max(1, Math.floor(maxWidth / (size * AVERAGE_ADVANCE_RATIO)));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (word.length === 0) continue;
      const candidate = current.length === 0 ? word : `${current}${word}`;
      if (candidate.length <= charactersPerLine) {
        current = candidate;
        continue;
      }
      if (current.trim().length > 0) lines.push(current.replace(/\s+$/u, ''));
      if (word.length <= charactersPerLine) {
        current = word.replace(/^\s+/u, '');
        continue;
      }
      // Single token longer than the line: hard-break it.
      let remaining = word.replace(/^\s+/u, '');
      while (remaining.length > charactersPerLine) {
        lines.push(remaining.slice(0, charactersPerLine));
        remaining = remaining.slice(charactersPerLine);
      }
      current = remaining;
      if (lines.length > MAX_DRAW_TEXT_LINES) throw new DrawModelError('text-line-limit');
    }
    if (current.length > 0 || paragraph.length === 0) lines.push(current);
    if (lines.length > MAX_DRAW_TEXT_LINES) throw new DrawModelError('text-line-limit');
  }
  return lines.length > 0 ? lines : [''];
}

export interface DrawTextMeasurement {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
}

/** Shares the `(text, maxWidth, fontSize)` argument order of `wrapDrawText`. */
export function measureDrawText(text: string, maxWidth: number, fontSize: number): DrawTextMeasurement {
  const size = Number.isFinite(fontSize) && fontSize >= 4 ? fontSize : DEFAULT_DRAW_FONT_SIZE;
  const lines = wrapDrawText(text, maxWidth, size);
  const longest = lines.reduce((maximum, line) => Math.max(maximum, line.length), 0);
  return {
    width: Math.ceil(longest * size * AVERAGE_ADVANCE_RATIO),
    height: Math.ceil(lines.length * size * LINE_HEIGHT_RATIO),
    lines,
  };
}

/** Measurement adapter in the shape `autoFitDrawText` expects. */
export function drawTextMeasureFunction(maxWidth: number): (text: string, fontSize: number) => { width: number; height: number } {
  return (text, fontSize) => {
    const measured = measureDrawText(text, maxWidth, fontSize);
    return { width: measured.width, height: measured.height };
  };
}

export interface DrawTextEditOptions {
  readonly autoFit?: DrawRichText['autoFit'];
  readonly verticalAlign?: DrawRichText['verticalAlign'];
  readonly padding?: DrawRichText['padding'];
}

/** Whole-object typography, as shown and edited by the Shape Style Inspector. */
export interface DrawTypographySnapshot {
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly color: string | null;
  readonly fontFamily: string | null;
  readonly verticalAlign: DrawRichText['verticalAlign'];
  readonly autoFit: DrawRichText['autoFit'];
}

export interface DrawTypographyPatch {
  readonly fontSize?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly color?: string;
  readonly fontFamily?: string;
  readonly verticalAlign?: DrawRichText['verticalAlign'];
  readonly autoFit?: DrawRichText['autoFit'];
}

const DEFAULT_TEXT_COLOR = '#f8fafc';

function defaultRichText(object: Pick<DrawObject, 'richText' | 'name'>): DrawRichText {
  return object.richText ?? {
    runs: [{ text: drawObjectPlainText(object) }],
    autoFit: 'shrink',
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
    verticalAlign: 'middle',
    rotation: 0,
  };
}

/** Reads the first run's typography; the canvas editor writes uniform runs, so one run is the truth. */
export function describeDrawObjectTypography(object: Pick<DrawObject, 'richText' | 'name'>): DrawTypographySnapshot {
  const source = defaultRichText(object);
  const run = source.runs[0];
  return {
    fontSize: drawObjectFontSize(object),
    bold: run?.bold === true,
    italic: run?.italic === true,
    underline: run?.underline === true,
    color: run?.color ?? null,
    fontFamily: run?.fontFamily ?? null,
    verticalAlign: source.verticalAlign,
    autoFit: source.autoFit,
  };
}

/**
 * Applies a typography patch to every run of the object. Delegates normalization to
 * `normalizeDrawRichText` and text fitting to `autoFitDrawText`, so no second rich-text rule exists.
 */
export function applyDrawObjectTypography(object: DrawObject, patch: DrawTypographyPatch): DrawObject {
  if (typeof patch !== 'object' || patch === null) throw new DrawModelError('typography-patch-invalid');
  if (patch.fontSize !== undefined && (!Number.isFinite(patch.fontSize) || patch.fontSize < 4 || patch.fontSize > 512)) {
    throw new DrawModelError('font-size-invalid');
  }
  for (const key of ['bold', 'italic', 'underline'] as const) {
    const value = patch[key];
    if (value !== undefined && typeof value !== 'boolean') throw new DrawModelError('typography-patch-invalid');
  }
  if (patch.verticalAlign !== undefined && !['top', 'middle', 'bottom'].includes(patch.verticalAlign)) {
    throw new DrawModelError('typography-patch-invalid');
  }
  if (patch.autoFit !== undefined && !['none', 'shrink', 'resize-shape'].includes(patch.autoFit)) {
    throw new DrawModelError('typography-patch-invalid');
  }

  const source = defaultRichText(object);
  const runs: DrawTextRun[] = source.runs.map((run) => {
    const next: DrawTextRun = { ...run };
    if (patch.fontSize !== undefined) next.fontSize = patch.fontSize;
    if (patch.bold !== undefined) next.bold = patch.bold;
    if (patch.italic !== undefined) next.italic = patch.italic;
    if (patch.underline !== undefined) next.underline = patch.underline;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
    return next;
  });
  const normalized = normalizeDrawRichText({
    ...source,
    runs,
    verticalAlign: patch.verticalAlign ?? source.verticalAlign,
    autoFit: patch.autoFit ?? source.autoFit,
  });
  const withText = setObjectRichText(object, normalized);
  if (normalized.autoFit === 'none') return withText;
  const maxWidth = Math.max(1, object.width - normalized.padding.left - normalized.padding.right);
  return autoFitDrawText(withText, drawTextMeasureFunction(maxWidth));
}

export const DEFAULT_DRAW_TEXT_COLOR = DEFAULT_TEXT_COLOR;

/**
 * Commits text typed directly into a shape. Reuses `setObjectRichText` (the canonical normalizer) and
 * `autoFitDrawText` so no second rich-text rule exists. Existing run styling is preserved.
 */
export function setDrawObjectPlainText(object: DrawObject, text: string, options?: DrawTextEditOptions): DrawObject {
  if (typeof text !== 'string') throw new DrawModelError('text-invalid');
  if (text.length > 512 * 1024) throw new DrawModelError('richtext-size-limit');
  const template: DrawTextRun | undefined = object.richText?.runs[0];
  const run: DrawTextRun = template
    ? { ...template, text }
    : { text, fontSize: DEFAULT_DRAW_FONT_SIZE };
  const source: DrawRichText = object.richText ?? {
    runs: [{ text }],
    autoFit: 'shrink',
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
    verticalAlign: 'middle',
    rotation: 0,
  };
  const next: DrawRichText = normalizeDrawRichText({
    ...source,
    runs: [run],
    autoFit: options?.autoFit ?? source.autoFit,
    verticalAlign: options?.verticalAlign ?? source.verticalAlign,
    padding: options?.padding ?? source.padding,
  });
  const withText = setObjectRichText(object, next);
  if (next.autoFit === 'none') return withText;
  const maxWidth = Math.max(1, object.width - next.padding.left - next.padding.right);
  return autoFitDrawText(withText, drawTextMeasureFunction(maxWidth));
}
