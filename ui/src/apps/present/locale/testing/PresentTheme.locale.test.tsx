// STATUS: PLATIN — rendered seven-locale coverage for theme and slide-master dialogs.
import type { ComponentProps } from 'react';
import type { PresentDocumentModel } from '../../../../shared/contracts/workspace';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresentMasterThemeModal } from '../../design/PresentMasterThemeModal';
import { PRESENT_THEME_COPY } from '../presentThemeLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const props = {
  presentData: {} as PresentDocumentModel, onUpdatePresentData: noop, onClose: noop,
} satisfies ComponentProps<typeof PresentMasterThemeModal>;

describe('Present theme localization', () => {
  it('keeps seven theme and master catalogs structurally aligned', () => {
    const expected = Object.keys(PRESENT_THEME_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(PRESENT_THEME_COPY[locale]).sort(), locale).toEqual(expected);
    }
  });

  it('renders localized dialog chrome and theme controls in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_THEME_COPY[locale];
      const markup = renderToStaticMarkup(<PresentMasterThemeModal {...props} />);
      for (const label of [copy.title, copy.close, copy.themesTab, copy.mastersTab, copy.paletteTitle, copy.namePlaceholder, copy.accent, copy.background, copy.fontPlaceholder, copy.create, copy.done]) {
        expect(markup, `${locale}: ${label}`).toContain(label);
      }
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('max-h-[calc(100vh-2rem)]');
      expect(markup).toContain('grid-cols-1 sm:grid-cols-4');
      expect(markup).toContain('Midnight Sovereign');
    }
  });
});
