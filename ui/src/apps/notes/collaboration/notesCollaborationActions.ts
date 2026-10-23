// STATUS: DIAMANT VGT SUPREME — bounded Notes collaboration document mutations
//
// W-397: this factory used to capture `context.activePage` at construction time. Every method then computed
// against that frozen copy and wrote only its own value back, so two calls in one instance clobbered each
// other (two comments kept only the second, two named snapshots kept only the second). The page is now read
// through the functional updater, i.e. at the moment of the write.
import type { NoteNotebook, NotePage, NoteSection } from '../../../shared/contracts/workspace';
import { appendNoteComment, createNamedNoteSnapshot, createNoteComment, resolveNoteCommentThread } from './notesCollaborationCore';

type ReplaceNotebook = (notebookId: string, update: (notebook: NoteNotebook) => NoteNotebook) => void;
/** Accepts a plain patch or a function of the live page (see `useNotesManager.handleUpdateCurrentPage`). */
type UpdateCurrentPage = (partial: Partial<NotePage> | ((page: NotePage) => Partial<NotePage>)) => void;

interface NoteCollaborationActionContext {
  activeNotebook: NoteNotebook | null;
  activeSection: NoteSection | null;
  activePage: NotePage | null;
  replaceNotebook: ReplaceNotebook;
  updateCurrentPage: UpdateCurrentPage;
}

export function createNotesCollaborationActions(context: NoteCollaborationActionContext) {
  const addComment = (body: string, authorId: string, authorName: string, parentId?: string | null) => {
    if (!context.activePage) return;
    const comment = createNoteComment({ authorId, authorName, body, parentId });
    context.updateCurrentPage((page) => ({ comments: appendNoteComment(page, comment).comments }));
  };
  const resolveComment = (rootId: string, resolved: boolean) => {
    if (!context.activePage) return;
    context.updateCurrentPage((page) => ({ comments: resolveNoteCommentThread(page, rootId, resolved).comments }));
  };
  const createNamedSnapshot = (name: string) => {
    const { activeNotebook, activeSection, activePage } = context;
    if (!activeNotebook || !activeSection || !activePage) return;
    const now = Date.now();
    const snapshot = createNamedNoteSnapshot(activePage, name, now);
    context.updateCurrentPage((page) => ({
      revisions: [...(page.revisions ?? []), { ...snapshot, title: page.title, content: page.content, tags: [...page.tags] }].slice(-100),
      last_modified: now,
    }));
  };
  const toggleAuthorAttribution = (enabled: boolean) => {
    if (!context.activeNotebook) return;
    context.replaceNotebook(context.activeNotebook.id, (notebook) => ({ ...notebook, authorAttributionEnabled: enabled, updatedAt: Date.now() }));
  };
  return { addComment, resolveComment, createNamedSnapshot, toggleAuthorAttribution };
}
