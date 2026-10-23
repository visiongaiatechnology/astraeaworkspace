// STATUS: PLATIN — task-only persistence preserves shared Workspace document history and opaque Premium data.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspaceCommon';
import type { WorkManagementModel } from '../../../../shared/contracts/work-management/workspaceWork';
import { DEFAULT_TASKS } from '../../model/taskDefaults';
import { readTasksOnlyDocumentData, updateTasksOnlyDocument } from '../../persistence/tasksOnlyDocument';

function makeDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'tasks-document',
    title: 'Tasks',
    kind: 'Tasks',
    created_at: 100,
    modified_at: 200,
    version: 7,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    ...overrides,
  };
}

function workData(overrides: Partial<WorkManagementModel> = {}): WorkManagementModel {
  return {
    tasks: [],
    cards: [],
    milestones: [],
    ...overrides,
  };
}

describe('Tasks-only document adapter', () => {
  it('loads canonical tasks and seeds only when a stored task array is absent', () => {
    const fresh = readTasksOnlyDocumentData(makeDocument());
    expect(fresh.tasks.map((task) => task.id)).toEqual(DEFAULT_TASKS.map((task) => task.id));
    expect(fresh.dependencies).toHaveLength(4);

    const intentionallyEmpty = readTasksOnlyDocumentData(makeDocument({ workManagementData: workData({ tasks: [], taskStatusDefinitions: [] }) }));
    expect(intentionallyEmpty.tasks).toEqual([]);
    expect(intentionallyEmpty.dependencies).toEqual([]);
    expect(intentionallyEmpty.taskStatusDefinitions).toEqual([]);

    const projectScoped = readTasksOnlyDocumentData(makeDocument({
      workManagementData: workData({
        tasks: [{ ...DEFAULT_TASKS[0]!, projectId: undefined }],
        project: { id: 'project-custom', name: 'Custom' },
      }),
    }));
    expect(projectScoped.projectId).toBe('project-custom');
    expect(projectScoped.tasks[0]?.projectId).toBe('project-custom');
  });

  it('commits Tasks edits to the canonical payload and keeps Planner/Projects fields untouched', () => {
    const plannerState = {
      activePlanId: 'plan-default',
      plans: [{ id: 'plan-default', title: 'Astraea Planner', columns: [], createdAt: 10, updatedAt: 10 }],
      bindings: [{ id: 'binding-a', taskId: 'task-existing', planId: 'plan-default', columnId: 'todo', order: 0, createdAt: 10, updatedAt: 10 }],
      labels: [], customFields: [], templates: [], boardTemplates: [], savedViews: [], sprints: [], capacityProfiles: [],
      ui: { collapsedColumns: {}, collapsedSwimlanes: {}, swimlaneBy: 'none' as const },
    };
    const original = Object.assign(workData({
      tasks: [{ ...DEFAULT_TASKS[0]!, id: 'task-existing', title: 'Before', completed: false }],
      cards: [{ id: 'card-existing', title: 'Before', column: 'todo', tags: [], linkedTaskId: 'task-existing', priority: 'high', checklist: [] }],
      milestones: [{ id: 'milestone-existing', name: 'Existing milestone', startDate: '2026-09-01', endDate: '2026-09-02', progress: 20 }],
      project: { id: 'project-existing', name: 'Existing project' },
      plannerSettings: { view: 'board', filters: { due: 'all' } },
    }), { plannerState });
    const document = makeDocument({ workManagementData: original });
    const data = readTasksOnlyDocumentData(document);
    const changedTask = { ...data.tasks[0]!, title: 'After' };
    const updated = updateTasksOnlyDocument(document, data, { tasks: [changedTask] }, 500);

    expect(updated.version).toBe(8);
    expect(updated.modified_at).toBe(500);
    expect(updated.workManagementData?.tasks[0]?.title).toBe('After');
    expect(updated.workManagementData?.project).toEqual(original.project);
    expect(updated.workManagementData?.plannerSettings).toEqual(original.plannerSettings);
    expect(updated.workManagementData?.cards).toEqual(original.cards);
    expect(updated.workManagementData?.milestones).toEqual(original.milestones);

    const mirror = updated.objects['work_mgmt_payload'];
    expect(mirror?.type).toBe('TextBlock');
    if (mirror?.type === 'TextBlock') {
      const serialized = mirror.data.paragraphs[0]?.spans[0]?.text;
      expect(serialized).toBe(JSON.stringify(updated.workManagementData));
      expect(JSON.parse(serialized ?? '{}')).toMatchObject({ plannerState });
    }
  });

  it('reads the legacy payload object without requiring Planner or Projects code', () => {
    const payload = workData({ tasks: [{ ...DEFAULT_TASKS[0]!, id: 'legacy-task', title: 'Legacy task' }] });
    const document = makeDocument({
      objects: {
        'work_mgmt_payload': {
          type: 'TextBlock',
          data: {
            id: 'work_mgmt_payload',
            paragraphs: [{
              id: 'p-work-1',
              style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 },
              spans: [{ text: JSON.stringify(payload) }],
            }],
          },
        },
      },
    });

    expect(readTasksOnlyDocumentData(document).tasks[0]?.id).toBe('legacy-task');
  });
});
