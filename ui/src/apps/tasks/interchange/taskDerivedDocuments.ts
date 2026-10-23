// STATUS: DIAMANT VGT SUPREME — derive a real Notes document from a canonical task
//
// AST-1001 acceptance: "Aufgabe als Live-Link in Notiz oder Bericht aufnehmen."
//
// MEASURED before this module: the Tasks surface could only store a deep link that the user had to
// PASTE as a raw `vgt://…` string (collaboration/TaskCollaborationPanel.tsx:120-145), and this app
// never received the workspace document list at all — `shell/workspace/AppWorkspaceView.tsx:249-255`
// hands Tasks only `document`, `onUpdateDocument` and `onCreateDerivedDocument`, while every other
// app also receives `workspaceDocuments` and `onOpenWorkspaceDocument`. So there was no way to
// bring a task INTO a note or report.
//
// This builds the derived document as a pure value. It reuses the workspace's own Notes shape and
// the canonical `createNewDocument` factory rather than inventing a second document model, and it
// does not duplicate the deep-link grammar: the URI is produced by `taskWorkspaceUri`, which is
// itself asserted against `isWorkspaceDeepLink` so the producer and the parser cannot disagree.
import type { NoteDocumentModel, NotePage, TaskItem, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { createNewDocument } from '../../../edition/contracts/documentFactory';
import { secureRandomId } from '../../../shared/crypto/secureRandom';
import { isWorkspaceDeepLink } from '../model/taskModel';

/** Maximum length of the task excerpt copied into the note body. */
export const TASK_NOTE_EXCERPT_MAX_CHARS = 8_192;
/** Maximum number of checklist lines mirrored into the note. */
export const TASK_NOTE_CHECKLIST_MAX_ITEMS = 256;

/**
 * Canonical URI of a task inside its workspace document. This is the SAME shape the Notes bridge
 * already writes (`notesWorkspaceActions.ts:108`), so a task link produced here and a task link
 * produced there are indistinguishable by design.
 */
export function taskWorkspaceUri(documentId: string, taskId: string): string {
  const safeDocument = encodeURIComponent(documentId.replace(/[^A-Za-z0-9._:-]/g, '_'));
  const safeTask = encodeURIComponent(taskId.replace(/[^A-Za-z0-9._:-]/g, '_'));
  return `vgt://workspace/document/${safeDocument}/task/${safeTask}`;
}

/** Canonical URI of a note page, matching `notesWorkspaceActions.noteWorkspaceUri`. */
export function notePageWorkspaceUri(documentId: string, pageId: string): string {
  const safeDocument = encodeURIComponent(documentId.replace(/[^A-Za-z0-9._:-]/g, '_'));
  const safePage = encodeURIComponent(pageId.replace(/[^A-Za-z0-9._:-]/g, '_'));
  return `vgt://workspace/document/${safeDocument}/notes/page/${safePage}`;
}

const WORKSPACE_DOCUMENT_PREFIX = 'vgt://workspace/document/';

/**
 * The document a deep link points at, or undefined when the link is not a workspace link.
 *
 * Turns a stored `linkedWorkspaceUris` entry back into something navigable. It reuses the canonical
 * grammar rather than re-splitting the string, so a link the Tasks parser rejects can never be
 * navigated to — one definition, not two.
 */
export function workspaceDocumentIdFromUri(uri: string): string | undefined {
  const clean = uri.trim();
  if (!isWorkspaceDeepLink(clean)) return undefined;
  const remainder = clean.slice(WORKSPACE_DOCUMENT_PREFIX.length);
  const id = remainder.split('/')[0];
  if (!id) return undefined;
  // `isWorkspaceDeepLink` already rejected empty and traversal segments; undo the URI encoding so
  // the id matches the workspace document keys the shell looks up.
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * The workspace documents that can be linked into a task: notes and reports — the two destinations
 * the acceptance sentence names. The host's document list is optional, so this returns an empty
 * list rather than throwing when there is none.
 */
export function linkableTaskTargets(
  documents: readonly WorkspaceDocument[] | undefined,
  excludeDocumentId?: string,
): WorkspaceDocument[] {
  if (!documents?.length) return [];
  return documents
    .filter((document) => document.kind === 'Notes' || document.kind === 'Writer')
    .filter((document) => document.id !== excludeDocumentId)
    .slice(0, 500);
}

/** Markdown body of the note created from a task. Bounded, and it names the source task. */
export function taskNoteMarkdown(task: TaskItem, sourceUri: string): string {
  const lines: string[] = [`## ${task.title.slice(0, 500)}`, ''];
  lines.push(`- Status: ${task.completed ? 'Done' : task.status ?? 'not_started'}`);
  lines.push(`- Priority: ${task.priority}`);
  const due = task.dueAt ?? task.dueDate;
  if (due) lines.push(`- Due: ${due}`);
  if (task.projectId) lines.push(`- Project: ${task.projectId}`);
  if (task.tags?.length) lines.push(`- Tags: ${task.tags.join(', ')}`);
  const assignees = task.assignees ?? (task.assignee ? [task.assignee] : []);
  if (assignees.length) lines.push(`- Assignees: ${assignees.join(', ')}`);
  lines.push('');

  if (task.description?.trim()) {
    lines.push(task.description.trim().slice(0, TASK_NOTE_EXCERPT_MAX_CHARS), '');
  }

  const checklist = (task.checklist ?? []).slice(0, TASK_NOTE_CHECKLIST_MAX_ITEMS);
  if (checklist.length) {
    lines.push('### Checklist');
    // '- [ ] x' is the exact checklist syntax the Notes side converts back into canonical tasks
    // (`notesWorkspaceActions.sendChecklistToTaskDocument` / `notesTagsTasks`), so the round trip
    // is a real one and not a private format.
    for (const item of checklist) lines.push(`- [${item.completed ? 'x' : ' '}] ${item.title.slice(0, 500)}`);
    lines.push('');
  }

  lines.push(`Source task: ${sourceUri}`);
  return lines.join('\n');
}

export interface DerivedTaskNote {
  /** The new Notes document, ready to hand to `onCreateDerivedDocument`. */
  document: WorkspaceDocument;
  /** The page inside it, for the link record and for navigation. */
  page: NotePage;
  /** Canonical URI of the SOURCE task — stored on the task so the link is bidirectional. */
  taskUri: string;
  /** Canonical URI of the CREATED note page. */
  pageUri: string;
}

/**
 * Builds a standalone Notes document that captures `task` as a live-linked note.
 *
 * `sourceDocument` is the Tasks document the task lives in; it only supplies identity for the
 * back-link. Throws a named error when the task carries no identity, so a failure is never a
 * silent empty document.
 */
export function buildTaskNoteDocument(task: TaskItem, sourceDocument: WorkspaceDocument): DerivedTaskNote {
  const taskId = task.id?.trim();
  if (!taskId) throw new Error('A task must have an id before it can be linked into a note.');
  const documentId = sourceDocument.id?.trim();
  if (!documentId) throw new Error('The Tasks document must have an id before a task can be linked into a note.');

  const draft = createNewDocument('Notes');
  const notebook = draft.noteData;
  const templatePage = notebook?.sections?.[0]?.pages?.[0];
  if (!notebook || !templatePage) throw new Error('The Notes template does not contain a canonical notebook page.');

  const now = Date.now();
  const taskUri = taskWorkspaceUri(documentId, taskId);
  const pageId = secureRandomId('note-from-task');
  const notebookId = secureRandomId('notebook-from-task');

  // Keep the template's own field set; only overwrite what this note is about.
  const page: NotePage = {
    ...templatePage,
    id: pageId,
    title: task.title.trim().slice(0, 180) || 'Task',
    content: taskNoteMarkdown(task, taskUri),
    tags: Array.from(new Set([...(templatePage.tags ?? []), ...(task.tags ?? [])])).slice(0, 32),
    backlinks: [],
    last_modified: now,
    created_at: now,
  };

  const model: NoteDocumentModel = { ...notebook, id: notebookId, title: page.title, sections: [{ ...notebook.sections[0], id: secureRandomId('section-from-task'), pages: [page] }] };
  const document: WorkspaceDocument = {
    ...draft,
    id: secureRandomId('notes-from-task'),
    title: `Task · ${page.title}`.slice(0, 180),
    created_at: now,
    modified_at: now,
    version: 1,
    noteData: model,
  };

  return { document, page, taskUri, pageUri: notePageWorkspaceUri(document.id, page.id) };
}

/**
 * The task patch that records the created note. `linkedWorkspaceUris` is the canonical field, and
 * the new URI is appended through the same list semantics the model already uses.
 */
export function taskPatchForDerivedNote(task: TaskItem, pageUri: string): Partial<TaskItem> {
  const existing = task.linkedWorkspaceUris ?? [];
  return { linkedWorkspaceUris: existing.includes(pageUri) ? existing : [...existing, pageUri] };
}
