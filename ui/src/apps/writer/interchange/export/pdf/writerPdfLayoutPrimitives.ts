import {
  Paragraph, WriterStyleDefinition, WriterTextAlignment, type WriterParagraphBorder,
  type WriterParagraphBorders, type WriterParagraphShading, type WriterTextEffect,
} from '../../../../../shared/contracts/workspace';
import { PageSetupConfig, TableBlockData } from '../../../types';
import { writerStyleForParagraph } from '../../../formatting/styles/writerStyles';
import { writerLineHeightPt } from '../../../layout/typography/line-spacing/writerLineSpacing';
import { resolveWriterParagraphSpacing } from '../../../formatting/paragraphs/writerParagraphSpacing';
import { resolveWriterParagraphIndent } from '../../../formatting/paragraphs/writerParagraphIndent';
import { wrapWriterText, writerPdfSafeText } from '../../../layout/text-layout/writerTextLayout';
import { layoutWriterTabbedLine, writerTabLeaderCharacters } from '../../../formatting/tabs/writerTabStops';
import { resolveWriterTextFlow } from '../../../layout/text-flow/writerTextFlow';
import { hyphenateText } from '../../../layout/typography/hyphenation/writerHyphenation';
import { resolveWriterPaperDimensionsMm } from '../../../../../platform/document-layout/writerPaperSizes';
import { resolveWriterPhysicalPageMarginsMm } from '../../../../../platform/document-layout/writerPageMargins';
import { resolveWriterColumnLayoutMm } from '../../../../../platform/document-layout/writerColumns';
import { managedColorToPdfRgb, parseManagedColor, resolveCanonicalPageGeometry } from '../../../../../platform/rendering/index';
import { sanitizeWriterPdfLink } from './writerPdfStructure';

export type PdfColor = [number, number, number];
export type PdfTextLine = {
  text: string;
  runs?: Array<{ text: string; x: number }>;
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  bold: boolean;
  italic: boolean;
  alignment: WriterTextAlignment;
  wordSpacing: number;
  characterSpacing: number;
  leftIndent: number;
  rightIndent: number;
  color?: PdfColor;
  textEffect?: WriterTextEffect;
  before: number;
  after: number;
  paragraphId?: string;
  semanticRole?: 'P' | `H${1 | 2 | 3 | 4 | 5 | 6}`;
  link?: import('../../../../../shared/contracts/workspace').WriterTextLink;
};
export type PdfTextPlacement = PdfTextLine & { y: number; columnX: number; columnWidth: number };
export type PdfImagePlacement = {
  objectId: number;
  resourceName: string;
  width: number;
  height: number;
  x: number;
  y: number;
};
export type PdfDecorationPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  borders: WriterParagraphBorders;
  shading?: WriterParagraphShading;
};
export type PdfPageModel = {
  lines: PdfTextPlacement[];
  images: PdfImagePlacement[];
  decorations: PdfDecorationPlacement[];
  config: PageSetupConfig;
  sectionPageIndex: number;
  displayPageNumber: number;
  chapterNumber: number;
};

/**
 * Escape a **WinAnsi byte string** for a PDF literal.
 *
 * W-198: this used to normalise NFKD and replace every non-ASCII character with `?`, which is why the
 * text path could not carry an umlaut at all and every German line had to be drawn as a picture. The
 * caller encodes to WinAnsi first (`encodeWriterPdfWinAnsi`) and this function writes the literal.
 *
 * Bytes outside printable ASCII become **octal escapes** (`\374` for `ü`). That is not cosmetic: the
 * assembled PDF is serialised with `TextEncoder`, i.e. UTF-8, so a raw `ü` would leave as two bytes and
 * the viewer would read mojibake — measured on the acceptance letter before this change, `Mit
 * freundlichen Grüßen` could not be found although `Mit freundlichen` was there. Octal escapes keep the
 * stream pure ASCII, the `/Length` values stay correct, and the font's `/Encoding /WinAnsiEncoding` maps
 * the byte back to the character.
 */
export const escapePdf = (input: string): string =>
  writerPdfSafeText(input)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, (character) =>
      `\\${(character.charCodeAt(0) & 0xFF).toString(8).padStart(3, '0')}`);

export const writerPageGeometry = (config: PageSetupConfig, pageIndex = 1) => {
  const dimensions = resolveWriterPaperDimensionsMm(config);
  const portrait = config.orientation !== 'landscape';
  const [widthMm, heightMm] = portrait
    ? [dimensions.width, dimensions.height]
    : [dimensions.height, dimensions.width];
  const physicalMargins = resolveWriterPhysicalPageMarginsMm(config, pageIndex);
  const bodyWidthMm = widthMm - physicalMargins.left - physicalMargins.right;
  const columnLayout = resolveWriterColumnLayoutMm(config, bodyWidthMm);
  const canonical = resolveCanonicalPageGeometry({
    widthMm,
    heightMm,
    marginsMm: physicalMargins,
    columnWidthsMm: columnLayout.widths,
    columnGapMm: columnLayout.gap,
  }, 'pt');
  return {
    width: canonical.width,
    height: canonical.height,
    margin: canonical.margins.left,
    margins: canonical.margins,
    usableWidth: canonical.bodyWidth,
    columns: canonical.columns,
  };
};

export function hexColor(value?: string): PdfColor | undefined {
  if (!value) return undefined;
  try {
    return managedColorToPdfRgb(parseManagedColor(value));
  } catch {
    return undefined;
  }
}

/**
 * DEF-RE-014: `(NaN).toFixed(2)` is the string `'NaN'`, and a PDF operator stream containing `NaN w` or
 * `[NaN NaN] 0 d` cannot be parsed. Every number that reaches the operator stream goes through here.
 *
 * The fallback is `0`: in PDF, `0 w` is the conventional hairline. A damaged width renders as the thinnest
 * possible line instead of corrupting the file.
 */
function pdfNumber(value: number, fallback = 0, digits = 2): string {
  return (Number.isFinite(value) ? value : fallback).toFixed(digits);
}

function pdfBorderDash(border: WriterParagraphBorder): string {
  const width = Number.isFinite(border.widthPt) ? border.widthPt : 0;
  if (border.style === 'dashed') return `[${(width * 4).toFixed(2)} ${(width * 2).toFixed(2)}] 0 d`;
  if (border.style === 'dotted') return `[${width.toFixed(2)} ${(width * 2).toFixed(2)}] 0 d`;
  return '[] 0 d';
}

export function pdfBorderCommands(decoration: PdfDecorationPlacement): string[] {
  const output: string[] = [];
  const { x, y, width, height } = decoration;
  const appendSide = (
    border: WriterParagraphBorder | undefined,
    primary: [number, number, number, number],
    secondary: [number, number, number, number],
  ): void => {
    if (!border) return;
    const color = hexColor(border.color) ?? [0.392, 0.455, 0.545];
    // DEF-RE-014: every number below reaches the PDF operator stream, so every one is guarded.
    const widthPt = Number.isFinite(border.widthPt) ? border.widthPt : 0;
    const strokeWidth = border.style === 'double' ? widthPt / 3 : widthPt;
    const lines = border.style === 'double' ? [primary, secondary] : [primary];
    output.push(
      'q',
      `${pdfNumber(color[0], 0.392, 3)} ${pdfNumber(color[1], 0.455, 3)} ${pdfNumber(color[2], 0.545, 3)} RG`,
      `${strokeWidth.toFixed(2)} w`,
      pdfBorderDash(border),
      ...lines.map(([x1, y1, x2, y2]) =>
        `${pdfNumber(x1)} ${pdfNumber(y1)} m ${pdfNumber(x2)} ${pdfNumber(y2)} l S`),
      'Q',
    );
  };
  const top = y + height;
  const right = x + width;
  appendSide(decoration.borders.top, [x, top, right, top], [x, top - 2, right, top - 2]);
  appendSide(decoration.borders.right, [right, y, right, top], [right - 2, y, right - 2, top]);
  appendSide(decoration.borders.bottom, [x, y, right, y], [x, y + 2, right, y + 2]);
  appendSide(decoration.borders.left, [x, y, x, top], [x + 2, y, x + 2, top]);
  return output;
}

export function paragraphToLines(
  paragraph: Paragraph,
  usableWidth: number,
  styles: WriterStyleDefinition[],
  /**
   * The already formatted list marker (for example `1.1.`), or empty for a plain paragraph.
   *
   * It is a **label**, not a number: the caller resolves it with the same function the
   * on-screen marker uses, so nested lists cannot be numbered differently in the PDF (W-118).
   */
  listMarker: string,
): PdfTextLine[] {
  const style = writerStyleForParagraph(paragraph, styles);
  const text = paragraph.spans.map((span) => span.text).join('');
  const textFlow = resolveWriterTextFlow(paragraph.style, text);
  const layoutText = textFlow.hyphenationMode === 'auto'
    ? paragraph.spans.map((span) => {
        const language = span.language === 'de-DE'
          ? 'de'
          : span.language === 'en-US' || span.language === 'en-GB' || span.language === undefined
            ? 'en'
            : null;
        return language ? hyphenateText(span.text, {
          language,
          minLeft: 2,
          minRight: 2,
          hyphenChar: '\u00AD',
        }) : span.text;
      }).join('')
    : text;
  const effectiveHyphenationMode = textFlow.hyphenationMode === 'auto' ? 'manual' : textFlow.hyphenationMode;
  const bold = style.bold || paragraph.spans.some((span) => span.bold);
  const italic = Boolean(style.italic) || paragraph.spans.some((span) => span.italic);
  const explicitColor = paragraph.spans.find((span) => span.text_color)?.text_color;
  const color = hexColor(explicitColor ?? style.textColor);
  const fontSize = Math.max(7, Math.min(72, style.fontSizePt));
  const indent = resolveWriterParagraphIndent(paragraph.style);
  const millimetersToPoints = 72 / 25.4;
  const baseLeftIndent = indent.leftMm * millimetersToPoints;
  const rightIndent = indent.rightMm * millimetersToPoints;
  const specialIndent = Math.max(indent.firstLineMm, indent.hangingMm) * millimetersToPoints;
  const narrowestWidth = Math.max(fontSize, usableWidth - baseLeftIndent - rightIndent - specialIndent);
  const chars = Math.max(1, Math.floor(narrowestWidth / (fontSize * 0.52)));
  const prefix = paragraph.style.list_style === 'bullet' ? '• ' : paragraph.style.list_style === 'number' ? `${listMarker} ` : '';
  const sourceText = prefix + layoutText;
  const physicalLines: Array<{ text: string; runs?: Array<{ text: string; x: number }> }> = [];
  for (const logicalLine of sourceText.split(/\r?\n/u)) {
    if (!logicalLine.includes('\t')) {
      physicalLines.push(...wrapWriterText(logicalLine, chars, {
        lineBreakMode: textFlow.lineBreakMode,
        hyphenationMode: effectiveHyphenationMode,
      }).map((line) => ({ text: line })));
      continue;
    }
    const segments = layoutWriterTabbedLine(logicalLine, paragraph.style.tab_stops);
    const runs: Array<{ text: string; x: number }> = [];
    let previousEnd = baseLeftIndent + indent.firstLineMm * millimetersToPoints;
    for (const [segmentIndex, segment] of segments.entries()) {
      const textWidth = writerPdfSafeText(segment.text).length * fontSize * 0.52;
      let x = previousEnd;
      if (segmentIndex > 0) {
        const stopX = baseLeftIndent + segment.positionMm * millimetersToPoints;
        if (segment.alignment === 'right') x = stopX - textWidth;
        else if (segment.alignment === 'center') x = stopX - textWidth / 2;
        else if (segment.alignment === 'decimal') {
          const separatorIndex = segment.text.indexOf(segment.decimalCharacter);
          const beforeLength = separatorIndex >= 0 ? separatorIndex : segment.text.length;
          x = stopX - beforeLength * fontSize * 0.52;
        } else x = stopX;
        x = Math.max(baseLeftIndent, Math.min(usableWidth - rightIndent - textWidth, x));
        const leaderWidth = Math.max(0, x - previousEnd - fontSize * 0.52);
        const leaderCount = Math.floor(leaderWidth / (fontSize * 0.52));
        const leaderText = writerTabLeaderCharacters(segment.leader, leaderCount);
        if (leaderText) runs.push({ text: leaderText, x: previousEnd });
      }
      runs.push({ text: segment.text, x });
      previousEnd = x + textWidth;
    }
    physicalLines.push({ text: '', runs });
  }
  const paragraphSpacing = resolveWriterParagraphSpacing(paragraph.style, style.spaceBefore, style.spaceAfter);
  const alignment = paragraph.style.alignment ?? style.alignment ?? 'left';
  const headingLevel = Math.max(0, Math.min(6, paragraph.style.heading_level ?? 0));
  const semanticRole: NonNullable<PdfTextLine['semanticRole']> = headingLevel === 1 ? 'H1' : headingLevel === 2 ? 'H2' : headingLevel === 3 ? 'H3' : headingLevel === 4 ? 'H4' : headingLevel === 5 ? 'H5' : headingLevel === 6 ? 'H6' : 'P';
  const link = sanitizeWriterPdfLink(paragraph.spans.find((span) => span.link)?.link) ?? undefined;
  return physicalLines.map((line, index) => ({
    text: line.text,
    runs: line.runs,
    fontSize,
    fontFamily: style.fontFamily,
    bold,
    italic,
    alignment,
    leftIndent: baseLeftIndent + (index === 0 ? indent.firstLineMm * millimetersToPoints : indent.hangingMm * millimetersToPoints),
    rightIndent,
    ...pdfDistributionSpacing(line.text, fontSize, narrowestWidth, alignment, index === physicalLines.length - 1),
    color,
    textEffect: style.textEffect,
    lineHeight: writerLineHeightPt(paragraph.style, fontSize, style.lineHeight),
    before: index === 0 ? paragraphSpacing.beforePt : 0,
    after: index === physicalLines.length - 1 ? paragraphSpacing.afterPt : 0,
    paragraphId: paragraph.id,
    semanticRole,
    link,
  }));
}

function pdfDistributionSpacing(
  text: string,
  fontSize: number,
  usableWidth: number,
  alignment: WriterTextAlignment,
  isLastLine: boolean,
): Pick<PdfTextLine, 'wordSpacing' | 'characterSpacing'> {
  if (alignment !== 'distributed' && (alignment !== 'justify' || isLastLine)) {
    return { wordSpacing: 0, characterSpacing: 0 };
  }
  const remainingWidth = Math.max(0, usableWidth - text.length * fontSize * 0.52);
  const spaces = Array.from(text).filter((character) => character === ' ').length;
  if (spaces > 0) return { wordSpacing: remainingWidth / spaces, characterSpacing: 0 };
  return { wordSpacing: 0, characterSpacing: text.length > 1 ? remainingWidth / (text.length - 1) : 0 };
}

export const plainPdfLayout = { wordSpacing: 0, characterSpacing: 0, leftIndent: 0, rightIndent: 0 } as const;

export function tableLines(tables: TableBlockData[], usableWidth: number): PdfTextLine[] {
  const output: PdfTextLine[] = [];
  for (const table of tables) {
    if (!table.columns.length) continue;
    const columnWidth = Math.max(8, Math.floor((usableWidth / 5.5) / table.columns.length));
    const fit = (value: string) => {
      // W-289: a cell whose `content` is missing used to crash the whole export with
      // `TypeError: Cannot read properties of undefined (reading 'replace')` from deep inside the layout
      // code. The canonical model always carries a string, but imported or foreign data may not, and an
      // export is the wrong place to die over one empty field — the same fail-soft rule the cell readers
      // elsewhere follow. Measured on the acceptance fixture before the fix.
      const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
      return clean.length > columnWidth ? `${clean.slice(0, Math.max(1, columnWidth - 1))}...` : clean.padEnd(columnWidth, ' ');
    };
    output.push({ text: table.columns.map(fit).join(' | '), fontSize: 9, bold: true, italic: false, alignment: 'left', before: 8, after: 2, ...plainPdfLayout });
    output.push({ text: table.columns.map(() => '-'.repeat(columnWidth)).join('-+-'), fontSize: 8, bold: false, italic: false, alignment: 'left', before: 0, after: 2, ...plainPdfLayout });
    for (const row of table.rows) {
      output.push({ text: row.cells.map((cell) => fit(cell.content)).join(' | '), fontSize: 8.5, bold: false, italic: false, alignment: 'left', before: 0, after: 2, ...plainPdfLayout });
    }
    output.push({ text: '', fontSize: 4, bold: false, italic: false, alignment: 'left', before: 0, after: 8, ...plainPdfLayout });
  }
  return output;
}

export function decodeJpegDataUrl(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = globalThis.atob(match[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
    return bytes;
  } catch { return null; }
}

export const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  return out;
};

export function textX(
  line: PdfTextPlacement,
): number {
  const left = line.columnX + line.leftIndent;
  if (line.alignment === 'left' || line.alignment === 'justify' || line.alignment === 'distributed') return left;
  const estimatedWidth = line.text.length * line.fontSize * 0.52;
  const availableWidth = line.columnWidth - line.leftIndent - line.rightIndent;
  if (line.alignment === 'center') return Math.max(left, left + (availableWidth - estimatedWidth) / 2);
  return Math.max(left, line.columnX + line.columnWidth - line.rightIndent - estimatedWidth);
}

