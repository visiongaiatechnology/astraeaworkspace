// STATUS: DIAMANT VGT SUPREME — Deterministic paragraph insertion for Writer
import type {
  Paragraph,
  WriterParagraphStyleName,
  WriterStyleDefinition,
} from '../../../../shared/contracts/workspace';
import {
  nextWriterParagraphStyleName,
  resolveWriterStyleDefinition,
  writerStyleForParagraph,
} from '../../formatting/styles/writerStyles';

export interface WriterParagraphInsertInput {
  readonly paragraphs: readonly Paragraph[];
  /** Paragraph the new one follows; `-1` inserts at the very beginning. */
  readonly afterIdx: number;
  /** The style helpers of the Writer formatting layer take a mutable array. */
  readonly styles: WriterStyleDefinition[];
  readonly newParagraphId: string;
  readonly headingLevel?: 1 | 2 | 3;
  readonly styleOverride?: WriterParagraphStyleName;
  readonly pageBreakBefore?: boolean;
}

export interface WriterParagraphInsertPlan {
  readonly paragraphs: Paragraph[];
  readonly insertedParagraphId: string;
  readonly insertIndex: number;
  /** The created paragraph is always focused at offset 0. */
  readonly caret: { readonly paragraphId: string; readonly offset: number };
}

/**
 * Plans the paragraph created by Enter, by the "Absatz hinzufügen" command or
 * by an outline action. The style is derived from the paragraph it follows so
 * that the successor of a heading keeps the outline sequence and every other
 * paragraph continues in the current style; `afterIdx === -1` yields the
 * document default, which is the path taken by an empty document.
 */
export function planWriterParagraphInsert(
  input: WriterParagraphInsertInput,
): WriterParagraphInsertPlan | null {
  const { paragraphs, afterIdx, styles, newParagraphId } = input;
  if (newParagraphId.length === 0) return null;
  if (!Number.isInteger(afterIdx) || afterIdx < -1) return null;
  if (afterIdx >= paragraphs.length && paragraphs.length > 0) return null;

  const currentParagraph = afterIdx >= 0 ? paragraphs[afterIdx] : undefined;
  const resolvedCurrentStyle = currentParagraph
    ? writerStyleForParagraph(currentParagraph, styles)
    : resolveWriterStyleDefinition('normal', styles);
  const styleName: WriterParagraphStyleName = input.styleOverride
    ?? (input.headingLevel
      ? (`heading${input.headingLevel}` as WriterParagraphStyleName)
      : (currentParagraph ? nextWriterParagraphStyleName(currentParagraph, styles) : 'normal'));
  const styleDefinition = styles.find((style) => style.name === styleName) ?? resolvedCurrentStyle;

  const created: Paragraph = {
    id: newParagraphId,
    style: {
      style_name: styleName,
      heading_level: input.headingLevel,
      alignment: styleDefinition.alignment ?? 'left',
      line_height: styleDefinition.lineHeight,
      space_before: styleDefinition.spaceBefore,
      space_after: styleDefinition.spaceAfter,
      page_break_before: input.pageBreakBefore || undefined,
    },
    spans: [{ text: '' }],
  };

  const insertIndex = Math.min(paragraphs.length, Math.max(0, afterIdx + 1));
  const next = [...paragraphs];
  next.splice(insertIndex, 0, created);

  return {
    paragraphs: next,
    insertedParagraphId: newParagraphId,
    insertIndex,
    caret: { paragraphId: newParagraphId, offset: 0 },
  };
}
