// STATUS: GOLD — checks complete Tasks core-field locale parity and rendered labels.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { TASK_CORE_COPY } from '../../taskCoreLocale';
import { TaskCoreFields } from '../../editor/TaskCoreFields';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const props = {
  task: { id: 'task-locale', title: 'Example task', completed: false, priority: 'medium' },
  statusDefinitions: [{ id: 'not_started', label: 'Not started', mapsTo: 'not_started', order: 0 }],
  organization: DEFAULT_TASK_ORGANIZATION,
  onUpdate: noop,
} satisfies ComponentProps<typeof TaskCoreFields>;

describe('Tasks core-field locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(TASK_CORE_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = TASK_CORE_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized task labels, choices, placeholders, and audit metadata', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = TASK_CORE_COPY[locale];
      const markup = renderToStaticMarkup(<TaskCoreFields {...props} />);
      for (const key of ['title', 'description', 'status', 'priority', 'low', 'important', 'myDay', 'assignees', 'dueDate', 'auditMetadata', 'createdBy', 'source'] as const) {
        expect(markup).toContain(copy[key]);
      }
      expect(markup).toContain(`placeholder="${copy.statusReasonPlaceholder}"`);
      expect(markup).toContain(`placeholder="${copy.assigneesPlaceholder}"`);
    }
  });
});
