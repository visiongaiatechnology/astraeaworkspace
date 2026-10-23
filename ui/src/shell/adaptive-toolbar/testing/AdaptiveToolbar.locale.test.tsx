// STATUS: PLATIN — verifies seven-locale parity and visible toolbar wiring.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocaleTypes';
import { ADAPTIVE_TOOLBAR_COPY, type AdaptiveToolbarCopy } from '../adaptiveToolbarLocale';

vi.mock('../../localization/workspaceLocale', () => ({
  useWorkspaceLocale: vi.fn(),
}));

import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { AdaptiveToolbar } from '../AdaptiveToolbar';

const toolbarProps = {
  documentKind: 'Writer' as const,
  activeSelectionType: 'text' as const,
  isClassicRibbon: false,
  onToggleRibbonMode: () => undefined,
  onFormatText: () => undefined,
  onFormatCell: () => undefined,
  onInsertChart: () => undefined,
  onInsertShape: () => undefined,
};

function assertNonEmptyCopy(value: string | Readonly<Record<string, string>>, key: string): void {
  if (typeof value === 'string') {
    expect(value.trim(), key).not.toBe('');
    return;
  }
  for (const [nestedKey, label] of Object.entries(value)) expect(label.trim(), `${key}.${nestedKey}`).not.toBe('');
}

describe('adaptive toolbar locale coverage', () => {
  it('keeps every locale structurally complete with non-empty labels', () => {
    const keys = Object.keys(ADAPTIVE_TOOLBAR_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = ADAPTIVE_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(keys);
      expect(Object.keys(copy.selectionTools).sort(), `${locale}.selectionTools`).toEqual(['cell', 'chart', 'shape', 'text']);
      for (const [key, value] of Object.entries(copy) as [keyof AdaptiveToolbarCopy, AdaptiveToolbarCopy[keyof AdaptiveToolbarCopy]][]) {
        assertNonEmptyCopy(value as string | Readonly<Record<string, string>>, `${locale}.${key}`);
      }
    }
  });

  it('renders localized labels, menu names, and accessibility text in every supported locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({
        preference: locale,
        locale,
        setPreference: () => undefined,
      });
      const copy = ADAPTIVE_TOOLBAR_COPY[locale];
      const markup = renderToStaticMarkup(<AdaptiveToolbar {...toolbarProps} />);

      expect(markup).toContain(`aria-label="${copy.bold}"`);
      expect(markup).toContain(`aria-label="${copy.moreActions}"`);
      expect(markup).toContain(`title="${copy.switchRibbonTitle}"`);
      expect(markup).toContain(copy.selectionTools.text);
      expect(markup).toContain(copy.moreActionsTitle);
      expect(markup).toContain(copy.insertChart);
      expect(markup).toContain(copy.addRectangle);
      expect(markup).toContain(copy.addCircle);
      if (locale !== 'de-DE') expect(markup).not.toContain('Weitere Aktionen');
    }
  });
});
