// STATUS: PLATIN — Unicode-aware, span-preserving Writer case transformations
import type { Paragraph, TextSpan, WriterAutoCorrectLocale } from '../../../../shared/contracts/workspace';

export type WriterCaseTransformMode = 'upper' | 'lower' | 'title' | 'sentence' | 'toggle';

export interface WriterCaseTransformResult {
  paragraph: Paragraph;
  selectionStart: number;
  selectionEnd: number;
}

function graphemeBoundaries(text: string): number[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [0, ...Array.from(segmenter.segment(text), (segment) => segment.index), text.length]
    .filter((value, index, values) => index === 0 || value !== values[index - 1]);
}

function snapRange(text: string, rawStart: number, rawEnd: number): [number, number] {
  const startValue = Math.min(text.length, Math.max(0, Math.trunc(Math.min(rawStart, rawEnd))));
  const endValue = Math.min(text.length, Math.max(startValue, Math.trunc(Math.max(rawStart, rawEnd))));
  const boundaries = graphemeBoundaries(text);
  const start = boundaries.reduce((candidate, boundary) => boundary <= startValue ? boundary : candidate, 0);
  const end = boundaries.find((boundary) => boundary >= endValue) ?? text.length;
  return [start, end];
}

function isWordCharacter(character: string): boolean {
  return /[\p{L}\p{M}\p{N}]/u.test(character);
}

function isLetter(character: string): boolean {
  return /\p{L}/u.test(character);
}

function transformSelection(
  selectedText: string,
  mode: WriterCaseTransformMode,
  locale: WriterAutoCorrectLocale,
  precedingText: string,
): string {
  if (mode === 'upper') return selectedText.toLocaleUpperCase(locale);
  if (mode === 'lower') return selectedText.toLocaleLowerCase(locale);

  let beginsWord = !isWordCharacter(Array.from(precedingText).at(-1) ?? '');
  const lastVisible = Array.from(precedingText).reverse().find((character) => !/\s/u.test(character));
  let beginsSentence = lastVisible === undefined || /[.!?…]/u.test(lastVisible);
  let output = '';

  for (const character of Array.from(selectedText)) {
    if (mode === 'toggle') {
      if (isLetter(character)) {
        const upper = character.toLocaleUpperCase(locale);
        const lower = character.toLocaleLowerCase(locale);
        output += character === upper && character !== lower ? lower : upper;
      } else {
        output += character;
      }
      continue;
    }
    if (mode === 'title') {
      output += isWordCharacter(character)
        ? beginsWord ? character.toLocaleUpperCase(locale) : character.toLocaleLowerCase(locale)
        : character;
      beginsWord = !isWordCharacter(character);
      continue;
    }
    if (mode === 'sentence') {
      if (isLetter(character)) {
        output += beginsSentence ? character.toLocaleUpperCase(locale) : character.toLocaleLowerCase(locale);
        beginsSentence = false;
      } else {
        output += character;
        if (/[.!?…]/u.test(character)) beginsSentence = true;
      }
    }
  }
  return output;
}

export function transformWriterParagraphRange(
  paragraph: Paragraph,
  rawStart: number,
  rawEnd: number,
  mode: WriterCaseTransformMode,
  locale: WriterAutoCorrectLocale,
): WriterCaseTransformResult {
  const originalText = paragraph.spans.map((span) => span.text).join('');
  const [selectionStart, selectionEnd] = snapRange(originalText, rawStart, rawEnd);
  if (selectionStart === selectionEnd) return { paragraph, selectionStart, selectionEnd };

  let cursor = 0;
  let transformedLength = 0;
  const spans: TextSpan[] = paragraph.spans.map((span) => {
    const spanStart = cursor;
    const spanEnd = spanStart + span.text.length;
    cursor = spanEnd;
    const localStart = Math.max(0, selectionStart - spanStart);
    const localEnd = Math.min(span.text.length, selectionEnd - spanStart);
    if (localStart >= localEnd) return { ...span };
    const selected = span.text.slice(localStart, localEnd);
    const transformed = transformSelection(
      selected,
      mode,
      locale,
      originalText.slice(0, spanStart + localStart),
    );
    transformedLength += transformed.length;
    return {
      ...span,
      text: `${span.text.slice(0, localStart)}${transformed}${span.text.slice(localEnd)}`,
    };
  });

  return {
    paragraph: { ...paragraph, spans },
    selectionStart,
    selectionEnd: selectionStart + transformedLength,
  };
}
