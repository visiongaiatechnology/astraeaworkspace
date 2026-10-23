// STATUS: DIAMANT VGT SUPREME — shared screen/print task presentation model
import type { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';

export interface TaskListPresentationRow {
  id: string;
  completed: boolean;
  title: string;
  status: string;
  priority: TaskItem['priority'];
  due: string;
  assignees: string;
  tags: string;
}

export function taskListPresentationRow(task: TaskItem): TaskListPresentationRow {
  return {
    id: task.id,
    completed: task.completed,
    title: task.title,
    status: task.status ?? (task.completed ? 'done' : 'not_started'),
    priority: task.priority,
    due: task.dueAt ?? task.dueDate ?? '',
    assignees: (task.assignees ?? (task.assignee ? [task.assignee] : [])).join(', '),
    tags: (task.tags ?? []).join(', '),
  };
}

export function taskListPresentationRows(tasks: TaskItem[]): TaskListPresentationRow[] {
  return tasks.map(taskListPresentationRow);
}
