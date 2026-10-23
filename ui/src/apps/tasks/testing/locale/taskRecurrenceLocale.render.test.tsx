// STATUS: GOLD — checks Tasks recurrence/reminder catalog parity and all-locale rendering.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { TASK_RECURRENCE_COPY, taskWeekdayText } from '../../taskRecurrenceLocale';
import { TaskRecurrencePanel } from '../../recurrence/TaskRecurrencePanel';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;');
const task = {
  id: 'task-locale', title: 'Localized recurrence', completed: false, priority: 'medium', recurrence: 'weekly',
  recurrenceSpec: { frequency: 'weekly', interval: 1, weekdays: [1, 3], timezone: 'UTC' },
  reminders: [{ id: 'reminder-locale', offsetMinutes: 30, enabled: true }],
} satisfies ComponentProps<typeof TaskRecurrencePanel>['task'];
const props = { task, onUpdateOccurrence: noop, onModifySeries: noop, onOperation: noop } satisfies ComponentProps<typeof TaskRecurrencePanel>;

describe('Tasks recurrence locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const keys = Object.keys(TASK_RECURRENCE_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(TASK_RECURRENCE_COPY[locale]).sort(), locale).toEqual(keys);
      for (const key of keys as (keyof typeof TASK_RECURRENCE_COPY['en-US'])[]) expect(TASK_RECURRENCE_COPY[locale][key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized recurrence, reminder, and series controls', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = TASK_RECURRENCE_COPY[locale];
      const markup = renderToStaticMarkup(<TaskRecurrencePanel {...props} />);
      for (const key of ['heading', 'scopeHint', 'preset', 'weekly', 'selectedWeekdays', 'reminders', 'skipOccurrence', 'completeSeries'] as const) expect(markup).toContain(htmlText(copy[key]));
      expect(markup).toContain(taskWeekdayText(1, locale));
      expect(markup).toContain(`aria-label="${copy.enableReminder}"`);
      expect(markup).toContain(`aria-label="${copy.removeReminder}"`);
      expect(markup).toContain(copy.dueInMinutes.replace('{minutes}', '30'));
    }
  });
});
