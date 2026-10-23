// STATUS: DIAMANT VGT SUPREME — Clipboard payload parsing and insertion for Writer
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import { normalizeWriterSpans } from '../paragraphs/writerParagraphStructure';
import { writerParagraphTextLength } from '../caret/writerCaretTargeting';

/**
 * Clipboard content arrives as `text/plain` or as `text/html`. Both are turned
 * into the same shape — a list of paragraphs made of formatted spans — so the
 * insertion path has exactly one input format to handle.
 *
 * Everything here is deliberately bounded and DOM-free: a clipboard payload is
 * untrusted input from another application, so it is parsed by a small, fixed
 * subset parser rather than handed to a browser parser, and it can never grow
 * the document without limit.
 */

export interface WriterClipboardParagraph {
  readonly spans: TextSpan[];
}

export interface WriterClipboardLimits {
  readonly maxCharacters: number;
  readonly maxParagraphs: number;
}

export const WRITER_CLIPBOARD_LIMITS: WriterClipboardLimits = {
  maxCharacters: 200_000,
  maxParagraphs: 2_000,
};

/**
 * WR-045 — how deep the HTML parser follows nested formatting.
 *
 * Real clipboard HTML rarely exceeds ten levels; 64 leaves ample room and bounds both the
 * formatting stack and the quadratic re-computation that walks it.
 */
export const WRITER_CLIPBOARD_MAX_NESTING = 64;

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'table']);
const IGNORED_CONTENT_TAGS = new Set(['script', 'style', 'head', 'title', 'meta', 'link']);
const FORMAT_TAGS: Readonly<Record<string, keyof WriterSpanFormat>> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  s: 'strikethrough',
  strike: 'strikethrough',
  del: 'strikethrough',
};

interface WriterSpanFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

/**
 * Reads the formatting an opening tag carries **beyond its name**.
 *
 * A Writer paragraph is rendered as `<span data-writer-run-bold="true"
 * style="font-weight: 700">`, and the same shape is what Chromium puts on the
 * clipboard when a bold word is copied — from this editor, from a browser page or
 * from Google Docs. Recognising only `<b>`/`<strong>` silently dropped that
 * formatting on paste (native M4 probe). The attributes and inline styles below are
 * the ones the editor itself produces; nothing else is interpreted.
 */
function formatFromAttributes(attributes: string): WriterSpanFormat {
  const format: WriterSpanFormat = {};
  const attr = (name: string): string | null => {
    const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attributes);
    if (!match) return null;
    return match[2] ?? match[3] ?? match[4] ?? '';
  };

  for (const [name, key] of [
    ['data-writer-run-bold', 'bold'],
    ['data-writer-run-italic', 'italic'],
    ['data-writer-run-underline', 'underline'],
    ['data-writer-run-strikethrough', 'strikethrough'],
  ] as const) {
    const value = attr(name);
    if (value !== null && value.toLowerCase() !== 'false') format[key] = true;
  }

  const style = attr('style');
  if (style) {
    for (const declaration of style.split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim().toLowerCase();
      if (property === 'font-weight') {
        const numeric = Number.parseInt(value, 10);
        if (value === 'bold' || value === 'bolder' || (Number.isFinite(numeric) && numeric >= 600)) {
          format.bold = true;
        }
      }
      if (property === 'font-style' && (value === 'italic' || value === 'oblique')) format.italic = true;
      if (property === 'text-decoration' || property === 'text-decoration-line') {
        if (value.includes('underline')) format.underline = true;
        if (value.includes('line-through')) format.strikethrough = true;
      }
    }
  }
  return format;
}

/** Index of the last entry matching predicate, or -1. Kept local: the file targets ES2019 helpers. */
function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function isEmptyFormat(format: WriterSpanFormat): boolean {
  return !format.bold && !format.italic && !format.underline && !format.strikethrough;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  shy: '\u00ad',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  laquo: '\u00ab',
  raquo: '\u00bb',
  szlig: '\u00df',
  euro: '\u20ac',
  middot: '\u00b7',
  bull: '\u2022',
  deg: '\u00b0',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      if (!Number.isSafeInteger(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripControlCharacters(value: string): string {
  // Keep tab, newline and carriage return; drop the rest of the C0/C1 range.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
}

export function normalizeWriterClipboardText(value: string, limits: WriterClipboardLimits = WRITER_CLIPBOARD_LIMITS): string {
  return stripControlCharacters(value).slice(0, limits.maxCharacters);
}

function spansEqualFormat(left: TextSpan, right: TextSpan): boolean {
  return left.bold === right.bold
    && left.italic === right.italic
    && left.underline === right.underline
    && left.strikethrough === right.strikethrough;
}

function pushSpan(paragraph: TextSpan[], text: string, format: WriterSpanFormat): void {
  if (text.length === 0) return;
  const span: TextSpan = { text };
  if (format.bold) span.bold = true;
  if (format.italic) span.italic = true;
  if (format.underline) span.underline = true;
  if (format.strikethrough) span.strikethrough = true;
  const previous = paragraph[paragraph.length - 1];
  if (previous && spansEqualFormat(previous, span)) {
    previous.text += text;
    return;
  }
  paragraph.push(span);
}

function toParagraphs(blocks: TextSpan[][], limits: WriterClipboardLimits): WriterClipboardParagraph[] {
  // A paragraph that carries only ordinary whitespace is empty; a non-breaking
  // space is content and must survive.
  const meaningful = blocks.filter((spans) => spans.some(
    (span) => span.text.replace(/\u00a0/g, ' ').trim().length > 0,
  ));
  const limited = meaningful.slice(0, limits.maxParagraphs);
  if (limited.length === 0) return [];
  return limited.map((spans) => ({ spans: normalizeWriterSpans(spans) }));
}

/**
 * Plain text: line breaks become paragraph breaks, nothing else changes. Special
 * characters survive untouched because the text is never re-encoded.
 */
export function parseWriterClipboardPlainText(
  text: string,
  limits: WriterClipboardLimits = WRITER_CLIPBOARD_LIMITS,
): WriterClipboardParagraph[] {
  const normalized = normalizeWriterClipboardText(text, limits).replace(/\r\n?/g, '\n');
  const blocks = normalized.split('\n').map((line) => (line.length > 0 ? [{ text: line }] : []));
  return toParagraphs(blocks, limits);
}

/**
 * HTML subset parser. It understands block elements as paragraph breaks and the
 * four character formats the Writer can represent; every other tag is ignored,
 * and the content of script/style/head is dropped entirely.
 */
export function parseWriterClipboardHtml(
  html: string,
  limits: WriterClipboardLimits = WRITER_CLIPBOARD_LIMITS,
): WriterClipboardParagraph[] {
  const source = html.slice(0, limits.maxCharacters);
  if (!source.includes('<')) return parseWriterClipboardPlainText(source, limits);

  const blocks: TextSpan[][] = [];
  let current: TextSpan[] = [];
  /**
   * One entry per opening tag that contributed formatting, in document order.
   *
   * The stack carries the tag **name** as well, so a closing `</span>` pops the
   * `span` it belongs to instead of blindly popping the newest entry — with mixed
   * `<strong><span style="font-weight:700">` input the old code lost track and
   * produced bold text for the rest of the fragment.
   */
  const formatStack: Array<{ tag: string; format: WriterSpanFormat }> = [];
  let activeFormat: WriterSpanFormat = {};
  let ignoredDepth = 0;

  const closeBlock = () => {
    blocks.push(current);
    current = [];
  };
  const recomputeFormat = () => {
    activeFormat = formatStack.reduce<WriterSpanFormat>((acc, entry) => ({ ...acc, ...entry.format }), {});
  };

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null = tagPattern.exec(source);
  const emitText = (raw: string) => {
    if (ignoredDepth > 0) return;
    // Collapse only ASCII whitespace. `\s` would also match a non-breaking space
    // and a decoded `&nbsp;` would lose exactly the meaning it carries.
    const collapsed = raw.replace(/[ \t\r\n\f]+/g, ' ');
    pushSpan(current, decodeEntities(collapsed), activeFormat);
  };

  while (match) {
    emitText(source.slice(cursor, match.index));
    const tagName = (match[1] ?? '').toLowerCase();
    const isClosing = match[0].startsWith('</');

    if (IGNORED_CONTENT_TAGS.has(tagName)) {
      if (isClosing) ignoredDepth = Math.max(0, ignoredDepth - 1);
      else if (!match[0].endsWith('/>')) ignoredDepth += 1;
      cursor = tagPattern.lastIndex;
      match = tagPattern.exec(source);
      continue;
    }

    if (ignoredDepth === 0) {
      if (tagName === 'br') {
        closeBlock();
      } else if (BLOCK_TAGS.has(tagName)) {
        if (isClosing) closeBlock();
        else if (current.length > 0) closeBlock();
      } else if (!isClosing && (tagName === 'hr')) {
        closeBlock();
      } else {
        /**
         * A tag contributes formatting either by its **name** (`<strong>`) or by
         * what it carries (`<span style="font-weight:700">`,
         * `<span data-writer-run-bold="true">`). Both are collected, so a Writer
         * paragraph that is copied out of this very editor pastes back with its
         * formatting intact.
         */
        const byName = FORMAT_TAGS[tagName];
        const byAttribute = formatFromAttributes(match[2] ?? '');
        const format: WriterSpanFormat = byName ? { [byName]: true, ...byAttribute } : byAttribute;
        if (isClosing) {
          const index = findLastIndex(formatStack, (entry) => entry.tag === tagName);
          if (index >= 0) {
            formatStack.splice(index, 1);
            recomputeFormat();
          }
        } else if (!isEmptyFormat(format) && !match[0].endsWith('/>')) {
          /**
           * WR-045 — bounded nesting.
           *
           * `recomputeFormat` folds the whole stack for every tag, so hostile input such as
           * thousands of nested `<span style="font-weight:700">` cost quadratic time and
           * unbounded memory. Past this depth additional formatting is ignored: the text is
           * still pasted, it simply stops gaining new attributes.
           */
          if (formatStack.length < WRITER_CLIPBOARD_MAX_NESTING) {
            formatStack.push({ tag: tagName, format });
            recomputeFormat();
          }
        }
      }
    }

    cursor = tagPattern.lastIndex;
    match = tagPattern.exec(source);
  }
  emitText(source.slice(cursor));
  closeBlock();

  return toParagraphs(blocks, limits);
}

export function writerClipboardPayloadToText(
  payload: readonly WriterClipboardParagraph[],
  limits: WriterClipboardLimits = WRITER_CLIPBOARD_LIMITS,
): string {
  const text = payload
    .map((paragraph) => paragraph.spans.map((span) => span.text).join(''))
    .join('\n');
  return text.slice(0, limits.maxCharacters);
}

export interface WriterClipboardInsertion {
  readonly paragraphs: Paragraph[];
  readonly caret: { readonly paragraphId: string; readonly offset: number };
}

/**
 * Inserts a parsed payload at a caret position.
 *
 * The paragraph the caret sits in keeps its head, the payload paragraphs follow,
 * and the tail of the original paragraph is appended to the last inserted one.
 * The caret lands directly behind the pasted content, which is where a user
 * expects to continue typing.
 */
export function insertWriterClipboardPayload(
  paragraphs: readonly Paragraph[],
  index: number,
  offset: number,
  payload: readonly WriterClipboardParagraph[],
  newParagraphIds: readonly string[],
  /** End of a replaced selection inside the target paragraph. Defaults to `offset`. */
  selectionEnd?: number,
): WriterClipboardInsertion | null {
  const target = paragraphs[index];
  if (!target) return null;
  if (payload.length === 0) return null;

  const length = writerParagraphTextLength(target);
  const fullText = target.spans.map((span) => span.text).join('');
  const caret = Math.max(0, Math.min(Math.trunc(offset), length));
  const replaceEnd = Math.max(caret, Math.min(Math.trunc(selectionEnd ?? offset), length));
  const headText = fullText.slice(0, caret);
  const tailText = fullText.slice(replaceEnd);

  const firstSpans: TextSpan[] = [
    ...(headText.length > 0 ? [{ text: headText }] : []),
    ...payload[0].spans.map((span) => ({ ...span })),
  ];
  const firstParagraph: Paragraph = { ...target, spans: normalizeWriterSpans(firstSpans) };

  const inserted: Paragraph[] = [];
  for (let position = 1; position < payload.length; position += 1) {
    const id = newParagraphIds[position - 1];
    if (id === undefined) return null;
    inserted.push({
      id,
      style: { ...target.style },
      spans: normalizeWriterSpans(payload[position].spans.map((span) => ({ ...span }))),
    });
  }

  const lastParagraph = inserted.length > 0 ? inserted[inserted.length - 1] : firstParagraph;
  if (tailText.length > 0) {
    lastParagraph.spans = normalizeWriterSpans([...lastParagraph.spans, { text: tailText }]);
  }
  const pastedLength = payload[payload.length - 1].spans.reduce((total, span) => total + span.text.length, 0);
  // A single-payload paste lands in the target paragraph, so the head still
  // precedes the pasted text; a multi-paragraph paste ends in its own paragraph.
  const caretOffset = inserted.length > 0 ? pastedLength : headText.length + pastedLength;

  return {
    paragraphs: [
      ...paragraphs.slice(0, index),
      firstParagraph,
      ...inserted,
      ...paragraphs.slice(index + 1),
    ],
    caret: { paragraphId: lastParagraph.id, offset: caretOffset },
  };
}
