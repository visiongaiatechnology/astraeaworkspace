// STATUS: DIAMANT VGT SUPREME — Paragraph-level formatting applied across a marked range
import type { Paragraph, ParagraphStyle, WriterTextAlignment } from '../../../../shared/contracts/workspace';
import {
  clampWriterParagraphIndentMm,
  clampWriterParagraphSpacingPt,
  normalizeWriterLineHeight,
  WRITER_LINE_HEIGHT_MAX,
  WRITER_LINE_HEIGHT_MIN,
} from './writerParagraphStyleBounds';
import { sameWriterStyleValue } from './writerStyleValue';

/**
 * Paragraph attributes such as alignment and line spacing belong to the whole
 * paragraph, so marking text inside one paragraph and marking three paragraphs
 * are different requests: the first means "this paragraph", the second means
 * "all of these". The previous implementation always changed the active
 * paragraph, so marking three paragraphs and centring them centred one.
 *
 * The bounds and the value checks live in one place (`writerParagraphStyleBounds`)
 * and are applied to *every* entry of a style patch, not only to the two named
 * fields: W-121 recorded that `style: { alignment: 'middle' }` reached the
 * document because the dedicated `alignment` field was the only checked path.
 */

export { normalizeWriterLineHeight, WRITER_LINE_HEIGHT_MAX, WRITER_LINE_HEIGHT_MIN };

const VALID_ALIGNMENTS: readonly WriterTextAlignment[] = ['left', 'center', 'right', 'justify', 'distributed'];

export function isWriterTextAlignment(value: unknown): value is WriterTextAlignment {
  return typeof value === 'string' && (VALID_ALIGNMENTS as readonly string[]).includes(value);
}

/**
 * Fields of `ParagraphStyle` whose value is a number with a known band. Anything
 * not named here is passed through as the caller wrote it, so a future field
 * cannot be clamped by accident.
 */
const STYLE_NUMBER_NORMALIZERS: Readonly<Record<string, (value: number | undefined) => number | undefined>> = {
  line_height: normalizeWriterLineHeight,
  left_indent_mm: clampWriterParagraphIndentMm,
  right_indent_mm: clampWriterParagraphIndentMm,
  first_line_indent_mm: clampWriterParagraphIndentMm,
  hanging_indent_mm: clampWriterParagraphIndentMm,
  space_before: clampWriterParagraphSpacingPt,
  space_after: clampWriterParagraphSpacingPt,
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Object-valued fields (`borders`, `shading`) are merged key by key. Replacing
 * them as a whole — the previous behaviour — meant that a patch naming only the
 * top border deleted the other three, so a caller could not describe a partial
 * change (W-122). A key sent as `undefined` still removes itself, which is how
 * the paragraph dialog unchecks a single side.
 */
function mergeWriterStyleObject(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/**
 * What a single style-patch entry does to the paragraph. `drop` is the important
 * one: a value the schema does not allow (an unknown alignment, a non-finite
 * indent) must not reach the document, and it must not silently be replaced by
 * the nearest legal value either — the command simply has no effect.
 */
type WriterStyleEntryAction =
  | { readonly kind: 'set'; readonly value: unknown }
  | { readonly kind: 'delete' }
  | { readonly kind: 'drop' };

function normalizeWriterStyleEntry(
  key: string,
  value: unknown,
  current: unknown,
): WriterStyleEntryAction {
  if (value === undefined) return { kind: 'delete' };
  if (key === 'alignment') {
    return isWriterTextAlignment(value) ? { kind: 'set', value } : { kind: 'drop' };
  }
  const normalizeNumber = STYLE_NUMBER_NORMALIZERS[key];
  if (normalizeNumber !== undefined) {
    if (typeof value !== 'number') return { kind: 'drop' };
    const normalized = normalizeNumber(value);
    return normalized === undefined ? { kind: 'drop' } : { kind: 'set', value: normalized };
  }
  if (isPlainRecord(value)) {
    return {
      kind: 'set',
      value: isPlainRecord(current) ? mergeWriterStyleObject(current, value) : { ...value },
    };
  }
  return { kind: 'set', value };
}

/**
 * The paragraph indices a paragraph-level command applies to.
 *
 * A marked range wins when it covers at least two paragraphs; otherwise the
 * active paragraph is the target. Indices that do not exist are dropped, so a
 * stale selection can never throw.
 */
export function resolveWriterParagraphTargets(
  paragraphs: readonly Paragraph[],
  activeParagraphIndex: number,
  coveredParagraphIds?: readonly string[] | null,
): number[] {
  const ids = coveredParagraphIds ?? [];
  if (ids.length >= 2) {
    const wanted = new Set(ids);
    const indices = paragraphs
      .map((paragraph, index) => (wanted.has(paragraph.id) ? index : -1))
      .filter((index) => index >= 0);
    if (indices.length >= 2) return indices;
  }
  return activeParagraphIndex >= 0 && activeParagraphIndex < paragraphs.length ? [activeParagraphIndex] : [];
}

export interface WriterParagraphStylePatch {
  readonly alignment?: WriterTextAlignment;
  readonly lineHeight?: number;
  /** A list style to apply, or `null` to remove list formatting entirely. */
  readonly list?: WriterParagraphListStyle | null;
  /**
   * Any further paragraph style field — indents, spacing, tab stops, borders,
   * pagination flags. The paragraph format dialog builds one of these, and it
   * must reach the same targets as the toolbar commands instead of the active
   * paragraph alone.
   */
  readonly style?: Partial<Paragraph['style']>;
}

/**
 * Structural comparison, so an array such as `tab_stops` or an object such as
 * `borders` counts as unchanged when its contents are equal. Without it every
 * dialog confirmation would look like a change and produce a history step.
 */
export { sameWriterStyleValue } from './writerStyleValue';

export type WriterParagraphListStyle = 'bullet' | 'number' | 'checklist';

const LIST_STYLE_FIELDS = [
  'list_style',
  'list_level',
  'list_number_format',
  'list_override_glyph',
  'list_start_value',
  'list_restart_numbering',
] as const;

/**
 * Fields that only describe *how* a specific list counts or draws. They must not
 * survive a list change: a start value of 5 or a glyph override kept from a
 * previous list would silently drive the numbering of the new one.
 */
const LIST_SHAPE_FIELDS = [
  'list_number_format',
  'list_override_glyph',
  'list_start_value',
  'list_restart_numbering',
] as const;

/**
 * What a list button press should do to the marked paragraphs: remove the list
 * when every target already carries exactly this style, otherwise apply it.
 */
export function resolveWriterListToggleValue(
  paragraphs: readonly Paragraph[],
  indices: readonly number[],
  style: WriterParagraphListStyle,
): WriterParagraphListStyle | null {
  const valid = indices.filter((index) => index >= 0 && index < paragraphs.length);
  if (valid.length === 0) return style;
  const allMatch = valid.every((index) => paragraphs[index]?.style.list_style === style);
  return allMatch ? null : style;
}

export interface WriterParagraphPatchResult {
  readonly paragraphs: Paragraph[];
  readonly changedCount: number;
}

/**
 * Patches the given paragraph indices and leaves every other paragraph — and
 * every span — untouched. An empty or unusable patch, and a patch that would not
 * change anything, return the input array's paragraphs without a rewrite, so no
 * write and no history step happens for a command without effect.
 */
export function patchWriterParagraphStyle(
  paragraphs: readonly Paragraph[],
  indices: readonly number[],
  patch: WriterParagraphStylePatch,
): WriterParagraphPatchResult {
  const alignment = patch.alignment !== undefined && isWriterTextAlignment(patch.alignment)
    ? patch.alignment
    : undefined;
  const lineHeight = patch.lineHeight !== undefined
    ? normalizeWriterLineHeight(patch.lineHeight)
    : undefined;
  const extraEntries = patch.style !== undefined ? Object.entries(patch.style) : [];
  if (alignment === undefined && lineHeight === undefined && patch.list === undefined && extraEntries.length === 0) {
    return { paragraphs: [...paragraphs], changedCount: 0 };
  }

  const targets = new Set(indices.filter((index) => index >= 0 && index < paragraphs.length));
  if (targets.size === 0) return { paragraphs: [...paragraphs], changedCount: 0 };

  let changedCount = 0;
  const next = paragraphs.map((paragraph, index) => {
    if (!targets.has(index)) return paragraph;
    // The working copy keeps the paragraph's own type; `Reflect` is the way to
    // read, write and remove a property whose key is only known at runtime
    // without reaching for an assertion.
    const style: ParagraphStyle = { ...paragraph.style };
    let changed = false;

    const read = (key: string): unknown => Reflect.get(style, key);
    const write = (key: string, value: unknown): void => {
      if (sameWriterStyleValue(read(key), value)) return;
      Reflect.set(style, key, value);
      changed = true;
    };
    const remove = (key: string): void => {
      if (read(key) === undefined) return;
      Reflect.deleteProperty(style, key);
      changed = true;
    };

    if (alignment !== undefined) write('alignment', alignment);
    if (lineHeight !== undefined) write('line_height', lineHeight);

    for (const [key, rawValue] of extraEntries) {
      const action = normalizeWriterStyleEntry(key, rawValue, read(key));
      // An unusable value is dropped, not stored: a patch may not write an
      // alignment outside the schema or a non-finite indent into the document.
      if (action.kind === 'drop') continue;
      if (action.kind === 'delete') remove(key);
      else write(key, action.value);
    }

    if (patch.list !== undefined) {
      if (patch.list === null) {
        if (style.list_style !== undefined) {
          for (const field of LIST_STYLE_FIELDS) remove(field);
          changed = true;
        }
      } else {
        const wasList = style.list_style !== undefined;
        // Switching the kind of list keeps the indentation a user set; starting a
        // list begins at the outermost level.
        const nextLevel = wasList ? (style.list_level ?? 0) : 0;
        if (style.list_style !== patch.list || style.list_level !== nextLevel) {
          style.list_style = patch.list;
          style.list_level = nextLevel;
          changed = true;
        }
        if (wasList && paragraph.style.list_style !== patch.list) {
          for (const field of LIST_SHAPE_FIELDS) remove(field);
          changed = true;
        }
      }
    }

    if (!changed) return paragraph;
    changedCount += 1;
    return { ...paragraph, style };
  });
  return { paragraphs: next, changedCount };
}

export interface WriterParagraphOperationResult {
  readonly paragraphs: Paragraph[];
  /** Ids of the paragraphs the operation actually changed, in document order. */
  readonly changedParagraphIds: readonly string[];
}

/**
 * Applies a per-paragraph operation to every target and reports which
 * paragraphs it changed.
 *
 * Commands that act on one paragraph at a time — toggling a character property
 * over the covered sub-range (W-110), applying a list template (W-117) — need
 * exactly this walk. Without it they rewrote the active paragraph and left the
 * rest of a marked range untouched. A paragraph the operation returns
 * structurally unchanged stays identical by reference, so no history step and no
 * revision is produced for it.
 */
export function applyWriterParagraphOperation(
  paragraphs: readonly Paragraph[],
  indices: readonly number[],
  operation: (paragraph: Paragraph) => Paragraph,
): WriterParagraphOperationResult {
  const targets = new Set(indices.filter((index) => index >= 0 && index < paragraphs.length));
  if (targets.size === 0) return { paragraphs: [...paragraphs], changedParagraphIds: [] };

  const changedParagraphIds: string[] = [];
  const next = paragraphs.map((paragraph, index) => {
    if (!targets.has(index)) return paragraph;
    const updated = operation(paragraph);
    if (updated === paragraph || sameWriterStyleValue(updated, paragraph)) return paragraph;
    changedParagraphIds.push(paragraph.id);
    return updated;
  });
  return { paragraphs: next, changedParagraphIds };
}

/**
 * The options a line-spacing control must offer: the presets plus the value the
 * paragraph actually carries. Without the second part a `<select>` has no
 * matching option for a value such as 1.6 and renders without a selection, so
 * the control shows something other than the document's state.
 */
export function resolveWriterLineHeightOptions(
  presets: readonly number[],
  current: number | undefined,
): number[] {
  const values = [...presets];
  const normalized = normalizeWriterLineHeight(current);
  if (normalized !== undefined && !values.includes(normalized)) values.push(normalized);
  return values.sort((left, right) => left - right);
}

/** True when the paragraph's line height is not one of the presets. */
export function isWriterLineHeightCustom(presets: readonly number[], current: number | undefined): boolean {
  const normalized = normalizeWriterLineHeight(current);
  if (normalized === undefined) return false;
  return !presets.includes(normalized);
}
