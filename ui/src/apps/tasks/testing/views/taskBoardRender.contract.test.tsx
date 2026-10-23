// STATUS: PLATIN — Kanban board wiring contract (AST-0951 / AST-0954).
//
// `renderToStaticMarkup` proves the wiring that a headless Node run can actually observe: drag
// sources, drop targets for every reachable column (including empty ones), the keyboard/picker
// equivalent of a drop, and a live region for the move result. Driving a real drag event needs a
// browser and is explicitly NOT covered here.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { TaskViewsPanel } from '../../views/TaskViewsPanel';
import { DEFAULT_TASK_VIEW_PREFERENCES } from '../../views/taskViews';

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

const tasks: TaskItem[] = [
  task({ id: 't-open', title: 'Open item', status: 'not_started' }),
  task({ id: 't-active', title: 'Active item', status: 'active' }),
];

const baseProps = {
  tasks,
  preferences: { ...DEFAULT_TASK_VIEW_PREFERENCES, mode: 'board', boardBy: 'status' },
  statusDefinitions: TASK_SYSTEM_STATUS_DEFINITIONS,
  externalFilter: {},
  onChangePreferences: () => undefined,
  onToggleTask: () => undefined,
  onOpenTask: () => undefined,
  onBulkEdit: () => undefined,
} satisfies ComponentProps<typeof TaskViewsPanel>;

const boardProps = {
  ...baseProps,
  onMoveTaskToColumn: () => undefined,
  onToggleBoardTask: () => undefined,
} satisfies ComponentProps<typeof TaskViewsPanel>;

const render = (props: ComponentProps<typeof TaskViewsPanel>) => renderToStaticMarkup(<TaskViewsPanel {...props} />);

describe('Kanban board wiring', () => {
  it('renders a drop target for every reachable status column, including empty ones', () => {
    const markup = render(boardProps);
    for (const definition of TASK_SYSTEM_STATUS_DEFINITIONS) {
      expect(markup, definition.id).toContain(`data-task-board-column-target="status:${definition.id}"`);
    }
    // The board is empty of "cancelled" cards, yet the column must still accept a drop.
    expect(tasks.some((entry) => entry.status === 'cancelled')).toBe(false);
  });

  it('makes every visible card a drag source bound to its current column', () => {
    const markup = render(boardProps);
    expect(markup).toContain('data-task-board-card="t-open"');
    expect(markup).toContain('data-task-board-column="status:not_started"');
    expect(markup).toContain('data-task-board-card="t-active"');
    expect(markup).toContain('data-task-board-column="status:active"');
    // draggable is a real HTML attribute on the card, not only a handler.
    expect(markup).toMatch(/draggable="true"/);
  });

  it('offers a keyboard/picker equivalent for every card', () => {
    const markup = render(boardProps);
    expect(markup).toContain('aria-label="Move Open item to another column"');
    expect(markup).toContain('aria-label="Move Active item to another column"');
    // Inspect only the move pickers, not the filter bar's own axis <select>.
    const pickers = markup.match(/<select aria-label="Move [^"]*"[^>]*>.*?<\/select>/g) ?? [];
    expect(pickers).toHaveLength(2);
    const [openPicker, activePicker] = pickers;
    // A card's alternative targets are the columns it is not already in, labelled in words.
    expect(openPicker).toContain('>Done<');
    expect(openPicker).not.toContain('value="status:not_started"');
    expect(activePicker).toContain('>Not started<');
    expect(activePicker).not.toContain('value="status:active"');
  });

  it('exposes a live region for the move result that is not colour-only', () => {
    const markup = render(boardProps);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-task-board-status');
  });

  it('is inspectable even when no move handler is wired', () => {
    // Without the handler the board still renders every column as a target, but no card may
    // advertise a drag it cannot perform. The handler is what makes a card draggable.
    const markup = render(baseProps);
    expect(markup).toContain('data-task-board-column-target="status:done"');
    expect(markup).not.toContain('aria-label="Move Open item to another column"');
  });

  it('keeps the non-board views free of board drop targets', () => {
    const markup = render({ ...boardProps, preferences: { ...DEFAULT_TASK_VIEW_PREFERENCES, mode: 'list' } });
    expect(markup).not.toContain('data-task-board-column-target');
    expect(markup).not.toContain('draggable="true"');
  });
});
