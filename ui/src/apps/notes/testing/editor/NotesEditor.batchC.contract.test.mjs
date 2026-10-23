// STATUS: PLATIN — BATCH-C wiring contract: canvas keyboard + note drop, ink zoom, attachment zoom, audio file, Vault source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const notesDirectory = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, notesDirectory), 'utf8');

const canvas = read('canvas/NotesFreeCanvas.tsx');
const inkModal = read('canvas/ink/NotesInkCanvasModal.tsx');
const previewModal = read('media/NotesAttachmentPreviewModal.tsx');
const audioModal = read('media/audio/NotesAudioMemoModal.tsx');
const pagesList = read('navigation/NotesPagesList.tsx');
const embed = read('integrations/notesWorkspaceEmbed.ts');
const renderer = read('editor/markdown/markdownRenderer.tsx');
const manager = read('notebooks/useNotesManager.ts');
const noteModel = read('model/noteModel.ts');

describe('AST-0686 canvas keyboard and note-page drop', () => {
  it('owns the canvas keyboard meaning in the pure resolver', () => {
    expect(canvas).toContain("import { nextCanvasBlockId, resolveCanvasKeyboardCommand } from './notesCanvasKeyboard';");
    expect(canvas).toContain('const command = resolveCanvasKeyboardCommand({');
    expect(canvas).toContain('onKeyDown={(event) => handleBlockKeyDown(event, block)}');
    expect(canvas).toContain('data-notes-canvas-block={block.id}');
    expect(canvas).toContain('focus-visible:outline-cyan-400');
    // The keyboard delete path is reported, not silent.
    expect(canvas).toContain('setStatus(`Removed the');
  });

  it('accepts a dropped note page and links the card back through the canonical wiki link', () => {
    expect(canvas).toContain("import { NOTE_PAGE_DRAG_MIME, addNotePageCard, notePageCardLinkText, parseNotePageDragPayload } from './notesCanvasDrop';");
    expect(canvas).toContain('if (handleNotePageDrop(event, surfaceRef.current)) {');
    expect(canvas).toContain('event.dataTransfer.types.includes(NOTE_PAGE_DRAG_MIME)');
    expect(canvas).toContain('setStatus(`Added a linked card for');
    // The page list is the drag source and uses the bounded payload.
    expect(pagesList).toContain('draggable={!page.trashedAt}');
    expect(pagesList).toContain('event.dataTransfer.setData(NOTE_PAGE_DRAG_MIME, serializeNotePageDragPayload(payload));');
    expect(pagesList).toContain('event.dataTransfer.effectAllowed =');
  });
});

describe('AST-0691 ink zoom and keyboard', () => {
  it('zooms through the vector viewBox and never resamples the strokes', () => {
    expect(inkModal).toContain("import { NOTE_INK_MAX_ZOOM, NOTE_INK_MIN_ZOOM, formatInkViewBox, resolveInkViewBox, stepInkZoom } from './notesInkZoom';");
    expect(inkModal).toContain('viewBox={formatInkViewBox(resolveInkViewBox(document, zoom))}');
    expect(inkModal).toContain('aria-label="Ink zoom"');
    expect(inkModal).toContain('aria-label="Zoom in ink canvas"');
    expect(inkModal).toContain('aria-label="Zoom out ink canvas"');
    // Ctrl/Cmd +/-/0 keyboard zoom and Escape to close.
    expect(inkModal).toContain("if (event.key === '+' || event.key === '=')");
    expect(inkModal).toContain("if (event.key === '0')");
    expect(inkModal).toContain("if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }");
    // The stroke engine is untouched by zoom: no scaling call inside the modal.
    expect(inkModal).not.toContain('scaleNoteInk');
  });
});

describe('AST-0696/AST-0699 attachment preview zoom, Escape and the Vault source', () => {
  it('adds a bounded zoom control only for zoomable kinds', () => {
    expect(previewModal).toContain('const zoomable = supportsNotePreviewZoom(preview);');
    expect(previewModal).toContain('{trusted && zoomable &&');
    expect(previewModal).toContain('style={notePreviewZoomStyle(\'image\', zoom)}');
    expect(previewModal).toContain('style={notePreviewZoomStyle(\'pdf\', zoom)}');
    // **W-432 — die Zusicherung wurde vom Wortlaut auf die Eigenschaft gezogen.** Hier stand
    // `onKeyDown={(event) => { if (event.key === 'Escape')` und `dialogRef.current?.focus();`: das pinnte die
    // **handgebaute** Fassung (Escape + Fokus, ohne Tab-Falle und ohne Fokus-Rückgabe). *Ein Vertrag kann das
    // Falsche zementieren, nicht nur fehlen.* Jetzt hängt der Dialog am **einen** Vertrag — und der Vertrag
    // besitzt alle vier Teile; geprüft wird zusätzlich, dass **kein zweiter** Escape-Pfad daneben steht.
    expect(previewModal).toContain("import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';");
    expect(previewModal).toContain('const dialogA11y = useNotesDialogA11y(Boolean(attachment), onClose);');
    expect(previewModal).toContain('ref={dialogA11y.ref}');
    expect(previewModal).toContain('tabIndex={-1}');
    expect(previewModal).toContain('onKeyDown={dialogA11y.onKeyDown}');
    expect(previewModal).not.toContain("event.key === 'Escape'");
    expect(previewModal).not.toContain('dialogRef.current?.focus();');
  });

  it('offers Vault assets as local Workspace references through the neutral snapshot port', () => {
    expect(embed).toContain("if (document.kind === 'Vault') {");
    expect(embed).toContain("kind: 'vault-asset' as const");
    expect(embed).toContain('document.vaultData?.files');
    // The snapshot still travels through the shared bounded port, not a second extractor.
    expect(embed).toContain('extractWorkspaceEmbedSnapshot(sourceDocument, { kind: target.kind');
    expect(embed).not.toContain('fetch(');
  });
});

describe('AST-0701 audio: attach an existing local media file without upload or auto-transcript', () => {
  it('validates the local file through the bounded media model and keeps transcription opt-in', () => {
    expect(audioModal).toContain('const attachLocalMediaFile = async (file: File) => {');
    expect(audioModal).toContain('await blobToValidatedNoteMediaDataUrl(file, kind)');
    expect(audioModal).toContain('aria-label="Attach an existing local media file"');
    expect(audioModal).toContain('no upload · no automatic transcript');
    expect(audioModal).toContain('transcript: [],');
    expect(audioModal).toContain('onLoadedMetadata={adoptMediaDuration}');
    // **W-432 — dieselbe Umstellung wie beim Vorschaudialog:** die eigene Escape-Regel hat einen echten Grund
    // (während einer Aufnahme darf Escape nicht schließen) und wird deshalb als **Bedingung** in den einen
    // Vertrag gereicht, statt als zweiter Handler daneben zu stehen. Die Eigenschaft ist unverändert geprüft.
    expect(audioModal).toContain('const dialogA11y = useNotesDialogA11y(isOpen, () => { if (!recording) close(); });');
    expect(audioModal).toContain('onKeyDown={dialogA11y.onKeyDown}');
    expect(audioModal).not.toContain("event.key === 'Escape'");
    expect(audioModal).not.toContain('fetch(');
  });
});

describe('AST-0706 table/code wiring and AST-0711 daily note', () => {
  it('routes the preview table and fence edits through the pure module', () => {
    expect(renderer).toContain("import { describeFencedCodeBlock, editMarkdownTable, setFencedCodeLanguage, type NoteTableOperation } from './notesTableEditing';");
    expect(renderer).toContain('const result = editMarkdownTable(content, tableStart, operation);');
    expect(renderer).toContain('const result = setFencedCodeLanguage(content, fenceStart, event.target.value);');
    expect(renderer).toContain('reportEdit(result.message)');
    expect(renderer).toContain('aria-label="Dismiss table message"');
  });

  it('looks the recurring daily note up across the whole notebook and returns it for direct entry', () => {
    expect(noteModel).toContain('export function findDailyNotePage(');
    expect(noteModel).toContain('export function dailyNoteTitle(');
    expect(manager).toContain('const existing = findDailyNotePage(activeNotebook);');
    // The existing day is returned, so the controller raises the same direct-entry focus request.
    expect(manager).toMatch(/if \(existing\) \{\s*navigateToPage\(existing\.id\);\s*return existing;\s*\}/);
    expect(manager).not.toContain('activeSection.pages.find((page) => page.title === title');
  });
});
