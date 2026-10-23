// STATUS: PLATIN
import type { Paragraph, TextSpan, WriterEquationBlockData, WriterTableBlockData } from '../../../../shared/contracts/workspace';
import { equationLatexToMathMl, equationMarkupToLatex } from '../../../../shared/interoperability/equation';
import { extractTextNodes, inspectBoundedForeignXml, readAttribute } from '../../../../shared/interoperability/xml';
import { MAX_XML_CHARS } from '../constants';
export function ensureXmlSize(xml: string): void {
  if (xml.length > MAX_XML_CHARS) throw new Error('DOCX XML exceeds beta importer limit');
  inspectBoundedForeignXml(xml);
}

interface BlockRange {
  /** Index of the opening `<`. */
  readonly start: number;
  /** Index just after the closing `>`. */
  readonly end: number;
}

/**
 * Finds the **outermost** elements with this local name, respecting nesting.
 *
 * The previous implementation matched `<name …>…</name>` with a non-greedy regex, which stops at the
 * **first** closing tag. Measured on a table inside a table, that left the outer table's remaining content
 * in the "body without tables" string, so a cell paragraph leaked into the running text and the table was
 * parsed truncated. DOCX nests freely, so the scan counts depth.
 *
 * W-171: the scan was still text-based in two ways that a **foreign** file can reach:
 *
 *   1. `>` inside a **quoted attribute value** was read as the end of the tag. XML allows it unescaped
 *      (`<w:instrText w:val="IF x > 5">`), so an instruction field or a style name could end a tag early
 *      and shift every following block boundary. Tag ends are now found with an attribute-aware scan.
 *   2. A **CDATA section** was tokenised as if it were markup, so a `<w:p>` inside one opened a phantom
 *      block. CDATA is now skipped whole.
 *
 * What is deliberately **not** claimed: this is still not a conforming XML parser. Entity references in
 * names, processing instructions, and DTD-driven constructs are not interpreted — but every one of those
 * either cannot appear in OOXML or is refused earlier by `inspectBoundedForeignXml`. The two cases a real
 * file can carry are the two that are fixed, and both are pinned by tests.
 */
function findBlocks(xml: string, localName: string): BlockRange[] {
  const name = `(?:(?:[A-Za-z_][\\w.-]*):)?${localName}`;
  // A tag whose local name is exactly this one; a longer name (`pPr` for `p`) must not match.
  const tag = new RegExp(`^<(/?)${name}(?![\\w.-])`, 'u');
  const ranges: BlockRange[] = [];
  let depth = 0;
  let openStart = -1;
  let index = 0;

  // One left-to-right walk over the tags. The first version of this fix hunted for the next matching tag
  // with a `lastIndex`-driven regex and lost its own state — three debugging rounds later it is a single
  // depth counter, which is what the problem actually needed.
  while (index < xml.length) {
    const next = xml.indexOf('<', index);
    if (next < 0) break;
    // A CDATA section is never scanned for elements: `readTagEnd` returns it as one opaque unit, so the
    // markup-looking text inside it is never seen. (An earlier version also skipped it here; that guard was
    // dead code — the tests stayed green with it removed, which is how it was found.)
    const read = readTagEnd(xml, next);
    if (read === null) {
      // Not a tag at all: step on and keep looking.
      index = next + 1;
      continue;
    }
    const match = tag.exec(xml.slice(next, read.end));
    if (match !== null) {
      if (match[1] === '/') {
        if (depth > 0) {
          depth -= 1;
          if (depth === 0) {
            ranges.push({ start: openStart, end: read.end });
            openStart = -1;
          }
        }
      } else if (read.selfClosing) {
        // A self-closing element is a complete block on its own. A CDATA section reaches this branch too
        // (`readTagEnd` reports it as an opaque unit), and a section is **not** an element of this name —
        // measured: without the check a CDATA section was pushed as a phantom block. My first CDATA guard sat
        // in the walk loop as well and was dead code; `readTagEnd` plus this check is the single place that
        // decides, and `writerDocxBlockScan.test.ts` pins both properties.
        if (depth === 0 && !xml.startsWith('<![CDATA[', next)) ranges.push({ start: next, end: read.end });
      } else {
        if (depth === 0) openStart = next;
        depth += 1;
      }
    }
    index = read.end;
    if (ranges.length > 100_000) throw new Error('DOCX element count exceeds limit');
  }

  return ranges;
}

/**
 * The end of the tag that starts at `start`, or `null` when this `<` does not begin a tag.
 *
 * Skips quoted attribute values (so a `>` inside one does not end the tag) and skips a CDATA section whole.
 */
function readTagEnd(xml: string, start: number): { end: number; selfClosing: boolean } | null {
  if (xml.startsWith('<![CDATA[', start)) {
    const close = xml.indexOf(']]>', start + 9);
    // An unterminated CDATA section swallows the rest of the input, which is what a conforming parser does.
    return { end: close < 0 ? xml.length : close + 3, selfClosing: true };
  }
  if (xml[start] !== '<') return null;
  let index = start + 1;
  let quote: '"' | "'" | null = null;
  while (index < xml.length) {
    const character = xml[index]!;
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      // `/` immediately before `>` means self-closing; whitespace between them is allowed.
      let back = index - 1;
      while (back > start && /\s/u.test(xml[back]!)) back -= 1;
      return { end: index + 1, selfClosing: xml[back] === '/' };
    }
    index += 1;
  }
  return null;
}

export function blocks(xml: string, localName: string): string[] {
  return findBlocks(xml, localName).map((range) => xml.slice(range.start, range.end));
}

export function removeBlocks(xml: string, localName: string): string {
  const ranges = findBlocks(xml, localName);
  if (ranges.length === 0) return xml;
  let out = '';
  let cursor = 0;
  for (const range of ranges) {
    out += xml.slice(cursor, range.start);
    cursor = range.end;
  }
  return out + xml.slice(cursor);
}

function runText(runXml: string): string {
  const tokens = runXml.match(
    /<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?t\s*>|<(?:[A-Za-z_][\w.-]*:)?(?:tab|br)\b[^>]*\/?\s*>/gu,
  ) ?? [];
  let text = '';
  for (const token of tokens) {
    if (/^<(?:(?:[A-Za-z_][\w.-]*):)?t(?:\s|>)/u.test(token)) {
      text += extractTextNodes(token, 't').join('');
      continue;
    }
    if (/^<(?:(?:[A-Za-z_][\w.-]*):)?tab\b/u.test(token)) {
      text += '\t';
      continue;
    }
    const type = readAttribute(token, 'type');
    if (type === null || type === 'textWrapping') text += '\n';
  }
  return text;
}

export function parseRuns(paragraphXml: string): TextSpan[] {
  const runBlocks = blocks(paragraphXml, 'r');
  if (!runBlocks.length) {
    const text = extractTextNodes(paragraphXml, 't').join('');
    return text ? [{ text }] : [];
  }
  const spans: TextSpan[] = [];
  for (const run of runBlocks) {
    const text = runText(run);
    if (!text) continue;
    const sizeMatch = run.match(/<(?:[A-Za-z_][\w.-]*:)?sz\b[^>]*(?:[A-Za-z_][\w.-]*:)?val=["'](\d+)["']/);
    const colorMatch = run.match(/<(?:[A-Za-z_][\w.-]*:)?color\b[^>]*(?:[A-Za-z_][\w.-]*:)?val=["']([0-9A-Fa-f]{6})["']/);
    spans.push({
      text,
      bold: /<(?:[A-Za-z_][\w.-]*:)?b(?:\s[^>]*)?\/?\s*>/.test(run),
      italic: /<(?:[A-Za-z_][\w.-]*:)?i(?:\s[^>]*)?\/?\s*>/.test(run),
      underline: /<(?:[A-Za-z_][\w.-]*:)?u\b/.test(run),
      strikethrough: /<(?:[A-Za-z_][\w.-]*:)?strike(?:\s[^>]*)?\/?\s*>/.test(run),
      font_size_pt: sizeMatch ? Number(sizeMatch[1]) / 2 : undefined,
      text_color: colorMatch ? `#${colorMatch[1].toUpperCase()}` : undefined,
    });
  }
  return spans;
}

export function parseParagraph(paragraphXml: string, index: number): Paragraph {
  const styleTag = paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?pStyle\b[^>]*>/)?.[0] ?? '';
  const styleVal = readAttribute(styleTag, 'val')?.toLowerCase() ?? '';
  const headingMatch = styleVal.match(/^heading\s*([1-9])$/) ?? styleVal.match(/^heading([1-9])$/);
  const heading = headingMatch ? Number(headingMatch[1]) as Paragraph['style']['heading_level'] : undefined;
  const tocMatch = styleVal.match(/^toc\s*([1-9])$/) ?? styleVal.match(/^toc([1-9])$/);
  const styleName = heading
    ? `heading${heading}` as Paragraph['style']['style_name']
    : tocMatch
      ? `toc${tocMatch[1]}` as Paragraph['style']['style_name']
      : styleVal === 'caption' ? 'caption' : styleVal === 'title' ? 'title' : styleVal === 'subtitle' ? 'subtitle' : 'normal';
  const jcTag = paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?jc\b[^>]*>/)?.[0] ?? '';
  const alignmentRaw = readAttribute(jcTag, 'val');
  const alignment: Paragraph['style']['alignment'] = alignmentRaw === 'center' || alignmentRaw === 'right' || alignmentRaw === 'both'
    ? (alignmentRaw === 'both' ? 'justify' : alignmentRaw)
    : 'left';
  const numbered = /<(?:[A-Za-z_][\w.-]*:)?numPr\b/.test(paragraphXml);
  const bidiTag = paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?bidi\b[^>]*\/?>/)?.[0];
  const bidiValue = bidiTag ? readAttribute(bidiTag, 'val') : null;
  const textDirection = bidiTag
    ? (bidiValue === '0' || bidiValue === 'false' || bidiValue === 'off' ? 'ltr' : 'rtl')
    : undefined;
  const wordWrapTag = paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?wordWrap\b[^>]*\/?>/)?.[0];
  const wordWrapValue = wordWrapTag ? readAttribute(wordWrapTag, 'val') : null;
  const lineBreakMode = wordWrapTag
    ? (wordWrapValue === '0' || wordWrapValue === 'false' || wordWrapValue === 'off' ? 'normal' : 'break-word')
    : undefined;
  const suppressHyphensTag = paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?suppressAutoHyphens\b[^>]*\/?>/)?.[0];
  const suppressHyphensValue = suppressHyphensTag ? readAttribute(suppressHyphensTag, 'val') : null;
  const suppressHyphenation = Boolean(
    suppressHyphensTag &&
    suppressHyphensValue !== '0' &&
    suppressHyphensValue !== 'false' &&
    suppressHyphensValue !== 'off',
  );
  const columnBreakBefore = (paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?br\b[^>]*\/?\s*>/gu) ?? [])
    .some((tag) => readAttribute(tag, 'type') === 'column');
  const pageBreakBefore = (paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?br\b[^>]*\/?\s*>/gu) ?? [])
    .some((tag) => readAttribute(tag, 'type') === 'page');
  /**
   * WR-042 — the direct-cursor `space_before` survives a DOCX round trip.
   *
   * Word expresses paragraph spacing as `<w:spacing w:before="…" w:after="…"/>` in twips.
   * Without this read the semantic distance a user created by clicking into the page was
   * silently reset to the generic default on import — the exchange lost typography that the
   * `.vdoc` keeps.
   */
  const spacingTag = paragraphXml.match(/<(?:[A-Za-z_][\w.-]*:)?spacing\b[^>]*\/?>/)?.[0] ?? '';
  const twipsToPt = (value: string | null): number | undefined => {
    if (value === null) return undefined;
    const twips = Number.parseFloat(value);
    if (!Number.isFinite(twips) || twips < 0) return undefined;
    return Math.round((twips / 20) * 10) / 10;
  };
  const spaceBeforePt = twipsToPt(readAttribute(spacingTag, 'before'));
  const spaceAfterPt = twipsToPt(readAttribute(spacingTag, 'after'));
  const spans = parseRuns(paragraphXml);
  return {
    id: `docx-p-${index + 1}`,
    style: {
      style_name: styleName,
      heading_level: heading,
      alignment,
      line_height: 1.45,
      space_before: spaceBeforePt ?? (heading ? 8 : 0),
      space_after: spaceAfterPt ?? (heading ? 6 : 4),
      list_style: numbered ? 'bullet' : undefined,
      list_level: numbered ? 0 : undefined,
      text_direction: textDirection,
      line_break_mode: lineBreakMode,
      hyphenation_mode: suppressHyphenation ? 'none' : undefined,
      page_break_before: pageBreakBefore || undefined,
      column_break_before: columnBreakBefore || undefined,
    },
    spans: spans.length ? spans : [{ text: '' }],
  };
}

function cellText(cellXml: string): string {
  return blocks(cellXml, 'p')
    .map((paragraph) => parseRuns(paragraph).map((span) => span.text).join(''))
    .filter(Boolean)
    .join('\n');
}

export function parseEquations(documentXml: string, paragraphs: readonly Paragraph[]): WriterEquationBlockData[] {
  const paragraphStarts = Array.from(
    documentXml.matchAll(/<(?:(?:[A-Za-z_][\w.-]*):)?p(?:\s[^>]*)?>/gu),
    (match) => match.index,
  );
  const equationPattern = /<(?:(?:[A-Za-z_][\w.-]*):)?oMath(?:\s[^>]*)?>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?oMath\s*>/gu;
  const equations: WriterEquationBlockData[] = [];
  let paragraphCursor = 0;
  let match: RegExpExecArray | null;
  while ((match = equationPattern.exec(documentXml)) !== null) {
    while (
      paragraphCursor + 1 < paragraphStarts.length &&
      paragraphStarts[paragraphCursor + 1]! < match.index
    ) paragraphCursor += 1;
    const xml = match[0];
    const startTag = xml.slice(0, xml.indexOf('>') + 1);
    const latexExtension = readAttribute(startTag, 'latex');
    const captionExtension = readAttribute(startTag, 'caption');
    const displayExtension = readAttribute(startTag, 'displayMode');
    const idExtension = readAttribute(startTag, 'id');
    const displayMode = displayExtension !== '0' && displayExtension !== 'false';
    const latex = (latexExtension || equationMarkupToLatex(xml)).normalize('NFKC').slice(0, 16_384);
    equations.push({
      id: idExtension?.slice(0, 160) || `docx-equation-${equations.length + 1}`,
      latex,
      caption: captionExtension?.normalize('NFKC').slice(0, 512) || undefined,
      displayMode,
      anchorParagraphId: paragraphs[paragraphCursor]?.id,
      mathml: equationLatexToMathMl(latex, displayMode),
    });
    if (equations.length > 4_096) throw new Error('DOCX equation count exceeds limit');
  }
  return equations;
}

export function parseTables(documentXml: string): WriterTableBlockData[] {
  return blocks(documentXml, 'tbl').map((tableXml, tableIndex) => {
    const rows = blocks(tableXml, 'tr').map((rowXml, rowIndex) => ({
      id: `docx-table-${tableIndex + 1}-row-${rowIndex + 1}`,
      cells: blocks(rowXml, 'tc').slice(0, 1024).map((cellXml, cellIndex) => ({
        id: `docx-table-${tableIndex + 1}-r${rowIndex + 1}-c${cellIndex + 1}`,
        content: cellText(cellXml),
      })),
    })).filter((row) => row.cells.length > 0);
    const maxColumns = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
    const first = rows[0];
    const columns = Array.from({ length: maxColumns }, (_, index) => first?.cells[index]?.content || `Column ${index + 1}`);
    return {
      id: `docx-table-${tableIndex + 1}`,
      columns,
      rows: rows.slice(first ? 1 : 0).map((row) => ({
        ...row,
        cells: Array.from({ length: maxColumns }, (_, index) => row.cells[index] ?? {
          id: `${row.id}-c${index + 1}`,
          content: '',
        }),
      })),
    };
  });
}
