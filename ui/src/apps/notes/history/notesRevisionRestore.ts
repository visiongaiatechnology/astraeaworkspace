// STATUS: DIAMANT VGT SUPREME — pure revision-restore plan that never destroys newer text
//
// AST-0716 acceptance: "Frühere Version wiederherstellen ohne neuere Texte zu verlieren."
// A plain overwrite does lose them. The plan therefore always carries a *safety revision* of the current
// state, which is appended to the same bounded revision list before the earlier version is applied — so the
// newer text stays selectable in the history and the restore is itself undoable by restoring back.

import type { NotePage, NotePageRevision } from '../../../shared/contracts/workspace';
import { sanitizeNoteProperties, sanitizeNoteTitle } from '../model/notesHierarchy';

export const NOTE_RESTORE_SAFETY_PREFIX = 'Before restore';

export interface NoteRevisionRestorePlan {
  /** Patch to apply to the live page. */
  patch: Partial<NotePage>;
  /** The current state, kept as a named revision so the restore destroys nothing. */
  safetyRevision: Omit<NotePageRevision, 'id'>;
  /** Bounded, user-visible description of what is about to change. */
  summary: string;
}

/**
 * Builds the restore plan. `null` when the revision belongs to another page or is identical to the current
 * state, so the caller can report "nothing to restore" instead of writing a no-op revision.
 */
export function planRevisionRestore(
  page: NotePage,
  revision: NotePageRevision,
  now = Date.now(),
): NoteRevisionRestorePlan | null {
  if (!revision || typeof revision.id !== 'string' || !revision.id) return null;
  const title = sanitizeNoteTitle(revision.title ?? page.title, 'Untitled Note');
  const content = typeof revision.content === 'string' ? revision.content : '';
  const tags = Array.isArray(revision.tags) ? revision.tags.slice(0, 64) : [];
  const properties = sanitizeNoteProperties(revision.properties);
  const editorMode = revision.editorMode === 'freeform' ? 'freeform' : revision.editorMode === 'document' ? 'document' : page.editorMode;
  const canvas = revision.canvas ?? (editorMode === 'freeform' ? undefined : page.canvas);

  const changed = title !== page.title
    || content !== page.content
    || JSON.stringify(tags) !== JSON.stringify(page.tags)
    || JSON.stringify(properties) !== JSON.stringify(page.properties ?? {})
    || editorMode !== page.editorMode
    || JSON.stringify(canvas ?? null) !== JSON.stringify(page.canvas ?? null);
  if (!changed) return null;

  return {
    patch: {
      title,
      content,
      tags,
      properties,
      ...(editorMode ? { editorMode } : {}),
      ...(canvas ? { canvas } : {}),
    },
    safetyRevision: {
      timestamp: now,
      name: `${NOTE_RESTORE_SAFETY_PREFIX} ${new Date(now).toISOString().slice(0, 19).replace('T', ' ')}`,
      title: page.title,
      content: page.content,
      editorMode: page.editorMode,
      canvas: page.canvas,
      tags: [...page.tags],
      properties: { ...sanitizeNoteProperties(page.properties) },
    },
    summary: `Restored the revision from ${new Date(revision.timestamp).toISOString().slice(0, 19).replace('T', ' ')}; the current text was kept as a safety revision.`,
  };
}
