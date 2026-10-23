// AST-1001 — the navigation witness at the DRAWER boundary.
//
// The lesson from "a capability without a caller": a prop that merely appears in the source is not a
// working feature. So this file does not assert that `onOpenDocument` is passed — it CAPTURES the
// props the rendered collaboration panel receives, invokes the real handler, and asserts what the
// navigator was called with.
//
// Split from the rendered-panel assertions on purpose: this file mocks the panel to record its
// props, and that mock would empty the panel markup in the sibling file.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskItem, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { TaskDetailDrawer } from '../../details/TaskDetailDrawer';
import type { TaskCollaborationPanel } from '../../collaboration/TaskCollaborationPanel';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });

/** Records the props the drawer hands to the collaboration panel during a real render. */
const captured: { props?: ComponentProps<typeof TaskCollaborationPanel> } = {};
vi.mock('../../collaboration/TaskCollaborationPanel', () => ({
  TaskCollaborationPanel: (props: ComponentProps<typeof TaskCollaborationPanel>) => {
    captured.props = props;
    return null;
  },
}));

const noteUri = 'vgt://workspace/document/note-1/notes/page/page-9';
const reportUri = 'vgt://workspace/document/report-1';
const task = { id: 'task-1', title: 'Ship the release', completed: false, priority: 'high', linkedWorkspaceUris: [noteUri, reportUri] } as TaskItem;

const note: WorkspaceDocument = { id: 'note-1', title: 'Release notes', kind: 'Notes', created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };
const report: WorkspaceDocument = { id: 'report-1', title: 'Release report', kind: 'Writer', created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };
const grid: WorkspaceDocument = { id: 'grid-1', title: 'Sheet', kind: 'Grid', created_at: 1, modified_at: 2, version: 1, theme_id: 't', root_object_ids: [], objects: {} };

const noop = (): void => undefined;
const drawerProps = {
  selectedTask: task,
  tasks: [task],
  dependencies: [],
  onClose: noop,
  onUpdateTask: noop,
  onToggleTask: noop,
  onSelectTask: noop,
  onAddSubtask: noop,
  onChecklistToSubtask: noop,
  onSubtaskToChecklist: noop,
  onReparentTasks: noop,
  onRecurrenceOperation: noop,
  statusDefinitions: TASK_SYSTEM_STATUS_DEFINITIONS,
  organization: DEFAULT_TASK_ORGANIZATION,
  onTakeTaskIntoNote: () => undefined,
  documents: [note, report, grid],
  onOpenDocument: noop,
  currentDocumentId: 'tasks-doc-1',
} satisfies ComponentProps<typeof TaskDetailDrawer>;

beforeEach(() => { captured.props = undefined; });

describe('the drawer carries the navigator to the panel', () => {
  it('passes the shell navigator and the document list through, not just its own props', () => {
    renderToStaticMarkup(<TaskDetailDrawer {...drawerProps} />);
    expect(captured.props, 'the panel must have rendered').toBeDefined();
    expect(typeof captured.props?.onOpenDocument).toBe('function');
    expect(captured.props?.documents).toHaveLength(3);
    expect(captured.props?.currentDocumentId).toBe('tasks-doc-1');
  });

  it('invokes the SHELL navigator, so navigation arrives instead of being swallowed', () => {
    // The witness: the drawer must hand through the exact function it received, never a local twin.
    const shellNavigator = vi.fn();
    renderToStaticMarkup(<TaskDetailDrawer {...drawerProps} onOpenDocument={shellNavigator} />);
    captured.props?.onOpenDocument?.('note-1');
    expect(shellNavigator).toHaveBeenCalledWith('note-1');
  });

  it('hands the task id through so the panel can act on the right task', () => {
    renderToStaticMarkup(<TaskDetailDrawer {...drawerProps} />);
    // The panel receives a zero-argument callback bound to the selected task, and a real task object.
    expect(captured.props?.selectedTask?.id).toBe('task-1');
    expect(typeof captured.props?.onTakeTaskIntoNote).toBe('function');
  });

  it('omits the navigator rather than inventing one when the host has none', () => {
    const { onOpenDocument: _omitted, ...withoutNavigator } = drawerProps;
    renderToStaticMarkup(<TaskDetailDrawer {...withoutNavigator} />);
    expect(captured.props?.onOpenDocument).toBeUndefined();
  });

  it('omits the document list rather than inventing one when the host has none', () => {
    const { documents: _omitted, ...withoutDocuments } = drawerProps;
    renderToStaticMarkup(<TaskDetailDrawer {...withoutDocuments} />);
    expect(captured.props?.documents).toBeUndefined();
  });
});
