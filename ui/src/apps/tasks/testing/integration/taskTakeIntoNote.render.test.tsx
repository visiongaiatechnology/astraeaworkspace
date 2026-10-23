// AST-1001 (part 3a) — the visible control, rendered.
//
// This file renders only. File-reading contract checks live in the sibling `.mjs`, because a
// `.tsx` test in this project has no Node type declarations (`node:fs` → TS2307) — the house rule
// is that a contract which reads files is a `.mjs`.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { TaskCollaborationPanel } from '../../collaboration/TaskCollaborationPanel';
import { TaskDetailDrawer } from '../../details/TaskDetailDrawer';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });

const noop = (): void => undefined;
const task = { id: 'task-1', title: 'Ship the release', completed: false, priority: 'high' } as TaskItem;

describe('take-task-into-note control', () => {
  const props = {
    selectedTask: task,
    onUpdateTask: noop,
    onTakeTaskIntoNote: () => undefined,
  } satisfies ComponentProps<typeof TaskCollaborationPanel>;

  it('renders the control with its own state channel', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...props} />);
    expect(markup).toContain('data-task-take-into-note="idle"');
    expect(markup).toContain('Create note from task');
    expect(markup).toContain('Creates a Notes document with this task and links both ways.');
  });

  it('keeps the raw link field as well, without replacing it', () => {
    // The paste field is still the manual path; the new control is additive.
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...props} />);
    expect(markup).toContain('vgt://workspace/document/...');
  });

  it('renders no success or failure text before anything happened', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...props} />);
    expect(markup).not.toContain('data-task-take-into-note-message');
  });

  it('renders a control that is not marked busy at rest', () => {
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...props} />);
    expect(markup).toContain('aria-busy="false"');
  });

  it('renders the control even when the host cannot create documents', () => {
    // The refusal must be reachable and visible, not hidden behind an absent button.
    const { onTakeTaskIntoNote: _omitted, ...withoutHost } = props;
    const markup = renderToStaticMarkup(<TaskCollaborationPanel {...withoutHost} />);
    expect(markup).toContain('data-task-take-into-note="idle"');
  });
});

describe('detail drawer exposes the control', () => {
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
  } satisfies ComponentProps<typeof TaskDetailDrawer>;

  it('shows the control when the host can create documents', () => {
    const markup = renderToStaticMarkup(<TaskDetailDrawer {...drawerProps} />);
    expect(markup).toContain('data-task-take-into-note');
    expect(markup).toContain('Create note from task');
  });

  it('still shows the control without a host, so the refusal is visible rather than hidden', () => {
    const { onTakeTaskIntoNote: _omitted, ...withoutHost } = drawerProps;
    const markup = renderToStaticMarkup(<TaskDetailDrawer {...withoutHost} />);
    expect(markup).toContain('data-task-take-into-note');
  });
});
