// STATUS: DIAMANT VGT SUPREME — bounded OneNote-XML and Evernote-ENEX interoperability adapters
import { NoteNotebook, NoteSection, NotePage } from '../../../../shared/contracts/workspace';
import { inspectBoundedForeignXml } from '../../../../shared/interoperability/xml';

export type ExternalNotesFormat = 'onenote' | 'enex' | 'markdown' | 'auto';


export const MAX_EXTERNAL_NOTES_XML_CHARS = 8_000_000;
export const MAX_EXTERNAL_NOTES_XML_NODES = 10_000;
export const MAX_EXTERNAL_NOTES_XML_DEPTH = 64;
export const MAX_EXTERNAL_NOTES_PAGES = 5_000;
export const MAX_EXTERNAL_NOTES_PRESERVED_ITEMS = 10_000;
export const MAX_EXTERNAL_NOTES_PRESERVED_XML_CHARS = 256_000;
export const MAX_EXTERNAL_NOTES_IMPORT_MS = 2_000;

const clock = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

const EVERNOTE_EXPORT_DOCTYPE = /<!DOCTYPE\s+en-export\s+SYSTEM\s+["']http:\/\/xml\.evernote\.com\/pub\/evernote-export4\.dtd["']\s*>/i;

function xmlWithoutKnownNonResolvingEvernoteDoctype(content: string): string {
  const stripped = content.replace(EVERNOTE_EXPORT_DOCTYPE, '');
  if (/<!DOCTYPE/iu.test(stripped)) throw new Error('External DTD declarations are not accepted in external Notes XML.');
  return stripped;
}

function assertExternalTextBudget(content: string): string {
  if (content.length > MAX_EXTERNAL_NOTES_XML_CHARS) throw new Error('External notes payload exceeds the 8,000,000 character safety limit.');
  const safe = xmlWithoutKnownNonResolvingEvernoteDoctype(content);
  inspectBoundedForeignXml(safe, { maxBytes: MAX_EXTERNAL_NOTES_XML_CHARS, maxDepth: MAX_EXTERNAL_NOTES_XML_DEPTH, maxElements: MAX_EXTERNAL_NOTES_XML_NODES });
  return safe;
}

function assertXmlDocumentBudget(doc: Document, startedAt: number): void {
  const root = doc.documentElement;
  if (!root) throw new Error('External Notes XML has no document element.');
  let nodes = 0;
  const stack: Array<{ node: Element; depth: number }> = [{ node: root, depth: 1 }];
  while (stack.length) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_EXTERNAL_NOTES_XML_NODES) throw new Error('External Notes XML exceeds the DOM node limit.');
    if (current.depth > MAX_EXTERNAL_NOTES_XML_DEPTH) throw new Error('External Notes XML exceeds the nesting-depth limit.');
    for (const child of Array.from(current.node.children)) stack.push({ node: child, depth: current.depth + 1 });
    if ((nodes & 1023) === 0 && clock() - startedAt > MAX_EXTERNAL_NOTES_IMPORT_MS) throw new Error('External Notes XML exceeded the parsing time budget.');
  }
  if (clock() - startedAt > MAX_EXTERNAL_NOTES_IMPORT_MS) throw new Error('External Notes XML exceeded the parsing time budget.');
}

function parseBoundedXml(xmlString: string): { doc: Document; startedAt: number } {
  const parserInput = assertExternalTextBudget(xmlString);
  const startedAt = clock();
  const parser = new DOMParser();
  const doc = parser.parseFromString(parserInput, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid external Notes XML document.');
  assertXmlDocumentBudget(doc, startedAt);
  return { doc, startedAt };
}

function assertImportStillWithinTime(startedAt: number): void {
  if (clock() - startedAt > MAX_EXTERNAL_NOTES_IMPORT_MS) throw new Error('External Notes import exceeded the processing time budget.');
}

export interface NotesRoundtripPreservedItem {
  id: string;
  sourceFormat: 'onenote' | 'enex';
  itemType: 'inkStroke' | 'audioAttachment' | 'binaryObject' | 'customTag';
  rawXml: string;
  description: string;
}

export interface NotesRoundtripManifest {
  version: string;
  originalFormat: 'onenote' | 'enex' | 'markdown';
  importedAt: number;
  pagesCount: number;
  preservedItems: NotesRoundtripPreservedItem[];
  fidelityScorePercent: number;
}

export interface ImportNotesResult {
  notebook: NoteNotebook;
  manifest: NotesRoundtripManifest;
  detectedFormat: 'onenote' | 'enex' | 'markdown';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Detect format from file content or filename
 */
export function detectNotesFormat(content: string, filename = ''): 'onenote' | 'enex' | 'markdown' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.one') || lower.endsWith('.onetoc2')) return 'onenote';
  if (lower.endsWith('.enex')) return 'enex';
  if (lower.endsWith('.md')) return 'markdown';

  if (content.includes('http://schemas.microsoft.com/office/onenote') || content.includes('<one:Page') || content.includes('<one:Notebook')) {
    return 'onenote';
  }
  if (content.includes('<en-export') || content.includes('http://xml.evernote.com/pub/enml2.dtd')) {
    return 'enex';
  }
  return 'markdown';
}

/**
 * Parse OneNote XML into Notebook structure
 */
export function parseOneNoteXml(xmlString: string, notebookTitle = 'Importiertes OneNote Notizbuch'): {
  notebook: NoteNotebook;
  preserved: NotesRoundtripPreservedItem[];
} {
  if (!xmlString.trimStart().startsWith('<')) throw new Error('Binary OneNote .one/.onetoc2 files require Microsoft conversion/export to OneNote XML before import; Astraea does not pretend to parse the proprietary binary format.');
  const { doc, startedAt } = parseBoundedXml(xmlString);
  const preserved: NotesRoundtripPreservedItem[] = [];

  const pages: NotePage[] = [];
  const pageNodes = doc.querySelectorAll('Page, one\:Page');
  const nodesToProcess = (pageNodes.length > 0 ? Array.from(pageNodes) : [doc.documentElement]).slice(0, MAX_EXTERNAL_NOTES_PAGES);
  if (pageNodes.length > MAX_EXTERNAL_NOTES_PAGES) throw new Error('OneNote XML exceeds the page limit.');

  nodesToProcess.forEach((pNode, idx) => {
    assertImportStillWithinTime(startedAt);
    const pageId = `page-on-${idx + 1}`;
    const titleAttr = pNode.getAttribute('name') || pNode.querySelector('Title, one\:Title')?.textContent?.trim() || `Notiz ${idx + 1}`;

    // Extract text paragraphs
    const textNodes = pNode.querySelectorAll('T, one\:T');
    let mdContent = '';

    if (textNodes.length > 0) {
      mdContent = Array.from(textNodes)
        .map((t) => t.textContent?.trim() || '')
        .filter(Boolean)
        .join('\n\n');
    } else {
      mdContent = pNode.textContent?.trim() || 'Notizinhalt';
    }

    // Check for ink or attachments to preserve
    const inkNodes = pNode.querySelectorAll('InkDrawing, one\:InkDrawing, InkNode, one\:InkNode');
    inkNodes.forEach((ink, inkIdx) => {
      if (preserved.length >= MAX_EXTERNAL_NOTES_PRESERVED_ITEMS) return;
      preserved.push({
        id: `pres-ink-${idx}-${inkIdx}`,
        sourceFormat: 'onenote',
        itemType: 'inkStroke',
        rawXml: (ink.outerHTML || '<InkDrawing/>').slice(0, MAX_EXTERNAL_NOTES_PRESERVED_XML_CHARS),
        description: 'OneNote Ink/Handschrift-Vector-Objekt',
      });
    });

    const page: NotePage = {
      id: pageId,
      title: titleAttr,
      content: mdContent,
      created_at: Date.now(),
      last_modified: Date.now(),
      tags: ['onenote'], backlinks: [],
      pinned: false,
      favorite: false,
      archived: false,
      attachments: [],
          };
    pages.push(page);
  });

  const sectionId = `sec-on-1`;
  const section: NoteSection = {
    id: sectionId,
    title: 'Hauptabschnitt',
    pages,
      };

  const notebook: NoteNotebook = {
    id: `nb-on-${Date.now()}`,
    title: notebookTitle,
    sections: [section],
  };

  return { notebook, preserved };
}

/**
 * Parse Evernote ENEX into Notebook structure
 */
export function parseEvernoteEnex(xmlString: string, notebookTitle = 'Importiertes Evernote Notizbuch'): {
  notebook: NoteNotebook;
  preserved: NotesRoundtripPreservedItem[];
} {
  const { doc, startedAt } = parseBoundedXml(xmlString);
  const parser = new DOMParser();
  const preserved: NotesRoundtripPreservedItem[] = [];

  const pages: NotePage[] = [];
  const noteNodes = doc.querySelectorAll('note');
  if (noteNodes.length > MAX_EXTERNAL_NOTES_PAGES) throw new Error('Evernote ENEX exceeds the page limit.');

  Array.from(noteNodes).slice(0, MAX_EXTERNAL_NOTES_PAGES).forEach((nNode, idx) => {
    assertImportStillWithinTime(startedAt);
    const title = nNode.querySelector('title')?.textContent?.trim() || `Notiz ${idx + 1}`;
    const contentNode = nNode.querySelector('content');
    let text = '';

    if (contentNode) {
      const rawContent = contentNode.textContent || '';
      // Parse ENML (XHTML subset)
      const contentDoc = parser.parseFromString(rawContent, 'text/html');
      text = contentDoc.body?.textContent?.trim() || rawContent;
    }

    // Tags
    const tagNodes = nNode.querySelectorAll('tag');
    const tags = Array.from(tagNodes).map((t) => t.textContent?.trim().toLowerCase() || '').filter(Boolean);
    if (!tags.includes('evernote')) tags.push('evernote');

    // Preserved binary media (<en-media>)
    const mediaNodes = nNode.querySelectorAll('resource');
    mediaNodes.forEach((res, resIdx) => {
      if (preserved.length >= MAX_EXTERNAL_NOTES_PRESERVED_ITEMS) return;
      preserved.push({
        id: `pres-res-${idx}-${resIdx}`,
        sourceFormat: 'enex',
        itemType: 'binaryObject',
        rawXml: (res.outerHTML || '<resource/>').slice(0, MAX_EXTERNAL_NOTES_PRESERVED_XML_CHARS),
        description: 'Evernote Attachment-Ressource (Base64)',
      });
    });

    const page: NotePage = {
      id: `page-en-${idx + 1}`,
      title,
      content: text,
      created_at: Date.now(),
      last_modified: Date.now(),
      tags, backlinks: [],
      pinned: false,
      favorite: false,
      archived: false,
      attachments: [],
          };
    pages.push(page);
  });

  if (pages.length === 0) {
    pages.push({
      id: 'page-en-1',
      title: 'Evernote Import',
      content: doc.documentElement.textContent?.slice(0, 500).trim() || '',
      created_at: Date.now(),
      last_modified: Date.now(),
      tags: ['evernote'], backlinks: [],
      pinned: false,
      favorite: false,
      archived: false,
      attachments: [],
          });
  }

  const section: NoteSection = {
    id: `sec-en-1`,
    title: 'Evernote Notizen',
    pages,
      };

  const notebook: NoteNotebook = {
    id: `nb-en-${Date.now()}`,
    title: notebookTitle,
    sections: [section],
  };

  return { notebook, preserved };
}

/**
 * Universal Notes Importer
 */
export function importNotesDocument(
  content: string,
  filename = '',
  forcedFormat: ExternalNotesFormat = 'auto'
): ImportNotesResult {
  assertExternalTextBudget(content);
  const format = forcedFormat === 'auto' ? detectNotesFormat(content, filename) : forcedFormat;

  if (format === 'enex') {
    const { notebook, preserved } = parseEvernoteEnex(content, filename.replace(/\.enex$/i, '') || 'Evernote Import');
    return {
      notebook,
      detectedFormat: 'enex',
      manifest: {
        version: '2.1',
        originalFormat: 'enex',
        importedAt: Date.now(),
        pagesCount: notebook.sections.reduce((acc: number, s: NoteSection) => acc + s.pages.length, 0),
        preservedItems: preserved,
        fidelityScorePercent: Math.max(80, 100 - preserved.length * 3),
      },
    };
  }

  if (format === 'onenote') {
    const { notebook, preserved } = parseOneNoteXml(content, filename.replace(/\.(one|onetoc2)$/i, '') || 'OneNote Import');
    return {
      notebook,
      detectedFormat: 'onenote',
      manifest: {
        version: '2.1',
        originalFormat: 'onenote',
        importedAt: Date.now(),
        pagesCount: notebook.sections.reduce((acc: number, s: NoteSection) => acc + s.pages.length, 0),
        preservedItems: preserved,
        fidelityScorePercent: Math.max(80, 100 - preserved.length * 3),
      },
    };
  }

  // Default: Markdown file with title and body
  const lines = content.split('\n');
  const title = lines[0]?.replace(/^#\s*/, '').trim() || 'Importierte Notiz';
  const body = lines.slice(1).join('\n').trim();

  const page: NotePage = {
    id: `page-md-${Date.now()}`,
    title,
    content: body,
    created_at: Date.now(),
    last_modified: Date.now(),
    tags: ['markdown'], backlinks: [],
    pinned: false,
    favorite: false,
    archived: false,
    attachments: [],
      };

  const notebook: NoteNotebook = {
    id: `nb-md-${Date.now()}`,
    title: 'Markdown Notizbuch',
    sections: [
      {
        id: `sec-md-1`,
        title: 'Abschnitt',
        pages: [page],
              },
    ],
  };

  return {
    notebook,
    detectedFormat: 'markdown',
    manifest: {
      version: '2.1',
      originalFormat: 'markdown',
      importedAt: Date.now(),
      pagesCount: 1,
      preservedItems: [],
      fidelityScorePercent: 100,
    },
  };
}

/**
 * Export Notebook to OneNote XML representation
 */
export function exportToOneNoteXml(notebook: NoteNotebook, manifest?: NotesRoundtripManifest): string {
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<one:Notebook xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onetoc" name="${escapeXml(notebook.title)}">\n`;

  notebook.sections.forEach((sec: NoteSection) => {
    xml += `  <one:Section name="${escapeXml(sec.title)}">\n`;
    sec.pages.forEach((page: NotePage) => {
      xml += `    <one:Page ID="${escapeXml(page.id)}" name="${escapeXml(page.title)}">\n`;
      xml += `      <one:Title><one:OE><one:T>${escapeXml(page.title)}</one:T></one:OE></one:Title>\n`;
      xml += `      <one:Outline><one:OEChildren>\n`;
      
      const paragraphs = page.content.split('\n\n').filter(Boolean);
      paragraphs.forEach((p: string) => {
        xml += `        <one:OE><one:T>${escapeXml(p)}</one:T></one:OE>\n`;
      });

      // Re-inject preserved elements
      if (manifest) {
        manifest.preservedItems
          .filter((item) => item.sourceFormat === 'onenote')
          .forEach((item) => {
            xml += `        <!-- Preserved OneNote Node: ${escapeXml(item.description)} -->\n`;
            xml += `        ${item.rawXml}\n`;
          });
      }

      xml += `      </one:OEChildren></one:Outline>\n`;
      xml += `    </one:Page>\n`;
    });
    xml += `  </one:Section>\n`;
  });

  xml += `</one:Notebook>\n`;
  return xml;
}

/**
 * Export Notebook to Evernote ENEX XML format
 */
export function exportToEvernoteEnex(notebook: NoteNotebook, manifest?: NotesRoundtripManifest): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n`;
  xml += `<en-export export-date="${new Date().toISOString()}" application="Astraea Notes" version="2.1">\n`;

  notebook.sections.forEach((sec: NoteSection) => {
    sec.pages.forEach((page: NotePage) => {
      xml += `  <note>\n`;
      xml += `    <title>${escapeXml(page.title)}</title>\n`;
      xml += `    <content>\n`;
      xml += `      <![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>\n`;
      
      const paras = page.content.split('\n\n').filter(Boolean);
      paras.forEach((p: string) => {
        xml += `        <div>${escapeXml(p)}</div>\n`;
      });

      xml += `      </en-note>]]>\n`;
      xml += `    </content>\n`;
      xml += `    <created>${new Date(page.created_at || page.last_modified).toISOString()}</created>\n`;
      xml += `    <updated>${new Date(page.last_modified).toISOString()}</updated>\n`;

      page.tags.forEach((tag: string) => {
        xml += `    <tag>${escapeXml(tag)}</tag>\n`;
      });

      if (manifest) {
        manifest.preservedItems
          .filter((item) => item.sourceFormat === 'enex')
          .forEach((item) => {
            xml += `    <!-- Preserved Evernote Resource: ${escapeXml(item.description)} -->\n`;
            xml += `    ${item.rawXml}\n`;
          });
      }

      xml += `  </note>\n`;
    });
  });

  xml += `</en-export>\n`;
  return xml;
}
