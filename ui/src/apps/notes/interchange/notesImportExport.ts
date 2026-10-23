// STATUS: DIAMANT VGT SUPREME — scoped Notes import/export, Markdown-folder ZIP and internal-link preservation
import type { NoteAttachment, NoteNotebook, NotePage, NoteSection } from '../../../shared/contracts/workspace';
import { buildNoteHtml, buildNoteMarkdown, buildNotePdf } from './notesExport';
import { createNoteEntityId, normalizeNoteNotebook, sanitizeNoteTitle } from '../model/notesHierarchy';
import { fileToNoteAttachment } from '../media/noteAttachments';
import { buildNoteFreeformPdf } from './notesCanvasPrint';
// W-343: the Markdown folder uses the ONE canonical STORED-ZIP writer/reader of the platform. A second
// writer with its own CRC table used to live here; it was deleted rather than kept in sync.
import { decodeUtf8, readZip, writeStoredZip, type ZipReadLimits } from '../../../platform/interop/zip';
// Der **eine** vorhandene Leser des nativen verschlüsselten Notes-Containers — hier nur angeschlossen (W-433-Familie).
import { unpackVnote } from './container/notesVnoteContainer';

export type NotesExportScope = { kind: 'notebook'; notebook: NoteNotebook } | { kind: 'section'; notebook: NoteNotebook; section: NoteSection } | { kind: 'page'; notebook: NoteNotebook; section: NoteSection; page: NotePage };
export type NotesExportFormat = 'markdown-folder' | 'html' | 'pdf' | 'text' | 'json';
export interface NotesExportArtifact { bytes: Uint8Array; mimeType: string; filename: string; }

export const MAX_NOTES_IMPORT_FILES = 128;
export const MAX_NOTES_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_NOTES_IMPORT_TOTAL_BYTES = 32 * 1024 * 1024;
export const MAX_NOTES_IMPORT_TEXT_CHARS = 4_000_000;
export const MAX_NOTES_IMPORT_JSON_SECTIONS = 512;
export const MAX_NOTES_IMPORT_JSON_PAGES = 5_000;
/** Bounded read policy for a Notes Markdown-folder archive (hard caps live in `platform/interop/zip`). */
export const NOTES_MARKDOWN_FOLDER_ZIP_LIMITS: Partial<ZipReadLimits> = Object.freeze({
  maxEntries: MAX_NOTES_IMPORT_FILES * 2 + 8,
  maxEntryBytes: MAX_NOTES_IMPORT_FILE_BYTES,
  maxTotalUncompressedBytes: MAX_NOTES_IMPORT_TOTAL_BYTES,
});
export const NOTES_MARKDOWN_FOLDER_MANIFEST = 'astraea-notes-manifest.json';
/** **W-433:** die Kennung der HTML-Ordner-Ausfuhr — dieselbe Form wie die Markdown-Kennung, eigener Name. */
export const NOTES_HTML_FOLDER_MANIFEST = 'astraea-notes-html-manifest.json';

function assertTextImportBudget(text: string, label: string): void {
  if (text.length > MAX_NOTES_IMPORT_TEXT_CHARS) throw new Error(`${label} exceeds the ${MAX_NOTES_IMPORT_TEXT_CHARS.toLocaleString()} character import limit.`);
}

function assertNotebookImportBudget(notebook: NoteNotebook): void {
  if ((notebook.sections ?? []).length > MAX_NOTES_IMPORT_JSON_SECTIONS) throw new Error('Notes archive exceeds the section limit.');
  let pages = 0;
  for (const section of notebook.sections ?? []) {
    pages += (section.pages ?? []).length;
    if (pages > MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');
  }
}

const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/**
 * Canonical, ZIP-safe path segment. `platform/interop/zip` rejects reserved Windows device names and
 * trailing dots/spaces, so the exporter must never emit one — otherwise a note titled "con" would make the
 * whole folder export fail.
 */
function safePath(value: string): string {
  const clean = (value || 'Untitled').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 100) || 'Untitled';
  return WINDOWS_RESERVED_BASENAME.test(clean) ? `_${clean}` : clean;
}
function encode(value: string): Uint8Array { return new TextEncoder().encode(value); }
function pagesForScope(scope: NotesExportScope): Array<{ section: NoteSection; page: NotePage }> {
  if (scope.kind === 'page') return [{ section: scope.section, page: scope.page }];
  if (scope.kind === 'section') return scope.section.pages.filter((page) => !page.trashedAt).map((page) => ({ section: scope.section, page }));
  return scope.notebook.sections.filter((section) => !section.trashedAt).flatMap((section) => section.pages.filter((page) => !page.trashedAt).map((page) => ({ section, page })));
}
function uniquePaths(entries: Array<{ section: NoteSection; page: NotePage }>, extension: string): Map<string, string> {
  const result = new Map<string, string>(); const used = new Set<string>();
  for (const { section, page } of entries) {
    const base = `${safePath(section.title)}/${safePath(page.title)}`;
    let path = `${base}.${extension}`; let index = 2;
    while (used.has(path.toLocaleLowerCase())) path = `${base}-${index++}.${extension}`;
    used.add(path.toLocaleLowerCase()); result.set(page.id, path);
  }
  return result;
}
function titleMap(entries: Array<{ page: NotePage }>): Map<string, NotePage> {
  const map = new Map<string, NotePage>();
  for (const { page } of entries) for (const label of [page.title, ...(page.aliases ?? [])]) { const key=label.normalize('NFKC').trim().toLocaleLowerCase(); if (key && !map.has(key)) map.set(key,page); }
  return map;
}
function rewriteWikiLinks(markdown: string, fromPath: string, paths: Map<string,string>, titles: Map<string,NotePage>, html: boolean): string {
  return markdown.replace(/(!?)\[\[([^\]\n]{1,512})\]\]/g, (whole, transclusion: string, rawTarget: string) => {
    const [labelPart, displayPart] = String(rawTarget).split('|',2); const [label] = labelPart.split('#',1);
    const target=titles.get(label.trim().toLocaleLowerCase()); if (!target) return whole;
    const targetPath=paths.get(target.id); if (!targetPath) return whole;
    const fromDir=fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')+1) : '';
    const relative=targetPath.startsWith(fromDir) ? targetPath.slice(fromDir.length) : `../${targetPath}`;
    const text=(displayPart?.trim() || label.trim()).replace(/[<>]/g,'');
    if (html) return `<a href="${relative.replace(/\.md$/i,'.html')}">${text}</a>`;
    return transclusion ? `![${text}](${relative})` : `[${text}](${relative})`;
  });
}

/** Builds the Markdown-folder entries (path → bytes) without packaging them. */
export function buildMarkdownFolder(scope: NotesExportScope): Map<string, Uint8Array> {
  const entries=pagesForScope(scope); const paths=uniquePaths(entries,'md'); const titles=titleMap(entries); const files=new Map<string,Uint8Array>();
  for (const {page} of entries) { const path=paths.get(page.id)!; files.set(path,encode(rewriteWikiLinks(buildNoteMarkdown(page),path,paths,titles,false))); for(const attachment of page.attachments ?? []) files.set(`attachments/${safePath(attachment.id)}-${safePath(attachment.name)}`, dataUrlBytes(attachment.dataUrl)); }
  files.set(NOTES_MARKDOWN_FOLDER_MANIFEST,encode(JSON.stringify({format:'astraea-notes-markdown-folder',version:1,title:scope.notebook.title,pages:[...paths.entries()].map(([id,path])=>({id,path}))},null,2)));
  return files;
}

/**
 * W-343: packages the Markdown folder with the canonical STORED-ZIP writer. The deleted local writer used
 * its own CRC table and its own header layout, which is exactly the duplicated rule this project forbids.
 */
export function buildStoreZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  return writeStoredZip([...files.entries()].map(([name, data]) => ({ name, data })));
}

function dataUrlBytes(dataUrl:string):Uint8Array { const comma=dataUrl.indexOf(','); if(comma<0) return new Uint8Array(); const meta=dataUrl.slice(0,comma); const payload=dataUrl.slice(comma+1); if(meta.includes(';base64')){ const raw=atob(payload); return Uint8Array.from(raw,c=>c.charCodeAt(0)); } return encode(decodeURIComponent(payload)); }

export function buildScopedNotesExport(scope: NotesExportScope, format: NotesExportFormat): NotesExportArtifact {
  const entries=pagesForScope(scope); const base=safePath(scope.kind==='page'?scope.page.title:scope.kind==='section'?scope.section.title:scope.notebook.title);
  if (format==='markdown-folder') return {bytes:buildStoreZip(buildMarkdownFolder(scope)),mimeType:'application/zip',filename:`${base}-Markdown.zip`};
  if (format==='json') return {bytes:encode(JSON.stringify({format:'astraea-notes-json',version:1,scope:scope.kind,notebook:scope.kind==='notebook'?scope.notebook:{...scope.notebook,sections:scope.kind==='section'?[scope.section]:[{...scope.section,pages:[scope.page]}]}},null,2)),mimeType:'application/json',filename:`${base}.notes.json`};
  if (format==='text') return {bytes:encode(entries.map(({section,page})=>`# ${page.title}\nSection: ${section.title}\n\n${page.content}`).join('\n\n---\n\n')),mimeType:'text/plain;charset=utf-8',filename:`${base}.txt`};
  if (format==='pdf') { const aggregate:NotePage={id:'export',title:base,content:entries.map(({section,page})=>`# ${page.title}\n\n_Section: ${section.title}_\n\n${page.content}`).join('\n\n---\n\n'),tags:[],backlinks:[],last_modified:Date.now()}; return {bytes:buildNotePdf(aggregate),mimeType:'application/pdf',filename:`${base}.pdf`}; }
  const paths=uniquePaths(entries,'html'); const titles=titleMap(entries); const files=new Map<string,Uint8Array>();
  for(const {page} of entries){ const path=paths.get(page.id)!; files.set(path,encode(rewriteWikiLinks(buildNoteHtml(page),path,paths,titles,true))); }
  // **W-433:** Die HTML-Ausfuhr mehrerer Seiten trug **kein** Manifest — und damit gab es für einen Leser
  // nichts, woran er den Ordner erkennen konnte. *Eine Ausfuhr ohne Kennung ist eine Ausfuhr ohne Rückweg.*
  // Das einzelne `.html` bleibt unverändert eine Datei (dafür gibt es den vorhandenen Einzeldatei-Import) und
  // bekommt deshalb **kein** Manifest vorangestellt.
  if (entries.length > 1) {
    files.set(NOTES_HTML_FOLDER_MANIFEST, encode(JSON.stringify({format:'astraea-notes-html-folder',version:1,title:scope.notebook.title,pages:[...paths.entries()].map(([id,path])=>({id,path}))},null,2)));
  }
  return entries.length===1 ? {bytes:[...files.values()][0]!,mimeType:'text/html;charset=utf-8',filename:`${base}.html`} : {bytes:buildStoreZip(files),mimeType:'application/zip',filename:`${base}-HTML.zip`};
}


export async function buildScopedNotesExportAsync(scope: NotesExportScope, format: NotesExportFormat): Promise<NotesExportArtifact> {
  if (format === 'pdf' && scope.kind === 'page' && scope.page.editorMode === 'freeform' && scope.page.canvas) {
    return { bytes: await buildNoteFreeformPdf(scope.page), mimeType: 'application/pdf', filename: `${safePath(scope.page.title)}.pdf` };
  }
  return buildScopedNotesExport(scope, format);
}

function htmlToText(html:string):string {
  /**
   * **W-433 — der HTML-Weg ist DOM-gebunden, und das wird jetzt gesagt.**
   *
   * Gemessen: in der kopflosen Laufzeit ist `DOMParser` **`undefined`** — vorher endete der Aufruf in einem
   * `TypeError` irgendwo in einer Zeile. *Ein fehlender Baustein ist ein benannter Zustand, kein Absturz.*
   * Der Zweig bleibt der **eine** HTML-Leser; es entsteht hier kein zweiter, DOM-freier Parser.
   */
  if (typeof DOMParser === 'undefined') throw new Error('HTML text extraction requires a DOM (DOMParser); this runtime has none.');
  const doc=new DOMParser().parseFromString(html,'text/html'); for(const node of Array.from(doc.querySelectorAll('script,style,iframe,object,embed'))) node.remove(); return (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g,'\n\n').trim(); }
function pageFromText(title:string,content:string,tags:string[]):NotePage { const now=Date.now(); return {id:createNoteEntityId('page'),title:sanitizeNoteTitle(title,'Imported Note'),content:content.slice(0,2_000_000),tags,backlinks:[],attachments:[],created_at:now,last_modified:now}; }

const NOTES_FRONT_MATTER = /^---\r?\ntitle:\s*(.*?)\r?\ntags:\s*(.*?)\r?\nmodified:\s*(.*?)\r?\n---\r?\n\r?\n?/;

interface MarkdownFolderPage { id: string; path: string; /** Optional: vom **HTML**-Leser gesetzt (der Markdown-Leser leitet den Titel aus dem Rumpf ab). */ title?: string; }

/**
 * Resolves an archive-relative href against the path of the page it appears in.
 * Relative links are relative to the *source document*, not to the archive root, so `../` must be applied
 * before the lookup — otherwise every same-folder link would miss.
 */
function resolveArchiveCandidates(sourcePath: string, href: string): string[] {
  const dir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) : '';
  const segments: string[] = [];
  for (const part of `${dir}${href}`.split('/')) {
    if (part === '..') segments.pop();
    else if (part && part !== '.') segments.push(part);
  }
  return Array.from(new Set([
    segments.join('/'),
    `${dir}${href}`,
    href.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, ''),
  ])).filter(Boolean);
}

/**
 * AST-0726/AST-0727: the exported Markdown folder could be written but **not read back**, so "Notizbaum nach
 * Markdown exportieren und korrekt wieder importieren" had no import half. Relative Markdown links are
 * restored to the canonical [[wiki link]] syntax, resolved against the source page rather than a title guess.
 */
export function restoreWikiLinksFromMarkdown(markdown: string, archivePaths: ReadonlyMap<string, string>, sourcePath = ''): string {
  return markdown.replace(/(!?)\[([^\]\n]{0,512})\]\(([^)\n]{1,2048})\)/g, (whole, transclusion: string, _label: string, href: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return whole;
    const decoded = (() => { try { return decodeURIComponent(href); } catch { return href; } })();
    const title = resolveArchiveCandidates(sourcePath, decoded).map((candidate) => archivePaths.get(candidate)).find(Boolean);
    if (!title) return whole;
    return `${transclusion}[[${title}]]`;
  });
}

/** The same restoration for a single HTML page: exported `<a href="x.html">` / `<img src="x.png">`. */
export function restoreWikiLinksFromHtml(html: string, archivePaths: ReadonlyMap<string, string>, sourcePath = ''): string {
  const withLinks = html.replace(/<a\b[^>]*href="([^"]{1,2048})"[^>]*>([^<]{0,512})<\/a>/gi, (whole, href: string, label: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return whole;
    const decoded = (() => { try { return decodeURIComponent(href); } catch { return href; } })();
    const title = resolveArchiveCandidates(sourcePath, decoded).map((candidate) => archivePaths.get(candidate)).find(Boolean);
    return title ? `[[${label.trim() || title}]]` : whole;
  });
  return withLinks.replace(/<img\b[^>]*src="([^"]{1,2048})"[^>]*>/gi, (whole, src: string) => {
    if (whole.includes('data:')) return whole;
    const decoded = (() => { try { return decodeURIComponent(src); } catch { return src; } })();
    const title = resolveArchiveCandidates(sourcePath, decoded).map((candidate) => archivePaths.get(candidate)).find(Boolean);
    return title ? `![[${title}]]` : whole;
  });
}

/**
 * Reads an Astraea Notes Markdown-folder ZIP through the canonical hostile-archive reader and rebuilds one
 * notebook. Fail-closed: a missing or mismatched manifest, an entry over the bounded read policy, or an
 * archive that exceeds the page budget is rejected instead of partially imported.
 */
export async function importMarkdownFolderZip(bytes: Uint8Array, preReadEntries?: ReadonlyMap<string, Uint8Array>): Promise<NoteNotebook> {
  const entries = preReadEntries ?? await readZip(bytes, NOTES_MARKDOWN_FOLDER_ZIP_LIMITS);
  const manifestBytes = entries.get(NOTES_MARKDOWN_FOLDER_MANIFEST);
  if (!manifestBytes) throw new Error('The archive has no Astraea Notes Markdown-folder manifest.');
  let manifest: { format?: unknown; version?: unknown; title?: unknown; pages?: unknown };
  try { manifest = JSON.parse(decodeUtf8(manifestBytes)) as typeof manifest; }
  catch { throw new Error('The Astraea Notes Markdown-folder manifest is not valid JSON.'); }
  if (manifest.format !== 'astraea-notes-markdown-folder' || manifest.version !== 1) throw new Error('Unsupported Astraea Notes Markdown-folder manifest.');
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) throw new Error('The Astraea Notes Markdown-folder manifest lists no pages.');
  if (manifest.pages.length > MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');

  const pages: MarkdownFolderPage[] = [];
  for (const raw of manifest.pages as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || typeof candidate.path !== 'string' || !candidate.path) continue;
    if (!entries.has(candidate.path)) continue;
    pages.push({ id: candidate.id.slice(0, 160), path: candidate.path });
  }
  if (!pages.length) throw new Error('The Astraea Notes Markdown-folder manifest references no readable page entry.');
  if (pages.length > MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');

  const parsed = pages.map((entry) => {
    const text = decodeUtf8(entries.get(entry.path)!);
    const frontMatter = text.match(NOTES_FRONT_MATTER);
    const body = frontMatter ? text.slice(frontMatter[0].length) : text;
    const fallbackTitle = entry.path.split('/').pop()?.replace(/\.md$/i, '') ?? entry.id;
    const title = sanitizeNoteTitle(frontMatter?.[1]?.trim() || fallbackTitle, 'Imported Note');
    const tags = (frontMatter?.[2] ?? '').split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 64);
    const sectionTitle = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : 'Imported';
    return { id: entry.id, path: entry.path, title, tags, sectionTitle: sanitizeNoteTitle(sectionTitle, 'Imported'), body };
  });

  // Archive-relative path → note title, so a relative Markdown link resolves through the manifest instead of
  // a title guess. Both the plain and the `../`-prefixed form are registered.
  const archivePaths = new Map<string, string>();
  for (const entry of parsed) {
    archivePaths.set(entry.path, entry.title);
    archivePaths.set(entry.path.replace(/^(?:\.\.\/)+/, ''), entry.title);
  }

  const grouped = new Map<string, NotePage[]>();
  const now = Date.now();
  for (const entry of parsed) {
    const content = restoreWikiLinksFromMarkdown(entry.body, archivePaths, entry.path);
    const page: NotePage = {
      id: createNoteEntityId('page'),
      title: entry.title,
      content: content.slice(0, MAX_NOTES_IMPORT_TEXT_CHARS),
      tags: entry.tags,
      backlinks: [],
      created_at: now,
      last_modified: now,
      attachments: [],
      revisions: [],
    };
    const bucket = grouped.get(entry.sectionTitle) ?? [];
    if (bucket.length >= MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');
    bucket.push(page);
    grouped.set(entry.sectionTitle, bucket);
  }

  const sections: NoteSection[] = [...grouped.entries()].slice(0, MAX_NOTES_IMPORT_JSON_SECTIONS).map(([title, sectionPages]) => ({
    id: createNoteEntityId('sec'), title, pages: sectionPages, createdAt: now, updatedAt: now, trashedAt: null,
  }));
  return normalizeNoteNotebook({
    id: createNoteEntityId('nb'),
    title: sanitizeNoteTitle(typeof manifest.title === 'string' ? manifest.title : 'Imported Notes', 'Imported Notes'),
    sections: sections.length ? sections : [{ id: createNoteEntityId('sec'), title: 'Imported', pages: [], createdAt: now, updatedAt: now, trashedAt: null }],
    createdAt: now,
    updatedAt: now,
  });
}
/**
 * **W-433 — der HTML-Ordner bekam seinen Rückweg.**
 *
 * Gemessen war die Lage: `buildScopedNotesExport(scope,'html')` schreibt für mehrere Seiten eine
 * `-HTML.zip` ✗, dafür gab es **keinen** Leser; `restoreWikiLinksFromHtml` war als dessen halbe Seite gebaut
 * und hatte **null** Aufrufer ✗. *Eine Ausfuhr ohne Einfuhr ist eine Zusage ohne Deckung.*
 *
 * Dieser Leser **erfindet nichts**: er benutzt den **einen** Archiv-Leser (`readZip` mit derselben
 * Lese-Politik), die **vorhandene** Link-Rückführung (`restoreWikiLinksFromHtml`) und den **vorhandenen**
 * HTML-Textleser (`htmlToText`). Die Rückführung läuft **vor** der Textgewinnung, weil sie `<a href="…">`
 * liest — *danach wäre das Attribut weg.*
 *
 * **Was hier `NOT_TESTED` bleibt:** ob ein **echter** Browser-DOM dieselbe Textgewinnung liefert. In dieser
 * Umgebung ist `DOMParser` nicht vorhanden (gemessen); der Test setzt deshalb einen **Plattform-Doppelgänger**
 * ein und führt den Produktionspfad unverändert aus.
 */
export async function importHtmlFolderZip(bytes: Uint8Array, preReadEntries?: ReadonlyMap<string, Uint8Array>): Promise<NoteNotebook> {
  const entries = preReadEntries ?? await readZip(bytes, NOTES_MARKDOWN_FOLDER_ZIP_LIMITS);
  const manifestBytes = entries.get(NOTES_HTML_FOLDER_MANIFEST);
  if (!manifestBytes) throw new Error('The archive has no Astraea Notes HTML-folder manifest.');
  let manifest: { format?: unknown; version?: unknown; title?: unknown; pages?: unknown };
  try { manifest = JSON.parse(decodeUtf8(manifestBytes)) as typeof manifest; }
  catch { throw new Error('The Astraea Notes HTML-folder manifest is not valid JSON.'); }
  if (manifest.format !== 'astraea-notes-html-folder' || manifest.version !== 1) throw new Error('Unsupported Astraea Notes HTML-folder manifest.');
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) throw new Error('The Astraea Notes HTML-folder manifest lists no pages.');
  if (manifest.pages.length > MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');

  const listed: MarkdownFolderPage[] = [];
  for (const raw of manifest.pages as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || typeof candidate.path !== 'string' || !candidate.path) continue;
    if (!entries.has(candidate.path)) continue;
    listed.push({ id: candidate.id.slice(0, 160), path: candidate.path });
  }
  if (!listed.length) throw new Error('The Astraea Notes HTML-folder manifest references no readable page entry.');
  if (listed.length > MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');

  // Pfad → Titel, damit ein relativer `<a href="…">` über den **Ordner** aufgelöst wird statt über einen
  // Titel-Rat. Beide Formen (mit und ohne führende `../`) werden registriert — dieselbe Regel wie im
  // Markdown-Leser, damit die beiden Ordner-Leser nicht auseinanderlaufen.
  const archivePaths = new Map<string, string>();
  for (const entry of listed) {
    const fileName = entry.path.split('/').pop()?.replace(/\.html$/i, '') ?? entry.id;
    const frontMatter = /<title[^>]*>([\s\S]{0,512}?)<\/title>/iu.exec(decodeUtf8(entries.get(entry.path)!));
    const title = sanitizeNoteTitle((frontMatter?.[1] ?? fileName).replace(/<[^>]*>/gu, '').trim() || fileName, 'Imported Note');
    entry.title = title;
    archivePaths.set(entry.path, title);
    archivePaths.set(entry.path.replace(/^(?:\.\.\/)+/, ''), title);
  }

  const grouped = new Map<string, NotePage[]>();
  const now = Date.now();
  for (const entry of listed) {
    const html = decodeUtf8(entries.get(entry.path)!);
    // Erst die Links (sie stehen im Markup), dann der Text.
    const withLinks = restoreWikiLinksFromHtml(html, archivePaths, entry.path);
    const body = htmlToText(withLinks);
    const sectionTitle = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : 'Imported';
    const page: NotePage = {
      id: createNoteEntityId('page'),
      title: entry.title ?? 'Imported Note',
      content: body.slice(0, MAX_NOTES_IMPORT_TEXT_CHARS),
      tags: [],
      backlinks: [],
      created_at: now,
      last_modified: now,
      attachments: [],
      revisions: [],
    };
    const key = sanitizeNoteTitle(sectionTitle, 'Imported');
    const bucket = grouped.get(key) ?? [];
    if (bucket.length >= MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Notes archive exceeds the page limit.');
    bucket.push(page);
    grouped.set(key, bucket);
  }

  const sections: NoteSection[] = [...grouped.entries()].slice(0, MAX_NOTES_IMPORT_JSON_SECTIONS).map(([title, sectionPages]) => ({
    id: createNoteEntityId('sec'), title, pages: sectionPages, createdAt: now, updatedAt: now, trashedAt: null,
  }));
  return normalizeNoteNotebook({
    id: createNoteEntityId('nb'),
    title: sanitizeNoteTitle(typeof manifest.title === 'string' ? manifest.title : 'Imported Notes', 'Imported Notes'),
    sections: sections.length ? sections : [{ id: createNoteEntityId('sec'), title: 'Imported', pages: [], createdAt: now, updatedAt: now, trashedAt: null }],
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * **Der eine Ordner-Eingang.** Vorher kannte der Importweg nur die Markdown-Kennung; ein HTML-Ordner wäre an
 * „kein Manifest" gescheitert. *Zwei Ausfuhren, ein Eingang — die Kennung entscheidet, nicht der Dateiname.*
 */
export async function importNotesFolderZip(bytes: Uint8Array): Promise<NoteNotebook> {
  const entries = await readZip(bytes, NOTES_MARKDOWN_FOLDER_ZIP_LIMITS);
  if (entries.has(NOTES_MARKDOWN_FOLDER_MANIFEST)) return importMarkdownFolderZip(bytes, entries);
  if (entries.has(NOTES_HTML_FOLDER_MANIFEST)) return importHtmlFolderZip(bytes, entries);
  throw new Error('The archive carries no Astraea Notes manifest (Markdown folder or HTML folder).');
}

export function importStructuredNotesJson(text:string):NoteNotebook {  assertTextImportBudget(text, 'Structured Notes JSON');
  const parsed=JSON.parse(text) as {format?:unknown;version?:unknown;notebook?:unknown};
  if(parsed.format!=='astraea-notes-json'||parsed.version!==1||!parsed.notebook||typeof parsed.notebook!=='object') throw new Error('Unsupported or invalid Astraea Notes JSON archive.');
  assertNotebookImportBudget(parsed.notebook as NoteNotebook);
  return normalizeNoteNotebook(parsed.notebook as NoteNotebook);
}
export function importTextNote(text:string,filename:string,mimeType='text/plain'):NoteNotebook {
  assertTextImportBudget(text, 'Text note');
  const ext=filename.toLowerCase(); const content=(mimeType.includes('html')||ext.endsWith('.html')||ext.endsWith('.htm'))?htmlToText(text):text;
  const first=content.split('\n')[0]?.replace(/^#\s+/,'').trim(); const title=sanitizeNoteTitle(first||filename.replace(/\.[^.]+$/,''),'Imported Note');
  const page=pageFromText(title,content,['imported',ext.endsWith('.md')?'markdown':mimeType.includes('html')?'html':'text']); const now=Date.now();
  return {id:createNoteEntityId('nb'),title,sections:[{id:createNoteEntityId('sec'),title:'Imported',pages:[page],createdAt:now,updatedAt:now}],createdAt:now,updatedAt:now};
}
/**
 * Die Zugangsdaten für den **nativen verschlüsselten** Notes-Container (`.vnote`).
 *
 * Kein zweites Passwort-Regelwerk: der Leser `unpackVnote` → `unpackContainer` nennt seine Gründe selbst
 * (`PASSWORD_REQUIRED`, `Decryption failed: invalid PIN or password`), und diese Namen werden durchgereicht.
 */
export interface NotesVnoteImportOptions { readonly vnotePassword?: string; }

/**
 * **Der Import der halben Zusage (AST-0728/AST-0734, Register W-433-Familie):**
 *
 * Gemessen war `unpackVnote` (`interchange/container/notesVnoteContainer.ts:16`) die **einzige** Funktion der
 * Notes-Interoperabilität **ohne Produktionsaufrufer** ✗ — `packVnote` schreibt seit jeher ein verschlüsseltes
 * `.vnote` (`security/NotesSecurityModal.tsx:61`), und **nichts** in der Anwendung konnte es wieder öffnen.
 * *Eine Ausfuhr ohne Einfuhr ist eine Zusage ohne Deckung: der Nutzer bekommt eine Datei, die nur er selbst
 * nicht zurückbekommt.* Hier wird der **vorhandene** Leser angeschlossen — kein zweiter Entschlüsseler, keine
 * zweite Budget-Regel (dieselben `assertNotebookImportBudget`/`normalizeNoteNotebook` wie beim JSON-Import).
 */
export async function importVnoteArchive(bytes: Uint8Array, options: NotesVnoteImportOptions = {}): Promise<NoteNotebook> {
  const opened = await unpackVnote(bytes, options.vnotePassword ? { password: options.vnotePassword } : {});
  if (opened.notebooks.length !== 1) {
    // Benannter Fehlschlag statt stiller Auswahl: die Anwendung schreibt genau **ein** Notizbuch je `.vnote`.
    throw new Error(`The .vnote container holds ${opened.notebooks.length} notebooks; a Notes import expects exactly one.`);
  }
  const notebook = opened.notebooks[0]!;
  assertNotebookImportBudget(notebook);
  return normalizeNoteNotebook(notebook);
}

export async function importCommonNoteFiles(files: readonly File[], options: NotesVnoteImportOptions = {}):Promise<NoteNotebook> {
  if(!files.length||files.length>MAX_NOTES_IMPORT_FILES) throw new Error(`Import requires 1-${MAX_NOTES_IMPORT_FILES} files.`);
  const totalBytes=files.reduce((sum,file)=>sum+Math.max(0,file.size),0);
  if(totalBytes>MAX_NOTES_IMPORT_TOTAL_BYTES) throw new Error('Combined import size exceeds the 32 MiB safety limit.');
  // AST-0726: a single Astraea Markdown-folder ZIP is read back through the canonical archive reader.
  // **W-433:** der eine Ordner-Eingang entscheidet über die **Kennung**, nicht über den Dateinamen — sonst
  // hätte ein HTML-Ordner nie einen Rückweg gehabt.
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    return importNotesFolderZip(bytes);
  }
  // Der native verschlüsselte Notes-Container: derselbe Ein-Datei-Weg, derselbe Leser wie die Ausfuhr schreibt.
  if (files.length === 1 && /\.vnote$/i.test(files[0].name)) {
    if (files[0].size > MAX_NOTES_IMPORT_FILE_BYTES) throw new Error(`${files[0].name} exceeds the 8 MiB per-file import limit.`);
    return importVnoteArchive(new Uint8Array(await files[0].arrayBuffer()), options);
  }
  const now=Date.now(); const pages:NotePage[]=[]; const binaryAttachments:NoteAttachment[]=[];
  for(const file of files){
    if(file.size>MAX_NOTES_IMPORT_FILE_BYTES) throw new Error(`${file.name} exceeds the 8 MiB per-file import limit.`);
    const lower=file.name.toLowerCase();
    if(lower.endsWith('.notes.json')) { const text=await file.text(); assertTextImportBudget(text,file.name); pages.push(...importStructuredNotesJson(text).sections.flatMap(s=>s.pages)); continue; }
    if(file.type.startsWith('text/')||/\.(md|markdown|txt|html|htm)$/i.test(lower)){ const text=await file.text(); assertTextImportBudget(text,file.name); pages.push(...importTextNote(text,file.name,file.type).sections[0]!.pages); continue; }
    binaryAttachments.push(await fileToNoteAttachment(file,binaryAttachments));
    if(pages.length+binaryAttachments.length>MAX_NOTES_IMPORT_JSON_PAGES) throw new Error('Import exceeds the bounded Notes object limit.');
  }
  if(binaryAttachments.length) { const page=pageFromText('Imported attachments','Imported binary attachments are embedded below.',['imported','attachments']); page.attachments=binaryAttachments; pages.push(page); }
  if(!pages.length) throw new Error('No supported note content found.');
  return normalizeNoteNotebook({id:createNoteEntityId('nb'),title:'Imported Notes',sections:[{id:createNoteEntityId('sec'),title:'Imported',pages,createdAt:now,updatedAt:now}],createdAt:now,updatedAt:now});
}
