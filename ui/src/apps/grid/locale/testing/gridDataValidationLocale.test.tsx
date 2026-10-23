// STATUS: PLATIN — rendered seven-locale coverage for Grid data validation controls.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { GridDataValidationModal } from '../../validation/GridDataValidationModal';
import { GRID_DATA_VALIDATION_COPY, resolveGridDataValidationListOptions } from '../gridDataValidationLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const props = {
  isOpen: true,
  onClose: noop,
  selectedRange: 'A1:A10',
  rules: [],
  onUpdateRules: noop,
  onToggleCircleInvalid: noop,
  isCirclingInvalid: false,
} satisfies ComponentProps<typeof GridDataValidationModal>;

describe('Grid data validation localization', () => {
  it('keeps all seven catalogs complete and interpolates counts and ranges', () => {
    const expectedKeys = Object.keys(GRID_DATA_VALIDATION_COPY['en-US']).sort();
    const expectedKinds = Object.keys(GRID_DATA_VALIDATION_COPY['en-US'].kinds).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = GRID_DATA_VALIDATION_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      expect(Object.keys(copy.kinds).sort(), `${locale}.kinds`).toEqual(expectedKinds);
      expect(copy.activeRules(3), `${locale}.activeRules`).toContain('3');
      expect(copy.deleteRule('A1:A10'), `${locale}.deleteRule`).toContain('A1:A10');
    }
  });

  it('follows locale defaults until the user edits the list options, including an intentional empty value', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = GRID_DATA_VALIDATION_COPY[locale];
      expect(resolveGridDataValidationListOptions(copy.listOptionsInitial, null), locale).toBe(copy.listOptionsInitial);
      expect(resolveGridDataValidationListOptions(copy.listOptionsInitial, 'Custom option'), locale).toBe('Custom option');
      expect(resolveGridDataValidationListOptions(copy.listOptionsInitial, ''), locale).toBe('');
    }
  });

  it('renders translated dialog labels, placeholders, and accessible names for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = GRID_DATA_VALIDATION_COPY[locale];
      const markup = renderToStaticMarkup(<GridDataValidationModal {...props} />);

      expect(markup).toContain(`<h3 class="text-sm font-semibold text-white tracking-wide">${copy.title}</h3>`);
      expect(markup).toContain(`aria-label="${copy.closeDialog}"`);
      expect(markup).toContain(copy.tabs.settings);
      expect(markup).toContain(copy.range);
      expect(markup).toContain(`placeholder="${copy.rangePlaceholder}"`);
      expect(markup).toContain(copy.kinds.list);
      expect(markup).toContain(copy.listOptions);
      expect(markup).toContain(copy.listOptionsInitial);
      expect(markup).toContain(copy.dynamicSourceHelp);
      if (locale === 'de-DE' || locale === 'ru-RU') {
        expect(markup).toContain('w-full max-w-lg overflow-hidden');
        expect(markup).toContain('fixed inset-0');
      }

      for (const labelText of [copy.range, copy.allowKind, copy.listOptions, copy.dynamicSource]) {
        const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(markup, `${locale} label ${labelText}`).toMatch(new RegExp(`<label[^>]*>${escaped}`));
      }
    }
  });

  it('renders the inverse invalid-data action when invalid values are already circled', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'de-DE', locale: 'de-DE', setPreference: noop });
    const markup = renderToStaticMarkup(<GridDataValidationModal {...props} isCirclingInvalid />);
    expect(markup).toContain(GRID_DATA_VALIDATION_COPY['de-DE'].hideInvalidCircles);
  });
});
