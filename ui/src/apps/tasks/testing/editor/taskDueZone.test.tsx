// AST-0921 — a timed due value must name the zone it is expressed in.
//
// A `dueAt` of "2026-10-31T17:45" is a LOCAL wall clock: the same instant reads differently in
// another zone. The editor rendered the bare wall clock with no zone, so the value was ambiguous
// whenever a task carried an explicit recurrence zone (which `TaskRecurrencePanel` does store).
// These tests pin the single resolution used for both the start and the due hint.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { localTaskTimeZone } from '../../recurrence/taskRecurrence';
import { TaskCoreFields, taskDueZoneLabel } from '../../editor/TaskCoreFields';

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return { id: 'zone-task', title: 'Zoned', completed: false, priority: 'medium', ...overrides };
}

const props = (subject: TaskItem) => ({
  task: subject,
  statusDefinitions: TASK_SYSTEM_STATUS_DEFINITIONS,
  organization: DEFAULT_TASK_ORGANIZATION,
  onUpdate: () => undefined,
}) satisfies ComponentProps<typeof TaskCoreFields>;

const render = (subject: TaskItem) => renderToStaticMarkup(<TaskCoreFields {...props(subject)} />);

describe('task due zone label', () => {
  it('prefers the explicit recurrence zone when the user set one', () => {
    const subject = task({
      dueAt: '2026-10-31T17:45',
      recurrenceSpec: { frequency: 'weekly', interval: 1, end: { mode: 'never' }, timezone: 'Pacific/Auckland' },
    });
    expect(taskDueZoneLabel(subject)).toBe('Pacific/Auckland');
  });

  it('falls back to the host zone when no zone was set', () => {
    expect(taskDueZoneLabel(task({ dueAt: '2026-10-31T17:45' }))).toBe(localTaskTimeZone());
    expect(localTaskTimeZone()).toMatch(/^[A-Za-z]+\/[A-Za-z_+-]+$|^UTC$/);
  });
});

describe('task core fields zone hint', () => {
  it('names the zone next to a timed due value', () => {
    const markup = render(task({
      dueAt: '2026-10-31T17:45',
      recurrenceSpec: { frequency: 'weekly', interval: 1, end: { mode: 'never' }, timezone: 'Europe/Berlin' },
    }));
    expect(markup).toContain('data-task-zone-hint="Europe/Berlin"');
    expect(markup).toContain('Europe/Berlin');
  });

  it('does not claim a zone for a date-only task', () => {
    // An all-day value has no time and therefore no zone to name.
    const markup = render(task({ dueDate: '2026-10-31' }));
    expect(markup).not.toContain('data-task-zone-hint');
  });

  it('labels the start zone with the same resolution', () => {
    const markup = render(task({
      startAt: '2026-10-01T09:30',
      recurrenceSpec: { frequency: 'weekly', interval: 1, end: { mode: 'never' }, timezone: 'America/New_York' },
    }));
    const hints = markup.match(/data-task-zone-hint="([^"]+)"/g) ?? [];
    expect(hints).toEqual(['data-task-zone-hint="America/New_York"']);
  });

  it('shows both hints when start and due are timed', () => {
    const markup = render(task({
      startAt: '2026-10-01T09:30',
      dueAt: '2026-10-31T17:45',
      recurrenceSpec: { frequency: 'weekly', interval: 1, end: { mode: 'never' }, timezone: 'Europe/Berlin' },
    }));
    const hints = markup.match(/data-task-zone-hint="([^"]+)"/g) ?? [];
    expect(hints).toHaveLength(2);
    expect(new Set(hints)).toEqual(new Set(['data-task-zone-hint="Europe/Berlin"']));
  });
});
