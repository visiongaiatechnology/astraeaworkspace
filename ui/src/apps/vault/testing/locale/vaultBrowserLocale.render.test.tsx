// STATUS: GOLD — checks complete Vault browser locale parity and rendered controls.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { VAULT_BROWSER_COPY } from '../../vaultBrowserLocale';
import { VaultBrowserSidebar } from '../../browser/VaultBrowserSidebar';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const props = {
  folders: [], files: [], activeFolderId: null, onSelectFolder: noop, onCreateFolder: noop, onMoveFileDrop: noop,
  specialFilter: 'none', onSpecialFilter: noop,
} satisfies ComponentProps<typeof VaultBrowserSidebar>;

describe('Vault browser locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(VAULT_BROWSER_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = VAULT_BROWSER_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized filters, folder empty state, and accessible creation controls', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = VAULT_BROWSER_COPY[locale];
      const markup = renderToStaticMarkup(<VaultBrowserSidebar {...props} />);
      for (const key of ['root', 'favorites', 'pinned', 'recent', 'folders', 'emptyFolders'] as const) expect(markup).toContain(copy[key]);
      expect(markup).toContain(`placeholder="${copy.newFolder}"`);
      expect(markup).toContain(`aria-label="${copy.newFolderName}"`);
      expect(markup).toContain(`aria-label="${copy.createFolder}"`);
    }
  });
});
