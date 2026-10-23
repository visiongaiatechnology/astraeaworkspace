import { describe, expect, it } from 'vitest';
import type { TaskItem, TaskNotificationItem } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_TASK_NOTIFICATION_STATE,
  evaluateAndDeliverTaskNotifications,
  hasTaskNotificationPersistenceChanges,
  markTaskNotificationRead,
  normalizeTaskNotificationState,
} from '../../notifications/taskNotifications';

function notificationApi(permission: NotificationPermission, onShow: () => void = () => undefined) {
  return {
    permission: () => permission,
    requestPermission: async () => permission,
    show: () => onShow(),
  };
}

function taskWithReminder(nowMs: number): TaskItem {
  return {
    id: 'task-reminder',
    title: 'Review release plan',
    completed: false,
    priority: 'medium',
    reminders: [{ id: 'release-reminder', at: new Date(nowMs - 500).toISOString(), enabled: true }],
  };
}

function existingNotification(): TaskNotificationItem {
  return {
    id: 'task-notify:reminder:task-reminder:release-reminder',
    kind: 'reminder',
    taskId: 'task-reminder',
    createdAt: 9_500,
    title: 'Release reminder',
    body: 'Review release plan',
    read: false,
    source: 'local',
  };
}

describe('task notification persistence', () => {
  it('keeps repeated StrictMode effect evaluations runtime-only when content is unchanged', () => {
    let runtimeState = normalizeTaskNotificationState(DEFAULT_TASK_NOTIFICATION_STATE);
    let persistedWrites = 0;

    for (const nowMs of [10_000, 10_001]) {
      const update = evaluateAndDeliverTaskNotifications([], [], runtimeState, 'local-user', notificationApi('denied'), nowMs);
      runtimeState = update.state;
      if (update.shouldPersist) persistedWrites += 1;
    }

    expect(persistedWrites).toBe(0);
    expect(runtimeState.lastEvaluatedAt).toBe(10_001);
    expect(hasTaskNotificationPersistenceChanges(DEFAULT_TASK_NOTIFICATION_STATE, runtimeState)).toBe(false);
  });

  it('persists a newly generated notification once across repeated evaluations', () => {
    const nowMs = 20_000;
    let runtimeState = normalizeTaskNotificationState({ ...DEFAULT_TASK_NOTIFICATION_STATE, lastEvaluatedAt: nowMs - 1_000 });
    let persistedWrites = 0;

    const first = evaluateAndDeliverTaskNotifications([taskWithReminder(nowMs)], [], runtimeState, 'local-user', notificationApi('denied'), nowMs);
    runtimeState = first.state;
    if (first.shouldPersist) persistedWrites += 1;

    const replay = evaluateAndDeliverTaskNotifications([taskWithReminder(nowMs)], [], runtimeState, 'local-user', notificationApi('denied'), nowMs + 1);
    runtimeState = replay.state;
    if (replay.shouldPersist) persistedWrites += 1;

    expect(first.shouldPersist).toBe(true);
    expect(replay.shouldPersist).toBe(false);
    expect(persistedWrites).toBe(1);
    expect(runtimeState.items).toHaveLength(1);
    expect(runtimeState.items[0]?.id).toBe('task-notify:reminder:task-reminder:release-reminder');
    expect(runtimeState.items[0]?.createdAt).toBe(nowMs - 500);
  });

  it('persists read-state changes while ignoring evaluation-time-only changes', () => {
    const initial = normalizeTaskNotificationState({
      ...DEFAULT_TASK_NOTIFICATION_STATE,
      items: [existingNotification()],
      lastEvaluatedAt: 50_000,
    });
    const read = markTaskNotificationRead(initial, existingNotification().id);
    const timeOnly = { ...initial, lastEvaluatedAt: 60_000 };

    expect(hasTaskNotificationPersistenceChanges(initial, read)).toBe(true);
    expect(hasTaskNotificationPersistenceChanges(initial, timeOnly)).toBe(false);
    expect(read.items[0]?.read).toBe(true);
  });

  it('marks desktop delivery once and persists the delivery receipt', () => {
    const initial = normalizeTaskNotificationState({ ...DEFAULT_TASK_NOTIFICATION_STATE, items: [existingNotification()] });
    let showCount = 0;
    const api = notificationApi('granted', () => { showCount += 1; });
    const first = evaluateAndDeliverTaskNotifications([], [], initial, 'local-user', api, 70_000);
    const replay = evaluateAndDeliverTaskNotifications([], [], first.state, 'local-user', api, 70_001);

    expect(first.shouldPersist).toBe(true);
    expect(replay.shouldPersist).toBe(false);
    expect(showCount).toBe(1);
    expect(first.state.items[0]?.desktopDeliveredAt).toBe(70_000);
    expect(replay.state.items[0]?.desktopDeliveredAt).toBe(70_000);
  });
});
