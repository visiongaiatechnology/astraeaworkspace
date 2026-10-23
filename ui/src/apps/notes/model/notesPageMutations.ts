// STATUS: DIAMANT VGT SUPREME — pure, accumulate-safe page mutation primitives
//
// W-397: the defect class is a state-bearing action layer that computes every method against the state
// captured at construction time. Two calls in one instance then clobber each other. The fix is to make the
// merge a pure function of the *live* page and to advance the live page after each write. These two
// functions are that fix, and `useNotesManager` calls them directly — so a test of them is a test of the
// production path, not a re-implementation of it.

import type { NoteAttachment, NotePage } from '../../../shared/contracts/workspace';
import { appendPageRevision, sanitizeNoteProperties, sanitizeNoteTitle } from './notesHierarchy';
import { sanitizeNoteAliases } from '../knowledge-graph/notesKnowledgeGraph';

export type NotePagePatch = Partial<NotePage> | ((page: NotePage) => Partial<NotePage>);

/**
 * Merges a patch (or a patch function) into the live page.
 * The function form is resolved against `live`, which is why two edits in one tick accumulate.
 */
export function applyPagePatch(live: NotePage, partial: NotePagePatch, now = Date.now()): NotePage {
  const resolved = typeof partial === 'function' ? partial(live) : partial;
  const merged: NotePage = {
    ...live,
    ...resolved,
    title: resolved.title === undefined ? live.title : sanitizeNoteTitle(resolved.title, 'Untitled Note'),
    properties: resolved.properties === undefined ? live.properties : sanitizeNoteProperties(resolved.properties),
    last_modified: now,
  };
  const titleChanged = resolved.title !== undefined && sanitizeNoteTitle(resolved.title, 'Untitled Note') !== live.title;
  merged.aliases = sanitizeNoteAliases([...(merged.aliases ?? []), ...(titleChanged ? [live.title] : [])]);
  return appendPageRevision(live, merged, now);
}

/**
 * Adds one attachment to the live page. Idempotent per id, so a repeated drop of the same file cannot
 * duplicate it. Reads the list from `live`, never from a captured copy.
 */
export function appendNoteAttachment(live: NotePage, attachment: NoteAttachment, now = Date.now()): NotePage {
  if ((live.attachments ?? []).some((item) => item.id === attachment.id)) return live;
  return applyPagePatch(live, { attachments: [...(live.attachments ?? []), attachment] }, now);
}

/** Removes one attachment from the live page. */
export function removeNoteAttachment(live: NotePage, attachmentId: string, now = Date.now()): NotePage {
  return applyPagePatch(live, { attachments: (live.attachments ?? []).filter((item) => item.id !== attachmentId) }, now);
}
