// STATUS: GOLD — exercises rendered extended Tasks surfaces in all supported locales.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TaskItem, TaskStatusDefinition } from '../../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { creativePersonalMessageKeys, creativePersonalText } from '../../../creativePersonalLocale';
import { DEFAULT_TASK_NOTIFICATION_STATE } from '../../notifications/taskNotifications';
import { TaskNotificationCenter } from '../../notifications/TaskNotificationCenter';
import { TaskCommentsPanel } from '../../comments/TaskCommentsPanel';
import { TaskSharingPanel } from '../../sharing/TaskSharingPanel';
import { TaskDependencyPanel } from '../../dependencies/TaskDependencyPanel';
import { TaskDetailDrawer } from '../../details/TaskDetailDrawer';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { DEFAULT_TASK_SHARING_STATE } from '../../sharing/taskSharing';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;');
const task = { id: 'task-locale', title: 'Example task', completed: false, priority: 'medium', projectId: 'project-locale' } as TaskItem;
const statusDefinitions: TaskStatusDefinition[] = [{ id: 'not_started', label: 'Not started', mapsTo: 'not_started', order: 0 }];
const detailProps = {
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
  statusDefinitions,
  organization: DEFAULT_TASK_ORGANIZATION,
} satisfies ComponentProps<typeof TaskDetailDrawer>;
const notificationProps = {
  documentId: 'locale-document', tasks: [task], dependencies: [], localIdentity: 'Local User',
  state: DEFAULT_TASK_NOTIFICATION_STATE, onChange: noop,
} satisfies ComponentProps<typeof TaskNotificationCenter>;

describe('Tasks extended locale coverage', () => {
  it('provides translated catalog entries for all seven locales', () => {
    const keys = creativePersonalMessageKeys();
    expect(keys.length).toBeGreaterThan(40);
    for (const locale of WORKSPACE_LOCALES) {
      for (const key of ['Notification Center', 'Comment threads', 'Sharing & Permissions', 'Project schedule dependencies', 'Task Details', 'Create canonical subtask...', 'Quiet hours']) {
        const value = creativePersonalText(key, locale);
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
        if (locale !== 'en-US') expect(value, `${locale}.${key}`).not.toBe(key);
      }
    }
  });

  it('renders notification, comments, sharing, dependencies, and details for each locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const notification = renderToStaticMarkup(<TaskNotificationCenter {...notificationProps} />);
      const comments = renderToStaticMarkup(<TaskCommentsPanel task={task} onUpdate={noop} />);
      const sharing = renderToStaticMarkup(<TaskSharingPanel organization={DEFAULT_TASK_ORGANIZATION} state={DEFAULT_TASK_SHARING_STATE} onChange={noop} />);
      const dependencies = renderToStaticMarkup(<TaskDependencyPanel task={task} tasks={[task]} dependencies={[]} onSelectTask={noop} />);
      const details = renderToStaticMarkup(<TaskDetailDrawer {...detailProps} />);
      expect(notification).toContain(creativePersonalText('Notification Center', locale));
      expect(comments).toContain(creativePersonalText('Comment threads', locale));
      expect(sharing).toContain(htmlText(creativePersonalText('Sharing & Permissions', locale)));
      expect(dependencies).toContain(creativePersonalText('This project task has no schedule dependencies.', locale));
      expect(details).toContain(creativePersonalText('Task Details', locale));
      expect(details).toContain(creativePersonalText('Create canonical subtask...', locale));
      expect(details).toContain(creativePersonalText('Watchers', locale));
      expect(details).toContain(creativePersonalText('No local attachments', locale));
    }
  });
});
