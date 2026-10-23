// STATUS: PLATIN — BATCH-D wiring contract: restore, comment anchor, ZIP import, web clip, selection, offline.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const notesDirectory = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, notesDirectory), 'utf8');

const manager = read('notebooks/useNotesManager.ts');
const controller = read('editor/useNotesEditorController.ts');
const overlays = read('editor/NotesEditorOverlays.tsx');
const modals = read('editor/modals/NotesEditorModals.tsx');
const collaborationModal = read('collaboration/NotesCollaborationModal.tsx');
const importExport = read('interchange/notesImportExport.ts');
const importExportModal = read('interchange/NotesImportExportModal.tsx');
const crossAppModal = read('integrations/NotesCrossAppModal.tsx');
const integration = read('integrations/useNotesWorkspaceIntegration.ts');
const body = read('editor/NotesEditorBody.tsx');

describe('AST-0716/DEF-NOTES-004 revision restore wiring', () => {
  it('restores through the safety-revision plan, never a raw overwrite', () => {
    expect(manager).toContain("import { planRevisionRestore } from '../history/notesRevisionRestore';");
    expect(manager).toContain('const plan = planRevisionRestore(activePage, revision);');
    expect(manager).toContain('const safety: NotePageRevision = { ...plan.safetyRevision, id: createNoteEntityId(\'rev\') };');
    expect(manager).toContain('revisions: [...(page.revisions ?? []), safety].slice(-MAX_NOTE_REVISIONS)');
    expect(manager).toContain('const handleRestoreRevision = (revision: NotePageRevision): NoteMutationOutcome => {');
  });

  it('routes the history modal through the restoring handler', () => {
    expect(modals).toContain('onRestoreVersion={onRestoreVersion ??');
    expect(overlays).toContain('onRestoreVersion={handleRestoreRevision}');
    expect(controller).toContain('const handleRestoreRevision = (revision: NotePageRevision) => reportOutcome(() => notes.handleRestoreRevision(revision));');
    // The old direct overwrite must be gone.
    expect(overlays).not.toContain('onUpdateCurrentPage({ title: revision.title');
  });
});

describe('AST-0721 comment selection anchor wiring', () => {
  it('reads the body selection and passes it into the comment', () => {
    expect(controller).toContain('const readBodySelection = (): string | null => {');
    expect(controller).toContain('return end > start ? textarea.value.slice(start, end) : null;');
    expect(controller).toContain('reportOutcome(() => notes.handleAddComment({ selection: readBodySelection(), body }, authorId, authorName, parentId))');
    expect(manager).toContain('const anchored = buildSelectionCommentBody(input.selection, input.body);');
  });

  it('offers the anchor in the modal and shows it in the thread', () => {
    expect(collaborationModal).toContain('selectionText?: () => string | null;');
    expect(collaborationModal).toContain('Comment on body selection');
    expect(collaborationModal).toContain('parseSelectionComment(root.body).selection');
    expect(overlays).toContain('selectionText={readBodySelection}');
    expect(collaborationModal).toContain('aria-label="Comment text"');
  });
});

describe('AST-0726/AST-0727 (W-343) ZIP consolidation and import wiring', () => {
  it('deleted the duplicate STORED-ZIP writer and its private CRC table', () => {
    expect(importExport).toContain("import { decodeUtf8, readZip, writeStoredZip, type ZipReadLimits } from '../../../platform/interop/zip';");
    expect(importExport).toContain('return writeStoredZip([...files.entries()].map(([name, data]) => ({ name, data })));');
    // The W-343 duplicate must be gone, not merely unused.
    expect(importExport).not.toContain('let crc = 0xffffffff;');
    expect(importExport).not.toContain('0xedb88320');
    expect(importExport).not.toContain('0x02014b50');
    expect(importExport).not.toContain('0x06054b50');
  });

  it('implements the missing import half through the canonical reader', () => {
    // **W-433:** hier stand die **wörtliche Signatur** von `importMarkdownFolderZip` — ein zusätzlicher,
    // optionaler Parameter (`preReadEntries`, damit der eine Ordner-Eingang das Archiv **einmal** liest) machte
    // die Zusicherung rot, obwohl die Eigenschaft unverändert gilt. *Ein Vertrag muss die Eigenschaft pinnen,
    // nicht die Schreibweise.* Geprüft wird jetzt: beide Leser existieren, der eine Eingang entscheidet über die
    // Kennung, und gelesen wird durch den **einen** Archiv-Leser mit der **einen** Lese-Politik.
    expect(importExport).toContain('export async function importMarkdownFolderZip(bytes: Uint8Array, preReadEntries?: ReadonlyMap<string, Uint8Array>): Promise<NoteNotebook> {');
    expect(importExport).toContain('export async function importHtmlFolderZip(');
    expect(importExport).toContain('export async function importNotesFolderZip(');
    expect(importExport).toContain('const entries = preReadEntries ?? await readZip(bytes, NOTES_MARKDOWN_FOLDER_ZIP_LIMITS);');
    expect(importExport).toContain('throw new Error(\'The archive has no Astraea Notes Markdown-folder manifest.\');');
    expect(importExport).toContain('throw new Error(\'The archive has no Astraea Notes HTML-folder manifest.\');');
    expect(importExport).toContain('throw new Error(\'Notes archive exceeds the page limit.\');');
    expect(importExport).toContain('export function restoreWikiLinksFromMarkdown(');
    expect(importExport).toContain('export function restoreWikiLinksFromHtml(');
    expect(importExport).toContain('const content = restoreWikiLinksFromMarkdown(entry.body, archivePaths, entry.path);');
    // **vorher toter Code, jetzt verdrahtet** (der HTML-Ordner-Leser ist sein erster Aufrufer).
    expect(importExport).toContain('const withLinks = restoreWikiLinksFromHtml(html, archivePaths, entry.path);');
  });

  it('accepts the exported archive back in the import modal', () => {
    expect(importExportModal).toContain('.notes.json,.zip');
    expect(importExport).toContain("if (files.length === 1 && /\\.zip$/i.test(files[0].name)) {");
  });

  it('emits ZIP-safe paths so a reserved note title cannot break the whole export', () => {
    expect(importExport).toContain('const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$/iu;');
    expect(importExport).toContain("return WINDOWS_RESERVED_BASENAME.test(clean) ? `_${clean}` : clean;");
    expect(importExport).toContain('.replace(/[. ]+$/g, \'\')');
  });
});

describe('AST-0731 web clip wiring', () => {
  it('sanitises locally and imports as an editable note', () => {
    expect(importExportModal).toContain("import { NOTE_CLIP_MAX_INPUT_CHARS, notePageFromClip, sanitizeNoteClip } from './notesHtmlClip';");
    expect(importExportModal).toContain('const clip=sanitizeNoteClip(clipHtml,{ title: page ? `${page.title} clip` : undefined });');
    expect(importExportModal).toContain('aria-label="HTML fragment to sanitise"');
    expect(importExportModal).toContain('Sanitise and import');
    expect(importExportModal).toContain('Removed active or remote content:');
    expect(importExportModal).toContain('role="status" aria-live="polite"');
  });
});

describe('AST-0736 selection transfer to Writer wiring', () => {
  it('sends the selected passage with a source link when one exists', () => {
    expect(integration).toContain("import {\n  createWriterDraftFromNote,\n  createWriterDraftFromSelection,");
    expect(integration).toContain('? createWriterDraftFromSelection(sourceDocument, page, selection)');
    expect(integration).toContain('created from the selected passage with a canonical source-note link.');
    expect(crossAppModal).toContain('selectionText?: () => string | null;');
    expect(crossAppModal).toContain('Use current body selection');
    expect(crossAppModal).toContain("onCreateWriterDraft(selection || undefined)");
    expect(overlays).toContain('selectionText={readBodySelection}');
  });
});

describe('AST-0741 offline/local-first wiring', () => {
  it('renders the connectivity as named text, not colour', () => {
    expect(body).toContain("import { resolveNotesOfflineState } from '../model/notesOfflinePolicy';");
    expect(body).toContain('data-notes-connectivity={offlineState.connectivity}');
    expect(body).toContain('{offlineState.label}');
    expect(body).toContain("window.addEventListener('offline', sync);");
    expect(body).toContain("window.addEventListener('online', sync);");
  });

  it('states in the audit list that no Notes operation needs the network', () => {
    const policy = read('model/notesOfflinePolicy.ts');
    expect(policy).toContain('export const NOTES_NETWORK_OPERATIONS: readonly string[] = Object.freeze([]);');
  });
});
