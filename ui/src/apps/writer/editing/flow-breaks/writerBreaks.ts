// STATUS: DIAMANT VGT SUPREME — Caret-aware structural Writer break domain
import type { Paragraph, TextSpan, WriterSectionBreakType } from '../../../../shared/contracts/workspace';
import {
  replaceWriterParagraphRange,
  writerTextSpanFormatAtOffset,
} from '../text/writerTextEditing';

export type WriterFlowBreakType = 'line' | 'page' | 'column';

export interface WriterFlowBreakResult {
  paragraphs: Paragraph[];
  activeParagraphId: string;
  caretOffset: number;
}

export interface WriterSectionBreakResult extends WriterFlowBreakResult {
  sectionStartParagraphId: string;
  breakType: WriterSectionBreakType;
}

type WriterSelection = {
  paragraphId: string;
  start: number;
  end: number;
} | null;

function paragraphLength(paragraph: Paragraph): number {
  return paragraph.spans.reduce((total, span) => total + span.text.length, 0);
}

function selectedRange(paragraph: Paragraph, selection: WriterSelection): { start: number; end: number } {
  const length = paragraphLength(paragraph);
  if (selection?.paragraphId !== paragraph.id) return { start: length, end: length };
  const rawStart = Math.min(selection.start, selection.end);
  const rawEnd = Math.max(selection.start, selection.end);
  return {
    start: Math.min(length, Math.max(0, Math.trunc(rawStart))),
    end: Math.min(length, Math.max(0, Math.trunc(rawEnd))),
  };
}

function sliceSpans(paragraph: Paragraph, rawStart: number, rawEnd: number): TextSpan[] {
  const length = paragraphLength(paragraph);
  const start = Math.min(length, Math.max(0, Math.trunc(rawStart)));
  const end = Math.min(length, Math.max(start, Math.trunc(rawEnd)));
  const sliced: TextSpan[] = [];
  let cursor = 0;
  for (const span of paragraph.spans) {
    const spanStart = cursor;
    const spanEnd = spanStart + span.text.length;
    cursor = spanEnd;
    const localStart = Math.max(0, start - spanStart);
    const localEnd = Math.min(span.text.length, end - spanStart);
    if (localEnd > localStart) sliced.push({ ...span, text: span.text.slice(localStart, localEnd) });
  }
  if (sliced.length > 0) return sliced;
  return [{ text: '', ...writerTextSpanFormatAtOffset(paragraph, start) }];
}

function splitForStructuralBreak(
  paragraph: Paragraph,
  selection: WriterSelection,
  tailId: string,
  tailBreak: Exclude<WriterFlowBreakType, 'line'> | 'section',
): [Paragraph, Paragraph] {
  const range = selectedRange(paragraph, selection);
  const withoutSelection = replaceWriterParagraphRange(paragraph, range.start, range.end, '');
  const remainingLength = paragraphLength(withoutSelection);
  const tailStyle = {
    ...paragraph.style,
    page_break_before: tailBreak === 'page' ? true : undefined,
    column_break_before: tailBreak === 'column' ? true : undefined,
  };
  return [
    { ...withoutSelection, spans: sliceSpans(withoutSelection, 0, range.start) },
    {
      ...withoutSelection,
      id: tailId,
      style: tailStyle,
      spans: sliceSpans(withoutSelection, range.start, remainingLength),
    },
  ];
}

export function insertWriterFlowBreak(
  paragraphs: readonly Paragraph[],
  paragraphId: string,
  selection: WriterSelection,
  breakType: WriterFlowBreakType,
  idFactory: () => string = () => crypto.randomUUID(),
): WriterFlowBreakResult {
  const paragraphIndex = paragraphs.findIndex((paragraph) => paragraph.id === paragraphId);
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph || paragraphIndex < 0) {
    throw new Error('Writer break target paragraph does not exist.');
  }
  const range = selectedRange(paragraph, selection);
  if (breakType === 'line') {
    const updated = replaceWriterParagraphRange(paragraph, range.start, range.end, '\n');
    const next = [...paragraphs];
    next[paragraphIndex] = updated;
    return {
      paragraphs: next,
      activeParagraphId: updated.id,
      caretOffset: range.start + 1,
    };
  }

  const tailId = idFactory();
  if (!tailId || paragraphs.some((candidate) => candidate.id === tailId)) {
    throw new Error('Writer break paragraph identity must be unique.');
  }
  const [head, tail] = splitForStructuralBreak(paragraph, selection, tailId, breakType);
  const next = [...paragraphs];
  next.splice(paragraphIndex, 1, head, tail);
  return {
    paragraphs: next,
    activeParagraphId: tail.id,
    caretOffset: 0,
  };
}

export function insertWriterSectionBreak(
  paragraphs: readonly Paragraph[],
  paragraphId: string,
  selection: WriterSelection,
  breakType: WriterSectionBreakType,
  idFactory: () => string = () => crypto.randomUUID(),
): WriterSectionBreakResult {
  const paragraphIndex = paragraphs.findIndex((paragraph) => paragraph.id === paragraphId);
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph || paragraphIndex < 0) {
    throw new Error('Writer section break target paragraph does not exist.');
  }
  const tailId = idFactory();
  if (!tailId || paragraphs.some((candidate) => candidate.id === tailId)) {
    throw new Error('Writer section break paragraph identity must be unique.');
  }
  const [head, tail] = splitForStructuralBreak(paragraph, selection, tailId, 'section');
  const next = [...paragraphs];
  next.splice(paragraphIndex, 1, head, tail);
  return {
    paragraphs: next,
    activeParagraphId: tail.id,
    caretOffset: 0,
    sectionStartParagraphId: tail.id,
    breakType,
  };
}
