// STATUS: PLATIN — BATCH-D: revision restore, comment anchors, ZIP roundtrip, web clips, selection transfer, offline state.
import { describe, expect, it } from 'vitest';
import type { NoteCanvasState, NotePage, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { createPageRevision, normalizeNoteNotebook } from '../../../model/notesHierarchy';
import { NOTE_RESTORE_SAFETY_PREFIX, planRevisionRestore } from '../../../history/notesRevisionRestore';
import {
  buildSelectionCommentBody,
  describeCommentAnchor,
  normalizeCommentSelection,
  parseSelectionComment,
} from '../../../collaboration/notesCommentAnchor';
import {
  buildMarkdownFolder,
  buildScopedNotesExport,
  buildStoreZip,
  importMarkdownFolderZip,
  restoreWikiLinksFromHtml,
  restoreWikiLinksFromMarkdown,
  type NotesExportScope,
} from '../../../interchange/notesImportExport';
import { NOTE_CLIP_MAX_INPUT_CHARS, notePageFromClip, sanitizeNoteClip } from '../../../interchange/notesHtmlClip';
import { createWriterDraftFromSelection, NOTE_SELECTION_MAX_CHARS } from '../../../integrations/notesWorkspaceActions';
import { NOTES_NETWORK_OPERATIONS, notesRequireNetwork, resolveNotesOfflineState } from '../../../model/notesOfflinePolicy';
import { readZip } from '../../../../../platform/interop/zip';

const canvas: NoteCanvasState = {
  pageMode: 'infinite', pageSize: 'A4', background: 'grid', backgroundColor: '#0a0d14',
  blocks: [{ id: 'b1', kind: 'text', x: 10, y: 20, width: 320, height: 160, zIndex: 1, text: 'card' }],
};

function page(overrides: Partial<NotePage> = {}): NotePage {
  return {
    id: 'page-1', title: 'Finding', content: 'current text', tags: ['research'], backlinks: [],
    properties: { status: 'draft' }, editorMode: 'document', created_at: 1, last_modified: 1_700_000_000_000, revisions: [], ...overrides,
  };
}

describe('AST-0716/DEF-NOTES-004 revision restore without losing newer text', () => {
  it('a revision now carries the editor mode and the canvas', () => {
    const revision = createPageRevision(page({ editorMode: 'freeform', canvas }), 5);
    expect(revision.editorMode).toBe('freeform');
    expect(revision.canvas).toEqual(canvas);
    const plain = createPageRevision(page({ editorMode: 'document', canvas: undefined }), 5);
    expect(plain.editorMode).toBe('document');
    expect(plain.canvas).toBeUndefined();
  });

  it('plans a restore that keeps the current text as a named safety revision', () => {
    const current = page({ content: 'NEWER text' });
    const revision = { ...createPageRevision(page({ content: 'OLDER text' }), 1_600_000_000_000) };
    const plan = planRevisionRestore(current, revision, 1_700_000_000_000)!;
    expect(plan.patch.content).toBe('OLDER text');
    expect(plan.safetyRevision.content).toBe('NEWER text');
    expect(plan.safetyRevision.name?.startsWith(NOTE_RESTORE_SAFETY_PREFIX)).toBe(true);
    expect(plan.summary).toContain('safety revision');
  });

  it('restores the freeform mode and canvas of a canvas revision', () => {
    const current = page({ editorMode: 'document' });
    const revision = createPageRevision(page({ editorMode: 'freeform', canvas }), 1);
    const plan = planRevisionRestore(current, revision)!;
    expect(plan.patch.editorMode).toBe('freeform');
    expect(plan.patch.canvas).toEqual(canvas);
  });

  it('refuses an identical revision so no no-op safety revision is written', () => {
    const current = page();
    expect(planRevisionRestore(current, createPageRevision(current, 3))).toBeNull();
  });

  it('is hostile-input safe', () => {
    expect(planRevisionRestore(page(), undefined as never)).toBeNull();
    expect(planRevisionRestore(page(), { id: '', timestamp: 0, title: 'x', content: 'y', tags: [] })).toBeNull();
    const plan = planRevisionRestore(page(), { id: 'r', timestamp: 0, title: '', content: undefined as never, tags: undefined as never });
    expect(plan?.patch.title).toBe('Untitled Note');
    expect(plan?.patch.content).toBe('');
    expect(plan?.patch.tags).toEqual([]);
  });
});

describe('AST-0721 comment anchored to the selected passage', () => {
  it('stores a bounded quote line followed by the author text and reads it back', () => {
    const anchored = buildSelectionCommentBody('  the  selected\npassage ', 'My note');
    expect(anchored.selection).toBe('the selected passage');
    expect(anchored.body).toBe('> the selected passage\n\nMy note');
    expect(parseSelectionComment(anchored.body)).toEqual({ selection: 'the selected passage', body: 'My note' });
  });

  it('keeps a general comment unchanged and tolerates a hand-edited body', () => {
    expect(buildSelectionCommentBody(null, 'Just a comment')).toEqual({ selection: null, body: 'Just a comment' });
    expect(parseSelectionComment('Just a comment')).toEqual({ selection: null, body: 'Just a comment' });
    expect(parseSelectionComment('> only a quote')).toEqual({ selection: 'only a quote', body: '' });
    expect(parseSelectionComment('')).toEqual({ selection: null, body: '' });
  });

  it('bounds the stored selection and never lets it break the quote marker', () => {
    const long = 'x'.repeat(2_000);
    expect(normalizeCommentSelection(long)?.length).toBe(512);
    expect(normalizeCommentSelection('> > nested')).toBe('> nested');
    expect(normalizeCommentSelection('\n\n')).toBeNull();
    expect(normalizeCommentSelection(undefined)).toBeNull();
    expect(buildSelectionCommentBody('a'.repeat(600), 'b').body.split('\n')[0].length).toBeLessThan(600);
  });

  it('describes the anchor for the comment list', () => {
    expect(describeCommentAnchor({ body: '> short\n\nx' })).toBe('“short”');
    expect(describeCommentAnchor({ body: '> ' + 'y'.repeat(100) + '\n\nx' })?.endsWith('…”')).toBe(true);
    expect(describeCommentAnchor({ body: 'no anchor' })).toBeNull();
  });
});

describe('AST-0726/AST-0727 Markdown folder roundtrip through the canonical ZIP reader', () => {
  const notebook = normalizeNoteNotebook({
    id: 'nb', title: 'Research Notebook', createdAt: 1, updatedAt: 1, trashedAt: null,
    sections: [{
      id: 'sec', title: 'Evidence', createdAt: 1, updatedAt: 1, trashedAt: null,
      pages: [
        page({ id: 'p1', title: 'Finding 01', content: 'See [[Finding 02]].' }),
        page({ id: 'p2', title: 'Finding 02', content: 'Back to [[Finding 01]].' }),
      ],
    }],
  });
  const scope: NotesExportScope = { kind: 'notebook', notebook };

  it('writes the folder with the canonical STORED-ZIP writer and reads it back', async () => {
    const zip = buildStoreZip(buildMarkdownFolder(scope));
    const entries = await readZip(zip);
    expect([...entries.keys()].filter((name) => name.endsWith('.md'))).toHaveLength(2);
    expect(entries.has('astraea-notes-manifest.json')).toBe(true);
  });

  it('restores relative Markdown links to canonical wiki links on import', async () => {
    const zip = buildStoreZip(buildMarkdownFolder(scope));
    const imported = await importMarkdownFolderZip(zip);
    const pages = imported.sections.flatMap((section) => section.pages);
    expect(pages).toHaveLength(2);
    expect(pages.map((entry) => entry.title).sort()).toEqual(['Finding 01', 'Finding 02']);
    expect(pages.find((entry) => entry.title === 'Finding 01')?.content).toContain('[[Finding 02]]');
    expect(pages.find((entry) => entry.title === 'Finding 01')?.content).not.toContain('](Finding');
    expect(imported.sections[0].title).toBe('Evidence');
    expect(imported.title).toBe('Research Notebook');
  });

  it('refuses a mismatched or missing manifest instead of partially importing', async () => {
    const withoutManifest = buildStoreZip(new Map([['Evidence/x.md', new TextEncoder().encode('# x')]]));
    await expect(importMarkdownFolderZip(withoutManifest)).rejects.toThrowError(/manifest/);
    const wrongFormat = buildStoreZip(new Map([['astraea-notes-manifest.json', new TextEncoder().encode('{"format":"other","version":1,"pages":[]}')]]));
    await expect(importMarkdownFolderZip(wrongFormat)).rejects.toThrowError(/Unsupported/);
    const noPages = buildStoreZip(new Map([['astraea-notes-manifest.json', new TextEncoder().encode('{"format":"astraea-notes-markdown-folder","version":1,"pages":[]}')]]));
    await expect(importMarkdownFolderZip(noPages)).rejects.toThrowError(/no pages/);
  });

  it('restores HTML links and inline images without a DOM', () => {
    const paths = new Map([['Evidence/Finding 02.html', 'Finding 02']]);
    expect(restoreWikiLinksFromHtml('<a href="Finding 02.html">Finding 02</a>', paths, 'Evidence/Finding 01.html')).toBe('[[Finding 02]]');
    expect(restoreWikiLinksFromHtml('<a href="https://example.com">ext</a>', paths, 'Evidence/Finding 01.html')).toBe('<a href="https://example.com">ext</a>');
    const images = new Map([['attachments/scan.png', 'scan']]);
    expect(restoreWikiLinksFromHtml('<img src="../attachments/scan.png">', images, 'Evidence/Finding 01.html')).toBe('![[scan]]');
    expect(restoreWikiLinksFromHtml('<img src="data:image/png;base64,AAAA">', images, 'Evidence/Finding 01.html')).toBe('<img src="data:image/png;base64,AAAA">');
    expect(restoreWikiLinksFromMarkdown('[x](Finding 02.md)', new Map([['Evidence/Finding 02.md', 'Finding 02']]), 'Evidence/Finding 01.md')).toBe('[[Finding 02]]');
    expect(restoreWikiLinksFromMarkdown('[x](../Other/Finding 03.md)', new Map([['Other/Finding 03.md', 'Finding 03']]), 'Evidence/Finding 01.md')).toBe('[[Finding 03]]');
    expect(restoreWikiLinksFromMarkdown('[x](https://example.com)', new Map(), 'Evidence/Finding 01.md')).toBe('[x](https://example.com)');
    expect(restoreWikiLinksFromMarkdown('[x](gone.md)', new Map(), 'Evidence/Finding 01.md')).toBe('[x](gone.md)');
  });

  it('keeps the structured-JSON export unchanged (regression guard)', () => {
    const artifact = buildScopedNotesExport(scope, 'json');
    expect(artifact.filename).toContain('.notes.json');
  });

  it('emits ZIP-safe paths, so a reserved section title cannot break the whole export', async () => {
    // `platform/interop/zip` rejects Windows device names and trailing dots/spaces; without the exporter's
    // guard the canonical writer would throw and the entire notebook export would fail.
    const hostile = normalizeNoteNotebook({
      id: 'nb-hostile', title: 'Hostile', createdAt: 1, updatedAt: 1, trashedAt: null,
      sections: [
        { id: 's1', title: 'con', pages: [page({ id: 'h1', title: 'nul', content: 'x' })], createdAt: 1, updatedAt: 1, trashedAt: null },
        { id: 's2', title: 'trailing.', pages: [page({ id: 'h2', title: 'lpt1 ', content: 'y' })], createdAt: 1, updatedAt: 1, trashedAt: null },
      ],
    });
    const zip = buildStoreZip(buildMarkdownFolder({ kind: 'notebook', notebook: hostile }));
    const entries = await readZip(zip);
    const names = [...entries.keys()];
    expect(names.filter((name) => name.endsWith('.md'))).toHaveLength(2);
    expect(names).toContain('_con/_nul.md');
    expect(names).toContain('trailing/_lpt1.md');
    const imported = await importMarkdownFolderZip(zip);
    expect(imported.sections.flatMap((section) => section.pages)).toHaveLength(2);
  });
});

describe('AST-0731 web clip sanitised locally into an editable note', () => {
  it('converts a simple fragment to Markdown with a derived title', () => {
    const clip = sanitizeNoteClip('<article><h1>Zero-Cloud Notes</h1><p>Local <strong>first</strong> text.</p></article>');
    expect(clip.title).toBe('Zero-Cloud Notes');
    expect(clip.markdown).toContain('# Zero-Cloud Notes');
    expect(clip.markdown).toContain('Local first text.');
    expect(clip.sanitized).toBe(false);
  });

  it('drops active and remote content and names what was removed', () => {
    const clip = sanitizeNoteClip('<p onclick="alert(1)">Hi</p><script>steal()</script><iframe src="https://evil"></iframe><img src="https://evil/x.png"><img src="data:image/png;base64,iVBORw0KGgo=" alt="ok">');
    expect(clip.sanitized).toBe(true);
    expect(clip.markdown).not.toContain('steal');
    expect(clip.markdown).not.toContain('evil');
    expect(clip.markdown).toContain('Hi');
    expect(clip.markdown).toContain('![ok](data:image/png;base64,');
    expect(clip.removedElements).toContain('script');
    expect(clip.removedElements).toContain('p[event]');
  });

  it('keeps only policy-approved links and converts them to Markdown', () => {
    const clip = sanitizeNoteClip('<p><a href="https://example.com/x">good</a> and <a href="javascript:alert(1)">bad</a></p>');
    expect(clip.markdown).toContain('[good](https://example.com/x)');
    expect(clip.markdown).not.toContain('javascript:');
    expect(clip.links).toBe(1);
  });

  it('bounds the input and the output and never throws', () => {
    const huge = `<p>${'x'.repeat(NOTE_CLIP_MAX_INPUT_CHARS + 5_000)}</p>`;
    const clip = sanitizeNoteClip(huge);
    expect(clip.markdown.length).toBeLessThanOrEqual(400_000);
    expect(() => sanitizeNoteClip(undefined as unknown as string)).not.toThrow();
    expect(sanitizeNoteClip('').markdown).toBe('');
    expect(sanitizeNoteClip('<div><span></div>').title).toBe('Web clip');
  });

  it('wraps the clip into a note payload and states the removals in the note itself', () => {
    const clip = sanitizeNoteClip('<h2>Clip</h2><script>x</script><p>Body</p>');
    const note = notePageFromClip(clip);
    expect(note.title).toBe('Clip');
    expect(note.tags).toEqual(['web-clip']);
    expect(note.content).toContain('Body');
    expect(note.content).toContain('Web clip sanitised locally');
    expect(notePageFromClip(clip, ['Custom', 'custom']).tags).toEqual(['custom']);
  });
});

describe('AST-0736 selection transfer to Writer', () => {
  const source = { id: 'doc-notes', kind: 'Notes', title: 'Notes', version: 4 } as WorkspaceDocument;

  it('creates a Writer draft from the selection with a source link', () => {
    const result = createWriterDraftFromSelection(source, page(), 'line one\nline two');
    const textBlock = Object.values(result.draft.objects).find((object) => object.type === 'TextBlock') as { data: { paragraphs: Array<{ spans: Array<{ text: string }> }> } };
    const texts = textBlock.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text));
    expect(texts.some((text) => text.includes('Selection from “Finding”'))).toBe(true);
    expect(texts).toContain('line one');
    expect(texts).toContain('line two');
    expect(texts.some((text) => text.includes('vgt://workspace/document/doc-notes/notes/page/page-1'))).toBe(true);
    expect(result.draft.title).toContain('selection');
    expect(result.page.workspaceLinks?.some((link) => link.relation === 'writer-draft')).toBe(true);
  });

  it('refuses an empty selection and bounds a huge one', () => {
    expect(() => createWriterDraftFromSelection(source, page(), '   ')).toThrowError(/Select a passage/);
    const result = createWriterDraftFromSelection(source, page(), 'x'.repeat(NOTE_SELECTION_MAX_CHARS + 500));
    expect(result.draft.id).toMatch(/^writer-from-selection-/);
  });
});

describe('AST-0741 offline-first state', () => {
  it('states that no Notes operation needs the network', () => {
    expect(NOTES_NETWORK_OPERATIONS).toEqual([]);
    expect(notesRequireNetwork()).toBe(false);
  });

  it('names the connectivity in text, not colour', () => {
    expect(resolveNotesOfflineState({ onLine: false, protectedNote: false }).label).toBe('Offline');
    expect(resolveNotesOfflineState({ onLine: false, protectedNote: false }).localOnly).toBe(true);
    expect(resolveNotesOfflineState({ onLine: true, protectedNote: false }).label).toBe('Online');
    expect(resolveNotesOfflineState({ onLine: true, protectedNote: true }).detail).toContain('additional-unlock');
    expect(resolveNotesOfflineState({ onLine: undefined, protectedNote: false }).label).toContain('unknown');
    for (const state of [
      resolveNotesOfflineState({ onLine: true, protectedNote: false }),
      resolveNotesOfflineState({ onLine: false, protectedNote: false }),
      resolveNotesOfflineState({ onLine: undefined, protectedNote: false }),
    ]) {
      expect(state.detail.length).toBeGreaterThan(20);
      expect(state.localOnly).toBe(true);
    }
  });
});
