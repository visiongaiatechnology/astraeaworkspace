// STATUS: PLATIN — AST-0756…AST-0760: research notebook with 20 notes, tags, links and an attachment.
//
// AST-0756 acceptance: "Forschungsnotizbuch mit 20 Notizen, Tags, Links und Anhang produktiv nutzen."
// The visible browser/Tauri run stays NOT_TESTED; this suite exercises the real canonical path end to end at
// the domain/persistence level: hierarchy → knowledge graph → search → export → host-free ZIP read → re-import.
import { describe, expect, it } from 'vitest';
import type { NoteAttachment, NoteNotebook, NotePage, NoteSection } from '../../../../../shared/contracts/workspace';
import { buildKnowledgeIndex, reconcileKnowledgeNotebooks } from '../../../knowledge-graph/notesKnowledgeGraph';
import { normalizeNoteNotebook, sanitizeNoteTitle } from '../../../model/notesHierarchy';
import { searchNotesDetailed } from '../../../search/notesSearchEngine';
import {
  MAX_NOTES_IMPORT_JSON_PAGES,
  buildMarkdownFolder,
  buildScopedNotesExport,
  buildStoreZip,
  importStructuredNotesJson,
  type NotesExportScope,
} from '../../../interchange/notesImportExport';
import { notesExportFidelityWarnings } from '../../../interchange/notesExportFidelity';
import { readZip } from '../../../../../platform/interop/zip';

const NOTE_COUNT = 20;
const ATTACHMENT_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const ATTACHMENT: NoteAttachment = {
  id: 'note-attachment-research-paper',
  name: 'source-paper.pdf',
  mimeType: 'application/pdf',
  sizeBytes: ATTACHMENT_BYTES.byteLength,
  dataUrl: `data:application/pdf;base64,${base64(ATTACHMENT_BYTES)}`,
  createdAt: 1_700_000_000_000,
};

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function noteAttachmentWithPayload(): NoteAttachment {
  return { ...ATTACHMENT, dataUrl: `data:application/pdf;base64,${base64(ATTACHMENT_BYTES)}` };
}

function researchPage(index: number): NotePage {
  const title = `Finding ${String(index).padStart(2, '0')}`;
  const next = index < NOTE_COUNT - 1 ? `Finding ${String(index + 1).padStart(2, '0')}` : 'Method';
  const lines = [
    `# ${title}`,
    '',
    `Evidence body for research finding ${index}.`,
    '',
    `See [[${next}]] for the follow-up and [[Method]] for the protocol.`,
    '',
    '- [ ] Validate measurement',
    '- [x] Record source',
  ];
  if (index === 0) {
    lines.push('', 'Attachment: source-paper.pdf');
  }
  return {
    id: `page-finding-${String(index).padStart(2, '0')}`,
    title,
    content: lines.join('\n'),
    tags: index % 2 === 0 ? ['research', 'evidence'] : ['research'],
    backlinks: [],
    properties: { status: index % 3 === 0 ? 'reviewed' : 'draft', index },
    aliases: index === 0 ? ['First finding'] : [],
    attachments: index === 0 ? [noteAttachmentWithPayload()] : [],
    created_at: 1_700_000_000_000 + index * 1_000,
    last_modified: 1_700_000_000_000 + index * 1_000,
    pinned: index === 0,
    favorite: index === 1,
    revisions: [],
    parentPageId: index >= 2 && index % 4 === 2 ? 'page-finding-00' : null,
  };
}

function researchNotebook(): NoteNotebook {
  const method: NotePage = {
    id: 'page-method', title: 'Method', content: '# Method\n\nProtocol linked back from [[First finding]].',
    tags: ['research', 'method'], backlinks: [], created_at: 1, last_modified: 1, revisions: [],
  };
  const evidence: NoteSection = {
    id: 'sec-evidence', title: 'Evidence', createdAt: 1, updatedAt: 1, trashedAt: null,
    pages: Array.from({ length: NOTE_COUNT }, (_, index) => researchPage(index)),
  };
  return normalizeNoteNotebook({
    id: 'nb-research', title: 'Research Notebook', createdAt: 1, updatedAt: 1, trashedAt: null,
    sections: [
      { id: 'sec-method', title: 'Method', pages: [method], createdAt: 1, updatedAt: 1, trashedAt: null },
      evidence,
    ],
  });
}

const notebook = reconcileKnowledgeNotebooks([researchNotebook()], 1_700_000_000_000)[0]!;
const scope: NotesExportScope = { kind: 'notebook', notebook };

describe('AST-0756 notebook acceptance: 20 notes, tags, links and an attachment', () => {
  it('keeps all 20 notes plus the method page in the canonical hierarchy', () => {
    const pages = notebook.sections.flatMap((section) => section.pages);
    expect(pages).toHaveLength(NOTE_COUNT + 1);
    expect(notebook.sections.map((section) => section.title)).toEqual(['Method', 'Evidence']);
    const nested = pages.filter((page) => page.parentPageId === 'page-finding-00');
    expect(nested.length).toBeGreaterThan(0);
  });

  it('resolves internal [[links]] into stable-ID edges and immediate backlinks', () => {
    const index = buildKnowledgeIndex([notebook]);
    expect(index.broken).toEqual([]);
    expect(index.edges.length).toBeGreaterThanOrEqual(NOTE_COUNT);
    // "First finding" is an alias of Finding 00, so Method links back through a stable ID.
    expect(index.incoming.get('page-finding-00')?.length ?? 0).toBeGreaterThan(0);
    const finding00 = index.pages.find((entry) => entry.page.id === 'page-finding-00')?.page;
    expect(finding00?.backlinks).toContain('page-method');
    expect(index.orphans.length).toBe(0);
    expect(index.referenceCounts.get('page-finding-00')?.incoming).toBeGreaterThan(0);
  });

  it('finds notes by structured property, tag and text with highlighted ranges', () => {
    const byProperty = searchNotesDetailed([notebook], { query: 'prop:status=reviewed', scope: 'notebook', activeNotebookId: 'nb-research' });
    expect(byProperty.length).toBeGreaterThan(0);
    expect(byProperty.every((result) => result.page.properties?.status === 'reviewed')).toBe(true);

    const byTag = searchNotesDetailed([notebook], { query: 'tag:evidence', scope: 'notebook', activeNotebookId: 'nb-research' });
    expect(byTag.length).toBeGreaterThan(0);
    expect(byTag.every((result) => result.page.tags.includes('evidence'))).toBe(true);

    const byText = searchNotesDetailed([notebook], { query: '"research finding 7"', scope: 'notebook', activeNotebookId: 'nb-research' });
    expect(byText).toHaveLength(1);
    expect(byText[0].hits.length).toBeGreaterThan(0);
  });

  it('exports the note tree as a Markdown folder that a hostile-archive reader accepts', async () => {
    const folder = buildMarkdownFolder(scope);
    const zipBytes = buildStoreZip(folder);
    const entries = await readZip(zipBytes);

    const markdownNames = [...entries.keys()].filter((name) => name.endsWith('.md'));
    expect(markdownNames).toHaveLength(NOTE_COUNT + 1);
    expect(entries.has('astraea-notes-manifest.json')).toBe(true);

    const manifest = JSON.parse(new TextDecoder().decode(entries.get('astraea-notes-manifest.json'))) as { format: string; version: number; pages: unknown[] };
    expect(manifest.format).toBe('astraea-notes-markdown-folder');
    expect(manifest.version).toBe(1);
    expect(manifest.pages).toHaveLength(NOTE_COUNT + 1);

    // The attachment payload travels with the archive under its own bounded entry.
    const attachmentName = [...entries.keys()].find((name) => name.startsWith('attachments/'));
    expect(attachmentName).toBeDefined();
    expect([...(entries.get(attachmentName!) ?? [])]).toEqual([...ATTACHMENT_BYTES]);

    // Internal links become relative Markdown links instead of being dropped.
    const finding00 = [...entries.entries()].find(([name]) => name.endsWith('Finding 00.md'));
    const text = new TextDecoder().decode(finding00?.[1]);
    expect(text).toContain('[Finding 01](');
    expect(text).not.toContain('[[Finding 01]]');
  });

  it('preserves every note payload through export → close → reopen (structured JSON)', () => {
    const artifact = buildScopedNotesExport(scope, 'json');
    const reopened = importStructuredNotesJson(new TextDecoder().decode(artifact.bytes));

    const before = notebook.sections.flatMap((section) => section.pages.map((page) => ({
      title: page.title, content: page.content, tags: [...page.tags].sort(), properties: page.properties ?? {},
    })));
    const after = reopened.sections.flatMap((section) => section.pages.map((page) => ({
      title: page.title, content: page.content, tags: [...page.tags].sort(), properties: page.properties ?? {},
    })));
    expect(after).toHaveLength(before.length);
    expect(after).toEqual(before);
    expect(reopened.title).toBe('Research Notebook');
  });

  it('reports every fidelity loss instead of silently dropping it', () => {
    const warnings = notesExportFidelityWarnings(scope, 'markdown-folder');
    // The Markdown folder carries attachments, so it must not warn about them; protection is absent here.
    expect(warnings.some((warning) => warning.includes('Attachments are not embedded'))).toBe(false);
    const htmlWarnings = notesExportFidelityWarnings(scope, 'html');
    expect(htmlWarnings.some((warning) => warning.includes('Attachments are not embedded'))).toBe(true);
    expect(notesExportFidelityWarnings(scope, 'json')).toEqual([]);
  });

  it('refuses an archive that exceeds the bounded page budget instead of truncating silently', () => {
    const oversized: NoteNotebook = {
      id: 'nb-huge', title: 'Huge', createdAt: 1, updatedAt: 1, trashedAt: null,
      sections: [{
        id: 'sec-huge', title: 'Huge section', createdAt: 1, updatedAt: 1, trashedAt: null,
        pages: Array.from({ length: MAX_NOTES_IMPORT_JSON_PAGES + 1 }, (_, index) => ({
          id: `p-${index}`, title: sanitizeNoteTitle(`Page ${index}`, 'Page'), content: '', tags: [], backlinks: [], last_modified: 1, revisions: [],
        })),
      }],
    };
    const payload = JSON.stringify({ format: 'astraea-notes-json', version: 1, notebook: oversized });
    expect(() => importStructuredNotesJson(payload)).toThrowError(/page limit/);
  });

  it('does not let a locked note leak into the searchable projection', () => {
    const locked: NoteNotebook = {
      ...notebook,
      sections: notebook.sections.map((section, sectionIndex) => sectionIndex === 1
        ? { ...section, pages: section.pages.map((page, pageIndex) => pageIndex === 0 ? { ...page, sensitiveMode: true } : page) }
        : section),
    };
    const results = searchNotesDetailed([locked], { query: '', scope: 'notebook', activeNotebookId: 'nb-research' });
    const sensitive = results.find((result) => result.page.id === 'page-finding-00');
    expect(sensitive?.hits[0]?.text).toBe('Sensitive note preview hidden');
    expect(sensitive?.hits[0]?.ranges).toEqual([]);
  });
});
