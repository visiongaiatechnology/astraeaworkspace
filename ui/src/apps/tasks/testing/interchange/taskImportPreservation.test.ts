import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/work-management/workspaceWork';
import { appendImportedTaskBatch } from '../../interchange/taskImportBatch';

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    completed: false,
    priority: 'medium',
    ...rest,
  };
}

describe('task import batch preservation', () => {
  it('preserves canonical task data while applying import provenance and default project scope', () => {
    const imported = task({
      id: 'task-rich',
      title: 'Imported task',
      description: 'Keep the full description',
      status: 'blocked',
      statusReason: 'Waiting for approval',
      completed: false,
      progress: 35,
      priority: 'high',
      dueAt: '2026-10-31T09:00',
      tags: ['security', 'release'],
      assignees: ['Reviewer One'],
      watchers: ['Observer One'],
      recurrence: 'weekly',
      recurrenceSpec: { frequency: 'weekly', interval: 2, weekdays: [1, 3] },
      recurrenceSeriesId: 'series-rich',
      recurrenceIndex: 4,
      occurrenceKey: 'series-rich:4:2026-10-31T09:00',
      reminders: [{ id: 'reminder-rich', at: '2026-10-30T09:00', enabled: true }],
      comments: [{ id: 'comment-rich', author: 'Reviewer One', text: 'Retain comment', createdAt: 10 }],
      attachments: [{ id: 'attachment-rich', name: 'evidence.txt', mimeType: 'text/plain', sizeBytes: 8, dataUrl: 'data:text/plain;base64,ZXZpZGVuY2U=' }],
      activity: [{ id: 'activity-rich', kind: 'created', at: 10, actor: 'Author One', summary: 'Created' }],
      checklist: [{ id: 'check-rich', title: 'Retain checklist', completed: true }],
      linkedWorkspaceUris: ['vgt://workspace/document/doc-rich/task/task-rich'],
      createdAt: 10,
      updatedAt: 11,
      createdBy: 'Author One',
      updatedBy: 'Author One',
      source: 'external.import',
    });

    const result = appendImportedTaskBatch([], [imported], {
      now: 500,
      actor: 'Local Reviewer',
      source: 'astraea.tasks.import',
      defaultProjectId: 'project-current',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ...imported,
      projectId: 'project-current',
      updatedAt: 500,
      updatedBy: 'Local Reviewer',
      source: 'astraea.tasks.import',
    });
    expect(result[0]?.createdAt).toBe(10);
    expect(result[0]?.createdBy).toBe('Author One');
  });

  it('remaps conflicting task IDs and every imported hierarchy/provenance edge', () => {
    const existing = task({ id: 'task-collision', title: 'Keep local task' });
    const importedParent = task({ id: 'task-collision', title: 'Imported parent' });
    const importedChild = task({
      id: 'task-child',
      title: 'Imported child',
      parentTaskId: 'task-collision',
      generatedFromTaskId: 'task-collision',
    });

    const result = appendImportedTaskBatch([existing], [importedParent, importedChild], { now: 900 });
    const remappedParent = result[1];
    const child = result[2];

    expect(result[0]).toEqual(existing);
    expect(remappedParent?.id).not.toBe(existing.id);
    expect(child?.parentTaskId).toBe(remappedParent?.id);
    expect(child?.generatedFromTaskId).toBe(remappedParent?.id);
  });

  it('isolates unresolved foreign task references instead of attaching to matching local IDs', () => {
    const existing = task({ id: 'foreign-parent', title: 'Unrelated local task' });
    const imported = task({
      id: 'imported-child',
      title: 'Portable child',
      parentTaskId: 'foreign-parent',
      generatedFromTaskId: 'foreign-parent',
    });

    const result = appendImportedTaskBatch([existing], [imported]);

    expect(result[0]).toEqual(existing);
    expect(result[1]?.parentTaskId).toBeUndefined();
    expect(result[1]?.generatedFromTaskId).toBeUndefined();
  });

  it('remaps colliding recurrence series identity and derived occurrence keys', () => {
    const existing = task({
      id: 'local-occurrence',
      title: 'Local occurrence',
      recurrenceSeriesId: 'series-shared',
    });
    const imported = task({
      id: 'imported-occurrence',
      title: 'Imported occurrence',
      recurrence: 'weekly',
      recurrenceSeriesId: 'series-shared',
      recurrenceIndex: 3,
      dueDate: '2026-11-02',
      occurrenceKey: 'series-shared:3:2026-11-02',
    });

    const result = appendImportedTaskBatch([existing], [imported]);

    expect(result[1]?.recurrenceSeriesId).not.toBe('series-shared');
    expect(result[1]?.occurrenceKey).toBe(`${result[1]?.recurrenceSeriesId}:3:2026-11-02`);
    expect(result[0]).toEqual(existing);
  });

  it('keeps a recurring root aligned with its remapped task identity', () => {
    const existing = task({ id: 'task-recurring-root', title: 'Unrelated local row' });
    const imported = task({
      id: 'task-recurring-root',
      title: 'Imported recurring root',
      recurrence: 'daily',
      recurrenceSeriesId: 'task-recurring-root',
      recurrenceIndex: 0,
      dueDate: '2026-11-03',
      occurrenceKey: 'task-recurring-root:0:2026-11-03',
    });

    const result = appendImportedTaskBatch([existing], [imported]);

    expect(result[1]?.id).not.toBe(existing.id);
    expect(result[1]?.recurrenceSeriesId).toBe(result[1]?.id);
    expect(result[1]?.occurrenceKey).toBe(`${result[1]?.id}:0:2026-11-03`);
  });

  it('rejects duplicate imported identities before producing a partial batch', () => {
    const existing = [task({ id: 'existing', title: 'Existing' })];
    const existingSnapshot = structuredClone(existing);
    const imported = [
      task({ id: 'duplicate', title: 'First row' }),
      task({ id: 'duplicate', title: 'Second row' }),
    ];
    const importedSnapshot = structuredClone(imported);

    expect(() => appendImportedTaskBatch(existing, imported)).toThrow(/identifiers must be present and unique/u);
    expect(existing).toEqual(existingSnapshot);
    expect(imported).toEqual(importedSnapshot);
  });
});
