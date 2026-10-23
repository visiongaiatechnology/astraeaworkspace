// STATUS: DIAMANT VGT SUPREME — Universal Multi-Format Document Importer
// Pure in-memory parsers for DOCX XML, ODT XML, RTF, HTML, Markdown, and Plain Text

import type { Paragraph, TextSpan, WriterParagraphStyleName } from '../../../../shared/contracts/workspace';
import { inspectBoundedForeignXml } from '../../../../shared/interoperability/xml';
import { createWriterImportBudget, type WriterImportBudget } from './security/writerImportSecurity';
import { parseRtfDocument } from './rtfTokenizer';
import { parseOdtContent } from './odtContentReader';
import { parseMarkdownInline } from './markdownInline';

export type ImportFormat = 'docx' | 'odt' | 'rtf' | 'html' | 'markdown' | 'txt' | 'auto';

export interface ImportResult {
  title: string;
  paragraphs: Paragraph[];
  formatDetected: ImportFormat;
  itemCount: number;
}

const MAX_IMPORT_PARAGRAPHS = 20_000;
const MAX_IMPORT_SPANS_PER_PARAGRAPH = 4_096;
const MAX_IMPORT_LINES = 50_000;

function assertWriterImportTextBudget(content: string, label: string, budget?: WriterImportBudget): WriterImportBudget {
  const activeBudget = budget ?? createWriterImportBudget();
  activeBudget.assertSource(content, label);
  return activeBudget;
}

function assertWriterParagraphBudget(count: number, label: string): void {
  if (count > MAX_IMPORT_PARAGRAPHS) throw new Error(`${label} exceeds Writer paragraph import limit`);
}

function assertWriterSpanBudget(count: number): void {
  if (count > MAX_IMPORT_SPANS_PER_PARAGRAPH) throw new Error('Writer paragraph exceeds span import limit');
}

export function makeParagraph(
  id: string,
  styleName: WriterParagraphStyleName = 'normal',
  spans: TextSpan[],
  alignment: 'left' | 'center' | 'right' | 'justify' = 'left',
  headingLevel?: 1 | 2 | 3,
  listStyle?: 'bullet' | 'number' | 'checklist'
): Paragraph {
  return {
    id,
    style: {
      style_name: styleName,
      alignment,
      line_height: 1.25,
      space_before: headingLevel ? 14 : 0,
      space_after: headingLevel ? 6 : 4,
      heading_level: headingLevel,
      list_style: listStyle,
    },
    spans: spans.length > 0 ? spans : [{ text: '' }],
  };
}

export function detectFormat(filename: string, content: string): ImportFormat {
  assertWriterImportTextBudget(content, 'Writer format probe');
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'docx') return 'docx';
  if (ext === 'odt') return 'odt';
  if (ext === 'rtf') return 'rtf';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') return 'txt';

  if (content.startsWith('{\\rtf')) return 'rtf';
  if (content.includes('<w:document') || content.includes('xmlns:w=')) return 'docx';
  if (content.includes('<office:document-content') || content.includes('xmlns:text=')) return 'odt';
  if (/<(html|body|div|p|h1|h2)[^>]*>/i.test(content)) return 'html';
  if (/^#+\s+|^>\s+|\*\*|__|\[.*\]\(.*\)/m.test(content)) return 'markdown';

  return 'txt';
}

export function importMarkdown(markdown: string): { title: string; paragraphs: Paragraph[] } {
  const budget = assertWriterImportTextBudget(markdown, 'Markdown');
  const lines = markdown.split(/\r?\n/);
  if (lines.length > MAX_IMPORT_LINES) throw new Error('Markdown exceeds Writer line import limit');
  const paragraphs: Paragraph[] = [];
  let title = 'Imported Markdown Document';
  let titleFound = false;

  for (let i = 0; i < lines.length; i++) {
    budget.tick('Markdown');
    assertWriterParagraphBudget(paragraphs.length, 'Markdown');
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);

    if (h1) {
      if (!titleFound) {
        title = inlineSpans(h1[1].trim()).map((span) => span.text).join('').trim() || title;
        titleFound = true;
      }
      assertWriterParagraphBudget(paragraphs.length + 1, 'Markdown');
      paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'heading1', inlineSpans(h1[1].trim()), 'left', 1));
      continue;
    }

    if (h2) {
      paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'heading2', inlineSpans(h2[1].trim()), 'left', 2));
      continue;
    }

    if (h3) {
      paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'heading3', inlineSpans(h3[1].trim()), 'left', 3));
      continue;
    }

    const quote = line.match(/^>\s*(.*)$/);
    if (quote) {
      paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'quote', inlineSpans(quote[1].trim())));
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'normal', inlineSpans(bullet[1].trim()), 'left', undefined, 'bullet'));
      continue;
    }

    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'normal', inlineSpans(numbered[2].trim()), 'left', undefined, 'number'));
      continue;
    }

    paragraphs.push(makeParagraph(`par-md-${paragraphs.length + 1}`, 'normal', inlineSpans(line)));
  }

  budget.finish('Markdown');
  return { title, paragraphs: paragraphs.length > 0 ? paragraphs : [makeParagraph('par-empty', 'normal', [{ text: '' }])] };
}

/**
 * Reads inline Markdown for **any** paragraph kind.
 *
 * Headings, quotes and list items used to skip this step, so `## Ein **wichtiger** Punkt`
 * kept its asterisks as literal text while the same words in a normal paragraph became bold.
 */
function inlineSpans(text: string): TextSpan[] {
  const runs = parseMarkdownInline(text);
  return runs.map((run) => {
    assertWriterSpanBudget(1);
    return {
      text: run.text,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.strikethrough ? { strikethrough: true } : {}),
    };
  });
}

export function importHtml(html: string): { title: string; paragraphs: Paragraph[] } {
  const budget = assertWriterImportTextBudget(html, 'HTML');
  budget.assertMarkupStructure(html, 'HTML');
  let title = 'Imported HTML Document';
  const paragraphs: Paragraph[] = [];

  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    if (doc.title) title = doc.title;

    const blockElements = doc.body.querySelectorAll('h1, h2, h3, p, blockquote, li');
    assertWriterParagraphBudget(blockElements.length, 'HTML');
    if (blockElements.length > 0) {
      blockElements.forEach((el, index) => {
        budget.tick('HTML');
        const tag = el.tagName.toLowerCase();
        const text = el.textContent?.trim() || '';
        if (!text) return;

        let styleName: WriterParagraphStyleName = 'normal';
        let headingLevel: 1 | 2 | 3 | undefined;
        let listStyle: 'bullet' | 'number' | undefined;

        if (tag === 'h1') { styleName = 'heading1'; headingLevel = 1; }
        else if (tag === 'h2') { styleName = 'heading2'; headingLevel = 2; }
        else if (tag === 'h3') { styleName = 'heading3'; headingLevel = 3; }
        else if (tag === 'blockquote') { styleName = 'quote'; }
        else if (tag === 'li') { listStyle = 'bullet'; }

        paragraphs.push(makeParagraph(`par-html-${index + 1}`, styleName, [{ text, bold: tag.startsWith('h') }], 'left', headingLevel, listStyle));
      });
    }
  }

  if (paragraphs.length === 0) {
    const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return importPlainText(cleanText);
  }

  budget.finish('HTML');
  return { title, paragraphs };
}

export function importRtf(rtf: string): { title: string; paragraphs: Paragraph[] } {
  const budget = assertWriterImportTextBudget(rtf, 'RTF');
  budget.assertRtfStructure(rtf, 'RTF');
  // The reader keeps formatting and paragraphs; see rtfTokenizer for why the previous
  // split-on-\par approach could not.
  const parsed = parseRtfDocument(rtf);
  assertWriterParagraphBudget(parsed.length, 'RTF');
  const paragraphs: Paragraph[] = [];

  for (const block of parsed) {
    budget.tick('RTF');
    assertWriterSpanBudget(block.runs.length);
    const spans: TextSpan[] = block.runs.map((run) => ({
      text: run.text,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.underline ? { underline: true } : {}),
      ...(run.font_size_pt === undefined ? {} : { font_size_pt: run.font_size_pt }),
    }));
    const level = block.headingLevel;
    paragraphs.push(makeParagraph(
      `par-rtf-${paragraphs.length + 1}`,
      level ? (`heading${level}` as WriterParagraphStyleName) : 'normal',
      spans,
      block.alignment,
      level
    ));
  }

  budget.finish('RTF');
  return {
    title: 'Imported RTF Document',
    paragraphs: paragraphs.length > 0 ? paragraphs : [makeParagraph('par-empty', 'normal', [{ text: '' }])],
  };
}

export function importPlainText(text: string): { title: string; paragraphs: Paragraph[] } {
  const budget = assertWriterImportTextBudget(text, 'Plain text');
  const chunks = text.split(/\r?\n(?:\r?\n)+/);
  assertWriterParagraphBudget(chunks.length, 'Plain text');
  const paragraphs: Paragraph[] = chunks
    .map((chunk, idx) => { budget.tick('Plain text'); return makeParagraph(`par-txt-${idx + 1}`, 'normal', [{ text: chunk.trim() }]); })
    .filter((p) => (p.spans[0]?.text.length || 0) > 0);

  budget.finish('Plain text');
  return {
    title: 'Imported Plain Text',
    paragraphs: paragraphs.length > 0 ? paragraphs : [makeParagraph('par-empty', 'normal', [{ text: '' }])],
  };
}

export function importDocxXml(xmlString: string): { title: string; paragraphs: Paragraph[] } {
  inspectBoundedForeignXml(xmlString);
  const budget = assertWriterImportTextBudget(xmlString, 'DOCX XML');
  budget.assertMarkupStructure(xmlString, 'DOCX XML');
  const paragraphs: Paragraph[] = [];
  const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;
  let count = 0;

  while ((pMatch = pRegex.exec(xmlString)) !== null) {
    budget.tick('DOCX XML');
    assertWriterParagraphBudget(count + 1, 'DOCX XML');
    const pContent = pMatch[1];
    const spans: TextSpan[] = [];

    const styleMatch = pContent.match(/<w:pStyle\s+w:val="([^"]+)"/);
    let styleName: WriterParagraphStyleName = 'normal';
    let headingLevel: 1 | 2 | 3 | undefined;
    if (styleMatch) {
      const val = styleMatch[1].toLowerCase();
      if (val.includes('heading1') || val === '1') { styleName = 'heading1'; headingLevel = 1; }
      else if (val.includes('heading2') || val === '2') { styleName = 'heading2'; headingLevel = 2; }
      else if (val.includes('heading3') || val === '3') { styleName = 'heading3'; headingLevel = 3; }
      else if (val.includes('title')) { styleName = 'title'; }
    }

    const rRegex = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
    let rMatch: RegExpExecArray | null;

    while ((rMatch = rRegex.exec(pContent)) !== null) {
      budget.tick('DOCX XML');
      assertWriterSpanBudget(spans.length + 1);
      const rContent = rMatch[1];
      const isBold = /<w:b(?:\s*\/|>)/.test(rContent);
      const isItalic = /<w:i(?:\s*\/|>)/.test(rContent);
      const isUnderline = /<w:u(?:\s*\/|>)/.test(rContent);

      const tMatch = rContent.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
      if (tMatch) {
        spans.push({
          text: tMatch[1],
          bold: isBold || undefined,
          italic: isItalic || undefined,
          underline: isUnderline || undefined,
        });
      }
    }

    if (spans.length > 0) {
      count++;
      paragraphs.push(makeParagraph(`par-docx-${count}`, styleName, spans, 'left', headingLevel));
    }
  }

  budget.finish('DOCX XML');
  return {
    title: 'Imported Word Document',
    paragraphs: paragraphs.length > 0 ? paragraphs : [makeParagraph('par-empty', 'normal', [{ text: '' }])],
  };
}

export function importOdtXml(xmlString: string): { title: string; paragraphs: Paragraph[] } {
  inspectBoundedForeignXml(xmlString);
  const budget = assertWriterImportTextBudget(xmlString, 'ODT XML');
  budget.assertMarkupStructure(xmlString, 'ODT XML');
  // The reader keeps text styles, heading levels, list kinds and the space/tab/line-break
  // elements; see odtContentReader for what the previous tag-stripping lost.
  const parsed = parseOdtContent(xmlString);
  assertWriterParagraphBudget(parsed.length, 'ODT XML');
  const paragraphs: Paragraph[] = [];

  for (const block of parsed) {
    budget.tick('ODT XML');
    assertWriterSpanBudget(block.runs.length);
    const spans: TextSpan[] = block.runs.map((run) => ({
      text: run.text,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.underline ? { underline: true } : {}),
      ...(run.font_size_pt === undefined ? {} : { font_size_pt: run.font_size_pt }),
      ...(run.text_color === undefined ? {} : { text_color: run.text_color }),
    }));
    const level = block.headingLevel;
    const paragraph = makeParagraph(
      `par-odt-${paragraphs.length + 1}`,
      level ? (`heading${level}` as WriterParagraphStyleName) : 'normal',
      spans,
      block.alignment,
      level,
      block.listStyle
    );
    // WR-042: the exporter writes `fo:margin-top/bottom`; the reader restores them.
    if (block.spaceBeforePt !== undefined) paragraph.style.space_before = block.spaceBeforePt;
    if (block.spaceAfterPt !== undefined) paragraph.style.space_after = block.spaceAfterPt;
    paragraphs.push(paragraph);
  }

  budget.finish('ODT XML');
  return {
    title: 'Imported OpenDocument',
    paragraphs: paragraphs.length > 0 ? paragraphs : [makeParagraph('par-empty', 'normal', [{ text: '' }])],
  };
}

export function importDocument(
  content: string,
  filename: string,
  explicitFormat: ImportFormat = 'auto'
): ImportResult {
  assertWriterImportTextBudget(content, 'Writer document');
  const fmt = explicitFormat === 'auto' ? detectFormat(filename, content) : explicitFormat;
  let parsed: { title: string; paragraphs: Paragraph[] };

  switch (fmt) {
    case 'docx': parsed = importDocxXml(content); break;
    case 'odt': parsed = importOdtXml(content); break;
    case 'rtf': parsed = importRtf(content); break;
    case 'html': parsed = importHtml(content); break;
    case 'markdown': parsed = importMarkdown(content); break;
    case 'txt':
    default:
      parsed = importPlainText(content);
      break;
  }

  return {
    title: parsed.title,
    paragraphs: parsed.paragraphs,
    formatDetected: fmt,
    itemCount: parsed.paragraphs.length,
  };
}
