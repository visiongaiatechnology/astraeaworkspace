// STATUS: PLATIN — Source contract: the caret is stored and restored
//
// W-216: nothing stored the caret, so a restart returned the text without the cursor — the
// acceptance asks for "unverändert mit **Cursor**/Absatzinhalt". No unit test can see a React
// effect's wiring, hence this contract.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const editorState = read('../../../apps/writer/editor/useWriterState.ts');
const cursorModule = read('../../../platform/workspace/persistence/workspaceCursorState.ts');

describe('caret restore is wired into the editor', () => {
  it('reads the stored cursor and validates it before applying it', () => {
    expect(editorState).toContain('readWorkspaceCursor(document.id)');
    // W-224/W-225: the read names the document, and the decision is taken with its reason so a refusal can
    // be announced. The decision must still go through the resolver, never straight into the state.
    expect(editorState).toContain('resolveWriterCursorRestoreDecision(');
    expect(editorState).toContain('recordCursorRestore(decision);');
    expect(editorState).toContain('if (!decision.restored) return;');
  });

  it('applies paragraph, selection and a caret request', () => {
    expect(editorState).toContain('setActiveParagraphId(restored.paragraphId);');
    expect(editorState).toContain('setTextSelection({ paragraphId: restored.paragraphId, start: restored.start, end: restored.end });');
    expect(editorState).toContain('requestWriterCaretAfterLayout({');
    expect(editorState).toContain("origin: 'api',");
  });

  it('restores once per document and not before the paragraphs are there', () => {
    expect(editorState).toContain('if (cursorRestoredForRef.current === document.id) return;');
    expect(editorState).toContain('if (paragraphs.length === 0) return;');
  });

  it('stores the caret while editing, debounced by the effect cleanup', () => {
    expect(editorState).toContain('persistWorkspaceCursor({');
    expect(editorState).toContain('paragraphId: textSelection.paragraphId,');
    expect(editorState).toContain('anchor: textSelection.start,');
    expect(editorState).toContain('head: textSelection.end,');
    expect(editorState).toContain('return () => window.clearTimeout(timer);');
    // Only the active paragraph's selection is worth storing.
    expect(editorState).toContain('if (!textSelection || textSelection.paragraphId !== activeParagraphId) return;');
  });
});

describe('the marker stays a marker', () => {
  it('stores ids and offsets only — never document content', () => {
    // The comment in workspaceStorageEmergency explains why payloads must not go to LocalStorage.
    const shape = cursorModule.slice(
      cursorModule.indexOf('export interface WorkspaceCursorState'),
      cursorModule.indexOf('const CURSOR_KEY'),
    );
    expect(shape).toContain('documentId: string;');
    expect(shape).toContain('paragraphId: string;');
    expect(shape).toContain('anchor: number;');
    expect(shape).toContain('head: number;');
    expect(shape).toContain('updatedAt: number;');
    // No text, no spans, no document.
    expect(shape).not.toContain('text');
    expect(shape).not.toContain('spans');
    expect(shape).not.toContain('WorkspaceDocument');
  });

  it('serialises the caret fields plus its version and expiry, and nothing else (W-220/W-221)', () => {
    // The record grew by `version` and `expiresAt`: the value now says what it is and until when it
    // counts, instead of leaving both to the key name. The point of this test — that a marker holds ids
    // and offsets and no content — is unchanged and still asserted below.
    const parser = cursorModule.slice(
      cursorModule.indexOf('export function parseWorkspaceCursor'),
      cursorModule.indexOf('function storage()'),
    );
    expect(parser).toContain('documentId: record.documentId,');
    expect(parser).toContain('paragraphId: record.paragraphId,');
    expect(parser).toContain('anchor,');
    expect(parser).toContain('head,');
    expect(parser).toContain('updatedAt,');
    expect(parser).toContain('version,');
    expect(parser).toContain('expiresAt,');
    // Still no content of any kind enters the value.
    expect(parser).not.toMatch(/text:|spans|WorkspaceDocument/);
  });

  it('keeps the previous answer available for every existing caller (W-225)', () => {
    // `resolveWriterCursorRestore` is a thin projection of the decision, so the two cannot disagree.
    expect(cursorModule).toContain('export function resolveWriterCursorRestore(');
    expect(cursorModule).toContain('const decision = resolveWriterCursorRestoreDecision(cursor, documentId, paragraphs);');
    expect(cursorModule).toContain('return decision.restored ? decision.restore : null;');
  });

  it('never lets a storage problem reach the editor', () => {
    // Every entry point catches: a caret is not worth an exception.
    expect(cursorModule).toContain("A browser with storage disabled throws on access; a caret is not worth an exception.");
    expect(cursorModule).toContain('Quota or a read-only profile: losing the caret is acceptable, losing the document is not.');
  });
});
