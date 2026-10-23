// AST-1001 (part 2) — "Aufgabe als Live-Link in Notiz oder Bericht aufnehmen."
//
// MEASURED before this change: the Tasks surface offered only a paste box for a raw `vgt://…`
// string (collaboration/TaskCollaborationPanel.tsx:120-145). There was no way to turn a task into a
// note. `edition/open-core/runtime/TasksRuntime.tsx` also DROPPED the `onCreateDerivedDocument`
// callback that `EditionWorkManagementProps` declares and `AppWorkspaceView.tsx:253` already
// passes, so the capability could not have been reached even if a control existed.
import { describe, expect, it } from 'vitest';
import type { TaskItem, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { isWorkspaceDeepLink, workspaceDeepLinkKind } from '../../model/taskModel';
import {
  buildTaskNoteDocument,
  taskNoteMarkdown,
  taskPatchForDerivedNote,
  taskWorkspaceUri,
  linkableTaskTargets,
  workspaceDocumentIdFromUri,
  TASK_NOTE_CHECKLIST_MAX_ITEMS,
} from '../../interchange/taskDerivedDocuments';

function tasksDocument(id = 'tasks-doc-1'): WorkspaceDocument {
  return {
    id, title: 'Tasks', kind: 'Tasks', created_at: 100, modified_at: 200, version: 3,
    theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {},
  };
}

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return { id: 'task-1', title: 'Ship the release', completed: false, priority: 'high', ...overrides };
}

describe('task note document builder', () => {
  it('produces a real Notes document, not a placeholder', () => {
    const derived = buildTaskNoteDocument(task(), tasksDocument());
    expect(derived.document.kind).toBe('Notes');
    expect(derived.document.noteData).toBeDefined();
    // A notebook with exactly one section and one page, and the page carries the task content.
    expect(derived.document.noteData?.sections).toHaveLength(1);
    expect(derived.document.noteData?.sections[0].pages).toHaveLength(1);
    expect(derived.document.noteData?.sections[0].pages[0].id).toBe(derived.page.id);
    expect(derived.page.content).toContain('Ship the release');
    // Fresh identity and a bumped version — never mutating the Tasks document.
    expect(derived.document.id).not.toBe('tasks-doc-1');
    expect(derived.document.version).toBe(1);
    expect(derived.document.created_at).toBeGreaterThan(0);
  });

  it('mints unique ids so two tasks never share a note identity', () => {
    const first = buildTaskNoteDocument(task({ id: 'a' }), tasksDocument());
    const second = buildTaskNoteDocument(task({ id: 'b' }), tasksDocument());
    expect(first.document.id).not.toBe(second.document.id);
    expect(first.page.id).not.toBe(second.page.id);
    expect(first.pageUri).not.toBe(second.pageUri);
  });

  it('links both ways with URIs the Tasks parser accepts', () => {
    const derived = buildTaskNoteDocument(task(), tasksDocument());
    // The SOURCE task URI is the same shape the Notes bridge already writes.
    expect(derived.taskUri).toBe('vgt://workspace/document/tasks-doc-1/task/task-1');
    // And — the defect fixed in part 1 — the Tasks parser must accept it rather than drop it.
    expect(isWorkspaceDeepLink(derived.taskUri)).toBe(true);
    expect(workspaceDeepLinkKind(derived.taskUri)).toBe('task');
    expect(isWorkspaceDeepLink(derived.pageUri)).toBe(true);
    expect(workspaceDeepLinkKind(derived.pageUri)).toBe('page');
    // The note body names its source, so the link is resolvable from the note as well.
    expect(derived.page.content).toContain(derived.taskUri);
  });

  it('mirrors the task fields the acceptance scenario names', () => {
    const derived = buildTaskNoteDocument(task({
      dueAt: '2026-10-31T17:45', projectId: 'project-x', tags: ['release', 'security'],
      assignees: ['Reviewer One'], description: 'Full context for the note.',
      checklist: [{ id: 'c1', title: 'Verify exporter', completed: true }, { id: 'c2', title: 'Sign off', completed: false }],
    }), tasksDocument());
    for (const expected of ['Status:', 'Priority: high', 'Due: 2026-10-31T17:45', 'Project: project-x', 'Tags: release, security', 'Assignees: Reviewer One', 'Full context for the note.']) {
      expect(derived.page.content, expected).toContain(expected);
    }
    // The checklist uses the exact syntax the Notes side converts back into canonical tasks.
    expect(derived.page.content).toContain('- [x] Verify exporter');
    expect(derived.page.content).toContain('- [ ] Sign off');
  });

  it('carries the task tags onto the page and bounds the checklist', () => {
    const many = Array.from({ length: TASK_NOTE_CHECKLIST_MAX_ITEMS + 20 }, (_, index) => ({ id: `c${index}`, title: `Item ${index}`, completed: false }));
    const derived = buildTaskNoteDocument(task({ tags: ['alpha'], checklist: many }), tasksDocument());
    expect(derived.page.tags).toContain('alpha');
    const checkboxLines = derived.page.content.split('\n').filter((line) => line.startsWith('- [')).length;
    expect(checkboxLines).toBe(TASK_NOTE_CHECKLIST_MAX_ITEMS);
  });

  it('bounds the copied description', () => {
    const long = 'x'.repeat(20_000);
    const derived = buildTaskNoteDocument(task({ description: long }), tasksDocument());
    expect(derived.page.content.length).toBeLessThan(20_000);
  });

  it('fails with a named reason instead of producing an empty document', () => {
    expect(() => buildTaskNoteDocument(task({ id: '' }), tasksDocument())).toThrow(/must have an id/);
    expect(() => buildTaskNoteDocument(task(), tasksDocument(''))).toThrow(/Tasks document must have an id/);
  });

  it('escapes characters that would break the URI', () => {
    const uri = taskWorkspaceUri('doc/with/slash', 'task with space');
    expect(isWorkspaceDeepLink(uri)).toBe(true);
    expect(uri).not.toContain(' ');
    expect(uri.startsWith('vgt://workspace/document/')).toBe(true);
  });
});

describe('task note markdown', () => {
  it('never emits a checklist line for a task without a checklist', () => {
    const markdown = taskNoteMarkdown(task(), 'vgt://workspace/document/d/task/t');
    expect(markdown).toContain('## Ship the release');
    expect(markdown).not.toContain('### Checklist');
    expect(markdown).toContain('Source task: vgt://workspace/document/d/task/t');
  });

  it('truncates an over-long title rather than emitting it whole', () => {
    const markdown = taskNoteMarkdown(task({ title: 'T'.repeat(5_000) }), 'vgt://workspace/document/d/task/t');
    const heading = markdown.split('\n')[0];
    expect(heading.length).toBeLessThanOrEqual(503);
  });
});

describe('derived note task patch', () => {
  it('appends the page link and does not duplicate it', () => {
    const uri = 'vgt://workspace/document/notes-1/notes/page/p1';
    expect(taskPatchForDerivedNote(task(), uri)).toEqual({ linkedWorkspaceUris: [uri] });
    expect(taskPatchForDerivedNote(task({ linkedWorkspaceUris: [uri] }), uri)).toEqual({ linkedWorkspaceUris: [uri] });
    expect(taskPatchForDerivedNote(task({ linkedWorkspaceUris: ['vgt://workspace/document/other'] }), uri))
      .toEqual({ linkedWorkspaceUris: ['vgt://workspace/document/other', uri] });
  });

  it('produces a link the Tasks parser keeps', () => {
    const uri = 'vgt://workspace/document/notes-1/notes/page/p1';
    const patch = taskPatchForDerivedNote(task(), uri);
    for (const link of patch.linkedWorkspaceUris ?? []) expect(isWorkspaceDeepLink(link)).toBe(true);
  });
});

describe('resolving a stored link back to a document', () => {
  it('extracts the document id from every link shape the workspace writes', () => {
    expect(workspaceDocumentIdFromUri('vgt://workspace/document/doc-1')).toBe('doc-1');
    expect(workspaceDocumentIdFromUri('vgt://workspace/document/doc-1/object/obj-1')).toBe('doc-1');
    expect(workspaceDocumentIdFromUri('vgt://workspace/document/doc-1/task/task-1')).toBe('doc-1');
    expect(workspaceDocumentIdFromUri('vgt://workspace/document/doc-1/notes/page/page-1')).toBe('doc-1');
    expect(workspaceDocumentIdFromUri('vgt://workspace/document/doc-1/page/page-1')).toBe('doc-1');
  });

  it('refuses anything the Tasks parser refuses, so no link is navigable that cannot be stored', () => {
    for (const bad of ['', '   ', 'http://evil.example/x', 'vgt://workspace/document', 'not a url', 'vgt://other/document/d']) {
      expect(workspaceDocumentIdFromUri(bad), bad).toBeUndefined();
    }
    // Traversal is refused by the shared grammar, so it can never be navigated to either.
    expect(workspaceDocumentIdFromUri('vgt://workspace/document/doc-1/../../etc/passwd')).toBeUndefined();
  });

  it('round-trips an id that needed URI encoding', () => {
    const uri = `vgt://workspace/document/${encodeURIComponent('doc:with:colons')}/notes/page/p1`;
    expect(workspaceDocumentIdFromUri(uri)).toBe('doc:with:colons');
  });

  it('agrees with the URIs this module produces', () => {
    const derived = buildTaskNoteDocument(task(), tasksDocument('tasks-doc-1'));
    expect(workspaceDocumentIdFromUri(derived.pageUri)).toBe(derived.document.id);
    expect(workspaceDocumentIdFromUri(derived.taskUri)).toBe('tasks-doc-1');
  });
});

describe('linkable targets', () => {
  function doc(id: string, kind: string, title: string): WorkspaceDocument {
    return { id, kind: kind as WorkspaceDocument['kind'], title, created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };
  }

  it('offers notes and reports only', () => {
    const targets = linkableTaskTargets([doc('n', 'Notes', 'N'), doc('w', 'Writer', 'W'), doc('g', 'Grid', 'G'), doc('p', 'Present', 'P')]);
    expect(targets.map((entry) => entry.id)).toEqual(['n', 'w']);
  });

  it('never offers the containing document as its own target', () => {
    const targets = linkableTaskTargets([doc('n', 'Notes', 'N'), doc('t', 'Notes', 'Self')], 't');
    expect(targets.map((entry) => entry.id)).toEqual(['n']);
  });

  it('returns an empty list for a host with no document list', () => {
    expect(linkableTaskTargets(undefined)).toEqual([]);
    expect(linkableTaskTargets([])).toEqual([]);
  });

  it('bounds the list', () => {
    const many = Array.from({ length: 600 }, (_, index) => doc(`n${index}`, 'Notes', `N${index}`));
    expect(linkableTaskTargets(many)).toHaveLength(500);
  });
});
