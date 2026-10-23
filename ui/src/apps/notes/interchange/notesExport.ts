import type { NotePage, Paragraph } from '../../../shared/contracts/workspace';
import { buildDocumentPdf, assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
import { deliverExportBytes, deliverExportText, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';

const safeFilename = (title: string, extension: string) =>
  `${(title || 'note').replace(/[^a-z0-9._-]+/gi, '_')}.${extension}`;

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const buildNoteMarkdown = (page: NotePage) => {
  const frontMatter = `---\ntitle: ${page.title.replace(/\n/g, ' ')}\ntags: ${(page.tags || []).join(', ')}\nmodified: ${new Date(page.last_modified).toISOString()}\n---\n\n`;
  return frontMatter + page.content;
};

export const exportNoteMarkdown = (page: NotePage): Promise<ExportDeliveryResult> => deliverExportText(buildNoteMarkdown(page), {
  suggestedName: safeFilename(page.title, 'md'),
  extensions: ['md'],
  mimeType: 'text/markdown;charset=utf-8',
});

export const buildNoteHtml = (page: NotePage) => {
  const body = page.content
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (/^###\s+/.test(line)) return `<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`;
      if (/^##\s+/.test(line)) return `<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`;
      if (/^#\s+/.test(line)) return `<h1>${escapeHtml(line.replace(/^#\s+/, ''))}</h1>`;
      if (/^- \[[ xX]\]\s+/.test(line)) {
        const checked = /^- \[[xX]\]/.test(line);
        return `<p><input type="checkbox" disabled${checked ? ' checked' : ''}> ${escapeHtml(line.replace(/^- \[[ xX]\]\s+/, ''))}</p>`;
      }
      if (/^-\s+/.test(line)) return `<p>• ${escapeHtml(line.replace(/^-\s+/, ''))}</p>`;
      if (!line.trim()) return '<br>';
      return `<p>${escaped}</p>`;
    })
    .join('\n');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(page.title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 24px;color:#111}h1,h2,h3{line-height:1.2}code{font-family:ui-monospace,monospace}</style></head><body><h1>${escapeHtml(page.title)}</h1>${body}</body></html>`;
};

export const exportNoteHtml = (page: NotePage): Promise<ExportDeliveryResult> => deliverExportText(buildNoteHtml(page), {
  suggestedName: safeFilename(page.title, 'html'),
  extensions: ['html'],
  mimeType: 'text/html;charset=utf-8',
});

const markdownToParagraphs = (page: NotePage): Paragraph[] =>
  page.content.split('\n').map((line, index) => {
    const heading = /^#\s+/.test(line) ? 1 : /^##\s+/.test(line) ? 2 : /^###\s+/.test(line) ? 3 : undefined;
    const clean = line
      .replace(/^#{1,3}\s+/, '')
      .replace(/^- \[([ xX])\]\s+/, (_, checked: string) => checked.toLowerCase() === 'x' ? '[x] ' : '[ ] ')
      .replace(/^-\s+/, '• ');
    return {
      id: `note-export-${index}`,
      style: {
        heading_level: heading as 1 | 2 | 3 | undefined,
        alignment: 'left' as const,
        line_height: 1.5,
        space_before: heading ? 10 : 2,
        space_after: heading ? 6 : 4,
      },
      spans: [{ text: clean, bold: Boolean(heading), font_size_pt: heading === 1 ? 20 : heading === 2 ? 15 : heading === 3 ? 13 : 10.5 }],
    };
  });

export const buildNotePdf = (page: NotePage): Uint8Array => {
  const paragraphs: Paragraph[] = [
    {
      id: 'note-export-title',
      style: { heading_level: 1, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 12 },
      spans: [{ text: page.title, bold: true, font_size_pt: 22 }],
    },
    ...markdownToParagraphs(page),
  ];
  return buildDocumentPdf({
    title: page.title,
    paragraphs,
    config: {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: 'normal',
      paperColor: 'white',
      showPageNumbers: true,
      headerText: 'VGT Notes',
      footerText: (page.tags || []).length ? `Tags: ${page.tags.join(', ')}` : '',
    },
  });
};

export const exportNotePdf = (page: NotePage): Promise<ExportDeliveryResult> => deliverExportBytes(buildNotePdf(page), {
  suggestedName: safeFilename(page.title, 'pdf'),
  extensions: ['pdf'],
  mimeType: 'application/pdf',
  assertArtifact: assertPdfExportArtifact,
});
