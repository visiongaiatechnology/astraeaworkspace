// AST-0918 / 0923 / 0928 / 0933 / 0938 / 0943 / 0948 / 0953 / 0958 / 0963 / 0968 / 0973 / 0978 / 0988 / 0993 / 0998 / 1003 / 1008
// — the "reopen" half of every PARTIAL row in BATCH-TASKS.
//
// The adapter's own doc comment claims: "Prüfe Save→Close→Reopen auf identische Nutzdaten".
// This test executes that claim over the real adapter instead of asserting it:
//
//   document --updateTasksOnlyDocument--> v2 --JSON.stringify--> text --JSON.parse--> v3
//            --readTasksOnlyDocumentData--> data
//
// The JSON hop is what a real close/reopen does to the payload (the document is persisted as a
// serialized workspace object), and it is the step that catches `undefined`-valued keys, Date
// objects and non-JSON values that an in-memory roundtrip would silently hide.
//
// NOT covered here, and stated out loud: no IndexedDB/localStorage write, no process restart, no
// native Tauri store. Those need a browser or a native run.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspaceCommon';
import type { WorkManagementModel } from '../../../../shared/contracts/work-management/workspaceWork';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { readTasksOnlyDocumentData, updateTasksOnlyDocument, type TasksOnlyDocumentData } from '../../persistence/tasksOnlyDocument';
import { DEFAULT_TASK_DEPENDENCIES, DEFAULT_TASK_PROJECT_ID } from '../../model/taskDefaults';
import { DEFAULT_TASK_CAPTURE_STATE } from '../../capture/taskCapture';
import { DEFAULT_TASK_NOTIFICATION_STATE } from '../../notifications/taskNotifications';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { DEFAULT_TASK_SHARING_STATE } from '../../sharing/taskSharing';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { DEFAULT_TASK_VIEW_PREFERENCES } from '../../views/taskViews';

function makeDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'tasks-reopen-document',
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

/** Simulates close + reopen: only what survives JSON can survive a real persistence boundary. */
function closeAndReopen(document: WorkspaceDocument): WorkspaceDocument {
  return JSON.parse(JSON.stringify(document)) as WorkspaceDocument;
}

const richTask: TaskItem = {
  id: 'task-rich',
  title: 'Release readiness review',
  description: 'Full canonical payload',
  status: 'blocked',
  statusReason: 'Awaiting sign-off',
  completed: false,
  progress: 35,
  priority: 'high',
  startAt: '2026-10-01T09:30',
  dueAt: '2026-10-31T17:45',
  projectId: DEFAULT_TASK_PROJECT_ID,
  phaseId: 'phase-release',
  planId: 'plan-1',
  tags: ['release', 'security'],
  assignees: ['Reviewer One'],
  watchers: ['Observer One'],
  important: true,
  myDayDate: '2026-10-01',
  inbox: false,
  listId: 'list-alpha',
  recurrence: 'weekly',
  recurrenceSpec: { frequency: 'weekly', interval: 2, weekdays: [1, 4], end: { mode: 'count', count: 6 }, timezone: 'Europe/Berlin' },
  recurrenceSeriesId: 'series-rich',
  recurrenceIndex: 3,
  occurrenceKey: 'series-rich:3:2026-10-31T17:45',
  occurrenceState: 'scheduled',
  generatedFromTaskId: 'task-parent-series',
  reminders: [{ id: 'reminder-rich', offsetMinutes: 90, enabled: true, label: 'Heads up' }],
  comments: [{ id: 'comment-rich', author: 'Reviewer One', text: 'Looks good @Local User', createdAt: 10, mentions: ['Local User'] }],
  attachments: [{ id: 'attachment-rich', name: 'evidence.txt', mimeType: 'text/plain', sizeBytes: 8, dataUrl: 'data:text/plain;base64,ZXZpZGVuY2U=' }],
  activity: [{ id: 'activity-rich', kind: 'created', at: 10, actor: 'Author One', summary: 'Created' }],
  checklist: [{ id: 'check-rich', title: 'Verify exporter', completed: true }],
  linkedWorkspaceUris: ['vgt://workspace/document/doc-rich/object/obj-rich'],
  createdAt: 10,
  updatedAt: 11,
  createdBy: 'Author One',
  updatedBy: 'Author One',
  source: 'astraea.tasks.quick-add',
};

/** The complete Tasks-owned payload: every PARTIAL point's data, in one document. */
function buildPayload(): TasksOnlyDocumentData {
  return {
    tasks: [
      richTask,
      { id: 'task-child', title: 'Child work', completed: false, priority: 'medium', parentTaskId: 'task-rich', progress: 0 },
      {
        id: 'task-second-occurrence',
        title: 'Release readiness review',
        completed: false,
        priority: 'high',
        dueAt: '2026-11-14T17:45',
        projectId: DEFAULT_TASK_PROJECT_ID,
        recurrence: 'weekly',
        recurrenceSpec: { frequency: 'weekly', interval: 2, weekdays: [1, 4], end: { mode: 'count', count: 6 }, timezone: 'Europe/Berlin' },
        recurrenceSeriesId: 'series-rich',
        recurrenceIndex: 4,
        occurrenceKey: 'series-rich:4:2026-11-14T17:45',
        occurrenceState: 'scheduled',
      },
    ],
    dependencies: [
      ...DEFAULT_TASK_DEPENDENCIES,
      { id: 'dep-custom', predecessorTaskId: 'task-rich', successorTaskId: 'task-child', type: 'SS', lagDays: -3 },
    ],
    projectId: DEFAULT_TASK_PROJECT_ID,
    taskStatusDefinitions: [
      ...TASK_SYSTEM_STATUS_DEFINITIONS,
      { id: 'shipped', label: 'Shipped', mapsTo: 'done', order: 9 },
    ],
    taskOrganization: {
      localIdentity: 'Local User',
      lists: [{ id: 'list-alpha', name: 'Release', folderId: 'folder-1', createdAt: 5 }],
      folders: [{ id: 'folder-1', name: 'Programme', createdAt: 4 }],
      smartLists: [{ id: 'smart-1', name: 'Blocked work', filter: { statuses: ['blocked'] }, createdAt: 6 }],
      savedFilters: [{ id: 'filter-1', name: 'High priority', filter: { priorities: ['high'], due: 'future' }, createdAt: 7 }],
    },
    taskViewPreferences: {
      ...DEFAULT_TASK_VIEW_PREFERENCES,
      mode: 'board',
      boardBy: 'priority',
      groupBy: 'status',
      sortBy: 'due',
      sortDirection: 'desc',
      filter: { tags: ['release'], priorities: ['high'] },
      manualOrder: ['task-rich', 'task-child'],
    },
    taskNotifications: {
      ...DEFAULT_TASK_NOTIFICATION_STATE,
      quietHours: { enabled: true, startMinutes: 1320, endMinutes: 420 },
      policies: [{ id: 'policy-1', scope: 'list', scopeId: 'list-alpha', enabled: true, mutedKinds: ['comment'] }],
      items: [{ id: 'notice-1', kind: 'overdue', taskId: 'task-rich', createdAt: 12, title: 'Task overdue', body: 'Release readiness review', read: true, source: 'local' }],
    },
    taskCapture: {
      ...DEFAULT_TASK_CAPTURE_STATE,
      naturalLanguageDatesEnabled: false,
      templates: [{ id: 'template-1', name: 'Weekly', titlePattern: 'Weekly review', priority: 'medium', tags: ['ops'], createdAt: 8 }],
    },
    taskSharing: { ...DEFAULT_TASK_SHARING_STATE },
  };
}

function writeAndReopen(payload: TasksOnlyDocumentData) {
  const first = updateTasksOnlyDocument(makeDocument(), readTasksOnlyDocumentData(makeDocument()), payload, 500);
  const reopened = closeAndReopen(first);
  return { first, reopened, data: readTasksOnlyDocumentData(reopened) };
}

describe('Tasks Save -> Close -> Reopen keeps identical payload', () => {
  it('preserves tasks, hierarchy and every task-owned field across the JSON boundary', () => {
    const { data } = writeAndReopen(buildPayload());
    const rich = data.tasks.find((task) => task.id === 'task-rich')!;

    expect(rich).toMatchObject(richTask);
    // The hot spots an in-memory roundtrip would hide.
    expect(rich.dueAt).toBe('2026-10-31T17:45');
    expect(rich.startAt).toBe('2026-10-01T09:30');
    expect(rich.recurrenceSpec).toEqual(richTask.recurrenceSpec);
    expect(rich.occurrenceKey).toBe('series-rich:3:2026-10-31T17:45');
    expect(rich.reminders).toEqual(richTask.reminders);
    expect(rich.comments).toEqual(richTask.comments);
    expect(rich.attachments).toEqual(richTask.attachments);
    expect(rich.activity).toEqual(richTask.activity);
    expect(rich.checklist).toEqual(richTask.checklist);
    expect(rich.linkedWorkspaceUris).toEqual(richTask.linkedWorkspaceUris);
    expect(rich.tags).toEqual(richTask.tags);
    expect(rich.assignees).toEqual(richTask.assignees);
    expect(rich.watchers).toEqual(richTask.watchers);

    // Hierarchy survived, and the second occurrence of the same series is still distinct.
    expect(data.tasks.map((task) => task.id).sort()).toEqual(['task-child', 'task-rich', 'task-second-occurrence']);
    expect(data.tasks.find((task) => task.id === 'task-child')?.parentTaskId).toBe('task-rich');
    expect(data.tasks.find((task) => task.id === 'task-second-occurrence')?.occurrenceKey).toBe('series-rich:4:2026-11-14T17:45');
  });

  it('preserves the organization, view preferences, notifications, capture and sharing state', () => {
    const payload = buildPayload();
    const { data } = writeAndReopen(payload);

    expect(data.taskOrganization).toEqual(payload.taskOrganization);
    expect(data.taskViewPreferences).toEqual(payload.taskViewPreferences);
    expect(data.taskNotifications).toEqual(payload.taskNotifications);
    expect(data.taskCapture).toEqual(payload.taskCapture);
    expect(data.taskSharing).toEqual(payload.taskSharing);
    expect(data.taskStatusDefinitions).toEqual(payload.taskStatusDefinitions);
    expect(data.dependencies).toEqual(payload.dependencies);
    // A custom SS dependency with a negative lag is not silently normalized away.
    expect(data.dependencies.find((entry) => entry.id === 'dep-custom')).toMatchObject({ type: 'SS', lagDays: -3 });
    expect(data.projectId).toBe(DEFAULT_TASK_PROJECT_ID);
  });

  it('is stable under a second write: reopening twice does not drift the payload', () => {
    const payload = buildPayload();
    const { reopened, data } = writeAndReopen(payload);

    // Second generation, from the reopened document and its read-back data.
    const second = updateTasksOnlyDocument(reopened, data, data, 900);
    const third = closeAndReopen(second);
    const reread = readTasksOnlyDocumentData(third);

    // Compare read-back with read-back. `updateTasksOnlyDocument` stores the caller's array
    // verbatim while the READER normalizes it (adding assignee/blocked/descriptionFormat/
    // startDate/dueDate), so comparing a normalized read against the raw stored array compares
    // two deliberately different shapes. The meaningful claim is that cycle 2 reproduces cycle 1.
    expect(reread.tasks).toEqual(data.tasks);
    expect(reread.tasks.map((task) => task.occurrenceKey)).toEqual(data.tasks.map((task) => task.occurrenceKey));
    expect(reread.taskOrganization).toEqual(data.taskOrganization);
    expect(reread.taskViewPreferences).toEqual(data.taskViewPreferences);
    expect(reread.taskNotifications).toEqual(data.taskNotifications);
    expect(reread.taskCapture).toEqual(data.taskCapture);
    expect(reread.dependencies).toEqual(data.dependencies);

    // A third cycle must not drift further either.
    const fourth = readTasksOnlyDocumentData(closeAndReopen(updateTasksOnlyDocument(third, reread, reread, 1200)));
    expect(fourth.tasks).toEqual(data.tasks);
    // Each write bumps the document version by exactly one; the absolute value depends on the
    // base document, so the delta is the contract.
    expect(third.version).toBe(reopened.version + 1);
    expect(second.version).toBe(reopened.version + 1);
  });

  it('documents the write/read shape difference so it cannot be mistaken for data loss', () => {
    // The writer stores the caller's array verbatim; the reader normalizes. The five extra keys
    // the reader adds are derived, never invented user data — assert them explicitly.
    const { first, data } = writeAndReopen(buildPayload());
    const stored = (first.workManagementData?.tasks ?? []).find((task) => task.id === 'task-rich')!;
    const loaded = data.tasks.find((task) => task.id === 'task-rich')!;

    const readerDerived = Object.keys(loaded).filter((key) => !(key in stored)).sort();
    expect(readerDerived).toEqual(['assignee', 'blocked', 'descriptionFormat', 'dueDate', 'startDate']);
    // Each one is derived from data that IS stored, so nothing is lost by the asymmetry.
    expect(loaded.assignee).toBe(stored.assignees?.[0]);
    expect(loaded.blocked).toBe(stored.status === 'blocked');
    expect(loaded.descriptionFormat).toBe('markdown');
    expect(loaded.dueDate).toBe(stored.dueAt?.slice(0, 10));
    expect(loaded.startDate).toBe(stored.startAt?.slice(0, 10));
  });

  it('keeps an intentionally empty task list empty instead of re-seeding defaults', () => {
    // The single most destructive "reopen" failure would be resurrecting seed data over a user's
    // deliberately emptied backlog.
    const empty = { ...buildPayload(), tasks: [], dependencies: [] };
    const document = updateTasksOnlyDocument(makeDocument(), readTasksOnlyDocumentData(makeDocument()), empty, 400);
    const data = readTasksOnlyDocumentData(closeAndReopen(document));

    expect(data.tasks).toEqual([]);
    expect(data.dependencies).toEqual([]);
  });

  it('does not leak a non-JSON value into the persisted mirror', () => {
    const { first } = writeAndReopen(buildPayload());
    const mirror = first.objects['work_mgmt_payload'];
    expect(mirror?.type).toBe('TextBlock');
    if (mirror?.type === 'TextBlock') {
      const serialized = mirror.data.paragraphs[0]?.spans[0]?.text ?? '';
      // The mirrored payload must be exactly the JSON of the canonical record, and it must survive
      // a parse without resurrecting anything the canonical record did not contain.
      expect(serialized).toBe(JSON.stringify(first.workManagementData));
      const parsed = JSON.parse(serialized) as WorkManagementModel;
      expect(parsed.tasks?.map((task) => task.id)).toEqual(first.workManagementData?.tasks.map((task) => task.id));
    }
  });

  it('rejects a corrupt stored payload by falling back to a readable document instead of throwing', () => {
    const document = makeDocument({
      objects: {
        work_mgmt_payload: {
          type: 'TextBlock',
          data: { id: 'work_mgmt_payload', paragraphs: [{ id: 'p-work-1', style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: '{ this is not json' }] }] },
        },
      },
    });
    // Fail-closed and visible: the reader returns a usable document, it does not crash the app.
    expect(() => readTasksOnlyDocumentData(document)).not.toThrow();
    const data = readTasksOnlyDocumentData(document);
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(data.taskOrganization).toEqual(DEFAULT_TASK_ORGANIZATION);
  });
});
