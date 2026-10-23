import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { millimetersToPoints } from '../../../../../platform/document-layout/writerPaperSizes';
import { resolveWriterPageBackgroundColor, writerPageBackgroundIsLight } from '../../../../../shared/writer/layout/pageDecorations';
import { resolveWriterHeaderFooter } from '../../../../../shared/writer/layout/headerFooter';
import { formatWriterPageNumber } from '../../../layout/pagination/geometry/writerPaginationGeometry';
import { evaluateFields } from '../../../utils/writerUtils';
import { writerPdfSafeText } from '../../../layout/text-layout/writerTextLayout';
import { encodeWriterPdfWinAnsi, resolveWriterPdfFontDecision, type WriterPdfProfile } from './writerPdfFontPolicy';
import { pdfUriByteStringLiteral } from '../../../../../platform/interop/pdf/pdfTextStrings';
import { addWriterPdfAOutputIntent } from '../../../../../shared/pdf/output-intents/writerPdfArchive';
import type { WriterPdfTextMask, WriterPdfTextRasterizer } from './writerPdfTextRaster';
import {
  buildWriterPdfXmp, pdfDateString, pdfLiteralString, pdfUnicodeString, sanitizeWriterPdfLink,
  writerPdfDestinationName, type WriterPdfDestination, type WriterPdfDocumentMetadata,
  type WriterPdfOutlineTarget, type WriterPdfPageSemantics,
} from './writerPdfStructure';
import {
  escapePdf, hexColor, pdfBorderCommands, textX, writerPageGeometry, type PdfColor, type PdfPageModel,
} from './writerPdfLayoutPrimitives';

/**
 * DEF-RE-019: `(NaN).toFixed(3)` is the string `'NaN'`, and this file writes 66 numbers into a PDF
 * operator stream. A single non-finite document value would produce a file no reader can parse.
 *
 * Every number that reaches an operator goes through here. The precision is a parameter, so call sites
 * keep the decimals they had - **a guard must change only what it is there to change** (DEF-RE-014).
 *
 * The fallback is `0`: the neutral operand for a coordinate, a size or a colour channel. A damaged value
 * renders as a degenerate but *finite* shape instead of corrupting the file.
 */
function pdfNumber(value: number, fallback = 0, digits = 2): string {
  return (Number.isFinite(value) ? value : fallback).toFixed(digits);
}

export interface WriterPdfObjectStore {
  objects: string[];
  addObject: (body: string) => number;
}

export interface WriterPdfAssemblyInput {
  title: string;
  paragraphs: Paragraph[];
  printPages: Array<{ pageModel: PdfPageModel; sourcePageIndex: number }>;
  scale: number;
  documentMetadata: WriterPdfDocumentMetadata;
  store: WriterPdfObjectStore;
  pagesId: number;
  catalogId: number;
  regularFontId: number;
  boldFontId: number;
  italicFontId: number;
  boldItalicFontId: number;
  facingPages: boolean;
  duplexPreference: string;
  profile: WriterPdfProfile;
  textRasterizer?: WriterPdfTextRasterizer;
  /**
   * Page count of the **document**, for `{NUMPAGES}`.
   *
   * Deliberately not `printPages.length`: a printed page range is a subset, and `{NUMPAGES}`
   * must name the document's total, which is also what the screen shows.
   */
  documentPageCount: number;
  /** Word count for `{WORDCOUNT}`, from the same statistics the status bar uses. */
  documentWordCount: number;
  /** Author for `{AUTHOR}`, falling back to the document metadata. */
  documentAuthor?: string;
}

export function assembleWriterPdf(input: WriterPdfAssemblyInput): Uint8Array {
  const { title, paragraphs, printPages, scale, documentMetadata, store, pagesId, catalogId, regularFontId, boldFontId, italicFontId, boldItalicFontId, facingPages, duplexPreference, profile, textRasterizer } = input;

  /**
   * W-126: header and footer text used to be written **verbatim**, so a document with
   * `Seite {PAGE} von {NUMPAGES}` printed those braces on every page. The fields are now
   * evaluated per page with the same function the screen uses — and `{WORDCOUNT}` with the
   * same statistics, so the number in the PDF cannot disagree with the status bar.
   */
  const evaluatePageDecoration = (text: string, pageNumber: number): string =>
    evaluateFields(text, {
      pageNumber,
      totalPages: input.documentPageCount,
      title,
      author: input.documentAuthor ?? documentMetadata.author,
      words: input.documentWordCount,
    });
  const { objects, addObject } = store;
const pageIds: number[] = [];
const semanticPages: WriterPdfPageSemantics[] = [];
const destinations = new Map<string, WriterPdfDestination>();
const outlineTargets: WriterPdfOutlineTarget[] = [];
const textMaskCache = new Map<string, { objectId: number; resourceName: string; mask: WriterPdfTextMask }>();
let textMaskSerial = 0;

const ensureTextMask = (
  text: string,
  fontSizePt: number,
  bold: boolean,
  italic: boolean,
  fontFamily?: string,
): { objectId: number; resourceName: string; mask: WriterPdfTextMask } => {
  if (!textRasterizer) {
    throw new Error('Unicode/PDF-A export requires browser-native Canvas text shaping; no rasterizer is available in this runtime');
  }
  const cacheKey = JSON.stringify([text, fontSizePt, bold, italic, fontFamily ?? '']);
  const cached = textMaskCache.get(cacheKey);
  if (cached) return cached;
  const mask = textRasterizer({ text, fontFamily, fontSizePt, bold, italic });
  const stream = mask.packedMaskHex;
  const objectId = addObject(`<< /Type /XObject /Subtype /Image /ImageMask true /Width ${mask.widthPx} /Height ${mask.heightPx} /BitsPerComponent 1 /Decode [1 0] /Filter /ASCIIHexDecode /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const resource = { objectId, resourceName: `Tm${++textMaskSerial}`, mask };
  textMaskCache.set(cacheKey, resource);
  return resource;
};

const shouldRasterize = (text: string): boolean =>
  Boolean(text) && resolveWriterPdfFontDecision(text, profile).handling === 'native-shaped-raster-substitution';

/**
 * A PDF text literal from Writer text — W-198.
 *
 * The text path only ever receives text the font decision called representable, because the decision and
 * this encoder are the same rule. Encoding therefore cannot fail here; if it ever did, writing the text
 * raw would produce mojibake and writing nothing would lose it silently, so the unrepresentable
 * characters become `?` — the old, visible behaviour, kept for a case that cannot happen.
 */
const pdfTextLiteral = (text: string): string => {
  const encoded = encodeWriterPdfWinAnsi(text);
  return encoded === null ? escapePdf(text.replace(/[^\x20-\x7E]/gu, '?')) : escapePdf(encoded);
};

const alignedTextX = (line: import('./writerPdfLayoutPrimitives').PdfTextPlacement, visualWidth: number): number => {
  const left = line.columnX + line.leftIndent;
  if (line.alignment === 'left' || line.alignment === 'justify' || line.alignment === 'distributed') return left;
  const availableWidth = line.columnWidth - line.leftIndent - line.rightIndent;
  if (line.alignment === 'center') return Math.max(left, left + (availableWidth - visualWidth) / 2);
  return Math.max(left, line.columnX + line.columnWidth - line.rightIndent - visualWidth);
};
printPages.forEach(({ pageModel, sourcePageIndex }, printPageIndex) => {
  const pageIndex = sourcePageIndex;
  const commands: string[] = [];
  const pageConfig = pageModel.config;
  const pageGeometry = writerPageGeometry(pageConfig, pageIndex + 1);
  const pageWidth = pageGeometry.width;
  const pageHeight = pageGeometry.height;
  const pageMargins = pageGeometry.margins;
  const bg = hexColor(resolveWriterPageBackgroundColor(pageConfig)) ?? [1, 1, 1];
  const defaultFg: PdfColor = writerPageBackgroundIsLight(pageConfig) ? [0.08, 0.10, 0.14] : [0.91, 0.925, 0.95];
  const headerFooter = resolveWriterHeaderFooter(pageConfig, pageIndex + 1, pageModel.sectionPageIndex);
  const pageNumberText = formatWriterPageNumber(
    pageModel.displayPageNumber,
    pageConfig.pageNumberFormat,
    pageConfig.chapterNumbering ? `Kapitel ${pageModel.chapterNumber}` : undefined,
  );
  commands.push('q', `${bg[0]} ${bg[1]} ${bg[2]} rg 0 0 ${pdfNumber(pageWidth, 0, 2)} ${pdfNumber(pageHeight, 0, 2)} re f`, 'Q');

  const pageTextMaskRefs = new Map<string, number>();
  const registerMask = (resource: { objectId: number; resourceName: string }): void => {
    pageTextMaskRefs.set(resource.resourceName, resource.objectId);
  };
  const emitRasterMask = (
    text: string,
    fontSize: number,
    bold: boolean,
    italic: boolean,
    fontFamily: string | undefined,
    x: number,
    baselineY: number,
    color: PdfColor,
  ): { width: number; height: number } => {
    const resource = ensureTextMask(text, fontSize, bold, italic, fontFamily);
    registerMask(resource);
    const { mask } = resource;
    const y = baselineY - mask.baselineFromBottomPt;
    commands.push(
      'q',
      `${pdfNumber(color[0], 0, 3)} ${pdfNumber(color[1], 0, 3)} ${pdfNumber(color[2], 0, 3)} rg`,
      `${pdfNumber(mask.widthPt, 0, 3)} 0 0 ${pdfNumber(mask.heightPt, 0, 3)} ${pdfNumber(x, 0, 3)} ${pdfNumber(y, 0, 3)} cm`,
      `/${resource.resourceName} Do`,
      'Q',
    );
    return { width: mask.widthPt, height: mask.heightPt };
  };

  if (pageConfig.watermark?.enabled && pageConfig.watermark.text.trim()) {
    const watermark = pageConfig.watermark;
    const sourceColor = hexColor(watermark.color) ?? [0.58, 0.64, 0.72];
    const opacity = Math.min(0.3, Math.max(0.02, watermark.opacity));
    const color: PdfColor = [
      sourceColor[0] * opacity + bg[0] * (1 - opacity),
      sourceColor[1] * opacity + bg[1] * (1 - opacity),
      sourceColor[2] * opacity + bg[2] * (1 - opacity),
    ];
    const radians = watermark.rotationDeg * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const fontSize = Math.max(24, Math.min(72, pageWidth / Math.max(5, watermark.text.length * 0.5)));
    if (profile === 'pdfa-2b' || shouldRasterize(watermark.text)) {
      const resource = ensureTextMask(watermark.text, fontSize, true, false, undefined);
      registerMask(resource);
      const { mask } = resource;
      const a = mask.widthPt * cos;
      const b = mask.widthPt * sin;
      const c = -mask.heightPt * sin;
      const d = mask.heightPt * cos;
      const e = pageWidth / 2 - (a + c) / 2;
      const f = pageHeight / 2 - (b + d) / 2;
      commands.push('/Artifact BMC', 'q', `${pdfNumber(color[0], 0, 3)} ${pdfNumber(color[1], 0, 3)} ${pdfNumber(color[2], 0, 3)} rg`, `${pdfNumber(a, 0, 4)} ${pdfNumber(b, 0, 4)} ${pdfNumber(c, 0, 4)} ${pdfNumber(d, 0, 4)} ${pdfNumber(e, 0, 3)} ${pdfNumber(f, 0, 3)} cm`, `/${resource.resourceName} Do`, 'Q', 'EMC');
    } else {
      const estimatedWidth = watermark.text.length * fontSize * 0.52;
      const originX = pageWidth / 2 - estimatedWidth / 2 * cos;
      const originY = pageHeight / 2 - estimatedWidth / 2 * sin;
      commands.push('q', 'BT', `${pdfNumber(color[0], 0, 3)} ${pdfNumber(color[1], 0, 3)} ${pdfNumber(color[2], 0, 3)} rg`, `/F2 ${pdfNumber(fontSize, 0, 2)} Tf`, `${pdfNumber(cos, 0, 6)} ${pdfNumber(sin, 0, 6)} ${pdfNumber((-sin), 0, 6)} ${pdfNumber(cos, 0, 6)} ${pdfNumber(originX, 0, 2)} ${pdfNumber(originY, 0, 2)} Tm`, `(${pdfTextLiteral(watermark.text)}) Tj`, 'ET', 'Q');
    }
  }

  if (pageConfig.pageBorders) {
    const border = pageConfig.pageBorders;
    const color = hexColor(border.color) ?? [0.29, 0.35, 0.41];
    const inset = millimetersToPoints(border.paddingMm) + border.widthPt / 2;
    const width = Math.max(1, pageWidth - inset * 2);
    const height = Math.max(1, pageHeight - inset * 2);
    const dash = border.style === 'dashed'
      ? `[${pdfNumber((border.widthPt * 4), 0, 2)} ${pdfNumber((border.widthPt * 3), 0, 2)}] 0 d`
      : border.style === 'dotted'
        ? `[${pdfNumber(border.widthPt, 0, 2)} ${pdfNumber((border.widthPt * 2), 0, 2)}] 0 d`
        : '[] 0 d';
    const strokeWidth = border.style === 'double' ? border.widthPt / 3 : border.widthPt;
    commands.push(
      'q',
      `${pdfNumber(color[0], 0, 3)} ${pdfNumber(color[1], 0, 3)} ${pdfNumber(color[2], 0, 3)} RG`,
      `${pdfNumber(strokeWidth, 0, 2)} w`,
      dash,
      `${pdfNumber(inset, 0, 2)} ${pdfNumber(inset, 0, 2)} ${pdfNumber(width, 0, 2)} ${pdfNumber(height, 0, 2)} re S`,
    );
    if (border.style === 'double') {
      const inner = inset + Math.max(2, border.widthPt);
      commands.push(`${pdfNumber(inner, 0, 2)} ${pdfNumber(inner, 0, 2)} ${pdfNumber(Math.max(1, pageWidth - inner * 2), 0, 2)} ${pdfNumber(Math.max(1, pageHeight - inner * 2), 0, 2)} re S`);
    }
    commands.push('Q');
  }

  for (const decoration of pageModel.decorations) {
    const physicalDecoration = {
      ...decoration,
      x: pageMargins.left + decoration.x,
    };
    if (decoration.shading) {
      const fill = hexColor(decoration.shading.fillColor) ?? [0.945, 0.961, 0.976];
      const alpha = Math.min(1, Math.max(0, decoration.shading.opacityPercent / 100));
      const blended: PdfColor = [
        fill[0] * alpha + bg[0] * (1 - alpha),
        fill[1] * alpha + bg[1] * (1 - alpha),
        fill[2] * alpha + bg[2] * (1 - alpha),
      ];
      commands.push(
        'q',
        `${pdfNumber(blended[0], 0, 3)} ${pdfNumber(blended[1], 0, 3)} ${pdfNumber(blended[2], 0, 3)} rg`,
        `${pdfNumber(physicalDecoration.x, 0, 2)} ${pdfNumber(physicalDecoration.y, 0, 2)} ${pdfNumber(physicalDecoration.width, 0, 2)} ${pdfNumber(physicalDecoration.height, 0, 2)} re f`,
        'Q',
      );
    }
    commands.push(...pdfBorderCommands(physicalDecoration));
  }

  const pageTags: WriterPdfPageSemantics['tags'] = [];
  const pageDestinationSeeds = new Map<string, number>();

  const emitArtifactText = (
    text: string,
    fontSize: number,
    bold: boolean,
    x: number,
    baselineY: number,
    color: PdfColor,
  ): void => {
    if (!text) return;
    commands.push('/Artifact BMC');
    if (profile === 'pdfa-2b' || shouldRasterize(text)) {
      emitRasterMask(text, fontSize, bold, false, undefined, x, baselineY, color);
    } else {
      commands.push('BT', `${color[0]} ${color[1]} ${color[2]} rg`, `/${bold ? 'F2' : 'F1'} ${pdfNumber(fontSize, 0, 2)} Tf`, `1 0 0 1 ${pdfNumber(x, 0, 2)} ${pdfNumber(baselineY, 0, 2)} Tm`, `(${pdfTextLiteral(text)}) Tj`, 'ET');
    }
    commands.push('EMC');
  };

  if (headerFooter.headerText) {
    emitArtifactText(
      evaluatePageDecoration(headerFooter.headerText, pageModel.displayPageNumber),
      8, false, pageMargins.left, pageHeight - pageMargins.top + 8, defaultFg,
    );
  }

  let activeTagKey: string | null = null;
  let tagOpen = false;
  for (const [lineIndex, line] of pageModel.lines.entries()) {
    const tagKey = line.paragraphId ?? `anonymous-${lineIndex}`;
    if (tagKey !== activeTagKey) {
      if (tagOpen) commands.push('EMC');
      const mcid = pageTags.length;
      const role = line.semanticRole ?? 'P';
      commands.push(`/${role} <</MCID ${mcid}>> BDC`);
      pageTags.push({ mcid, role, paragraphId: line.paragraphId });
      activeTagKey = tagKey;
      tagOpen = true;
    }
    if (line.paragraphId && !pageDestinationSeeds.has(line.paragraphId)) pageDestinationSeeds.set(line.paragraphId, line.y);
    const fontId = line.bold && line.italic ? 'F4' : line.bold ? 'F2' : line.italic ? 'F3' : 'F1';
    const color = line.color ?? defaultFg;

    const emitRasterRun = (text: string, x: number, offsetX: number, offsetY: number, drawColor: PdfColor): void => {
      if (!text) return;
      commands.push(`/Span <</ActualText ${pdfUnicodeString(text)}>> BDC`);
      emitRasterMask(text, line.fontSize, line.bold, line.italic, line.fontFamily, x + offsetX, line.y + offsetY, drawColor);
      commands.push('EMC');
    };

    const lineNeedsRaster = profile === 'pdfa-2b' || (line.runs
      ? line.runs.some((run) => shouldRasterize(run.text))
      : shouldRasterize(line.text));

    if (lineNeedsRaster) {
      const drawRasterLine = (offsetX: number, offsetY: number, drawColor: PdfColor): void => {
        if (line.runs) {
          for (const run of line.runs) {
            emitRasterRun(run.text, pageMargins.left + line.columnX + run.x, offsetX, offsetY, drawColor);
          }
        } else if (line.text) {
          const resource = ensureTextMask(line.text, line.fontSize, line.bold, line.italic, line.fontFamily);
          const x = pageMargins.left + alignedTextX(line, resource.mask.widthPt);
          emitRasterRun(line.text, x, offsetX, offsetY, drawColor);
        }
      };
      if (line.textEffect === 'subtle-shadow' || line.textEffect === 'strong-shadow') {
        const offset = line.textEffect === 'strong-shadow' ? 1.5 : 0.75;
        drawRasterLine(offset, -offset, [0.12, 0.15, 0.20]);
      }
      drawRasterLine(0, 0, color);
    } else {
      const emitText = (offsetX: number, offsetY: number): void => {
        if (line.runs) {
          for (const run of line.runs) {
            commands.push(`1 0 0 1 ${pdfNumber((pageMargins.left + line.columnX + run.x + offsetX), 0, 2)} ${pdfNumber((line.y + offsetY), 0, 2)} Tm`);
            if (run.text) commands.push(`(${pdfTextLiteral(run.text)}) Tj`);
          }
        } else {
          commands.push(`1 0 0 1 ${pdfNumber((pageMargins.left + textX(line) + offsetX), 0, 2)} ${pdfNumber((line.y + offsetY), 0, 2)} Tm`);
          if (line.text) commands.push(`(${pdfTextLiteral(line.text)}) Tj`);
        }
      };
      commands.push('BT', `/${fontId} ${pdfNumber(line.fontSize, 0, 1)} Tf`, `${pdfNumber(line.wordSpacing, 0, 3)} Tw`, `${pdfNumber(line.characterSpacing, 0, 3)} Tc`);
      if (line.textEffect === 'subtle-shadow' || line.textEffect === 'strong-shadow') {
        const offset = line.textEffect === 'strong-shadow' ? 1.5 : 0.75;
        commands.push('0.12 0.15 0.20 rg');
        emitText(offset, -offset);
      }
      commands.push(`${color[0]} ${color[1]} ${color[2]} rg`);
      emitText(0, 0);
      commands.push('ET');
    }
  }
  if (tagOpen) commands.push('EMC');

  if (headerFooter.footerText) {
    emitArtifactText(
      evaluatePageDecoration(headerFooter.footerText, pageModel.displayPageNumber),
      8, false, pageMargins.left, pageMargins.bottom - 8, defaultFg,
    );
  }
  if (pageConfig.showPageNumbers) {
    const position = pageConfig.pageNumberPosition ?? 'footer-right';
    const isHeader = position.startsWith('header-');
    const alignment = position.slice(position.indexOf('-') + 1);
    let visualWidth = pageNumberText.length * 4.4;
    if (profile === 'pdfa-2b' || shouldRasterize(pageNumberText)) {
      visualWidth = ensureTextMask(pageNumberText, 8, false, false, undefined).mask.widthPt;
    }
    const x = alignment === 'left'
      ? pageMargins.left
      : alignment === 'center'
        ? (pageWidth - visualWidth) / 2
        : pageWidth - pageMargins.right - visualWidth;
    const y = isHeader ? pageHeight - pageMargins.top + 8 : pageMargins.bottom - 8;
    emitArtifactText(pageNumberText, 8, false, x, y, defaultFg);
  }

  for (const image of pageModel.images) commands.push('/Artifact BMC', 'q', `${pdfNumber(image.width, 0, 2)} 0 0 ${pdfNumber(image.height, 0, 2)} ${pdfNumber((pageMargins.left + image.x), 0, 2)} ${pdfNumber(image.y, 0, 2)} cm`, `/${image.resourceName} Do`, 'Q', 'EMC');
  const streamCommands = scale === 1
    ? commands
    : [
        ...commands.slice(0, 3),
        'q',
        `${pdfNumber(scale, 0, 5)} 0 0 ${pdfNumber(scale, 0, 5)} ${pdfNumber(((pageWidth * (1 - scale)) / 2), 0, 2)} ${pdfNumber(((pageHeight * (1 - scale)) / 2), 0, 2)} cm`,
        ...commands.slice(3),
        'Q',
      ];
  const stream = streamCommands.join('\n');
  const contentId = addObject(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
  const pageImageRefs = pageModel.images.map((image) => `/${image.resourceName} ${image.objectId} 0 R`);
  const textMaskRefs = [...pageTextMaskRefs].map(([resourceName, objectId]) => `/${resourceName} ${objectId} 0 R`);
  const allXObjects = [...pageImageRefs, ...textMaskRefs].join(' ');
  const xObjectResources = allXObjects ? ` /XObject << ${allXObjects} >>` : '';
  const transformX = (value: number) => scale === 1 ? value : value * scale + (pageWidth * (1 - scale)) / 2;
  const transformY = (value: number) => scale === 1 ? value : value * scale + (pageHeight * (1 - scale)) / 2;
  const annotationIds: number[] = [];
  for (const line of pageModel.lines) {
    const link = sanitizeWriterPdfLink(line.link);
    if (!link) continue;
    const rawX = pageMargins.left + (line.runs?.[0]?.x !== undefined
      ? line.columnX + line.runs[0].x
      : (profile === 'pdfa-2b' || shouldRasterize(line.text))
        ? alignedTextX(line, ensureTextMask(line.text, line.fontSize, line.bold, line.italic, line.fontFamily).mask.widthPt)
        : textX(line));
    const runEnd = line.runs?.length
      ? Math.max(...line.runs.map((run) => {
          const width = (profile === 'pdfa-2b' || shouldRasterize(run.text))
            ? ensureTextMask(run.text, line.fontSize, line.bold, line.italic, line.fontFamily).mask.widthPt
            : writerPdfSafeText(run.text).length * line.fontSize * 0.52;
          return line.columnX + run.x + width;
        }))
      : (() => {
          const width = (profile === 'pdfa-2b' || shouldRasterize(line.text))
            ? ensureTextMask(line.text, line.fontSize, line.bold, line.italic, line.fontFamily).mask.widthPt
            : Math.max(line.fontSize * 0.6, writerPdfSafeText(line.text).length * line.fontSize * 0.52);
          return (profile === 'pdfa-2b' || shouldRasterize(line.text))
            ? alignedTextX(line, width) + width
            : textX(line) + width;
        })();
    const rawRight = pageMargins.left + runEnd;
    const rawBottom = line.y - 2;
    const rawTop = line.y + (line.lineHeight ?? line.fontSize * 1.25);
    const rect = [transformX(rawX), transformY(rawBottom), transformX(rawRight), transformY(rawTop)];
    const action = link.kind === 'external'
      ? `/A << /S /URI /URI (${pdfUriByteStringLiteral(link.url)}) >>`
      : `/Dest (${pdfLiteralString(writerPdfDestinationName(link.paragraphId))})`;
    annotationIds.push(addObject(`<< /Type /Annot /Subtype /Link /Rect [${rect.map((value) => pdfNumber(value, 0, 2)).join(' ')}] /Border [0 0 0] /H /I ${action} >>`));
  }
  const annotsEntry = annotationIds.length ? ` /Annots [${annotationIds.map((id) => `${id} 0 R`).join(' ')}]` : '';
  const fontResources = profile === 'pdfa-2b'
    ? ''
    : ` /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R /F3 ${italicFontId} 0 R /F4 ${boldItalicFontId} 0 R >>`;
  const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfNumber(pageWidth, 0, 2)} ${pdfNumber(pageHeight, 0, 2)}] /Tabs /S /StructParents ${printPageIndex} /Resources <<${fontResources}${xObjectResources} >> /Contents ${contentId} 0 R${annotsEntry} >>`);
  pageIds.push(pageId);
  semanticPages.push({ pageId, structParents: printPageIndex, tags: pageTags });
  for (const [paragraphId, y] of pageDestinationSeeds) {
    if (!destinations.has(paragraphId)) destinations.set(paragraphId, { paragraphId, pageId, y: transformY(y) });
  }
});

objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

for (const paragraph of paragraphs) {
  if (!destinations.has(paragraph.id)) continue;
  const text = paragraph.spans.map((span) => span.text).join('').trim();
  if (paragraph.style.heading_level && text) outlineTargets.push({ title: text, paragraphId: paragraph.id, level: Math.min(6, Math.max(1, paragraph.style.heading_level)) });
}
for (const bookmark of documentMetadata.bookmarks ?? []) {
  if (destinations.has(bookmark.paragraphId) && !outlineTargets.some((item) => item.paragraphId === bookmark.paragraphId && item.title === bookmark.name)) {
    outlineTargets.push({ title: bookmark.name, paragraphId: bookmark.paragraphId, level: 1 });
  }
}

const destinationEntries = [...destinations.values()].sort((left, right) => left.paragraphId.localeCompare(right.paragraphId));
const destinationsId = destinationEntries.length
  ? addObject(`<< /Names [${destinationEntries.map((destination) => `(${pdfLiteralString(writerPdfDestinationName(destination.paragraphId))}) [${destination.pageId} 0 R /XYZ null ${pdfNumber(destination.y, 0, 2)} null]`).join(' ')}] >>`)
  : 0;

let outlinesId = 0;
if (outlineTargets.length) {
  outlinesId = addObject('');
  const itemIds = outlineTargets.map(() => addObject(''));
  outlineTargets.forEach((target, index) => {
    const previous = index > 0 ? ` /Prev ${itemIds[index - 1]} 0 R` : '';
    const next = index + 1 < itemIds.length ? ` /Next ${itemIds[index + 1]} 0 R` : '';
    objects[itemIds[index]! - 1] = `<< /Title ${pdfUnicodeString(target.title)} /Parent ${outlinesId} 0 R /Dest (${pdfLiteralString(writerPdfDestinationName(target.paragraphId))})${previous}${next} >>`;
  });
  objects[outlinesId - 1] = `<< /Type /Outlines /First ${itemIds[0]} 0 R /Last ${itemIds[itemIds.length - 1]} 0 R /Count ${itemIds.length} >>`;
}

const structRootId = addObject('');
const allStructIds: number[] = [];
const parentTreeRows: string[] = [];
for (const semanticPage of semanticPages) {
  const pageStructIds = semanticPage.tags.map((tag) => {
    const id = addObject(`<< /Type /StructElem /S /${tag.role} /P ${structRootId} 0 R /Pg ${semanticPage.pageId} 0 R /K ${tag.mcid} >>`);
    allStructIds.push(id);
    return id;
  });
  parentTreeRows.push(`${semanticPage.structParents} [${pageStructIds.map((id) => `${id} 0 R`).join(' ')}]`);
}
const parentTreeId = addObject(`<< /Nums [${parentTreeRows.join(' ')}] >>`);
objects[structRootId - 1] = `<< /Type /StructTreeRoot /K [${allStructIds.map((id) => `${id} 0 R`).join(' ')}] /ParentTree ${parentTreeId} 0 R /ParentTreeNextKey ${semanticPages.length} >>`;

const xmp = buildWriterPdfXmp(title, documentMetadata, profile === 'pdfa-2b' ? 'pdfa-2b' : undefined);
const metadataId = addObject(`<< /Type /Metadata /Subtype /XML /Length ${new TextEncoder().encode(xmp).length} >>\nstream\n${xmp}\nendstream`);
const infoId = addObject(`<< /Title ${pdfUnicodeString(title)}${documentMetadata.author ? ` /Author ${pdfUnicodeString(documentMetadata.author)}` : ''}${documentMetadata.subject ? ` /Subject ${pdfUnicodeString(documentMetadata.subject)}` : ''} /Creator (Astraea Writer) /Producer (VGT Workspace Writer) /CreationDate (${pdfDateString(documentMetadata.createdAt)}) /ModDate (${pdfDateString(documentMetadata.modifiedAt ?? documentMetadata.createdAt)}) >>`);
const language = (documentMetadata.language ?? 'de-DE').normalize('NFKC').replace(/[^A-Za-z0-9-]/gu, '').slice(0, 35) || 'de-DE';
const namesEntry = destinationsId ? ` /Names << /Dests ${destinationsId} 0 R >>` : '';
const outlineEntry = outlinesId ? ` /Outlines ${outlinesId} 0 R /PageMode /UseOutlines` : '';
const outputIntentId = profile === 'pdfa-2b' ? addWriterPdfAOutputIntent(addObject) : 0;
const outputIntentEntry = outputIntentId ? ` /OutputIntents [${outputIntentId} 0 R]` : '';
objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R${facingPages ? ' /PageLayout /TwoPageRight' : ''} /ViewerPreferences << /Duplex ${duplexPreference} >> /Lang (${pdfLiteralString(language)}) /MarkInfo << /Marked true >> /StructTreeRoot ${structRootId} 0 R /Metadata ${metadataId} 0 R${outputIntentEntry}${namesEntry}${outlineEntry} >>`;
let pdf = profile === 'pdfa-2b' ? '%PDF-1.7\n%VGTW-PDFA\n' : '%PDF-1.4\n%VGTW\n';
const offsets = [0];
const encoder = new TextEncoder();
for (let i = 0; i < objects.length; i++) { offsets.push(encoder.encode(pdf).length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
const xrefOffset = encoder.encode(pdf).length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
return encoder.encode(pdf);
}
