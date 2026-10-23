// STATUS: PLATIN — BATCH-E: dialog keyboard contract, search-index boundary, full notebook acceptance.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { NotesSearchIndexNotice } from '../../../navigation/NotesPagesList';
import { measureNotesSearchIndexBoundary, projectUnlockedNotebooks, protectionKey } from '../../../security/notesSecurity';
import { normalizeNoteNotebook } from '../../../model/notesHierarchy';
import { buildKnowledgeIndex, reconcileKnowledgeNotebooks } from '../../../knowledge-graph/notesKnowledgeGraph';
import { searchNotesDetailed } from '../../../search/notesSearchEngine';
import { planRevisionRestore } from '../../../history/notesRevisionRestore';
import { buildSelectionCommentBody } from '../../../collaboration/notesCommentAnchor';
import { buildMarkdownFolder, buildStoreZip, importMarkdownFolderZip, buildScopedNotesExport } from '../../../interchange/notesImportExport';
import { notePageFromClip, sanitizeNoteClip } from '../../../interchange/notesHtmlClip';
import { addNotePageCard, createNotePageDragPayload } from '../../../canvas/notesCanvasDrop';
import { createWriterDraftFromSelection } from '../../../integrations/notesWorkspaceActions';
import { readZip } from '../../../../../platform/interop/zip';

const NOTE_COUNT = 20;

function page(index: number, overrides: Partial<NotePage> = {}): NotePage {
  const title = `Finding ${String(index).padStart(2, '0')}`;
  const next = index < NOTE_COUNT - 1 ? `Finding ${String(index + 1).padStart(2, '0')}` : 'Method';
  return {
    id: `page-finding-${String(index).padStart(2, '0')}`,
    title,
    content: [`# ${title}`, '', `Evidence body ${index}.`, '', `See [[${next}]] and [[Method]].`].join('\n'),
    tags: index % 2 === 0 ? ['research', 'evidence'] : ['research'],
    backlinks: [],
    properties: { status: index % 3 === 0 ? 'reviewed' : 'draft' },
    attachments: index === 0 ? [{
      id: 'note-attachment-1', name: 'source.pdf', mimeType: 'application/pdf', sizeBytes: 8,
      dataUrl: `data:application/pdf;base64,${btoa('%PDF-1.7')}`, createdAt: 1,
    }] : [],
    created_at: 1_000 + index, last_modified: 1_000 + index, revisions: [], ...overrides,
  };
}

function notebook(): NoteNotebook {
  return normalizeNoteNotebook({
    id: 'nb-research', title: 'Research Notebook', createdAt: 1, updatedAt: 1, trashedAt: null,
    sections: [
      { id: 'sec-method', title: 'Method', createdAt: 1, updatedAt: 1, trashedAt: null, pages: [page(0, { id: 'page-method', title: 'Method', content: '# Method\n\nProtocol.' })] },
      { id: 'sec-evidence', title: 'Evidence', createdAt: 1, updatedAt: 1, trashedAt: null, pages: Array.from({ length: NOTE_COUNT }, (_, index) => page(index)) },
    ],
  });
}

describe('AST-0749 dialog contract: the search-index notice is announced, not colour-coded', () => {
  it('names the indexed, locked and sensitive counts in text', () => {
    const markup = renderToStaticMarkup(<NotesSearchIndexNotice boundary={{ indexedPages: 18, lockedPages: 2, sensitivePages: 1 }} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('18 note(s) indexed');
    expect(markup).toContain('2 locked and not indexed');
    expect(markup).toContain('1 sensitive without preview');
  });

  it('stays silent when nothing is withheld', () => {
    expect(renderToStaticMarkup(<NotesSearchIndexNotice boundary={{ indexedPages: 21, lockedPages: 0, sensitivePages: 0 }} />)).toBe('');
    expect(renderToStaticMarkup(<NotesSearchIndexNotice />)).toBe('');
  });

  it('still reports a sensitive-only boundary', () => {
    const markup = renderToStaticMarkup(<NotesSearchIndexNotice boundary={{ indexedPages: 21, lockedPages: 0, sensitivePages: 3 }} />);
    expect(markup).toContain('3 sensitive without preview');
    expect(markup).not.toContain('locked');
  });
});

describe('AST-0751/AST-0754 search and encryption boundary', () => {
  it('measures how many pages the index withholds', () => {
    const lockedPage = page(1, { id: 'page-locked', protection: { mode: 'additional-unlock', autoLockMinutes: 10, verifier: { algorithm: 'PBKDF2-SHA256', iterations: 210_000, saltBase64: 'AAAA', verifierBase64: 'BBBB' } } });
    const sensitive = page(2, { id: 'page-sensitive', sensitiveMode: true });
    const nb = normalizeNoteNotebook({
      id: 'nb', title: 'N', createdAt: 1, updatedAt: 1, trashedAt: null,
      sections: [{ id: 's', title: 'S', createdAt: 1, updatedAt: 1, trashedAt: null, pages: [page(0), lockedPage, sensitive] }],
    });
    const searchable = projectUnlockedNotebooks([nb], new Set<string>());
    const boundary = measureNotesSearchIndexBoundary([nb], searchable);
    expect(boundary.indexedPages).toBe(2);
    expect(boundary.lockedPages).toBe(1);
    expect(boundary.sensitivePages).toBe(1);

    // Unlocking the page moves it into the index; the boundary follows.
    const unlocked = projectUnlockedNotebooks([nb], new Set([protectionKey('page', 'page-locked')]));
    expect(measureNotesSearchIndexBoundary([nb], unlocked).lockedPages).toBe(0);
    expect(measureNotesSearchIndexBoundary([nb], unlocked).indexedPages).toBe(3);
  });

  it('never returns a locked page from a search over the projected set', () => {
    const lockedPage = page(1, {
      id: 'page-locked', content: 'UNIQUE-LOCKED-MARKER',
      protection: { mode: 'additional-unlock', autoLockMinutes: 10, verifier: { algorithm: 'PBKDF2-SHA256', iterations: 210_000, saltBase64: 'AAAA', verifierBase64: 'BBBB' } },
    });
    const nb = normalizeNoteNotebook({
      id: 'nb', title: 'N', createdAt: 1, updatedAt: 1, trashedAt: null,
      sections: [{ id: 's', title: 'S', createdAt: 1, updatedAt: 1, trashedAt: null, pages: [page(0), lockedPage] }],
    });
    const searchable = projectUnlockedNotebooks([nb], new Set<string>());
    expect(searchNotesDetailed(searchable, { query: 'UNIQUE-LOCKED-MARKER', scope: 'all' })).toEqual([]);
    expect(searchNotesDetailed(searchable, { query: '', scope: 'all' })).toHaveLength(1);
  });
});

describe('AST-0756…AST-0760 full notebook acceptance with the batch capabilities', () => {
  const base = reconcileKnowledgeNotebooks([notebook()], 1_700_000_000_000)[0];

  it('20 notes, tags, links and an attachment stay one coherent notebook', () => {
    const pages = base.sections.flatMap((section) => section.pages);
    expect(pages).toHaveLength(NOTE_COUNT + 1);
    const index = buildKnowledgeIndex([base]);
    expect(index.broken).toEqual([]);
    expect(index.orphans).toEqual([]);
    expect(index.edges.length).toBeGreaterThanOrEqual(NOTE_COUNT);
    const withAttachment = pages.find((entry) => (entry.attachments ?? []).length > 0);
    expect(withAttachment?.attachments?.[0].name).toBe('source.pdf');
  });

  it('a comment anchored to a selection survives alongside the tags and links', () => {
    const anchored = buildSelectionCommentBody('Evidence body 0.', 'Check this measurement.');
    const withComment = { ...base, sections: base.sections.map((section) => section.id !== 'sec-evidence' ? section : {
      ...section,
      pages: section.pages.map((entry) => entry.id !== 'page-finding-00' ? entry : {
        ...entry, comments: [{ id: 'c1', authorId: 'a', authorName: 'A', body: anchored.body, mentions: [], createdAt: 1, updatedAt: 1, resolvedAt: null }],
      }),
    }) };
    expect(withComment.sections[1].pages[0].comments?.[0].body).toContain('> Evidence body 0.');
    expect(buildKnowledgeIndex([withComment]).broken).toEqual([]);
  });

  it('a revision restores an earlier finding without losing the newer text', () => {
    const current = base.sections[1].pages[0];
    const earlier = { ...current, content: '# Finding 00\n\nEarlier evidence.' };
    const revision = { id: 'rev-1', timestamp: 1, title: earlier.title, content: earlier.content, tags: earlier.tags, properties: earlier.properties };
    const plan = planRevisionRestore(current, revision)!;
    expect(plan.patch.content).toBe(earlier.content);
    expect(plan.safetyRevision.content).toBe(current.content);
  });

  it('a web clip and a dropped canvas card integrate without breaking the graph', () => {
    const clip = sanitizeNoteClip('<h2>External source</h2><p>Quoted passage.</p>');
    const note = notePageFromClip(clip);
    const clipPage: NotePage = {
      id: 'page-clip', title: note.title, content: `${note.content}\n\nSee [[Finding 00]].`, tags: note.tags,
      backlinks: [], attachments: [], created_at: 9_000, last_modified: 9_000, revisions: [],
    };
    const extended = reconcileKnowledgeNotebooks([{
      ...base,
      sections: base.sections.map((section) => section.id !== 'sec-evidence' ? section : { ...section, pages: [...section.pages, clipPage] }),
    }], 9_000)[0];
    const index = buildKnowledgeIndex([extended]);
    expect(index.pages).toHaveLength(NOTE_COUNT + 2);
    expect(index.incoming.get('page-finding-00')?.length ?? 0).toBeGreaterThan(0);

    const canvas = addNotePageCard(undefined, createNotePageDragPayload(clipPage), { x: 40, y: 40 })!;
    const card = canvas.blocks[0];
    expect(card.kind).toBe('text');
    if (card.kind === 'text') expect(card.text).toBe('[[External source]]');
  });

  it('export → re-import preserves all pages, tags and links through the Markdown folder', async () => {
    const scope = { kind: 'notebook' as const, notebook: base };
    const zip = buildStoreZip(buildMarkdownFolder(scope));
    const entries = await readZip(zip);
    expect([...entries.keys()].filter((name) => name.endsWith('.md'))).toHaveLength(NOTE_COUNT + 1);
    const imported = await importMarkdownFolderZip(zip);
    const pages = imported.sections.flatMap((section) => section.pages);
    expect(pages).toHaveLength(NOTE_COUNT + 1);
    const finding00 = pages.find((entry) => entry.title === 'Finding 00')!;
    expect(finding00.content).toContain('[[Finding 01]]');
    expect(finding00.tags).toEqual(['research', 'evidence']);
    // The graph of the re-imported notebook is intact, not just the text.
    const reimportedIndex = buildKnowledgeIndex([reconcileKnowledgeNotebooks([imported], 1)[0]]);
    expect(reimportedIndex.broken).toEqual([]);
    expect(reimportedIndex.edges.length).toBeGreaterThanOrEqual(NOTE_COUNT);
  });

  it('the structured-JSON round trip is still payload-identical (save → close → reopen)', () => {
    const artifact = buildScopedNotesExport({ kind: 'notebook', notebook: base }, 'json');
    expect(artifact.bytes.byteLength).toBeGreaterThan(1_000);
    const payload = JSON.parse(new TextDecoder().decode(artifact.bytes)) as { notebook: NoteNotebook };
    const before = base.sections.flatMap((section) => section.pages.map((entry) => [entry.title, entry.content, entry.tags.join(',')]));
    const after = payload.notebook.sections.flatMap((section) => section.pages.map((entry) => [entry.title, entry.content, entry.tags.join(',')]));
    expect(after).toEqual(before);
  });

  it('a selected passage reaches Writer as a copy plus a link', () => {
    const source = { id: 'doc-notes', kind: 'Notes', title: 'Notes', version: 7 } as WorkspaceDocument;
    const result = createWriterDraftFromSelection(source, base.sections[1].pages[0], 'Evidence body 0.');
    const textBlock = Object.values(result.draft.objects).find((object) => object.type === 'TextBlock') as { data: { paragraphs: Array<{ spans: Array<{ text: string }> }> } };
    const texts = textBlock.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text));
    expect(texts).toContain('Evidence body 0.');
    expect(texts.some((text) => text.includes('vgt://workspace/document/doc-notes/notes/page/page-finding-00'))).toBe(true);
  });
});
