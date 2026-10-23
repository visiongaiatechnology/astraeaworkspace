// STATUS: DIAMANT VGT SUPREME — Bounded Writer Portable Import/Export Adapters
import type { Paragraph, TextSpan, WorkspaceDocument, WriterPageSetupConfig } from '../../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../../platform/interop/docx';
import { decodeUtf8, readZip, utf8, writeStoredZip } from '../../../../platform/interop/zip';
import { inspectForeignFile, captureSafeForeignParts, attachForeignInterop } from '../../../../platform/import-sandbox/importExportSandbox';
import {
  appendWriterPreservedXmlEntries,
  captureWriterXmlPreservation,
  listWriterPreservedXmlPartNames,
  mergeWriterPreservedNamespaces,
} from '../../../../platform/interop/writerPreservation';
import { resolveWriterPaperDimensionsMm } from '../../../../platform/document-layout/writerPaperSizes';
import { resolveWriterPhysicalPageMarginsMm } from '../../../../platform/document-layout/writerPageMargins';
import { importDocument, importOdtXml, type ImportFormat } from '../import/writerImporter';
// W-177 for ODT: the ODF reader's own omission report, consumed by the same loss mechanism as DOCX.
import { reportOdtImportOmissions } from '../import/odtContentReader';
import { escapeMarkdownText } from '../import/markdownInline';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';

// The format name is its own module so the loss report can name a format without importing this
// module (which imports the report). Re-exported here, so every existing caller keeps its import site.
import type { WriterPortableFormat } from './writerPortableTypes';
export type { WriterPortableFormat };
import {
  buildWriterImportLossReport,
  buildWriterInterchangeLossReport,
  describeWriterInterchangeFormattingLoss,
  describeWriterInterchangeLoss,
  measureWriterInterchangeContent,
  type WriterInterchangeLossReport,
} from './writerInterchangeLossReport';
export type { WriterInterchangeLossReport };
export { describeWriterInterchangeFormattingLoss, describeWriterInterchangeLoss };

export interface WriterPortableExport {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  format: WriterPortableFormat;
  /** W-177/W-181/W-196: what this format could not carry. Never absent, so "nothing was lost" is readable. */
  lossReport: WriterInterchangeLossReport;
}

const MAX_PORTABLE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_EXPORT_CHARS = 4_000_000;
const DEFAULT_PAGE_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
  showPageNumbers: true, headerText: '', footerText: '',
};

function safeBaseName(title: string): string {
  return (title || 'document').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 120) || 'document';
}

function textBlock(doc: WorkspaceDocument): Paragraph[] {
  const root = doc.root_object_ids.map((id) => doc.objects[id]).find((object) => object?.type === 'TextBlock');
  if (root?.type === 'TextBlock') return root.data.paragraphs;
  const fallback = Object.values(doc.objects).find((object) => object.type === 'TextBlock');
  return fallback?.type === 'TextBlock' ? fallback.data.paragraphs : [];
}

function paragraphText(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => span.text).join('');
}

function xmlEscape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function htmlEscape(value: string): string {
  return xmlEscape(value);
}

function rtfEscape(value: string): string {
  let output = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === '\\' || character === '{' || character === '}') output += `\\${character}`;
    else if (codePoint >= 0x20 && codePoint <= 0x7e) output += character;
    else if (codePoint <= 0xffff) output += `\\u${codePoint > 0x7fff ? codePoint - 0x10000 : codePoint}?`;
    else {
      const shifted = codePoint - 0x10000;
      const high = 0xd800 + (shifted >> 10);
      const low = 0xdc00 + (shifted & 0x3ff);
      output += `\\u${high - 0x10000}?\\u${low - 0x10000}?`;
    }
  }
  return output;
}

function exportPlainText(paragraphs: readonly Paragraph[]): string {
  // W-195: this used to `.slice(0, MAX_TEXT_EXPORT_CHARS)` — the document was cut off and nobody was
  // told, which is the one thing an export must never do. The bound stays (an unbounded export can
  // exhaust the tab) but it is now a **refusal** that names the size, and the caller shows the message.
  const text = paragraphs.map(paragraphText).join('\n\n');
  if (text.length > MAX_TEXT_EXPORT_CHARS) {
    throw new Error(
      `Der Text-Export umfasst ${text.length} Zeichen und überschreitet die Grenze von ${MAX_TEXT_EXPORT_CHARS}. `
      + 'Das Dokument wurde nicht gekürzt; bitte als DOCX oder ODT exportieren.',
    );
  }
  return text;
}

function spanMarkdown(paragraph: Paragraph): string {
  return paragraph.spans.map((span, index) => {
    // Only the first run begins the line, and only there can `#`, `>`, `-`, `+` or `1.`
    // turn into a block marker. Everywhere else `.` and `-` stay clean (W-187/W-188).
    let value = escapeMarkdownText(span.text, index === 0);
    if (span.bold) value = `**${value}**`;
    if (span.italic) value = `*${value}*`;
    if (span.strikethrough) value = `~~${value}~~`;
    return value;
  }).join('');
}

function exportMarkdown(paragraphs: readonly Paragraph[]): string {
  // W-195: the same slice as in the text export, with the same consequence — and here a cut is even
  // worse, because Markdown is the format a user feeds back into the editor. Refused, not truncated.
  const markdown = paragraphs.map((paragraph) => {
    const body = spanMarkdown(paragraph);
    const level = paragraph.style.heading_level;
    if (level) return `${'#'.repeat(level)} ${body}`;
    if (paragraph.style.list_style === 'bullet') return `- ${body}`;
    if (paragraph.style.list_style === 'number') return `1. ${body}`;
    if (paragraph.style.style_name === 'quote') return `> ${body}`;
    return body;
  }).join('\n\n');
  if (markdown.length > MAX_TEXT_EXPORT_CHARS) {
    throw new Error(
      `Der Markdown-Export umfasst ${markdown.length} Zeichen und überschreitet die Grenze von ${MAX_TEXT_EXPORT_CHARS}. `
      + 'Das Dokument wurde nicht gekürzt; bitte als DOCX oder ODT exportieren.',
    );
  }
  return markdown;
}

function spanHtml(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => {
    let value = htmlEscape(span.text).replace(/\n/gu, '<br>');
    if (span.bold) value = `<strong>${value}</strong>`;
    if (span.italic) value = `<em>${value}</em>`;
    if (span.underline) value = `<u>${value}</u>`;
    if (span.strikethrough) value = `<s>${value}</s>`;
    return value;
  }).join('');
}

function exportHtml(doc: WorkspaceDocument, paragraphs: readonly Paragraph[]): string {
  const body = paragraphs.map((paragraph) => {
    const content = spanHtml(paragraph);
    const level = paragraph.style.heading_level;
    if (level) return `<h${level}>${content}</h${level}>`;
    if (paragraph.style.list_style === 'bullet') return `<ul><li>${content}</li></ul>`;
    if (paragraph.style.list_style === 'number') return `<ol><li>${content}</li></ol>`;
    if (paragraph.style.style_name === 'quote') return `<blockquote>${content}</blockquote>`;
    return `<p>${content}</p>`;
  }).join('\n');
  return `<!doctype html>\n<html lang="de"><head><meta charset="utf-8"><title>${htmlEscape(doc.title)}</title></head><body>\n${body}\n</body></html>`;
}

/**
 * W-182: RTF addresses colours by index into a document colour table, and the exporter wrote **no** table
 * and no `\cf`, so a colour could not survive RTF even though the reader now understands one. The table is
 * built from the colours the document actually uses, in a stable order, so two exports of one document
 * produce the same file.
 */
function collectRtfColors(paragraphs: readonly Paragraph[]): string[] {
  const seen = new Set<string>();
  for (const paragraph of paragraphs) {
    for (const span of paragraph.spans) {
      const color = span.text_color?.toLowerCase();
      if (color && /^#[0-9a-f]{6}$/u.test(color)) seen.add(color);
    }
  }
  return [...seen].sort();
}

function rtfColorTable(colors: readonly string[]): string {
  // Entry 0 is the automatic colour, which is why an indexed colour starts at 1 (W-182).
  const entries = colors.map((color) => {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `\\red${red}\\green${green}\\blue${blue};`;
  });
  return `{\\colortbl ;${entries.join('')}}`;
}

/**
 * W-183: the editor writes `\outlinelevel` — which is what brings a heading back through **this** reader —
 * and additionally names a heading style (`\s1`…`\s6`) with a matching `\stylesheet` entry, so a foreign
 * program that only honours styles (Word shows an unstyled heading in its default formatting) shows the
 * heading as a heading as well.
 */
function rtfStyleSheet(): string {
  return `{\\stylesheet{\\ql\\fs24 Normal;}{\\s0\\ql\\fs24 Standard;}{\\s1\\ql\\outlinelevel0\\b\\fs32 Überschrift 1;}{\\s2\\ql\\outlinelevel1\\b\\fs28 Überschrift 2;}{\\s3\\ql\\outlinelevel2\\b\\fs26 Überschrift 3;}{\\s4\\ql\\outlinelevel3\\b\\fs24 Überschrift 4;}{\\s5\\ql\\outlinelevel4\\b\\fs22 Überschrift 5;}{\\s6\\ql\\outlinelevel5\\b\\fs20 Überschrift 6;}}`;
}

/**
 * W-182/W-183, testable on its own: the RTF document for a list of paragraphs.
 *
 * Exported so the round trip can be measured — export a colour, read it back — without building a whole
 * `WorkspaceDocument` around it.
 */
export function exportRtfDocument(paragraphs: readonly Paragraph[]): string {
  return exportRtf(paragraphs);
}

function exportRtf(paragraphs: readonly Paragraph[]): string {
  const colors = collectRtfColors(paragraphs);
  const colorIndex = new Map(colors.map((color, index) => [color, index + 1]));
  const body = paragraphs.map((paragraph) => {
    const align = paragraph.style.alignment === 'center' ? '\\qc' : paragraph.style.alignment === 'right' ? '\\qr' : paragraph.style.alignment === 'justify' ? '\\qj' : '\\ql';
    // The outline level carries the heading across the round trip: RTF has no heading
    // style of its own, so without it a re-imported document lost every heading.
    const level = paragraph.style.heading_level;
    const outline = level ? `\\outlinelevel${level - 1}` : '';
    // W-183: name the heading style next to the outline level, for programs that read only styles.
    const styleRef = level ? `\\s${level}` : '';
    const runs = paragraph.spans.map((span) => {
      // Every run states its size, so no reset is needed and a run without a size keeps
      // the 12 pt document default instead of inheriting a neighbour.
      const size = `\\fs${Math.round((span.font_size_pt ?? 12) * 2)} `;
      // W-182: the colour, by index, and back to automatic afterwards so it cannot leak into the next run.
      const color = span.text_color?.toLowerCase();
      const colorIndexForSpan = color ? colorIndex.get(color) : undefined;
      const colorOpen = colorIndexForSpan === undefined ? '' : `\\cf${colorIndexForSpan} `;
      const colorClose = colorIndexForSpan === undefined ? '' : '\\cf0 ';
      const open = `${span.bold ? '\\b ' : ''}${span.italic ? '\\i ' : ''}${span.underline ? '\\ul ' : ''}${size}${colorOpen}`;
      const close = `${colorClose}${span.underline ? '\\ul0 ' : ''}${span.italic ? '\\i0 ' : ''}${span.bold ? '\\b0 ' : ''}`;
      return `${open}${rtfEscape(span.text)}${close}`;
    }).join('');
    return `\\pard${align}${styleRef}${outline} ${runs}\\par`;
  }).join('\n');
  const table = colors.length === 0 ? '' : `${rtfColorTable(colors)}\n`;
  return `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fnil Arial;}}\n${rtfStyleSheet()}\n${table}${body}\n}`;
}

/**
 * Builds the ODF body **and** the automatic styles it refers to.
 *
 * W-180: the exporter only knew four fixed text styles (bold, italic, bold-italic,
 * underline) and wrote no paragraph style at all. Font size, colour and alignment
 * therefore could not survive a round trip even though the reader understood them — "wieder
 * interoperabel exportieren" was impossible for exactly the layout the acceptance names.
 * Styles are now derived from the content: one text style per distinct run format, one
 * paragraph style per distinct alignment.
 */
function odtBodyAndStyles(paragraphs: readonly Paragraph[]): { body: string; automaticStyles: string } {
  const textStyleNames = new Map<string, string>();
  const textStyleXml: string[] = [];
  const paragraphStyleNames = new Map<string, string>();
  const paragraphStyleXml: string[] = [];

  const textStyleFor = (span: TextSpan): string => {
    const size = span.font_size_pt;
    const color = span.text_color;
    const underline = span.underline === true;
    const signature = `${span.bold === true}|${span.italic === true}|${underline}|${size ?? ''}|${color ?? ''}`;
    const known = textStyleNames.get(signature);
    if (known) return known;
    const properties = [
      span.bold ? 'fo:font-weight="bold"' : '',
      span.italic ? 'fo:font-style="italic"' : '',
      underline ? 'style:text-underline-style="solid"' : '',
      size === undefined ? '' : `fo:font-size="${size}pt"`,
      color === undefined ? '' : `fo:color="${xmlEscape(color)}"`,
    ].filter(Boolean).join(' ');
    const name = `VGTText${textStyleNames.size + 1}`;
    textStyleNames.set(signature, name);
    // A run with no formatting at all needs no span wrapper and no style entry.
    if (properties.length === 0) return '';
    textStyleXml.push(`<style:style style:name="${name}" style:family="text"><style:text-properties ${properties}/></style:style>`);
    return name;
  };

  /**
   * WR-042 — ODT keeps alignment **and** the semantic paragraph spacing.
   *
   * The exporter wrote only `fo:text-align`, so a `space_before` created by the direct cursor
   * was lost on export and came back as the generic default. ODF expresses it as
   * `fo:margin-top`/`fo:margin-bottom`; the style is keyed by the property signature so two
   * paragraphs with the same spacing share one style.
   */
  const paragraphStyleFor = (paragraph: Paragraph): string => {
    const value = paragraph.style.alignment ?? 'left';
    const before = Number.isFinite(paragraph.style.space_before) ? Math.max(0, paragraph.style.space_before ?? 0) : 0;
    const after = Number.isFinite(paragraph.style.space_after) ? Math.max(0, paragraph.style.space_after ?? 0) : 0;
    const properties: string[] = [];
    if (value !== 'left') properties.push(`fo:text-align="${value === 'justify' ? 'justify' : value}"`);
    if (before > 0) properties.push(`fo:margin-top="${before}pt"`);
    if (after > 0) properties.push(`fo:margin-bottom="${after}pt"`);
    if (properties.length === 0) return '';
    const signature = properties.join('|');
    const known = paragraphStyleNames.get(signature);
    if (known) return known;
    const name = `VGTParagraph${paragraphStyleNames.size + 1}`;
    paragraphStyleNames.set(signature, name);
    paragraphStyleXml.push(`<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties ${properties.join(' ')}/></style:style>`);
    return name;
  };

  const body = paragraphs.map((paragraph) => {
    const content = paragraph.spans.map((span) => {
      const text = xmlEscape(span.text);
      const style = textStyleFor(span);
      return style ? `<text:span text:style-name="${style}">${text}</text:span>` : text;
    }).join('');
    const paragraphStyle = paragraphStyleFor(paragraph);
    const styleAttribute = paragraphStyle ? ` text:style-name="${paragraphStyle}"` : '';
    const level = paragraph.style.heading_level;
    if (level) return `<text:h text:outline-level="${level}"${styleAttribute}>${content}</text:h>`;
    if (paragraph.style.list_style === 'bullet' || paragraph.style.list_style === 'number') {
      return `<text:list><text:list-item><text:p${styleAttribute}>${content}</text:p></text:list-item></text:list>`;
    }
    return `<text:p${styleAttribute}>${content}</text:p>`;
  }).join('');

  return { body, automaticStyles: `${paragraphStyleXml.join('')}${textStyleXml.join('')}` };
}

function odtContentXml(_doc: WorkspaceDocument, paragraphs: readonly Paragraph[]): string {
  const { body, automaticStyles } = odtBodyAndStyles(paragraphs);
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-content office:version="1.3" xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><office:automatic-styles>${automaticStyles}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
}

function exportOdt(doc: WorkspaceDocument, paragraphs: readonly Paragraph[]): Uint8Array {
  const setup = doc.writerData?.pageSetup ?? DEFAULT_PAGE_SETUP;
  const size = resolveWriterPaperDimensionsMm(setup);
  const margins = resolveWriterPhysicalPageMarginsMm(setup, 1);
  const width = setup.orientation === 'landscape' ? size.height : size.width;
  const height = setup.orientation === 'landscape' ? size.width : size.height;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles office:version="1.3" xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><office:styles/><office:automatic-styles><style:page-layout style:name="VGTPage"><style:page-layout-properties fo:page-width="${width}mm" fo:page-height="${height}mm" fo:margin-top="${margins.top}mm" fo:margin-bottom="${margins.bottom}mm" fo:margin-left="${margins.left}mm" fo:margin-right="${margins.right}mm" style:print-orientation="${setup.orientation}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="VGTPage"/></office:master-styles></office:document-styles>`;
  const preservedManifestEntries = listWriterPreservedXmlPartNames(doc.writerData?.interopPreservation, 'odt')
    .filter((name) => !['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml'].includes(name))
    .map((name) => `<manifest:file-entry manifest:full-path="${xmlEscape(name)}" manifest:media-type="text/xml"/>`)
    .join('');
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest manifest:version="1.3" xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${preservedManifestEntries}</manifest:manifest>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta office:version="1.3" xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><office:meta><dc:title>${xmlEscape(doc.title)}</dc:title><dc:creator>VGT Workspace</dc:creator></office:meta></office:document-meta>`;
  const contentXml = mergeWriterPreservedNamespaces(
    odtContentXml(doc, paragraphs),
    doc.writerData?.interopPreservation,
    'odt',
  );
  const entries = [
    { name: 'mimetype', data: utf8('application/vnd.oasis.opendocument.text') },
    { name: 'content.xml', data: utf8(contentXml) },
    { name: 'styles.xml', data: utf8(styles) },
    { name: 'meta.xml', data: utf8(meta) },
    { name: 'META-INF/manifest.xml', data: utf8(manifest) },
  ];
  appendWriterPreservedXmlEntries(entries, doc.writerData?.interopPreservation, 'odt');
  return writeStoredZip(entries);
}

function formatMetadata(format: WriterPortableFormat): { extension: string; mimeType: string } {
  switch (format) {
    case 'docx': return { extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    case 'odt': return { extension: 'odt', mimeType: 'application/vnd.oasis.opendocument.text' };
    case 'rtf': return { extension: 'rtf', mimeType: 'application/rtf' };
    case 'html': return { extension: 'html', mimeType: 'text/html;charset=utf-8' };
    case 'markdown': return { extension: 'md', mimeType: 'text/markdown;charset=utf-8' };
    case 'txt': return { extension: 'txt', mimeType: 'text/plain;charset=utf-8' };
  }
}

export function exportWriterPortableDocument(doc: WorkspaceDocument, format: WriterPortableFormat): WriterPortableExport {
  if (doc.kind !== 'Writer') throw new Error('Writer-Export benötigt ein Writer-Dokument.');
  const paragraphs = textBlock(doc);
  const metadata = formatMetadata(format);
  // W-177/W-181/W-196: what this format cannot carry, measured against what the document contains.
  // Built for every format, so "nothing is lost" is also a statement the user can read.
  const lossReport = buildWriterInterchangeLossReport(format, measureWriterInterchangeContent({
    paragraphs,
    images: doc.writerData?.images,
    tables: doc.writerData?.tables,
    equations: doc.writerData?.equations,
    notes: doc.writerData?.footnotes,
    comments: doc.writerData?.comments?.length ?? 0,
    revisions: doc.writerData?.revisions?.length ?? 0,
    headerText: doc.writerData?.pageSetup?.headerText,
    footerText: doc.writerData?.pageSetup?.footerText,
    // WR-042: shapes and media objects are visible content, so their loss must be reported.
    shapes: doc.writerData?.shapes,
    mediaObjects: doc.writerData?.mediaObjects,
  }));
  let bytes: Uint8Array;
  switch (format) {
    case 'docx': bytes = exportDocx(doc); break;
    case 'odt': bytes = exportOdt(doc, paragraphs); break;
    case 'rtf': bytes = utf8(exportRtf(paragraphs)); break;
    case 'html': bytes = utf8(exportHtml(doc, paragraphs)); break;
    case 'markdown': bytes = utf8(exportMarkdown(paragraphs)); break;
    case 'txt': bytes = utf8(exportPlainText(paragraphs)); break;
  }
  if (bytes.byteLength > MAX_PORTABLE_FILE_BYTES) throw new Error('Writer-Export überschreitet das 32-MiB-Limit.');
  return { fileName: `${safeBaseName(doc.title)}.${metadata.extension}`, mimeType: metadata.mimeType, bytes, format, lossReport };
}

/** The delivery extension differs from the internal format name only for Markdown (`.md`). */
const PORTABLE_DELIVERY_EXTENSION: Readonly<Record<WriterPortableFormat, string>> = {
  docx: 'docx',
  odt: 'odt',
  rtf: 'rtf',
  html: 'html',
  markdown: 'md',
  txt: 'txt',
};

/**
 * Hands the produced bytes to the user.
 *
 * Release Beta 0.1: on the desktop the save dialog + atomic export confirm the write; the browser
 * build keeps the download fallback and reports it as a download, never as a save.
 */
export function downloadWriterPortableBytes(output: WriterPortableExport): Promise<ExportDeliveryResult> {
  return deliverExportBytes(output.bytes, {
    suggestedName: output.fileName,
    extensions: [PORTABLE_DELIVERY_EXTENSION[output.format] ?? output.format],
    mimeType: output.mimeType,
  });
}

export function downloadWriterPortableDocument(doc: WorkspaceDocument, format: WriterPortableFormat): Promise<ExportDeliveryResult> {
  return downloadWriterPortableBytes(exportWriterPortableDocument(doc, format));
}

function workspaceDocumentFromParagraphs(title: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const now = Date.now();
  const textId = `writer-import-${crypto.randomUUID()}`;
  return {
    schema_version: 1, id: `writer-${crypto.randomUUID()}`, title, kind: 'Writer', created_at: now, modified_at: now,
    version: 1, theme_id: 'default', root_object_ids: [textId], objects: { [textId]: { type: 'TextBlock', data: { id: textId, paragraphs } } },
    writerData: { pageSetup: DEFAULT_PAGE_SETUP, tables: [] },
  };
}

function formatFromFilename(name: string): WriterPortableFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.odt')) return 'odt';
  if (lower.endsWith('.rtf')) return 'rtf';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.txt')) return 'txt';
  return null;
}

export async function importWriterPortableBytes(
  bytes: Uint8Array,
  fileName: string,
  /**
   * W-177: optional sink for the parts the import walked past, in this module's loss vocabulary.
   *
   * Additive: the returned document is unchanged and an existing caller does not change. The two formats
   * that can lose content report here — DOCX through the platform importer's omission channel, ODT
   * through the ODF reader's own. The rest are text formats and cannot lose a table or an image.
   */
  lossSink?: (report: WriterInterchangeLossReport) => void,
): Promise<WorkspaceDocument> {
  const format = formatFromFilename(fileName);
  if (!format) throw new Error('Nicht unterstütztes Writer-Importformat.');
  if (bytes.byteLength > MAX_PORTABLE_FILE_BYTES) throw new Error('Writer-Import überschreitet das 32-MiB-Limit.');
  if (format === 'docx') {
    return importDocx(bytes, fileName, lossSink
      ? (omissions) => lossSink(buildWriterImportLossReport(omissions, 'docx'))
      : undefined);
  }
  if (format === 'odt') {
    const entries = await readZip(bytes, { maxEntries: 256, maxEntryBytes: 8 * 1024 * 1024, maxTotalUncompressedBytes: 24 * 1024 * 1024, maxCompressionRatio: 100 });
    const mime = entries.get('mimetype');
    const content = entries.get('content.xml');
    if (!mime || decodeUtf8(mime) !== 'application/vnd.oasis.opendocument.text' || !content) throw new Error('Ungültiges ODT-Paket.');
    const contentXml = decodeUtf8(content);
    if (lossSink) lossSink(buildWriterImportLossReport(reportOdtImportOmissions(contentXml), 'odt'));
    const parsed = importOdtXml(contentXml);
    const imported = workspaceDocumentFromParagraphs(fileName.replace(/\.odt$/iu, '') || parsed.title, parsed.paragraphs);
    imported.writerData = {
      ...(imported.writerData ?? { pageSetup: DEFAULT_PAGE_SETUP, tables: [] }),
      interopPreservation: captureWriterXmlPreservation(
        entries,
        'odt',
        contentXml,
        new Set(['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']),
      ),
    };
    return imported;
  }
  const text = decodeUtf8(bytes);
  const explicit: ImportFormat = format === 'markdown' ? 'markdown' : format;
  const parsed = importDocument(text, fileName, explicit);
  return workspaceDocumentFromParagraphs(fileName.replace(/\.(rtf|html?|md|markdown|txt)$/iu, '') || parsed.title, parsed.paragraphs);
}

export async function importWriterPortableFile(
  file: File,
  lossSink?: (report: WriterInterchangeLossReport) => void,
): Promise<WorkspaceDocument> {
  if (file.size > MAX_PORTABLE_FILE_BYTES) throw new Error('Writer-Import überschreitet das 32-MiB-Limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hinted = formatFromFilename(file.name);
  if (hinted === 'docx' || hinted === 'odt') {
    const sandbox = await inspectForeignFile(file, bytes);
    if (sandbox.report.format !== hinted) throw new Error(`Dateiendung und Sandbox-Format stimmen nicht überein (${sandbox.report.format}).`);
    const imported = await importWriterPortableBytes(bytes, file.name, lossSink);
    return attachForeignInterop(imported, await captureSafeForeignParts(bytes, sandbox.report));
  }
  return importWriterPortableBytes(bytes, file.name, lossSink);
}
