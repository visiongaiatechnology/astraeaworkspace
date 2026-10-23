// AST-1001 — the rendered link control and the document picker, on the real panel.
//
// No mock here: these assertions are about what the collaboration panel actually renders, including
// the navigable Open control, the unavailable-navigator notice, and the picker that replaces
// paste-only linking. Clicking is covered at the drawer boundary in
// `taskLinkNavigationDrawer.witness.test.tsx`, where the real handler can be captured.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TaskItem, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { TaskCollaborationPanel } from '../../collaboration/TaskCollaborationPanel';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });

const noop = (): void => undefined;
const noteUri = 'vgt://workspace/document/note-1/notes/page/page-9';
const reportUri = 'vgt://workspace/document/report-1';
const task = { id: 'task-1', title: 'Ship the release', completed: false, priority: 'high', linkedWorkspaceUris: [noteUri, reportUri] } as TaskItem;

const note: WorkspaceDocument = { id: 'note-1', title: 'Release notes', kind: 'Notes', created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };
const report: WorkspaceDocument = { id: 'report-1', title: 'Release report', kind: 'Writer', created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };
const grid: WorkspaceDocument = { id: 'grid-1', title: 'Sheet', kind: 'Grid', created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };

const panelProps = {
  selectedTask: task,
  onUpdateTask: noop,
  onTakeTaskIntoNote: () => undefined,
  documents: [note, report, grid],
  onOpenDocument: noop,
  currentDocumentId: 'tasks-doc-1',
} satisfies ComponentProps<typeof TaskCollaborationPanel>;

describe('the rendered link control is genuinely navigable', () => {
  it('renders an addressable Open control per navigable link', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    expect(markup).toContain('data-task-open-link="note-1"');
    expect(markup).toContain('data-task-open-link="report-1"');
    expect(markup).not.toContain('data-task-open-link-unavailable');
  });

  it('resolves a page-level note link to its DOCUMENT, not to the page id', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    // noteUri points at .../notes/page/page-9; the navigator takes a document id.
    expect(markup).toContain('data-task-open-link="note-1"');
    expect(markup).not.toContain('data-task-open-link="page-9"');
  });

  it('shows the target title so the link is readable, not only a URI', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    expect(markup).toContain('Release notes');
    expect(markup).toContain('Release report');
  });

  it('says so instead of rendering an inert control when the host has no navigator', () => {
    const { onOpenDocument: _omitted, ...withoutNavigator } = panelProps;
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...withoutNavigator} />);
    expect(markup).not.toContain('data-task-open-link=');
    expect(markup).toContain('data-task-open-link-unavailable');
    expect(markup).toContain('Not navigable here');
    // Refusing to navigate must not lose the reference.
    expect(markup).toContain('note-1');
  });

  it('keeps the delete control so a stale link can still be removed', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    const deleteControls = markup.match(/aria-label="Delete workspace link"/g) ?? [];
    expect(deleteControls).toHaveLength(2);
  });
});

describe('the document picker replaces paste-only linking', () => {
  it('offers notes and reports as pickable values', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    expect(markup).toContain('data-task-link-target-picker');
    expect(markup).toContain('<option value="note-1">Notes · Release notes</option>');
    expect(markup).toContain('<option value="report-1">Writer · Release report</option>');
    expect(markup).toContain('Choose a note or report…');
  });

  it('never offers another kind, and never the Tasks document itself', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    expect(markup).not.toContain('grid-1');
    const self: WorkspaceDocument = { ...note, id: 'tasks-doc-1', title: 'Itself' };
    const withSelf = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} documents={[note, self]} />);
    expect(withSelf).not.toContain('Itself');
  });

  it('keeps the manual paste field as the fallback path', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    expect(markup).toContain('vgt://workspace/document/...');
  });

  it('disables the link button until a target is chosen', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...panelProps} />);
    expect(markup).toContain('Link selected');
    expect(markup).toMatch(/disabled=""[^>]*>Link selected</);
  });

  it('does not render the picker when the host offers no documents', () => {
    const { documents: _omitted, ...withoutDocuments } = panelProps;
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...withoutDocuments} />);
    expect(markup).not.toContain('data-task-link-target-picker');
    expect(markup).toContain('vgt://workspace/document/...');
  });
});
